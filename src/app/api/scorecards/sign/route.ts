import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

type SignBody = {
  weekId: string;
  playerId: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SignBody | null;
  if (!body?.weekId || !body?.playerId) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: requesterPlayer, error: requesterError } = await supabase
    .from("players")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (requesterError || !requesterPlayer?.id) {
    return NextResponse.json({ error: "Player profile not found." }, { status: 403 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Server missing service role key." }, { status: 500 });
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: week, error: weekError } = await serviceSupabase
    .from("league_weeks")
    .select("id, is_finalized")
    .eq("id", body.weekId)
    .maybeSingle();

  if (weekError || !week?.id) {
    return NextResponse.json({ error: "Week not found." }, { status: 400 });
  }
  if (week.is_finalized) {
    return NextResponse.json({ error: "Finalized weeks are read-only." }, { status: 400 });
  }

  const [requesterTeeRes, targetTeeRes] = await Promise.all([
    serviceSupabase
      .from("weekly_tee_times")
      .select("group_number, tee_time")
      .eq("week_id", body.weekId)
      .eq("player_id", requesterPlayer.id)
      .maybeSingle(),
    serviceSupabase
      .from("weekly_tee_times")
      .select("group_number, tee_time")
      .eq("week_id", body.weekId)
      .eq("player_id", body.playerId)
      .maybeSingle(),
  ]);

  if (requesterTeeRes.error || !requesterTeeRes.data) {
    return NextResponse.json({ error: "You are not assigned to a tee-time group for this week." }, { status: 403 });
  }
  if (targetTeeRes.error || !targetTeeRes.data) {
    return NextResponse.json({ error: "Target player is not assigned to a tee-time group." }, { status: 400 });
  }
  if (
    requesterTeeRes.data.group_number !== targetTeeRes.data.group_number ||
    requesterTeeRes.data.tee_time !== targetTeeRes.data.tee_time
  ) {
    return NextResponse.json({ error: "You can only sign scorecards for your own group." }, { status: 403 });
  }

  const { data: holeScores, error: holeScoresError } = await serviceSupabase
    .from("hole_scores")
    .select("hole_number, strokes")
    .eq("league_week_id", body.weekId)
    .eq("player_id", body.playerId);

  if (holeScoresError) {
    return NextResponse.json({ error: holeScoresError.message }, { status: 500 });
  }

  const entered = (holeScores as { hole_number: number; strokes: number }[] | null) ?? [];
  if (entered.length < 9) {
    return NextResponse.json({ error: "All 9 hole scores must be entered before signing." }, { status: 400 });
  }

  const grossScore = entered.reduce((sum, row) => sum + Number(row.strokes), 0);
  const now = new Date().toISOString();

  const { error: upsertError } = await serviceSupabase
    .from("weekly_scores")
    .upsert(
      {
        league_week_id: body.weekId,
        player_id: body.playerId,
        gross_score: grossScore,
        is_scorecard_signed: true,
        scorecard_signed_at: now,
      },
      { onConflict: "league_week_id,player_id" }
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, signed_at: now });
}
