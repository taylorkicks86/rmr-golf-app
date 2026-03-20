/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const TARGET_SEASON_NAME = "2025 Test Season";
const TARGET_SEASON_YEAR = 2025;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    apply: args.has("--apply"),
    dryRun: args.has("--dry-run") || !args.has("--apply"),
  };
}

function loadEnvFromDotLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function resolveImportDirectory() {
  const candidates = [
    path.join(process.cwd(), "data", "testing", "2025-season-import"),
    path.join(process.cwd(), "Data", "testing", "2025-season-import"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  fail("Could not find data/testing/2025-season-import.");
}

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map((h) => normalizeHeader(h));
  const records = rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim() !== ""))
    .map((values) => {
      const record = {};
      headers.forEach((header, idx) => {
        record[header] = String(values[idx] || "").trim();
      });
      return record;
    });
  return { headers, records };
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseInteger(value) {
  const numeric = Number.parseInt(String(value), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function main() {
  loadEnvFromDotLocal();
  const { dryRun } = parseArgs(process.argv);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) fail("NEXT_PUBLIC_SUPABASE_URL is required.");
  if (!serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY is required.");
  if (!dryRun && process.env.DEV_SEED_CONFIRM !== "YES") {
    fail('Set DEV_SEED_CONFIRM=YES when running with --apply.');
  }

  const importDir = resolveImportDirectory();
  const scoresPath = path.join(importDir, "scores.csv");
  if (!fs.existsSync(scoresPath)) {
    fail(`scores.csv not found at ${scoresPath}`);
  }

  const { headers, records: scoresRows } = parseCsv(fs.readFileSync(scoresPath, "utf8"));
  if (!headers.includes("player_name")) {
    fail("scores.csv must contain a player_name column.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const seasonRes = await supabase
    .from("seasons")
    .select("id, name, year")
    .eq("year", TARGET_SEASON_YEAR)
    .ilike("name", TARGET_SEASON_NAME)
    .limit(1)
    .maybeSingle();
  if (seasonRes.error) fail(seasonRes.error.message);
  if (!seasonRes.data?.id) fail(`Season ${TARGET_SEASON_YEAR} "${TARGET_SEASON_NAME}" not found.`);
  const season = seasonRes.data;

  const weeksRes = await supabase
    .from("league_weeks")
    .select("id, week_number")
    .eq("season_id", season.id);
  if (weeksRes.error) fail(weeksRes.error.message);
  const seasonWeeks = weeksRes.data ?? [];
  if (seasonWeeks.length === 0) fail("No league weeks found for 2025 Test Season.");
  const weekIdByNumber = new Map(seasonWeeks.map((week) => [Number(week.week_number), week.id]));
  const seasonWeekIds = seasonWeeks.map((week) => week.id);

  const playersRes = await supabase.from("players").select("id, full_name");
  if (playersRes.error) fail(playersRes.error.message);
  const players = playersRes.data ?? [];
  const playersByNormalizedName = new Map();
  for (const player of players) {
    const key = normalizeName(player.full_name);
    const existing = playersByNormalizedName.get(key) ?? [];
    existing.push(player);
    playersByNormalizedName.set(key, existing);
  }

  const playedRows = scoresRows.filter((row) => String(row.status || "").trim().toLowerCase() === "played");
  const csvPlayedNames = Array.from(new Set(playedRows.map((row) => normalizeName(row.player_name)).filter(Boolean)));

  const unmatchedPlayerNames = [];
  const ambiguousPlayerNames = [];
  const playerIdByCsvName = new Map();

  for (const csvName of csvPlayedNames) {
    const matches = playersByNormalizedName.get(csvName) ?? [];
    if (matches.length === 0) {
      unmatchedPlayerNames.push(csvName);
      continue;
    }
    if (matches.length > 1) {
      ambiguousPlayerNames.push({
        player_name: csvName,
        player_ids: matches.map((entry) => entry.id),
      });
      continue;
    }
    playerIdByCsvName.set(csvName, matches[0].id);
  }

  const reverseMapping = new Map();
  for (const [csvName, playerId] of playerIdByCsvName.entries()) {
    const existing = reverseMapping.get(playerId) ?? [];
    existing.push(csvName);
    reverseMapping.set(playerId, existing);
  }
  const duplicateMappingWarnings = Array.from(reverseMapping.entries())
    .filter(([, csvNames]) => csvNames.length > 1)
    .map(([playerId, csvNames]) => ({ player_id: playerId, csv_player_names: csvNames }));

  if (unmatchedPlayerNames.length > 0) {
    fail(`Unmatched CSV player_name values: ${JSON.stringify(unmatchedPlayerNames)}`);
  }
  if (ambiguousPlayerNames.length > 0) {
    fail(`Ambiguous player_name matches in players table: ${JSON.stringify(ambiguousPlayerNames)}`);
  }
  if (duplicateMappingWarnings.length > 0) {
    fail(`Unexpected duplicate CSV name -> player_id mapping: ${JSON.stringify(duplicateMappingWarnings)}`);
  }

  const insertWeeklyRows = [];
  const insertHoleRows = [];
  const insertHandicapRows = [];
  const rowFailures = [];
  const netMismatchWarnings = [];
  const seenWeekPlayer = new Set();

  for (const row of playedRows) {
    const csvNameNormalized = normalizeName(row.player_name);
    const playerId = playerIdByCsvName.get(csvNameNormalized);
    const weekNumber = parseInteger(row.week_number || row.score_week_number);
    const weekId = weekIdByNumber.get(weekNumber);
    const grossScore = parseInteger(row.gross_score);
    const handicap = parseNumber(row.handicap);
    const netScore = parseNumber(row.net_score);

    if (!playerId || !weekId || weekNumber == null || grossScore == null) {
      rowFailures.push({
        week_number: weekNumber,
        player_name: row.player_name,
        reason: "missing_player_or_week_or_gross",
      });
      continue;
    }

    const holeScores = [];
    for (let hole = 1; hole <= 9; hole += 1) {
      const strokes = parseInteger(row[`hole_${hole}`]);
      holeScores.push(strokes);
    }
    if (holeScores.some((strokes) => strokes == null)) {
      rowFailures.push({ week_number: weekNumber, player_name: row.player_name, reason: "missing_hole_scores" });
      continue;
    }

    const holeTotal = holeScores.reduce((sum, value) => sum + value, 0);
    if (holeTotal !== grossScore) {
      rowFailures.push({
        week_number: weekNumber,
        player_name: row.player_name,
        reason: `gross_mismatch:holes=${holeTotal},gross=${grossScore}`,
      });
      continue;
    }

    if (netScore != null && handicap != null) {
      const recomputedNet = Number((grossScore - handicap).toFixed(2));
      if (Math.abs(recomputedNet - netScore) > 0.11) {
        netMismatchWarnings.push({
          week_number: weekNumber,
          player_name: row.player_name,
          csv_net_score: netScore,
          computed_net_score: recomputedNet,
        });
      }
    }

    const weekPlayerKey = `${weekId}:${playerId}`;
    if (seenWeekPlayer.has(weekPlayerKey)) {
      rowFailures.push({
        week_number: weekNumber,
        player_name: row.player_name,
        reason: "duplicate_played_row_for_week_player",
      });
      continue;
    }
    seenWeekPlayer.add(weekPlayerKey);

    insertWeeklyRows.push({
      league_week_id: weekId,
      player_id: playerId,
      gross_score: grossScore,
    });

    holeScores.forEach((strokes, idx) => {
      insertHoleRows.push({
        league_week_id: weekId,
        player_id: playerId,
        hole_number: idx + 1,
        strokes,
      });
    });

    if (handicap != null && handicap >= 0 && handicap <= 54) {
      insertHandicapRows.push({
        league_week_id: weekId,
        player_id: playerId,
        handicap_index: handicap,
        course_handicap: handicap,
        final_computed_handicap: Math.round(handicap),
      });
    }
  }

  if (rowFailures.length > 0) {
    fail(`Score row validation failures: ${JSON.stringify(rowFailures.slice(0, 25))}`);
  }

  if (!dryRun) {
    const existingScoresRes = await supabase
      .from("weekly_scores")
      .select("league_week_id, player_id")
      .in("league_week_id", seasonWeekIds);
    if (existingScoresRes.error) fail(existingScoresRes.error.message);

    const existingScorePairs = existingScoresRes.data ?? [];
    for (const pair of existingScorePairs) {
      const deleteHoleRes = await supabase
        .from("hole_scores")
        .delete()
        .eq("league_week_id", pair.league_week_id)
        .eq("player_id", pair.player_id);
      if (deleteHoleRes.error) fail(deleteHoleRes.error.message);
    }

    const deleteWeeklyScoresRes = await supabase
      .from("weekly_scores")
      .delete()
      .in("league_week_id", seasonWeekIds);
    if (deleteWeeklyScoresRes.error) fail(deleteWeeklyScoresRes.error.message);

    if (insertWeeklyRows.length > 0) {
      const insertWeeklyRes = await supabase.from("weekly_scores").insert(insertWeeklyRows);
      if (insertWeeklyRes.error) fail(insertWeeklyRes.error.message);
    }

    if (insertHoleRows.length > 0) {
      const insertHoleRes = await supabase.from("hole_scores").insert(insertHoleRows);
      if (insertHoleRes.error) fail(insertHoleRes.error.message);
    }

    if (insertHandicapRows.length > 0) {
      const handicapUpsertRes = await supabase
        .from("weekly_handicaps")
        .upsert(insertHandicapRows, { onConflict: "league_week_id,player_id" });
      if (handicapUpsertRes.error) {
        console.warn(`weekly_handicaps upsert skipped: ${handicapUpsertRes.error.message}`);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "apply",
        season: { id: season.id, name: season.name, year: season.year },
        weekly_scores_to_insert: insertWeeklyRows.length,
        hole_scores_to_insert: insertHoleRows.length,
        unmatched_player_names: unmatchedPlayerNames,
        duplicate_mapping_warnings: duplicateMappingWarnings,
        net_mismatch_warnings: netMismatchWarnings,
        row_failures: rowFailures,
      },
      null,
      2
    )
  );
}

main().catch((error) => fail(error.message));
