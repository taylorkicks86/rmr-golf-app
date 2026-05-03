import { NextRequest, NextResponse } from "next/server";

import {
  DEFAULT_CUP_SCORING_SETTINGS,
  type CupScoringSettings,
  normalizeCupScoringSettings,
} from "@/lib/cup-scoring";
import { createClient as createServerClient } from "@/lib/supabase/server";

type CupScoringSettingsRecord = {
  season_id: string;
  scoring_positions: number;
  points_by_position: number[];
};

async function assertAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { supabase, error: "Unauthorized.", status: 401 as const };
  }

  const { data: currentPlayer, error: playerError } = await supabase
    .from("players")
    .select("id, is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (playerError || !currentPlayer?.id || !currentPlayer.is_admin) {
    return { supabase, error: "Admin access required.", status: 403 as const };
  }

  return { supabase, error: null, status: null };
}

function toResponseSettings(record: CupScoringSettingsRecord | null | undefined): CupScoringSettings & { seasonId?: string } {
  const settings = normalizeCupScoringSettings(
    record
      ? {
          scoringPositions: record.scoring_positions,
          pointsByPosition: record.points_by_position,
        }
      : DEFAULT_CUP_SCORING_SETTINGS
  );
  return {
    ...settings,
    seasonId: record?.season_id,
  };
}

async function resolveSeasonId(supabase: Awaited<ReturnType<typeof createServerClient>>, requestedSeasonId: string | null) {
  if (requestedSeasonId) {
    return requestedSeasonId;
  }

  const { data, error } = await supabase
    .from("seasons")
    .select("id")
    .order("is_active", { ascending: false })
    .order("year", { ascending: false })
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

export async function GET(request: NextRequest) {
  const admin = await assertAdmin();
  if (admin.error) {
    return NextResponse.json({ error: admin.error }, { status: admin.status ?? 500 });
  }

  const requestedSeasonId = request.nextUrl.searchParams.get("seasonId");
  let seasonId: string | null = null;
  try {
    seasonId = await resolveSeasonId(admin.supabase, requestedSeasonId);
  } catch (seasonError) {
    const message = seasonError instanceof Error ? seasonError.message : "Failed to load season.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!seasonId) {
    return NextResponse.json({ error: "Create a season before editing scoring settings." }, { status: 400 });
  }

  const { data, error } = await admin.supabase
    .from("cup_scoring_settings")
    .select("season_id, scoring_positions, points_by_position")
    .eq("season_id", seasonId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data) {
    return NextResponse.json(toResponseSettings(data as CupScoringSettingsRecord | null));
  }

  const settings = normalizeCupScoringSettings(DEFAULT_CUP_SCORING_SETTINGS);
  const { data: inserted, error: insertError } = await admin.supabase
    .from("cup_scoring_settings")
    .insert({
      season_id: seasonId,
      scoring_positions: settings.scoringPositions,
      points_by_position: settings.pointsByPosition,
    })
    .select("season_id, scoring_positions, points_by_position")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(toResponseSettings(inserted as CupScoringSettingsRecord));
}

export async function PATCH(request: NextRequest) {
  const admin = await assertAdmin();
  if (admin.error) {
    return NextResponse.json({ error: admin.error }, { status: admin.status ?? 500 });
  }

  const body = (await request.json().catch(() => null)) as (Partial<CupScoringSettings> & { seasonId?: string }) | null;
  if (!body) {
    return NextResponse.json({ error: "Scoring settings are required." }, { status: 400 });
  }

  const seasonId = body.seasonId?.trim();
  if (!seasonId) {
    return NextResponse.json({ error: "Choose a season for these scoring settings." }, { status: 400 });
  }

  const scoringPositions = Number(body.scoringPositions);
  const pointsByPosition = body.pointsByPosition;
  if (
    !Number.isInteger(scoringPositions) ||
    scoringPositions < 1 ||
    scoringPositions > 20 ||
    !Array.isArray(pointsByPosition) ||
    pointsByPosition.length < scoringPositions
  ) {
    return NextResponse.json({ error: "Enter 1-20 scoring positions with one point value per position." }, { status: 400 });
  }

  const settings = normalizeCupScoringSettings({
    scoringPositions,
    pointsByPosition,
  });

  const { data, error } = await admin.supabase
    .from("cup_scoring_settings")
    .upsert(
      {
        season_id: seasonId,
        scoring_positions: settings.scoringPositions,
        points_by_position: settings.pointsByPosition,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "season_id" }
    )
    .select("season_id, scoring_positions, points_by_position")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(toResponseSettings(data as CupScoringSettingsRecord));
}
