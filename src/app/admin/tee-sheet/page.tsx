"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminSeasonSelector } from "@/components/admin/AdminSeasonSelector";
import { WeekControlParticipationTable } from "@/components/admin/WeekControlParticipationTable";
import { resolveWeekDropdownState } from "@/lib/getDashboardWeek";
import { createClient } from "@/lib/supabase/client";

type Season = {
  id: string;
  name: string;
  year: number;
  is_active: boolean;
};

type LeagueWeek = {
  id: string;
  week_number: number;
  week_date: string;
  play_date: string | null;
  is_finalized: boolean;
};

type Player = {
  id: string;
  full_name: string;
  cup: boolean;
};

type ParticipationRecord = {
  player_id: string;
};

type WeeklyTeeTimeRecord = {
  player_id: string;
  tee_time: string;
  group_number: number | null;
  position_in_group: number | null;
  notes: string | null;
};

type TeeSlot = {
  id: string;
  playerId: string;
  teeTime: string;
};

const TEE_TIME_OPTIONS = [
  { value: "16:50:00", label: "4:50 PM" },
  { value: "17:00:00", label: "5:00 PM" },
  { value: "17:10:00", label: "5:10 PM" },
];

const ALLOWED_TEE_TIMES = new Set(TEE_TIME_OPTIONS.map((option) => option.value));
const SLOTS_PER_TEE_TIME = 4;
const TOTAL_TEE_SLOTS = TEE_TIME_OPTIONS.length * SLOTS_PER_TEE_TIME;

