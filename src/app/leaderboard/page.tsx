"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { resolveWeekDropdownState } from "@/lib/getDashboardWeek";
import {
  allocateHandicapStrokesAcrossHoles,
  buildLiveHoleScoring,
  calculateNineHoleStrokesReceived,
} from "@/lib/live-scoring";
import { PageHeader } from "@/components/ui/PageHeader";

type LeagueWeek = {
  id: string;
  season_id?: string;
  week_number: number;
  week_date: string;
  is_finalized: boolean;
};

type LeaderboardRow = {
  rankLabel: string;
  full_name: string;
  scoreLabel: string;
  thruLabel: string;
  gross: number | null;
  net: number | null;
  netToPar: number | null;
  holesCompleted: number;
};

type Player = {
  id: string;
  full_name: string;
  handicap_index: number;
};

type WeeklyHandicapRecord = {
  player_id: string;
  final_computed_handicap: number;
};

type HoleScore = {
  player_id: string;
  hole_number: number;
  strokes: number;
};

type ActiveHole = {
  hole_number: number;
  par: number | null;
  stroke_index: number;
};

function formatScoreLabel(netToPar: number | null): string {
  if (netToPar == null) return "-";
  if (netToPar === 0) return "E";
  return netToPar > 0 ? `+${netToPar}` : `${netToPar}`;
}

