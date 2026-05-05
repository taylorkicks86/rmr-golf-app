"use client";

import { useCallback, useEffect, useState } from "react";

import { getCupTeamPlayingConflict } from "@/lib/cup-team-playing-guard";
import { createClient } from "@/lib/supabase/client";

type Player = {
  id: string;
  full_name: string;
  paid: boolean;
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

type ReminderResponse = {
  error?: string;
  totalRecipients?: number;
  sent?: number;
  failed?: number;
  results?: Array<{
    playerId: string;
    playerName: string;
    email: string;
    status: "sent" | "skipped" | "failed";
    message?: string;
  }>;
};

type WeekControlParticipationTableProps = {
  selectedWeekId: string;
  isFinalized: boolean;
  onParticipationChange?: () => void;
};

export function WeekControlParticipationTable({
  selectedWeekId,
  isFinalized,
  onParticipationChange,
}: WeekControlParticipationTableProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingPlayerId, setSavingPlayerId] = useState<string | null>(null);
  const [reminderPlayer, setReminderPlayer] = useState<Player | null>(null);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);

  const loadData = useCallback(() => {
    if (!selectedWeekId) {
      setRows([]);
      setError(null);
      setSaveError(null);
      return;
    }

    setLoadingRows(true);
    setSaveError(null);
    setReminderMessage(null);
    setError(null);
    const supabase = createClient();

    Promise.all([
      supabase
        .from("players")
        .select("id, full_name, paid, cup")
        .order("paid", { ascending: false })
        .order("full_name"),
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

      if (nextPlaying === true && row.player.cup && nextCup === true) {
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
      onParticipationChange?.();

      if (!row.participation) {
        loadData();
      }
    },
    [isFinalized, loadData, onParticipationChange, selectedWeekId]
  );

  const onPlayingChange = useCallback(
    (row: Row, checked: boolean) => {
      if (isFinalized) return;
      persist(row, checked, checked ? row.player.cup : false);
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

  const getRsvpStatus = (playing: boolean | null) => {
    if (playing === true) {
      return {
        label: "Yes",
        className: "bg-emerald-100 text-emerald-700",
      };
    }
    if (playing === false) {
      return {
        label: "No",
        className: "bg-rose-100 text-rose-700",
      };
    }
    return {
      label: "Undecided",
      className: "bg-zinc-100 text-zinc-700",
    };
  };

  const sendReminder = useCallback(async () => {
    if (!selectedWeekId || !reminderPlayer) return;

    setSendingReminder(true);
    setReminderMessage(null);
    const response = await fetch("/api/admin/rsvp-reminders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        weekId: selectedWeekId,
        targetMode: "players",
        playerIds: [reminderPlayer.id],
      }),
    });

    const body = (await response.json().catch(() => null)) as ReminderResponse | null;
    if (!response.ok) {
      setReminderMessage(body?.error ?? "Failed to send reminder.");
      setSendingReminder(false);
      return;
    }

    const failedResult = body?.results?.find((result) => result.status === "failed");
    if (failedResult) {
      setReminderMessage(failedResult.message ?? "Reminder failed to send.");
      setSendingReminder(false);
      return;
    }

    setReminderMessage(`Reminder sent to ${reminderPlayer.full_name}.`);
    setSendingReminder(false);
    setReminderPlayer(null);
  }, [reminderPlayer, selectedWeekId]);

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

      {reminderMessage && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {reminderMessage}
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
                Status
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Playing
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                Cup Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {!selectedWeekId ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  Select a week.
                </td>
              </tr>
            ) : loadingRows ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  No players found.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const saving = savingPlayerId === row.player.id;
                const status = getRsvpStatus(row.playing_this_week);
                return (
                  <tr key={row.player.id} className="transition-colors hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900">
                      <button
                        type="button"
                        onClick={() => {
                          setReminderMessage(null);
                          setReminderPlayer(row.player);
                        }}
                        disabled={isFinalized || !selectedWeekId}
                        className="font-medium text-emerald-700 underline-offset-2 transition-colors hover:text-emerald-800 hover:underline disabled:cursor-not-allowed disabled:text-zinc-500 disabled:no-underline"
                      >
                        {row.player.full_name}
                        {!row.player.paid && <span className="ml-2 text-xs font-normal text-zinc-400">Sub</span>}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
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

      {reminderPlayer && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-reminder-title"
        >
          <div className="w-full max-w-md rounded-lg border border-emerald-900/20 bg-white shadow-xl">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h3 id="send-reminder-title" className="text-lg font-semibold text-zinc-900">
                Send Reminder
              </h3>
              <p className="mt-1 text-sm text-zinc-600">
                Send an RSVP reminder email to {reminderPlayer.full_name} for this week?
              </p>
            </div>
            {reminderMessage && (
              <div className="mx-5 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {reminderMessage}
              </div>
            )}
            <div className="flex justify-end gap-3 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setReminderPlayer(null);
                  setReminderMessage(null);
                }}
                disabled={sendingReminder}
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
              >
                No
              </button>
              <button
                type="button"
                onClick={sendReminder}
                disabled={sendingReminder}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {sendingReminder ? "Sending..." : "Yes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
