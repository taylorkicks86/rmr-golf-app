"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import { resolveWeekDropdownState } from "@/lib/getDashboardWeek";
import { createClient } from "@/lib/supabase/client";

type Season = {
  id: string;
};

type LeagueWeek = {
  id: string;
  week_number: number;
  week_date: string;
  play_date: string | null;
  is_finalized: boolean;
};

type Player = {
  id: string;
  full_name: string;
};

type ParticipationRecord = {
  player_id: string;
};

type WeeklyTeeTimeRecord = {
  player_id: string;
  tee_time: string;
  group_number: number;
  position_in_group: number | null;
  notes: string | null;
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
          .select("id, week_number, week_date, play_date, is_finalized")
          .eq("season_id", season.id)
          .order("week_number", { ascending: true })
          .then(async ({ data, error: err }) => {
            if (err) {
              setError(err.message);
              setWeeks([]);
            } else {
              const nextWeeks = (data as LeagueWeek[]) ?? [];
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
        .from("weekly_tee_times")
        .select("player_id, tee_time, group_number, position_in_group, notes")
        .eq("week_id", selectedWeekId),
    ]).then(([partRes, teeTimesRes]) => {
      if (partRes.error) {
        setError(partRes.error.message);
        setRows([]);
        setLoadingRows(false);
        return;
      }

      if (teeTimesRes.error) {
        setError(teeTimesRes.error.message);
        setRows([]);
        setLoadingRows(false);
        return;
      }

      const participation = (partRes.data as ParticipationRecord[]) ?? [];
      const teeTimes = (teeTimesRes.data as WeeklyTeeTimeRecord[]) ?? [];
      const activePlayerIds = Array.from(new Set(participation.map((record) => record.player_id)));

      if (activePlayerIds.length === 0) {
        setRows([]);
        setLoadingRows(false);
        return;
      }

      supabase
        .from("players")
        .select("id, full_name")
        .in("id", activePlayerIds)
        .order("full_name")
        .then(({ data: playersData, error: playersErr }) => {
          if (playersErr) {
            setError(playersErr.message);
            setRows([]);
            setLoadingRows(false);
            return;
          }

          const players = (playersData as Player[]) ?? [];
          const teeByPlayerId = new Map(teeTimes.map((record) => [record.player_id, record]));

          const merged = players.map((player) => {
            const tee = teeByPlayerId.get(player.id);
            return {
              player,
              teeTime: tee ? normalizeTeeTimeValue(tee.tee_time) : "",
              groupNumber: tee ? String(tee.group_number) : "1",
              positionInGroup: tee?.position_in_group != null ? String(tee.position_in_group) : "",
              notes: tee?.notes ?? "",
            };
          });

          setRows(merged);
          setLoadingRows(false);
        });
    });
  }, [selectedWeekId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? null,
    [weeks, selectedWeekId]
  );

  const playingRows = useMemo(
    () => [...rows].sort((a, b) => a.player.full_name.localeCompare(b.player.full_name)),
    [rows]
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
  const cardClass = "overflow-hidden rounded-md border border-emerald-900/20 bg-[#f8f7f2] shadow-md";
  const cardHeaderClass = "border-b border-emerald-950/35 bg-[#0f3b2e] px-3 py-2 text-white";
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
            {!loadingRows && !hasAssignedTeeTimes && (
              <div className="mb-4 rounded-md border border-emerald-900/15 bg-white/75 p-3">
                <h3 className="mb-2 text-sm font-semibold text-zinc-800">Playing This Week</h3>
                {playingRows.length === 0 ? (
                  <p className="text-sm text-zinc-500">No players are marked as playing for this week.</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {playingRows.map((row) => (
                      <li
                        key={`playing-${row.player.id}`}
                        className="rounded-md border border-emerald-900/15 bg-white px-3 py-2 text-sm font-medium text-zinc-900"
                      >
                        {row.player.full_name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {loadingRows ? (
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
      </div>
    </div>
  );
}
