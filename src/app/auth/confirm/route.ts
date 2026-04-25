import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = requestUrl.searchParams.get("next") ?? "/update-password";

  if (code) {
    const redirectUrl = new URL("/update-password", requestUrl.origin);
    redirectUrl.searchParams.set("code", code);
    return NextResponse.redirect(redirectUrl);
  }

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      const redirectUrl = new URL(next.startsWith("/") ? next : "/update-password", requestUrl.origin);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.redirect(`${requestUrl.origin}/login?error=auth`);
}
