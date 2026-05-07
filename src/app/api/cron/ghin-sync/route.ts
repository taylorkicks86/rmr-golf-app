import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { syncGhinHandicaps } from "@/lib/ghin-sync";

function getServiceSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function getCurrentDashboardWeekId(supabase: ReturnType<typeof getServiceSupabase>) {
  const { data, error } = await supabase
    .from("league_app_state")
    .select("current_dashboard_week_id")
    .eq("singleton_key", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as { current_dashboard_week_id: string | null } | null)?.current_dashboard_week_id ?? null;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase();
    const weekId = await getCurrentDashboardWeekId(supabase);
    const result = await syncGhinHandicaps({ supabase, weekId });

    return NextResponse.json(result);
  } catch (syncError) {
    return NextResponse.json(
      { error: syncError instanceof Error ? syncError.message : "GHIN cron sync failed." },
      { status: 500 }
    );
  }
}
