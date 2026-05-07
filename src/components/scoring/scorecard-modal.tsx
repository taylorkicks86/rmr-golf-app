"use client";

import { createClient } from "@/lib/supabase/client";

export type ScorecardModalHole = {
  holeNumber: number;
  par: number | null;
  strokes: number;
};

export type ScorecardModalData = {
  title: string;
  loading: boolean;
  error: string | null;
  sideToPlay: "front" | "back" | null;
  holes: ScorecardModalHole[];
  gross: number | null;
  net: number | null;
};

type ActiveHole = {
  hole_number: number;
  par: number | null;
  stroke_index: number | null;
};

type HoleScoreRow = {
  hole_number: number;
  strokes: number;
};

export async function loadScorecardData(params: {
  playerId: string;
  weekId: string;
  fallbackGross?: number | null;
}): Promise<Omit<ScorecardModalData, "title" | "loading">> {
  const { playerId, weekId, fallbackGross = null } = params;
  const supabase = createClient();
  const [scoreRes, holeRes, handicapRes, activeHolesRes] = await Promise.all([
    supabase
      .from("weekly_scores")
      .select("gross_score")
      .eq("league_week_id", weekId)
      .eq("player_id", playerId)
      .maybeSingle(),
    supabase
      .from("hole_scores")
      .select("hole_number, strokes")
      .eq("league_week_id", weekId)
      .eq("player_id", playerId)
      .order("hole_number", { ascending: true }),
    supabase
      .from("weekly_handicaps")
      .select("final_computed_handicap")
      .eq("league_week_id", weekId)
      .eq("player_id", playerId)
      .maybeSingle(),
    fetch(`/api/weeks/${weekId}/active-holes`, { cache: "no-store" }).then(async (response) => {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        side_to_play?: "front" | "back";
        holes?: ActiveHole[];
      } | null;

      if (!response.ok) {
        return {
          error: body?.error ?? "Unable to load scorecard hole numbers.",
          sideToPlay: null as "front" | "back" | null,
          holes: [] as ActiveHole[],
        };
      }

      return {
        error: null as string | null,
        sideToPlay: body?.side_to_play ?? null,
        holes: body?.holes ?? [],
      };
    }),
  ]);

  if (scoreRes.error || holeRes.error || handicapRes.error || activeHolesRes.error) {
    const message =
      scoreRes.error?.message ??
      holeRes.error?.message ??
      handicapRes.error?.message ??
      activeHolesRes.error ??
      "Unable to load scorecard.";
    return {
      error: message,
      sideToPlay: null,
      holes: [],
      gross: null,
      net: null,
    };
  }

  const holeScores = ((holeRes.data as HoleScoreRow[] | null) ?? []).slice();
  const scoreByHoleNumber = new Map(
    holeScores.map((hole) => [Number(hole.hole_number), Number(hole.strokes)])
  );
  const activeHoles = activeHolesRes.holes;
  const holes: ScorecardModalHole[] =
    activeHoles.length > 0
      ? activeHoles.flatMap((hole, index) => {
          const strokes =
            scoreByHoleNumber.get(Number(hole.hole_number)) ??
            scoreByHoleNumber.get(index + 1);
          if (strokes == null) return [];
          return [
            {
              holeNumber: Number(hole.hole_number),
              par: hole.par,
              strokes,
            },
          ];
        })
      : holeScores.map((hole) => ({
          holeNumber: Number(hole.hole_number),
          par: null,
          strokes: Number(hole.strokes),
        }));
  const sumFromHoles = holes.reduce((sum, hole) => sum + Number(hole.strokes), 0);
  const grossFromScores = (scoreRes.data as { gross_score?: number } | null)?.gross_score;
  const gross =
    grossFromScores != null
      ? Number(grossFromScores)
      : holes.length > 0
        ? sumFromHoles
        : fallbackGross;
  const handicap = Number(
    (handicapRes.data as { final_computed_handicap?: number } | null)?.final_computed_handicap ?? 0
  );
  const net = gross == null ? null : Number((gross - handicap).toFixed(1));

  return {
    error: null,
    sideToPlay: activeHolesRes.sideToPlay,
    holes,
    gross,
    net,
  };
}

export function ScorecardModalView({
  data,
  onClose,
}: {
  data: ScorecardModalData;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:items-center sm:p-4 sm:pb-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Weekly scorecard"
    >
      <div
        className="z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-lg sm:rounded-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-900">{data.title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Close
          </button>
        </div>

        {data.loading ? (
          <p className="text-sm text-zinc-600">Loading scorecard…</p>
        ) : data.error ? (
          <p className="text-sm text-red-600">{data.error}</p>
        ) : data.holes.length === 0 ? (
          <p className="text-sm text-zinc-600">No scorecard available</p>
        ) : (
          <div className="space-y-4">
            {data.sideToPlay && (
              <p className="text-sm font-medium text-zinc-600">
                {data.sideToPlay === "back" ? "Back 9" : "Front 9"}
              </p>
            )}
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    {data.holes.map((hole) => (
                      <th
                        key={`h-${hole.holeNumber}`}
                        className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-zinc-500"
                      >
                        {hole.holeNumber}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white">
                  <tr>
                    {data.holes.map((hole) => (
                      <td
                        key={`s-${hole.holeNumber}`}
                        className="px-3 py-2 text-center text-sm font-medium text-zinc-900"
                      >
                        {hole.strokes}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Gross</p>
                <p className="font-semibold text-zinc-900">{data.gross ?? "—"}</p>
              </div>
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Net</p>
                <p className="font-semibold text-zinc-900">{data.net ?? "—"}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
