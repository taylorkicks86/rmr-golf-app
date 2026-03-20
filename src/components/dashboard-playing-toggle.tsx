"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type DashboardPlayingToggleProps = {
  weekId: string;
  initialPlayingThisWeek: boolean | null;
  initialCup: boolean;
  cupEligible: boolean;
  disabled: boolean;
};

export function DashboardPlayingToggle({
  weekId,
  initialPlayingThisWeek,
  initialCup,
  cupEligible,
  disabled,
}: DashboardPlayingToggleProps) {
  const router = useRouter();
  const [playingThisWeek, setPlayingThisWeek] = useState<boolean | null>(initialPlayingThisWeek);
  const [cup, setCup] = useState(initialCup);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setPlayingThisWeek(initialPlayingThisWeek);
    setCup(initialCup);
  }, [initialPlayingThisWeek, initialCup]);

  const persist = async (nextPlayingThisWeek: boolean | null, nextCup: boolean) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/dashboard/playing-this-week", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        weekId,
        playingThisWeek: nextPlayingThisWeek,
        cup: nextCup,
      }),
    });

    const body = (await response.json().catch(() => null)) as
      | { error?: string; playing_this_week?: boolean | null; cup?: boolean }
      | null;
    if (!response.ok) {
      setError(body?.error ?? "Failed to update weekly participation.");
      setSaving(false);
      return;
    }

    const persistedPlaying = body?.playing_this_week ?? nextPlayingThisWeek;
    const persistedCup = body?.cup ?? nextCup;
    setPlayingThisWeek(persistedPlaying);
    setCup(persistedCup);
    if (persistedPlaying === true) {
      setSuccess(persistedCup ? "Saved: Yes and Cup." : "Saved: Yes.");
    } else if (persistedPlaying === false) {
      setSuccess("Saved: No.");
    } else {
      setSuccess("Saved: Undecided.");
    }
    setSaving(false);
    router.refresh();
  };

  const updatePlaying = (nextValue: boolean | null) => {
    const nextCup = nextValue === true && cupEligible ? cup : false;
    void persist(nextValue, nextCup);
  };

  const updateCup = (nextValue: boolean) => {
    if (playingThisWeek !== true || !cupEligible) return;
    void persist(true, nextValue);
  };

  const yesSelected = playingThisWeek === true;
  const noSelected = playingThisWeek === false;
  const noResponseSelected = playingThisWeek === null;

  return (
    <div className="rounded-xl border border-emerald-900/20 bg-emerald-50/40 p-3 sm:p-3.5">
      <div className="space-y-2.5">
        <div className="space-y-2">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900/75">Playing This Week</p>
            <p className="text-sm font-semibold text-zinc-900">
              {yesSelected ? "Yes" : noSelected ? "No" : "Undecided"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-emerald-200 bg-white/70 p-1">
            <button
              type="button"
              onClick={() => updatePlaying(true)}
              disabled={disabled || saving}
              className={`h-9 rounded-md px-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-60 ${
                yesSelected
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => updatePlaying(false)}
              disabled={disabled || saving}
              className={`h-9 rounded-md px-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-60 ${
                noSelected
                  ? "bg-red-600 text-white"
                  : "bg-white text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => updatePlaying(null)}
              disabled={disabled || saving}
              className={`h-9 rounded-md px-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-60 ${
                noResponseSelected
                  ? "bg-zinc-700 text-white"
                  : "bg-white text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              Undecided
            </button>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={cup}
            disabled={disabled || saving || playingThisWeek !== true || !cupEligible}
            onChange={(e) => updateCup(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
          />
          Cup
        </label>
        <p className="text-xs text-zinc-600">
          {yesSelected
            ? cup
              ? "You are marked as playing this week and in the cup."
              : "You are marked as playing this week."
            : noSelected
              ? "You are currently marked as not playing this week."
              : "You are currently undecided for this week."}
        </p>
      </div>
      {disabled && <p className="mt-2 text-xs text-amber-700">Week finalized: attendance is locked.</p>}
      {error && <p className="mt-2 text-xs text-red-600">Error: {error}</p>}
      {success && <p className="mt-2 text-xs text-emerald-700">{success}</p>}
    </div>
  );
}