function normalizeTeeTimeValue(raw: string): string {
  const parts = raw.split(":");
  if (parts.length < 2) {
    return "";
  }
  return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:00`;
}

function createDefaultSlots(): TeeSlot[] {
  return Array.from({ length: TOTAL_TEE_SLOTS }, (_, index) => {
    const teeTimeIndex = Math.floor(index / SLOTS_PER_TEE_TIME);
    return {
      id: `slot-${index + 1}`,
      playerId: "",
      teeTime: TEE_TIME_OPTIONS[teeTimeIndex]?.value ?? TEE_TIME_OPTIONS[0].value,
    };
  });
}

function shufflePlayers(input: Player[]): Player[] {
  const copy = [...input];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildTargetGroupSizes(playerCount: number): number[] {
  if (playerCount <= 0) return [];
  if (playerCount >= 12) return [4, 4, 4];
  if (playerCount === 11) return [3, 4, 4];
  if (playerCount === 10) return [3, 3, 4];
  if (playerCount === 9) return [3, 3, 3];
  if (playerCount === 8) return [4, 4];
  if (playerCount === 7) return [3, 4];
  if (playerCount === 6) return [3, 3];
  if (playerCount === 5) return [3, 2];
  return [playerCount];
}

export default function AdminTeeSheetPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [weeks, setWeeks] = useState<LeagueWeek[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [activePlayers, setActivePlayers] = useState<Player[]>([]);
  const [slots, setSlots] = useState<TeeSlot[]>(createDefaultSlots);
  const [notesByPlayerId, setNotesByPlayerId] = useState<Map<string, string>>(new Map());
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadWeeksForSeason = useCallback(async (seasonId: string) => {
    if (!seasonId) {
      setWeeks([]);
      setSelectedWeekId("");
      setLoadingWeeks(false);
      return;
    }

    const supabase = createClient();
    setLoadingWeeks(true);
    const { data, error: err } = await supabase
      .from("league_weeks")
      .select("id, week_number, week_date, play_date, is_finalized")
      .eq("season_id", seasonId)
      .order("week_number", { ascending: true });

    if (err) {
      setError(err.message);
      setWeeks([]);
      setLoadingWeeks(false);
      return;
    }

    const nextWeeks = (data as LeagueWeek[]) ?? [];
    const fallbackWeekId =
      nextWeeks.find((week) => !week.is_finalized)?.id ??
      nextWeeks[nextWeeks.length - 1]?.id ??
      "";
    const { filteredWeeks, initialWeekId } = await resolveWeekDropdownState({
      supabase,
      weeks: nextWeeks,
      fallbackWeekId,
    });
    setWeeks(filteredWeeks);
    setSelectedWeekId(initialWeekId);
    setLoadingWeeks(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("seasons")
      .select("id, name, year, is_active")
      .order("is_active", { ascending: false })
      .order("year", { ascending: false })
      .order("start_date", { ascending: false })
      .then(({ data: seasonData, error: seasonErr }) => {
        if (seasonErr) {
          setError(seasonErr.message);
          setSeasons([]);
          setWeeks([]);
          setLoadingWeeks(false);
          return;
        }

        const loadedSeasons = (seasonData as Season[]) ?? [];
        setSeasons(loadedSeasons);
        const initialSeasonId = loadedSeasons[0]?.id ?? "";
        setSelectedSeasonId(initialSeasonId);
        if (!initialSeasonId) {
          setWeeks([]);
          setLoadingWeeks(false);
          return;
        }
      });
  }, [loadWeeksForSeason]);

  useEffect(() => {
    if (!selectedSeasonId) return;
    void loadWeeksForSeason(selectedSeasonId);
  }, [selectedSeasonId, loadWeeksForSeason]);

  const loadData = useCallback(() => {
    if (!selectedWeekId) {
      setActivePlayers([]);
      setSlots(createDefaultSlots());
      setNotesByPlayerId(new Map());
      setDirty(false);
      return;
    }

    setLoadingRows(true);
    setSaveError(null);
    setError(null);
    const supabase = createClient();

    Promise.all([
      supabase
        .from("weekly_participation")
        .select("player_id")
        .eq("league_week_id", selectedWeekId)
        .eq("playing_this_week", true),
      supabase
        .from("weekly_tee_times")
        .select("player_id, tee_time, group_number, position_in_group, notes")
        .eq("week_id", selectedWeekId),
    ]).then(([partRes, teeTimesRes]) => {
      if (partRes.error) {
        setError(partRes.error.message);
        setActivePlayers([]);
        setSlots(createDefaultSlots());
        setLoadingRows(false);
        return;
      }

      if (teeTimesRes.error) {
        setError(teeTimesRes.error.message);
        setActivePlayers([]);
        setSlots(createDefaultSlots());
        setLoadingRows(false);
        return;
      }

      const participation = (partRes.data as ParticipationRecord[]) ?? [];
      const teeTimes = (teeTimesRes.data as WeeklyTeeTimeRecord[]) ?? [];
      const activePlayerIds = Array.from(new Set(participation.map((record) => record.player_id)));

      if (activePlayerIds.length === 0) {
        setActivePlayers([]);
        setSlots(createDefaultSlots());
        setNotesByPlayerId(new Map());
        setDirty(false);
        setLoadingRows(false);
        return;
      }

      supabase
        .from("players")
        .select("id, full_name, cup")
        .in("id", activePlayerIds)
        .order("full_name")
        .then(({ data: playersData, error: playersErr }) => {
          if (playersErr) {
            setError(playersErr.message);
            setActivePlayers([]);
            setSlots(createDefaultSlots());
            setLoadingRows(false);
            return;
          }

          const players =
            ((playersData as (Player & { cup: boolean | null })[]) ?? []).map((player) => ({
              ...player,
              cup: player.cup === true,
            })) ?? [];
          const validPlayerIds = new Set(players.map((player) => player.id));
          const playerNameById = new Map(players.map((player) => [player.id, player.full_name]));
          const teeTimeIndex = new Map(TEE_TIME_OPTIONS.map((option, index) => [option.value, index]));

          const defaultSlots = createDefaultSlots();
          const usedSlots = new Set<number>();
          const usedPlayers = new Set<string>();

          const sortedAssignments = [...teeTimes]
            .filter((assignment) => validPlayerIds.has(assignment.player_id))
            .sort((a, b) => {
              const timeA = normalizeTeeTimeValue(a.tee_time) || "99:99:99";
              const timeB = normalizeTeeTimeValue(b.tee_time) || "99:99:99";
              if (timeA !== timeB) {
                return timeA.localeCompare(timeB);
              }

              const groupA = a.group_number ?? Number.MAX_SAFE_INTEGER;
              const groupB = b.group_number ?? Number.MAX_SAFE_INTEGER;
              if (groupA !== groupB) {
                return groupA - groupB;
              }

              const positionA = a.position_in_group ?? Number.MAX_SAFE_INTEGER;
              const positionB = b.position_in_group ?? Number.MAX_SAFE_INTEGER;
              if (positionA !== positionB) {
                return positionA - positionB;
              }

              const nameA = playerNameById.get(a.player_id) ?? "";
              const nameB = playerNameById.get(b.player_id) ?? "";
              return nameA.localeCompare(nameB);
            });

          sortedAssignments.forEach((assignment) => {
            if (usedPlayers.has(assignment.player_id)) {
              return;
            }

            const normalizedTime = normalizeTeeTimeValue(assignment.tee_time);
            if (!ALLOWED_TEE_TIMES.has(normalizedTime)) {
              return;
            }

            let targetIndex: number | null = null;
            const timeBucketIndex = teeTimeIndex.get(normalizedTime);

            if (
              timeBucketIndex != null &&
              assignment.position_in_group != null &&
              assignment.position_in_group >= 1 &&
              assignment.position_in_group <= SLOTS_PER_TEE_TIME
            ) {
              const preferredIndex =
                timeBucketIndex * SLOTS_PER_TEE_TIME + (assignment.position_in_group - 1);
              if (!usedSlots.has(preferredIndex)) {
                targetIndex = preferredIndex;
              }
            }

            if (targetIndex == null && timeBucketIndex != null) {
              const start = timeBucketIndex * SLOTS_PER_TEE_TIME;
              for (let index = start; index < start + SLOTS_PER_TEE_TIME; index += 1) {
                if (!usedSlots.has(index)) {
                  targetIndex = index;
                  break;
                }
              }
            }

            if (targetIndex == null) {
              for (let index = 0; index < defaultSlots.length; index += 1) {
                if (!usedSlots.has(index)) {
                  targetIndex = index;
                  break;
                }
              }
            }

            if (targetIndex == null) {
              return;
            }

            defaultSlots[targetIndex] = {
              ...defaultSlots[targetIndex],
              playerId: assignment.player_id,
              teeTime: normalizedTime,
            };
            usedSlots.add(targetIndex);
            usedPlayers.add(assignment.player_id);
          });

          const nextNotes = new Map<string, string>();
          teeTimes.forEach((assignment) => {
            nextNotes.set(assignment.player_id, assignment.notes ?? "");
          });

          setActivePlayers(players);
          setSlots(defaultSlots);
          setNotesByPlayerId(nextNotes);
          setDirty(false);
          setLoadingRows(false);
        });
    });
  }, [selectedWeekId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? null,
    [weeks, selectedWeekId]
  );
  const isFinalized = selectedWeek?.is_finalized === true;

  const playerById = useMemo(
    () => new Map(activePlayers.map((player) => [player.id, player])),
    [activePlayers]
  );

  const assignedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    slots.forEach((slot) => {
      if (slot.playerId) {
        ids.add(slot.playerId);
      }
    });
    return ids;
  }, [slots]);

  const unassignedPlayers = useMemo(
    () => activePlayers.filter((player) => !assignedPlayerIds.has(player.id)),
    [activePlayers, assignedPlayerIds]
  );

  const boardGroupedByTime = useMemo(() => {
    const grouped = new Map<string, { index: number; playerName: string }[]>(
      TEE_TIME_OPTIONS.map((option) => [option.value, [] as { index: number; playerName: string }[]])
    );

    slots.forEach((slot, index) => {
      if (!slot.playerId || !ALLOWED_TEE_TIMES.has(slot.teeTime)) {
        return;
      }

      const player = playerById.get(slot.playerId);
      if (!player) {
        return;
      }

      grouped.get(slot.teeTime)?.push({
        index,
        playerName: player.full_name,
      });
    });

    return TEE_TIME_OPTIONS.map((option) => ({
      ...option,
      rows: (grouped.get(option.value) ?? []).sort((a, b) => a.index - b.index),
    }));
  }, [playerById, slots]);

  const onSlotChange = useCallback(
    (slotIndex: number, value: string) => {
      if (isFinalized) return;

      setSlots((prev) => {
        const next = prev.map((slot, index) => {
          if (index !== slotIndex) {
            return slot;
          }
          return {
            ...slot,
            playerId: value,
          };
        });

        if (value !== "") {
          for (let index = 0; index < next.length; index += 1) {
            if (index !== slotIndex && next[index]?.playerId === value) {
              next[index] = {
                ...next[index],
                playerId: "",
              };
            }
          }
        }

        return next;
      });
      setDirty(true);
    },
    [isFinalized]
  );

  const randomizeSlots = useCallback(() => {
    if (!selectedWeekId || activePlayers.length === 0 || isFinalized) return;

    setSaveError(null);
    const assignablePlayers = shufflePlayers(activePlayers).slice(0, TOTAL_TEE_SLOTS);
    const groupSizes = buildTargetGroupSizes(assignablePlayers.length);
    const groups = groupSizes.map((size) => ({
      size,
      players: [] as Player[],
    }));

    const nonCupPlayers = shufflePlayers(assignablePlayers.filter((player) => !player.cup));
    const cupPlayers = shufflePlayers(assignablePlayers.filter((player) => player.cup));
    const spreadGroupCount = Math.min(3, groups.length);
    let roundRobinIndex = spreadGroupCount > 0 ? Math.floor(Math.random() * spreadGroupCount) : 0;

    nonCupPlayers.forEach((player) => {
      if (spreadGroupCount === 0) return;
      let placed = false;
      for (let offset = 0; offset < spreadGroupCount; offset += 1) {
        const groupIndex = (roundRobinIndex + offset) % spreadGroupCount;
        const group = groups[groupIndex];
        if (!group || group.players.length >= group.size) continue;
        group.players.push(player);
        roundRobinIndex = (groupIndex + 1) % spreadGroupCount;
        placed = true;
        break;
      }

      if (!placed) {
        for (let index = 0; index < groups.length; index += 1) {
          const group = groups[index];
          if (!group || group.players.length >= group.size) continue;
          group.players.push(player);
          break;
        }
      }
    });

    cupPlayers.forEach((player) => {
      for (let index = 0; index < groups.length; index += 1) {
        const group = groups[index];
        if (!group || group.players.length >= group.size) continue;
        group.players.push(player);
        break;
      }
    });

    const nextSlots = createDefaultSlots();
    groups.forEach((group, groupIndex) => {
      group.players.forEach((player, positionIndex) => {
        const slotIndex = groupIndex * SLOTS_PER_TEE_TIME + positionIndex;
        if (!nextSlots[slotIndex]) return;
        nextSlots[slotIndex] = {
          ...nextSlots[slotIndex],
          playerId: player.id,
        };
      });
    });

    setSlots(nextSlots);
    setDirty(true);
  }, [selectedWeekId, activePlayers, isFinalized]);

  const slotSections = useMemo(
    () =>
      TEE_TIME_OPTIONS.map((option, teeTimeIndex) => {
        const start = teeTimeIndex * SLOTS_PER_TEE_TIME;
        const sectionSlots = slots.slice(start, start + SLOTS_PER_TEE_TIME).map((slot, sectionIndex) => ({
          slot,
          slotIndex: start + sectionIndex,
          spotNumber: start + sectionIndex + 1,
        }));
        return {
          teeTime: option,
          rows: sectionSlots,
        };
      }),
    [slots]
  );

  const saveTeeSheet = useCallback(async () => {
    if (!selectedWeekId || activePlayers.length === 0 || isFinalized) return;

    const assignedSlots = slots.filter((slot) => slot.playerId !== "");

    const playerSet = new Set<string>();
    for (const slot of assignedSlots) {
      if (!ALLOWED_TEE_TIMES.has(slot.teeTime)) {
        setSaveError("Assigned players must use one of the allowed tee times.");
        return;
      }

      if (playerSet.has(slot.playerId)) {
        setSaveError("Each player can only be assigned to one tee sheet spot.");
        return;
      }
      playerSet.add(slot.playerId);
    }

    setSaveError(null);
    setSaving(true);

    const supabase = createClient();
    const playerIds = activePlayers.map((player) => player.id);
    const groupByTeeTime = new Map(TEE_TIME_OPTIONS.map((option, index) => [option.value, index + 1]));
    const positionsByTime = new Map<string, number>();

    const payload = slots.flatMap((slot) => {
      if (!slot.playerId || !ALLOWED_TEE_TIMES.has(slot.teeTime)) {
        return [];
      }

      const nextPosition = (positionsByTime.get(slot.teeTime) ?? 0) + 1;
      positionsByTime.set(slot.teeTime, nextPosition);

      const groupNumber = groupByTeeTime.get(slot.teeTime);
      if (groupNumber == null) {
        return [];
      }

      const notes = (notesByPlayerId.get(slot.playerId) ?? "").trim();

      return [
        {
          week_id: selectedWeekId,
          player_id: slot.playerId,
          tee_time: slot.teeTime,
          group_number: groupNumber,
          position_in_group: nextPosition,
          notes: notes === "" ? null : notes,
          updated_at: new Date().toISOString(),
        },
      ];
    });

    const { error: deleteError } = await supabase
      .from("weekly_tee_times")
      .delete()
      .eq("week_id", selectedWeekId)
      .in("player_id", playerIds);

    if (deleteError) {
      setSaveError(deleteError.message);
      setSaving(false);
      return;
    }

    if (payload.length > 0) {
      const { error: insertError } = await supabase.from("weekly_tee_times").insert(payload);

      if (insertError) {
        setSaveError(insertError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setDirty(false);
    loadData();
  }, [activePlayers, isFinalized, loadData, notesByPlayerId, selectedWeekId, slots]);

  if (loadingWeeks) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-zinc-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex justify-end">
        <Link
          href="/admin"
          className="shrink-0 text-sm font-medium text-white hover:text-emerald-200 transition-colors"
        >
          ← Admin
        </Link>
      </div>

      <AdminSeasonSelector
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onChange={setSelectedSeasonId}
        className="mb-4"
      />

      <div className="mb-6">
        <label
          htmlFor="week-select"
          className="mb-2 block text-sm font-medium text-zinc-700"
        >
          League week
        </label>
        <select
          id="week-select"
          value={selectedWeekId}
          onChange={(event) => setSelectedWeekId(event.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Select a week…</option>
          {weeks.map((week) => (
            <option key={week.id} value={week.id}>
              Week {week.week_number} — {week.play_date ?? week.week_date}
            </option>
          ))}
        </select>
      </div>

      {selectedWeekId && isFinalized && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This week is finalized and tee assignments are read-only.
        </div>
      )}

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

      <section className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900">Tee Sheet Board</h2>

        <div className="grid gap-4 lg:grid-cols-3">
          {boardGroupedByTime.map((slot) => (
            <div
              key={`slot-${slot.value}`}
              className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
            >
              <h3 className="mb-2 text-sm font-semibold text-zinc-800">{slot.label}</h3>
              {slot.rows.length === 0 ? (
                <p className="text-sm text-zinc-500">No players assigned.</p>
              ) : (
                <div className="space-y-2">
                  {slot.rows.map((row) => (
                    <div
                      key={`slot-${slot.value}-${row.index}`}
                      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      <p className="font-medium text-zinc-900">{row.playerName}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={randomizeSlots}
          disabled={!selectedWeekId || loadingRows || activePlayers.length === 0 || isFinalized}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Randomize Slots
        </button>
        <button
          type="button"
          onClick={saveTeeSheet}
          disabled={!selectedWeekId || loadingRows || saving || activePlayers.length === 0 || isFinalized}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isFinalized ? "Week Finalized" : saving ? "Saving…" : dirty ? "Save Tee Sheet" : "Saved"}
        </button>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Assign 12 Tee Sheet Spots</h2>
            <p className="text-sm text-zinc-600">Assign players into the four spots for each tee time.</p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            Unassigned players: <span className="font-semibold text-zinc-900">{unassignedPlayers.length}</span>
          </div>
        </div>

        {!selectedWeekId ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
            Select a week.
          </p>
        ) : loadingRows ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
            Loading…
          </p>
        ) : activePlayers.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
            No active players found for this week.
          </p>
        ) : (
          <div className="space-y-4">
            {slotSections.map((section) => (
              <div key={section.teeTime.value} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <h3 className="mb-3 text-sm font-semibold text-zinc-800">{section.teeTime.label}</h3>
                <div className="space-y-3">
                  {section.rows.map(({ slot, slotIndex, spotNumber }) => {
                    const selectedInOtherSlots = new Set(
                      slots
                        .filter((otherSlot, otherIndex) => otherIndex !== slotIndex && otherSlot.playerId !== "")
                        .map((otherSlot) => otherSlot.playerId)
                    );

                    const playerOptions = activePlayers.filter(
                      (player) => player.id === slot.playerId || !selectedInOtherSlots.has(player.id)
                    );

                    return (
                      <div
                        key={slot.id}
                        className="rounded-md border border-zinc-200 bg-white p-3"
                      >
                        <label className="block text-sm text-zinc-700">
                          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                            Spot {spotNumber}
                          </span>
                          <select
                            value={slot.playerId}
                            disabled={isFinalized}
                            onChange={(event) => onSlotChange(slotIndex, event.target.value)}
                            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="">Open Spot</option>
                            {playerOptions.map((player) => (
                              <option key={player.id} value={player.id}>
                                {player.full_name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <WeekControlParticipationTable selectedWeekId={selectedWeekId} isFinalized={isFinalized} />
      </section>
    </div>
  );
}
