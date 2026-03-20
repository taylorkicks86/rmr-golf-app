import { CUP_TEAM_COUNT, pointsForCupPosition } from "@/lib/cup-scoring";

export type CupEligiblePlayer = {
  id: string;
  full_name: string;
  handicap_index: number;
  cup: boolean;
};

export type WeeklyParticipationForCup = {
  player_id: string;
  playing_this_week: boolean | null;
  cup?: boolean;
};

export type WeeklyGrossScore = {
  player_id: string;
  gross_score: number;
};

export type CupTeamMembership = {
  cup_team_id: string;
  player_id: string;
};

export type WeeklyCupResultRow = {
  player_id: string;
  gross_score: number | null;
  net_score: number | null;
  finish_position: number | null;
  points_earned: number;
};

export function computeWeeklyCupResults(params: {
  players: CupEligiblePlayer[];
  participation: WeeklyParticipationForCup[];
  scores: WeeklyGrossScore[];
  teamMembers: CupTeamMembership[];
  scoringPlayerIds?: string[];
}): WeeklyCupResultRow[] {
  const { players, participation, scores, teamMembers, scoringPlayerIds } = params;

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
  const membersByTeamId = new Map<string, string[]>();
  teamMembers.forEach((member) => {
    const existing = membersByTeamId.get(member.cup_team_id) ?? [];
    existing.push(member.player_id);
    membersByTeamId.set(member.cup_team_id, existing);
  });
  const teamIds = Array.from(membersByTeamId.keys());

  const activeScorerByTeamId = new Map<string, string>();
  const isValidScorer = (playerId: string) => {
    if (!eligibleIds.has(playerId)) return false;
    const hasScore = scoreByPlayer.has(playerId);
    if (!hasScore) return false;
    return true;
  };

  const pickBestValidScorer = (memberIds: string[]): string | null => {
    const candidates = memberIds
      .filter((memberId) => isValidScorer(memberId))
      .map((memberId) => {
        const player = playerById.get(memberId);
        const gross = scoreByPlayer.get(memberId) ?? 0;
        const net = player ? Number((gross - Number(player.handicap_index)).toFixed(2)) : Number.MAX_SAFE_INTEGER;
        return {
          player_id: memberId,
          gross,
          net,
          full_name: player?.full_name ?? memberId,
        };
      })
      .sort((a, b) => {
        if (a.net !== b.net) return a.net - b.net;
        if (a.gross !== b.gross) return a.gross - b.gross;
        return a.full_name.localeCompare(b.full_name);
      });

    return candidates[0]?.player_id ?? null;
  };

  const getScoringCandidateIdsForTeam = (teamMemberIds: string[]): string[] => {
    const candidates = new Set<string>(teamMemberIds);

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
      const memberIds = membersByTeamId.get(teamId) ?? [];
      const candidateIds = getScoringCandidateIdsForTeam(memberIds);
      const scorerIdFromAssignments =
        candidateIds.find((memberId) => scoringIdSet.has(memberId) && isValidScorer(memberId)) ?? null;
      const scorerId = scorerIdFromAssignments ?? pickBestValidScorer(candidateIds);
      if (scorerId) {
        activeScorerByTeamId.set(teamId, scorerId);
      }
    });
  } else {
    teamIds.forEach((teamId) => {
      const memberIds = membersByTeamId.get(teamId) ?? [];
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
      const gross = scoreByPlayer.get(scorerId) ?? 0;
      const net = scorer ? Number((gross - Number(scorer.handicap_index)).toFixed(2)) : 0;
      return {
        team_id: teamId,
        scorer_id: scorerId,
        gross,
        net,
        scorer_name: scorer?.full_name ?? scorerId,
      };
    })
    .sort((a, b) => {
      if (a.net !== b.net) return a.net - b.net;
      if (a.gross !== b.gross) return a.gross - b.gross;
      return a.scorer_name.localeCompare(b.scorer_name);
    });

  const pointsByTeamId = new Map<string, { finishPosition: number | null; pointsEarned: number }>();
  const occupiedPositions = new Set<number>();

  let positionCursor = 1;
  let index = 0;
  while (index < rankedTeams.length && positionCursor <= CUP_TEAM_COUNT) {
    const net = rankedTeams[index]?.net;
    const tieGroup: typeof rankedTeams = [];
    while (index < rankedTeams.length && rankedTeams[index]?.net === net) {
      tieGroup.push(rankedTeams[index]);
      index += 1;
    }

    const slotPositions = Array.from({ length: tieGroup.length }, (_, offset) => positionCursor + offset).filter(
      (position) => position <= CUP_TEAM_COUNT
    );
    const slotPoints =
      slotPositions.length > 0
        ? slotPositions.reduce((sum, position) => sum + pointsForCupPosition(position), 0)
        : 0;
    const sharedPoints = slotPositions.length > 0 ? Number((slotPoints / slotPositions.length).toFixed(2)) : 0;

    tieGroup.forEach((team) => {
      pointsByTeamId.set(team.team_id, {
        finishPosition: positionCursor,
        pointsEarned: sharedPoints,
      });
    });

    slotPositions.forEach((position) => occupiedPositions.add(position));
    positionCursor += tieGroup.length;
  }

  const dnpTeamIds = teamIds.filter((teamId) => !pointsByTeamId.has(teamId));
  const vacantPositions = Array.from({ length: CUP_TEAM_COUNT }, (_, idx) => idx + 1).filter(
    (position) => !occupiedPositions.has(position)
  );
  const vacantPointsTotal = vacantPositions.reduce((sum, position) => sum + pointsForCupPosition(position), 0);
  const dnpPoints =
    dnpTeamIds.length > 0 ? Number((vacantPointsTotal / dnpTeamIds.length).toFixed(2)) : 0;

  dnpTeamIds.forEach((teamId) => {
    pointsByTeamId.set(teamId, {
      finishPosition: null,
      pointsEarned: dnpPoints,
    });
  });

  const representativeByTeam = new Map<string, string>();
  teamIds.forEach((teamId) => {
    const memberIds = membersByTeamId.get(teamId) ?? [];
    const eligibleTeamMemberIds = memberIds
      .filter((memberId) => eligibleIds.has(memberId))
      .sort((a, b) => {
        const nameA = playerById.get(a)?.full_name ?? a;
        const nameB = playerById.get(b)?.full_name ?? b;
        return nameA.localeCompare(nameB);
      });

    if (eligibleTeamMemberIds.length > 0) {
      representativeByTeam.set(teamId, eligibleTeamMemberIds[0]);
      return;
    }

    const fallbackMember = [...memberIds].sort((a, b) => a.localeCompare(b))[0];
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
      const gross = scorerId ? scoreByPlayer.get(scorerId) ?? null : null;
      const net =
        scorer && gross != null
          ? Number((gross - Number(scorer.handicap_index)).toFixed(2))
          : null;

      return {
        player_id: representativeId,
        gross_score: gross,
        net_score: net,
        finish_position: teamPoints?.finishPosition ?? null,
        points_earned: teamPoints?.pointsEarned ?? 0,
      };
    })
    .filter((row): row is WeeklyCupResultRow => Boolean(row));
}
