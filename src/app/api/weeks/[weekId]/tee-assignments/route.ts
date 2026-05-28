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
      .select("player_id, playing_this_week, cup")
      .eq("league_week_id", weekId)
      .in("playing_this_week", [true, false]),
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

  const participationRows =
    (participationRes.data as
      | { player_id: string; playing_this_week: boolean | null; cup: boolean | null }[]
      | null) ?? [];
  const activePlayerIds = new Set(
    participationRows.filter((row) => row.playing_this_week === true).map((row) => row.player_id)
  );
  const notPlayingPlayerIds = new Set(
    participationRows.filter((row) => row.playing_this_week === false).map((row) => row.player_id)
  );
  const cupPlayerIds = new Set(
    participationRows.filter((row) => row.cup === true).map((row) => row.player_id)
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

  const visiblePlayerIds = Array.from(new Set([...activePlayerIds, ...notPlayingPlayerIds]));
  const playerNamesById = new Map<string, string>();
  const playerHandicapsById = new Map<string, number | null>();

  if (visiblePlayerIds.length > 0) {
    const [playersRes, weeklyHandicapsRes] = await Promise.all([
      serviceSupabase
        .from("players")
        .select("id, full_name")
        .in("id", visiblePlayerIds),
      serviceSupabase
        .from("weekly_handicaps")
        .select("player_id, course_handicap")
        .eq("league_week_id", weekId)
        .in("player_id", visiblePlayerIds),
    ]);

    if (playersRes.error) {
      return NextResponse.json({ error: playersRes.error.message }, { status: 500 });
    }
    if (weeklyHandicapsRes.error) {
      return NextResponse.json({ error: weeklyHandicapsRes.error.message }, { status: 500 });
    }

    const weeklyHandicapsById = new Map(
      (
        (weeklyHandicapsRes.data as
          | { player_id: string; course_handicap: number | null }[]
          | null) ?? []
      ).map((row) => [row.player_id, row.course_handicap])
    );

    (
      ((playersRes.data as
        | { id: string; full_name: string }[]
        | null) ?? [])
    ).forEach((player) => {
      playerNamesById.set(player.id, player.full_name);
      playerHandicapsById.set(player.id, weeklyHandicapsById.get(player.id) ?? null);
    });
  }

  return NextResponse.json({
    assignments: assignments.map((row) => ({
      ...row,
      player_name: playerNamesById.get(row.player_id) ?? "",
      handicap: playerHandicapsById.get(row.player_id) ?? null,
      cup: cupPlayerIds.has(row.player_id),
    })),
    playingPlayers: Array.from(activePlayerIds).map((playerId) => ({
      player_id: playerId,
      player_name: playerNamesById.get(playerId) ?? "",
      handicap: playerHandicapsById.get(playerId) ?? null,
      cup: cupPlayerIds.has(playerId),
    })),
    notPlayingPlayers: Array.from(notPlayingPlayerIds).map((playerId) => ({
      player_id: playerId,
      player_name: playerNamesById.get(playerId) ?? "",
      handicap: playerHandicapsById.get(playerId) ?? null,
      cup: cupPlayerIds.has(playerId),
    })),
  });
}
