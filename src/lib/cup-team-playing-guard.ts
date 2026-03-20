type SupabaseLike = any;

export async function getCupTeamPlayingConflict(params: {
  supabase: SupabaseLike;
  leagueWeekId: string;
  playerId: string;
}): Promise<{ hasConflict: boolean; error: string | null }> {
  const { supabase, leagueWeekId, playerId } = params;

  const { data: weekData, error: weekError } = await supabase
    .from("league_weeks")
    .select("season_id")
    .eq("id", leagueWeekId)
    .maybeSingle();

  if (weekError) {
    return { hasConflict: false, error: weekError.message };
  }

  const seasonId = (weekData as { season_id?: string } | null)?.season_id ?? null;
  if (!seasonId) {
    return { hasConflict: false, error: null };
  }

  const { data: membershipData, error: membershipError } = await supabase
    .from("cup_team_members")
    .select("cup_team_id")
    .eq("player_id", playerId)
    .eq("season_id", seasonId)
    .maybeSingle();

  if (membershipError) {
    return { hasConflict: false, error: membershipError.message };
  }

  const cupTeamId = (membershipData as { cup_team_id?: string } | null)?.cup_team_id ?? null;
  if (!cupTeamId) {
    return { hasConflict: false, error: null };
  }

  const { data: teamMembersData, error: teamMembersError } = await supabase
    .from("cup_team_members")
    .select("player_id")
    .eq("cup_team_id", cupTeamId)
    .eq("season_id", seasonId);

  if (teamMembersError) {
    return { hasConflict: false, error: teamMembersError.message };
  }

  const teamMembers = ((teamMembersData as { player_id: string }[] | null) ?? []).map(
    (row) => row.player_id
  );

  if (teamMembers.length < 2) {
    return { hasConflict: false, error: null };
  }

  const teammateIds = teamMembers.filter((id) => id !== playerId);
  if (teammateIds.length === 0) {
    return { hasConflict: false, error: null };
  }

  const { data: teammateParticipationData, error: teammateParticipationError } = await supabase
    .from("weekly_participation")
    .select("player_id, playing_this_week, attendance_status")
    .eq("league_week_id", leagueWeekId)
    .in("player_id", teammateIds);

  if (teammateParticipationError) {
    return { hasConflict: false, error: teammateParticipationError.message };
  }

  const hasTeammatePlaying = (
    (teammateParticipationData as
      | { player_id: string; playing_this_week: boolean | null; attendance_status: string | null }[]
      | null) ?? []
  ).some((row) => row.playing_this_week === true || row.attendance_status === "playing");

  return { hasConflict: hasTeammatePlaying, error: null };
}
