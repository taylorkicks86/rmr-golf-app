import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { getActiveWeekHolesForWeek } from "@/lib/week-course";
import { resolveWeekDropdownState } from "@/lib/getDashboardWeek";
import { resolvePlayerProfileForUser } from "@/lib/player-profile";
import { createClient } from "@/lib/supabase/server";

type LeagueWeek = {
  id: string;
  week_number: number;
  week_date: string;
  is_finalized: boolean;
};

type ParticipationRecord = {
  player_id: string;
};

type HoleScoreRecord = {
  player_id: string;
  hole_number: number;
  strokes: number;
};

type WeeklyScoreRecord = {
  player_id: string;
  gross_score: number;
  is_scorecard_signed: boolean;
  scorecard_signed_at: string | null;
};

type WeeklyHandicapRecord = {
  player_id: string;
  final_computed_handicap: number;
};

type Player = {
  id: string;
  full_name: string;
  handicap_index: number;
};

type TeeAssignmentRecord = {
  player_id: string;
  tee_time: string;
  group_number: number | null;
  position_in_group: number | null;
};

function buildEmptyHoles(): string[] {
  return Array.from({ length: 9 }, () => "");
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const playerResolution = await resolvePlayerProfileForUser({
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
  });

  if (playerResolution.status !== "resolved") {
    return NextResponse.json(
      { error: playerResolution.status === "not_found" ? "Player profile not found." : playerResolution.message },
      { status: 403 }
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY for score entry reads." },
      { status: 500 }
    );
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const requestedWeekId = request.nextUrl.searchParams.get("weekId") ?? "";

  const { data: seasonData, error: seasonError } = await serviceSupabase
    .from("seasons")
    .select("id")
    .order("is_active", { ascending: false })
    .order("year", { ascending: false })
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (seasonError) {
    return NextResponse.json({ error: seasonError.message }, { status: 500 });
  }

  const seasonId = (seasonData as { id: string } | null)?.id ?? null;
  if (!seasonId) {
    return NextResponse.json({
      currentPlayerId: playerResolution.player.id,
      currentPlayerIsAdmin: playerResolution.player.is_admin,
      weeks: [],
      selectedWeekId: "",
      rows: [],
      teeAssignments: [],
      activeHoles: [],
      activePlayerCount: 0,
      holeScoreRowCount: 0,
    });
  }

  const { data: weekData, error: weeksError } = await serviceSupabase
    .from("league_weeks")
    .select("id, week_number, week_date, is_finalized")
    .eq("season_id", seasonId)
    .order("week_number", { ascending: true });

  if (weeksError) {
    return NextResponse.json({ error: weeksError.message }, { status: 500 });
  }

  const allWeeks = (weekData as LeagueWeek[] | null) ?? [];
  const fallbackWeekId =
    allWeeks.find((week) => !week.is_finalized)?.id ??
    allWeeks[allWeeks.length - 1]?.id ??
    "";
  const { filteredWeeks, initialWeekId } = await resolveWeekDropdownState({
    supabase: serviceSupabase,
    weeks: allWeeks,
    fallbackWeekId,
  });
  const selectedWeekId =
    requestedWeekId && filteredWeeks.some((week) => week.id === requestedWeekId)
      ? requestedWeekId
      : initialWeekId;

  if (!selectedWeekId) {
    return NextResponse.json({
      currentPlayerId: playerResolution.player.id,
      currentPlayerIsAdmin: playerResolution.player.is_admin,
      weeks: filteredWeeks,
      selectedWeekId: "",
      rows: [],
      teeAssignments: [],
      activeHoles: [],
      activePlayerCount: 0,
      holeScoreRowCount: 0,
    });
  }

  const [participationRes, holeScoresRes, scoresRes, teeAssignmentsRes, activeHolesResult] =
    await Promise.all([
      serviceSupabase
        .from("weekly_participation")
        .select("player_id")
        .eq("league_week_id", selectedWeekId)
        .eq("playing_this_week", true),
      serviceSupabase
        .from("hole_scores")
        .select("player_id, hole_number, strokes")
        .eq("league_week_id", selectedWeekId),
      serviceSupabase
        .from("weekly_scores")
        .select("player_id, gross_score, is_scorecard_signed, scorecard_signed_at")
        .eq("league_week_id", selectedWeekId),
      serviceSupabase
        .from("weekly_tee_times")
        .select("player_id, tee_time, group_number, position_in_group")
        .eq("week_id", selectedWeekId),
      getActiveWeekHolesForWeek({ supabase: serviceSupabase, weekId: selectedWeekId }),
    ]);

  if (participationRes.error) {
    return NextResponse.json({ error: participationRes.error.message }, { status: 500 });
  }
  if (holeScoresRes.error) {
    return NextResponse.json({ error: holeScoresRes.error.message }, { status: 500 });
  }
  if (scoresRes.error) {
    return NextResponse.json({ error: scoresRes.error.message }, { status: 500 });
  }
  if (teeAssignmentsRes.error) {
    return NextResponse.json({ error: teeAssignmentsRes.error.message }, { status: 500 });
  }

  const participation = (participationRes.data as ParticipationRecord[] | null) ?? [];
  const activePlayerIds = new Set(participation.map((record) => record.player_id));
  const orderedActivePlayerIds = Array.from(activePlayerIds);
  const holeScores = (holeScoresRes.data as HoleScoreRecord[] | null) ?? [];
  const scores = (scoresRes.data as WeeklyScoreRecord[] | null) ?? [];
  const teeAssignments =
    ((teeAssignmentsRes.data as TeeAssignmentRecord[] | null) ?? []).filter((assignment) =>
      activePlayerIds.has(assignment.player_id)
    );

  let rows: Array<{
    player: Player;
    holes: string[];
    existingGross: number | null;
    isScorecardSigned: boolean;
    scorecardSignedAt: string | null;
  }> = [];

  if (orderedActivePlayerIds.length > 0) {
    const [playersRes, weeklyHandicapsRes] = await Promise.all([
      serviceSupabase
        .from("players")
        .select("id, full_name, handicap_index")
        .in("id", orderedActivePlayerIds)
        .order("full_name"),
      serviceSupabase
        .from("weekly_handicaps")
        .select("player_id, final_computed_handicap")
        .eq("league_week_id", selectedWeekId)
        .in("player_id", orderedActivePlayerIds),
    ]);

    if (playersRes.error) {
      return NextResponse.json({ error: playersRes.error.message }, { status: 500 });
    }
    if (weeklyHandicapsRes.error) {
      return NextResponse.json({ error: weeklyHandicapsRes.error.message }, { status: 500 });
    }

    const weeklyHandicapByPlayerId = new Map(
      (((weeklyHandicapsRes.data as WeeklyHandicapRecord[] | null) ?? []).map((row) => [
        row.player_id,
        Number(row.final_computed_handicap),
      ]))
    );
    const holesByPlayerId = new Map<string, string[]>();
    const grossByPlayerId = new Map(scores.map((record) => [record.player_id, Number(record.gross_score)]));
    const signedByPlayerId = new Map(
      scores.map((record) => [
        record.player_id,
        {
          isSigned: record.is_scorecard_signed === true,
          signedAt: record.scorecard_signed_at ?? null,
        },
      ])
    );

    holeScores.forEach((record) => {
      const existing = holesByPlayerId.get(record.player_id) ?? buildEmptyHoles();
      const holeIndex = Number(record.hole_number) - 1;
      if (holeIndex >= 0 && holeIndex < 9) {
        existing[holeIndex] = String(record.strokes);
      }
      holesByPlayerId.set(record.player_id, existing);
    });

    rows = (((playersRes.data as Player[] | null) ?? [])
      .filter((player) => activePlayerIds.has(player.id))
      .map((player) => ({
        player: {
          ...player,
          handicap_index:
            weeklyHandicapByPlayerId.get(player.id) ??
            Number(player.handicap_index),
        },
        holes: holesByPlayerId.get(player.id) ?? buildEmptyHoles(),
        existingGross: grossByPlayerId.get(player.id) ?? null,
        isScorecardSigned: signedByPlayerId.get(player.id)?.isSigned ?? false,
        scorecardSignedAt: signedByPlayerId.get(player.id)?.signedAt ?? null,
      })));
  }

  return NextResponse.json({
    currentPlayerId: playerResolution.player.id,
    currentPlayerIsAdmin: playerResolution.player.is_admin,
    weeks: filteredWeeks,
    selectedWeekId,
    rows,
    teeAssignments,
    activeHoles: activeHolesResult.status === "ok" ? activeHolesResult.holes : [],
    activePlayerCount: orderedActivePlayerIds.length,
    holeScoreRowCount: holeScores.length,
  });
}
