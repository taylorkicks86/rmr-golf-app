"use client";

import { useState } from "react";

import {
  ScorecardModalView,
  loadScorecardData,
  type ScorecardModalData,
} from "@/components/scoring/scorecard-modal";

type WeeklyResultRow = {
  weekId: string;
  weekNumber: number;
  weekDate: string;
  gross: number;
  net: number;
};

type WeeklyResultsTableProps = {
  playerId: string;
  weeklyResults: WeeklyResultRow[];
};

export function WeeklyResultsTable({ playerId, weeklyResults }: WeeklyResultsTableProps) {
  const [modalState, setModalState] = useState<ScorecardModalData | null>(null);

  const openScorecard = async (week: WeeklyResultRow) => {
    const title = `Week ${week.weekNumber} Scorecard`;
    setModalState({
      title,
      loading: true,
      error: null,
      sideToPlay: null,
      holes: [],
      gross: null,
      net: null,
    });

    const result = await loadScorecardData({
      playerId,
      weekId: week.weekId,
      fallbackGross: week.gross,
    });

    setModalState({
      title,
      loading: false,
      ...result,
    });
  };

  return (
    <>
      <div className="mx-auto w-full max-w-3xl">
        <div className="space-y-3 sm:hidden">
          {weeklyResults.map((row) => (
            <button
              key={row.weekId}
              type="button"
              onClick={() => void openScorecard(row)}
              className="w-full rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Week {row.weekNumber}</p>
                  <p className="mt-1 text-xs text-zinc-500">{row.weekDate}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-md bg-zinc-50 px-3 py-2">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500">Gross</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-900">{row.gross}</p>
                  </div>
                  <div className="rounded-md bg-emerald-50 px-3 py-2">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-700">Net</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-800">{row.net}</p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm sm:block">
          <table className="w-full table-fixed divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th scope="col" className="w-1/3 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Week
                </th>
                <th scope="col" className="w-1/3 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Gross
                </th>
                <th scope="col" className="w-1/3 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Net
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {weeklyResults.map((row) => (
                <tr
                  key={row.weekId}
                  onClick={() => void openScorecard(row)}
                  className="cursor-pointer transition-colors hover:bg-emerald-50/40"
                >
                  <td className="px-3 py-4 text-center text-sm font-medium text-zinc-900">
                    <span className="block">Week {row.weekNumber}</span>
                    <span className="mt-0.5 block text-xs font-normal text-zinc-500">{row.weekDate}</span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="inline-flex min-w-10 justify-center rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-700">
                      {row.gross}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <span className="inline-flex min-w-10 justify-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
                      {row.net}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalState && (
        <ScorecardModalView data={modalState} onClose={() => setModalState(null)} />
      )}
    </>
  );
}
