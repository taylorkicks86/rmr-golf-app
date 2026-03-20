export const CUP_TEAM_COUNT = 10 as const;

export const CUP_POINTS_TABLE = [
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

export type CupWeeklyTeamPoint = {
  finishPosition: number | null;
  pointsEarned: number;
};

export function pointsForCupPosition(position: number): number {
  if (position < 1 || position > CUP_POINTS_TABLE.length) return 0;
  return CUP_POINTS_TABLE[position - 1] ?? 0;
}

export function allocateCupWeeklyTeamPoints(params: {
  allTeamIds: string[];
  rankedTeamIds: string[];
}): {
  pointsByTeamId: Map<string, CupWeeklyTeamPoint>;
  dnpTeamIds: string[];
  dnpPoints: number;
  vacantPositions: number[];
} {
  const { allTeamIds, rankedTeamIds } = params;

  if (CUP_POINTS_TABLE.length !== CUP_TEAM_COUNT) {
    throw new Error("CUP_POINTS_TABLE length must match CUP_TEAM_COUNT.");
  }

  const uniqueAllTeamIds: string[] = [];
  const allTeamIdSet = new Set<string>();
  allTeamIds.forEach((teamId) => {
    if (!allTeamIdSet.has(teamId)) {
      allTeamIdSet.add(teamId);
      uniqueAllTeamIds.push(teamId);
    }
  });

  if (uniqueAllTeamIds.length > CUP_TEAM_COUNT) {
    throw new Error("Cannot score more teams than CUP_TEAM_COUNT.");
  }

  const uniqueRankedTeamIds: string[] = [];
  const rankedSet = new Set<string>();
  rankedTeamIds.forEach((teamId) => {
    if (allTeamIdSet.has(teamId) && !rankedSet.has(teamId)) {
      rankedSet.add(teamId);
      uniqueRankedTeamIds.push(teamId);
    }
  });

  if (uniqueRankedTeamIds.length > CUP_TEAM_COUNT) {
    throw new Error("Cannot rank more teams than CUP_TEAM_COUNT.");
  }

  const pointsByTeamId = new Map<string, CupWeeklyTeamPoint>();
  uniqueRankedTeamIds.forEach((teamId, index) => {
    const finishPosition = index + 1;
    pointsByTeamId.set(teamId, {
      finishPosition,
      pointsEarned: pointsForCupPosition(finishPosition),
    });
  });

  const occupiedPositions = new Set(
    Array.from(pointsByTeamId.values()).map((row) => row.finishPosition).filter((value): value is number => value != null)
  );
  const vacantPositions = Array.from({ length: CUP_TEAM_COUNT }, (_, index) => index + 1).filter(
    (position) => !occupiedPositions.has(position)
  );

  const dnpTeamIds = uniqueAllTeamIds.filter((teamId) => !pointsByTeamId.has(teamId));
  const vacantPointsTotal = vacantPositions.reduce((sum, position) => sum + pointsForCupPosition(position), 0);
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
