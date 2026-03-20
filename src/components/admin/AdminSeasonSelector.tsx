"use client";

type SeasonOption = {
  id: string;
  name: string;
  year: number;
  is_active: boolean;
};

type AdminSeasonSelectorProps = {
  seasons: SeasonOption[];
  selectedSeasonId: string;
  onChange: (seasonId: string) => void;
  disabled?: boolean;
  className?: string;
};

export function AdminSeasonSelector({
  seasons,
  selectedSeasonId,
  onChange,
  disabled = false,
  className = "",
}: AdminSeasonSelectorProps) {
  if (seasons.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <label htmlFor="admin-season-select" className="mb-1 block text-sm font-medium text-zinc-700">
        Season
      </label>
      <select
        id="admin-season-select"
        value={selectedSeasonId}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 sm:max-w-sm"
      >
        {seasons.map((season) => (
          <option key={season.id} value={season.id}>
            {season.name} ({season.year}){season.is_active ? " • Active" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
