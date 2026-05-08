import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { pauseResendBatch, sendResendEmailWithRetry, shouldPauseResendBatch } from "@/lib/resend-email";
import { buildTeeSheetEmail } from "@/lib/rsvp-email";
import { createClient as createServerClient } from "@/lib/supabase/server";

type TeeSheetEmailRequestBody = {
  weekId: string;
};

type LeagueWeek = {
  id: string;
  week_number: number;
  week_date: string;
  play_date: string | null;
  side_to_play: "front" | "back";
  status: "open" | "finalized" | "cancelled" | "rained_out";
  tee_sheet_published: boolean;
};

type Player = {
  id: string;
  full_name: string;
  email: string;
  auth_user_id: string | null;
};

type ParticipationRecord = {
  player_id: string;
};

type TeeTimeRecord = {
  player_id: string;
  tee_time: string;
  group_number: number | null;
  position_in_group: number | null;
};

type SendResult = {
  playerId: string;
  playerName: string;
  email: string;
  status: "sent" | "failed";
  message?: string;
};

const FROM_EMAIL = "RMR Golf <no-reply@rmrgolf.com>";

function getServiceSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isValidEmail(email: string | null | undefined): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isPlaceholderEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith("@import-2025.test") || normalized.endsWith("@rmrtest.com");
}

async function resolveSendEmail(supabase: ReturnType<typeof getServiceSupabase>, player: Player) {
  if (isValidEmail(player.email) && !isPlaceholderEmail(player.email)) {
    return player.email.trim().toLowerCase();
  }

  if (!player.auth_user_id) {
    return null;
  }

  const { data, error } = await supabase.auth.admin.getUserById(player.auth_user_id);
  if (error) {
    return null;
  }

  const authEmail = data.user?.email ?? null;
  return isValidEmail(authEmail) && !isPlaceholderEmail(authEmail) ? authEmail.trim().toLowerCase() : null;
}

function getSiteUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin)
  ).replace(/\/$/, "");
}

function formatWeekLabel(week: LeagueWeek): string {
  const rawDate = week.play_date ?? week.week_date;
  const [yearText, monthText, dayText] = rawDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date =
    Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
          timeZone: "UTC",
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : rawDate;
  return `${date} · ${week.side_to_play === "front" ? "Front 9" : "Back 9"}`;
}

function formatTeeTime(rawTime: string): string {
  const [hourText, minuteText] = rawTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return rawTime;
  }

  return new Date(Date.UTC(2000, 0, 1, hour, minute)).toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function assertAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized.", status: 401 as const };
  }

  const { data: currentPlayer, error: playerError } = await supabase
    .from("players")
    .select("id, is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (playerError || !currentPlayer?.id || !currentPlayer.is_admin) {
    return { error: "Admin access required.", status: 403 as const };
  }

  return { error: null, status: null };
}

