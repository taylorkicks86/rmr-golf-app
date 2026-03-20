import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "../../auth";

type Context = {
  params: Promise<{ memberId: string }>;
};

export async function DELETE(_request: NextRequest, context: Context) {
  const auth = await requireAdmin();
  if (auth.error || !auth.serviceSupabase) {
    return NextResponse.json({ error: auth.error }, { status: auth.status ?? 500 });
  }

  const { memberId } = await context.params;
  if (!memberId) {
    return NextResponse.json({ error: "Missing member id." }, { status: 400 });
  }

  const { error: deleteError } = await auth.serviceSupabase.from("cup_team_members").delete().eq("id", memberId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deletedMemberId: memberId, message: "Team member removed." });
}
