"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { computeCupSeasonStandings } from "@/lib/cup-standings";
import { PageHeader } from "@/components/ui/PageHeader";

type Season = {
  id: string;
  name: string;
  year: number;
  is_active: boolean;
};

type LeagueWeek = {
  id: string;
  week_number: number;
  is_finalized: boolean;
  week_type: "regular" | "playoff";
  status: "open" | "finalized" | "cancelled" | "rained_out";
};

type PlayerRecord = {
  id: string;
  full_name: string;
  cup: boolean;
};

type CupTeam = {
  id: string;
  name: string;
};

type CupTeamMember = {
  cup_team_id: string;
  player_id: string;
};

type WeeklyCupResultRow = {
  league_week_id: string;
  player_id: string;
  points_earned: number;
};

type StandingRow = {
  playerId: string;
  rank: number;
  player: string;
  countedPoints: number;
  totalPoints: number;
  weeksPlayed: number;
  weeksCounted: number;
  droppedWeeks: number;
  movement: "Up" | "Down" | "—";
};

export default function StandingsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [rows, setRows] = useState<StandingRow[]>([]);
  const [finalizedWeeksCount, setFinalizedWeeksCount] = useState(0);
  const [countedWeeksTarget, setCountedWeeksTarget] = useState(10);
  const [cancelledOrRainedOutCount, setCancelledOrRainedOutCount] = useState(0);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("seasons")
      .select("id, name, year, is_active")
      .order("year", { ascending: false })
      .order("start_date", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          setSeasons([]);
        } else {
          const list = (data as Season[]) ?? [];
          setSeasons(list);
          if (list.length > 0) {
            const seasonFromUrl =
              typeof window !== "undefined"
                ? new URLSearchParams(window.location.search).get("season")
                : null;
            const urlSeason = seasonFromUrl ? list.find((season) => season.id === seasonFromUrl) : null;
            const activeSeason = list.find((season) => season.is_active);
            setSelectedSeasonId(urlSeason?.id ?? activeSeason?.id ?? list[0].id);
          }
        }
        setLoadingSeasons(false);
      });
  }, []);

  const loadStandings = useCallback(() => {
    if (!selectedSeasonId) {
      setRows([]);
      setFinalizedWeeksCount(0);
      setCountedWeeksTarget(10);
      setCancelledOrRainedOutCount(0);
      return;
    }

    setLoadingRows(true);
    setError(null);
    const supabase = createClient();

    supabase
      .from("league_weeks")
      .select("id, week_number, is_finalized, week_type, status")
      .eq("season_id", selectedSeasonId)
      .order("week_number", { ascending: true })
      .then(async ({ data, error: weeksError }) => {
        if (weeksError) {
          setError(weeksError.message);
          setRows([]);
          setFinalizedWeeksCount(0);
          setLoadingRows(false);
          return;
        }

        const weeks = (data as LeagueWeek[]) ?? [];
        const [cupResultsRes, playersRes, teamsRes, membersRes] = await Promise.all([
          supabase
            .from("weekly_cup_results")
            .select("league_week_id, player_id, points_earned")
            .in("league_week_id", weeks.map((week) => week.id)),
          supabase.from("players").select("id, full_name, cup"),
          supabase.from("cup_teams").select("id, name").eq("season_id", selectedSeasonId),
          supabase.from("cup_team_members").select("cup_team_id, player_id").eq("season_id", selectedSeasonId),
        ]);

        if (cupResultsRes.error) {
          setError(cupResultsRes.error.message);
          setRows([]);
          setLoadingRows(false);
          return;
        }

        if (playersRes.error) {
          setError(playersRes.error.message);
          setRows([]);
          setLoadingRows(false);
          return;
        }
        if (teamsRes.error) {
          setError(teamsRes.error.message);
          setRows([]);
          setLoadingRows(false);
          return;
        }
        if (membersRes.error) {
          setError(membersRes.error.message);
          setRows([]);
          setLoadingRows(false);
          return;
        }

        const cupPlayers = ((playersRes.data as PlayerRecord[]) ?? []).filter((player) => player.cup);
        const cupPlayerIds = new Set(cupPlayers.map((player) => player.id));
        const teams = (teamsRes.data as CupTeam[]) ?? [];
        const members = (membersRes.data as CupTeamMember[]) ?? [];
        const teamIdByPlayerId = new Map(
          members
            .filter((member) => cupPlayerIds.has(member.player_id))
            .map((member) => [member.player_id, member.cup_team_id])
        );
        const teamPointsByWeek = new Map<string, number>();
        (((cupResultsRes.data as WeeklyCupResultRow[]) ?? []).filter((row) =>
          cupPlayerIds.has(row.player_id)
        )).forEach((row) => {
          const teamId = teamIdByPlayerId.get(row.player_id);
          if (!teamId) return;
          const key = `${row.league_week_id}:${teamId}`;
          teamPointsByWeek.set(key, (teamPointsByWeek.get(key) ?? 0) + Number(row.points_earned ?? 0));
        });

        const teamCupRows: WeeklyCupResultRow[] = Array.from(teamPointsByWeek.entries()).map(([key, points]) => {
          const [league_week_id, player_id] = key.split(":");
          return { league_week_id, player_id, points_earned: points };
        });
        const teamStandingsPlayers: PlayerRecord[] = teams.map((team) => ({
          id: team.id,
          full_name: team.name,
          cup: true,
        }));

        const seasonResult = computeCupSeasonStandings({
          weeks,
          weeklyCupResults: teamCupRows,
          players: teamStandingsPlayers,
        });

        setFinalizedWeeksCount(seasonResult.finalizedRegularWeekIds.length);
        setCountedWeeksTarget(seasonResult.countedWeeksTarget);
        setCancelledOrRainedOutCount(seasonResult.cancelledOrRainedOutRegularWeeks);

        if (seasonResult.finalizedRegularWeekIds.length <= 1) {
          setRows(seasonResult.standings.map((row) => ({ ...row, movement: "—" })));
          setLoadingRows(false);
          return;
        }

        const previousResult = computeCupSeasonStandings({
          weeks,
          weeklyCupResults: teamCupRows,
          players: teamStandingsPlayers,
          finalizedRegularWeekIdsOverride: seasonResult.finalizedRegularWeekIds.slice(0, -1),
        });

        const previousRankByPlayerId = new Map(
          previousResult.standings.map((row) => [row.playerId, row.rank])
        );

        const withMovement: StandingRow[] = seasonResult.standings.map((row) => {
          const previousRank = previousRankByPlayerId.get(row.playerId);
          if (previousRank == null || previousRank === row.rank) {
            return { ...row, movement: "—" };
          }
          return {
            ...row,
            movement: row.rank < previousRank ? "Up" : "Down",
          };
        });

        setRows(withMovement);
        setLoadingRows(false);
      });
  }, [selectedSeasonId]);

  useEffect(() => {
    loadStandings();
  }, [loadStandings]);

  if (loadingSeasons) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-4 sm:py-8">
        <p className="text-zinc-600">Loading…</p>
      </div>
    );
  }

  if (error && seasons.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-4 sm:py-8">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? null;
  const standingsTitle = selectedSeason ? `${selectedSeason.year} Cup Leaderboard` : "Cup Leaderboard";

  return (
    <div className="relative -mt-2">
      <PageHeader
        label="RMR CUP"
        title="Cup Standings"
        subtitle="Ranked by counted Cup points from finalized regular-season weeks."
        backgroundImage="/images/backgrounds/season-standings-bg.jpg"
        backgroundClassName="min-h-[350px]"
        contentClassName="mx-auto flex min-h-[34vh] max-w-screen-xl flex-col px-4 py-6 pb-5 sm:px-5 sm:py-8 sm:pb-6"
        titleClassName="text-2xl sm:text-3xl"
        subtitleClassName="text-xs sm:text-sm"
      />

      <div className="relative z-10 mx-auto -mt-6 w-full max-w-6xl px-4 pb-5 sm:-mt-8 sm:px-4 sm:pb-8">
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="relative z-20 mx-auto -mt-3 mb-2 w-full max-w-[260px] sm:-mt-4">
          <label htmlFor="season-select" className="mb-1 block text-center text-sm font-medium text-zinc-800">
            Season
          </label>
          <select
            id="season-select"
            value={selectedSeasonId}
            onChange={(event) => setSelectedSeasonId(event.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 shadow-sm sm:text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select a season…</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.year} — {season.name}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-md border border-emerald-900/20 bg-[#f8f7f2] shadow-md">
          <div className="border-b border-emerald-950/35 bg-[#0f3b2e] px-3 py-2 text-white">
            <h2 className="text-sm font-semibold tracking-wide text-white sm:text-base">{standingsTitle}</h2>
            <p className="mt-0.5 text-[11px] text-emerald-100">
              Cup regular weeks finalized: {finalizedWeeksCount} · Best {countedWeeksTarget} count
              {cancelledOrRainedOutCount > 0
                ? ` (${cancelledOrRainedOutCount} cancelled/rained out)`
                : ""}
            </p>
          </div>
          <table className="w-full table-fixed divide-y divide-zinc-200">
            <colgroup>
              <col className="w-[14%] min-w-[4ch]" />
              <col className="w-[50%]" />
              <col className="w-[36%] min-w-[10ch]" />
            </colgroup>
            <thead className="bg-emerald-50/35">
              <tr>
                <th scope="col" className="px-px py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:px-1">
                  Rank
                </th>
                <th scope="col" className="min-w-0 px-px py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:px-1">
                  Team
                </th>
                <th scope="col" className="px-px py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:px-1">
                  Counted Pts
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {!selectedSeasonId ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-sm text-zinc-500">
                    Select a season.
                  </td>
                </tr>
              ) : loadingRows ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-sm text-zinc-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-sm text-zinc-500">
                    No standings yet for this season.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.playerId} className="transition-colors hover:bg-zinc-50/50">
                    <td className="px-px py-1.5 text-center text-xs font-semibold text-zinc-900 sm:px-1">
                      {row.rank}
                    </td>
                    <td className="min-w-0 px-px py-1.5 text-xs font-medium text-zinc-900 sm:px-1">
                      <span className="block min-w-0 truncate">{row.player}</span>
                      <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">
                        Total {row.totalPoints} · {row.weeksCounted}/{countedWeeksTarget} counted · Drop {row.droppedWeeks}
                      </span>
                    </td>
                    <td className="px-px py-1.5 text-center text-xs font-semibold text-zinc-900 sm:px-1">
                      {row.countedPoints}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
