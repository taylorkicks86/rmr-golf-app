"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminSeasonSelector } from "@/components/admin/AdminSeasonSelector";
import { resolveWeekDropdownState } from "@/lib/getDashboardWeek";
import { createClient } from "@/lib/supabase/client";
import { computeFinalComputedHandicap } from "@/lib/weekly-handicap";

type Season = {
  id: string;
  name: string;
  year: number;
  is_active: boolean;
};

type LeagueWeek = {
  id: string;
  week_number: number;
  week_date: string;
  is_finalized: boolean;
};

type Player = {
  id: string;
  full_name: string;
  handicap_index: number;
};

type WeeklyParticipationRecord = {
  player_id: string;
};

type WeeklyHandicapRecord = {
  player_id: string;
  course_handicap: number;
  final_computed_handicap: number;
};

type LeagueWeekSettingsRecord = {
  league_handicap_percent: number;
};

type Row = {
  playerId: string;
  playerName: string;
  handicapIndex: string;
  profileHandicapIndex: number;
  courseHandicap: string;
  finalComputedHandicap: number;
};

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(2)));
}

function parseInputNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function isWholeNumberString(raw: string): boolean {
  return /^-?\d*$/.test(raw.trim());
}

function recalculateRowFinal(row: Row, leagueHandicapPercent: number): Row {
  const courseHandicap = parseInputNumber(row.courseHandicap) ?? 0;
  return {
    ...row,
    finalComputedHandicap: computeFinalComputedHandicap({
      courseHandicap,
      leagueHandicapPercent,
    }),
  };
}

