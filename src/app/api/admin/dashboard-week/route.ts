import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { createClient as createServerClient } from "@/lib/supabase/server";

type UpdateBody = {
  weekId: string | null;
  sideToPlay: "front" | "back";
  courseConfigId: string | null;
};

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (
    !body ||
    (body.weekId !== null && typeof body.weekId !== "string") ||
    (body.sideToPlay !== "front" && body.sideToPlay !== "back") ||
    (body.courseConfigId !== null && typeof body.courseConfigId !== "string")
  ) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: currentPlayer, error: playerError } = await supabase
    .from("players")
    .select("id, is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (playerError || !currentPlayer?.id || !currentPlayer.is_admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  if (body.weekId) {
    const { data: week, error: weekError } = await supabase
      .from("league_weeks")
      .select("id, course_config_id")
      .eq("id", body.weekId)
      .maybeSingle();

    if (weekError || !week) {
      return NextResponse.json({ error: "Selected week was not found." }, { status: 400 });
    }
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY for admin updates." },
      { status: 500 }
    );
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  let resolvedCourseConfigId = body.courseConfigId;

  if (body.weekId && !resolvedCourseConfigId) {
    const { data: defaultCourseConfig, error: defaultCourseConfigError } = await supabase
      .from("course_configs")
      .select("id")
      .eq("is_default", true)
      .maybeSingle();

    if (defaultCourseConfigError) {
      return NextResponse.json({ error: defaultCourseConfigError.message }, { status: 500 });
    }

    if (!defaultCourseConfig?.id) {
      return NextResponse.json({ error: "No default course configuration found." }, { status: 400 });
    }

    resolvedCourseConfigId = defaultCourseConfig.id;
  }

  if (resolvedCourseConfigId) {
    const { data: courseConfig, error: courseConfigError } = await supabase
      .from("course_configs")
      .select("id")
      .eq("id", resolvedCourseConfigId)
      .maybeSingle();

    if (courseConfigError || !courseConfig) {
      return NextResponse.json({ error: "Selected course configuration was not found." }, { status: 400 });
    }
  }

  if (body.weekId) {
    const { error: sideUpdateError } = await serviceSupabase
      .from("league_weeks")
      .update({
        side_to_play: body.sideToPlay,
        course_config_id: resolvedCourseConfigId,
      })
      .eq("id", body.weekId);

    if (sideUpdateError) {
      return NextResponse.json({ error: sideUpdateError.message }, { status: 500 });
    }
  }

  const { error: upsertError } = await serviceSupabase
    .from("league_app_state")
    .upsert(
      {
        singleton_key: true,
        current_dashboard_week_id: body.weekId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "singleton_key" }
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    current_dashboard_week_id: body.weekId,
    side_to_play: body.sideToPlay,
    course_config_id: resolvedCourseConfigId,
  });
}
