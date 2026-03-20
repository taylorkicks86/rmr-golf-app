"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type LeagueWeek = {
  id: string;
  week_number: number;
  week_date: string;
  is_finalized: boolean;
  week_type: "regular" | "playoff";
  status: "open" | "finalized" | "cancelled" | "rained_out";
};

type AdminWeeksTableSectionProps = {
  seasonId: string;
  className?: string;
};

export function AdminWeeksTableSection({ seasonId, className }: AdminWeeksTableSectionProps) {
  const [weeks, setWeeks] = useState<LeagueWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingWeekId, setSavingWeekId] = useState<string | null>(null);

  const loadWeeks = useCallback((targetSeasonId: string) => {
    if (!targetSeasonId) {
      setWeeks([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    setLoading(true);
    setError(null);
    supabase
      .from("league_weeks")
      .select("id, week_number, week_date, is_finalized, week_type, status")
      .eq("season_id", targetSeasonId)
      .order("week_date", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          setWeeks([]);
        } else {
          setWeeks((data as LeagueWeek[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadWeeks(seasonId);
  }, [seasonId, loadWeeks]);

  const persistWeek = async (
    weekId: string,
    updates: Partial<Pick<LeagueWeek, "week_type" | "status">>
  ) => {
    setSaveError(null);
    setSavingWeekId(weekId);
    const supabase = createClient();

    const nextStatus = updates.status;
    const isFinalized = nextStatus ? nextStatus === "finalized" : undefined;
    const payload: Record<string, unknown> = { ...updates };
    if (typeof isFinalized === "boolean") {
      payload.is_finalized = isFinalized;
    }

    const { data, error: updateError } = await supabase
      .from("league_weeks")
      .update(payload)
      .eq("id", weekId)
      .select("id, week_type, status, is_finalized")
      .single();

    if (updateError) {
      setSaveError(updateError.message);
      setSavingWeekId(null);
      return;
    }

    setWeeks((prev) =>
      prev.map((week) =>
        week.id === weekId
          ? {
              ...week,
              week_type: (data as { week_type: LeagueWeek["week_type"] }).week_type,
              status: (data as { status: LeagueWeek["status"] }).status,
              is_finalized: (data as { is_finalized: boolean }).is_finalized,
            }
          : week
      )
    );
    setSavingWeekId(null);
  };

  return (
    <div className={className}>
      {saveError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error: {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full divide-y divide-zinc-200">
          <thead className="bg-zinc-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Week
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Type
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Finalized
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {!seasonId ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  Select a season.
                </td>
              </tr>
            ) : loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  Loading weeks…
                </td>
              </tr>
            ) : weeks.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  No league weeks found.
                </td>
              </tr>
            ) : (
              weeks.map((week) => (
                <tr key={week.id} className="transition-colors hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-900">
                    <p className="font-medium">Week {week.week_number}</p>
                    <p className="text-xs text-zinc-600">{week.week_date}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                    <select
                      value={week.week_type}
                      onChange={(event) =>
                        persistWeek(week.id, { week_type: event.target.value as LeagueWeek["week_type"] })
                      }
                      disabled={savingWeekId === week.id}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60"
                    >
                      <option value="regular">Regular</option>
                      <option value="playoff">Playoff</option>
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                    <select
                      value={week.status}
                      onChange={(event) => persistWeek(week.id, { status: event.target.value as LeagueWeek["status"] })}
                      disabled={savingWeekId === week.id}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60"
                    >
                      <option value="open">Open</option>
                      <option value="finalized">Finalized</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="rained_out">Rained Out</option>
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={week.is_finalized}
                        readOnly
                        aria-label={`Week ${week.week_number} finalized`}
                        className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </label>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
