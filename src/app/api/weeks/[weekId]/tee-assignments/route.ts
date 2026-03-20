import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ weekId: string }> }
) {
  const { weekId } = await context.params;
  if (!weekId) {
    return NextResponse.json({ error: "Week id is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY for tee assignment reads." },
      { status: 500 }
    );
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const [participationRes, teeTimesRes] = await Promise.all([
    serviceSupabase
      .from("weekly_participation")
      .select("player_id")
      .eq("league_week_id", weekId)
      .eq("playing_this_week", true),
    serviceSupabase
      .from("weekly_tee_times")
      .select("player_id, tee_time, group_number, position_in_group")
      .eq("week_id", weekId),
  ]);

  if (participationRes.error) {
    return NextResponse.json({ error: participationRes.error.message }, { status: 500 });
  }
  if (teeTimesRes.error) {
    return NextResponse.json({ error: teeTimesRes.error.message }, { status: 500 });
  }

  const activePlayerIds = new Set(
    (((participationRes.data as { player_id: string }[] | null) ?? []).map((row) => row.player_id))
  );
  const assignments =
    ((teeTimesRes.data as
      | {
          player_id: string;
          tee_time: string;
          group_number: number | null;
          position_in_group: number | null;
        }[]
      | null) ?? []
    ).filter((row) => activePlayerIds.has(row.player_id));

  return NextResponse.json({ assignments });
}
