"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { resolvePlayerProfileForUser } from "@/lib/player-profile";
import { createClient } from "@/lib/supabase/client";

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        setIsAuthed(false);
        setIsAdmin(false);
        return;
      }

      setIsAuthed(true);
      resolvePlayerProfileForUser({
        supabase,
        userId: data.user.id,
        userEmail: data.user.email ?? null,
      }).then((result) => {
        if (result.status === "resolved") {
          setIsAdmin(result.player.is_admin);
          return;
        }
        setIsAdmin(false);
      });
    });
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [menuOpen]);

  const onSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push("/login");
    router.refresh();
  }, [router]);

  const menuLinks = useMemo(
    () => [
      { href: "/", label: "Home" },
      { href: "/attendance", label: "Attendance" },
      { href: "/score-entry", label: "Scores" },
      { href: "/rules", label: "Rules" },
      { href: "/tee-sheet", label: "Tee Sheet" },
      { href: "/players", label: "Players" },
      { href: "/account", label: "Account" },
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/standings", label: "Standings" },
    ],
    []
  );

  return (
    <>
      <header className="sticky top-0 z-50 pt-[env(safe-area-inset-top)] border-b border-emerald-950/45 bg-[#0f3b2e] shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
        <div className="mx-auto flex h-14 w-full max-w-[90rem] items-center justify-between px-3.5 sm:px-4">
        <Link href="/" className="inline-flex items-center pl-0.5" aria-label="RMR Golf League home">
          <Image
            src="/rmr-logo.png"
            alt="RMR Golf League"
            width={800}
            height={200}
            priority
            className="h-8 w-auto"
          />
        </Link>

        <button
          type="button"
          aria-label="Open navigation menu"
          onClick={() => setMenuOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200/25 bg-white/5 text-white transition-colors hover:bg-white/10 active:bg-white/15 focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
        >
          <span className="sr-only">Toggle menu</span>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-[86%] max-w-sm border-l border-emerald-800/80 bg-[#0f3b2e] p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-wide text-white">Menu</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-emerald-300/40 text-white hover:bg-emerald-700"
                aria-label="Close menu"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <nav>
              <ul className="space-y-1">
                {menuLinks.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className={`block rounded-md px-3 py-2.5 text-sm font-medium ${
                          active ? "bg-emerald-700 text-white" : "text-white hover:bg-emerald-700"
                        }`}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {isAdmin && (
              <div className="mt-6 border-t border-emerald-800/80 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-200">Admin</p>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/admin"
                      className="block rounded-md px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Admin Dashboard
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/admin/score-entry"
                      className="block rounded-md px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Admin Score Entry
                    </Link>
                  </li>
                </ul>
              </div>
            )}

            <div className="mt-6 border-t border-emerald-800/80 pt-4">
              {isAuthed ? (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="w-full rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Sign out
                </button>
              ) : (
                <Link
                  href="/login"
                  className="block w-full rounded-md bg-emerald-600 px-3 py-2.5 text-center text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Sign in
                </Link>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
