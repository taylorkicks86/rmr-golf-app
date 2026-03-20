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
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const seasonRes = await supabase
    .from("seasons")
    .select("id, name, year")
    .ilike("name", TARGET_SEASON_NAME)
    .limit(1)
    .maybeSingle();
  if (seasonRes.error) fail(seasonRes.error.message);
  const season = seasonRes.data;
  if (!season?.id) {
    fail(`Season "${TARGET_SEASON_NAME}" not found.`);
  }

  const weeksRes = await supabase
    .from("league_weeks")
    .select("id")
    .eq("season_id", season.id);
  if (weeksRes.error) fail(weeksRes.error.message);
  const weekIds = ((weeksRes.data ?? []).map((row) => row.id));
  if (weekIds.length === 0) {
    fail(`Season "${TARGET_SEASON_NAME}" has no weeks.`);
  }

  const scoresRes = await supabase
    .from("weekly_scores")
    .select("player_id, league_week_id")
    .in("league_week_id", weekIds);
  if (scoresRes.error) fail(scoresRes.error.message);
  const scoreRows = scoresRes.data ?? [];
  if (scoreRows.length === 0) {
    fail(`No weekly_scores found for season "${TARGET_SEASON_NAME}".`);
  }

  const scorePlayerIds = Array.from(new Set(scoreRows.map((row) => row.player_id)));
  const scorePlayersRes = await supabase
    .from("players")
    .select("id, full_name")
    .in("id", scorePlayerIds);
  if (scorePlayersRes.error) fail(scorePlayersRes.error.message);
  const scorePlayers = scorePlayersRes.data ?? [];
  const scorePlayerById = new Map(scorePlayers.map((row) => [row.id, row]));

  const scoreCountsByName = new Map();
  for (const row of scoreRows) {
    const player = scorePlayerById.get(row.player_id);
    if (!player?.full_name) continue;
    const key = normalizeName(player.full_name);
    const existing = scoreCountsByName.get(key) ?? new Map();
    existing.set(row.player_id, (existing.get(row.player_id) ?? 0) + 1);
    scoreCountsByName.set(key, existing);
  }

  const preferredScorePlayerIdByName = new Map();
  for (const [nameKey, counts] of scoreCountsByName.entries()) {
    const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    preferredScorePlayerIdByName.set(nameKey, ranked[0][0]);
  }

  const membersRes = await supabase
    .from("cup_team_members")
    .select("id, cup_team_id, player_id, season_id")
    .eq("season_id", season.id);
  if (membersRes.error) fail(membersRes.error.message);
  const members = membersRes.data ?? [];

  const memberPlayerIds = Array.from(new Set(members.map((row) => row.player_id)));
  const memberPlayersRes = await supabase
    .from("players")
    .select("id, full_name")
    .in("id", memberPlayerIds);
  if (memberPlayersRes.error) fail(memberPlayersRes.error.message);
  const memberPlayerById = new Map((memberPlayersRes.data ?? []).map((row) => [row.id, row]));

  const currentMemberByPlayerId = new Map(members.map((member) => [member.player_id, member.id]));
  const updates = [];
  const skips = [];

  for (const member of members) {
    const currentPlayer = memberPlayerById.get(member.player_id);
    const normalized = normalizeName(currentPlayer?.full_name);
    if (!normalized) {
      skips.push({ member_id: member.id, reason: "member_name_missing" });
      continue;
    }

    const targetPlayerId = preferredScorePlayerIdByName.get(normalized);
    if (!targetPlayerId) {
      skips.push({ member_id: member.id, name: currentPlayer.full_name, reason: "name_not_found_in_weekly_scores" });
      continue;
    }

    if (targetPlayerId === member.player_id) {
      continue;
    }

    const occupiedMemberId = currentMemberByPlayerId.get(targetPlayerId);
    if (occupiedMemberId && occupiedMemberId !== member.id) {
      skips.push({
        member_id: member.id,
        name: currentPlayer.full_name,
        target_player_id: targetPlayerId,
        reason: "target_player_already_has_membership_in_season",
      });
      continue;
    }

    updates.push({
      member_id: member.id,
      team_id: member.cup_team_id,
      from_player_id: member.player_id,
      to_player_id: targetPlayerId,
      name: currentPlayer.full_name,
    });
    currentMemberByPlayerId.delete(member.player_id);
    currentMemberByPlayerId.set(targetPlayerId, member.id);
  }

  if (!dryRun) {
    for (const change of updates) {
      const updateRes = await supabase
        .from("cup_team_members")
        .update({ player_id: change.to_player_id })
        .eq("id", change.member_id)
        .eq("season_id", season.id);

      if (updateRes.error) {
        skips.push({
          member_id: change.member_id,
          name: change.name,
          reason: `update_failed:${updateRes.error.message}`,
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "apply",
        season: { id: season.id, name: season.name, year: season.year },
        weekly_score_player_ids: scorePlayerIds.length,
        cup_team_members_rows: members.length,
        updates_planned_or_applied: updates.length,
        skipped: skips,
        updates,
      },
      null,
      2
    )
  );
}

main().catch((error) => fail(error.message));
