type SupabaseLike = any;

type WeekWithId = {
  id: string;
  is_finalized: boolean;
};

export async function getDashboardWeekId(params: {
  supabase: SupabaseLike;
}): Promise<string | null> {
  const { supabase } = params;
  const { data, error } = await supabase
    .from("league_app_state")
    .select("current_dashboard_week_id")
    .eq("singleton_key", true)
    .maybeSingle();

  if (error) {
    return null;
  }

  return (data as { current_dashboard_week_id: string | null } | null)
    ?.current_dashboard_week_id ?? null;
}

export async function resolveWeekDropdownState<TWeek extends WeekWithId>(params: {
  supabase: SupabaseLike;
  weeks: TWeek[];
  fallbackWeekId: string;
}): Promise<{
  filteredWeeks: TWeek[];
  initialWeekId: string;
}> {
  const { supabase, weeks, fallbackWeekId } = params;
  const dashboardWeekId = await getDashboardWeekId({ supabase });
  const filteredWeeks = weeks.filter(
    (week) => week.is_finalized || week.id === dashboardWeekId
  );
  const hasFallbackInFiltered = filteredWeeks.some(
    (week) => week.id === fallbackWeekId
  );
  const resolvedFallbackWeekId = hasFallbackInFiltered
    ? fallbackWeekId
    : filteredWeeks[0]?.id ?? "";
  const initialWeekId =
    dashboardWeekId && filteredWeeks.some((week) => week.id === dashboardWeekId)
      ? dashboardWeekId
      : resolvedFallbackWeekId;

  return { filteredWeeks, initialWeekId };
}
