"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/score-entry", label: "Scores" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/tee-sheet", label: "Tee Sheet" },
];

export function MobileNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-emerald-950/40 bg-[#0f3b2e] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-2px_12px_rgba(0,0,0,0.3)] md:hidden">
      <ul className="mx-auto grid w-full max-w-md grid-cols-4 gap-1">
        {navLinks.map((link) => {
          const active = isActive(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`block rounded-md px-2 py-2.5 text-center text-xs font-semibold tracking-wide transition-colors ${
                  active
                    ? "bg-emerald-700/70 text-white"
                    : "text-emerald-100 hover:bg-emerald-900/45 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
