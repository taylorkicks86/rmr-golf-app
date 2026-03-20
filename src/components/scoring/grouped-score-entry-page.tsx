"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Fragment } from "react";

import { AdminSeasonSelector } from "@/components/admin/AdminSeasonSelector";
import { createClient } from "@/lib/supabase/client";
import { resolveWeekDropdownState } from "@/lib/getDashboardWeek";
import {
  allocateHandicapStrokesAcrossHoles,
  buildLiveHoleScoring,
  calculateNineHoleStrokesReceived,
} from "@/lib/live-scoring";
import { formatHandicapForDisplay } from "@/lib/handicap-display";
import { resolvePlayerProfileForUser } from "@/lib/player-profile";
import { PageHeader } from "@/components/ui/PageHeader";

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
  is_finalized: boolean;
};

type Player = {
  id: string;
  full_name: string;
  handicap_index: number;
};

type ParticipationRecord = {
  player_id: string;
};

type HoleScoreRecord = {
  player_id: string;
  hole_number: number;
  strokes: number;
};

type WeeklyScoreRecord = {
  player_id: string;
  gross_score: number;
  is_scorecard_signed: boolean;
  scorecard_signed_at: string | null;
};

type WeeklyHandicapRecord = {
  player_id: string;
  final_computed_handicap: number;
};

type TeeAssignmentRecord = {
  player_id: string;
  tee_time: string;
  group_number: number | null;
  position_in_group: number | null;
};

type ActiveHole = {
  hole_number: number;
  par: number | null;
  stroke_index: number;
  yards: number | null;
  side: "front" | "back";
};

type Row = {
  player: Player;
  holes: string[];
  existingGross: number | null;
  isScorecardSigned: boolean;
  scorecardSignedAt: string | null;
};

type GroupSection = {
  key: string;
  label: string;
  teeTimeLabel: string | null;
  sortTeeTime: string;
  sortGroupNumber: number;
  rows: Row[];
};

const DEFAULT_ACTIVE_HOLES: ActiveHole[] = Array.from({ length: 9 }, (_, index) => ({
  hole_number: index + 1,
  par: null,
  stroke_index: index + 1,
  yards: null,
  side: "front",
}));

function buildEmptyHoles(): string[] {
  return Array.from({ length: 9 }, () => "");
}

