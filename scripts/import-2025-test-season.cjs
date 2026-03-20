/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_SEASON_NAME = "2025 Test Season";
const DEFAULT_SEASON_YEAR = 2025;
const REQUIRED_FILES = [
  "players.csv",
  "weeks.csv",
  "attendance.csv",
  "scores.csv",
  "score_entities_not_in_schedule.csv",
];

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
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
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

  fail("Could not find data/testing/2025-season-import directory.");
}

function assertRequiredCsvFiles(importDir) {
  const missing = REQUIRED_FILES.filter((fileName) => !fs.existsSync(path.join(importDir, fileName)));
  if (missing.length === 0) return;

  fail(
    `Missing required CSV files: ${missing.join(", ")}. ` +
      `Current folder (${importDir}) only has: ${fs.readdirSync(importDir).join(", ")}`
  );
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

  const headers = rows[0].map((value) => normalizeHeader(value));
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim() !== ""))
    .map((values) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = String(values[index] || "").trim();
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
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function parseNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseInteger(value) {
  const numeric = Number.parseInt(String(value), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseBool(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "yes", "y", "1", "finalized", "done"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  return null;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function mapCupFromRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("full") || normalized.includes("split")) return true;
  if (normalized.includes("alternate")) return false;
  return false;
}

function mapWeekType(rawWeekType, rawLabel) {
  const value = `${rawWeekType || ""} ${rawLabel || ""}`.toLowerCase();
  if (value.includes("playoff")) return "playoff";
  return "regular";
}

function mapWeekStatus(rawStatus, rawWeekType, rawLabel) {
  const combined = `${rawStatus || ""} ${rawWeekType || ""} ${rawLabel || ""}`.toLowerCase();
  if (combined.includes("final")) return "finalized";
  if (combined.includes("rain")) return "rained_out";
  if (combined.includes("bye") || combined.includes("holiday") || combined.includes("cancel")) return "cancelled";
  return "open";
}

function mapParticipationStatus(rawStatus) {
  const normalized = String(rawStatus || "").trim().toLowerCase();

  if (!normalized || normalized === "no_response" || normalized === "undecided") {
    return { playingThisWeek: null, attendanceStatus: "no_response", importable: true };
  }

  if (
    ["played", "playing", "yes", "y", "present", "active", "in"].some(
      (token) => normalized === token || normalized.includes(token)
    )
  ) {
    return { playingThisWeek: true, attendanceStatus: "playing", importable: true };
  }

  if (
    ["dnp", "no", "not_playing", "out", "bye", "holiday", "rain_out", "rainout", "absent"].some(
      (token) => normalized === token || normalized.includes(token)
    )
  ) {
    return { playingThisWeek: false, attendanceStatus: "not_playing", importable: true };
  }

  return { playingThisWeek: null, attendanceStatus: "no_response", importable: false };
}

async function findAuthUserByEmail(supabase, email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const users = data?.users ?? [];
    const match = users.find((user) => String(user.email || "").toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (users.length < perPage) return null;

    page += 1;
  }
}

async function ensureAuthUser({ supabase, email, dryRun }) {
  const existing = await findAuthUserByEmail(supabase, email);
  if (existing) {
    return { authUserId: existing.id, action: "matched_existing_auth_user" };
  }

  if (dryRun) {
    return { authUserId: `dryrun-${slugify(email)}`, action: "would_create_auth_user" };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });

  if (error) throw new Error(error.message);
  if (!data.user?.id) throw new Error(`Auth user create returned no user for ${email}`);

  return { authUserId: data.user.id, action: "created_auth_user" };
}

async function findExistingPlayerByEmailOrName(supabase, email, fullName) {
  if (email) {
    const byEmail = await supabase.from("players").select("*").ilike("email", email).limit(1);
    if (byEmail.error) throw new Error(byEmail.error.message);
    if ((byEmail.data ?? []).length > 0) return byEmail.data[0];
  }

  const byName = await supabase.from("players").select("*").ilike("full_name", fullName).limit(1);
  if (byName.error) throw new Error(byName.error.message);
  return (byName.data ?? [])[0] ?? null;
}

async function getExistingGhins(supabase) {
  const { data, error } = await supabase.from("players").select("ghin");
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => String(row.ghin)));
}

