/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

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

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    apply: args.includes("--apply"),
    weekId: "",
  };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--week-id") {
      parsed.weekId = args[i + 1] || "";
      i += 1;
    }
  }
  return parsed;
}

function resolveOfficialScorerByTeam({ teams, members, participation, players }) {
  const membersByTeam = new Map();
  members.forEach((member) => {
    const list = membersByTeam.get(member.cup_team_id) || [];
    list.push(member.player_id);
    membersByTeam.set(member.cup_team_id, list);
  });

  const participationByPlayerId = new Map(participation.map((record) => [record.player_id, record]));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const scorerByTeam = new Map();
  const ambiguityErrors = [];

  teams.forEach((team) => {
    const teamMemberIds = membersByTeam.get(team.id) || [];
    const teamMemberSet = new Set(teamMemberIds);
    const designated = participation.find(
      (record) =>
        record.cup_scorer_for_team_id === team.id &&
        record.cup &&
        record.playing_this_week === true &&
        teamMemberSet.has(record.player_id)
    );

    if (designated && designated.player_id) {
      scorerByTeam.set(team.id, designated.player_id);
      return;
    }

    const eligiblePlayingMembers = teamMemberIds.filter((playerId) => {
      const player = playerById.get(playerId);
      const rec = participationByPlayerId.get(playerId);
      return Boolean(player && player.cup) && rec && rec.cup === true && rec.playing_this_week === true;
    });

    if (eligiblePlayingMembers.length === 1) {
      scorerByTeam.set(team.id, eligiblePlayingMembers[0]);
      return;
    }

    if (eligiblePlayingMembers.length > 1) {
      ambiguityErrors.push(
        `${team.name}: multiple team members are marked playing. Mark only one player as playing for this week.`
      );
      scorerByTeam.set(team.id, null);
      return;
    }

    scorerByTeam.set(team.id, null);
  });

  return { scorerByTeam, ambiguityErrors };
}

