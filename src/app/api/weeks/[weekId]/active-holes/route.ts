import { NextRequest, NextResponse } from "next/server";

import { getActiveWeekHolesForWeek } from "@/lib/week-course";
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

  const result = await getActiveWeekHolesForWeek({ supabase, weekId });
  if (result.status === "error") {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }
  if (result.status === "not_found") {
    return NextResponse.json({ error: result.message }, { status: 404 });
  }

  return NextResponse.json({
    week_id: result.week_id,
    side_to_play: result.side_to_play,
    course_name: result.course_name,
    tee_name: result.tee_name,
    rating: result.rating,
    slope: result.slope,
    holes: result.holes,
  });
}