function ensureUniqueGhin(candidate, usedGhins, fallbackSeed) {
  let next = String(candidate || "").trim();
  if (!next) next = `TEST-${fallbackSeed.toUpperCase().slice(0, 16) || "PLAYER"}`;
  if (!usedGhins.has(next)) {
    usedGhins.add(next);
    return next;
  }

  let suffix = 2;
  while (usedGhins.has(`${next}-${suffix}`)) suffix += 1;
  const unique = `${next}-${suffix}`;
  usedGhins.add(unique);
  return unique;
}

function buildPlayerImportRows(playersRows, entitiesRows) {
  const rows = [];
  const seen = new Set();

  for (const row of playersRows) {
    const fullName = pick(row, ["full_name", "player_name", "name"]);
    if (!fullName) continue;
    const key = normalizeName(fullName);
    if (seen.has(key)) continue;
    seen.add(key);

    const role = pick(row, ["role", "player_type", "type", "player_role"]);
    rows.push({
      fullName,
      email: pick(row, ["email"]),
      ghin: pick(row, ["ghin"]),
      handicapIndex: parseNumber(pick(row, ["handicap_index", "handicap"])),
      cup: mapCupFromRole(role),
      source: "players.csv",
    });
  }

  for (const row of entitiesRows) {
    const fullName = pick(row, ["player_name", "name", "score_entity"]);
    if (!fullName) continue;
    const key = normalizeName(fullName);
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      fullName,
      email: "",
      ghin: "",
      handicapIndex: null,
      cup: false,
      source: "score_entities_not_in_schedule.csv",
    });
  }

  return rows;
}

function mapAttendanceRows(attendanceRows) {
  const normalized = [];

  for (const row of attendanceRows) {
    const playerName = pick(row, ["player_name", "player", "full_name"]);
    const directWeek = parseInteger(pick(row, ["week_number", "week"]));
    const directStatus = pick(row, ["status", "attendance_status", "playing_this_week"]);

    if (playerName && directWeek != null) {
      normalized.push({ playerName, weekNumber: directWeek, status: directStatus });
      continue;
    }

    if (!playerName) continue;
    Object.entries(row).forEach(([header, value]) => {
      const match = header.match(/^week_?(\d+)$/i);
      if (!match) return;
      const weekNumber = parseInteger(match[1]);
      if (weekNumber == null) return;
      normalized.push({ playerName, weekNumber, status: String(value || "").trim() });
    });
  }

  return normalized;
}