function formatWeekDateToMonthDay(rawDate: string): string {
  const parsed = new Date(`${rawDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return rawDate;
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

export default function LeaderboardPage() {
  const [weeks, setWeeks] = useState<LeagueWeek[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("seasons")
      .select("id")
      .order("is_active", { ascending: false })
      .order("year", { ascending: false })
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: seasonData, error: seasonErr }) => {
        if (seasonErr) {
          setError(seasonErr.message);
          setWeeks([]);
          setLoadingWeeks(false);
          return;
        }

        const seasonId = (seasonData as { id: string } | null)?.id ?? null;
        if (!seasonId) {
          setWeeks([]);
          setLoadingWeeks(false);
          return;
        }

        supabase
          .from("league_weeks")
          .select("id, week_number, week_date, is_finalized")
          .eq("season_id", seasonId)
          .order("week_date", { ascending: false })
          .then(async ({ data, error: weeksErr }) => {
            if (weeksErr) {
              setError(weeksErr.message);
              setWeeks([]);
              setLoadingWeeks(false);
              return;
            }

            const list = (data as LeagueWeek[]) ?? [];
            const fallbackWeekId = list.length > 0 ? list[0].id : "";
            const { filteredWeeks, initialWeekId } = await resolveWeekDropdownState({
              supabase,
              weeks: list,
              fallbackWeekId,
            });
            setWeeks(filteredWeeks);

            if (initialWeekId) {
              setSelectedWeekId((prev) => prev || initialWeekId);
            }

            setLoadingWeeks(false);
          });
      });
  }, []);

  const loadLeaderboard = useCallback(() => {
    // TODO(cup-leaderboard): Add a dedicated Cup leaderboard mode that:
    // - filters to players where players.cup = true
    // - uses weekly_cup_results points_earned instead of gross/net sorting
    // - applies best-10 regular week counting with rainout adjustment
    // - applies absent-player vacant-point split (positions 6-15)
    // - applies playoff stroke advantages for regular-season 1st/2nd
    if (!selectedWeekId) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    setError(null);
    const supabase = createClient();
    Promise.all([
      supabase
        .from("weekly_participation")
        .select("player_id")
        .eq("league_week_id", selectedWeekId)
        .eq("playing_this_week", true),
      supabase
        .from("weekly_scores")
        .select("player_id")
        .eq("league_week_id", selectedWeekId),
      supabase
        .from("hole_scores")
        .select("player_id, hole_number, strokes")
        .eq("league_week_id", selectedWeekId),
      fetch(`/api/weeks/${selectedWeekId}/active-holes`, { cache: "no-store" }).then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | {
              error?: string;
              holes?: ActiveHole[];
            }
          | null;

        if (!response.ok) {
          return { error: body?.error ?? "Failed to load active holes.", holes: null };
        }
        return { error: null, holes: body?.holes ?? null };
      }),
    ]).then(async ([participationRes, weeklyScoresRes, holeScoresRes, activeHolesRes]) => {
      if (participationRes.error) {
        setError(participationRes.error.message);
        setRows([]);
        setLoadingRows(false);
        return;
      }
      if (weeklyScoresRes.error) {
        setError(weeklyScoresRes.error.message);
        setRows([]);
        setLoadingRows(false);
        return;
      }
      if (holeScoresRes.error) {
        setError(holeScoresRes.error.message);
        setRows([]);
        setLoadingRows(false);
        return;
      }
      if (activeHolesRes.error) {
        setError(activeHolesRes.error);
        setRows([]);
        setLoadingRows(false);
        return;
      }

      const participationIds = ((participationRes.data as { player_id: string }[] | null) ?? []).map(
        (r) => r.player_id
      );
      const scoreIds = ((weeklyScoresRes.data as { player_id: string }[] | null) ?? []).map(
        (r) => r.player_id
      );
      const holeScoreIds = ((holeScoresRes.data as HoleScore[] | null) ?? []).map((r) => r.player_id);
      const playerIds = Array.from(new Set([...participationIds, ...scoreIds, ...holeScoreIds]));
      if (playerIds.length === 0) {
        setRows([]);
        setLoadingRows(false);
        return;
      }

      const [playersRes, weeklyHandicapsRes] = await Promise.all([
        supabase
          .from("players")
          .select("id, full_name, handicap_index")
          .in("id", playerIds)
          .order("full_name"),
        supabase
          .from("weekly_handicaps")
          .select("player_id, final_computed_handicap")
          .eq("league_week_id", selectedWeekId)
          .in("player_id", playerIds),
      ]);

      if (playersRes.error) {
        setError(playersRes.error.message);
        setRows([]);
        setLoadingRows(false);
        return;
      }
      if (weeklyHandicapsRes.error) {
        setError(weeklyHandicapsRes.error.message);
        setRows([]);
        setLoadingRows(false);
        return;
      }

      const players = (playersRes.data as Player[]) ?? [];
      const weeklyHandicaps =
        (weeklyHandicapsRes.data as WeeklyHandicapRecord[] | null) ?? [];
      const weeklyHandicapByPlayerId = new Map(
        weeklyHandicaps.map((row) => [row.player_id, Number(row.final_computed_handicap)])
      );
      const activeHoles =
        ((activeHolesRes.holes as ActiveHole[] | null) ?? [])
          .slice()
          .sort((a, b) => a.hole_number - b.hole_number)
          .slice(0, 9);
      const holeScores = (holeScoresRes.data as HoleScore[] | null) ?? [];
      const scoreByPlayer = new Map<string, string[]>();

      holeScores.forEach((score) => {
        const existing = scoreByPlayer.get(score.player_id) ?? Array.from({ length: 9 }, () => "");
        const index = Number(score.hole_number) - 1;
        if (index >= 0 && index < 9) {
          existing[index] = String(score.strokes);
        }
        scoreByPlayer.set(score.player_id, existing);
      });

      const computed = players.map((player) => {
        const effectiveHandicap =
          weeklyHandicapByPlayerId.get(player.id) ?? Number(player.handicap_index);
        const holes = scoreByPlayer.get(player.id) ?? Array.from({ length: 9 }, () => "");
        const strokesReceived = calculateNineHoleStrokesReceived({
          handicapIndex: Number(effectiveHandicap),
        });
        const strokeAllocationByHole = allocateHandicapStrokesAcrossHoles({
          activeHoles,
          totalStrokesReceived: strokesReceived,
        });
        const live = buildLiveHoleScoring({
          holeInputs: holes,
          activeHoles,
          strokeAllocationByHole,
        });

        const holesCompleted = holes.filter((value) => value.trim() !== "").length;
        const parThrough = activeHoles.reduce((sum, hole, index) => {
          if (holes[index]?.trim() === "") return sum;
          return sum + (hole.par ?? 0);
        }, 0);
        const netToPar = live.netTotal == null ? null : live.netTotal - parThrough;

        return {
          rankLabel: "-",
          full_name: player.full_name,
          scoreLabel: formatScoreLabel(netToPar),
          thruLabel: holesCompleted === 0 ? "Not started" : `Thru ${holesCompleted}`,
          gross: live.grossTotal,
          net: live.netTotal,
          netToPar,
          holesCompleted,
        } as LeaderboardRow;
      });

      const sorted = [...computed].sort((a, b) => {
        if (a.netToPar == null && b.netToPar == null) {
          return a.full_name.localeCompare(b.full_name);
        }
        if (a.netToPar == null) return 1;
        if (b.netToPar == null) return -1;
        if (a.netToPar !== b.netToPar) return a.netToPar - b.netToPar;
        if (a.holesCompleted !== b.holesCompleted) return b.holesCompleted - a.holesCompleted;
        return a.full_name.localeCompare(b.full_name);
      });

      let previousScore: number | null = null;
      let currentRank = 0;
      const ranked = sorted.map((row, index) => {
        if (row.netToPar == null) {
          return { ...row, rankLabel: "-" };
        }
        if (previousScore === null || row.netToPar !== previousScore) {
          currentRank = index + 1;
        }
        const tied = previousScore !== null && row.netToPar === previousScore;
        previousScore = row.netToPar;
        return { ...row, rankLabel: tied ? `T${currentRank}` : `${currentRank}` };
      });

      setRows(ranked);
      setLoadingRows(false);
    });
  }, [selectedWeekId]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  if (loadingWeeks) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-4 sm:py-8">
        <p className="text-zinc-600">Loading…</p>
      </div>
    );
  }

  if (error && weeks.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-4 sm:py-8">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  const selectedWeek = weeks.find((week) => week.id === selectedWeekId) ?? null;
  const leaderboardTitle = selectedWeek
    ? `Week ${selectedWeek.week_number} - ${formatWeekDateToMonthDay(selectedWeek.week_date)}`
    : "Leaderboard";

  return (
    <div className="relative -mt-2">
      <PageHeader
        label="RMR CUP"
        title="Weekly Leaderboard"
        subtitle="Live net leaderboard for the selected week."
        backgroundImage="/images/backgrounds/leaderboard-bg.jpg"
        backgroundClassName="min-h-[350px]"
        contentClassName="mx-auto flex min-h-[34vh] max-w-screen-xl flex-col px-4 py-6 pb-5 sm:px-5 sm:py-8 sm:pb-6"
        titleClassName="text-2xl sm:text-3xl"
        subtitleClassName="text-xs sm:text-sm"
      />

      <div className="relative z-10 mx-auto -mt-12 w-full max-w-6xl px-4 pb-5 sm:-mt-8 sm:px-4 sm:pb-8">
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="relative z-20 mx-auto -mt-9 mb-1 w-full max-w-[260px] sm:-mt-4">
          <label htmlFor="week-select" className="mb-0.5 block text-center text-sm font-medium text-zinc-800">
            League week
          </label>
          <select
            id="week-select"
            value={selectedWeekId}
            onChange={(e) => setSelectedWeekId(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 shadow-sm sm:text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select a week…</option>
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>
                Week {w.week_number} — {w.week_date}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-md border border-emerald-900/20 bg-[#f8f7f2] shadow-md">
          <div className="border-b border-emerald-950/35 bg-[#0f3b2e] px-3 py-2 text-white">
            <h2 className="text-sm font-semibold tracking-wide text-white sm:text-base">{leaderboardTitle}</h2>
          </div>
          <table className="w-full table-fixed divide-y divide-zinc-200">
            <colgroup>
              <col className="w-[8%] min-w-[3ch]" />
              <col className="w-[46%]" />
              <col className="w-[10%] min-w-[4ch]" />
              <col className="w-[16%] min-w-[6ch]" />
              <col className="w-[10%] min-w-[3ch]" />
              <col className="w-[10%] min-w-[3ch]" />
            </colgroup>
            <thead className="bg-emerald-50/35">
              <tr>
                <th scope="col" className="px-px py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:px-1">
                  RK
                </th>
                <th scope="col" className="min-w-0 px-px py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:px-1">
                  Player
                </th>
                <th scope="col" className="px-px py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:px-1">
                  +/-
                </th>
                <th scope="col" className="px-px py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:px-1">
                  Thru
                </th>
                <th scope="col" className="px-px py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:px-1">
                  Grs
                </th>
                <th scope="col" className="px-px py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:px-1">
                  Net
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {!selectedWeekId ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-zinc-500">
                    Select a week.
                  </td>
                </tr>
              ) : loadingRows ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-zinc-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-zinc-500">
                    No leaderboard data for this week yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.full_name} className="hover:bg-zinc-50/50">
                    <td className="px-px py-1.5 text-center text-xs font-semibold text-zinc-900 sm:px-1">{row.rankLabel}</td>
                    <td className="min-w-0 px-px py-1.5 text-xs font-medium text-zinc-900 sm:px-1">
                      <span className="block min-w-0 truncate">{row.full_name}</span>
                    </td>
                    <td
                      className={`px-px py-1.5 text-center text-xs font-semibold sm:px-1 ${
                        row.scoreLabel.startsWith("-")
                          ? "text-emerald-700"
                          : row.scoreLabel === "E"
                            ? "text-zinc-700"
                            : "text-zinc-800"
                      }`}
                    >
                      {row.scoreLabel}
                    </td>
                    <td className="px-px py-1.5 text-center text-xs text-zinc-600 sm:px-1">{row.thruLabel}</td>
                    <td className="px-px py-1.5 text-center text-xs text-zinc-800 sm:px-1">{row.gross ?? "-"}</td>
                    <td className="px-px py-1.5 text-center text-xs font-semibold text-zinc-900 sm:px-1">{row.net ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-[11px] text-zinc-500 sm:text-xs">
          Columns: <span className="font-medium">+/-</span> = net vs par, <span className="font-medium">Grs</span> = gross, <span className="font-medium">Net</span> = net.
        </div>
      </div>
    </div>
  );
}
