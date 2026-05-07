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

export function computeNineHoleCourseHandicap(params: {
  handicapIndex: number;
  rating: number | null;
  slope: number | null;
  par: number | null;
}): number {
  const handicapIndex = Number.isFinite(params.handicapIndex) ? params.handicapIndex : 0;

  if (
    params.rating == null ||
    params.slope == null ||
    params.par == null ||
    !Number.isFinite(params.rating) ||
    !Number.isFinite(params.slope) ||
    !Number.isFinite(params.par)
  ) {
    console.warn("Missing 9-hole course rating/slope/par; falling back to half handicap index.");
    return Math.round(handicapIndex / 2);
  }

  const nineHoleIndex = Number((handicapIndex / 2).toFixed(1));
  const courseHandicap = (nineHoleIndex * params.slope) / 113 + (params.rating - params.par);
  return Math.round(courseHandicap);
}
