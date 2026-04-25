import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const redirectUrl = new URL("/update-password", requestUrl.origin);
    redirectUrl.searchParams.set("code", code);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(`${requestUrl.origin}/login?error=auth`);
}
