import Link from "next/link";

import { DashboardPlayingToggle } from "@/components/dashboard-playing-toggle";
import { PageHeader } from "@/components/ui/PageHeader";
import { computeCupSeasonStandings } from "@/lib/cup-standings";
import { resolvePlayerProfileForUser } from "@/lib/player-profile";
import { createClient } from "@/lib/supabase/server";

type Player = {
  id: string;
  full_name: string;
  handicap_index: number;
  is_admin: boolean;
  is_approved: boolean;
};

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
  is_finalized: boolean;
  side_to_play: "front" | "back";
  course_config_id: string | null;
  week_type: "regular" | "playoff";
  status: "open" | "finalized" | "cancelled" | "rained_out";
};

type WeeklyParticipation = {
  playing_this_week: boolean | null;
  cup: boolean;
  paid: boolean;
};

type WeeklyScoreRow = {
  league_week_id: string;
  player_id: string;
  gross_score: number;
};

type WeeklyHandicapByWeekRow = {
  league_week_id: string;
  final_computed_handicap: number;
};

type WeeklyCupResultRow = {
  league_week_id: string;
  player_id: string;
  points_earned: number;
};

type PlayerRecord = {
  id: string;
  full_name: string;
  cup: boolean;
};

type ThisWeekStatus = {
  weekId: string;
  weekLabel: string;
  playDateLabel: string | null;
  sideToPlay: "front" | "back";
  playingThisWeek: boolean | null;
  cup: boolean;
  cupEligible: boolean;
  paid: boolean;
  teeTime: string | null;
  groupNumber: number | null;
  teeNotes: string | null;
  isFinalized: boolean;
};

type LastRoundResult = {
  weekId: string;
  dateLabel: string;
  sideToPlay: "front" | "back";
  gross: number;
  net: number;
};

type SeasonSnapshot = {
  seasonLabel: string;
  rank: number | null;
  totalPoints: number;
  weeksPlayed: number;
};

type DashboardData = {
  playerName: string;
  weatherSummary: string | null;
  thisWeek: ThisWeekStatus | null;
  lastRounds: LastRoundResult[];
  seasonSnapshot: SeasonSnapshot | null;
};

type WeatherLocation = {
  name: string;
  latitude: number;
  longitude: number;
};

// Dashboard weather location: 212 Kenrick St, Newton, MA 02458.
// Edit this constant if you want dashboard weather to use a different location.
const DASHBOARD_WEATHER_LOCATION: WeatherLocation = {
  name: "212 Kenrick St, Newton, MA 02458",
  latitude: 42.3497,
  longitude: -71.2149,
};

function formatTeeTime(raw: string): string {
  const [hoursText, minutesText] = raw.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return raw;
  }

  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
  const mm = String(minutes).padStart(2, "0");
  return `${twelveHour}:${mm} ${suffix}`;
}

