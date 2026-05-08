import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { pauseResendBatch, sendResendEmailWithRetry, shouldPauseResendBatch } from "@/lib/resend-email";
import { buildCommissionerEmail } from "@/lib/rsvp-email";
import { createClient as createServerClient } from "@/lib/supabase/server";

type EmailGroupRequestBody = {
  subject: string;
  message: string;
  includePaidMembers?: boolean;
  playerIds?: string[];
};

type Player = {
  id: string;
  full_name: string;
  email: string;
  auth_user_id: string | null;
  is_approved: boolean;
  paid: boolean;
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

  const body = (await request.json().catch(() => null)) as EmailGroupRequestBody | null;
  const subject = body?.subject?.trim() ?? "";
  const message = body?.message?.trim() ?? "";
  const selectedPlayerIds = new Set(body?.playerIds ?? []);

  if (!body || subject.length < 3 || subject.length > 160 || message.length < 3) {
    return NextResponse.json({ error: "Subject and email message are required." }, { status: 400 });
  }

  if (!body.includePaidMembers && selectedPlayerIds.size === 0) {
    return NextResponse.json({ error: "Choose paid members or at least one individual recipient." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("players")
    .select("id, full_name, email, auth_user_id, is_approved, paid")
    .eq("is_approved", true)
    .order("paid", { ascending: false })
    .order("full_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const players = (data as Player[] | null) ?? [];
  const recipients = players.filter(
    (player) => (body.includePaidMembers === true && player.paid) || selectedPlayerIds.has(player.id)
  );

  if (recipients.length === 0) {
    return NextResponse.json({ error: "No approved recipients matched that selection." }, { status: 400 });
  }

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

    const html = buildCommissionerEmail({
      playerName: player.full_name,
      subject,
      message,
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
    } catch (sendError) {
      results.push({
        playerId: player.id,
        playerName: player.full_name,
        email: sendEmail,
        status: "failed",
        message: sendError instanceof Error ? sendError.message : "Unknown send error.",
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
    totalRecipients: recipients.length,
    sent: results.filter((result) => result.status === "sent").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  });
}
