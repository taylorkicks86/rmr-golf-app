export type SeasonDateRange = {
  start_date: string;
  end_date: string;
};

export type SeasonWeek = {
  week_date: string;
  status?: "open" | "finalized" | "cancelled" | "rained_out" | null;
};

export function isWeekWithinSeasonDates<TWeek extends Pick<SeasonWeek, "week_date">>(
  week: TWeek,
  season: SeasonDateRange | null | undefined
) {
  if (!season) return true;
  return week.week_date >= season.start_date && week.week_date <= season.end_date;
}

export function isPlayableSeasonWeek<TWeek extends SeasonWeek>(
  week: TWeek,
  season: SeasonDateRange | null | undefined
) {
  return isWeekWithinSeasonDates(week, season) && week.status !== "cancelled";
}

export function filterWeeksWithinSeasonDates<TWeek extends Pick<SeasonWeek, "week_date">>(
  weeks: TWeek[],
  season: SeasonDateRange | null | undefined
) {
  return weeks.filter((week) => isWeekWithinSeasonDates(week, season));
}
