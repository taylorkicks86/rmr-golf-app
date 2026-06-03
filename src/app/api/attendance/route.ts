import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { getCupTeamPlayingConflict } from "@/lib/cup-team-playing-guard";
import { resolvePlayerProfileForUser } from "@/lib/player-profile";
import { createClient as createServerClient } from "@/lib/supabase/server";

type UpdateBody = {
  weekId: string;
  playingThisWeek: boolean | null;
};

type Season = {
  id: string;
};

type LeagueWeek = {
  id: string;
  season_id: string;
  is_finalized: boolean;
};

type ParticipationSnapshot = {
  playing_this_week: boolean | null;
  attendance_status: string | null;
  cup: boolean | null;
};

function getRequestIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    (forwardedFor ? forwardedFor.split(",")[0]?.trim() ?? null : null)
  );
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body || typeof body.weekId !== "string" || ![true, false, null].includes(body.playingThisWeek)) {
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

  const { data: activeSeasonData, error: activeSeasonError } = await supabase
    .from("seasons")
    .select("id")
    .order("is_active", { ascending: false })
    .order("year", { ascending: false })
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeSeasonError) {
    return NextResponse.json({ error: activeSeasonError.message }, { status: 500 });
  }

  const activeSeason = (activeSeasonData as Season | null) ?? null;
  if (!activeSeason) {
    return NextResponse.json({ error: "No active season found." }, { status: 400 });
  }

  const { data: weekData, error: weekError } = await supabase
    .from("league_weeks")
    .select("id, season_id, is_finalized")
    .eq("id", body.weekId)
    .maybeSingle();

  if (weekError || !weekData) {
    return NextResponse.json({ error: "Week not found." }, { status: 400 });
  }

  const week = weekData as LeagueWeek;
  if (week.season_id !== activeSeason.id) {
    return NextResponse.json({ error: "Week is not part of the active season." }, { status: 400 });
  }
  if (week.is_finalized) {
    return NextResponse.json({ error: "Finalized weeks are read-only." }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY for attendance updates." },
      { status: 500 }
    );
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: actorPlayer } = await serviceSupabase
    .from("players")
    .select("id, is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const { data: previousData } = await serviceSupabase
    .from("weekly_participation")
    .select("playing_this_week, attendance_status, cup")
    .eq("league_week_id", body.weekId)
    .eq("player_id", playerId)
    .maybeSingle();
  const previous = previousData as ParticipationSnapshot | null;

  const isCupPlayer = Boolean((playerData as { cup: boolean }).cup);
  let persistedCup = isCupPlayer && body.playingThisWeek === true;
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
      persistedCup = false;
    }
  }

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
    .select("playing_this_week, attendance_status, cup")
    .single();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const persisted = upserted as ParticipationSnapshot;
  const actor = actorPlayer as { id?: string; is_admin?: boolean } | null;
  const { error: auditError } = await serviceSupabase.from("rsvp_events").insert({
    player_id: playerId,
    league_week_id: body.weekId,
    choice: body.playingThisWeek === true ? "yes" : body.playingThisWeek === false ? "no" : null,
    event_source: "attendance_page",
    result: "success",
    requested_playing_this_week: body.playingThisWeek,
    previous_playing_this_week: previous?.playing_this_week ?? null,
    previous_attendance_status: previous?.attendance_status ?? null,
    previous_cup: previous?.cup ?? null,
    persisted_playing_this_week: persisted.playing_this_week,
    persisted_attendance_status: persisted.attendance_status,
    persisted_cup: persisted.cup,
    user_agent: request.headers.get("user-agent"),
    ip_address: getRequestIp(request),
    actor_user_id: user.id,
    actor_player_id: actor?.id ?? null,
    actor_role: actor?.is_admin === true ? "admin" : "self",
  });
  if (auditError) {
    console.error("Failed to log attendance page event:", auditError.message);
  }

  return NextResponse.json({
    success: true,
    playing_this_week: persisted.playing_this_week,
    cup: persisted.cup,
  });
}
