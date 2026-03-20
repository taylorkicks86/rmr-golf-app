"use client";

import { useCallback, useEffect, useState } from "react";

import { getCupTeamPlayingConflict } from "@/lib/cup-team-playing-guard";
import { createClient } from "@/lib/supabase/client";

type Player = {
  id: string;
  full_name: string;
  cup: boolean;
};

type ParticipationRecord = {
  id: string;
  player_id: string;
  playing_this_week: boolean | null;
  cup: boolean;
};

type Row = {
  player: Player;
  participation: ParticipationRecord | null;
  playing_this_week: boolean | null;
  cup: boolean;
};

type WeekControlParticipationTableProps = {
  selectedWeekId: string;
  isFinalized: boolean;
};

export function WeekControlParticipationTable({
  selectedWeekId,
  isFinalized,
}: WeekControlParticipationTableProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingPlayerId, setSavingPlayerId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    if (!selectedWeekId) {
      setRows([]);
      setError(null);
      setSaveError(null);
      return;
    }

    setLoadingRows(true);
    setSaveError(null);
    setError(null);
    const supabase = createClient();

    Promise.all([
      supabase.from("players").select("id, full_name, cup").order("full_name"),
      supabase
        .from("weekly_participation")
        .select("id, player_id, playing_this_week, cup, attendance_status")
        .eq("league_week_id", selectedWeekId),
    ]).then(([playersRes, partRes]) => {
      if (playersRes.error) {
        setError(playersRes.error.message);
        setRows([]);
        setLoadingRows(false);
        return;
      }

      if (partRes.error) {
        setError(partRes.error.message);
        setRows([]);
        setLoadingRows(false);
        return;
      }

      const players = (playersRes.data as Player[]) ?? [];
      const records = (partRes.data as ParticipationRecord[]) ?? [];
      const byPlayer = new Map(records.map((record) => [record.player_id, record]));
      const merged: Row[] = players.map((player) => {
        const record = byPlayer.get(player.id) ?? null;
        const playing = record?.playing_this_week ?? null;
        return {
          player,
          participation: record,
          playing_this_week: playing,
          cup: player.cup && playing === true ? (record?.cup ?? false) : false,
        };
      });

      setRows(merged);
      setLoadingRows(false);
    });
  }, [selectedWeekId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const persist = useCallback(
    async (row: Row, nextPlaying: boolean | null, nextCup: boolean) => {
      if (isFinalized || !selectedWeekId) return;

      setSaveError(null);
      setSavingPlayerId(row.player.id);
      const supabase = createClient();

      if (nextPlaying === true && row.player.cup) {
        const conflictCheck = await getCupTeamPlayingConflict({
          supabase,
          leagueWeekId: selectedWeekId,
          playerId: row.player.id,
        });
        if (conflictCheck.error) {
          setSaveError(conflictCheck.error);
          setSavingPlayerId(null);
          return;
        }
        if (conflictCheck.hasConflict) {
          setSaveError("Only one member of a 2-player Cup team can be marked playing for this week.");
          setSavingPlayerId(null);
          loadData();
          return;
        }
      }

      const attendanceStatus =
        nextPlaying === true ? "playing" : nextPlaying === false ? "not_playing" : "no_response";
      const enforcedCup = row.player.cup && nextPlaying === true ? nextCup : false;
      if (row.participation) {
        const { error: updateError } = await supabase
          .from("weekly_participation")
          .update({
            playing_this_week: nextPlaying,
            cup: enforcedCup,
            attendance_status: attendanceStatus,
          })
          .eq("id", row.participation.id);
        if (updateError) {
          setSaveError(updateError.message);
          setSavingPlayerId(null);
          return;
        }
      } else {
        const { error: insertError } = await supabase.from("weekly_participation").insert({
          league_week_id: selectedWeekId,
          player_id: row.player.id,
          playing_this_week: nextPlaying,
          cup: enforcedCup,
          attendance_status: attendanceStatus,
        });
        if (insertError) {
          setSaveError(insertError.message);
          setSavingPlayerId(null);
          return;
        }
      }

      setRows((prev) =>
        prev.map((current) =>
          current.player.id === row.player.id
            ? {
                ...current,
                playing_this_week: nextPlaying,
                cup: enforcedCup,
                participation: current.participation
                  ? { ...current.participation, playing_this_week: nextPlaying, cup: enforcedCup }
                  : current.participation,
              }
            : current
        )
      );
      setSavingPlayerId(null);

      if (!row.participation) {
        loadData();
      }
    },
    [isFinalized, loadData, selectedWeekId]
  );

  const onPlayingChange = useCallback(
    (row: Row, checked: boolean) => {
      if (isFinalized) return;
      persist(row, checked, checked ? row.cup : false);
    },
    [isFinalized, persist]
  );

  const onCupChange = useCallback(
    (row: Row, checked: boolean) => {
      if (isFinalized) return;
      if (!row.player.cup || row.playing_this_week !== true) return;
      persist(row, true, checked);
    },
    [isFinalized, persist]
  );

  return (
    <>
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {saveError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200">
        <table className="min-w-full divide-y divide-zinc-200">
          <thead className="bg-zinc-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Player
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Playing This Week
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Cup
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {!selectedWeekId ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                  Select a week.
                </td>
              </tr>
            ) : loadingRows ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                  No players found.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const saving = savingPlayerId === row.player.id;
                return (
                  <tr key={row.player.id} className="transition-colors hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900">
                      {row.player.full_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={row.playing_this_week === true}
                          disabled={saving || isFinalized}
                          onChange={(event) => onPlayingChange(row, event.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        {saving && <span className="text-xs text-zinc-500">Saving…</span>}
                      </label>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={row.cup}
                          disabled={saving || isFinalized || !row.player.cup || row.playing_this_week !== true}
                          onChange={(event) => onCupChange(row, event.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        {!row.player.cup && (
                          <span className="text-[11px] text-zinc-400">Player not Cup-eligible</span>
                        )}
                      </label>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
