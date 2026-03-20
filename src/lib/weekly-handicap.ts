export type WeeklyHandicapRecord = {
  player_id: string;
  handicap_index: number;
  course_handicap: number;
  final_computed_handicap: number;
};

export function computeFinalComputedHandicap(params: {
  courseHandicap: number;
  leagueHandicapPercent: number;
}): number {
  const course = Number.isFinite(params.courseHandicap) ? params.courseHandicap : 0;
  const percent = Number.isFinite(params.leagueHandicapPercent)
    ? params.leagueHandicapPercent
    : 0;
  return Math.round((course * percent) / 100);
}