export async function POST(request: NextRequest) {
  const admin = await assertAdmin();
  if (admin.error) {
    return NextResponse.json({ error: admin.error }, { status: admin.status ?? 500 });
  }

  const body = (await request.json().catch(() => null)) as TeeSheetEmailRequestBody | null;
  if (!body || typeof body.weekId !== "string") {
    return NextResponse.json({ error: "Invalid tee sheet email request." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: weekData, error: weekError } = await supabase
    .from("league_weeks")
    .select("id, week_number, week_date, play_date, side_to_play, status, tee_sheet_published")
    .eq("id", body.weekId)
    .maybeSingle();

  if (weekError) {
    return NextResponse.json({ error: weekError.message }, { status: 500 });
  }
  if (!weekData) {
    return NextResponse.json({ error: "Week not found." }, { status: 404 });
  }

  const week = weekData as LeagueWeek;
  if (!week.tee_sheet_published) {
    return NextResponse.json({ error: "Publish the tee sheet before emailing it." }, { status: 400 });
  }
  if (week.status === "cancelled") {
    return NextResponse.json({ error: "Cannot email a tee sheet for a cancelled week." }, { status: 400 });
  }

  const [{ data: participationData, error: participationError }, { data: teeTimesData, error: teeTimesError }] =
    await Promise.all([
      supabase
        .from("weekly_participation")
        .select("player_id")
        .eq("league_week_id", body.weekId)
        .eq("playing_this_week", true),
      supabase
        .from("weekly_tee_times")
        .select("player_id, tee_time, group_number, position_in_group")
        .eq("week_id", body.weekId),
    ]);

  if (participationError) {
    return NextResponse.json({ error: participationError.message }, { status: 500 });
  }
  if (teeTimesError) {
    return NextResponse.json({ error: teeTimesError.message }, { status: 500 });
  }

  const participation = (participationData as ParticipationRecord[] | null) ?? [];
  const teeTimes = (teeTimesData as TeeTimeRecord[] | null) ?? [];
  const playingPlayerIds = new Set(participation.map((record) => record.player_id));
  const visiblePlayerIds = Array.from(playingPlayerIds);

  if (playingPlayerIds.size === 0) {
    return NextResponse.json({ error: "No players are marked playing this week." }, { status: 400 });
  }
  if (teeTimes.length === 0) {
    return NextResponse.json({ error: "No saved tee sheet assignments found for this week." }, { status: 400 });
  }

  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("id, full_name, email, auth_user_id")
    .in("id", visiblePlayerIds);

  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 500 });
  }

  const players = (playersData as Player[] | null) ?? [];
  const playerById = new Map(players.map((player) => [player.id, player]));
  const assignments = teeTimes
    .filter((assignment) => playingPlayerIds.has(assignment.player_id) && playerById.has(assignment.player_id))
    .sort((a, b) => {
      if (a.tee_time !== b.tee_time) return a.tee_time.localeCompare(b.tee_time);
      const groupA = a.group_number ?? Number.MAX_SAFE_INTEGER;
      const groupB = b.group_number ?? Number.MAX_SAFE_INTEGER;
      if (groupA !== groupB) return groupA - groupB;
      const positionA = a.position_in_group ?? Number.MAX_SAFE_INTEGER;
      const positionB = b.position_in_group ?? Number.MAX_SAFE_INTEGER;
      if (positionA !== positionB) return positionA - positionB;
      return (playerById.get(a.player_id)?.full_name ?? "").localeCompare(
        playerById.get(b.player_id)?.full_name ?? ""
      );
    })
    .map((assignment) => ({
      teeTimeLabel: formatTeeTime(assignment.tee_time),
      groupLabel: assignment.group_number == null ? "Group" : `Group ${assignment.group_number}`,
      playerName: playerById.get(assignment.player_id)?.full_name ?? "Player",
    }));

  if (assignments.length === 0) {
    return NextResponse.json({ error: "No saved tee sheet assignments found for players marked playing." }, { status: 400 });
  }

  const recipients = players
    .filter((player) => playingPlayerIds.has(player.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const weekLabel = formatWeekLabel(week);
  const teeSheetUrl = `${getSiteUrl(request)}/tee-sheet`;
  const subject = `RMR Golf tee sheet: ${weekLabel}`;
  const results: SendResult[] = [];

  let sentInBatch = 0;

  for (const player of recipients) {
    const sendEmail = await resolveSendEmail(supabase, player);
    if (!sendEmail) {
      results.push({
        playerId: player.id,
        playerName: player.full_name,
        email: player.email,
        status: "failed",
        message: "Player does not have a deliverable email address.",
      });
      continue;
    }

    const html = buildTeeSheetEmail({
      playerName: player.full_name,
      weekLabel,
      teeSheetUrl,
      assignments,
    });

    try {
      const resendId = await sendResendEmailWithRetry({ from: FROM_EMAIL, to: sendEmail, subject, html });
      results.push({
        playerId: player.id,
        playerName: player.full_name,
        email: sendEmail,
        status: "sent",
        message: resendId ? `Resend id: ${resendId}` : undefined,
      });
    } catch (error) {
      results.push({
        playerId: player.id,
        playerName: player.full_name,
        email: sendEmail,
        status: "failed",
        message: error instanceof Error ? error.message : "Unknown send error.",
      });
    }

    sentInBatch += 1;
    if (shouldPauseResendBatch(sentInBatch)) {
      await pauseResendBatch();
      sentInBatch = 0;
    }
  }

  return NextResponse.json({
    success: results.every((result) => result.status !== "failed"),
    week: {
      id: week.id,
      label: weekLabel,
      status: week.status,
      teeSheetPublished: week.tee_sheet_published,
    },
    totalRecipients: recipients.length,
    sent: results.filter((result) => result.status === "sent").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  });
}
