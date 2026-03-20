import Link from "next/link";

import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";

type Player = {
  id: string;
  full_name: string;
  handicap_index: number;
  ghin: string;
};

export default async function PlayersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .select("id, full_name, handicap_index, ghin")
    .order("full_name", { ascending: true });

  const players = (data as Player[]) ?? [];

  return (
    <div className="relative -mt-2">
      <PageHeader
        label="RMR GOLF LEAGUE"
        title="Players"
        subtitle="Browse league players and view profiles."
        backgroundImage="/images/backgrounds/players-hero.jpg"
        backgroundClassName="min-h-[350px]"
        contentClassName="mx-auto flex min-h-[34vh] max-w-screen-xl flex-col px-4 py-6 pb-5 sm:px-5 sm:py-8 sm:pb-6"
        titleClassName="text-2xl sm:text-3xl"
        subtitleClassName="text-xs sm:text-sm"
      />

      <div className="relative z-10 mx-auto -mt-12 w-full max-w-5xl px-4 pb-5 sm:-mt-8 sm:pb-8">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-lg shadow-zinc-900/5 sm:p-5">
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Error: {error.message}
            </div>
          )}

          {!error && (
            <>
              <div className="mb-4 border-b border-zinc-200 pb-3">
                <h2 className="text-lg font-semibold text-zinc-900">
                  RMR Player Roster
                </h2>
              </div>

              <div className="space-y-3 sm:hidden">
                {players.length === 0 ? (
                  <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500">
                    No players found.
                  </div>
                ) : (
                  players.map((player) => (
                    <article
                      key={player.id}
                      className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-colors active:bg-zinc-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-base font-semibold text-zinc-900">{player.full_name}</h2>
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          HCP {player.handicap_index}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                        <p className="text-zinc-500">Handicap</p>
                        <p className="text-right font-medium text-zinc-900">{player.handicap_index}</p>
                        <p className="text-zinc-500">GHIN</p>
                        <p className="text-right font-medium tracking-wide text-zinc-900">{player.ghin}</p>
                      </div>
                      <div className="mt-3">
                        <Link
                          href={`/players/${player.id}`}
                          className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 active:bg-emerald-200/70"
                        >
                          View Profile
                        </Link>
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="hidden overflow-hidden rounded-xl border border-zinc-200/80 sm:block">
                <table className="min-w-full divide-y divide-zinc-200/90">
                  <thead className="bg-zinc-50/80">
                    <tr>
                      <th
                        scope="col"
                        className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
                      >
                        Player
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
                      >
                        Handicap
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
                      >
                        GHIN
                      </th>
                      <th
                        scope="col"
                        className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
                      >
                        View
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/90 bg-white">
                    {players.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                          No players found.
                        </td>
                      </tr>
                    ) : (
                      players.map((player) => (
                        <tr key={player.id} className="transition-colors hover:bg-zinc-50/80">
                          <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-zinc-900">
                            {player.full_name}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-zinc-600">
                            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                              {player.handicap_index}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm tracking-wide text-zinc-600">
                            {player.ghin}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm">
                            <Link
                              href={`/players/${player.id}`}
                              className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
