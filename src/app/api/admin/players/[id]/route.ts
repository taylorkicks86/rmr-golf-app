import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { createClient as createServerClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdateBody = {
  full_name?: string;
  ghin?: string;
  handicap_index?: number | string;
  handicap?: number | string;
  is_admin?: boolean;
  is_approved?: boolean;
  approved?: boolean;
  cup?: boolean;
  cup_player?: boolean;
  cup_team_id?: string | null;
  email?: string;
};

function isMissingAuthUserError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("user not found") || lower.includes("no user found");
}

async function getAdminContext() {
  const serverSupabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await serverSupabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized.", status: 401 as const, serverSupabase, currentPlayerId: null };
  }

  const { data: currentPlayer, error: currentPlayerError } = await serverSupabase
    .from("players")
    .select("id, is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (currentPlayerError || !currentPlayer?.id || !currentPlayer.is_admin) {
    return { error: "Admin access required.", status: 403 as const, serverSupabase, currentPlayerId: null };
  }

  return { error: null, status: null, serverSupabase, currentPlayerId: currentPlayer.id as string };
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id: targetPlayerId } = await context.params;
  if (!targetPlayerId) {
    return NextResponse.json({ error: "Missing player id." }, { status: 400 });
  }

  const adminContext = await getAdminContext();
  if (adminContext.error) {
    return NextResponse.json({ error: adminContext.error }, { status: adminContext.status ?? 500 });
  }

  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.email === "string") {
    return NextResponse.json({ error: "Email cannot be edited from this screen." }, { status: 400 });
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

  const { data: existingPlayer, error: existingPlayerError } = await serviceSupabase
    .from("players")
    .select("id, full_name, ghin, handicap_index, is_admin, is_approved, cup")
    .eq("id", targetPlayerId)
    .maybeSingle();

  if (existingPlayerError) {
    return NextResponse.json({ error: existingPlayerError.message }, { status: 500 });
  }

  if (!existingPlayer?.id) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  const fullName =
    typeof body.full_name === "string" ? body.full_name.trim() : String(existingPlayer.full_name ?? "").trim();
  const ghin = typeof body.ghin === "string" ? body.ghin.trim() : String(existingPlayer.ghin ?? "").trim();
  const handicap = parseHandicap(body.handicap_index ?? body.handicap ?? Number(existingPlayer.handicap_index));
  const nextIsAdmin = typeof body.is_admin === "boolean" ? body.is_admin : Boolean(existingPlayer.is_admin);
  const nextIsApproved =
    typeof body.is_approved === "boolean"
      ? body.is_approved
      : typeof body.approved === "boolean"
        ? body.approved
        : Boolean(existingPlayer.is_approved);
  const nextCupPlayer =
    typeof body.cup === "boolean"
      ? body.cup
      : typeof body.cup_player === "boolean"
        ? body.cup_player
        : Boolean((existingPlayer as { cup?: boolean }).cup);
  const requestedCupTeamId =
    typeof body.cup_team_id === "string" ? body.cup_team_id.trim() || null : body.cup_team_id ?? null;

  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }

  if (!ghin) {
    return NextResponse.json({ error: "GHIN is required." }, { status: 400 });
  }

  if (handicap == null || handicap < 0 || handicap > 54) {
    return NextResponse.json({ error: "Handicap must be a number between 0 and 54." }, { status: 400 });
  }

  if (adminContext.currentPlayerId === targetPlayerId && nextIsAdmin === false) {
    return NextResponse.json({ error: "You cannot remove your own admin access." }, { status: 400 });
  }

  const { data: updatedPlayer, error: updateError } = await serviceSupabase
    .from("players")
    .update({
      full_name: fullName,
      ghin,
      handicap_index: Number(handicap.toFixed(1)),
      is_admin: nextIsAdmin,
      is_approved: nextIsApproved,
      cup: nextCupPlayer,
    })
    .eq("id", targetPlayerId)
    .select("id, full_name, email, ghin, handicap_index, is_admin, is_approved, cup")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { seasonId, error: activeSeasonError } = await getActiveSeasonId(serviceSupabase);
  if (activeSeasonError) {
    return NextResponse.json({ error: activeSeasonError }, { status: 500 });
  }

  if (nextCupPlayer && !seasonId) {
    return NextResponse.json({ error: "No active season found for Cup team assignment." }, { status: 400 });
  }

  if (nextCupPlayer && seasonId) {
    const { data: existingMembership, error: membershipError } = await serviceSupabase
      .from("cup_team_members")
      .select("id, cup_team_id, season_id")
      .eq("player_id", targetPlayerId)
      .eq("season_id", seasonId)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    let targetCupTeamId = requestedCupTeamId;

    if (targetCupTeamId) {
      const { data: team, error: teamError } = await serviceSupabase
        .from("cup_teams")
        .select("id, season_id")
        .eq("id", targetCupTeamId)
        .maybeSingle();

      if (teamError) {
        return NextResponse.json({ error: teamError.message }, { status: 500 });
      }
      if (!team || (team as { season_id: string }).season_id !== seasonId) {
        return NextResponse.json({ error: "Selected Cup team is invalid for the active season." }, { status: 400 });
      }
    } else if (existingMembership?.cup_team_id) {
      targetCupTeamId = existingMembership.cup_team_id as string;
    } else {
      const { data: nameMatchedTeams, error: nameMatchError } = await serviceSupabase
        .from("cup_teams")
        .select("id, name")
        .eq("season_id", seasonId)
        .eq("name", fullName);

      if (nameMatchError) {
        return NextResponse.json({ error: nameMatchError.message }, { status: 500 });
      }

      const candidateTeams = (nameMatchedTeams as { id: string }[] | null) ?? [];
      for (const candidate of candidateTeams) {
        const { count } = await serviceSupabase
          .from("cup_team_members")
          .select("id", { count: "exact", head: true })
          .eq("cup_team_id", candidate.id)
          .eq("season_id", seasonId);
        if (Number(count ?? 0) < 2) {
          targetCupTeamId = candidate.id;
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
          .select("id")
          .single();

        if (createTeamError) {
          return NextResponse.json({ error: createTeamError.message }, { status: 500 });
        }
        targetCupTeamId = (createdTeam as { id: string }).id;
      }
    }

    if (!targetCupTeamId) {
      return NextResponse.json({ error: "Unable to resolve Cup team assignment." }, { status: 400 });
    }

    const { count: memberCount, error: countError } = await serviceSupabase
      .from("cup_team_members")
      .select("id", { count: "exact", head: true })
      .eq("cup_team_id", targetCupTeamId)
      .eq("season_id", seasonId);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const currentTeamId = (existingMembership as { cup_team_id?: string } | null)?.cup_team_id ?? null;
    const movingTeams = currentTeamId && currentTeamId !== targetCupTeamId;
    const addingNewMember = !currentTeamId;
    const projectedCount = Number(memberCount ?? 0) + (addingNewMember ? 1 : movingTeams ? 1 : 0);
    if (projectedCount > 2) {
      return NextResponse.json(
        { error: "Cup team already has 2 members. Choose another team." },
        { status: 400 }
      );
    }

    if (existingMembership?.id) {
      const { error: updateMembershipError } = await serviceSupabase
        .from("cup_team_members")
        .update({ cup_team_id: targetCupTeamId })
        .eq("id", existingMembership.id as string);

      if (updateMembershipError) {
        return NextResponse.json({ error: updateMembershipError.message }, { status: 500 });
      }
    } else {
      const { error: createMembershipError } = await serviceSupabase.from("cup_team_members").insert({
        cup_team_id: targetCupTeamId,
        player_id: targetPlayerId,
        season_id: seasonId,
      });

      if (createMembershipError) {
        return NextResponse.json({ error: createMembershipError.message }, { status: 500 });
      }
    }

    if (!requestedCupTeamId) {
      const { data: targetTeam } = await serviceSupabase
        .from("cup_teams")
        .select("id, name")
        .eq("id", targetCupTeamId)
        .maybeSingle();

      const { count: currentTeamMemberCount } = await serviceSupabase
        .from("cup_team_members")
        .select("id", { count: "exact", head: true })
        .eq("cup_team_id", targetCupTeamId)
        .eq("season_id", seasonId);

      const teamName = (targetTeam as { name?: string } | null)?.name ?? "";
      const oldName = String(existingPlayer.full_name ?? "");
      const shouldSyncName =
        Number(currentTeamMemberCount ?? 0) === 1 && (teamName === oldName || teamName === fullName);

      if (shouldSyncName && teamName !== fullName) {
        await serviceSupabase.from("cup_teams").update({ name: fullName }).eq("id", targetCupTeamId);
      }
    }
  }

  let cupTeamId: string | null = null;
  let cupTeamName: string | null = null;
  if (seasonId) {
    const { data: membership } = await serviceSupabase
      .from("cup_team_members")
      .select("cup_team_id")
      .eq("player_id", targetPlayerId)
      .eq("season_id", seasonId)
      .maybeSingle();
    cupTeamId = (membership as { cup_team_id: string } | null)?.cup_team_id ?? null;

    if (cupTeamId) {
      const { data: team } = await serviceSupabase
        .from("cup_teams")
        .select("name")
        .eq("id", cupTeamId)
        .maybeSingle();
      cupTeamName = (team as { name: string } | null)?.name ?? null;
    }
  }

  return NextResponse.json({
    success: true,
    player: {
      ...(updatedPlayer as Record<string, unknown>),
      cup_team_id: cupTeamId,
      cup_team_name: cupTeamName,
    },
    message: "Player updated.",
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id: targetPlayerId } = await context.params;

  if (!targetPlayerId) {
    return NextResponse.json({ error: "Missing player id." }, { status: 400 });
  }

  const adminContext = await getAdminContext();
  if (adminContext.error) {
    return NextResponse.json({ error: adminContext.error }, { status: adminContext.status ?? 500 });
  }

  const { currentPlayerId } = adminContext;
  if (currentPlayerId === targetPlayerId) {
    return NextResponse.json({ error: "You cannot delete your own player account." }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY for admin deletion." },
      { status: 500 }
    );
  }

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: targetPlayer, error: targetError } = await serviceSupabase
    .from("players")
    .select("id, auth_user_id, full_name")
    .eq("id", targetPlayerId)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500 });
  }

  if (!targetPlayer) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  const authUserId = targetPlayer.auth_user_id as string | null;
  if (authUserId) {
    const { error: deleteAuthError } = await serviceSupabase.auth.admin.deleteUser(authUserId);
    if (deleteAuthError && !isMissingAuthUserError(deleteAuthError.message)) {
      return NextResponse.json(
        {
          error: `Failed to delete linked auth user for ${targetPlayer.full_name}: ${deleteAuthError.message}`,
        },
        { status: 500 }
      );
    }
  }

  const childDeleteOps: Array<{ table: string; column: string; value: string }> = [
    { table: "weekly_participation", column: "player_id", value: targetPlayerId },
    { table: "weekly_scores", column: "player_id", value: targetPlayerId },
    { table: "weekly_tee_times", column: "player_id", value: targetPlayerId },
    { table: "hole_scores", column: "player_id", value: targetPlayerId },
    { table: "cup_team_members", column: "player_id", value: targetPlayerId },
  ];

  for (const op of childDeleteOps) {
    const { error: childDeleteError } = await serviceSupabase
      .from(op.table)
      .delete()
      .eq(op.column, op.value);

    if (childDeleteError) {
      return NextResponse.json(
        {
          error: `Failed to delete related ${op.table} rows: ${childDeleteError.message}`,
        },
        { status: 500 }
      );
    }
  }

  const { error: deletePlayerError } = await serviceSupabase
    .from("players")
    .delete()
    .eq("id", targetPlayerId);

  if (deletePlayerError) {
    return NextResponse.json({ error: deletePlayerError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `Deleted player ${targetPlayer.full_name}.`,
    deleted_player_id: targetPlayerId,
  });
}
