import {
  DEFAULT_CUP_SCORING_SETTINGS,
  type CupScoringSettings,
  normalizeCupScoringSettings,
  pointsForCupPosition,
} from "@/lib/cup-scoring";

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
  gross_score: number | null;
  did_not_finish?: boolean | null;
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
  did_not_finish?: boolean;
};

export function computeWeeklyCupResults(params: {
  players: CupEligiblePlayer[];
  participation: WeeklyParticipationForCup[];
  scores: WeeklyGrossScore[];
  teamMembers: CupTeamMembership[];
  scoringPlayerIds?: string[];
  scoringSettings?: CupScoringSettings;
}): WeeklyCupResultRow[] {
  const { players, participation, scores, teamMembers, scoringPlayerIds } = params;
  const scoringSettings = normalizeCupScoringSettings(params.scoringSettings ?? DEFAULT_CUP_SCORING_SETTINGS);

  const eligiblePlayers = players.filter((player) => player.cup);
  const eligibleIds = new Set(eligiblePlayers.map((player) => player.id));
  const scoringIdSet =
    Array.isArray(scoringPlayerIds) && scoringPlayerIds.length > 0
      ? new Set(scoringPlayerIds.filter((id) => eligibleIds.has(id)))
      : null;

  const scoreByPlayer = new Map(scores.map((row) => [row.player_id, row]));
  const playerById = new Map(eligiblePlayers.map((player) => [player.id, player]));
  const playerIdByNormalizedName = new Map(
    eligiblePlayers.map((player) => [player.full_name.trim().toLowerCase(), player.id])
  );
  const membersByTeamId = new Map<string, string[]>();
  const teamIdByPlayerId = new Map<string, string>();
  teamMembers.forEach((member) => {
    const existing = membersByTeamId.get(member.cup_team_id) ?? [];
    existing.push(member.player_id);
    membersByTeamId.set(member.cup_team_id, existing);
    teamIdByPlayerId.set(member.player_id, member.cup_team_id);
  });
  const teamIds = Array.from(membersByTeamId.keys());
  const activeTeamIds = new Set<string>();
  participation.forEach((row) => {
    if (row.playing_this_week !== true || row.cup !== true || !eligibleIds.has(row.player_id)) {
      return;
    }
    const teamId = teamIdByPlayerId.get(row.player_id);
    if (teamId) {
      activeTeamIds.add(teamId);
    }
  });

  const activeScorerByTeamId = new Map<string, string>();
  const isValidScorer = (playerId: string) => {
    if (!eligibleIds.has(playerId)) return false;
    const score = scoreByPlayer.get(playerId);
    if (!score) return false;
    return score.did_not_finish === true || score.gross_score != null;
  };

  const pickBestValidScorer = (memberIds: string[]): string | null => {
    const candidates = memberIds
      .filter((memberId) => isValidScorer(memberId))
      .map((memberId) => {
        const player = playerById.get(memberId);
        const score = scoreByPlayer.get(memberId);
        const didNotFinish = score?.did_not_finish === true;
        const gross = score?.gross_score == null ? null : Number(score.gross_score);
        const net =
          didNotFinish || gross == null
            ? Number.MAX_SAFE_INTEGER
            : player
              ? Number((gross - Number(player.handicap_index)).toFixed(2))
              : Number.MAX_SAFE_INTEGER;
        return {
          player_id: memberId,
          gross,
          net,
          didNotFinish,
          full_name: player?.full_name ?? memberId,
        };
      })
      .sort((a, b) => {
        if (a.didNotFinish !== b.didNotFinish) return a.didNotFinish ? 1 : -1;
        if (a.net !== b.net) return a.net - b.net;
        if ((a.gross ?? Number.MAX_SAFE_INTEGER) !== (b.gross ?? Number.MAX_SAFE_INTEGER)) {
          return (a.gross ?? Number.MAX_SAFE_INTEGER) - (b.gross ?? Number.MAX_SAFE_INTEGER);
        }
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
      const score = scoreByPlayer.get(scorerId);
      const didNotFinish = score?.did_not_finish === true;
      const gross = score?.gross_score == null ? null : Number(score.gross_score);
      const net =
        didNotFinish || gross == null
          ? Number.MAX_SAFE_INTEGER
          : scorer
            ? Number((gross - Number(scorer.handicap_index)).toFixed(2))
            : Number.MAX_SAFE_INTEGER;
      return {
        team_id: teamId,
        scorer_id: scorerId,
        gross,
        net,
        didNotFinish,
        scorer_name: scorer?.full_name ?? scorerId,
      };
    })
    .sort((a, b) => {
      if (a.didNotFinish !== b.didNotFinish) return a.didNotFinish ? 1 : -1;
      if (a.net !== b.net) return a.net - b.net;
      if ((a.gross ?? Number.MAX_SAFE_INTEGER) !== (b.gross ?? Number.MAX_SAFE_INTEGER)) {
        return (a.gross ?? Number.MAX_SAFE_INTEGER) - (b.gross ?? Number.MAX_SAFE_INTEGER);
      }
      return a.scorer_name.localeCompare(b.scorer_name);
    });

  const pointsByTeamId = new Map<string, { finishPosition: number | null; pointsEarned: number }>();
  const occupiedPositions = new Set<number>();

  let positionCursor = 1;
  let index = 0;
  while (index < rankedTeams.length) {
    const net = rankedTeams[index]?.net;
    const tieGroup: typeof rankedTeams = [];
    while (index < rankedTeams.length && rankedTeams[index]?.net === net) {
      tieGroup.push(rankedTeams[index]);
      index += 1;
    }

    const isDnfTieGroup = tieGroup.every((team) => team.didNotFinish);
    const finishPosition =
      isDnfTieGroup && activeTeamIds.size > 0
        ? Math.max(positionCursor, activeTeamIds.size - tieGroup.length + 1)
        : positionCursor;
    const slotPositions = Array.from({ length: tieGroup.length }, (_, offset) => finishPosition + offset);
    const slotPoints = slotPositions.reduce(
      (sum, position) => sum + pointsForCupPosition(position, scoringSettings),
      0
    );
    const sharedPoints = slotPositions.length > 0 ? Number((slotPoints / slotPositions.length).toFixed(2)) : 0;

    tieGroup.forEach((team) => {
      pointsByTeamId.set(team.team_id, {
        finishPosition,
        pointsEarned: sharedPoints,
      });
    });

    slotPositions.forEach((position) => {
      if (position <= scoringSettings.scoringPositions) {
        occupiedPositions.add(position);
      }
    });
    positionCursor = finishPosition + tieGroup.length;
  }

  const activePositionFloor = Math.max(positionCursor - 1, activeTeamIds.size);
  for (let position = 1; position <= activePositionFloor; position += 1) {
    if (position <= scoringSettings.scoringPositions) {
      occupiedPositions.add(position);
    }
  }

  const dnpTeamIds = teamIds.filter((teamId) => !pointsByTeamId.has(teamId));
  const vacantPositions = Array.from({ length: scoringSettings.scoringPositions }, (_, idx) => idx + 1).filter(
    (position) => !occupiedPositions.has(position)
  );
  const vacantPointsTotal = vacantPositions.reduce(
    (sum, position) => sum + pointsForCupPosition(position, scoringSettings),
    0
  );
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
    .flatMap<WeeklyCupResultRow>((teamId) => {
      const representativeId = representativeByTeam.get(teamId);
      if (!representativeId) return [];

      const teamPoints = pointsByTeamId.get(teamId);
      const scorerId = activeScorerByTeamId.get(teamId);
      const scorer = scorerId ? playerById.get(scorerId) : null;
      const score = scorerId ? scoreByPlayer.get(scorerId) ?? null : null;
      const didNotFinish = score?.did_not_finish === true;
      const gross = score?.gross_score == null ? null : Number(score.gross_score);
      const net =
        scorer && gross != null
          ? Number((gross - Number(scorer.handicap_index)).toFixed(2))
          : null;

      return [
        {
          player_id: representativeId,
          gross_score: gross,
          net_score: net,
          finish_position: teamPoints?.finishPosition ?? null,
          points_earned: teamPoints?.pointsEarned ?? 0,
          did_not_finish: didNotFinish,
        },
      ];
    });
}