function formatWeekDateShort(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const [yearText, monthText, dayText] = raw.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return raw;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const yy = String(year).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

async function fetchDashboardWeatherSummary(location: WeatherLocation): Promise<string | null> {
  try {
    const searchParams = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      temperature_unit: "fahrenheit",
      current_weather: "true",
      hourly: "precipitation_probability",
      timezone: "America/New_York",
    });

    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?${searchParams.toString()}`,
      { cache: "no-store" }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      current_weather?: { temperature?: number; time?: string };
      hourly?: { time?: string[]; precipitation_probability?: Array<number | null> };
    };

    const temp = Number(data.current_weather?.temperature);
    if (!Number.isFinite(temp)) return null;

    const hourlyTimes = data.hourly?.time ?? [];
    const hourlyRain = data.hourly?.precipitation_probability ?? [];
    if (hourlyTimes.length === 0 || hourlyRain.length === 0) {
      return `${Math.round(temp)}°F`;
    }

    const currentTime = data.current_weather?.time ? new Date(data.current_weather.time).getTime() : Date.now();
    let bestIndex = 0;
    let bestDelta = Number.POSITIVE_INFINITY;
    hourlyTimes.forEach((time, index) => {
      const millis = new Date(time).getTime();
      const delta = Math.abs(millis - currentTime);
      if (Number.isFinite(delta) && delta < bestDelta) {
        bestDelta = delta;
        bestIndex = index;
      }
    });

    const rain = Number(hourlyRain[bestIndex] ?? 0);
    const rainPercent = Number.isFinite(rain) ? Math.round(rain) : 0;
    return `${Math.round(temp)}°F • Rain ${rainPercent}%`;
  } catch {
    return null;
  }
}

async function buildDashboardData(player: Player): Promise<{ data: DashboardData | null; error: string | null }> {
  const supabase = await createClient();
  const fallbackWeatherSummary = await fetchDashboardWeatherSummary(DASHBOARD_WEATHER_LOCATION);

  const { data: seasonData, error: seasonError } = await supabase
    .from("seasons")
    .select("id, name, year")
    .order("is_active", { ascending: false })
    .order("year", { ascending: false })
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (seasonError) {
    return { data: null, error: seasonError.message };
  }

  const season = (seasonData as Season | null) ?? null;
  if (!season) {
    return {
      data: {
        playerName: player.full_name,
        weatherSummary: fallbackWeatherSummary,
        thisWeek: null,
        lastRounds: [],
        seasonSnapshot: null,
      },
      error: null,
    };
  }

  const { data: weeksData, error: weeksError } = await supabase
    .from("league_weeks")
    .select("id, week_number, week_date, play_date, is_finalized, side_to_play, course_config_id, week_type, status")
    .eq("season_id", season.id)
    .order("week_number", { ascending: true });

  if (weeksError) {
    return { data: null, error: weeksError.message };
  }

  const weeks = (weeksData as LeagueWeek[]) ?? [];
  const autoResolvedWeek =
    weeks.find((week) => week.is_finalized === false) ??
    (weeks.length > 0 ? weeks[weeks.length - 1] : null);

  const { data: appStateData, error: appStateError } = await supabase
    .from("league_app_state")
    .select("current_dashboard_week_id")
    .eq("singleton_key", true)
    .maybeSingle();

  if (appStateError) {
    return { data: null, error: appStateError.message };
  }

  const configuredWeekId =
    (appStateData as { current_dashboard_week_id: string | null } | null)?.current_dashboard_week_id ?? null;
  const currentWeek =
    (configuredWeekId ? weeks.find((week) => week.id === configuredWeekId) : null) ?? autoResolvedWeek;
  const weatherSummary = await fetchDashboardWeatherSummary(DASHBOARD_WEATHER_LOCATION);

  let thisWeek: ThisWeekStatus | null = null;
  const { data: playerCupData, error: playerCupError } = await supabase
    .from("players")
    .select("cup")
    .eq("id", player.id)
    .maybeSingle();

  if (playerCupError) {
    return { data: null, error: playerCupError.message };
  }

  const playerIsCup = Boolean((playerCupData as { cup?: boolean } | null)?.cup);

  if (currentWeek) {
    const { data: participationData, error: participationError } = await supabase
      .from("weekly_participation")
      .select("playing_this_week, cup, paid")
      .eq("league_week_id", currentWeek.id)
      .eq("player_id", player.id)
      .maybeSingle();

    if (participationError) {
      return { data: null, error: participationError.message };
    }

    const participation = participationData as WeeklyParticipation | null;
    let teeTime: string | null = null;
    let groupNumber: number | null = null;
    let teeNotes: string | null = null;

    if (participation?.playing_this_week) {
      const { data: teeTimeData, error: teeTimeError } = await supabase
        .from("weekly_tee_times")
        .select("tee_time, group_number, notes")
        .eq("week_id", currentWeek.id)
        .eq("player_id", player.id)
        .maybeSingle();

      if (teeTimeError) {
        return { data: null, error: teeTimeError.message };
      }

      const tee = teeTimeData as { tee_time: string; group_number: number; notes: string | null } | null;
      teeTime = tee?.tee_time ?? null;
      groupNumber = tee?.group_number ?? null;
      teeNotes = tee?.notes ?? null;
    }

    thisWeek = {
      weekId: currentWeek.id,
      weekLabel: `Week ${currentWeek.week_number} (${currentWeek.week_date})`,
      playDateLabel: currentWeek.play_date ?? currentWeek.week_date,
      sideToPlay: currentWeek.side_to_play ?? "front",
      playingThisWeek: participation?.playing_this_week ?? null,
      cup: playerIsCup && participation?.playing_this_week === true ? participation?.cup ?? false : false,
      cupEligible: playerIsCup,
      paid: participation?.paid ?? false,
      teeTime,
      groupNumber,
      teeNotes,
      isFinalized: currentWeek.is_finalized,
    };
  }

  let lastRounds: LastRoundResult[] = [];
  const finalizedWeeks = weeks.filter((week) => week.is_finalized);
  if (finalizedWeeks.length > 0) {
    const finalizedWeekIds = finalizedWeeks.map((week) => week.id);
    const [playerScoresRes, weeklyHandicapsRes] = await Promise.all([
      supabase
        .from("weekly_scores")
        .select("league_week_id, gross_score")
        .eq("player_id", player.id)
        .in("league_week_id", finalizedWeekIds),
      supabase
        .from("weekly_handicaps")
        .select("league_week_id, final_computed_handicap")
        .eq("player_id", player.id)
        .in("league_week_id", finalizedWeekIds),
    ]);

    if (playerScoresRes.error) {
      return { data: null, error: playerScoresRes.error.message };
    }
    if (weeklyHandicapsRes.error) {
      return { data: null, error: weeklyHandicapsRes.error.message };
    }

    const scoreByWeekId = new Map(
      (((playerScoresRes.data as { league_week_id: string; gross_score: number }[] | null) ?? []).map((score) => [
        score.league_week_id,
        Number(score.gross_score),
      ]))
    );
    const weeklyHandicapByWeekId = new Map(
      (((weeklyHandicapsRes.data as WeeklyHandicapByWeekRow[] | null) ?? []).map((row) => [
        row.league_week_id,
        Number(row.final_computed_handicap),
      ]))
    );

    lastRounds = [...finalizedWeeks]
      .filter((week) => scoreByWeekId.has(week.id))
      .sort((a, b) => b.week_number - a.week_number)
      .slice(0, 6)
      .map((week) => {
        const gross = scoreByWeekId.get(week.id) ?? 0;
        const handicap =
          weeklyHandicapByWeekId.get(week.id) ?? Number(player.handicap_index);
        return {
          weekId: week.id,
          dateLabel: formatWeekDateShort(week.play_date ?? week.week_date) ?? (week.play_date ?? week.week_date),
          sideToPlay: week.side_to_play ?? "front",
          gross,
          net: Number((gross - handicap).toFixed(1)),
        };
      });
  }

  let seasonSnapshot: SeasonSnapshot | null = {
    seasonLabel: `${season.year} - ${season.name}`,
    rank: null,
    totalPoints: 0,
    weeksPlayed: 0,
  };

  const finalizedWeekIds = weeks.filter((week) => week.is_finalized).map((week) => week.id);
  if (finalizedWeekIds.length > 0) {
    const [cupResultsRes, playersRes] = await Promise.all([
      supabase
        .from("weekly_cup_results")
        .select("league_week_id, player_id, points_earned")
        .in("league_week_id", finalizedWeekIds),
      supabase.from("players").select("id, full_name, cup"),
    ]);

    if (cupResultsRes.error) {
      return { data: null, error: cupResultsRes.error.message };
    }
    if (playersRes.error) {
      return { data: null, error: playersRes.error.message };
    }

    const standingsRows = computeCupSeasonStandings({
      weeks: weeks.map((week) => ({
        id: week.id,
        week_number: week.week_number,
        is_finalized: week.is_finalized,
        week_type: week.week_type,
        status: week.status,
      })),
      weeklyCupResults: (cupResultsRes.data as WeeklyCupResultRow[]) ?? [],
      players: (playersRes.data as PlayerRecord[]) ?? [],
    }).standings;

    const playerStanding = standingsRows.find((row) => row.playerId === player.id) ?? null;
    seasonSnapshot = {
      seasonLabel: `${season.year} - ${season.name}`,
      rank: playerStanding?.rank ?? null,
      totalPoints: playerStanding?.countedPoints ?? 0,
      weeksPlayed: playerStanding?.weeksPlayed ?? 0,
    };
  }

  return {
    data: {
      playerName: player.full_name,
      weatherSummary,
      thisWeek,
      lastRounds,
      seasonSnapshot,
    },
    error: null,
  };
}

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
        <p className="text-red-600">Error: {userError.message}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
        <h1 className="text-2xl font-bold sm:text-3xl text-zinc-900">Welcome</h1>
        <p className="mt-2 text-zinc-600">You are signed out. Please sign in to continue.</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const playerResolution = await resolvePlayerProfileForUser({
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
  });

  if (playerResolution.status === "error") {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
        <p className="text-red-600">Error: {playerResolution.message}</p>
      </div>
    );
  }

  if (playerResolution.status === "conflict") {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
        <h1 className="text-2xl font-bold sm:text-3xl text-zinc-900">Profile Link Error</h1>
        <p className="mt-2 text-red-600">{playerResolution.message}</p>
      </div>
    );
  }

  if (playerResolution.status === "not_found") {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
        <h1 className="text-2xl font-bold sm:text-3xl text-zinc-900">Profile Setup Required</h1>
        <p className="mt-2 text-zinc-600">
          Your account is signed in, but no player profile was found yet.
        </p>
        <Link
          href="/signup"
          className="mt-4 inline-block rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Complete signup
        </Link>
      </div>
    );
  }

  const player = playerResolution.player as Player;

  if (!player.is_admin && !player.is_approved) {
    return (
      <div className="mx-auto w-full max-w-2xl px-3 py-8 sm:px-4 sm:py-12">
        <h1 className="mb-3 text-2xl font-bold sm:text-3xl text-zinc-900">Pending Approval</h1>
        <p className="text-zinc-600">
          Your account is created and waiting for admin approval. You will get access to the league app once approved.
        </p>
      </div>
    );
  }

  const { data: dashboardData, error: dashboardError } = await buildDashboardData(player);

  if (dashboardError || !dashboardData) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
        <p className="text-red-600">Error: {dashboardError ?? "Unable to load dashboard."}</p>
      </div>
    );
  }

  const cardClass = "overflow-hidden rounded-md border border-emerald-900/20 bg-[#f8f7f2] shadow-md";
  const cardHeaderClass = "border-b border-emerald-950/35 bg-[#0f3b2e] px-3 py-2 text-white";
  const cardBodyClass = "p-4 sm:p-5";
  const attendanceStatus =
    dashboardData.thisWeek?.playingThisWeek === true
      ? "yes"
      : dashboardData.thisWeek?.playingThisWeek === false
        ? "no"
        : "undecided";
  const thisWeekStatusDotClass =
    attendanceStatus === "yes"
      ? "bg-emerald-400"
      : attendanceStatus === "no"
        ? "bg-red-400"
        : "bg-gray-300";

  return (
    <div className="relative">
      <PageHeader
        label="RMR GOLF LEAGUE"
        title={dashboardData.playerName}
        subtitle="Weekly scoring, standings, and tee sheet updates."
        metaText={dashboardData.weatherSummary ?? undefined}
        backgroundImage="/images/backgrounds/rmr-course-summer-bg.jpg"
        backgroundClassName="min-h-[350px]"
        contentClassName="mx-auto flex min-h-[34vh] max-w-screen-xl flex-col px-4 py-6 pb-5 sm:px-5 sm:py-8 sm:pb-6"
        titleClassName="text-2xl sm:text-3xl"
        subtitleClassName="text-xs sm:text-sm text-emerald-50/95"
        metaTextClassName="text-xs sm:text-sm text-white/85"
      />

      <div className="relative z-10 mx-auto -mt-6 w-full max-w-5xl px-3 pb-5 sm:-mt-8 sm:px-4 sm:pb-8">
        <div className="grid gap-4 sm:gap-5">
          <section className={`${cardClass} border-emerald-900/30`}>
            <div className={`${cardHeaderClass} flex items-center justify-between gap-3`}>
              <h2 className="min-w-0 text-lg font-semibold text-white sm:text-xl">This Week</h2>
              <span
                aria-label="Attendance status"
                className={`inline-block h-3.5 w-3.5 flex-shrink-0 rounded-full ring-1 ring-white/20 ${thisWeekStatusDotClass}`}
              />
            </div>
            <div className={cardBodyClass}>
              {!dashboardData.thisWeek ? (
                <p className="text-sm text-zinc-600">No active dashboard week is configured yet.</p>
              ) : (
                <div className="space-y-3 text-sm text-zinc-700">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-zinc-900">
                      {formatWeekDateShort(dashboardData.thisWeek.playDateLabel) ?? "Date TBD"} •{" "}
                      {dashboardData.thisWeek.sideToPlay === "back" ? "Back 9" : "Front 9"}
                    </p>
                    <p className="text-sm text-zinc-700">
                      <span className="text-zinc-600">Tee Time: </span>
                      <span className="font-medium text-zinc-900">
                        {dashboardData.thisWeek.teeTime
                          ? formatTeeTime(dashboardData.thisWeek.teeTime)
                          : "Tee time not assigned yet"}
                      </span>
                      {dashboardData.thisWeek.groupNumber != null && (
                        <>
                          <span className="mx-1.5 text-zinc-500">•</span>
                          <span className="font-medium text-zinc-900">Group {dashboardData.thisWeek.groupNumber}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <DashboardPlayingToggle
                    weekId={dashboardData.thisWeek.weekId}
                    initialPlayingThisWeek={dashboardData.thisWeek.playingThisWeek}
                    initialCup={dashboardData.thisWeek.cup}
                    cupEligible={dashboardData.thisWeek.cupEligible}
                    disabled={dashboardData.thisWeek.isFinalized}
                  />
                </div>
              )}
            </div>
          </section>

          <section className={cardClass}>
            <div className={cardHeaderClass}>
              <h2 className="text-lg font-semibold text-white sm:text-xl">Season Snapshot</h2>
            </div>
            <div className={cardBodyClass}>
              {!dashboardData.seasonSnapshot ? (
                <p className="text-sm text-zinc-600">No active season found.</p>
              ) : (
                <div className="space-y-1.5 text-sm text-zinc-700">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {dashboardData.seasonSnapshot.seasonLabel}
                  </p>
                  <div className="grid grid-cols-2 gap-y-1">
                    <p className="text-zinc-600">Season Rank</p>
                    <p className="font-medium text-zinc-900">{dashboardData.seasonSnapshot.rank ?? "-"}</p>
                    <p className="text-zinc-600">Total Points</p>
                    <p className="font-medium text-zinc-900">{dashboardData.seasonSnapshot.totalPoints}</p>
                    <p className="text-zinc-600">Weeks Played</p>
                    <p className="font-medium text-zinc-900">{dashboardData.seasonSnapshot.weeksPlayed}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className={cardClass}>
            <div className={cardHeaderClass}>
              <h2 className="text-lg font-semibold text-white sm:text-xl">Last Rounds</h2>
            </div>
            <div className={cardBodyClass}>
              {dashboardData.lastRounds.length === 0 ? (
                <p className="text-sm text-zinc-600">No finalized rounds available yet.</p>
              ) : (
                <div className="overflow-hidden rounded-md border border-emerald-900/15 bg-white/75">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b border-emerald-900/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    <span>Date</span>
                    <span className="text-right">Side</span>
                    <span className="text-right">Net</span>
                    <span className="text-right">Gross</span>
                  </div>
                  <div className="divide-y divide-emerald-900/10">
                    {dashboardData.lastRounds.map((round) => (
                      <div
                        key={round.weekId}
                        className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2 text-sm text-zinc-700"
                      >
                        <span className="font-medium text-zinc-900">{round.dateLabel}</span>
                        <span className="text-right text-xs font-medium text-zinc-600">
                          {round.sideToPlay === "back" ? "Back 9" : "Front 9"}
                        </span>
                        <span className="text-right font-medium text-zinc-900">{round.net}</span>
                        <span className="text-right font-medium text-zinc-900">{round.gross}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className={cardClass}>
            <div className={cardHeaderClass}>
              <h2 className="text-lg font-semibold text-white sm:text-xl">Quick Links</h2>
            </div>
            <div className={cardBodyClass}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Link
                  href="/score-entry"
                  className="rounded-lg border border-emerald-700/30 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-900 transition-colors hover:bg-emerald-100"
                >
                  Scoring
                </Link>
                <Link
                  href="/standings"
                  className="rounded-lg border border-emerald-700/30 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-900 transition-colors hover:bg-emerald-100"
                >
                  Standings
                </Link>
                <Link
                  href="/leaderboard"
                  className="rounded-lg border border-emerald-700/30 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-900 transition-colors hover:bg-emerald-100"
                >
                  Leaderboard
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
