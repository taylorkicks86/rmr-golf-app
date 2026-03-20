import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "../../auth";

type Context = {
  params: Promise<{ teamId: string }>;
};

type AddMemberBody = {
  playerId?: string;
};

export async function POST(request: NextRequest, context: Context) {
  const auth = await requireAdmin();
  if (auth.error || !auth.serviceSupabase) {
    return NextResponse.json({ error: auth.error }, { status: auth.status ?? 500 });
  }

  const { teamId } = await context.params;
  const body = (await request.json().catch(() => null)) as AddMemberBody | null;
  const playerId = body?.playerId?.trim() ?? "";

  if (!teamId || !playerId) {
    return NextResponse.json({ error: "Team and player are required." }, { status: 400 });
  }

  const { data: team, error: teamError } = await auth.serviceSupabase
    .from("cup_teams")
    .select("id, season_id")
    .eq("id", teamId)
    .maybeSingle();

  if (teamError) {
    return NextResponse.json({ error: teamError.message }, { status: 500 });
  }
  if (!team) {
    return NextResponse.json({ error: "Cup team not found." }, { status: 404 });
  }

  const seasonId = (team as { season_id: string }).season_id;

  const { data: player, error: playerError } = await auth.serviceSupabase
    .from("players")
    .select("id, cup")
    .eq("id", playerId)
    .maybeSingle();

  if (playerError) {
    return NextResponse.json({ error: playerError.message }, { status: 500 });
  }
  if (!player?.id) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }
  if (!(player as { cup: boolean }).cup) {
    return NextResponse.json({ error: "Player must be marked as a Cup player first." }, { status: 400 });
  }

  const { count: teamMemberCount, error: teamCountError } = await auth.serviceSupabase
    .from("cup_team_members")
    .select("id", { count: "exact", head: true })
    .eq("cup_team_id", teamId)
    .eq("season_id", seasonId);

  if (teamCountError) {
    return NextResponse.json({ error: teamCountError.message }, { status: 500 });
  }

  if (Number(teamMemberCount ?? 0) >= 2) {
    return NextResponse.json({ error: "Cup team already has 2 members." }, { status: 400 });
  }

  const { data: existingMembership, error: membershipLookupError } = await auth.serviceSupabase
    .from("cup_team_members")
    .select("id")
    .eq("player_id", playerId)
    .eq("season_id", seasonId)
    .maybeSingle();

  if (membershipLookupError) {
    return NextResponse.json({ error: membershipLookupError.message }, { status: 500 });
  }

  if (existingMembership?.id) {
    return NextResponse.json({ error: "Player is already assigned to a Cup team for this season." }, { status: 400 });
  }

  const { data: createdMember, error: createError } = await auth.serviceSupabase
    .from("cup_team_members")
    .insert({ cup_team_id: teamId, player_id: playerId, season_id: seasonId })
    .select("id, cup_team_id, player_id, season_id")
    .single();

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, member: createdMember, message: "Team member added." });
}