function computeWeeklyCupResults({ players, participation, scores, teamMembers, scoringPlayerIds }) {
  const eligiblePlayers = players.filter((player) => player.cup);
  const eligibleIds = new Set(eligiblePlayers.map((player) => player.id));
  const scoringIdSet =
    Array.isArray(scoringPlayerIds) && scoringPlayerIds.length > 0
      ? new Set(scoringPlayerIds.filter((id) => eligibleIds.has(id)))
      : null;

  const participationByPlayer = new Map(participation.map((row) => [row.player_id, row]));
  const scoreByPlayer = new Map(scores.map((row) => [row.player_id, Number(row.gross_score)]));
  const playerById = new Map(eligiblePlayers.map((player) => [player.id, player]));
  const playerIdByNormalizedName = new Map(
    eligiblePlayers.map((player) => [player.full_name.trim().toLowerCase(), player.id])
  );
  const membersByTeamId = new Map();
  teamMembers.forEach((member) => {
    const existing = membersByTeamId.get(member.cup_team_id) || [];
    existing.push(member.player_id);
    membersByTeamId.set(member.cup_team_id, existing);
  });
  const teamIds = Array.from(membersByTeamId.keys());

  const activeScorerByTeamId = new Map();
  const isValidScorer = (playerId) => {
    if (!eligibleIds.has(playerId)) return false;
    const participationRow = participationByPlayer.get(playerId);
    const hasScore = scoreByPlayer.has(playerId);
    if (!hasScore) return false;
    if (!participationRow) return true;
    if (participationRow.playing_this_week === false) return false;
    return true;
  };

  const pickBestValidScorer = (memberIds) => {
    const candidates = memberIds
      .filter((memberId) => isValidScorer(memberId))
      .map((memberId) => {
        const player = playerById.get(memberId);
        const gross = scoreByPlayer.get(memberId) || 0;
        const net = player ? Number((gross - Number(player.handicap_index)).toFixed(2)) : Number.MAX_SAFE_INTEGER;
        return {
          player_id: memberId,
          gross,
          net,
          full_name: (player && player.full_name) || memberId,
        };
      })
      .sort((a, b) => {
        if (a.net !== b.net) return a.net - b.net;
        if (a.gross !== b.gross) return a.gross - b.gross;
        return a.full_name.localeCompare(b.full_name);
      });
    return (candidates[0] && candidates[0].player_id) || null;
  };

  const getScoringCandidateIdsForTeam = (teamMemberIds) => {
    const candidates = new Set(teamMemberIds);

    teamMemberIds.forEach((memberId) => {
      if (scoreByPlayer.has(memberId)) return;
      const teamMember = playerById.get(memberId);
      if (!teamMember) return;
      const splitNames = teamMember.full_name
        .split("&")
        .map((name) => name.trim().toLowerCase())
        .filter((name) => name.length > 0);
      if (splitNames.length < 2) return;
      splitNames.forEach((name) => {
        const aliasPlayerId = playerIdByNormalizedName.get(name);
        if (aliasPlayerId) {
          candidates.add(aliasPlayerId);
        }
      });
    });

    return Array.from(candidates);
  };

  if (scoringIdSet) {
    teamIds.forEach((teamId) => {
      const memberIds = membersByTeamId.get(teamId) || [];
      const candidateIds = getScoringCandidateIdsForTeam(memberIds);
      const scorerIdFromAssignments =
        candidateIds.find((memberId) => scoringIdSet.has(memberId) && isValidScorer(memberId)) || null;
      const scorerId = scorerIdFromAssignments || pickBestValidScorer(candidateIds);
      if (scorerId) {
        activeScorerByTeamId.set(teamId, scorerId);
      }
    });
  } else {
    teamIds.forEach((teamId) => {
      const memberIds = membersByTeamId.get(teamId) || [];
      const candidateIds = getScoringCandidateIdsForTeam(memberIds);
      const scorerId = pickBestValidScorer(candidateIds);
      if (scorerId) {
        activeScorerByTeamId.set(teamId, scorerId);
      }
    });
  }

  const rankedTeams = Array.from(activeScorerByTeamId.entries())
    .map(([teamId, scorerId]) => {
      const scorer = playerById.get(scorerId);
      const gross = scoreByPlayer.get(scorerId) || 0;
      const net = scorer ? Number((gross - Number(scorer.handicap_index)).toFixed(2)) : 0;
      return {
        team_id: teamId,
        scorer_id: scorerId,
        gross,
        net,
        scorer_name: (scorer && scorer.full_name) || scorerId,
      };
    })
    .sort((a, b) => {
      if (a.net !== b.net) return a.net - b.net;
      if (a.gross !== b.gross) return a.gross - b.gross;
      return a.scorer_name.localeCompare(b.scorer_name);
    });

  const pointsTable = [750, 600, 475, 400, 350, 300, 250, 200, 150, 100];
  const teamCount = 10;
  const allTeamIds = teamIds.slice();
  const rankedTeamIds = rankedTeams.map((row) => row.team_id);
  const pointsByTeamId = new Map();
  rankedTeamIds.forEach((teamId, index) => {
    pointsByTeamId.set(teamId, {
      finishPosition: index + 1,
      pointsEarned: pointsTable[index] || 0,
    });
  });

  const vacantPositions = Array.from({ length: teamCount }, (_, index) => index + 1).filter(
    (pos) => pos > rankedTeamIds.length
  );
  const vacantPointsTotal = vacantPositions.reduce((sum, pos) => sum + (pointsTable[pos - 1] || 0), 0);
  const dnpTeamIds = allTeamIds.filter((teamId) => !pointsByTeamId.has(teamId));
  const dnpPoints = dnpTeamIds.length > 0 ? Number((vacantPointsTotal / dnpTeamIds.length).toFixed(2)) : 0;
  dnpTeamIds.forEach((teamId) => {
    pointsByTeamId.set(teamId, {
      finishPosition: null,
      pointsEarned: dnpPoints,
    });
  });

  const representativeByTeam = new Map();
  teamIds.forEach((teamId) => {
    const memberIds = membersByTeamId.get(teamId) || [];
    const eligibleTeamMemberIds = memberIds
      .filter((memberId) => eligibleIds.has(memberId))
      .sort((a, b) => {
        const nameA = (playerById.get(a) && playerById.get(a).full_name) || a;
        const nameB = (playerById.get(b) && playerById.get(b).full_name) || b;
        return nameA.localeCompare(nameB);
      });
    if (eligibleTeamMemberIds.length > 0) {
      representativeByTeam.set(teamId, eligibleTeamMemberIds[0]);
      return;
    }
    const fallbackMember = memberIds.slice().sort((a, b) => a.localeCompare(b))[0];
    if (fallbackMember) {
      representativeByTeam.set(teamId, fallbackMember);
    }
  });

  return teamIds
    .map((teamId) => {
      const representativeId = representativeByTeam.get(teamId);
      if (!representativeId) return null;
      const teamPoints = pointsByTeamId.get(teamId);
      const scorerId = activeScorerByTeamId.get(teamId);
      const scorer = scorerId ? playerById.get(scorerId) : null;
      const gross = scorerId ? scoreByPlayer.get(scorerId) || null : null;
      const net =
        scorer && gross != null ? Number((gross - Number(scorer.handicap_index)).toFixed(2)) : null;
      return {
        player_id: representativeId,
        gross_score: gross,
        net_score: net,
        finish_position: (teamPoints && teamPoints.finishPosition) || null,
        points_earned: (teamPoints && teamPoints.pointsEarned) || 0,
      };
    })
    .filter(Boolean);
}

