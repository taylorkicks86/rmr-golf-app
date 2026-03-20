type SupabaseLike = any;

export type CourseConfig = {
  id: string;
  name: string;
  tee_name: string;
  rating: number | null;
  slope: number | null;
};

export type WeekCourseHole = {
  hole_number: number;
  par: number;
  stroke_index: number;
  yards: number | null;
  side: "front" | "back";
  course_name: string;
  tee_name: string;
  rating: number | null;
  slope: number | null;
};

export type WeekCourseContext =
  | {
      status: "ok";
      week_id: string;
      side_to_play: "front" | "back";
      course_config_id: string;
      course_name: string;
      tee_name: string;
      rating: number | null;
      slope: number | null;
      holes: WeekCourseHole[];
    }
  | {
      status: "not_found";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

type LeagueWeekRow = {
  id: string;
  side_to_play: "front" | "back";
  course_config_id: string | null;
};

type CourseConfigRow = {
  id: string;
  name: string;
  tee_name: string;
  rating: number | null;
  slope: number | null;
};

type CourseHoleRow = {
  hole_number: number;
  par: number;
  stroke_index: number;
  yards: number | null;
  side: "front" | "back";
};

async function resolveWeekCourse(params: {
  supabase: SupabaseLike;
  weekId: string;
}): Promise<{
  week: LeagueWeekRow | null;
  course: CourseConfigRow | null;
  error: string | null;
}> {
  const { supabase, weekId } = params;

  const { data: weekData, error: weekError } = await supabase
    .from("league_weeks")
    .select("id, side_to_play, course_config_id")
    .eq("id", weekId)
    .maybeSingle();

  if (weekError) {
    return { week: null, course: null, error: weekError.message };
  }

  const week = (weekData as LeagueWeekRow | null) ?? null;
  if (!week) {
    return { week: null, course: null, error: null };
  }

  let courseId = week.course_config_id;
  if (!courseId) {
    const { data: defaultCourseData, error: defaultCourseError } = await supabase
      .from("course_configs")
      .select("id, name, tee_name, rating, slope")
      .eq("is_default", true)
      .maybeSingle();

    if (defaultCourseError) {
      return { week: null, course: null, error: defaultCourseError.message };
    }

    const defaultCourse = (defaultCourseData as CourseConfigRow | null) ?? null;
    if (!defaultCourse) {
      return { week, course: null, error: null };
    }

    courseId = defaultCourse.id;
    const { error: weekUpdateError } = await supabase
      .from("league_weeks")
      .update({ course_config_id: courseId })
      .eq("id", week.id);

    if (weekUpdateError) {
      return { week: null, course: null, error: weekUpdateError.message };
    }

    return {
      week: { ...week, course_config_id: courseId },
      course: defaultCourse,
      error: null,
    };
  }

  const { data: courseData, error: courseError } = await supabase
    .from("course_configs")
    .select("id, name, tee_name, rating, slope")
    .eq("id", courseId)
    .maybeSingle();

  if (courseError) {
    return { week: null, course: null, error: courseError.message };
  }

  return {
    week,
    course: (courseData as CourseConfigRow | null) ?? null,
    error: null,
  };
}

export async function getActiveWeekHolesForWeek(params: {
  supabase: SupabaseLike;
  weekId: string;
}): Promise<WeekCourseContext> {
  const { supabase, weekId } = params;

  const resolved = await resolveWeekCourse({ supabase, weekId });
  if (resolved.error) {
    return { status: "error", message: resolved.error };
  }
  if (!resolved.week) {
    return { status: "not_found", message: "League week not found." };
  }
  if (!resolved.course || !resolved.week.course_config_id) {
    return { status: "not_found", message: "Course configuration was not found for this week." };
  }

  const { data: holesData, error: holesError } = await supabase
    .from("course_holes")
    .select("hole_number, par, stroke_index, yards, side")
    .eq("course_config_id", resolved.week.course_config_id)
    .eq("side", resolved.week.side_to_play)
    .order("hole_number", { ascending: true });

  if (holesError) {
    return { status: "error", message: holesError.message };
  }

  const holes = ((holesData as CourseHoleRow[] | null) ?? []).map((hole) => ({
    hole_number: hole.hole_number,
    par: hole.par,
    stroke_index: hole.stroke_index,
    yards: hole.yards,
    side: hole.side,
    course_name: resolved.course!.name,
    tee_name: resolved.course!.tee_name,
    rating: resolved.course!.rating,
    slope: resolved.course!.slope,
  }));

  return {
    status: "ok",
    week_id: resolved.week.id,
    side_to_play: resolved.week.side_to_play,
    course_config_id: resolved.week.course_config_id,
    course_name: resolved.course.name,
    tee_name: resolved.course.tee_name,
    rating: resolved.course.rating,
    slope: resolved.course.slope,
    holes,
  };
}

export async function getActiveWeekHolesForDashboardSelection(params: {
  supabase: SupabaseLike;
}): Promise<WeekCourseContext> {
  const { supabase } = params;
  const { data: appStateData, error: appStateError } = await supabase
    .from("league_app_state")
    .select("current_dashboard_week_id")
    .eq("singleton_key", true)
    .maybeSingle();

  if (appStateError) {
    return { status: "error", message: appStateError.message };
  }

  const weekId =
    (appStateData as { current_dashboard_week_id: string | null } | null)?.current_dashboard_week_id ?? null;
  if (!weekId) {
    return { status: "not_found", message: "No dashboard week is selected." };
  }

  return getActiveWeekHolesForWeek({ supabase, weekId });
}
