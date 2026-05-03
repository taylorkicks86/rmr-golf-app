export const DEFAULT_CUP_SCORING_POSITION_COUNT = 10 as const;
export const MAX_CUP_SCORING_POSITION_COUNT = 20 as const;

export const DEFAULT_CUP_POINTS_TABLE = [
  750,
  600,
  475,
  400,
  350,
  300,
  250,
  200,
  150,
  100,
] as const;

export type CupScoringSettings = {
  scoringPositions: number;
  pointsByPosition: number[];
};

export type CupWeeklyTeamPoint = {
  finishPosition: number | null;
  pointsEarned: number;
};

export const DEFAULT_CUP_SCORING_SETTINGS: CupScoringSettings = {
  scoringPositions: DEFAULT_CUP_SCORING_POSITION_COUNT,
  pointsByPosition: [...DEFAULT_CUP_POINTS_TABLE],
};

export function normalizeCupScoringSettings(value?: Partial<CupScoringSettings> | null): CupScoringSettings {
  const requestedPositions = Number(value?.scoringPositions);
  const scoringPositions =
    Number.isInteger(requestedPositions) &&
    requestedPositions >= 1 &&
    requestedPositions <= MAX_CUP_SCORING_POSITION_COUNT
      ? requestedPositions
      : DEFAULT_CUP_SCORING_POSITION_COUNT;

  const sourcePoints = Array.isArray(value?.pointsByPosition)
    ? value.pointsByPosition
    : DEFAULT_CUP_POINTS_TABLE;
  const pointsByPosition = Array.from({ length: scoringPositions }, (_, index) => {
    const rawPointValue = Number(sourcePoints[index]);
    if (!Number.isFinite(rawPointValue) || rawPointValue < 0) return 0;
    return Math.round(rawPointValue);
  });

  return {
    scoringPositions,
    pointsByPosition,
  };
}

export function pointsForCupPosition(
  position: number,
  settings: CupScoringSettings = DEFAULT_CUP_SCORING_SETTINGS
): number {
  const normalized = normalizeCupScoringSettings(settings);
  if (position < 1 || position > normalized.scoringPositions) return 0;
  return normalized.pointsByPosition[position - 1] ?? 0;
}

export function allocateCupWeeklyTeamPoints(params: {
  allTeamIds: string[];
  rankedTeamIds: string[];
  scoringSettings?: CupScoringSettings;
}): {
  pointsByTeamId: Map<string, CupWeeklyTeamPoint>;
  dnpTeamIds: string[];
  dnpPoints: number;
  vacantPositions: number[];
} {
  const { allTeamIds, rankedTeamIds } = params;
  const scoringSettings = normalizeCupScoringSettings(params.scoringSettings);

  const uniqueAllTeamIds: string[] = [];
  const allTeamIdSet = new Set<string>();
  allTeamIds.forEach((teamId) => {
    if (!allTeamIdSet.has(teamId)) {
      allTeamIdSet.add(teamId);
      uniqueAllTeamIds.push(teamId);
    }
  });

  const uniqueRankedTeamIds: string[] = [];
  const rankedSet = new Set<string>();
  rankedTeamIds.forEach((teamId) => {
    if (allTeamIdSet.has(teamId) && !rankedSet.has(teamId)) {
      rankedSet.add(teamId);
      uniqueRankedTeamIds.push(teamId);
    }
  });

  const pointsByTeamId = new Map<string, CupWeeklyTeamPoint>();
  uniqueRankedTeamIds.forEach((teamId, index) => {
    const finishPosition = index + 1;
    pointsByTeamId.set(teamId, {
      finishPosition,
      pointsEarned: pointsForCupPosition(finishPosition, scoringSettings),
    });
  });

  const occupiedPositions = new Set(
    Array.from(pointsByTeamId.values())
      .map((row) => row.finishPosition)
      .filter(
        (value): value is number =>
          value != null && value >= 1 && value <= scoringSettings.scoringPositions
      )
  );
  const vacantPositions = Array.from({ length: scoringSettings.scoringPositions }, (_, index) => index + 1).filter(
    (position) => !occupiedPositions.has(position)
  );

  const dnpTeamIds = uniqueAllTeamIds.filter((teamId) => !pointsByTeamId.has(teamId));
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

  return {
    pointsByTeamId,
    dnpTeamIds,
    dnpPoints,
    vacantPositions,
  };
}
