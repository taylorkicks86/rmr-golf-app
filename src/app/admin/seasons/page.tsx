"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Season = {
  id: string;
  name: string;
  year: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type SeasonFormState = {
  id: string | null;
  name: string;
  year: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

function sortSeasons(list: Season[]): Season[] {
  return [...list].sort((a, b) => {
    if (a.year !== b.year) {
      return b.year - a.year;
    }
    return b.start_date.localeCompare(a.start_date);
  });
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return date.toLocaleDateString();
}

export default function AdminSeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [seasonForm, setSeasonForm] = useState<SeasonFormState | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("seasons")
      .select("id, name, year, start_date, end_date, is_active, created_at, updated_at")
      .order("year", { ascending: false })
      .order("start_date", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          setSeasons([]);
        } else {
          setSeasons(sortSeasons((data as Season[]) ?? []));
        }
        setLoading(false);
      });
  }, []);

  const openCreateModal = () => {
    setActionError(null);
    setActionSuccess(null);
    setSeasonForm({
      id: null,
      name: "",
      year: "",
      start_date: "",
      end_date: "",
      is_active: false,
    });
  };

  const openEditModal = (season: Season) => {
    setActionError(null);
    setActionSuccess(null);
    setSeasonForm({
      id: season.id,
      name: season.name,
      year: String(season.year),
      start_date: season.start_date,
      end_date: season.end_date,
      is_active: season.is_active,
    });
  };

  const saveSeason = async () => {
    if (!seasonForm) {
      return;
    }

    const trimmedName = seasonForm.name.trim();
    const parsedYear = Number.parseInt(seasonForm.year, 10);
    const start = seasonForm.start_date.trim();
    const end = seasonForm.end_date.trim();

    if (!trimmedName) {
      setActionError("Season name is required.");
      return;
    }

    if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      setActionError("Year must be a valid 4-digit year.");
      return;
    }

    if (!start || !end) {
      setActionError("Start date and end date are required.");
      return;
    }

    if (end < start) {
      setActionError("End date cannot be earlier than start date.");
      return;
    }

    setSaving(true);
    setActionError(null);
    setActionSuccess(null);

    const supabase = createClient();
    const payload = {
      name: trimmedName,
      year: parsedYear,
      start_date: start,
      end_date: end,
      is_active: seasonForm.is_active,
    };

    let response:
      | { data: Season | null; error: { message: string } | null }
      | null = null;

    if (seasonForm.is_active) {
      let clearExistingActiveQuery = supabase.from("seasons").update({ is_active: false });
      if (seasonForm.id) {
        clearExistingActiveQuery = clearExistingActiveQuery.neq("id", seasonForm.id);
      }
      const { error: clearActiveError } = await clearExistingActiveQuery;
      if (clearActiveError) {
        setActionError(clearActiveError.message);
        setSaving(false);
        return;
      }
    }

    if (seasonForm.id) {
      const result = await supabase
        .from("seasons")
        .update(payload)
        .eq("id", seasonForm.id)
        .select("id, name, year, start_date, end_date, is_active, created_at, updated_at")
        .single();
      response = {
        data: (result.data as Season | null) ?? null,
        error: result.error ? { message: result.error.message } : null,
      };
    } else {
      const result = await supabase
        .from("seasons")
        .insert(payload)
        .select("id, name, year, start_date, end_date, is_active, created_at, updated_at")
        .single();
      response = {
        data: (result.data as Season | null) ?? null,
        error: result.error ? { message: result.error.message } : null,
      };
    }

    if (response.error || !response.data) {
      setActionError(response.error?.message ?? "Failed to save season.");
      setSaving(false);
      return;
    }

    setSeasons((prev) => {
      const responseSeason = response!.data!;
      const normalizedResponse = seasonForm.is_active
        ? { ...responseSeason, is_active: true }
        : responseSeason;
      const next = seasonForm.id
        ? prev.map((season) => {
            if (season.id === normalizedResponse.id) {
              return normalizedResponse;
            }
            if (seasonForm.is_active) {
              return { ...season, is_active: false };
            }
            return season;
          })
        : [
            ...prev.map((season) => (seasonForm.is_active ? { ...season, is_active: false } : season)),
            normalizedResponse,
          ];
      return sortSeasons(next);
    });

    setActionSuccess(seasonForm.id ? "Season updated." : "Season created.");
    setSeasonForm(null);
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-zinc-600">Loading seasons…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Create Season
          </button>
          <Link href="/admin" className="shrink-0 text-sm font-medium text-white hover:text-emerald-200 transition-colors">
            ← Admin
          </Link>
        </div>
      </div>

      {actionError && <p className="mb-4 text-sm text-red-600">Error: {actionError}</p>}
      {actionSuccess && <p className="mb-4 text-sm text-emerald-700">{actionSuccess}</p>}

      <div className="space-y-3 md:hidden">
        {seasons.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500">
            No seasons found.
          </div>
        ) : (
          seasons.map((season) => (
            <article key={season.id} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <p className="text-zinc-500">Name</p>
                <p className="text-right font-medium text-zinc-900">{season.name}</p>
                <p className="text-zinc-500">Year</p>
                <p className="text-right font-medium text-zinc-900">{season.year}</p>
                <p className="text-zinc-500">Start</p>
                <p className="text-right font-medium text-zinc-900">{season.start_date}</p>
                <p className="text-zinc-500">End</p>
                <p className="text-right font-medium text-zinc-900">{season.end_date}</p>
                <p className="text-zinc-500">Active</p>
                <p className="text-right font-medium text-zinc-900">{season.is_active ? "Yes" : "No"}</p>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => openEditModal(season)}
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  Edit
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-zinc-200 md:block">
        <table className="min-w-full divide-y divide-zinc-200">
          <thead className="bg-zinc-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Name
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Year
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Start
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                End
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Active
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Updated
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {seasons.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  No seasons found.
                </td>
              </tr>
            ) : (
              seasons.map((season) => (
                <tr key={season.id} className="transition-colors hover:bg-zinc-50">
                  <td className="px-4 py-3 text-sm font-medium text-zinc-900">{season.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">{season.year}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-600">{season.start_date}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-600">{season.end_date}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">{season.is_active ? "Yes" : "No"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">{formatTimestamp(season.updated_at)}</td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      type="button"
                      onClick={() => openEditModal(season)}
                      className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {seasonForm && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (!saving) {
                setSeasonForm(null);
              }
            }}
          />
          <div className="relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-lg sm:rounded-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">
                {seasonForm.id ? "Edit Season" : "Create Season"}
              </h2>
              <button
                type="button"
                onClick={() => setSeasonForm(null)}
                disabled={saving}
                className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Season Name</label>
                <input
                  type="text"
                  value={seasonForm.name}
                  onChange={(event) =>
                    setSeasonForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Year</label>
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  step="1"
                  value={seasonForm.year}
                  onChange={(event) =>
                    setSeasonForm((prev) => (prev ? { ...prev, year: event.target.value } : prev))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Start Date</label>
                <input
                  type="date"
                  value={seasonForm.start_date}
                  onChange={(event) =>
                    setSeasonForm((prev) => (prev ? { ...prev, start_date: event.target.value } : prev))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">End Date</label>
                <input
                  type="date"
                  value={seasonForm.end_date}
                  onChange={(event) =>
                    setSeasonForm((prev) => (prev ? { ...prev, end_date: event.target.value } : prev))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={seasonForm.is_active}
                  onChange={(event) =>
                    setSeasonForm((prev) => (prev ? { ...prev, is_active: event.target.checked } : prev))
                  }
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-medium text-zinc-700">Set as active season</span>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setSeasonForm(null)}
                disabled={saving}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveSeason}
                disabled={saving}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : seasonForm.id ? "Save Changes" : "Create Season"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
