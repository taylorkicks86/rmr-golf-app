import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "./auth";

type CreateTeamBody = {
  seasonId?: string;
  name?: string;
};

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error || !auth.serviceSupabase) {
    return NextResponse.json({ error: auth.error }, { status: auth.status ?? 500 });
  }

  const body = (await request.json().catch(() => null)) as CreateTeamBody | null;
  const name = body?.name?.trim() ?? "";
  const seasonId = body?.seasonId?.trim() ?? "";

  if (!name) {
    return NextResponse.json({ error: "Team name is required." }, { status: 400 });
  }
  if (!seasonId) {
    return NextResponse.json({ error: "Season is required." }, { status: 400 });
  }

  const { data: season, error: seasonError } = await auth.serviceSupabase
    .from("seasons")
    .select("id")
    .eq("id", seasonId)
    .maybeSingle();

  if (seasonError) {
    return NextResponse.json({ error: seasonError.message }, { status: 500 });
  }
  if (!season?.id) {
    return NextResponse.json({ error: "Season not found." }, { status: 404 });
  }

  const { data: created, error: createError } = await auth.serviceSupabase
    .from("cup_teams")
    .insert({ season_id: seasonId, name })
    .select("id, name, season_id")
    .single();

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, team: created, message: "Cup team created." });
}
