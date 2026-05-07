import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { syncGhinHandicaps } from "@/lib/ghin-sync";
import { createClient as createServerClient } from "@/lib/supabase/server";

type GhinSyncRequestBody = {
  weekId?: string;
};

function getServiceSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
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

  const body = (await request.json().catch(() => null)) as GhinSyncRequestBody | null;
  const weekId = typeof body?.weekId === "string" && body.weekId.trim() ? body.weekId.trim() : null;

  try {
    const result = await syncGhinHandicaps({
      supabase: getServiceSupabase(),
      weekId,
    });

    return NextResponse.json(result);
  } catch (syncError) {
    return NextResponse.json(
      { error: syncError instanceof Error ? syncError.message : "GHIN sync failed." },
      { status: 500 }
    );
  }
}
