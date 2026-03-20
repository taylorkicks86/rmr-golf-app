/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const TARGET_SEASON_NAME = "2025 Test Season";

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
  fail("Could not find 2025 season import directory.");
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
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => normalizeHeader(h));
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim() !== ""))
    .map((values) => {
      const record = {};
      headers.forEach((header, idx) => {
        record[header] = String(values[idx] || "").trim();
      });
      return record;
    });
}

function readCsvFile(filePath) {
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

function pick(row, aliases) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
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
  const importDir = resolveImportDirectory();
  const scoresPath = path.join(importDir, "scores.csv");
  if (!fs.existsSync(scoresPath)) {
    fail(`Missing scores.csv at ${scoresPath}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) fail("NEXT_PUBLIC_SUPABASE_URL is required.");
  if (!serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY is required.");
  if (!dryRun && process.env.DEV_SEED_CONFIRM !== "YES") {
    fail('Set DEV_SEED_CONFIRM=YES when running with --apply.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const scoresRows = readCsvFile(scoresPath);
  const seasonRes = await supabase
    .from("seasons")
    .select("id, name, year")
    .ilike("name", TARGET_SEASON_NAME)
    .limit(1)
    .maybeSingle();
  if (seasonRes.error) fail(seasonRes.error.message);
  if (!seasonRes.data?.id) fail(`Season "${TARGET_SEASON_NAME}" not found.`);
  const season = seasonRes.data;

  const weeksRes = await supabase
    .from("league_weeks")
    .select("id, week_number")
    .eq("season_id", season.id);
  if (weeksRes.error) fail(weeksRes.error.message);
  const weeks = weeksRes.data ?? [];
  const weekIdByNumber = new Map(weeks.map((row) => [Number(row.week_number), row.id]));
  const seasonWeekIds = weeks.map((row) => row.id);
  if (seasonWeekIds.length === 0) fail(`No league weeks found for ${TARGET_SEASON_NAME}.`);

  const playersRes = await supabase
    .from("players")
    .select("id, full_name, email, created_at");
  if (playersRes.error) fail(playersRes.error.message);
  const players = playersRes.data ?? [];

  const membershipsRes = await supabase
    .from("cup_team_members")
    .select("player_id")
    .eq("season_id", season.id);
  if (membershipsRes.error) fail(membershipsRes.error.message);
  const memberPlayerIds = new Set((membershipsRes.data ?? []).map((row) => row.player_id));

  const playersByName = new Map();
  for (const player of players) {
    const key = normalizeName(player.full_name);
    const list = playersByName.get(key) ?? [];
    list.push(player);
    playersByName.set(key, list);
  }

  function selectPlayerIdForName(name) {
    const candidates = playersByName.get(normalizeName(name)) ?? [];
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].id;

    const memberMatch = candidates.find((candidate) => memberPlayerIds.has(candidate.id));
    if (memberMatch) return memberMatch.id;

    const importEmailMatch = candidates.find((candidate) =>
      String(candidate.email || "").toLowerCase().endsWith("@import-2025.test")
    );
    if (importEmailMatch) return importEmailMatch.id;

    const sorted = [...candidates].sort((a, b) =>
      String(a.created_at || "").localeCompare(String(b.created_at || ""))
    );
    return sorted[0].id;
  }

  const parsedRows = [];
  const skipped = [];

  for (const row of scoresRows) {
    const playerName = pick(row, ["player_name", "player", "full_name", "score_entity"]);
    const weekNumber = parseInteger(pick(row, ["week_number", "week"]));
    const status = String(pick(row, ["status"])).toLowerCase();
    const grossScore = parseInteger(pick(row, ["gross_score", "gross"]));
    const handicapValue = parseNumber(pick(row, ["handicap", "weekly_handicap"]));

    if (!playerName || weekNumber == null) {
      skipped.push({ reason: "missing_player_or_week", playerName, weekNumber });
      continue;
    }
    if (status !== "played") {
      continue;
    }

    const playerId = selectPlayerIdForName(playerName);
    const weekId = weekIdByNumber.get(weekNumber);
    if (!playerId || !weekId) {
      skipped.push({
        reason: !playerId ? "player_not_found_for_name" : "week_not_found",
        playerName,
        weekNumber,
      });
      continue;
    }

    const holes = [];
    for (let hole = 1; hole <= 9; hole += 1) {
      const strokes = parseInteger(pick(row, [`hole_${hole}`, `h${hole}`]));
      holes.push(strokes);
    }
    if (holes.some((strokes) => strokes == null)) {
      skipped.push({ reason: "missing_hole_scores", playerName, weekNumber });
      continue;
    }
    const holeTotal = holes.reduce((sum, strokes) => sum + strokes, 0);
    if (grossScore == null || holeTotal !== grossScore) {
      skipped.push({
        reason: `gross_mismatch:holes=${holeTotal},gross=${grossScore}`,
        playerName,
        weekNumber,
      });
      continue;
    }

    parsedRows.push({
      playerName,
      playerId,
      weekNumber,
      weekId,
      grossScore,
      handicapValue,
      holes,
    });
  }

  const distinctPlayerIds = Array.from(new Set(parsedRows.map((row) => row.playerId)));

    if (!dryRun) {
      const deleteHoleRes = await supabase.from("hole_scores").delete().in("league_week_id", seasonWeekIds);
      if (deleteHoleRes.error) fail(deleteHoleRes.error.message);
      const deleteWeeklyRes = await supabase.from("weekly_scores").delete().in("league_week_id", seasonWeekIds);
      if (deleteWeeklyRes.error) fail(deleteWeeklyRes.error.message);

    for (const row of parsedRows) {
      const weeklyRes = await supabase.from("weekly_scores").upsert(
        {
          league_week_id: row.weekId,
          player_id: row.playerId,
          gross_score: row.grossScore,
        },
        { onConflict: "league_week_id,player_id" }
      );
      if (weeklyRes.error) fail(weeklyRes.error.message);

      const holeRows = row.holes.map((strokes, index) => ({
        league_week_id: row.weekId,
        player_id: row.playerId,
        hole_number: index + 1,
        strokes,
      }));
      const holeRes = await supabase
        .from("hole_scores")
        .upsert(holeRows, { onConflict: "player_id,league_week_id,hole_number" });
      if (holeRes.error) fail(holeRes.error.message);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "apply",
        season,
        parsed_played_rows: parsedRows.length,
        distinct_player_ids_after_mapping: distinctPlayerIds.length,
        skipped,
      },
      null,
      2
    )
  );
}

main().catch((error) => fail(error.message));
