"use client";

import { useState } from "react";

type AttendanceStatus = boolean | null;

type AttendanceWeek = {
  id: string;
  weekNumber: number;
  weekDate: string;
  playDate: string | null;
  sideToPlay: "front" | "back" | null;
  isFinalized: boolean;
  weekStatus: "open" | "finalized" | "cancelled" | "rained_out" | null;
  playingThisWeek: AttendanceStatus;
};

type SaveFeedback = {
  type: "success" | "error";
  message: string;
};

type SeasonAttendanceManagerProps = {
  initialWeeks: AttendanceWeek[];
  isCupPlayer: boolean;
};

function formatWeekDate(raw: string | null): string {
  if (!raw) {
    return "Date TBD";
  }

  const [yearText, monthText, dayText] = raw.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return raw;
  }

  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${String(year).slice(-2)}`;
}

export function SeasonAttendanceManager({ initialWeeks, isCupPlayer }: SeasonAttendanceManagerProps) {
  const [weeks, setWeeks] = useState(initialWeeks);
  const [savingWeekId, setSavingWeekId] = useState<string | null>(null);
  const [feedbackByWeekId, setFeedbackByWeekId] = useState<Record<string, SaveFeedback>>({});

  const updateWeekAttendance = async (weekId: string, nextValue: AttendanceStatus) => {
    const target = weeks.find((week) => week.id === weekId);
    if (!target || target.isFinalized) {
      return;
    }

    const previous = target.playingThisWeek;
    setWeeks((prev) =>
      prev.map((week) => (week.id === weekId ? { ...week, playingThisWeek: nextValue } : week))
    );
    setSavingWeekId(weekId);
    setFeedbackByWeekId((prev) => {
      const next = { ...prev };
      delete next[weekId];
      return next;
    });

    const response = await fetch("/api/attendance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId,
        playingThisWeek: nextValue,
      }),
    });

    const body = (await response.json().catch(() => null)) as
      | { error?: string; playing_this_week?: AttendanceStatus }
      | null;

    if (!response.ok) {
      setWeeks((prev) =>
        prev.map((week) => (week.id === weekId ? { ...week, playingThisWeek: previous } : week))
      );
      setFeedbackByWeekId((prev) => ({
        ...prev,
        [weekId]: {
          type: "error",
          message: body?.error ?? "Failed to save attendance.",
        },
      }));
      setSavingWeekId(null);
      return;
    }

    const persisted = body?.playing_this_week ?? nextValue;
    setWeeks((prev) =>
      prev.map((week) => (week.id === weekId ? { ...week, playingThisWeek: persisted } : week))
    );
    setFeedbackByWeekId((prev) => ({
      ...prev,
      [weekId]: { type: "success", message: "Saved." },
    }));
    setSavingWeekId(null);
  };

  return (
    <div className="overflow-hidden rounded-md border border-emerald-900/20 bg-[#f8f7f2] shadow-md">
      <div className="border-b border-emerald-950/35 bg-[#0f3b2e] px-5 py-4 text-white">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">Attendance</h3>
            <p className="text-xs text-emerald-100/90">Manage your season attendance</p>
          </div>
          {isCupPlayer && <span className="text-[11px] font-medium text-emerald-100/90">Cup Player</span>}
        </div>
      </div>
      <table className="min-w-full divide-y divide-zinc-200">
        <thead className="bg-zinc-50">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              Week
            </th>
            <th scope="col" className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
              Yes
            </th>
            <th scope="col" className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
              Out
            </th>
            <th scope="col" className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
              Undecided
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 bg-white">
          {weeks.map((week) => {
            const selected = week.playingThisWeek;
            const saveFeedback = feedbackByWeekId[week.id];
            const isSaving = savingWeekId === week.id;
            const isLocked = isSaving || week.isFinalized;

            return (
              <tr key={week.id} className={`transition-colors hover:bg-zinc-50 ${week.isFinalized ? "bg-zinc-50/80" : ""}`}>
                <td className="px-4 py-3 text-sm">
                  <p className={`font-medium ${week.isFinalized ? "text-zinc-600" : "text-zinc-900"}`}>
                    Week {week.weekNumber} • {formatWeekDate(week.playDate ?? week.weekDate)}
                  </p>
                  {week.isFinalized && <p className="mt-0.5 text-[11px] text-zinc-500">Locked</p>}
                  {saveFeedback && (
                    <span className={`mt-1 block text-[11px] ${saveFeedback.type === "error" ? "text-red-600" : "text-emerald-700"}`}>
                      {saveFeedback.type === "error" ? `Error: ${saveFeedback.message}` : saveFeedback.message}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <label className="inline-flex cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      aria-label={`Week ${week.weekNumber} attendance yes`}
                      checked={selected === true}
                      disabled={isLocked}
                      onChange={() => updateWeekAttendance(week.id, true)}
                      className="h-4 w-4 rounded border-zinc-300 text-green-600 focus:ring-green-500"
                    />
                  </label>
                </td>
                <td className="px-4 py-3 text-center">
                  <label className="inline-flex cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      aria-label={`Week ${week.weekNumber} attendance out`}
                      checked={selected === false}
                      disabled={isLocked}
                      onChange={() => updateWeekAttendance(week.id, false)}
                      className="h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-500"
                    />
                  </label>
                </td>
                <td className="px-4 py-3 text-center">
                  <label className="inline-flex cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      aria-label={`Week ${week.weekNumber} attendance undecided`}
                      checked={selected === null}
                      disabled={isLocked}
                      onChange={() => updateWeekAttendance(week.id, null)}
                      className="h-4 w-4 rounded border-zinc-300 text-zinc-500 focus:ring-zinc-500"
                    />
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
