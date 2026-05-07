"use client";

import { useState } from "react";

import {
  ScorecardModalView,
  loadScorecardData,
  type ScorecardModalData,
} from "@/components/scoring/scorecard-modal";

type LastRound = {
  weekId: string;
  dateLabel: string;
  sideToPlay: "front" | "back";
  gross: number;
  net: number;
};

export function DashboardLastRounds({
  playerId,
  rounds,
}: {
  playerId: string;
  rounds: LastRound[];
}) {
  const [modalState, setModalState] = useState<ScorecardModalData | null>(null);

  const openScorecard = async (round: LastRound) => {
    const title = `${round.dateLabel} Scorecard`;
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
      weekId: round.weekId,
      fallbackGross: round.gross,
    });

    setModalState({
      title,
      loading: false,
      ...result,
    });
  };

  if (rounds.length === 0) {
    return <p className="text-sm text-zinc-600">No finalized rounds available yet.</p>;
  }

  return (
    <>
      <div className="overflow-hidden rounded-md border border-emerald-900/15 bg-white/75">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b border-emerald-900/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          <span>Date</span>
          <span className="text-right">Side</span>
          <span className="text-right">Net</span>
          <span className="text-right">Gross</span>
        </div>
        <div className="divide-y divide-emerald-900/10">
          {rounds.map((round) => (
            <button
              key={round.weekId}
              type="button"
              onClick={() => void openScorecard(round)}
              className="grid w-full cursor-pointer grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-emerald-50/60"
            >
              <span className="font-medium text-zinc-900">{round.dateLabel}</span>
              <span className="text-right text-xs font-medium text-zinc-600">
                {round.sideToPlay === "back" ? "Back 9" : "Front 9"}
              </span>
              <span className="text-right font-medium text-zinc-900">{round.net}</span>
              <span className="text-right font-medium text-zinc-900">{round.gross}</span>
            </button>
          ))}
        </div>
      </div>

      {modalState && (
        <ScorecardModalView data={modalState} onClose={() => setModalState(null)} />
      )}
    </>
  );
}
