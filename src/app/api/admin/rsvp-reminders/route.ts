import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { buildRsvpReminderEmail, createRsvpToken } from "@/lib/rsvp-email";
import { createClient as createServerClient } from "@/lib/supabase/server";

type ReminderTargetMode = "undecided" | "all" | "players";

type ReminderRequestBody = {
  weekId: string;
  targetMode?: ReminderTargetMode;
  playerIds?: string[];
  dryRun?: boolean;
};

type Player = {
  id: string;
  full_name: string;
  email: string;
  auth_user_id: string | null;
  is_approved: boolean;
  paid: boolean;
};

type LeagueWeek = {
  id: string;
  week_number: number;
  week_date: string;
  play_date: string | null;
  side_to_play: "front" | "back";
  status: "open" | "finalized" | "cancelled" | "rained_out";
};

type ParticipationRecord = {
  player_id: string;
  playing_this_week: boolean | null;
  attendance_status: "playing" | "not_playing" | "no_response" | null;
};

type SendResult = {
  playerId: string;
  playerName: string;
  email: string;
  status: "sent" | "skipped" | "failed";
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

function getSiteUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin)
  ).replace(/\/$/, "");
}

function getStatusLabel(record: ParticipationRecord | null): string {
  if (record?.playing_this_week === true || record?.attendance_status === "playing") return "yes";
  if (record?.playing_this_week === false || record?.attendance_status === "not_playing") return "no";
  return "undecided";
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

async function sendResendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Server is missing RESEND_API_KEY.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    }),
  });

  const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!response.ok) {
    throw new Error(body?.message ?? "Resend failed to send the email.");
  }

  return body?.id ?? null;
}

export async function POST(request: NextRequest) {
  const admin = await assertAdmin();
  if (admin.error) {
    return NextResponse.json({ error: admin.error }, { status: admin.status ?? 500 });
  }

  const body = (await request.json().catch(() => null)) as ReminderRequestBody | null;
  const targetMode = body?.targetMode ?? "undecided";
  if (
    !body ||
    typeof body.weekId !== "string" ||
    !["undecided", "all", "players"].includes(targetMode) ||
    (targetMode === "players" && (!Array.isArray(body.playerIds) || body.playerIds.length === 0))
  ) {
    return NextResponse.json({ error: "Invalid reminder request." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: weekData, error: weekError } = await supabase
    .from("league_weeks")
    .select("id, week_number, week_date, play_date, side_to_play, status")
    .eq("id", body.weekId)
    .maybeSingle();

  if (weekError) {
    return NextResponse.json({ error: weekError.message }, { status: 500 });
  }
  if (!weekData) {
    return NextResponse.json({ error: "Week not found." }, { status: 404 });
  }

  const week = weekData as LeagueWeek;
  if (week.status === "cancelled") {
    return NextResponse.json({ error: "Cannot send RSVP reminders for a cancelled week." }, { status: 400 });
  }
  if (week.status === "finalized") {
    return NextResponse.json({ error: "Cannot send RSVP reminders for a finalized week." }, { status: 400 });
  }

  const [{ data: playersData, error: playersError }, { data: participationData, error: participationError }] =
    await Promise.all([
      supabase
        .from("players")
        .select("id, full_name, email, auth_user_id, is_approved, paid")
        .eq("is_approved", true)
        .order("paid", { ascending: false })
        .order("full_name"),
      supabase
        .from("weekly_participation")
        .select("player_id, playing_this_week, attendance_status")
        .eq("league_week_id", body.weekId),
    ]);

  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 500 });
  }
  if (participationError) {
    return NextResponse.json({ error: participationError.message }, { status: 500 });
  }

  const players = (playersData as Player[] | null) ?? [];
  const participationByPlayerId = new Map(
    ((participationData as ParticipationRecord[] | null) ?? []).map((record) => [record.player_id, record])
  );
  const selectedPlayerIds = new Set(body.playerIds ?? []);
  const recipients = players.filter((player) => {
    const record = participationByPlayerId.get(player.id) ?? null;
    if (targetMode === "players") return selectedPlayerIds.has(player.id);
    if (targetMode === "all") return true;
    return getStatusLabel(record) === "undecided";
  });

  const weekLabel = formatWeekLabel(week);
  const siteUrl = getSiteUrl(request);
  const subject = `RMR Golf RSVP reminder: ${weekLabel}`;
  const results: SendResult[] = [];

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

    const record = participationByPlayerId.get(player.id) ?? null;
    const yesToken = createRsvpToken({ playerId: player.id, weekId: body.weekId, choice: "yes" });
    const noToken = createRsvpToken({ playerId: player.id, weekId: body.weekId, choice: "no" });
    const yesUrl = `${siteUrl}/rsvp/respond?token=${encodeURIComponent(yesToken)}`;
    const noUrl = `${siteUrl}/rsvp/respond?token=${encodeURIComponent(noToken)}`;
    const html = buildRsvpReminderEmail({
      playerName: player.full_name,
      weekLabel,
      statusLabel: getStatusLabel(record),
      yesUrl,
      noUrl,
    });

    if (body.dryRun) {
      results.push({
        playerId: player.id,
        playerName: player.full_name,
        email: sendEmail,
        status: "skipped",
        message: "Dry run only.",
      });
      continue;
    }

    try {
      const resendId = await sendResendEmail({ to: sendEmail, subject, html });
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
  }

  return NextResponse.json({
    success: results.every((result) => result.status !== "failed"),
    dryRun: body.dryRun === true,
    targetMode,
    week: {
      id: week.id,
      label: weekLabel,
      status: week.status,
    },
    totalRecipients: recipients.length,
    sent: results.filter((result) => result.status === "sent").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  });
}
