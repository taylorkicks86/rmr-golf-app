"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import { resolveWeekDropdownState } from "@/lib/getDashboardWeek";
import { isPlayableSeasonWeek } from "@/lib/season-weeks";
import { createClient } from "@/lib/supabase/client";

type Season = {
  id: string;
  start_date: string;
  end_date: string;
};

type LeagueWeek = {
  id: string;
  week_number: number;
  week_date: string;
  play_date: string | null;
  is_finalized: boolean;
  tee_sheet_published: boolean;
  status: "open" | "finalized" | "cancelled" | "rained_out" | null;
};

type Player = {
  id: string;
  full_name: string;
};

type TeeAssignmentRecord = {
  player_id: string;
  player_name: string;
  tee_time: string;
  group_number: number | null;
  position_in_group: number | null;
};

type TeeSheetPlayerRecord = {
  player_id: string;
  player_name: string;
};

type Row = {
  player: Player;
  teeTime: string;
  groupNumber: string;
  positionInGroup: string;
  notes: string;
};

const TEE_TIME_OPTIONS = [
  { value: "16:50:00", label: "4:50 PM" },
  { value: "17:00:00", label: "5:00 PM" },
  { value: "17:10:00", label: "5:10 PM" },
];

const ALLOWED_TEE_TIMES = new Set(TEE_TIME_OPTIONS.map((option) => option.value));

