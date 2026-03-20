"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AdminSeasonSelector } from "@/components/admin/AdminSeasonSelector";
import { AdminWeeksTableSection } from "@/components/admin/AdminWeeksTableSection";
import { createClient } from "@/lib/supabase/client";

type Season = {
  id: string;
  name: string;
  year: number;
  is_active: boolean;
};

type LeagueWeek = {
  id: string;
  season_id?: string;
  week_number: number;
  week_date: string;
  play_date: string | null;
  side_to_play: "front" | "back";
  course_config_id: string | null;
  week_type: "regular" | "playoff";
  status: "open" | "finalized" | "cancelled" | "rained_out";
};

type CourseConfig = {
  id: string;
  name: string;
  tee_name: string;
  is_default: boolean;
};

export default function AdminDashboardWeekPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [weeks, setWeeks] = useState<LeagueWeek[]>([]);
  const [courseConfigs, setCourseConfigs] = useState<CourseConfig[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedSideToPlay, setSelectedSideToPlay] = useState<"front" | "back">("front");
  const [selectedCourseConfigId, setSelectedCourseConfigId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    Promise.all([
      supabase
        .from("seasons")
        .select("id, name, year, is_active")
        .order("is_active", { ascending: false })
        .order("year", { ascending: false })
        .order("start_date", { ascending: false }),
      supabase
        .from("league_weeks")
        .select("id, season_id, week_number, week_date, play_date, side_to_play, course_config_id, week_type, status")
        .order("week_date", { ascending: false }),
      supabase
        .from("league_app_state")
        .select("current_dashboard_week_id")
        .eq("singleton_key", true)
        .maybeSingle(),
      supabase
        .from("course_configs")
        .select("id, name, tee_name, is_default")
        .order("is_default", { ascending: false })
        .order("name", { ascending: true }),
    ]).then(([seasonsRes, weeksRes, stateRes, courseConfigsRes]) => {
      if (seasonsRes.error) {
        setError(seasonsRes.error.message);
        setLoading(false);
        return;
      }

      if (weeksRes.error) {
        setError(weeksRes.error.message);
        setLoading(false);
        return;
      }

      if (stateRes.error) {
        setError(stateRes.error.message);
        setLoading(false);
        return;
      }

      if (courseConfigsRes.error) {
        setError(courseConfigsRes.error.message);
        setLoading(false);
        return;
      }

      const loadedSeasons = (seasonsRes.data as Season[]) ?? [];
      setSeasons(loadedSeasons);
      const initialSeasonId = loadedSeasons[0]?.id ?? "";
      setSelectedSeasonId(initialSeasonId);

      const allWeeks = (weeksRes.data as (LeagueWeek & { season_id: string })[]) ?? [];
      const list = initialSeasonId
        ? allWeeks.filter((week) => week.season_id === initialSeasonId)
        : allWeeks;
      const configList = (courseConfigsRes.data as CourseConfig[]) ?? [];
      setWeeks(list);
      setCourseConfigs(configList);
      const defaultConfigId = configList.find((config) => config.is_default)?.id ?? configList[0]?.id ?? null;

      const appState = (stateRes.data as { current_dashboard_week_id: string | null } | null) ?? null;
      const configuredId = appState?.current_dashboard_week_id ?? "";
      if (configuredId && list.some((week) => week.id === configuredId)) {
        setSelectedWeekId(configuredId);
        const matchedWeek = list.find((week) => week.id === configuredId);
        setSelectedSideToPlay(matchedWeek?.side_to_play ?? "front");
        setSelectedCourseConfigId(matchedWeek?.course_config_id ?? defaultConfigId);
      } else if (list.length > 0) {
        setSelectedWeekId(list[0].id);
        setSelectedSideToPlay(list[0].side_to_play ?? "front");
        setSelectedCourseConfigId(list[0].course_config_id ?? defaultConfigId);
      }

      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedSeasonId) {
      setWeeks([]);
      setSelectedWeekId("");
      return;
    }

    const supabase = createClient();
    supabase
      .from("league_weeks")
      .select("id, week_number, week_date, play_date, side_to_play, course_config_id, week_type, status")
      .eq("season_id", selectedSeasonId)
      .order("week_date", { ascending: false })
      .then(({ data, error: weeksError }) => {
        if (weeksError) {
          setError(weeksError.message);
          setWeeks([]);
          setSelectedWeekId("");
          return;
        }

        const list = (data as LeagueWeek[]) ?? [];
        setWeeks(list);
        setSelectedWeekId((prev) => (prev && list.some((week) => week.id === prev) ? prev : list[0]?.id ?? ""));
      });
  }, [selectedSeasonId]);

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? null,
    [weeks, selectedWeekId]
  );

  useEffect(() => {
    if (!selectedWeekId) return;
    const week = weeks.find((item) => item.id === selectedWeekId);
    if (week) {
      setSelectedSideToPlay(week.side_to_play ?? "front");
      const defaultConfigId =
        courseConfigs.find((config) => config.is_default)?.id ?? courseConfigs[0]?.id ?? null;
      setSelectedCourseConfigId(week.course_config_id ?? defaultConfigId);
    }
  }, [selectedWeekId, weeks, courseConfigs]);

  const saveSelection = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/admin/dashboard-week", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        weekId: selectedWeekId || null,
        sideToPlay: selectedSideToPlay,
        courseConfigId: selectedCourseConfigId,
      }),
    });

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Failed to save dashboard week.");
      setSaving(false);
      return;
    }

    setSuccess("Dashboard week updated.");
    setWeeks((prev) =>
      prev.map((week) =>
        week.id === selectedWeekId
          ? {
              ...week,
              side_to_play: selectedSideToPlay,
              course_config_id: selectedCourseConfigId,
            }
          : week
      )
    );
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-zinc-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex justify-end">
        <Link
          href="/admin"
          className="shrink-0 text-sm font-medium text-white hover:text-emerald-200 transition-colors"
        >
          ← Admin
        </Link>
      </div>

      <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-5">
        <AdminSeasonSelector
          seasons={seasons}
          selectedSeasonId={selectedSeasonId}
          onChange={setSelectedSeasonId}
          className="mb-4"
        />

        <label
          htmlFor="dashboard-week-select"
          className="mb-2 block text-sm font-medium text-zinc-700"
        >
          Active dashboard week
        </label>
        <select
          id="dashboard-week-select"
          value={selectedWeekId}
          onChange={(event) => setSelectedWeekId(event.target.value)}
          className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          {weeks.map((week) => (
            <option key={week.id} value={week.id}>
              Week {week.week_number} — {week.play_date ?? week.week_date} ({week.week_type}, {week.status})
            </option>
          ))}
        </select>

        {selectedWeek && (
          <p className="mt-3 text-sm text-zinc-600">
            Current selection: Week {selectedWeek.week_number} ({selectedWeek.play_date ?? selectedWeek.week_date})
          </p>
        )}
        {selectedCourseConfigId && (
          <p className="mt-1 text-sm text-zinc-600">
            Course:{" "}
            {courseConfigs.find((config) => config.id === selectedCourseConfigId)?.name ?? "Configured course"}
          </p>
        )}

        <fieldset className="mt-4">
          <legend className="mb-2 block text-sm font-medium text-zinc-700">
            Side to play
          </legend>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                name="side-to-play"
                value="front"
                checked={selectedSideToPlay === "front"}
                onChange={() => setSelectedSideToPlay("front")}
                className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              Front 9
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                name="side-to-play"
                value="back"
                checked={selectedSideToPlay === "back"}
                onChange={() => setSelectedSideToPlay("back")}
                className="h-4 w-4 border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              Back 9
            </label>
          </div>
        </fieldset>

        {error && <p className="mt-3 text-sm text-red-600">Error: {error}</p>}
        {success && <p className="mt-3 text-sm text-emerald-700">{success}</p>}

        <button
          type="button"
          onClick={saveSelection}
          disabled={saving || !selectedWeekId}
          className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Dashboard Week"}
        </button>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-700">
          Weeks
        </h2>
        <AdminWeeksTableSection seasonId={selectedSeasonId} />
      </section>
    </div>
  );
}
