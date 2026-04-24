import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { resolvePlayerProfileForUser } from "@/lib/player-profile";
import { createClient } from "@/lib/supabase/server";

import { AdminLayoutShell } from "./AdminLayoutShell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const playerResolution = await resolvePlayerProfileForUser({
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
  });

  if (playerResolution.status === "error" || playerResolution.status === "conflict") {
    redirect(`/profile-error?message=${encodeURIComponent(playerResolution.message)}`);
  }

  if (playerResolution.status !== "resolved") {
    redirect("/signup");
  }

  if (!playerResolution.player.is_admin && !playerResolution.player.is_approved) {
    redirect("/pending-approval");
  }

  if (playerResolution.player.is_admin !== true) {
    redirect("/");
  }

  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}