async function main() {
  loadEnvFromDotLocal();
  const { apply, weekId: weekIdArg } = parseArgs(process.argv);
  if (!apply) {
    fail("Run with --apply. Example: DEV_SEED_CONFIRM=YES node scripts/refresh-finalized-cup-week.cjs --apply");
  }
  if (process.env.DEV_SEED_CONFIRM !== "YES") {
    fail("Set DEV_SEED_CONFIRM=YES.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("Missing Supabase env vars.");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let weekId = weekIdArg;
  if (!weekId) {
    const appStateRes = await supabase
      .from("league_app_state")
      .select("current_dashboard_week_id")
      .eq("singleton_key", true)
      .maybeSingle();
    if (appStateRes.error) fail(appStateRes.error.message);
    weekId = appStateRes.data?.current_dashboard_week_id || "";
  }
  if (!weekId) fail("No target week found. Pass --week-id.");

  const weekRes = await supabase
    .from("league_weeks")
    .select("id, season_id, week_number, week_date, is_finalized, status")
    .eq("id", weekId)
    .maybeSingle();
  if (weekRes.error) fail(weekRes.error.message);
  const week = weekRes.data;
  if (!week) fail(`Week not found: ${weekId}`);

  console.log(JSON.stringify({ step: "week_state_before", week }, null, 2));
  if (!week.is_finalized) {
    fail(`Week ${weekId} is not finalized. Select a finalized week.`);
  }

  const [teamsRes, membersRes, playersRes, participationRes, scoresRes, cupResultsBeforeRes] = await Promise.all([
    supabase.from("cup_teams").select("id, name").eq("season_id", week.season_id).order("name"),
    supabase.from("cup_team_members").select("cup_team_id, player_id").eq("season_id", week.season_id),
    supabase.from("players").select("id, full_name, handicap_index, cup"),
    supabase
      .from("weekly_participation")
      .select("player_id, cup, playing_this_week, cup_scorer_for_team_id")
      .eq("league_week_id", weekId),
    supabase.from("weekly_scores").select("player_id, gross_score").eq("league_week_id", weekId),
    supabase
      .from("weekly_cup_results")
      .select("player_id, gross_score, net_score, finish_position, points_earned")
      .eq("league_week_id", weekId),
  ]);
  if (teamsRes.error) fail(teamsRes.error.message);
  if (membersRes.error) fail(membersRes.error.message);
  if (playersRes.error) fail(playersRes.error.message);
  if (participationRes.error) fail(participationRes.error.message);
  if (scoresRes.error) fail(scoresRes.error.message);
  if (cupResultsBeforeRes.error) fail(cupResultsBeforeRes.error.message);

  const teams = teamsRes.data || [];
  const members = membersRes.data || [];
  const players = playersRes.data || [];
  const participation = participationRes.data || [];
  const scores = scoresRes.data || [];
  const cupResultsBefore = cupResultsBeforeRes.data || [];

  const teamByPlayerId = new Map();
  const membersByTeamId = new Map();
  members.forEach((member) => {
    teamByPlayerId.set(member.player_id, member.cup_team_id);
    const list = membersByTeamId.get(member.cup_team_id) || [];
    list.push(member.player_id);
    membersByTeamId.set(member.cup_team_id, list);
  });
  const scoreByPlayerId = new Map(scores.map((score) => [score.player_id, score.gross_score]));

  const persistedByTeamBefore = new Map();
  cupResultsBefore.forEach((row) => {
    const teamId = teamByPlayerId.get(row.player_id);
    if (teamId && !persistedByTeamBefore.has(teamId)) persistedByTeamBefore.set(teamId, row);
  });

  const affectedTeam =
    teams.find((team) => {
      const hasMemberScore = (membersByTeamId.get(team.id) || []).some((id) => scoreByPlayerId.has(id));
      const row = persistedByTeamBefore.get(team.id);
      return hasMemberScore && (!row || row.finish_position == null);
    }) || teams[0] || null;
  if (!affectedTeam) fail("No cup teams found for target week season.");

  const { scorerByTeam, ambiguityErrors } = resolveOfficialScorerByTeam({
    teams,
    members,
    participation,
    players,
  });
  if (ambiguityErrors.length > 0) {
    fail(`Ambiguity errors: ${ambiguityErrors.join(" | ")}`);
  }
  const officialScorerIds = Array.from(scorerByTeam.values()).filter(Boolean);
  const weeklyCupRowsComputed = computeWeeklyCupResults({
    players,
    participation,
    scores,
    teamMembers: members,
    scoringPlayerIds: officialScorerIds,
  });
  const computedByTeam = new Map();
  weeklyCupRowsComputed.forEach((row) => {
    const teamId = teamByPlayerId.get(row.player_id);
    if (teamId && !computedByTeam.has(teamId)) computedByTeam.set(teamId, row);
  });

  console.info("[FinalizeTrace][TeamSection]", {
    weekId,
    selectedWeekFinalized: true,
    uiSource: "weekly_cup_results",
    teamId: affectedTeam.id,
    teamName: affectedTeam.name,
    teamMemberPlayerIds: membersByTeamId.get(affectedTeam.id) || [],
    playerScoreRowsFound: (membersByTeamId.get(affectedTeam.id) || [])
      .filter((id) => scoreByPlayerId.has(id))
      .map((id) => ({ playerId: id, gross: scoreByPlayerId.get(id) })),
    computedTeamResult: computedByTeam.get(affectedTeam.id) || null,
    persistedTeamResultBeforeFinalize: persistedByTeamBefore.get(affectedTeam.id) || null,
    uiDisplayedTeamResult: persistedByTeamBefore.get(affectedTeam.id) || null,
  });

  console.info("[FinalizeTrace][BeforePersist]", {
    weekId,
    teamId: affectedTeam.id,
    teamName: affectedTeam.name,
    teamMemberPlayerIds: membersByTeamId.get(affectedTeam.id) || [],
    playerScoreRowsFound: (membersByTeamId.get(affectedTeam.id) || [])
      .filter((id) => scoreByPlayerId.has(id))
      .map((id) => ({ playerId: id, gross: scoreByPlayerId.get(id) })),
    computedTeamResult: computedByTeam.get(affectedTeam.id) || null,
    persistedTeamResultBeforeFinalize: persistedByTeamBefore.get(affectedTeam.id) || null,
  });

  const unfinalizeRes = await supabase
    .from("league_weeks")
    .update({ is_finalized: false, status: "open" })
    .eq("id", weekId);
  if (unfinalizeRes.error) fail(unfinalizeRes.error.message);

  const clearScorerRes = await supabase
    .from("weekly_participation")
    .update({ cup_scorer_for_team_id: null })
    .eq("league_week_id", weekId);
  if (clearScorerRes.error) fail(clearScorerRes.error.message);

  const scorerAssignments = Array.from(scorerByTeam.entries()).filter(([, playerId]) => Boolean(playerId));
  for (const [teamId, playerId] of scorerAssignments) {
    const assignRes = await supabase
      .from("weekly_participation")
      .update({ cup_scorer_for_team_id: teamId })
      .eq("league_week_id", weekId)
      .eq("player_id", playerId);
    if (assignRes.error) fail(assignRes.error.message);
  }

  const deleteCupRes = await supabase.from("weekly_cup_results").delete().eq("league_week_id", weekId);
  if (deleteCupRes.error) fail(deleteCupRes.error.message);

  if (weeklyCupRowsComputed.length > 0) {
    const upsertRes = await supabase.from("weekly_cup_results").upsert(
      weeklyCupRowsComputed.map((row) => ({
        league_week_id: weekId,
        player_id: row.player_id,
        gross_score: row.gross_score,
        net_score: row.net_score,
        finish_position: row.finish_position,
        points_earned: row.points_earned,
      })),
      { onConflict: "league_week_id,player_id" }
    );
    if (upsertRes.error) fail(upsertRes.error.message);
  }

  const refinalizeRes = await supabase
    .from("league_weeks")
    .update({ is_finalized: true, status: "finalized" })
    .eq("id", weekId);
  if (refinalizeRes.error) fail(refinalizeRes.error.message);

  const cupResultsAfterRes = await supabase
    .from("weekly_cup_results")
    .select("player_id, gross_score, net_score, finish_position, points_earned")
    .eq("league_week_id", weekId);
  if (cupResultsAfterRes.error) fail(cupResultsAfterRes.error.message);
  const cupResultsAfter = cupResultsAfterRes.data || [];
  const persistedByTeamAfter = new Map();
  cupResultsAfter.forEach((row) => {
    const teamId = teamByPlayerId.get(row.player_id);
    if (teamId && !persistedByTeamAfter.has(teamId)) persistedByTeamAfter.set(teamId, row);
  });

  console.info("[FinalizeTrace][AfterPersist]", {
    weekId,
    teamId: affectedTeam.id,
    teamName: affectedTeam.name,
    persistedTeamResultAfterFinalize: persistedByTeamAfter.get(affectedTeam.id) || null,
  });

  const affectedAfter = persistedByTeamAfter.get(affectedTeam.id) || null;
  console.log(
    JSON.stringify(
      {
        weekId,
        weekNumber: week.week_number,
        teamId: affectedTeam.id,
        teamName: affectedTeam.name,
        beforeStatus: persistedByTeamBefore.get(affectedTeam.id)?.finish_position != null ? "Scored" : "DNP",
        afterStatus: affectedAfter?.finish_position != null ? "Scored" : "DNP",
      },
      null,
      2
    )
  );
}

main().catch((error) => fail(error.message));
