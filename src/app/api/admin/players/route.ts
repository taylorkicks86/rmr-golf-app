import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { createClient as createServerClient } from "@/lib/supabase/server";

type CreateBody = {
  full_name?: string;
  email?: string;
  ghin?: string;
  handicap_index?: number | string;
  handicap?: number | string;
  is_admin?: boolean;
  is_approved?: boolean;
  approved?: boolean;
  cup?: boolean;
  cup_player?: boolean;
  cup_team_id?: string | null;
};

async function getAdminContext() {
  const serverSupabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await serverSupabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized.", status: 401 as const };
  }

  const { data: currentPlayer, error: currentPlayerError } = await serverSupabase
    .from("players")
    .select("id, is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (currentPlayerError || !currentPlayer?.id || !currentPlayer.is_admin) {
    return { error: "Admin access required.", status: 403 as const };
  }

  return { error: null, status: null };
}

function parseHandicap(value: number | string | undefined): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }
  return null;
}

function normalizeEmail(value: string | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function getActiveSeasonId(serviceSupabase: any) {
  const { data: season, error } = await serviceSupabase
    .from("seasons")
    .select("id")
    .order("is_active", { ascending: false })
    .order("year", { ascending: false })
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { seasonId: null as string | null, error: error.message };
  }

  return { seasonId: (season as { id: string } | null)?.id ?? null, error: null as string | null };
}

export async function POST(request: NextRequest) {
  const adminContext = await getAdminContext();
  if (adminContext.error) {
    return NextResponse.json({ error: adminContext.error }, { status: adminContext.status ?? 500 });
  }

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY for admin updates." },
      { status: 500 }
    );
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = normalizeEmail(body.email);
  const ghin = typeof body.ghin === "string" ? body.ghin.trim() : "";
  const handicap = parseHandicap(body.handicap_index ?? body.handicap);
  const nextIsAdmin = typeof body.is_admin === "boolean" ? body.is_admin : false;
  const nextIsApproved =
    typeof body.is_approved === "boolean"
      ? body.is_approved
      : typeof body.approved === "boolean"
        ? body.approved
        : false;
  const nextCupPlayer =
    typeof body.cup === "boolean"
      ? body.cup
      : typeof body.cup_player === "boolean"
        ? body.cup_player
        : false;
  const requestedCupTeamId =
    typeof body.cup_team_id === "string" ? body.cup_team_id.trim() || null : body.cup_team_id ?? null;

  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Email must be a valid email address." }, { status: 400 });
  }

  if (!ghin) {
    return NextResponse.json({ error: "GHIN is required." }, { status: 400 });
  }

  if (handicap == null || handicap < 0 || handicap > 54) {
    return NextResponse.json({ error: "Handicap must be a number between 0 and 54." }, { status: 400 });
  }

  const { data: createdPlayer, error: createError } = await serviceSupabase
    .from("players")
    .insert({
      auth_user_id: null,
      full_name: fullName,
      email,
      ghin,
      handicap_index: Number(handicap.toFixed(1)),
      is_admin: nextIsAdmin,
      is_approved: nextIsApproved,
      cup: nextCupPlayer,
    })
    .select("id, full_name, email, ghin, handicap_index, is_admin, is_approved, cup")
    .single();

  if (createError || !createdPlayer) {
    return NextResponse.json({ error: createError?.message ?? "Failed to create player." }, { status: 500 });
  }

  const targetPlayerId = (createdPlayer as { id: string }).id;
  const { seasonId, error: activeSeasonError } = await getActiveSeasonId(serviceSupabase);
  if (activeSeasonError) {
    return NextResponse.json({ error: activeSeasonError }, { status: 500 });
  }

  if (nextCupPlayer && !seasonId) {
    return NextResponse.json({ error: "No active season found for Cup team assignment." }, { status: 400 });
  }

  let cupTeamId: string | null = null;
  let cupTeamName: string | null = null;

  if (nextCupPlayer && seasonId) {
    let targetCupTeamId = requestedCupTeamId;

    if (targetCupTeamId) {
      const { data: team, error: teamError } = await serviceSupabase
        .from("cup_teams")
        .select("id, season_id, name")
        .eq("id", targetCupTeamId)
        .maybeSingle();

      if (teamError) {
        return NextResponse.json({ error: teamError.message }, { status: 500 });
      }
      if (!team || (team as { season_id: string }).season_id !== seasonId) {
        return NextResponse.json({ error: "Selected Cup team is invalid for the active season." }, { status: 400 });
      }

      const { count: memberCount, error: countError } = await serviceSupabase
        .from("cup_team_members")
        .select("id", { count: "exact", head: true })
        .eq("cup_team_id", targetCupTeamId)
        .eq("season_id", seasonId);

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }

      if (Number(count ?? 0) >= 2) {
        return NextResponse.json(
          { error: "Cup team already has 2 members. Choose another team." },
          { status: 400 }
        );
      }

      cupTeamName = (team as { name: string }).name;
    } else {
      const { data: nameMatchedTeams, error: nameMatchError } = await serviceSupabase
        .from("cup_teams")
        .select("id, name")
        .eq("season_id", seasonId)
        .eq("name", fullName);

      if (nameMatchError) {
        return NextResponse.json({ error: nameMatchError.message }, { status: 500 });
      }

      const candidateTeams = (nameMatchedTeams as { id: string; name: string }[] | null) ?? [];
      for (const candidate of candidateTeams) {
        const { count } = await serviceSupabase
          .from("cup_team_members")
          .select("id", { count: "exact", head: true })
          .eq("cup_team_id", candidate.id)
          .eq("season_id", seasonId);
        if (Number(count ?? 0) < 2) {
          targetCupTeamId = candidate.id;
          cupTeamName = candidate.name;
          break;
        }
      }

      if (!targetCupTeamId) {
        const { data: createdTeam, error: createTeamError } = await serviceSupabase
          .from("cup_teams")
          .insert({
            season_id: seasonId,
            name: fullName,
          })
          .select("id, name")
          .single();

        if (createTeamError || !createdTeam) {
          return NextResponse.json(
            { error: createTeamError?.message ?? "Failed to create Cup team." },
            { status: 500 }
          );
        }

        targetCupTeamId = (createdTeam as { id: string }).id;
        cupTeamName = (createdTeam as { name: string }).name;
      }
    }

    if (!targetCupTeamId) {
      return NextResponse.json({ error: "Unable to resolve Cup team assignment." }, { status: 400 });
    }

    const { error: createMembershipError } = await serviceSupabase.from("cup_team_members").insert({
      cup_team_id: targetCupTeamId,
      player_id: targetPlayerId,
      season_id: seasonId,
    });

    if (createMembershipError) {
      return NextResponse.json({ error: createMembershipError.message }, { status: 500 });
    }

    cupTeamId = targetCupTeamId;
  }

  return NextResponse.json({
    success: true,
    player: {
      ...(createdPlayer as Record<string, unknown>),
      cup_team_id: cupTeamId,
      cup_team_name: cupTeamName,
    },
    message: "Player created.",
  });
}
