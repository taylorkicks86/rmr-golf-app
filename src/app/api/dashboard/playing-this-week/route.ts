import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { getCupTeamPlayingConflict } from "@/lib/cup-team-playing-guard";
import { resolvePlayerProfileForUser } from "@/lib/player-profile";
import { createClient as createServerClient } from "@/lib/supabase/server";

type UpdateBody = {
  weekId: string;
  playingThisWeek: boolean | null;
  cup: boolean;
};

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (
    !body ||
    typeof body.weekId !== "string" ||
    ![true, false, null].includes(body.playingThisWeek) ||
    typeof body.cup !== "boolean"
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

  const playerResolution = await resolvePlayerProfileForUser({
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
  });

  if (playerResolution.status !== "resolved") {
    const message =
      playerResolution.status === "error" || playerResolution.status === "conflict"
        ? playerResolution.message
        : "Player profile not found.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const playerId = playerResolution.player.id;
  const { data: playerData, error: playerError } = await supabase
    .from("players")
    .select("id, cup")
    .eq("id", playerId)
    .maybeSingle();

  if (playerError || !playerData) {
    return NextResponse.json({ error: playerError?.message ?? "Player not found." }, { status: 400 });
  }

  const { data: appStateData, error: appStateError } = await supabase
    .from("league_app_state")
    .select("current_dashboard_week_id")
    .eq("singleton_key", true)
    .maybeSingle();

  if (appStateError) {
    return NextResponse.json({ error: appStateError.message }, { status: 500 });
  }

  const currentDashboardWeekId = (appStateData as { current_dashboard_week_id: string | null } | null)
    ?.current_dashboard_week_id;
  if (currentDashboardWeekId && currentDashboardWeekId !== body.weekId) {
    return NextResponse.json(
      { error: "This dashboard week changed. Refresh and try again." },
      { status: 409 }
    );
  }

  const { data: weekData, error: weekError } = await supabase
    .from("league_weeks")
    .select("id, is_finalized")
    .eq("id", body.weekId)
    .maybeSingle();

  if (weekError || !weekData) {
    return NextResponse.json({ error: "Week not found." }, { status: 400 });
  }

  if ((weekData as { is_finalized: boolean }).is_finalized) {
    return NextResponse.json({ error: "Finalized weeks are read-only." }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY for player updates." },
      { status: 500 }
    );
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const isCupPlayer = Boolean((playerData as { cup: boolean }).cup);
  if (body.playingThisWeek === true && isCupPlayer) {
    const conflictCheck = await getCupTeamPlayingConflict({
      supabase: serviceSupabase,
      leagueWeekId: body.weekId,
      playerId,
    });
    if (conflictCheck.error) {
      return NextResponse.json({ error: conflictCheck.error }, { status: 500 });
    }
    if (conflictCheck.hasConflict) {
      return NextResponse.json(
        { error: "Only one member of a 2-player Cup team can be marked playing for this week." },
        { status: 400 }
      );
    }
  }

  const persistedCup = isCupPlayer && body.playingThisWeek === true ? body.cup : false;
  const attendanceStatus =
    body.playingThisWeek === true ? "playing" : body.playingThisWeek === false ? "not_playing" : "no_response";

  const { data: upserted, error: upsertError } = await serviceSupabase
    .from("weekly_participation")
    .upsert(
      {
        league_week_id: body.weekId,
        player_id: playerId,
        playing_this_week: body.playingThisWeek,
        cup: persistedCup,
        attendance_status: attendanceStatus,
      },
      { onConflict: "league_week_id,player_id" }
    )
    .select("playing_this_week, cup")
    .single();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    playing_this_week: (upserted as { playing_this_week: boolean | null }).playing_this_week,
    cup: (upserted as { cup: boolean }).cup,
  });
}
