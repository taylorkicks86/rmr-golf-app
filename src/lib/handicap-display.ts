export function formatHandicapForDisplay(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }

  if (value < 0) {
    return `+${Math.abs(value)}`;
  }

  return String(value);
}
