import Link from "next/link";
import type { ReactNode } from "react";

import { computeCupSeasonStandings } from "@/lib/cup-standings";
import { WeeklyResultsTable } from "@/components/players/WeeklyResultsTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }> };

type Player = {
  id: string;
  full_name: string;
  handicap_index: number;
  ghin: string;
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
  is_finalized: boolean;
  week_type?: "regular" | "playoff";
  status?: "open" | "finalized" | "cancelled" | "rained_out";
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

type PlayerRecord = {
  id: string;
  full_name: string;
  cup: boolean;
};

type WeeklyResultRow = {
  weekId: string;
  weekNumber: number;
  weekDate: string;
  gross: number;
  net: number;
};

function PlayersShell(params: {
  title: string;
  subtitle: string;
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  const { title, subtitle, rightSlot, children } = params;

  return (
    <div className="relative -mt-2">
      <PageHeader
        label="RMR GOLF LEAGUE"
        title={title}
        subtitle={subtitle}
        backgroundImage="/images/backgrounds/players-hero.jpg"
        backgroundClassName="min-h-[350px]"
        contentClassName="mx-auto flex min-h-[34vh] max-w-screen-xl flex-col px-4 py-6 pb-5 sm:px-5 sm:py-8 sm:pb-6"
        titleClassName="text-2xl sm:text-3xl"
        subtitleClassName="text-xs sm:text-sm"
        rightSlot={rightSlot}
      />

      <div className="relative z-10 mx-auto -mt-12 w-full max-w-5xl px-4 pb-5 sm:-mt-8 sm:pb-8">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-md sm:p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

export default async function PlayerProfilePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: playerData, error: playerError } = await supabase
    .from("players")
    .select("id, full_name, handicap_index, ghin")
    .eq("id", id)
    .maybeSingle();

  if (playerError) {
    const isInvalidUuid = playerError.message.toLowerCase().includes("invalid input syntax for type uuid");
    if (isInvalidUuid) {
      return (
        <PlayersShell
          title="Player Profile"
          subtitle="Player details, season snapshot, and weekly results."
          rightSlot={
            <Link href="/players" className="text-sm font-medium text-emerald-600 hover:underline">
              ← Players
            </Link>
          }
        >
          <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">Player Not Found</h1>
          <p className="mt-2 text-zinc-600">The requested player does not exist.</p>
          <Link
            href="/players"
            className="mt-4 inline-block text-sm font-medium text-emerald-600 hover:underline"
          >
            ← Back to Players
          </Link>
        </PlayersShell>
      );
    }

    return (
      <PlayersShell
        title="Player Profile"
        subtitle="Player details, season snapshot, and weekly results."
        rightSlot={
          <Link href="/players" className="text-sm font-medium text-emerald-600 hover:underline">
            ← Players
          </Link>
        }
      >
        <p className="text-red-600">Error: {playerError.message}</p>
      </PlayersShell>
    );
  }

  if (!playerData) {
    return (
      <PlayersShell
        title="Player Profile"
        subtitle="Player details, season snapshot, and weekly results."
        rightSlot={
          <Link href="/players" className="text-sm font-medium text-emerald-600 hover:underline">
            ← Players
          </Link>
        }
      >
        <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">Player Not Found</h1>
        <p className="mt-2 text-zinc-600">The requested player does not exist.</p>
        <Link
          href="/players"
          className="mt-4 inline-block text-sm font-medium text-emerald-600 hover:underline"
        >
          ← Back to Players
        </Link>
      </PlayersShell>
    );
  }

  const player = playerData as Player;

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
      <PlayersShell
        title="Player Profile"
        subtitle="Player details, season snapshot, and weekly results."
        rightSlot={
          <Link href="/players" className="text-sm font-medium text-emerald-600 hover:underline">
            ← Players
          </Link>
        }
      >
        <p className="text-red-600">Error: {seasonError.message}</p>
      </PlayersShell>
    );
  }

  const season = (seasonData as Season | null) ?? null;
  let seasonLabel = "No active season";
  let currentRank: number | null = null;
  let totalPoints = 0;
  let weeksPlayed = 0;
  let weeklyResults: WeeklyResultRow[] = [];

  if (season) {
    seasonLabel = `${season.year} - ${season.name}`;

    const { data: weeksData, error: weeksError } = await supabase
      .from("league_weeks")
      .select("id, week_number, week_date, is_finalized")
      .eq("season_id", season.id)
      .eq("is_finalized", true)
      .order("week_number", { ascending: true });

    if (weeksError) {
      return (
        <PlayersShell
          title="Player Profile"
          subtitle="Player details, season snapshot, and weekly results."
          rightSlot={
            <Link href="/players" className="text-sm font-medium text-emerald-600 hover:underline">
              ← Players
            </Link>
          }
        >
          <p className="text-red-600">Error: {weeksError.message}</p>
        </PlayersShell>
      );
    }

    const finalizedWeeks = (weeksData as LeagueWeek[]) ?? [];
    const finalizedWeekIds = finalizedWeeks.map((week) => week.id);

    if (finalizedWeekIds.length > 0) {
      const [scoresRes, playersRes, pointsRes, weeklyHandicapsRes] = await Promise.all([
        supabase
          .from("weekly_scores")
          .select("league_week_id, player_id, gross_score")
          .in("league_week_id", finalizedWeekIds),
        supabase.from("players").select("id, full_name, cup"),
        supabase
          .from("weekly_cup_results")
          .select("league_week_id, player_id, points_earned")
          .in("league_week_id", finalizedWeekIds),
        supabase
          .from("weekly_handicaps")
          .select("league_week_id, player_id, final_computed_handicap")
          .eq("player_id", player.id)
          .in("league_week_id", finalizedWeekIds),
      ]);

      if (scoresRes.error) {
        return (
          <PlayersShell
            title="Player Profile"
            subtitle="Player details, season snapshot, and weekly results."
            rightSlot={
              <Link href="/players" className="text-sm font-medium text-emerald-600 hover:underline">
                ← Players
              </Link>
            }
          >
            <p className="text-red-600">Error: {scoresRes.error.message}</p>
          </PlayersShell>
        );
      }

      if (playersRes.error) {
        return (
          <PlayersShell
            title="Player Profile"
            subtitle="Player details, season snapshot, and weekly results."
            rightSlot={
              <Link href="/players" className="text-sm font-medium text-emerald-600 hover:underline">
                ← Players
              </Link>
            }
          >
            <p className="text-red-600">Error: {playersRes.error.message}</p>
          </PlayersShell>
        );
      }

      if (pointsRes.error) {
        return (
          <PlayersShell
            title="Player Profile"
            subtitle="Player details, season snapshot, and weekly results."
            rightSlot={
              <Link href="/players" className="text-sm font-medium text-emerald-600 hover:underline">
                ← Players
              </Link>
            }
          >
            <p className="text-red-600">Error: {pointsRes.error.message}</p>
          </PlayersShell>
        );
      }
      if (weeklyHandicapsRes.error) {
        return (
          <PlayersShell
            title="Player Profile"
            subtitle="Player details, season snapshot, and weekly results."
            rightSlot={
              <Link href="/players" className="text-sm font-medium text-emerald-600 hover:underline">
                ← Players
              </Link>
            }
          >
            <p className="text-red-600">Error: {weeklyHandicapsRes.error.message}</p>
          </PlayersShell>
        );
      }

      const scores = (scoresRes.data as WeeklyScoreRow[]) ?? [];
      const players = (playersRes.data as PlayerRecord[]) ?? [];
      const weeklyCupResults =
        ((pointsRes.data as { league_week_id: string; player_id: string; points_earned: number }[] | null) ??
          []);
      const weeklyHandicaps =
        (weeklyHandicapsRes.data as (WeeklyHandicapByWeekRow & { player_id: string })[] | null) ?? [];

      const playerNameById = new Map(players.map((row) => [row.id, row.full_name]));
      const weeklyHandicapByWeekId = new Map(
        weeklyHandicaps.map((row) => [
          row.league_week_id,
          Number(row.final_computed_handicap),
        ])
      );
      const scoresByWeek = new Map<string, WeeklyScoreRow[]>();

      scores.forEach((scoreRow) => {
        const existing = scoresByWeek.get(scoreRow.league_week_id) ?? [];
        existing.push(scoreRow);
        scoresByWeek.set(scoreRow.league_week_id, existing);
      });

      finalizedWeeks.forEach((week) => {
        const weekScores = (scoresByWeek.get(week.id) ?? []).sort((a, b) => {
          if (a.gross_score !== b.gross_score) {
            return a.gross_score - b.gross_score;
          }
          const aName = playerNameById.get(a.player_id) ?? "";
          const bName = playerNameById.get(b.player_id) ?? "";
          return aName.localeCompare(bName);
        });

        weekScores.forEach((weekScore) => {
          const scorePlayerId = weekScore.player_id;

          if (scorePlayerId === player.id) {
            const handicap =
              weeklyHandicapByWeekId.get(week.id) ?? Number(player.handicap_index);
            weeklyResults.push({
              weekId: week.id,
              weekNumber: week.week_number,
              weekDate: week.week_date,
              gross: weekScore.gross_score,
              net: Number((weekScore.gross_score - handicap).toFixed(1)),
            });
          }
        });
      });

      const seasonStandings = computeCupSeasonStandings({
        weeks: finalizedWeeks,
        weeklyCupResults,
        players,
      }).standings;

      const playerStanding = seasonStandings.find((row) => row.playerId === player.id) ?? null;
      currentRank = playerStanding?.rank ?? null;
      totalPoints = playerStanding?.countedPoints ?? 0;
      weeksPlayed = playerStanding?.weeksPlayed ?? 0;
    }
  }

  return (
    <PlayersShell
      title="Player Profile"
      subtitle="Player details, season snapshot, and weekly results."
      rightSlot={
        <Link href="/players" className="text-sm font-medium text-emerald-600 hover:underline">
          ← Players
        </Link>
      }
    >
      <section className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50/60 p-4 sm:p-5">
        <h2 className="mb-3 text-xl font-semibold text-zinc-900">{player.full_name}</h2>
        <div className="space-y-1 text-sm text-zinc-700">
          <p>Handicap Index: {player.handicap_index}</p>
          <p>GHIN: {player.ghin}</p>
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50/60 p-4 sm:p-5">
        <h2 className="mb-3 text-xl font-semibold text-zinc-900">Season Snapshot</h2>
        <div className="space-y-1 text-sm text-zinc-700">
          <p className="text-zinc-500">{seasonLabel}</p>
          <p>Current Rank: {currentRank ?? "-"}</p>
          <p>Total Points: {totalPoints}</p>
          <p>Weeks Played: {weeksPlayed}</p>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4 sm:p-5">
        <h2 className="mb-3 text-xl font-semibold text-zinc-900">Weekly Results</h2>
        {weeklyResults.length === 0 ? (
          <p className="text-sm text-zinc-600">No finalized weekly results yet for this player.</p>
        ) : (
          <WeeklyResultsTable playerId={player.id} weeklyResults={weeklyResults} />
        )}
      </section>
    </PlayersShell>
  );
}
