import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolvePlayerProfileForUser } from "@/lib/player-profile";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const isLoginRoute = pathname === "/login";
  const isSignupRoute = pathname === "/signup";
  const isPendingApprovalRoute = pathname === "/pending-approval";
  const isProfileErrorRoute = pathname === "/profile-error";
  const isAuthCallbackRoute = pathname.startsWith("/auth/callback");
  const isPublicRoute = isLoginRoute || isSignupRoute || isAuthCallbackRoute;

  const createRedirectResponse = (redirectUrl: URL) => {
    const redirectResponse = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie.name, cookie.value));
    return redirectResponse;
  };

  if (!user && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    const nextPath = `${pathname}${search}`;
    redirectUrl.searchParams.set("next", nextPath);
    return createRedirectResponse(redirectUrl);
  }

  if (!user) {
    return supabaseResponse;
  }

  const playerResolution = await resolvePlayerProfileForUser({
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
  });

  if (playerResolution.status === "error" || playerResolution.status === "conflict") {
    if (isProfileErrorRoute) {
      return supabaseResponse;
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/profile-error";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("message", playerResolution.message);
    return createRedirectResponse(redirectUrl);
  }

  const hasPlayerProfile = playerResolution.status === "resolved";
  const canAccessApp = hasPlayerProfile
    ? Boolean(playerResolution.player.is_admin || playerResolution.player.is_approved)
    : false;

  if (!hasPlayerProfile) {
    if (isSignupRoute) {
      return supabaseResponse;
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/signup";
    redirectUrl.search = "";
    return createRedirectResponse(redirectUrl);
  }

  if (!canAccessApp && !isPendingApprovalRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/pending-approval";
    redirectUrl.search = "";
    return createRedirectResponse(redirectUrl);
  }

  if (canAccessApp && isPendingApprovalRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return createRedirectResponse(redirectUrl);
  }

  if (isLoginRoute || isSignupRoute || isProfileErrorRoute) {
    const nextPath = request.nextUrl.searchParams.get("next") || "/";
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = nextPath.startsWith("/") ? nextPath : "/";
    redirectUrl.search = "";
    return createRedirectResponse(redirectUrl);
  }

  return supabaseResponse;
}