export default function AdminHandicapsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [weeks, setWeeks] = useState<LeagueWeek[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [leagueHandicapPercent, setLeagueHandicapPercent] = useState<string>("80");
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const loadWeeksForSeason = useCallback(async (seasonId: string) => {
    if (!seasonId) {
      setWeeks([]);
      setSelectedWeekId("");
      setLoadingWeeks(false);
      return;
    }

    const supabase = createClient();
    setLoadingWeeks(true);
    const { data, error: err } = await supabase
      .from("league_weeks")
      .select("id, week_number, week_date, is_finalized")
      .eq("season_id", seasonId)
      .order("week_number", { ascending: true });

    if (err) {
      setError(err.message);
      setWeeks([]);
      setSelectedWeekId("");
      setLoadingWeeks(false);
      return;
    }

    const nextWeeks = (data as LeagueWeek[]) ?? [];
    const { filteredWeeks, initialWeekId } = await resolveWeekDropdownState({
      supabase,
      weeks: nextWeeks,
      fallbackWeekId: "",
    });
    setWeeks(filteredWeeks);
    setSelectedWeekId(initialWeekId);
    setLoadingWeeks(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("seasons")
      .select("id, name, year, is_active")
      .order("is_active", { ascending: false })
      .order("year", { ascending: false })
      .order("start_date", { ascending: false })
      .then(({ data: seasonData, error: seasonErr }) => {
        if (seasonErr) {
          setError(seasonErr.message);
          setSeasons([]);
          setWeeks([]);
          setLoadingWeeks(false);
          return;
        }

        const loadedSeasons = (seasonData as Season[]) ?? [];
        setSeasons(loadedSeasons);
        const initialSeasonId = loadedSeasons[0]?.id ?? "";
        setSelectedSeasonId(initialSeasonId);
        if (!initialSeasonId) {
          setWeeks([]);
          setLoadingWeeks(false);
          return;
        }
      });
  }, [loadWeeksForSeason]);

  useEffect(() => {
    if (!selectedSeasonId) return;
    void loadWeeksForSeason(selectedSeasonId);
  }, [selectedSeasonId, loadWeeksForSeason]);

  const loadRows = useCallback(() => {
    if (!selectedWeekId) {
      setRows([]);
      setLeagueHandicapPercent("80");
      setDirty(false);
      setSaveError(null);
      setSaveSuccess(null);
      return;
    }

    setLoadingRows(true);
    setError(null);
    setSaveError(null);
    setSaveSuccess(null);
    const supabase = createClient();

    Promise.all([
      supabase
        .from("weekly_participation")
        .select("player_id")
        .eq("league_week_id", selectedWeekId)
        .eq("playing_this_week", true),
      supabase
        .from("league_week_settings")
        .select("league_handicap_percent")
        .eq("league_week_id", selectedWeekId)
        .maybeSingle(),
    ]).then(async ([participationRes, weekSettingsRes]) => {
      if (participationRes.error) {
        setError(participationRes.error.message);
        setRows([]);
        setLoadingRows(false);
        return;
      }
      if (weekSettingsRes.error) {
        setError(weekSettingsRes.error.message);
        setRows([]);
        setLoadingRows(false);
        return;
      }

      const activePlayerIds = Array.from(
        new Set(
          ((participationRes.data as WeeklyParticipationRecord[] | null) ?? []).map(
            (record) => record.player_id
          )
        )
      );

      if (activePlayerIds.length === 0) {
        setRows([]);
        setDirty(false);
        setLoadingRows(false);
        return;
      }

      const selectedWeekMetaRes = await supabase
        .from("league_weeks")
        .select("season_id, week_number")
        .eq("id", selectedWeekId)
        .maybeSingle();

      if (selectedWeekMetaRes.error) {
        setError(selectedWeekMetaRes.error.message);
        setRows([]);
        setLoadingRows(false);
        return;
      }

      const selectedWeekMeta = (selectedWeekMetaRes.data as { season_id: string; week_number: number } | null) ?? null;
      let priorWeekId: string | null = null;

      if (selectedWeekMeta?.season_id && Number.isFinite(selectedWeekMeta.week_number)) {
        const priorWeekRes = await supabase
          .from("league_weeks")
          .select("id")
          .eq("season_id", selectedWeekMeta.season_id)
          .lt("week_number", selectedWeekMeta.week_number)
          .order("week_number", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (priorWeekRes.error) {
          setError(priorWeekRes.error.message);
          setRows([]);
          setLoadingRows(false);
          return;
        }

        priorWeekId = (priorWeekRes.data as { id: string } | null)?.id ?? null;
      }

      let priorWeekPercent: number | null = null;
      if (!(weekSettingsRes.data as LeagueWeekSettingsRecord | null)?.league_handicap_percent && priorWeekId) {
        const priorWeekSettingsRes = await supabase
          .from("league_week_settings")
          .select("league_handicap_percent")
          .eq("league_week_id", priorWeekId)
          .maybeSingle();

        if (priorWeekSettingsRes.error) {
          setError(priorWeekSettingsRes.error.message);
          setRows([]);
          setLoadingRows(false);
          return;
        }

        priorWeekPercent =
          (priorWeekSettingsRes.data as LeagueWeekSettingsRecord | null)
            ?.league_handicap_percent ?? null;
      }

      const storedWeekPercent = Number(
        (weekSettingsRes.data as LeagueWeekSettingsRecord | null)?.league_handicap_percent ??
          priorWeekPercent ??
          80
      );
      setLeagueHandicapPercent(formatNumber(storedWeekPercent));

      if (!(weekSettingsRes.data as LeagueWeekSettingsRecord | null)?.league_handicap_percent && priorWeekPercent != null) {
        await supabase
          .from("league_week_settings")
          .upsert(
            {
              league_week_id: selectedWeekId,
              league_handicap_percent: Number(priorWeekPercent.toFixed(2)),
            },
            { onConflict: "league_week_id" }
          );
      }

      const [playersRes, weeklyHandicapsRes, priorHandicapsRes] = await Promise.all([
        supabase
          .from("players")
          .select("id, full_name, handicap_index")
          .in("id", activePlayerIds)
          .order("full_name"),
        supabase
          .from("weekly_handicaps")
          .select("player_id, course_handicap, final_computed_handicap")
          .eq("league_week_id", selectedWeekId)
          .in("player_id", activePlayerIds),
        priorWeekId
          ? supabase
              .from("weekly_handicaps")
              .select("player_id, course_handicap, final_computed_handicap")
              .eq("league_week_id", priorWeekId)
              .in("player_id", activePlayerIds)
          : Promise.resolve({ data: [], error: null }),
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
      if (priorHandicapsRes.error) {
        setError(priorHandicapsRes.error.message);
        setRows([]);
        setLoadingRows(false);
        return;
      }

      const players = (playersRes.data as Player[]) ?? [];
      const weeklyHandicaps =
        (weeklyHandicapsRes.data as WeeklyHandicapRecord[] | null) ?? [];
      const weeklyByPlayerId = new Map(
        weeklyHandicaps.map((entry) => [entry.player_id, entry])
      );
      const priorByPlayerId = new Map(
        (((priorHandicapsRes.data as WeeklyHandicapRecord[] | null) ?? []).map((entry) => [
          entry.player_id,
          entry,
        ]))
      );

      const seedPayload: Array<{
        league_week_id: string;
        player_id: string;
        handicap_index: number;
        course_handicap: number;
        final_computed_handicap: number;
      }> = [];

      const nextRows = players.map((player) => {
        const weekly = weeklyByPlayerId.get(player.id);
        const prior = priorByPlayerId.get(player.id);
        const profileHandicapIndex = Number(player.handicap_index);
        const defaultCourseHandicap = Number(prior?.course_handicap ?? 0);
        const courseHandicap = Number(weekly?.course_handicap ?? defaultCourseHandicap);

        if (!weekly) {
          seedPayload.push({
            league_week_id: selectedWeekId,
            player_id: player.id,
            handicap_index: Number(profileHandicapIndex.toFixed(1)),
            course_handicap: Math.round(courseHandicap),
            final_computed_handicap: computeFinalComputedHandicap({
              courseHandicap: Math.round(courseHandicap),
              leagueHandicapPercent: storedWeekPercent,
            }),
          });
        }

        return {
          playerId: player.id,
          playerName: player.full_name,
          handicapIndex: formatNumber(profileHandicapIndex),
          profileHandicapIndex,
          courseHandicap: formatNumber(Math.round(courseHandicap)),
          finalComputedHandicap: computeFinalComputedHandicap({
            courseHandicap: Math.round(courseHandicap),
            leagueHandicapPercent: storedWeekPercent,
          }),
        };
      });

      if (seedPayload.length > 0) {
        const { error: seedError } = await supabase
          .from("weekly_handicaps")
          .upsert(seedPayload, { onConflict: "league_week_id,player_id" });
        if (seedError) {
          setError(seedError.message);
          setRows([]);
          setLoadingRows(false);
          return;
        }
      }

      setRows(nextRows);
      setDirty(false);
      setLoadingRows(false);
    });
  }, [selectedWeekId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? null,
    [weeks, selectedWeekId]
  );

  const onRowInputChange = useCallback(
    (playerId: string, field: "handicapIndex" | "courseHandicap", value: string) => {
      if (field === "courseHandicap" && !isWholeNumberString(value)) return;
      const parsedLeaguePercent = parseInputNumber(leagueHandicapPercent) ?? 0;
      setRows((prev) =>
        prev.map((row) => {
          if (row.playerId !== playerId) return row;
          return recalculateRowFinal({ ...row, [field]: value }, parsedLeaguePercent);
        })
      );
      setDirty(true);
      setSaveSuccess(null);
      setSaveError(null);
    },
    [leagueHandicapPercent]
  );

  const onLeaguePercentChange = useCallback((value: string) => {
    setLeagueHandicapPercent(value);
    const parsedPercent = parseInputNumber(value) ?? 0;
    setRows((prev) => prev.map((row) => recalculateRowFinal(row, parsedPercent)));
    setDirty(true);
    setSaveSuccess(null);
    setSaveError(null);
  }, []);

  const saveAll = useCallback(async () => {
    if (!selectedWeekId || rows.length === 0) return;

    const parsedLeaguePercent = parseInputNumber(leagueHandicapPercent);
    if (parsedLeaguePercent == null) {
      setSaveError("League Handicap % must be numeric.");
      return;
    }
    if (parsedLeaguePercent < 0 || parsedLeaguePercent > 100) {
      setSaveError("League Handicap % must be between 0 and 100.");
      return;
    }

    const payload: Array<{
      league_week_id: string;
      player_id: string;
      handicap_index: number;
      course_handicap: number;
      final_computed_handicap: number;
    }> = [];
    const playerProfileUpdates: Array<{ id: string; handicap_index: number }> = [];

    for (const row of rows) {
      const handicapIndex = parseInputNumber(row.handicapIndex);
      const courseHandicap = parseInputNumber(row.courseHandicap);

      if (handicapIndex == null) {
        setSaveError(`${row.playerName}: Handicap Index must be numeric.`);
        return;
      }
      if (courseHandicap == null) {
        setSaveError(`${row.playerName}: Course Handicap must be numeric.`);
        return;
      }
      if (handicapIndex < 0 || handicapIndex > 54) {
        setSaveError(`${row.playerName}: Handicap Index must be between 0 and 54.`);
        return;
      }
      if (!Number.isInteger(courseHandicap) || courseHandicap < -20 || courseHandicap > 99) {
        setSaveError(
          `${row.playerName}: Course Handicap must be a whole number between -20 and 99.`
        );
        return;
      }

      payload.push({
        league_week_id: selectedWeekId,
        player_id: row.playerId,
        handicap_index: Number(handicapIndex.toFixed(1)),
        course_handicap: courseHandicap,
        final_computed_handicap: computeFinalComputedHandicap({
          courseHandicap,
          leagueHandicapPercent: parsedLeaguePercent,
        }),
      });

      const normalizedHandicapIndex = Number(handicapIndex.toFixed(1));
      if (normalizedHandicapIndex !== Number(row.profileHandicapIndex.toFixed(1))) {
        playerProfileUpdates.push({
          id: row.playerId,
          handicap_index: normalizedHandicapIndex,
        });
      }
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    const supabase = createClient();

    const weekSettingsUpsertRes = await supabase
      .from("league_week_settings")
      .upsert(
        {
          league_week_id: selectedWeekId,
          league_handicap_percent: Number(parsedLeaguePercent.toFixed(2)),
        },
        { onConflict: "league_week_id" }
      );

    if (weekSettingsUpsertRes.error) {
      setSaveError(weekSettingsUpsertRes.error.message);
      setSaving(false);
      return;
    }

    if (playerProfileUpdates.length > 0) {
      for (const playerUpdate of playerProfileUpdates) {
        const playersUpdateRes = await supabase
          .from("players")
          .update({ handicap_index: playerUpdate.handicap_index })
          .eq("id", playerUpdate.id);

        if (playersUpdateRes.error) {
          setSaveError(playersUpdateRes.error.message);
          setSaving(false);
          return;
        }
      }
    }

    const weeklyHandicapsUpsertRes = await supabase
      .from("weekly_handicaps")
      .upsert(payload, { onConflict: "league_week_id,player_id" });

    if (weeklyHandicapsUpsertRes.error) {
      setSaveError(weeklyHandicapsUpsertRes.error.message);
      setSaving(false);
      return;
    }

    setRows((prev) =>
      prev.map((row) => {
        const parsedCourse = parseInputNumber(row.courseHandicap) ?? 0;
        return {
          ...row,
          handicapIndex: formatNumber(parseInputNumber(row.handicapIndex) ?? 0),
          profileHandicapIndex: Number(
            (parseInputNumber(row.handicapIndex) ?? 0).toFixed(1)
          ),
          courseHandicap: formatNumber(parsedCourse),
          finalComputedHandicap: computeFinalComputedHandicap({
            courseHandicap: parsedCourse,
            leagueHandicapPercent: parsedLeaguePercent,
          }),
        };
      })
    );
    setLeagueHandicapPercent(formatNumber(parsedLeaguePercent));
    setDirty(false);
    setSaveSuccess("Weekly handicaps saved.");
    setSaving(false);
  }, [rows, selectedWeekId, leagueHandicapPercent]);

  if (loadingWeeks) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-zinc-600">Loading…</p>
      </div>
    );
  }

  if (error && weeks.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-red-600">Error: {error}</p>
        <Link
          href="/admin"
          className="mt-4 inline-block text-sm text-white hover:text-emerald-200 transition-colors"
        >
          ← Admin
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex justify-end">
        <Link
          href="/admin"
          className="shrink-0 text-sm font-medium text-white hover:text-emerald-200 transition-colors"
        >
          ← Admin
        </Link>
      </div>

      <AdminSeasonSelector
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onChange={setSelectedSeasonId}
        className="mb-4"
      />

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {saveError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}
      {saveSuccess && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {saveSuccess}
        </div>
      )}

      <div className="mb-6">
        <label
          htmlFor="week-select"
          className="mb-2 block text-sm font-medium text-zinc-700"
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
              Week {week.week_number} — {week.week_date}
              {selectedWeekId === week.id && !week.is_finalized ? " (Active)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-6">
        <label
          htmlFor="league-handicap-percent"
          className="mb-2 block text-sm font-medium text-zinc-700"
        >
          League Handicap %
        </label>
        <input
          id="league-handicap-percent"
          type="number"
          step="0.1"
          value={leagueHandicapPercent}
          onChange={(event) => onLeaguePercentChange(event.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:max-w-[12rem]"
        />
      </div>

      {selectedWeek && (
        <p className="mb-4 text-sm text-zinc-600">
          Editing active players for Week {selectedWeek.week_number}.
        </p>
      )}

      <div className="space-y-3 md:hidden">
        {!selectedWeekId ? (
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-6 text-center text-zinc-500">
            Select a week.
          </div>
        ) : loadingRows ? (
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-6 text-center text-zinc-500">
            Loading players…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-6 text-center text-zinc-500">
            No active players for this week.
          </div>
        ) : (
          rows.map((row) => (
            <article
              key={row.playerId}
              className="rounded-lg border border-zinc-200 bg-white p-4"
            >
              <h3 className="text-sm font-semibold text-zinc-900">{row.playerName}</h3>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Handicap Index
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={row.handicapIndex}
                    onChange={(event) =>
                      onRowInputChange(row.playerId, "handicapIndex", event.target.value)
                    }
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Course Handicap
                  </span>
                  <input
                    type="number"
                    step="1"
                    min={-20}
                    max={99}
                    value={row.courseHandicap}
                    onChange={(event) =>
                      onRowInputChange(row.playerId, "courseHandicap", event.target.value)
                    }
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </label>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-emerald-700">
                    Final Computed Handicap
                  </p>
                  <p className="text-base font-semibold text-emerald-900">
                    {row.finalComputedHandicap}
                  </p>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-zinc-200 md:block">
        <table className="min-w-full divide-y divide-zinc-200">
          <thead className="bg-zinc-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Player
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Handicap Index
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Course Handicap
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Final Computed Handicap
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {!selectedWeekId ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  Select a week.
                </td>
              </tr>
            ) : loadingRows ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  Loading players…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  No active players for this week.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.playerId}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900">
                    {row.playerName}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      step="0.1"
                      value={row.handicapIndex}
                      onChange={(event) =>
                        onRowInputChange(row.playerId, "handicapIndex", event.target.value)
                      }
                      className="w-28 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      step="1"
                      min={-20}
                      max={99}
                      value={row.courseHandicap}
                      onChange={(event) =>
                        onRowInputChange(row.playerId, "courseHandicap", event.target.value)
                      }
                      className="w-28 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-emerald-800">
                    {row.finalComputedHandicap}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={saveAll}
          disabled={!selectedWeekId || saving || rows.length === 0 || !dirty}
          className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {saving ? "Saving…" : "Save All"}
        </button>
      </div>
    </div>
  );
}