async function main() {
  loadEnvFromDotLocal();
  const args = parseArgs(process.argv);
  const importDir = resolveImportDirectory();
  assertRequiredCsvFiles(importDir);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) fail("NEXT_PUBLIC_SUPABASE_URL is required.");
  if (!serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY is required.");
  if (args.apply && process.env.DEV_SEED_CONFIRM !== "YES") {
    fail('Set DEV_SEED_CONFIRM=YES when running with --apply.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const playersRows = readCsvFile(path.join(importDir, "players.csv"));
  const weeksRows = readCsvFile(path.join(importDir, "weeks.csv"));
  const attendanceRows = readCsvFile(path.join(importDir, "attendance.csv"));
  const scoresRows = readCsvFile(path.join(importDir, "scores.csv"));
  const entityRows = readCsvFile(path.join(importDir, "score_entities_not_in_schedule.csv"));

  let supportsLeagueHandicapPercent = true;
  if (!args.dryRun) {
    const handicapProbe = await supabase
      .from("weekly_handicaps")
      .select("league_handicap_percent")
      .limit(1);
    if (handicapProbe.error?.message?.toLowerCase().includes("league_handicap_percent")) {
      supportsLeagueHandicapPercent = false;
    }
  }

  if (weeksRows.length === 0) fail("weeks.csv is empty.");
  if (playersRows.length === 0) fail("players.csv is empty.");

  const summary = {
    mode: args.dryRun ? "dry-run" : "apply",
    season: { name: DEFAULT_SEASON_NAME, year: DEFAULT_SEASON_YEAR, id: null },
    players: { input: 0, matched: 0, created: 0, updated: 0, createdAuthUsers: 0 },
    weeks: { input: weeksRows.length, upserted: 0 },
    attendance: { input: 0, upserted: 0, skipped: [] },
    scores: { input: scoresRows.length, upsertedWeeklyScores: 0, upsertedHoleScores: 0, upsertedHandicaps: 0, skipped: [] },
  };

  const weekImportRows = weeksRows
    .map((row) => {
      const weekNumber = parseInteger(pick(row, ["week_number", "week", "round"]));
      const weekDate = pick(row, ["week_date", "date", "scheduled_date"]);
      if (weekNumber == null || !weekDate) return null;

      const rawStatus = pick(row, ["status"]);
      const rawWeekType = pick(row, ["week_type", "type"]);
      const label = pick(row, ["label", "week_label", "title"]);
      const weekType = mapWeekType(rawWeekType, label);
      const status = mapWeekStatus(rawStatus, rawWeekType, label);
      const finalizedFlag = parseBool(pick(row, ["is_finalized", "finalized"]));
      const isFinalized = finalizedFlag != null ? finalizedFlag : status === "finalized";
      const sideToPlayRaw = pick(row, ["side_to_play", "side"]);
      const sideToPlay = sideToPlayRaw.toLowerCase() === "back" ? "back" : "front";
      const playDate = pick(row, ["play_date"]) || weekDate;

      return { weekNumber, weekDate, playDate, weekType, status, isFinalized, sideToPlay };
    })
    .filter(Boolean)
    .sort((a, b) => a.weekNumber - b.weekNumber);

  if (weekImportRows.length === 0) fail("No valid week rows found in weeks.csv.");

  const seasonStart = weekImportRows[0].weekDate;
  const seasonEnd = weekImportRows[weekImportRows.length - 1].weekDate;

  const existingSeasonRes = await supabase
    .from("seasons")
    .select("id, name, year")
    .eq("year", DEFAULT_SEASON_YEAR)
    .ilike("name", DEFAULT_SEASON_NAME)
    .limit(1);

  if (existingSeasonRes.error) throw new Error(existingSeasonRes.error.message);

  let seasonId = (existingSeasonRes.data ?? [])[0]?.id ?? null;
  if (!seasonId) {
    if (args.dryRun) {
      seasonId = "dryrun-season-2025";
    } else {
      const insertedSeason = await supabase
        .from("seasons")
        .insert({
          name: DEFAULT_SEASON_NAME,
          year: DEFAULT_SEASON_YEAR,
          start_date: seasonStart,
          end_date: seasonEnd,
          is_active: false,
        })
        .select("id")
        .single();

      if (insertedSeason.error) throw new Error(insertedSeason.error.message);
      seasonId = insertedSeason.data.id;
    }
  }
  summary.season.id = seasonId;

  const weekMapByNumber = new Map();
  for (const week of weekImportRows) {
    if (!args.dryRun) {
      const upsertWeek = await supabase
        .from("league_weeks")
        .upsert(
          {
            season_id: seasonId,
            week_number: week.weekNumber,
            week_date: week.weekDate,
            play_date: week.playDate,
            week_type: week.weekType,
            status: week.status,
            is_finalized: week.isFinalized,
            side_to_play: week.sideToPlay,
          },
          { onConflict: "season_id,week_number" }
        )
        .select("id, week_number")
        .single();

      if (upsertWeek.error) throw new Error(upsertWeek.error.message);
      weekMapByNumber.set(week.weekNumber, upsertWeek.data.id);
    } else {
      weekMapByNumber.set(week.weekNumber, `dryrun-week-${week.weekNumber}`);
    }
    summary.weeks.upserted += 1;
  }

  const existingGhins = await getExistingGhins(supabase);
  const importPlayers = buildPlayerImportRows(playersRows, entityRows);
  summary.players.input = importPlayers.length;
  const playerIdByName = new Map();

  for (const playerRow of importPlayers) {
    const normalizedName = normalizeName(playerRow.fullName);
    const email =
      playerRow.email && playerRow.email.includes("@")
        ? playerRow.email.toLowerCase()
        : `${slugify(playerRow.fullName) || "player"}@import-2025.test`;
    const ghin = ensureUniqueGhin(playerRow.ghin, existingGhins, slugify(playerRow.fullName));
    const handicapIndex = Number.isFinite(playerRow.handicapIndex) ? playerRow.handicapIndex : 0;
    const authResult = await ensureAuthUser({ supabase, email, dryRun: args.dryRun });

    if (authResult.action === "created_auth_user") summary.players.createdAuthUsers += 1;
    if (authResult.action === "matched_existing_auth_user") summary.players.matched += 1;

    const existingPlayer = await findExistingPlayerByEmailOrName(supabase, email, playerRow.fullName);
    if (!args.dryRun) {
      if (existingPlayer) {
        const updateRes = await supabase
          .from("players")
          .update({
            full_name: playerRow.fullName,
            email,
            ghin,
            handicap_index: handicapIndex,
            is_approved: true,
            cup: Boolean(playerRow.cup),
            auth_user_id: existingPlayer.auth_user_id || authResult.authUserId,
          })
          .eq("id", existingPlayer.id)
          .select("id")
          .single();

        if (updateRes.error) throw new Error(updateRes.error.message);
        playerIdByName.set(normalizedName, updateRes.data.id);
        summary.players.updated += 1;
      } else {
        const insertRes = await supabase
          .from("players")
          .insert({
            auth_user_id: authResult.authUserId,
            full_name: playerRow.fullName,
            email,
            ghin,
            handicap_index: handicapIndex,
            is_approved: true,
            cup: Boolean(playerRow.cup),
            is_admin: false,
          })
          .select("id")
          .single();

        if (insertRes.error) throw new Error(insertRes.error.message);
        playerIdByName.set(normalizedName, insertRes.data.id);
        summary.players.created += 1;
      }
    } else {
      const dryId = existingPlayer?.id || `dryrun-player-${slugify(playerRow.fullName)}`;
      playerIdByName.set(normalizedName, dryId);
      if (existingPlayer) summary.players.updated += 1;
      else summary.players.created += 1;
    }
  }

  const normalizedAttendance = mapAttendanceRows(attendanceRows);
  summary.attendance.input = normalizedAttendance.length;
  for (const attendance of normalizedAttendance) {
    const playerId = playerIdByName.get(normalizeName(attendance.playerName));
    const weekId = weekMapByNumber.get(attendance.weekNumber);
    if (!playerId || !weekId) {
      summary.attendance.skipped.push({
        player_name: attendance.playerName,
        week_number: attendance.weekNumber,
        reason: !playerId ? "player_not_found" : "week_not_found",
      });
      continue;
    }

    const mappedStatus = mapParticipationStatus(attendance.status);
    if (!mappedStatus.importable) {
      summary.attendance.skipped.push({
        player_name: attendance.playerName,
        week_number: attendance.weekNumber,
        reason: `unrecognized_status:${attendance.status}`,
      });
      continue;
    }

    const cupForWeek = Boolean(mappedStatus.playingThisWeek === true);

    if (!args.dryRun) {
      const upsertRes = await supabase.from("weekly_participation").upsert(
        {
          league_week_id: weekId,
          player_id: playerId,
          playing_this_week: mappedStatus.playingThisWeek,
          attendance_status: mappedStatus.attendanceStatus,
          cup: cupForWeek,
        },
        { onConflict: "league_week_id,player_id" }
      );
      if (upsertRes.error) throw new Error(upsertRes.error.message);
    }
    summary.attendance.upserted += 1;
  }

  const playedScoreNames = Array.from(
    new Set(
      scoresRows
        .filter((row) => String(pick(row, ["status"])).trim().toLowerCase() === "played")
        .map((row) => normalizeName(pick(row, ["player_name", "player", "full_name", "score_entity"])))
        .filter((name) => name !== "")
    )
  );
  const mappedPlayedScorePlayerIds = new Set(
    playedScoreNames
      .map((name) => playerIdByName.get(name))
      .filter((id) => Boolean(id))
  );
  if (playedScoreNames.length > 1 && mappedPlayedScorePlayerIds.size <= 1) {
    throw new Error(
      `Score mapping looks invalid: ${playedScoreNames.length} distinct played names map to ` +
        `${mappedPlayedScorePlayerIds.size} player IDs. Refusing import to avoid collapsing scores into one player.`
    );
  }

  for (const scoreRow of scoresRows) {
    const playerName = pick(scoreRow, ["player_name", "player", "full_name", "score_entity"]);
    const weekNumber = parseInteger(pick(scoreRow, ["week_number", "week"]));
    const status = pick(scoreRow, ["status"]);
    const grossScore = parseInteger(pick(scoreRow, ["gross_score", "gross"]));
    const handicapValue = parseNumber(pick(scoreRow, ["handicap", "weekly_handicap"]));

    const playerId = playerIdByName.get(normalizeName(playerName));
    const weekId = weekMapByNumber.get(weekNumber);

    if (!playerName || weekNumber == null || !playerId || !weekId) {
      summary.scores.skipped.push({
        player_name: playerName || "(blank)",
        week_number: weekNumber,
        reason: !playerId ? "player_not_found" : !weekId ? "week_not_found" : "invalid_row",
      });
      continue;
    }

    const normalizedStatus = String(status || "").trim().toLowerCase();
    if (normalizedStatus !== "played") {
      summary.scores.skipped.push({
        player_name: playerName,
        week_number: weekNumber,
        reason: `non_played_status:${normalizedStatus || "blank"}`,
      });
      continue;
    }

    const holeValues = [];
    for (let hole = 1; hole <= 9; hole += 1) {
      const holeStrokes = parseInteger(pick(scoreRow, [`hole_${hole}`, `h${hole}`]));
      holeValues.push(holeStrokes);
    }

    if (holeValues.some((value) => value == null)) {
      summary.scores.skipped.push({
        player_name: playerName,
        week_number: weekNumber,
        reason: "missing_hole_scores",
      });
      continue;
    }

    const holeTotal = holeValues.reduce((sum, value) => sum + value, 0);
    if (grossScore == null || holeTotal !== grossScore) {
      summary.scores.skipped.push({
        player_name: playerName,
        week_number: weekNumber,
        reason: `gross_mismatch:holes=${holeTotal},gross=${grossScore}`,
      });
      continue;
    }

    if (!args.dryRun) {
      const weeklyScoreUpsert = await supabase.from("weekly_scores").upsert(
        {
          league_week_id: weekId,
          player_id: playerId,
          gross_score: grossScore,
        },
        { onConflict: "league_week_id,player_id" }
      );
      if (weeklyScoreUpsert.error) throw new Error(weeklyScoreUpsert.error.message);

      const holeRows = holeValues.map((strokes, index) => ({
        league_week_id: weekId,
        player_id: playerId,
        hole_number: index + 1,
        strokes,
      }));
      const holeUpsert = await supabase
        .from("hole_scores")
        .upsert(holeRows, { onConflict: "player_id,league_week_id,hole_number" });
      if (holeUpsert.error) throw new Error(holeUpsert.error.message);

      if (handicapValue != null) {
        const handicapPayload = {
          league_week_id: weekId,
          player_id: playerId,
          handicap_index: handicapValue,
          course_handicap: handicapValue,
          final_computed_handicap: Math.round(handicapValue),
        };
        const weeklyHandicapUpsert = await supabase
          .from("weekly_handicaps")
          .upsert(
            supportsLeagueHandicapPercent
              ? { ...handicapPayload, league_handicap_percent: 100 }
              : handicapPayload,
            { onConflict: "league_week_id,player_id" }
          );
        if (weeklyHandicapUpsert.error) throw new Error(weeklyHandicapUpsert.error.message);
        summary.scores.upsertedHandicaps += 1;
      }
    } else if (handicapValue != null) {
      summary.scores.upsertedHandicaps += 1;
    }

    summary.scores.upsertedWeeklyScores += 1;
    summary.scores.upsertedHoleScores += 9;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => fail(error.message));
