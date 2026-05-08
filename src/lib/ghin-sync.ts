import { computeFinalComputedHandicap, computeNineHoleCourseHandicap } from "@/lib/weekly-handicap";

type SupabaseLike = any;

type Player = {
  id: string;
  full_name: string;
  ghin: string | null;
  handicap_index: number;
  paid: boolean;
};

type GhinLoginResponse = {
  golfer_user?: {
    golfer_user_token?: string;
  };
  token?: string;
  jwt?: string;
};

type GhinGolfer = {
  handicap_index?: string | number | null;
  display?: string | number | null;
};

export type GhinSyncResult = {
  playerId: string;
  playerName: string;
  ghin: string;
  status: "updated" | "unchanged" | "failed";
  previousHandicapIndex?: number;
  handicapIndex?: number;
  message?: string;
};

export type GhinSyncResponse = {
  success: boolean;
  total: number;
  updated: number;
  unchanged: number;
  failed: number;
  results: GhinSyncResult[];
};

type WeekCourseRow = {
  id: string;
  side_to_play: "front" | "back";
  course_config_id: string | null;
};

type CourseConfigRow = {
  id: string;
  front_rating: number | null;
  front_slope: number | null;
  front_par: number | null;
  back_rating: number | null;
  back_slope: number | null;
  back_par: number | null;
};

function getGhinCredentials() {
  const emailOrGhin = process.env.GHIN_EMAIL ?? process.env.GHIN_USERNAME ?? "";
  const password = process.env.GHIN_PASSWORD ?? "";

  if (!emailOrGhin || !password) {
    throw new Error("Server is missing GHIN_EMAIL/GHIN_USERNAME or GHIN_PASSWORD.");
  }

  return { emailOrGhin, password };
}

async function loginToGhin() {
  const { emailOrGhin, password } = getGhinCredentials();
  const payload = {
    user: {
      email_or_ghin: emailOrGhin,
      password,
      remember_me: "true",
    },
    token: "rmr-golf",
  };

  const endpoints = [
    "https://api.ghin.com/api/v1/golfer_login.json",
    "https://api2.ghin.com/api/v1/golfer_login.json",
  ];

  let lastError = "GHIN login failed.";
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = (await response.json().catch(() => null)) as
      | GhinLoginResponse
      | { errors?: unknown }
      | null;
    const token =
      (body as GhinLoginResponse | null)?.golfer_user?.golfer_user_token ??
      (body as GhinLoginResponse | null)?.token ??
      (body as GhinLoginResponse | null)?.jwt ??
      null;

    if (response.ok && token) {
      return token;
    }

    lastError =
      typeof body === "object" && body && "errors" in body
        ? `GHIN login failed: ${JSON.stringify(body.errors)}`
        : `GHIN login failed with status ${response.status}.`;
  }

  throw new Error(lastError);
}

function parseHandicapIndex(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value <= 54 ? Number(value.toFixed(1)) : null;
  }

  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.toUpperCase() === "NH") return null;

  const parsed = Number(normalized.replace(/^\+/, ""));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 54 ? Number(parsed.toFixed(1)) : null;
}