function normalizeTeeTimeValue(raw: string): string {
  const parts = raw.split(":");
  if (parts.length < 2) {
    return "";
  }
  return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:00`;
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

export default function PublicTeeSheetPage() {
  const [weeks, setWeeks] = useState<LeagueWeek[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [unassignedPlayers, setUnassignedPlayers] = useState<TeeSheetPlayerRecord[]>([]);
  const [notPlayingPlayers, setNotPlayingPlayers] = useState<TeeSheetPlayerRecord[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("seasons")
      .select("id, start_date, end_date")
      .order("is_active", { ascending: false })
      .order("year", { ascending: false })
      .order("start_date", { ascending: false })
      .limit(1)
      .then(({ data: seasonData, error: seasonErr }) => {
        if (seasonErr) {
          setError(seasonErr.message);
          setWeeks([]);
          setLoadingWeeks(false);
          return;
        }

        const season = ((seasonData as Season[] | null) ?? [])[0];
        if (!season) {
          setWeeks([]);
          setLoadingWeeks(false);
          return;
        }

        supabase
          .from("league_weeks")
          .select("id, week_number, week_date, play_date, is_finalized, tee_sheet_published, status")
          .eq("season_id", season.id)
          .order("week_number", { ascending: true })
          .then(async ({ data, error: err }) => {
            if (err) {
              setError(err.message);
              setWeeks([]);
            } else {
              const nextWeeks = ((data as LeagueWeek[]) ?? []).filter((week) =>
                isPlayableSeasonWeek(week, season)
              );
              const fallbackWeekId =
                nextWeeks.find((week) => !week.is_finalized)?.id ??
                nextWeeks[nextWeeks.length - 1]?.id ??
                "";
              const { filteredWeeks, initialWeekId } = await resolveWeekDropdownState({
                supabase,
                weeks: nextWeeks,
                fallbackWeekId,
              });
              setWeeks(filteredWeeks);
              if (initialWeekId) {
                setSelectedWeekId((prev) => prev || initialWeekId);
              }
            }
            setLoadingWeeks(false);
          });
      });
  }, []);

  const loadData = useCallback(() => {
    if (!selectedWeekId) {
      setRows([]);
      setUnassignedPlayers([]);
      setNotPlayingPlayers([]);
      return;
    }

    setLoadingRows(true);
    setError(null);

    fetch(`/api/weeks/${selectedWeekId}/tee-assignments`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | {
              error?: string;
              assignments?: TeeAssignmentRecord[];
              unassignedPlayers?: TeeSheetPlayerRecord[];
              notPlayingPlayers?: TeeSheetPlayerRecord[];
            }
          | null;

        if (!response.ok) {
          throw new Error(body?.error ?? "Failed to load tee assignments.");
        }

        return {
          assignments: body?.assignments ?? [],
          unassignedPlayers: body?.unassignedPlayers ?? [],
          notPlayingPlayers: body?.notPlayingPlayers ?? [],
        };
      })
      .then(({ assignments, unassignedPlayers: nextUnassignedPlayers, notPlayingPlayers: nextNotPlayingPlayers }) => {
        setUnassignedPlayers(
          [...nextUnassignedPlayers].sort((a, b) => a.player_name.localeCompare(b.player_name))
        );
        setNotPlayingPlayers(
          [...nextNotPlayingPlayers].sort((a, b) => a.player_name.localeCompare(b.player_name))
        );

        if (assignments.length === 0) {
          setRows([]);
          setLoadingRows(false);
          return;
        }

        const merged = assignments.map((assignment) => ({
          player: {
            id: assignment.player_id,
            full_name: assignment.player_name,
          } as Player,
          teeTime: normalizeTeeTimeValue(assignment.tee_time),
          groupNumber: assignment.group_number != null ? String(assignment.group_number) : "",
          positionInGroup:
            assignment.position_in_group != null ? String(assignment.position_in_group) : "",
          notes: "",
        }));

        setRows(merged);
        setLoadingRows(false);
      })
      .catch((fetchError: unknown) => {
        const message = fetchError instanceof Error ? fetchError.message : "Failed to load tee sheet.";
        setError(message);
        setRows([]);
        setUnassignedPlayers([]);
        setNotPlayingPlayers([]);
        setLoadingRows(false);
      });
  }, [selectedWeekId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? null,
    [weeks, selectedWeekId]
  );

  const boardGroupedByTime = useMemo(() => {
    const grouped = new Map<string, Row[]>(
      TEE_TIME_OPTIONS.map((option) => [option.value, [] as Row[]])
    );

    rows.forEach((row) => {
      const teeTime = row.teeTime.trim();
      if (!ALLOWED_TEE_TIMES.has(teeTime)) {
        return;
      }
      const target = grouped.get(teeTime);
      if (target) {
        target.push(row);
      }
    });

    const sortForBoard = (a: Row, b: Row) => {
      const groupA = toNumberOrNull(a.groupNumber) ?? Number.MAX_SAFE_INTEGER;
      const groupB = toNumberOrNull(b.groupNumber) ?? Number.MAX_SAFE_INTEGER;
      if (groupA !== groupB) {
        return groupA - groupB;
      }

      const positionA = toNumberOrNull(a.positionInGroup) ?? Number.MAX_SAFE_INTEGER;
      const positionB = toNumberOrNull(b.positionInGroup) ?? Number.MAX_SAFE_INTEGER;
      if (positionA !== positionB) {
        return positionA - positionB;
      }

      return a.player.full_name.localeCompare(b.player.full_name);
    };

    return TEE_TIME_OPTIONS.map((option) => ({
      ...option,
      rows: (grouped.get(option.value) ?? []).sort(sortForBoard),
    }));
  }, [rows]);

  const hasAssignedTeeTimes = useMemo(
    () => rows.some((row) => ALLOWED_TEE_TIMES.has(row.teeTime.trim())),
    [rows]
  );
  const listTableClass = "w-full divide-y divide-zinc-200 text-sm";
  const cardClass = "overflow-hidden rounded-md border border-emerald-900/20 bg-[#f8f7f2] shadow-md";
  const cardHeaderClass = "border-b border-emerald-950/35 bg-[#1d392f] px-3 py-2 text-white";
  const cardBodyClass = "p-4 sm:p-5";

  if (loadingWeeks) {
    return (
      <div className="relative -mt-2">
        <PageHeader
          label="RMR GOLF LEAGUE"
          title="Tee Sheet"
          subtitle="View weekly tee times and group assignments."
          backgroundImage="/images/backgrounds/golf_peak_summer.jpg"
          backgroundClassName="min-h-[350px]"
          contentClassName="mx-auto flex min-h-[34vh] max-w-screen-xl flex-col px-4 py-6 pb-5 sm:px-5 sm:py-8 sm:pb-6"
          titleClassName="text-2xl sm:text-3xl"
          subtitleClassName="text-xs sm:text-sm text-emerald-50/95"
        />
        <div className="relative z-10 mx-auto -mt-6 w-full max-w-6xl px-4 pb-6 sm:-mt-8 sm:pb-8">
          <p className="text-zinc-600">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative -mt-2">
      <PageHeader
        label="RMR GOLF LEAGUE"
        title="Tee Sheet"
        subtitle="View weekly tee times and group assignments."
        backgroundImage="/images/backgrounds/golf_peak_summer.jpg"
        backgroundClassName="min-h-[350px]"
        contentClassName="mx-auto flex min-h-[34vh] max-w-screen-xl flex-col px-4 py-6 pb-5 sm:px-5 sm:py-8 sm:pb-6"
        titleClassName="text-2xl sm:text-3xl"
        subtitleClassName="text-xs sm:text-sm text-emerald-50/95"
      />
      <div className="relative z-10 mx-auto -mt-6 w-full max-w-6xl px-4 pb-6 sm:-mt-8 sm:pb-8">
        <div className="mb-6 flex justify-end">
          <div className="w-full max-w-[18rem]">
            <label
              htmlFor="week-select"
              className="mb-2 block text-right text-sm font-medium text-white"
            >
              League week
            </label>
            <select
              id="week-select"
              value={selectedWeekId}
              onChange={(event) => setSelectedWeekId(event.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Select a week…</option>
              {weeks.map((week) => (
                <option key={week.id} value={week.id}>
                  Week {week.week_number} — {week.play_date ?? week.week_date}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className={`${cardClass} mb-6`}>
          <div className={cardHeaderClass}>
            <h2 className="text-lg font-semibold text-white sm:text-xl">Tee Sheet Board</h2>
          </div>
          <div className={cardBodyClass}>
            {!selectedWeek?.tee_sheet_published ? (
              <p className="text-sm text-zinc-600">The tee sheet has not been published yet.</p>
            ) : loadingRows ? (
              <p className="text-sm text-zinc-500">Loading tee sheet…</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {boardGroupedByTime.map((slot) => (
                  <div
                    key={`slot-${slot.value}`}
                    className="rounded-md border border-emerald-900/15 bg-white/75 p-3"
                  >
                    <h3 className="mb-2 text-sm font-semibold text-zinc-800">{slot.label}</h3>
                    {slot.rows.length === 0 ? (
                      <p className="text-sm text-zinc-500">No players assigned.</p>
                    ) : (
                    <div className="space-y-2">
                      {slot.rows.map((row) => {
                        return (
                          <div
                            key={`slot-${slot.value}-${row.player.id}`}
                            className="rounded-md border border-emerald-900/15 bg-white px-3 py-2 text-sm"
                          >
                            <p className="font-medium text-zinc-900">{row.player.full_name}</p>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {!selectedWeek?.tee_sheet_published && (
          <>
            <section className={`${cardClass} mb-6`}>
              <div className={cardHeaderClass}>
                <h2 className="text-lg font-semibold text-white sm:text-xl">Unassigned Players</h2>
              </div>
              <div className={cardBodyClass}>
                {loadingRows ? (
                  <p className="text-sm text-zinc-500">Loading players…</p>
                ) : unassignedPlayers.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    {hasAssignedTeeTimes
                      ? "No playing players are waiting for an assignment."
                      : "No saved tee sheet assignments yet."}
                  </p>
                ) : (
                  <table className={listTableClass}>
                    <tbody className="divide-y divide-zinc-200">
                      {unassignedPlayers.map((player) => (
                        <tr key={`unassigned-${player.player_id}`}>
                          <td className="py-2 font-medium text-zinc-900">{player.player_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className={cardClass}>
              <div className={cardHeaderClass}>
                <h2 className="text-lg font-semibold text-white sm:text-xl">Marked No</h2>
              </div>
              <div className={cardBodyClass}>
                {loadingRows ? (
                  <p className="text-sm text-zinc-500">Loading players…</p>
                ) : notPlayingPlayers.length === 0 ? (
                  <p className="text-sm text-zinc-500">No players are marked no for this week.</p>
                ) : (
                  <table className={listTableClass}>
                    <tbody className="divide-y divide-zinc-200">
                      {notPlayingPlayers.map((player) => (
                        <tr key={`not-playing-${player.player_id}`}>
                          <td className="py-2 font-medium text-zinc-900">{player.player_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
