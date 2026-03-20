import Link from "next/link";

import { SeasonAttendanceManager } from "@/components/attendance/SeasonAttendanceManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { resolvePlayerProfileForUser } from "@/lib/player-profile";
import { createClient } from "@/lib/supabase/server";

type Season = {
  id: string;
  name: string;
  year: number;
};

type LeagueWeek = {
  id: string;
  week_number: number;
  week_date: string;
  play_date: string | null;
  side_to_play: "front" | "back" | null;
  is_finalized: boolean;
  status: "open" | "finalized" | "cancelled" | "rained_out" | null;
};

type WeeklyParticipation = {
  league_week_id: string;
  playing_this_week: boolean | null;
};

function AttendancePageFrame({
  children,
  subtitle = "Manage your season attendance.",
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="relative -mt-2">
      <PageHeader
        label="RMR GOLF LEAGUE"
        title="Attendance"
        subtitle={subtitle}
        backgroundImage="/images/backgrounds/attendance-bg.jpg"
        backgroundClassName="min-h-[350px]"
        contentClassName="mx-auto flex min-h-[34vh] max-w-screen-xl flex-col px-4 py-6 pb-5 sm:px-5 sm:py-8 sm:pb-6"
        titleClassName="text-2xl sm:text-3xl"
        subtitleClassName="text-xs sm:text-sm text-emerald-50/95"
      />
      <div className="relative z-10 mx-auto -mt-6 w-full max-w-5xl px-4 pb-6 sm:-mt-8 sm:pb-8">
        {children}
      </div>
    </div>
  );
}

export default async function AttendancePage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return (
      <AttendancePageFrame subtitle="Sign in to manage your season attendance.">
        <p className="text-sm text-zinc-700">You are signed out.</p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-emerald-600 hover:underline">
          Sign in
        </Link>
      </AttendancePageFrame>
    );
  }

  const playerResolution = await resolvePlayerProfileForUser({
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
  });

  if (playerResolution.status === "error" || playerResolution.status === "conflict") {
    return (
      <AttendancePageFrame>
        <p className="text-red-600">Error: {playerResolution.message}</p>
      </AttendancePageFrame>
    );
  }

  if (playerResolution.status === "not_found") {
    return (
      <AttendancePageFrame subtitle="A player profile is required before setting attendance.">
        <p className="text-sm text-zinc-700">No linked player profile was found.</p>
      </AttendancePageFrame>
    );
  }

  const player = playerResolution.player;
  const { data: playerMeta, error: playerMetaError } = await supabase
    .from("players")
    .select("cup")
    .eq("id", player.id)
    .maybeSingle();

  if (playerMetaError) {
    return (
      <AttendancePageFrame>
        <p className="text-red-600">Error: {playerMetaError.message}</p>
      </AttendancePageFrame>
    );
  }

  const isCupPlayer = Boolean((playerMeta as { cup?: boolean } | null)?.cup);

  const { data: seasonData, error: seasonError } = await supabase
    .from("seasons")
    .select("id, name, year")
    .order("is_active", { ascending: false })
    .order("year", { ascending: false })
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (seasonError) {
    return (
      <AttendancePageFrame>
        <p className="text-red-600">Error: {seasonError.message}</p>
      </AttendancePageFrame>
    );
  }

  const season = (seasonData as Season | null) ?? null;
  if (!season) {
    return (
      <AttendancePageFrame>
        <p className="text-sm text-zinc-700">No active season found.</p>
      </AttendancePageFrame>
    );
  }

  const { data: weekData, error: weekError } = await supabase
    .from("league_weeks")
    .select("id, week_number, week_date, play_date, side_to_play, is_finalized, status")
    .eq("season_id", season.id)
    .order("week_number", { ascending: true });

  if (weekError) {
    return (
      <AttendancePageFrame>
        <p className="text-red-600">Error: {weekError.message}</p>
      </AttendancePageFrame>
    );
  }

  const weeks = (weekData as LeagueWeek[]) ?? [];
  const weekIds = weeks.map((week) => week.id);

  let participationByWeekId = new Map<string, WeeklyParticipation>();
  if (weekIds.length > 0) {
    const { data: participationData, error: participationError } = await supabase
      .from("weekly_participation")
      .select("league_week_id, playing_this_week")
      .eq("player_id", player.id)
      .in("league_week_id", weekIds);

    if (participationError) {
      return (
        <AttendancePageFrame>
          <p className="text-red-600">Error: {participationError.message}</p>
        </AttendancePageFrame>
      );
    }

    participationByWeekId = new Map(
      (((participationData as WeeklyParticipation[] | null) ?? []).map((row) => [row.league_week_id, row]))
    );
  }

  const initialWeeks = weeks.map((week) => ({
    id: week.id,
    weekNumber: week.week_number,
    weekDate: week.week_date,
    playDate: week.play_date,
    sideToPlay: week.side_to_play,
    isFinalized: week.is_finalized,
    weekStatus: week.status,
    playingThisWeek: participationByWeekId.get(week.id)?.playing_this_week ?? null,
  }));

  return (
    <AttendancePageFrame>
      {initialWeeks.length === 0 ? (
        <p className="text-sm text-zinc-700">No league weeks have been added for this season.</p>
      ) : (
        <SeasonAttendanceManager initialWeeks={initialWeeks} isCupPlayer={isCupPlayer} />
      )}
    </AttendancePageFrame>
  );
}
