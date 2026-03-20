"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { PageHero } from "@/components/layout/PageHero";

const ADMIN_HERO_META: Record<string, { title: string; subtitle: string }> = {
  "/admin": {
    title: "Admin Dashboard",
    subtitle: "League settings and management tools.",
  },
  "/admin/players": {
    title: "Players",
    subtitle: "Manage player profiles, approval, and Cup assignments.",
  },
  "/admin/seasons": {
    title: "Seasons",
    subtitle: "Create and manage league seasons.",
  },
  "/admin/weeks": {
    title: "Weeks",
    subtitle: "Configure week type and status controls.",
  },
  "/admin/cup-teams": {
    title: "Cup Teams",
    subtitle: "Manage team names and Cup team membership.",
  },
  "/admin/score-entry": {
    title: "Admin Score Entry",
    subtitle: "Enter and review hole-by-hole scores for active players.",
  },
  "/admin/handicaps": {
    title: "Weekly Handicaps",
    subtitle: "Set per-player weekly handicap values used for scoring.",
  },
  "/admin/tee-sheet": {
    title: "Tee Sheet",
    subtitle: "Assign tee times and groups for the selected week.",
  },
  "/admin/finalize-week": {
    title: "Finalize Week",
    subtitle: "Review results and publish finalized weekly outcomes.",
  },
  "/admin/dashboard-week": {
    title: "Dashboard Week",
    subtitle: "Set the active week shown on player dashboards.",
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hero = ADMIN_HERO_META[pathname] ?? {
    title: "Admin",
    subtitle: "League administration tools.",
  };

  return (
    <div className="relative min-h-screen">
      <PageHero title={hero.title} subtitle={hero.subtitle} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
