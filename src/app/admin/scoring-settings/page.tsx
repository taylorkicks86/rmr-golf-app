"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AdminSeasonSelector } from "@/components/admin/AdminSeasonSelector";
import {
  DEFAULT_CUP_SCORING_SETTINGS,
  MAX_CUP_SCORING_POSITION_COUNT,
  type CupScoringSettings,
  normalizeCupScoringSettings,
} from "@/lib/cup-scoring";
import { createClient } from "@/lib/supabase/client";

type Season = {
  id: string;
  name: string;
  year: number;
  is_active: boolean;
};

type ApiResponse = CupScoringSettings & {
  seasonId?: string;
  error?: string;
};

function ordinalLabel(position: number): string {
  const suffix =
    position % 100 >= 11 && position % 100 <= 13
      ? "th"
      : position % 10 === 1
        ? "st"
        : position % 10 === 2
          ? "nd"
          : position % 10 === 3
            ? "rd"
            : "th";
  return `${position}${suffix}`;
}

function resizePoints(points: number[], scoringPositions: number): number[] {
  return Array.from({ length: scoringPositions }, (_, index) => {
    const current = points[index];
    const defaultValue = DEFAULT_CUP_SCORING_SETTINGS.pointsByPosition[index];
    return Number.isFinite(current) ? Number(current) : defaultValue ?? 0;
  });
}

export default function AdminScoringSettingsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [settings, setSettings] = useState<CupScoringSettings>(DEFAULT_CUP_SCORING_SETTINGS);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSeasons() {
      setError(null);
      setLoadingSeasons(true);
      const supabase = createClient();
      const { data, error: seasonsError } = await supabase
        .from("seasons")
        .select("id, name, year, is_active")
        .order("is_active", { ascending: false })
        .order("year", { ascending: false })
        .order("start_date", { ascending: false });

      if (!isMounted) return;

      if (seasonsError) {
        setError(seasonsError.message);
        setSeasons([]);
        setSelectedSeasonId("");
        setLoadingSeasons(false);
        return;
      }

      const nextSeasons = (data as Season[] | null) ?? [];
      setSeasons(nextSeasons);
      setSelectedSeasonId(nextSeasons[0]?.id ?? "");
      setLoadingSeasons(false);
    }

    loadSeasons();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      if (!selectedSeasonId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/admin/scoring-settings?seasonId=${encodeURIComponent(selectedSeasonId)}`);
      const body = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!isMounted) return;

      if (!response.ok) {
        setError(body?.error ?? "Failed to load scoring settings.");
        setLoading(false);
        return;
      }

      setSettings(normalizeCupScoringSettings(body));
      setLoading(false);
    }

    loadSettings();
    return () => {
      isMounted = false;
    };
  }, [selectedSeasonId]);

  const totalPoints = useMemo(
    () => settings.pointsByPosition.reduce((sum, points) => sum + Number(points || 0), 0),
    [settings.pointsByPosition]
  );

  const setScoringPositions = (value: string) => {
    const scoringPositions = Math.max(1, Math.min(MAX_CUP_SCORING_POSITION_COUNT, Number(value) || 1));
    setSettings((current) => ({
      scoringPositions,
      pointsByPosition: resizePoints(current.pointsByPosition, scoringPositions),
    }));
    setSuccess(null);
  };

  const setPointsForPosition = (index: number, value: string) => {
    const points = Math.max(0, Math.round(Number(value) || 0));
    setSettings((current) => ({
      ...current,
      pointsByPosition: current.pointsByPosition.map((existing, existingIndex) =>
        existingIndex === index ? points : existing
      ),
    }));
    setSuccess(null);
  };

  const resetDefault = () => {
    setSettings(DEFAULT_CUP_SCORING_SETTINGS);
    setSuccess(null);
    setError(null);
  };

  const saveSettings = async () => {
    if (!selectedSeasonId) {
      setError("Choose a season before saving scoring settings.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/admin/scoring-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...settings, seasonId: selectedSeasonId }),
    });
    const body = (await response.json().catch(() => null)) as ApiResponse | null;

    if (!response.ok) {
      setError(body?.error ?? "Failed to save scoring settings.");
      setSaving(false);
      return;
    }

    setSettings(normalizeCupScoringSettings(body));
    setSuccess("Cup scoring settings updated.");
    setSaving(false);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex justify-end">
        <Link href="/admin" className="shrink-0 text-sm font-medium text-white transition-colors hover:text-emerald-200">
          ← Admin
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 border-b border-zinc-200 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Cup Scoring Logic</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Adjust the number of scoring positions and the points awarded to each finish.
            </p>
          </div>
          <div className="text-sm text-zinc-600">
            Total weekly points: <span className="font-semibold text-zinc-900">{totalPoints}</span>
          </div>
        </div>

        {loadingSeasons ? (
          <p className="mb-5 text-sm text-zinc-500">Loading seasons…</p>
        ) : seasons.length === 0 ? (
          <p className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Create a season before assigning Cup scoring logic.
          </p>
        ) : (
          <AdminSeasonSelector
            seasons={seasons}
            selectedSeasonId={selectedSeasonId}
            onChange={setSelectedSeasonId}
            disabled={saving}
            className="mb-5"
          />
        )}

        {loading ? (
          <p className="text-sm text-zinc-500">Loading scoring settings…</p>
        ) : (
          <>
            <label className="mb-5 block max-w-xs">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Scoring Positions</span>
              <input
                type="number"
                min={1}
                max={MAX_CUP_SCORING_POSITION_COUNT}
                value={settings.scoringPositions}
                onChange={(event) => setScoringPositions(event.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </label>

            <div className="overflow-hidden rounded-lg border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Position</th>
                    <th className="px-4 py-3">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.pointsByPosition.map((points, index) => (
                    <tr key={index} className="border-t border-zinc-200">
                      <td className="px-4 py-3 font-semibold text-zinc-900">{ordinalLabel(index + 1)}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          value={points}
                          onChange={(event) => setPointsForPosition(index, event.target.value)}
                          className="w-32 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={resetDefault}
                disabled={saving}
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reset Default
              </button>
              <button
                type="button"
                onClick={saveSettings}
                disabled={saving}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Settings"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