async function fetchGhinHandicapIndex(ghin: string, token: string) {
  const params = new URLSearchParams({
    per_page: "1",
    page: "1",
    golfer_id: ghin,
    sorting_criteria: "id",
    order: "ASC",
    status: "Active",
  });
  const response = await fetch(`https://api.ghin.com/api/v1/golfers/search.json?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const body = (await response.json().catch(() => null)) as
    | { golfers?: GhinGolfer[]; errors?: unknown }
    | null;
  if (!response.ok) {
    const message =
      body?.errors != null
        ? `GHIN lookup failed: ${JSON.stringify(body.errors)}`
        : `GHIN lookup failed with status ${response.status}.`;
    throw new Error(message);
  }

  const golfer = body?.golfers?.[0] ?? null;
  if (!golfer) {
    throw new Error("No active GHIN golfer was found.");
  }

  const handicapIndex = parseHandicapIndex(golfer.handicap_index ?? golfer.display);
  if (handicapIndex == null) {
    throw new Error("GHIN returned no usable handicap index.");
  }

  return handicapIndex;
}

async function resolveWeekCourse(params: {
  supabase: SupabaseLike;
  weekId: string;
}): Promise<{
  week: WeekCourseRow | null;
  course: CourseConfigRow | null;
  leagueHandicapPercent: number;
  handicapCap: number | null;
}> {
  const { supabase, weekId } = params;

  const [weekRes, settingsRes] = await Promise.all([
    supabase
      .from("league_weeks")
      .select("id, side_to_play, course_config_id")
      .eq("id", weekId)
      .maybeSingle(),
    supabase
      .from("league_week_settings")
      .select("league_handicap_percent, handicap_cap")
      .eq("league_week_id", weekId)
      .maybeSingle(),
  ]);

  if (weekRes.error) throw new Error(weekRes.error.message);
  if (settingsRes.error) throw new Error(settingsRes.error.message);

  const week = (weekRes.data as WeekCourseRow | null) ?? null;
  if (!week) {
    return { week: null, course: null, leagueHandicapPercent: 80, handicapCap: null };
  }

  let courseId = week.course_config_id;
  let course: CourseConfigRow | null = null;

  if (courseId) {
    const { data, error } = await supabase
      .from("course_configs")
      .select("id, front_rating, front_slope, front_par, back_rating, back_slope, back_par")
      .eq("id", courseId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    course = (data as CourseConfigRow | null) ?? null;
  }

  if (!course) {
    const { data, error } = await supabase
      .from("course_configs")
      .select("id, front_rating, front_slope, front_par, back_rating, back_slope, back_par")
      .eq("is_default", true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    course = (data as CourseConfigRow | null) ?? null;
    courseId = course?.id ?? courseId;
  }

  return {
    week: courseId ? { ...week, course_config_id: courseId } : week,
    course,
    leagueHandicapPercent: Number(
      (settingsRes.data as { league_handicap_percent: number } | null)?.league_handicap_percent ?? 80
    ),
    handicapCap:
      (settingsRes.data as { handicap_cap?: number | null } | null)?.handicap_cap ?? null,
  };
}

function getSideCourseValues(week: WeekCourseRow, course: CourseConfigRow | null) {
  if (week.side_to_play === "back") {
    return {
      rating: course?.back_rating ?? null,
      slope: course?.back_slope ?? null,
      par: course?.back_par ?? null,
    };
  }

  return {
    rating: course?.front_rating ?? null,
    slope: course?.front_slope ?? null,
    par: course?.front_par ?? null,
  };
}

function applyCourseHandicapCap(courseHandicap: number, handicapCap: number | null): number {
  if (handicapCap == null || !Number.isFinite(handicapCap)) {
    return courseHandicap;
  }

  return Math.min(courseHandicap, Math.round(handicapCap));
}

async function syncSelectedWeekHandicapIndexes(params: {
  supabase: SupabaseLike;
  weekId: string;
  results: GhinSyncResult[];
}) {
  const { supabase, weekId, results } = params;
  const successfulResults = results.filter(
    (result): result is GhinSyncResult & { handicapIndex: number } =>
      (result.status === "updated" || result.status === "unchanged") && typeof result.handicapIndex === "number"
  );

  if (successfulResults.length === 0) return;

  const { week, course, leagueHandicapPercent, handicapCap } = await resolveWeekCourse({ supabase, weekId });
  if (!week) throw new Error("League week not found.");

  const playerIds = successfulResults.map((result) => result.playerId);
  const { data, error } = await supabase
    .from("weekly_handicaps")
    .select("player_id")
    .eq("league_week_id", weekId)
    .in("player_id", playerIds);

  if (error) throw new Error(error.message);

  const existingWeeklyPlayerIds = new Set(
    ((data as Array<{ player_id: string }> | null) ?? []).map((entry) => entry.player_id)
  );
  const sideValues = getSideCourseValues(week, course);

  for (const result of successfulResults) {
    if (!existingWeeklyPlayerIds.has(result.playerId)) continue;

    const courseHandicap = applyCourseHandicapCap(
      computeNineHoleCourseHandicap({
        handicapIndex: result.handicapIndex,
        ...sideValues,
      }),
      handicapCap
    );

    const { error: weeklyUpdateError } = await supabase
      .from("weekly_handicaps")
      .update({
        handicap_index: result.handicapIndex,
        course_handicap: courseHandicap,
        final_computed_handicap: computeFinalComputedHandicap({
          courseHandicap,
          leagueHandicapPercent,
        }),
      })
      .eq("league_week_id", weekId)
      .eq("player_id", result.playerId);

    if (weeklyUpdateError) throw new Error(weeklyUpdateError.message);
  }
}

export async function syncGhinHandicaps(params: {
  supabase: SupabaseLike;
  weekId?: string | null;
}): Promise<GhinSyncResponse> {
  const { supabase, weekId } = params;
  const { data, error } = await supabase
    .from("players")
    .select("id, full_name, ghin, handicap_index, paid")
    .eq("paid", true)
    .not("ghin", "is", null)
    .order("full_name");

  if (error) throw new Error(error.message);

  const players = ((data as Player[] | null) ?? []).filter((player) => String(player.ghin ?? "").trim());
  if (players.length === 0) {
    throw new Error("No paid players have a GHIN value saved.");
  }

  const token = await loginToGhin();
  const results: GhinSyncResult[] = [];

  for (const player of players) {
    const ghin = String(player.ghin ?? "").trim();

    try {
      const handicapIndex = await fetchGhinHandicapIndex(ghin, token);
      const previousHandicapIndex = Number(player.handicap_index);
      const status = Number(previousHandicapIndex.toFixed(1)) === handicapIndex ? "unchanged" : "updated";

      if (status === "updated") {
        const { error: updateError } = await supabase
          .from("players")
          .update({ handicap_index: handicapIndex })
          .eq("id", player.id);

        if (updateError) throw new Error(updateError.message);
      }

      results.push({
        playerId: player.id,
        playerName: player.full_name,
        ghin,
        status,
        previousHandicapIndex,
        handicapIndex,
      });
    } catch (syncError) {
      results.push({
        playerId: player.id,
        playerName: player.full_name,
        ghin,
        status: "failed",
        message: syncError instanceof Error ? syncError.message : "Unknown GHIN sync error.",
      });
    }
  }

  if (weekId) {
    await syncSelectedWeekHandicapIndexes({ supabase, weekId, results });
  }

  const updated = results.filter((result) => result.status === "updated").length;
  const unchanged = results.filter((result) => result.status === "unchanged").length;
  const failed = results.filter((result) => result.status === "failed").length;

  return {
    success: failed === 0,
    total: results.length,
    updated,
    unchanged,
    failed,
    results,
  };
}
