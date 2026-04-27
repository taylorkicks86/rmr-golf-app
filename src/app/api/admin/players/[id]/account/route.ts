import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  createOrFindAuthUser,
  isValidAccountEmail,
  isValidAccountPassword,
  normalizeAccountEmail,
} from "../../account-utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type CreateAccountBody = {
  password?: string;
};

async function getAdminContext() {
  const serverSupabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await serverSupabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized.", status: 401 as const };
  }

  const { data: currentPlayer, error: currentPlayerError } = await serverSupabase
    .from("players")
    .select("id, is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (currentPlayerError || !currentPlayer?.id || !currentPlayer.is_admin) {
    return { error: "Admin access required.", status: 403 as const };
  }

  return { error: null, status: null };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: targetPlayerId } = await context.params;
  if (!targetPlayerId) {
    return NextResponse.json({ error: "Missing player id." }, { status: 400 });
  }

  const adminContext = await getAdminContext();
  if (adminContext.error) {
    return NextResponse.json({ error: adminContext.error }, { status: adminContext.status ?? 500 });
  }

  const body = (await request.json().catch(() => null)) as CreateAccountBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isValidAccountPassword(body.password)) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY for admin account creation." },
      { status: 500 }
    );
  }

  const serviceSupabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: player, error: playerError } = await serviceSupabase
    .from("players")
    .select("id, full_name, email, ghin, handicap_index, is_admin, is_approved, cup, auth_user_id")
    .eq("id", targetPlayerId)
    .maybeSingle();

  if (playerError) {
    return NextResponse.json({ error: playerError.message }, { status: 500 });
  }

  if (!player?.id) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  if (player.auth_user_id) {
    return NextResponse.json({ error: "This player already has a linked account." }, { status: 400 });
  }

  const email = normalizeAccountEmail(player.email);
  if (!email || !isValidAccountEmail(email)) {
    return NextResponse.json({ error: "Player must have a valid email before creating an account." }, { status: 400 });
  }

  const authResult = await createOrFindAuthUser({
    supabase: serviceSupabase,
    email,
    password: body.password,
  });

  if (authResult.error || !authResult.user?.id) {
    return NextResponse.json({ error: authResult.error ?? "Failed to create auth account." }, { status: 500 });
  }

  const { data: updatedPlayer, error: updateError } = await serviceSupabase
    .from("players")
    .update({ auth_user_id: authResult.user.id })
    .eq("id", targetPlayerId)
    .is("auth_user_id", null)
    .select("id, full_name, email, ghin, handicap_index, is_admin, is_approved, cup, auth_user_id")
    .maybeSingle();

  if (updateError) {
    if (authResult.created) {
      await serviceSupabase.auth.admin.deleteUser(authResult.user.id);
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!updatedPlayer) {
    if (authResult.created) {
      await serviceSupabase.auth.admin.deleteUser(authResult.user.id);
    }
    return NextResponse.json(
      { error: "Account was created, but the player was linked elsewhere before it could be attached." },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    player: updatedPlayer,
    message: authResult.created ? "Account created and linked." : "Existing account linked.",
  });
}
