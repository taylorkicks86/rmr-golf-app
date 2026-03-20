export function calculatePartialGross(holes: string[]): number | null {
  const entered = holes
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .map((value) => Number(value));

  if (entered.length === 0) {
    return null;
  }

  return entered.reduce((sum, value) => sum + value, 0);
}

export function calculateNineHoleStrokesReceived(params: { handicapIndex: number }): number {
  const { handicapIndex } = params;
  const normalizedHandicap = Number.isFinite(handicapIndex) ? handicapIndex : 0;
  return Math.trunc(normalizedHandicap);
}

export function calculateLiveNetTotal(params: {
  grossTotal: number | null;
  strokesReceived: number;
}): number | null {
  if (params.grossTotal == null) {
    return null;
  }

  return params.grossTotal - params.strokesReceived;
}

type ActiveHoleForStrokes = {
  hole_number: number;
  stroke_index: number;
};

export type ScorecardDisplayCategory =
  | "eagle_or_better"
  | "birdie"
  | "par"
  | "bogey"
  | "double_bogey_or_worse"
  | "blank";

export type HoleScorecardCell = {
  grossScore: number | null;
  netScore: number | null;
  par: number | null;
  scoreToPar: number | null;
  displayCategory: ScorecardDisplayCategory;
};

export function allocateHandicapStrokesAcrossHoles(params: {
  activeHoles: ActiveHoleForStrokes[];
  totalStrokesReceived: number;
}): Map<number, number> {
  const { activeHoles, totalStrokesReceived } = params;
  const allocation = new Map<number, number>();
  const strokes = Math.trunc(totalStrokesReceived);
  const strokeDelta = strokes >= 0 ? 1 : -1;
  const steps = Math.abs(strokes);

  if (steps === 0 || activeHoles.length === 0) {
    return allocation;
  }

  const ordered = [...activeHoles].sort((a, b) => {
    if (a.stroke_index !== b.stroke_index) {
      return a.stroke_index - b.stroke_index;
    }
    return a.hole_number - b.hole_number;
  });

  for (let i = 0; i < steps; i += 1) {
    const hole = ordered[i % ordered.length];
    allocation.set(hole.hole_number, (allocation.get(hole.hole_number) ?? 0) + strokeDelta);
  }

  return allocation;
}

export function countAppliedStrokesForCompletedHoles(params: {
  holeInputs: string[];
  activeHoles: ActiveHoleForStrokes[];
  strokeAllocationByHole: Map<number, number>;
}): number {
  const { holeInputs, activeHoles, strokeAllocationByHole } = params;

  let applied = 0;
  for (let i = 0; i < holeInputs.length && i < activeHoles.length; i += 1) {
    const value = holeInputs[i]?.trim() ?? "";
    if (value === "") {
      continue;
    }
    applied += strokeAllocationByHole.get(activeHoles[i].hole_number) ?? 0;
  }

  return applied;
}

export function calculateLiveNetFromHoleInputs(params: {
  holeInputs: string[];
  activeHoles: ActiveHoleForStrokes[];
  strokeAllocationByHole: Map<number, number>;
}): {
  grossTotal: number | null;
  appliedStrokesOnCompletedHoles: number;
  netTotal: number | null;
} {
  const grossTotal = calculatePartialGross(params.holeInputs);
  const appliedStrokesOnCompletedHoles = countAppliedStrokesForCompletedHoles({
    holeInputs: params.holeInputs,
    activeHoles: params.activeHoles,
    strokeAllocationByHole: params.strokeAllocationByHole,
  });

  if (grossTotal == null) {
    return {
      grossTotal: null,
      appliedStrokesOnCompletedHoles,
      netTotal: null,
    };
  }

  return {
    grossTotal,
    appliedStrokesOnCompletedHoles,
    netTotal: grossTotal - appliedStrokesOnCompletedHoles,
  };
}

export function buildLiveHoleScoring(params: {
  holeInputs: string[];
  activeHoles: Array<ActiveHoleForStrokes & { par?: number | null }>;
  strokeAllocationByHole: Map<number, number>;
}): {
  grossScoresByHole: Array<number | null>;
  allocatedStrokesByHole: Array<number>;
  netScoresByHole: Array<number | null>;
  scorecardCells: HoleScorecardCell[];
  grossTotal: number | null;
  netTotal: number | null;
} {
  const { holeInputs, activeHoles, strokeAllocationByHole } = params;
  const grossScoresByHole: Array<number | null> = [];
  const allocatedStrokesByHole: Array<number> = [];
  const netScoresByHole: Array<number | null> = [];
  const scorecardCells: HoleScorecardCell[] = [];

  let grossTotal = 0;
  let netTotal = 0;
  let hasAnyCompleted = false;

  for (let i = 0; i < holeInputs.length && i < activeHoles.length; i += 1) {
    const raw = holeInputs[i]?.trim() ?? "";
    const allocation = strokeAllocationByHole.get(activeHoles[i].hole_number) ?? 0;
    allocatedStrokesByHole.push(allocation);

    if (raw === "") {
      grossScoresByHole.push(null);
      netScoresByHole.push(null);
      scorecardCells.push({
        grossScore: null,
        netScore: null,
        par: activeHoles[i].par ?? null,
        scoreToPar: null,
        displayCategory: "blank",
      });
      continue;
    }

    const gross = Number(raw);
    if (!Number.isFinite(gross)) {
      grossScoresByHole.push(null);
      netScoresByHole.push(null);
      scorecardCells.push({
        grossScore: null,
        netScore: null,
        par: activeHoles[i].par ?? null,
        scoreToPar: null,
        displayCategory: "blank",
      });
      continue;
    }

    const net = gross - allocation;
    const par = activeHoles[i].par ?? null;
    const scoreToPar = par == null ? null : net - par;
    const displayCategory: ScorecardDisplayCategory =
      scoreToPar == null
        ? "par"
        : scoreToPar <= -2
          ? "eagle_or_better"
          : scoreToPar === -1
            ? "birdie"
            : scoreToPar === 0
              ? "par"
              : scoreToPar === 1
                ? "bogey"
                : "double_bogey_or_worse";

    grossScoresByHole.push(gross);
    netScoresByHole.push(net);
    scorecardCells.push({
      grossScore: gross,
      netScore: net,
      par,
      scoreToPar,
      displayCategory,
    });
    grossTotal += gross;
    netTotal += net;
    hasAnyCompleted = true;
  }

  while (allocatedStrokesByHole.length < activeHoles.length) {
    const hole = activeHoles[allocatedStrokesByHole.length];
    allocatedStrokesByHole.push(strokeAllocationByHole.get(hole.hole_number) ?? 0);
    grossScoresByHole.push(null);
    netScoresByHole.push(null);
    scorecardCells.push({
      grossScore: null,
      netScore: null,
      par: hole.par ?? null,
      scoreToPar: null,
      displayCategory: "blank",
    });
  }

  return {
    grossScoresByHole,
    allocatedStrokesByHole,
    netScoresByHole,
    scorecardCells,
    grossTotal: hasAnyCompleted ? grossTotal : null,
    netTotal: hasAnyCompleted ? netTotal : null,
  };
}
