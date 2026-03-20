export type CupSeasonWeek = {
  id: string;
  week_number: number;
  is_finalized: boolean;
  week_type?: "regular" | "playoff";
  status?: "open" | "finalized" | "cancelled" | "rained_out";
};

export type CupPlayerRow = {
  id: string;
  full_name: string;
  cup: boolean;
};

export type WeeklyCupResultRow = {
  league_week_id: string;
  player_id: string;
  points_earned: number;
};

export type CupStandingRow = {
  playerId: string;
  player: string;
  countedPoints: number;
  totalPoints: number;
  weeksPlayed: number;
  weeksCounted: number;
  droppedWeeks: number;
  weeklyPoints: number[];
  rank: number;
};

export type CupSeasonStandingResult = {
  standings: CupStandingRow[];
  finalizedRegularWeekIds: string[];
  countedWeeksTarget: number;
  cancelledOrRainedOutRegularWeeks: number;
};

function resolveCountedWeeksTarget(cancelledOrRainedOutRegularWeeks: number): number {
  if (cancelledOrRainedOutRegularWeeks >= 3) return 8;
  if (cancelledOrRainedOutRegularWeeks >= 1) return 9;
  return 10;
}

type ComputeParams = {
  weeks: CupSeasonWeek[];
  players: CupPlayerRow[];
  weeklyCupResults: WeeklyCupResultRow[];
  finalizedRegularWeekIdsOverride?: string[];
};

export function computeCupSeasonStandings({
  weeks,
  players,
  weeklyCupResults,
  finalizedRegularWeekIdsOverride,
}: ComputeParams): CupSeasonStandingResult {
  // TODO(cup-playoffs): apply 1-stroke playoff advantage for regular-season winner and runner-up.
  const orderedWeeks = [...weeks].sort((a, b) => a.week_number - b.week_number);
  const regularWeeks = orderedWeeks.filter((week) => (week.week_type ?? "regular") === "regular");

  const cancelledOrRainedOutRegularWeeks = regularWeeks.filter((week) => {
    const status = week.status ?? (week.is_finalized ? "finalized" : "open");
    return status === "cancelled" || status === "rained_out";
  }).length;

  const finalizedRegularWeekIds = finalizedRegularWeekIdsOverride
    ? finalizedRegularWeekIdsOverride
    : regularWeeks
        .filter((week) => {
          const status = week.status ?? (week.is_finalized ? "finalized" : "open");
          return status === "finalized";
        })
        .map((week) => week.id);

  const countedWeeksTarget = resolveCountedWeeksTarget(cancelledOrRainedOutRegularWeeks);
  const finalizedRegularWeekIdSet = new Set(finalizedRegularWeekIds);

  const cupPlayers = players.filter((player) => player.cup);
  const cupPlayerIds = new Set(cupPlayers.map((player) => player.id));

  const pointsByPlayer = new Map<string, number[]>();
  weeklyCupResults
    .filter(
      (row) => cupPlayerIds.has(row.player_id) && finalizedRegularWeekIdSet.has(row.league_week_id)
    )
    .forEach((row) => {
      const existing = pointsByPlayer.get(row.player_id) ?? [];
      existing.push(Number(row.points_earned));
      pointsByPlayer.set(row.player_id, existing);
    });

  const standings = cupPlayers
    .map((player) => {
      const weeklyPoints = [...(pointsByPlayer.get(player.id) ?? [])].sort((a, b) => b - a);
      const counted = weeklyPoints.slice(0, countedWeeksTarget);
      const totalPoints = weeklyPoints.reduce((sum, points) => sum + points, 0);
      const countedPoints = counted.reduce((sum, points) => sum + points, 0);

      return {
        playerId: player.id,
        player: player.full_name,
        countedPoints,
        totalPoints,
        weeksPlayed: weeklyPoints.length,
        weeksCounted: counted.length,
        droppedWeeks: Math.max(0, weeklyPoints.length - counted.length),
        weeklyPoints,
      };
    })
    .sort((a, b) => {
      if (b.countedPoints !== a.countedPoints) return b.countedPoints - a.countedPoints;
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.weeksPlayed !== a.weeksPlayed) return b.weeksPlayed - a.weeksPlayed;
      return a.player.localeCompare(b.player);
    })
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));

  return {
    standings,
    finalizedRegularWeekIds,
    countedWeeksTarget,
    cancelledOrRainedOutRegularWeeks,
  };
}
