import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login?next=/account/password");
  }

  if (!user.email) {
    redirect("/profile-error");
  }

  return (
    <div className="relative -mt-2">
      <PageHeader
        label="RMR GOLF LEAGUE"
        title="Change Password"
        subtitle="Update your account password securely."
        backgroundImage="/images/backgrounds/login-bg.jpg"
        backgroundClassName="min-h-[350px]"
        contentClassName="mx-auto flex min-h-[34vh] max-w-screen-xl flex-col px-4 py-6 pb-5 sm:px-5 sm:py-8 sm:pb-6"
        titleClassName="text-2xl sm:text-3xl"
        subtitleClassName="text-xs sm:text-sm text-emerald-50/95"
      />

      <div className="relative z-10 mx-auto -mt-6 w-full max-w-xl px-4 pb-6 sm:-mt-8 sm:pb-8">
        <ChangePasswordForm email={user.email} userId={user.id} />
      </div>
    </div>
  );
}
