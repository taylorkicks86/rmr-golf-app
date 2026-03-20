type SupabaseLike = any;

export type PlayerProfile = {
  id: string;
  full_name: string;
  email: string;
  handicap_index: number;
  is_admin: boolean;
  is_approved: boolean;
  auth_user_id: string | null;
};

export type ResolvePlayerProfileResult =
  | {
      status: "resolved";
      player: PlayerProfile;
      recoveredByEmail: boolean;
    }
  | {
      status: "not_found";
    }
  | {
      status: "conflict";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

const PLAYER_SELECT =
  "id, full_name, email, handicap_index, is_admin, is_approved, auth_user_id";

export async function resolvePlayerProfileForUser(params: {
  supabase: SupabaseLike;
  userId: string;
  userEmail: string | null;
}): Promise<ResolvePlayerProfileResult> {
  const { supabase, userId, userEmail } = params;

  const byAuth = await supabase
    .from("players")
    .select(PLAYER_SELECT)
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (byAuth.error) {
    return {
      status: "error",
      message: byAuth.error.message,
    };
  }

  if (byAuth.data) {
    return {
      status: "resolved",
      player: byAuth.data as PlayerProfile,
      recoveredByEmail: false,
    };
  }

  if (!userEmail) {
    return { status: "not_found" };
  }

  const normalizedEmail = userEmail.trim().toLowerCase();
  const byEmail = await supabase
    .from("players")
    .select(PLAYER_SELECT)
    .ilike("email", normalizedEmail);

  if (byEmail.error) {
    return {
      status: "error",
      message: byEmail.error.message,
    };
  }

  const emailRows = (byEmail.data as PlayerProfile[] | null) ?? [];

  if (emailRows.length === 0) {
    return { status: "not_found" };
  }

  if (emailRows.length > 1) {
    return {
      status: "conflict",
      message: "Multiple player rows match this email. Contact an admin to resolve duplicate player records.",
    };
  }

  const matchedPlayer = emailRows[0];

  if (matchedPlayer.auth_user_id && matchedPlayer.auth_user_id !== userId) {
    return {
      status: "conflict",
      message: "This email is already linked to a different account. Contact an admin for account recovery.",
    };
  }

  if (matchedPlayer.auth_user_id === userId) {
    return {
      status: "resolved",
      player: matchedPlayer,
      recoveredByEmail: false,
    };
  }

  const linkResult = await supabase
    .from("players")
    .update({ auth_user_id: userId })
    .eq("id", matchedPlayer.id)
    .is("auth_user_id", null)
    .select(PLAYER_SELECT)
    .maybeSingle();

  if (linkResult.error) {
    return {
      status: "error",
      message: linkResult.error.message,
    };
  }

  if (!linkResult.data) {
    return {
      status: "conflict",
      message: "Player profile link could not be completed because the profile was updated elsewhere.",
    };
  }

  return {
    status: "resolved",
    player: linkResult.data as PlayerProfile,
    recoveredByEmail: true,
  };
}
