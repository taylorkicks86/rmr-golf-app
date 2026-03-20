import { createClient as createServiceClient } from "@supabase/supabase-js";

import { createClient as createServerClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const serverSupabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await serverSupabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized.", status: 401 as const, serviceSupabase: null };
  }

  const { data: currentPlayer, error: playerError } = await serverSupabase
    .from("players")
    .select("id, is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (playerError || !currentPlayer?.id || !currentPlayer.is_admin) {
    return { error: "Admin access required.", status: 403 as const, serviceSupabase: null };
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY.", status: 500 as const, serviceSupabase: null };
  }

  const serviceSupabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { error: null as string | null, status: null as number | null, serviceSupabase };
}
