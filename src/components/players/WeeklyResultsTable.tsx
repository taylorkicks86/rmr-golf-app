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
      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="min-w-[640px] divide-y divide-zinc-200">
          <thead className="bg-zinc-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Week
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Gross
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Net
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {weeklyResults.map((row) => (
              <tr
                key={row.weekId}
                onClick={() => void openScorecard(row)}
                className="cursor-pointer transition-colors hover:bg-zinc-50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900">
                  Week {row.weekNumber} - {row.weekDate}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">{row.gross}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">{row.net}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalState && (
        <ScorecardModalView data={modalState} onClose={() => setModalState(null)} />
      )}
    </>
  );
}
