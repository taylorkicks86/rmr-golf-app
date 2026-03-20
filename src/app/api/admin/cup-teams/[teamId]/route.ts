import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "../auth";

type Context = {
  params: Promise<{ teamId: string }>;
};

type RenameTeamBody = {
  name?: string;
};

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireAdmin();
  if (auth.error || !auth.serviceSupabase) {
    return NextResponse.json({ error: auth.error }, { status: auth.status ?? 500 });
  }

  const { teamId } = await context.params;
  if (!teamId) {
    return NextResponse.json({ error: "Missing team id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as RenameTeamBody | null;
  const name = body?.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "Team name is required." }, { status: 400 });
  }

  const { data: updated, error: updateError } = await auth.serviceSupabase
    .from("cup_teams")
    .update({ name })
    .eq("id", teamId)
    .select("id, name, season_id")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, team: updated, message: "Team name updated." });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const auth = await requireAdmin();
  if (auth.error || !auth.serviceSupabase) {
    return NextResponse.json({ error: auth.error }, { status: auth.status ?? 500 });
  }

  const { teamId } = await context.params;
  if (!teamId) {
    return NextResponse.json({ error: "Missing team id." }, { status: 400 });
  }

  const { count, error: countError } = await auth.serviceSupabase
    .from("cup_team_members")
    .select("id", { count: "exact", head: true })
    .eq("cup_team_id", teamId);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if (Number(count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Remove or reassign all members before deleting this team." },
      { status: 400 }
    );
  }

  const { error: deleteError } = await auth.serviceSupabase.from("cup_teams").delete().eq("id", teamId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deletedTeamId: teamId, message: "Cup team deleted." });
}
