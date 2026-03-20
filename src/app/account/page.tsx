import { redirect } from "next/navigation";

import { AccountProfileForm } from "@/components/account/AccountProfileForm";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { resolvePlayerProfileForUser } from "@/lib/player-profile";
import { createClient } from "@/lib/supabase/server";

type AccountPlayer = {
  id: string;
  full_name: string;
  email: string;
  ghin: string;
  handicap_index: number;
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login?next=/account");
  }

  const playerResolution = await resolvePlayerProfileForUser({
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
  });

  if (playerResolution.status === "not_found") {
    redirect("/signup");
  }

  if (playerResolution.status === "error" || playerResolution.status === "conflict") {
    redirect(`/profile-error?message=${encodeURIComponent(playerResolution.message)}`);
  }

  const { data: playerData, error: playerError } = await supabase
    .from("players")
    .select("id, full_name, email, ghin, handicap_index")
    .eq("id", playerResolution.player.id)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (playerError || !playerData) {
    redirect("/profile-error");
  }

  const player = playerData as AccountPlayer;
  const accountEmail = user.email ?? player.email ?? "";

  return (
    <div className="relative -mt-2">
      <PageHeader
        label="RMR GOLF LEAGUE"
        title="Account"
        subtitle="Update your player profile and password."
        backgroundImage="/images/backgrounds/login-bg.jpg"
        backgroundClassName="min-h-[350px]"
        contentClassName="mx-auto flex min-h-[34vh] max-w-screen-xl flex-col px-4 py-6 pb-5 sm:px-5 sm:py-8 sm:pb-6"
        titleClassName="text-2xl sm:text-3xl"
        subtitleClassName="text-xs sm:text-sm text-emerald-50/95"
      />

      <div className="relative z-10 mx-auto -mt-6 w-full max-w-xl space-y-4 px-4 pb-6 sm:-mt-8 sm:space-y-5 sm:pb-8">
        <AccountProfileForm
          playerId={player.id}
          userId={user.id}
          initialFullName={player.full_name}
          initialEmail={accountEmail}
          initialGhin={player.ghin}
          initialHandicapIndex={Number(player.handicap_index)}
        />
        <ChangePasswordForm email={accountEmail} userId={user.id} />
      </div>
    </div>
  );
}