function normalizeTeeTimeValue(raw: string): string {
  const parts = raw.split(":");
  if (parts.length < 2) {
    return "";
  }

  return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:00`;
}

function formatTeeTimeLabel(raw: string): string {
  const normalized = normalizeTeeTimeValue(raw);
  const [hoursPart, minutesPart] = normalized.split(":");
  const hours = Number.parseInt(hoursPart ?? "", 10);
  const minutes = Number.parseInt(minutesPart ?? "", 10);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return raw;
  }

  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function assignmentGroupKey(assignment: TeeAssignmentRecord): string {
  const teeTime = normalizeTeeTimeValue(assignment.tee_time);
  const groupNumber = assignment.group_number ?? 0;
  return `group:${groupNumber}:${teeTime}`;
}

type GroupedScoreEntryPageProps = {
  requireAdmin: boolean;
  allowScorecardSigning: boolean;
  showFinalizedBanner?: boolean;
  actionsRowAboveWeekSelect?: boolean;
  hideWeekSelectLabel?: boolean;
  contentMaxWidthClass?: string;
  title: string;
  subtitle: string;
  backHref: string;
  backLabel: string;
};

const SCORE_GRID_CLASS = "grid grid-cols-9 gap-0.5";
const SCORE_ROW_CLASS = "grid grid-cols-[88px_minmax(0,1fr)] items-center gap-1";
const SCORE_GRID_WRAP_CLASS = "w-full max-w-[17.5rem] sm:max-w-[19.5rem] md:max-w-[22rem]";
const SCORE_CELL_CLASS =
  "aspect-square w-full rounded-none border border-zinc-400/90 bg-white text-center text-xs font-semibold text-zinc-900";

function renderNetScoreIndicator(cell: {
  netScore: number | null;
  displayCategory:
    | "eagle_or_better"
    | "birdie"
    | "par"
    | "bogey"
    | "double_bogey_or_worse"
    | "blank";
}) {
  if (cell.netScore == null || cell.displayCategory === "blank") {
    return null;
  }

  const common =
    "relative inline-flex h-6 w-6 items-center justify-center text-[11px] font-medium leading-none text-zinc-900";

  if (cell.displayCategory === "eagle_or_better") {
    return (
      <span className={`${common} rounded-full border border-zinc-700`}>
        <span aria-hidden className="absolute inset-[2px] rounded-full border border-zinc-700" />
        <span className="relative">{cell.netScore}</span>
      </span>
    );
  }

  if (cell.displayCategory === "birdie") {
    return <span className={`${common} rounded-full border border-zinc-700`}>{cell.netScore}</span>;
  }

  if (cell.displayCategory === "bogey") {
    return <span className={`${common} rounded-[2px] border border-zinc-700`}>{cell.netScore}</span>;
  }

  if (cell.displayCategory === "double_bogey_or_worse") {
    return (
      <span className={`${common} rounded-[2px] border border-zinc-700`}>
        <span aria-hidden className="absolute inset-[2px] rounded-[1px] border border-zinc-700" />
        <span className="relative">{cell.netScore}</span>
      </span>
    );
  }

  return <span className="text-[11px] font-medium leading-none text-zinc-900">{cell.netScore}</span>;
}

export function GroupedScoreEntryPage({
  requireAdmin,
  allowScorecardSigning,
  showFinalizedBanner = true,
  actionsRowAboveWeekSelect = false,
  hideWeekSelectLabel = false,
  contentMaxWidthClass = "max-w-[90rem]",
  title,
  subtitle,
  backHref,
  backLabel,
}: GroupedScoreEntryPageProps) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [weeks, setWeeks] = useState<LeagueWeek[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sessionDetected, setSessionDetected] = useState<boolean | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [activePlayerCount, setActivePlayerCount] = useState(0);
  const [holeScoreRowCount, setHoleScoreRowCount] = useState(0);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [currentPlayerIsAdmin, setCurrentPlayerIsAdmin] = useState<boolean | null>(null);
  const [teeAssignments, setTeeAssignments] = useState<TeeAssignmentRecord[]>([]);
  const [activeHoles, setActiveHoles] = useState<ActiveHole[]>(DEFAULT_ACTIVE_HOLES);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data, error: authErr }) => {
      if (authErr) {
        setSessionError(authErr.message);
        setSessionDetected(false);
        return;
      }

      const authUser = data.user;
      setSessionDetected(Boolean(authUser));

      if (!authUser) {
        setCurrentPlayerId(null);
        setCurrentPlayerIsAdmin(false);
        return;
      }

      resolvePlayerProfileForUser({
        supabase,
        userId: authUser.id,
        userEmail: authUser.email ?? null,
      }).then((result) => {
        if (result.status === "resolved") {
          setCurrentPlayerId(result.player.id);
          setCurrentPlayerIsAdmin(result.player.is_admin);
          return;
        }

        if (result.status === "error" || result.status === "conflict") {
          setSessionError(result.message);
        }
        setCurrentPlayerId(null);
        setCurrentPlayerIsAdmin(false);
      });
    });

    supabase
      .from("seasons")
      .select("id, name, year, is_active")
      .order("is_active", { ascending: false })
      .order("year", { ascending: false })
      .order("start_date", { ascending: false })
      .then(({ data: seasonData, error: seasonErr }) => {
        if (seasonErr) {
          setError(seasonErr.message);
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

        if (requireAdmin) {
          return;
        }

        supabase
          .from("league_weeks")
          .select("id, week_number, week_date, is_finalized")
          .eq("season_id", initialSeasonId)
          .order("week_number", { ascending: true })
          .then(async ({ data, error: err }) => {
            if (err) {
              setError(err.message);
              setWeeks([]);
            } else {
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
            }
            setLoadingWeeks(false);
          });
      });
  }, [requireAdmin]);

  useEffect(() => {
    if (!requireAdmin) {
      return;
    }
    if (!selectedSeasonId) {
      setWeeks([]);
      setSelectedWeekId("");
      return;
    }

    const supabase = createClient();
    setLoadingWeeks(true);
    supabase
      .from("league_weeks")
      .select("id, week_number, week_date, is_finalized")
      .eq("season_id", selectedSeasonId)
      .order("week_number", { ascending: true })
      .then(async ({ data, error: err }) => {
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
        setSelectedWeekId((prev) =>
          prev && filteredWeeks.some((week) => week.id === prev) ? prev : initialWeekId
        );
        setLoadingWeeks(false);
      });
  }, [requireAdmin, selectedSeasonId]);

  const loadData = useCallback(() => {
    if (!selectedWeekId) {
      setRows([]);
      setTeeAssignments([]);
      setActiveHoles(DEFAULT_ACTIVE_HOLES);
      setDirty(false);
      return;
    }

    setLoadingRows(true);
    setSaveError(null);
    setError(null);
    setActivePlayerCount(0);
    setHoleScoreRowCount(0);
    const supabase = createClient();

    Promise.all([
      supabase
        .from("weekly_participation")
        .select("player_id")
        .eq("league_week_id", selectedWeekId)
        .eq("playing_this_week", true),
      supabase
        .from("hole_scores")
        .select("player_id, hole_number, strokes")
        .eq("league_week_id", selectedWeekId),
      supabase
        .from("weekly_scores")
        .select("player_id, gross_score, is_scorecard_signed, scorecard_signed_at")
        .eq("league_week_id", selectedWeekId),
      fetch(`/api/weeks/${selectedWeekId}/tee-assignments`, { cache: "no-store" }).then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | {
              error?: string;
              assignments?: TeeAssignmentRecord[];
            }
          | null;

        if (!response.ok) {
          return {
            error: body?.error ?? "Failed to load tee assignments.",
            assignments: null,
          };
        }

        return {
          error: null,
          assignments: body?.assignments ?? null,
        };
      }),
      fetch(`/api/weeks/${selectedWeekId}/active-holes`, { cache: "no-store" }).then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | {
              error?: string;
              holes?: ActiveHole[];
            }
          | null;

        if (!response.ok) {
          return {
            error: body?.error ?? "Failed to load active holes.",
            holes: null,
          };
        }

        return {
          error: null,
          holes: body?.holes ?? null,
        };
      }),
    ]).then(([partRes, holeScoresRes, scoresRes, teeAssignmentsRes, activeHolesRes]) => {
      if (partRes.error) {
        setError(partRes.error.message);
        setRows([]);
        setTeeAssignments([]);
        setLoadingRows(false);
        return;
      }

      if (holeScoresRes.error) {
        setError(holeScoresRes.error.message);
        setRows([]);
        setTeeAssignments([]);
        setLoadingRows(false);
        return;
      }

      if (scoresRes.error) {
        setError(scoresRes.error.message);
        setRows([]);
        setTeeAssignments([]);
        setLoadingRows(false);
        return;
      }

      if (teeAssignmentsRes.error) {
        setError(teeAssignmentsRes.error);
        setRows([]);
        setTeeAssignments([]);
        setLoadingRows(false);
        return;
      }

      if (activeHolesRes.error) {
        setError(activeHolesRes.error);
      }

      const participation = (partRes.data as ParticipationRecord[]) ?? [];
      const holeScores = (holeScoresRes.data as HoleScoreRecord[]) ?? [];
      const scores = (scoresRes.data as WeeklyScoreRecord[]) ?? [];
      const teeTimes = (teeAssignmentsRes.assignments as TeeAssignmentRecord[] | null) ?? [];
      const resolvedActiveHoles =
        (activeHolesRes.holes ?? [])
          .slice()
          .sort((a, b) => a.hole_number - b.hole_number)
          .slice(0, 9);
      setActiveHoles(resolvedActiveHoles.length === 9 ? resolvedActiveHoles : DEFAULT_ACTIVE_HOLES);

      const activePlayerIds = new Set(participation.map((record) => record.player_id));
      const orderedActivePlayerIds = Array.from(activePlayerIds);
      setActivePlayerCount(orderedActivePlayerIds.length);
      setHoleScoreRowCount(holeScores.length);

      if (orderedActivePlayerIds.length === 0) {
        setRows([]);
        setTeeAssignments([]);
        setDirty(false);
        setLoadingRows(false);
        return;
      }

      Promise.all([
        supabase
          .from("players")
          .select("id, full_name, handicap_index")
          .in("id", orderedActivePlayerIds)
          .order("full_name"),
        supabase
          .from("weekly_handicaps")
          .select("player_id, final_computed_handicap")
          .eq("league_week_id", selectedWeekId)
          .in("player_id", orderedActivePlayerIds),
      ]).then(([playersRes, weeklyHandicapsRes]) => {
          if (playersRes.error) {
            setError(playersRes.error.message);
            setRows([]);
            setTeeAssignments([]);
            setLoadingRows(false);
            return;
          }
          if (weeklyHandicapsRes.error) {
            setError(weeklyHandicapsRes.error.message);
            setRows([]);
            setTeeAssignments([]);
            setLoadingRows(false);
            return;
          }

          const players = (playersRes.data as Player[]) ?? [];
          const weeklyHandicaps =
            (weeklyHandicapsRes.data as WeeklyHandicapRecord[] | null) ?? [];
          const weeklyHandicapByPlayerId = new Map(
            weeklyHandicaps.map((row) => [row.player_id, Number(row.final_computed_handicap)])
          );
          const holesByPlayerId = new Map<string, string[]>();
          const grossByPlayerId = new Map(
            scores.map((record) => [record.player_id, Number(record.gross_score)])
          );
          const signedByPlayerId = new Map(
            scores.map((record) => [
              record.player_id,
              {
                isSigned: record.is_scorecard_signed === true,
                signedAt: record.scorecard_signed_at ?? null,
              },
            ])
          );

          holeScores.forEach((record) => {
            const existing = holesByPlayerId.get(record.player_id) ?? buildEmptyHoles();
            const holeIndex = Number(record.hole_number) - 1;
            if (holeIndex >= 0 && holeIndex < 9) {
              existing[holeIndex] = String(record.strokes);
            }
            holesByPlayerId.set(record.player_id, existing);
          });

          const nextRows: Row[] = players
            .filter((player) => activePlayerIds.has(player.id))
            .map((player) => ({
              player: {
                ...player,
                handicap_index:
                  weeklyHandicapByPlayerId.get(player.id) ??
                  Number(player.handicap_index),
              },
              holes: holesByPlayerId.get(player.id) ?? buildEmptyHoles(),
              existingGross: grossByPlayerId.get(player.id) ?? null,
              isScorecardSigned: signedByPlayerId.get(player.id)?.isSigned ?? false,
              scorecardSignedAt: signedByPlayerId.get(player.id)?.signedAt ?? null,
            }));

          setRows(nextRows);
          setTeeAssignments(teeTimes.filter((assignment) => activePlayerIds.has(assignment.player_id)));
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

  const groupedSections = useMemo<GroupSection[]>(() => {
    if (rows.length === 0) {
      return [];
    }

    const byPlayerId = new Map(rows.map((row) => [row.player.id, row]));
    const activePlayerIds = new Set(rows.map((row) => row.player.id));
    const sectionsByKey = new Map<string, GroupSection>();

    const addRowToSection = (section: GroupSection, row: Row) => {
      section.rows.push(row);
    };

    const assignments = teeAssignments.filter((assignment) => activePlayerIds.has(assignment.player_id));
    const assignmentMap = new Map(assignments.map((assignment) => [assignment.player_id, assignment]));

    const hasAnyAssignments = assignments.some((assignment) => activePlayerIds.has(assignment.player_id));

    if (!hasAnyAssignments) {
      return [];
    }

    assignmentMap.forEach((assignment, playerId) => {
      if (!activePlayerIds.has(playerId)) {
        return;
      }

      const key = assignmentGroupKey(assignment);
      const teeTime = normalizeTeeTimeValue(assignment.tee_time);
      const groupNumber = assignment.group_number ?? Number.MAX_SAFE_INTEGER;

      if (!sectionsByKey.has(key)) {
        sectionsByKey.set(key, {
          key,
          label: groupNumber === Number.MAX_SAFE_INTEGER ? "Group -" : `Group ${groupNumber}`,
          teeTimeLabel: teeTime ? formatTeeTimeLabel(teeTime) : "No tee time",
          sortTeeTime: teeTime || "99:99:99",
          sortGroupNumber: groupNumber,
          rows: [],
        });
      }

      const row = byPlayerId.get(playerId);
      if (row) {
        addRowToSection(sectionsByKey.get(key)!, row);
      }
    });

    const orderedAssigned = Array.from(sectionsByKey.values())
      .map((section) => ({
        ...section,
        rows: section.rows.sort((a, b) => {
          const assignmentA = assignmentMap.get(a.player.id);
          const assignmentB = assignmentMap.get(b.player.id);
          const positionA = assignmentA?.position_in_group ?? Number.MAX_SAFE_INTEGER;
          const positionB = assignmentB?.position_in_group ?? Number.MAX_SAFE_INTEGER;
          if (positionA !== positionB) {
            return positionA - positionB;
          }
          return a.player.full_name.localeCompare(b.player.full_name);
        }),
      }))
      .sort((a, b) => {
        if (a.sortTeeTime !== b.sortTeeTime) {
          return a.sortTeeTime.localeCompare(b.sortTeeTime);
        }
        if (a.sortGroupNumber !== b.sortGroupNumber) {
          return a.sortGroupNumber - b.sortGroupNumber;
        }
        return a.label.localeCompare(b.label);
      });

    const currentAssignment =
      currentPlayerId != null ? assignmentMap.get(currentPlayerId) ?? null : null;
    const currentGroupKey = currentAssignment != null ? assignmentGroupKey(currentAssignment) : null;

    const reordered = [...orderedAssigned];
    if (currentGroupKey) {
      const idx = reordered.findIndex((section) => section.key === currentGroupKey);
      if (idx > 0) {
        const [mine] = reordered.splice(idx, 1);
        reordered.unshift(mine);
      }
    }

    return reordered;
  }, [rows, currentPlayerId, teeAssignments]);

  const currentUserGroupKey = useMemo(() => {
    const containingSection = groupedSections.find((section) =>
      section.rows.some((row) => row.player.id === currentPlayerId)
    );
    return containingSection?.key ?? null;
  }, [groupedSections, currentPlayerId]);

  const adminCanEditAllGroups = requireAdmin && currentPlayerIsAdmin === true;

  const editableGroupKeys = useMemo(() => {
    if (isFinalized) {
      return new Set<string>();
    }
    if (adminCanEditAllGroups) {
      return new Set(groupedSections.map((section) => section.key));
    }
    if (!currentUserGroupKey) return new Set<string>();
    return new Set([currentUserGroupKey]);
  }, [adminCanEditAllGroups, groupedSections, currentUserGroupKey, isFinalized]);

  const showNoAssignmentState =
    !requireAdmin &&
    selectedWeekId !== "" &&
    !loadingRows &&
    rows.length > 0 &&
    currentPlayerId != null &&
    currentUserGroupKey == null;

  const editableGroupRows = useMemo(() => {
    const rowsInEditableGroups: Row[] = [];
    groupedSections.forEach((section) => {
      if (!editableGroupKeys.has(section.key)) {
        return;
      }
      section.rows.forEach((row) => rowsInEditableGroups.push(row));
    });
    return rowsInEditableGroups;
  }, [groupedSections, editableGroupKeys]);

  const isGroupScorecardSigned =
    allowScorecardSigning &&
    editableGroupRows.length > 0 &&
    editableGroupRows.every((row) => row.isScorecardSigned);

  const currentSigningRow = useMemo(() => {
    if (!allowScorecardSigning || !currentPlayerId) {
      return null;
    }
    return editableGroupRows.find((row) => row.player.id === currentPlayerId) ?? null;
  }, [allowScorecardSigning, currentPlayerId, editableGroupRows]);

  const isCurrentPlayerScorecardSigned =
    allowScorecardSigning && currentSigningRow?.isScorecardSigned === true;

  const editablePlayerIds = useMemo(() => {
    const ids = new Set<string>();
    groupedSections.forEach((section) => {
      if (!editableGroupKeys.has(section.key)) {
        return;
      }
      section.rows.forEach((row) => {
        if (!requireAdmin && row.isScorecardSigned) {
          return;
        }
        ids.add(row.player.id);
      });
    });
    return ids;
  }, [groupedSections, editableGroupKeys, requireAdmin]);

  const signGroupScorecard = useCallback(async () => {
    if (
      !selectedWeekId ||
      !allowScorecardSigning ||
      isFinalized ||
      !currentSigningRow ||
      isCurrentPlayerScorecardSigned
    ) {
      return;
    }

    const hasAllNineScoresForCurrentPlayer = currentSigningRow.holes.every(
      (value) => value.trim() !== ""
    );
    if (!hasAllNineScoresForCurrentPlayer) {
      setSaveError("You must enter all 9 holes for your score before signing.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure your score is correct?\nOnce signed, your scorecard will be finalized."
    );
    if (!confirmed) {
      return;
    }

    setSaveError(null);

    const response = await fetch("/api/scorecards/sign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        weekId: selectedWeekId,
        playerId: currentSigningRow.player.id,
      }),
    });

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setSaveError(body?.error ?? "Failed to sign scorecard.");
      return;
    }

    const signedAt = new Date().toISOString();
    setRows((prev) =>
      prev.map((entry) =>
        entry.player.id === currentSigningRow.player.id
          ? {
              ...entry,
              isScorecardSigned: true,
              scorecardSignedAt: signedAt,
            }
          : entry
      )
    );
    setDirty(false);
  }, [
    allowScorecardSigning,
    currentSigningRow,
    isCurrentPlayerScorecardSigned,
    isFinalized,
    selectedWeekId,
  ]);

  const onHoleChange = useCallback(
    (playerId: string, holeIndex: number, value: string) => {
      if (isFinalized || !editablePlayerIds.has(playerId)) return;
      setRows((prev) =>
        prev.map((row) => {
          if (row.player.id !== playerId) {
            return row;
          }
          const nextHoles = [...row.holes];
          nextHoles[holeIndex] = value;
          return { ...row, holes: nextHoles };
        })
      );
      setDirty(true);
    },
    [isFinalized, editablePlayerIds]
  );

  const saveScores = useCallback(async () => {
    if (!selectedWeekId || isFinalized || isGroupScorecardSigned) return;

    const editableRows = rows.filter((row) => editablePlayerIds.has(row.player.id));
    if (editableRows.length === 0) {
      return;
    }

    const invalid = editableRows.find((row) =>
      row.holes.some((value) => {
        const trimmed = value.trim();
        if (trimmed === "") {
          return false;
        }
        const strokes = Number(trimmed);
        return !Number.isInteger(strokes) || strokes < 1 || strokes > 12;
      })
    );

    if (invalid) {
      setSaveError("Hole scores must be whole numbers between 1 and 12.");
      return;
    }

    setSaveError(null);
    setSaving(true);

    const supabase = createClient();
    const activePlayerIds = editableRows.map((row) => row.player.id);

    const holePayload = editableRows.flatMap((row) =>
      row.holes.flatMap((value, holeIndex) => {
        const trimmed = value.trim();
        if (trimmed === "") {
          return [];
        }

        return [
          {
            league_week_id: selectedWeekId,
            player_id: row.player.id,
            hole_number: holeIndex + 1,
            strokes: Number.parseInt(trimmed, 10),
          },
        ];
      })
    );

    const completeWeeklyPayload = editableRows.flatMap((row) => {
      const entered = row.holes.map((value) => value.trim());
      if (entered.some((value) => value === "")) {
        return [];
      }

      const grossScore = entered.reduce((sum, value) => sum + Number.parseInt(value, 10), 0);
      return [
        {
          league_week_id: selectedWeekId,
          player_id: row.player.id,
          gross_score: grossScore,
        },
      ];
    });

    const { error: deleteHoleError } = await supabase
      .from("hole_scores")
      .delete()
      .eq("league_week_id", selectedWeekId)
      .in("player_id", activePlayerIds);

    if (deleteHoleError) {
      setSaveError(deleteHoleError.message);
      setSaving(false);
      return;
    }

    if (holePayload.length > 0) {
      const { error: insertHoleError } = await supabase
        .from("hole_scores")
        .insert(holePayload);

      if (insertHoleError) {
        setSaveError(insertHoleError.message);
        setSaving(false);
        return;
      }
    }

    const { error: deleteWeeklyError } = await supabase
      .from("weekly_scores")
      .delete()
      .eq("league_week_id", selectedWeekId)
      .in("player_id", activePlayerIds);

    if (deleteWeeklyError) {
      setSaveError(deleteWeeklyError.message);
      setSaving(false);
      return;
    }

    if (completeWeeklyPayload.length > 0) {
      const { error: upsertWeeklyError } = await supabase
        .from("weekly_scores")
        .upsert(completeWeeklyPayload, { onConflict: "league_week_id,player_id" });

      if (upsertWeeklyError) {
        setSaveError(upsertWeeklyError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setDirty(false);
    loadData();
  }, [rows, selectedWeekId, loadData, isFinalized, editablePlayerIds, isGroupScorecardSigned]);

  const renderGroupSection = (section: GroupSection) => {
    const sectionEditable =
      editableGroupKeys.has(section.key) &&
      !isFinalized &&
      !(allowScorecardSigning && isGroupScorecardSigned);

    return (
      <section
        key={section.key}
        className="overflow-x-auto rounded-lg border border-emerald-900/25 bg-[#f8f7f2] shadow-sm"
      >
        <div className="flex items-center justify-between gap-3 border-b border-emerald-950/35 bg-[#0f3b2e] px-3 py-2 text-white">
          <div>
            <p className="text-sm font-semibold tracking-wide text-white">{section.label}</p>
            <p className="text-xs text-emerald-100">
              {section.teeTimeLabel ? `Tee Time: ${section.teeTimeLabel}` : "Tee Time: Not assigned"}
            </p>
          </div>
          <p className="rounded border border-emerald-100/25 bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-50">
            {sectionEditable ? "Editable" : "Read-only"}
          </p>
        </div>

        {allowScorecardSigning ? (
          <div className="bg-[#fcfcf9]">
            <div className="mx-auto w-full md:w-fit">
              <div className="border-b border-emerald-900/20 bg-emerald-50/35 px-2 py-1.5">
                <div className={SCORE_ROW_CLASS}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/70">Hole</div>
                  <div className={SCORE_GRID_WRAP_CLASS}>
                    <div className={SCORE_GRID_CLASS}>
                      {activeHoles.map((hole) => (
                        <div
                          key={`${section.key}-h${hole.hole_number}`}
                          className="aspect-square flex items-center justify-center border border-emerald-900/25 bg-white text-xs font-semibold text-zinc-700"
                        >
                          {hole.hole_number}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className={`mt-1 ${SCORE_ROW_CLASS}`}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/70">Par</div>
                  <div className={SCORE_GRID_WRAP_CLASS}>
                    <div className={SCORE_GRID_CLASS}>
                      {activeHoles.map((hole) => (
                        <div
                          key={`${section.key}-par-${hole.hole_number}`}
                          className="aspect-square flex items-center justify-center border border-emerald-900/25 bg-white text-[10px] font-medium text-zinc-600"
                        >
                          {hole.par ?? "-"}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className={`mt-1 ${SCORE_ROW_CLASS}`}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/70">HCP</div>
                  <div className={SCORE_GRID_WRAP_CLASS}>
                    <div className={SCORE_GRID_CLASS}>
                      {activeHoles.map((hole) => (
                        <div
                          key={`${section.key}-hcp-${hole.hole_number}`}
                          className="aspect-square flex items-center justify-center border border-emerald-900/25 bg-white text-[10px] font-medium text-zinc-600"
                        >
                          {hole.stroke_index}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {section.rows.map((row) => {
                const strokesReceived = calculateNineHoleStrokesReceived({
                  handicapIndex: Number(row.player.handicap_index),
                });
                const strokeAllocationByHole = allocateHandicapStrokesAcrossHoles({
                  activeHoles,
                  totalStrokesReceived: strokesReceived,
                });
                const {
                  scorecardCells,
                  grossTotal: grossDisplay,
                  netTotal: netDisplay,
                } = buildLiveHoleScoring({
                  holeInputs: row.holes,
                  activeHoles,
                  strokeAllocationByHole,
                });

                return (
                  <div
                    key={`${section.key}-${row.player.id}`}
                    className="border-b border-zinc-300 px-2 py-2 transition-colors hover:bg-zinc-50/60"
                  >
                    <div className={`${SCORE_ROW_CLASS} items-start`}>
                      <div className="space-y-1.5">
                        <div className="space-y-1">
                          <h3 className="text-sm font-semibold leading-tight text-zinc-900">
                            {row.player.full_name}
                          </h3>
                          <div>
                            <span className="inline-flex rounded-sm border border-emerald-900/25 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900/85">
                              {formatHandicapForDisplay(strokesReceived)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 whitespace-nowrap text-[10px] leading-tight text-zinc-600 sm:text-xs">
                          <span className="font-semibold text-zinc-700">Gross: {grossDisplay ?? "-"}</span>
                          <span className="font-semibold text-emerald-800">Net: {netDisplay ?? "-"}</span>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className={SCORE_GRID_WRAP_CLASS}>
                          <div className={SCORE_GRID_CLASS}>
                            {row.holes.map((holeValue, holeIndex) => (
                              <input
                                key={`${section.key}-${row.player.id}-h${holeIndex + 1}`}
                                type="number"
                                min={1}
                                max={12}
                                step={1}
                                value={holeValue}
                                disabled={!sectionEditable || row.isScorecardSigned}
                                onChange={(event) =>
                                  onHoleChange(row.player.id, holeIndex, event.target.value)
                                }
                                className={`${SCORE_CELL_CLASS} min-w-0 p-0 text-xs leading-none shadow-none focus:border-emerald-600 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500`}
                                placeholder="-"
                              />
                            ))}
                          </div>
                          <div className={`mt-1 ${SCORE_GRID_CLASS}`}>
                            {activeHoles.map((hole, holeIndex) => {
                              const scoreCell = scorecardCells[holeIndex];
                              return (
                                <div
                                  key={`${section.key}-${row.player.id}-sc-${hole.hole_number}`}
                                  className="aspect-square flex items-center justify-center border border-emerald-900/25 bg-white text-base leading-none"
                                >
                                  {scoreCell ? renderNetScoreIndicator(scoreCell) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <table className="min-w-full">
            <thead className="bg-emerald-50/30">
              <tr>
                <th
                  scope="col"
                  className="px-3 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
                >
                  Hole
                </th>
                {activeHoles.map((hole) => (
                  <th
                    key={`${section.key}-h${hole.hole_number}`}
                    scope="col"
                    className="border border-emerald-900/25 bg-white px-0.5 py-1 text-center text-[11px] font-semibold tracking-wider text-zinc-700 sm:px-1"
                  >
                    {hole.hole_number}
                  </th>
                ))}
              </tr>
              <tr>
                <th
                  scope="col"
                  className="px-3 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                >
                  Par
                </th>
                {activeHoles.map((hole) => (
                  <th
                    key={`${section.key}-par-${hole.hole_number}`}
                    scope="col"
                    className="border border-emerald-900/25 bg-white px-0.5 py-0.5 text-center text-[10px] font-medium text-zinc-600 sm:px-1"
                  >
                    {hole.par ?? "-"}
                  </th>
                ))}
              </tr>
              <tr>
                <th
                  scope="col"
                  className="px-3 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                >
                  HCP
                </th>
                {activeHoles.map((hole) => (
                  <th
                    key={`${section.key}-hcp-${hole.hole_number}`}
                    scope="col"
                    className="border border-emerald-900/25 bg-white px-0.5 py-0.5 text-center text-[10px] font-medium text-zinc-600 sm:px-1"
                  >
                    {hole.stroke_index}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {section.rows.map((row) => {
                const strokesReceived = calculateNineHoleStrokesReceived({
                  handicapIndex: Number(row.player.handicap_index),
                });
                const strokeAllocationByHole = allocateHandicapStrokesAcrossHoles({
                  activeHoles,
                  totalStrokesReceived: strokesReceived,
                });
                const {
                  scorecardCells,
                  grossTotal: grossDisplay,
                  netTotal: netDisplay,
                } = buildLiveHoleScoring({
                  holeInputs: row.holes,
                  activeHoles,
                  strokeAllocationByHole,
                });

                return (
                  <Fragment key={`${section.key}-${row.player.id}`}>
                    <tr className="border-t border-zinc-200 transition-colors hover:bg-zinc-50">
                      <td className="w-40 px-3 py-1.5 align-top text-sm font-medium text-zinc-900 sm:w-44">
                        <div className="space-y-1">
                          <span className="block">{row.player.full_name}</span>
                          <span className="inline-flex rounded-sm border border-emerald-900/25 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900/85">
                            {formatHandicapForDisplay(strokesReceived)}
                          </span>
                        </div>
                      </td>
                      {row.holes.map((holeValue, holeIndex) => (
                        <td
                          key={`${section.key}-${row.player.id}-h${holeIndex + 1}`}
                          className="px-0.5 py-1 text-center sm:px-1"
                        >
                          <input
                            type="number"
                            min={1}
                            max={12}
                            step={1}
                            value={holeValue}
                            disabled={!sectionEditable}
                            onChange={(event) =>
                              onHoleChange(row.player.id, holeIndex, event.target.value)
                            }
                            className="h-9 w-9 rounded-none border border-zinc-400 bg-white p-0 text-center align-middle text-xs font-semibold leading-none text-zinc-900 shadow-none focus:border-emerald-600 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 sm:h-10 sm:w-10"
                            placeholder="-"
                          />
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-3 pb-1 text-left text-[10px] font-medium text-zinc-500" />
                      {activeHoles.map((hole, holeIndex) => {
                        const scoreCell = scorecardCells[holeIndex];
                        return (
                          <td
                            key={`${section.key}-${row.player.id}-sc-${hole.hole_number}`}
                            className="px-0.5 pb-1 text-center sm:px-1"
                          >
                            {scoreCell ? renderNetScoreIndicator(scoreCell) : null}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-b border-zinc-200">
                      <td
                        colSpan={activeHoles.length + 1}
                        className="px-3 pb-1.5 text-right text-[10px] font-medium text-zinc-500"
                      >
                        Gross: {grossDisplay ?? "-"}{" "}
                        <span className="ml-3">Net: {netDisplay ?? "-"}</span>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    );
  };

  if (loadingWeeks) {
    return (
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
        <p className="text-zinc-600">Loading…</p>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <PageHeader
          label="RMR CUP"
          title={title}
          subtitle={subtitle}
          backgroundImage="/images/backgrounds/rmr-course-bg.jpg"
          backgroundClassName="h-[58vh] max-h-[620px] min-h-[360px]"
          contentClassName="mx-auto flex min-h-[34vh] max-w-screen-xl flex-col px-4 py-6 pb-5 sm:px-5 sm:py-8 sm:pb-6"
          titleClassName="text-2xl sm:text-3xl"
          subtitleClassName="text-xs sm:text-sm"
          rightSlot={
            <Link href={backHref} className="text-sm font-medium text-emerald-100 hover:text-white hover:underline">
              ← {backLabel}
            </Link>
          }
        />

        <div className={`relative z-10 mx-auto -mt-12 w-full ${contentMaxWidthClass} px-3 pb-5 sm:-mt-8 sm:px-4 sm:pb-6`}>
          {requireAdmin && currentPlayerIsAdmin === false && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Admin access required for this page.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Query error: {error}
            </div>
          )}

          {showFinalizedBanner && selectedWeekId && isFinalized && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This week is finalized and read-only.
            </div>
          )}

          {saveError && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </div>
          )}

          <div className="relative z-20 ml-auto -mt-9 mb-1 w-full max-w-[350px] sm:-mt-4 sm:max-w-[360px]">
            {requireAdmin && (
              <AdminSeasonSelector
                seasons={seasons}
                selectedSeasonId={selectedSeasonId}
                onChange={setSelectedSeasonId}
                className="mb-2"
              />
            )}

            {actionsRowAboveWeekSelect ? (
              <div className="grid grid-cols-2 gap-2">
                {allowScorecardSigning && (
                  <button
                    type="button"
                    onClick={signGroupScorecard}
                    disabled={
                      !selectedWeekId ||
                      loadingRows ||
                      saving ||
                      isFinalized ||
                      !currentSigningRow ||
                      isCurrentPlayerScorecardSigned
                    }
                    className={
                      isCurrentPlayerScorecardSigned
                        ? "h-11 w-full cursor-not-allowed rounded-xl bg-zinc-200 px-2 text-sm font-medium text-zinc-600"
                        : "h-11 w-full rounded-xl border border-emerald-600 bg-white/85 px-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    }
                  >
                    {isCurrentPlayerScorecardSigned ? "Scorecard Signed ✓" : "Sign Scorecard"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={saveScores}
                  disabled={
                    (requireAdmin && currentPlayerIsAdmin !== true) ||
                    !selectedWeekId ||
                    loadingRows ||
                    saving ||
                    rows.length === 0 ||
                    isFinalized ||
                    isGroupScorecardSigned ||
                    editablePlayerIds.size === 0
                  }
                  className={`h-11 w-full rounded-xl bg-emerald-600 px-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 ${
                    !allowScorecardSigning ? "col-span-2" : ""
                  }`}
                >
                  {isFinalized ? "Week Finalized" : saving ? "Saving…" : dirty ? "Save Scores" : "Saved"}
                </button>
              </div>
            ) : null}

            {!hideWeekSelectLabel ? (
              <label
                htmlFor="week-select"
                className={`mb-0.5 block text-right text-sm font-medium text-zinc-800 ${actionsRowAboveWeekSelect ? "mt-2" : ""}`}
              >
                League week
              </label>
            ) : null}
            <select
              id="week-select"
              value={selectedWeekId}
              onChange={(event) => setSelectedWeekId(event.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white pl-2.5 pr-7 py-2 text-base text-zinc-900 shadow-sm sm:text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Select a week…</option>
              {weeks.map((week) => (
                <option key={week.id} value={week.id}>
                  Week {week.week_number} — {week.week_date}
                </option>
              ))}
            </select>

            {!actionsRowAboveWeekSelect ? (
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                {allowScorecardSigning && (
                  <button
                    type="button"
                    onClick={signGroupScorecard}
                    disabled={
                      !selectedWeekId ||
                      loadingRows ||
                      saving ||
                      isFinalized ||
                      !currentSigningRow ||
                      isCurrentPlayerScorecardSigned
                    }
                    className={
                      isCurrentPlayerScorecardSigned
                        ? "h-11 cursor-not-allowed rounded-xl bg-zinc-200 px-4 text-sm font-medium text-zinc-600"
                        : "h-11 rounded-xl border border-emerald-600 bg-white/85 px-4 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    }
                  >
                    {isCurrentPlayerScorecardSigned ? "Scorecard Signed ✓" : "Sign Scorecard"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={saveScores}
                  disabled={
                    (requireAdmin && currentPlayerIsAdmin !== true) ||
                    !selectedWeekId ||
                    loadingRows ||
                    saving ||
                    rows.length === 0 ||
                    isFinalized ||
                    isGroupScorecardSigned ||
                    editablePlayerIds.size === 0
                  }
                  className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isFinalized ? "Week Finalized" : saving ? "Saving…" : dirty ? "Save Scores" : "Saved"}
                </button>
              </div>
            ) : null}
          </div>

          {!selectedWeekId ? (
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <div className="px-4 py-8 text-center text-zinc-500">No week selected.</div>
            </div>
          ) : loadingRows ? (
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <div className="px-4 py-8 text-center text-zinc-500">Loading…</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <div className="px-4 py-8 text-center text-zinc-500">
                No active players found for this week.
              </div>
            </div>
          ) : showNoAssignmentState ? (
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <div className="px-4 py-8 text-center text-zinc-500">
                You are not assigned to a tee-time group for this week.
              </div>
            </div>
          ) : groupedSections.length === 0 ? (
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <div className="px-4 py-8 text-center text-zinc-500">
                No tee-time groups are assigned for this week.
              </div>
            </div>
          ) : (
            <div className="space-y-4">{groupedSections.map((section) => renderGroupSection(section))}</div>
          )}
        </div>
      </div>
    </>
  );
}
