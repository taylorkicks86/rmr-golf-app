"use client";

import { usePathname } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import { MobileNav } from "@/components/layout/MobileNav";

function LoginTopBar() {
  return (
    <header className="sticky top-0 z-50 pt-[env(safe-area-inset-top)] border-b border-emerald-950/45 bg-[#0f3b2e] shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
      <div className="mx-auto h-14 w-full max-w-[90rem] px-3.5 sm:px-4" aria-hidden="true" />
    </header>
  );
}

function LoginBottomBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-emerald-950/40 bg-[#0f3b2e] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-2px_12px_rgba(0,0,0,0.3)] md:hidden"
      aria-hidden="true"
    >
      <div className="mx-auto h-10 w-full max-w-md" />
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <>
      {isLoginPage ? <LoginTopBar /> : <AppHeader />}
      <main className={isLoginPage ? "px-0 pb-[calc(6rem+env(safe-area-inset-bottom))]" : "px-0 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6"}>
        {children}
      </main>
      {isLoginPage ? <LoginBottomBar /> : <MobileNav />}
    </>
  );
}
