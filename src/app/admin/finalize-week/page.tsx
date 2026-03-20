"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminSeasonSelector } from "@/components/admin/AdminSeasonSelector";
import { createClient } from "@/lib/supabase/client";
import { resolveWeekDropdownState } from "@/lib/getDashboardWeek";
import {
  computeWeeklyCupResults,
} from "@/lib/cup-weekly-points";

type Season = {
  id: string;
  name: string;
  year: number;
  is_active: boolean;
};

type LeagueWeek = {
  id: string;
  season_id: string;
  week_number: number;
  week_date: string;
  is_finalized: boolean;
  week_type: "regular" | "playoff";
  status: "open" | "finalized" | "cancelled" | "rained_out";
};

type Player = {
  id: string;
  full_name: string;
};

type PlayerHandicap = {
  id: string;
  full_name: string;
  handicap_index: number;
};

type WeeklyHandicapRecord = {
  player_id: string;
  final_computed_handicap: number;
};

type ParticipationRecord = {
  player_id: string;
};

type WeeklyScoreRecord = {
  player_id: string;
  is_scorecard_signed: boolean;
};

type CupTeam = {
  id: string;
  name: string;
};

type CupTeamMember = {
  cup_team_id: string;
  player_id: string;
};

type PlayerCupData = {
  id: string;
  full_name: string;
  handicap_index: number;
  cup: boolean;
};

type WeeklyParticipationCupRecord = {
  player_id: string;
  cup: boolean;
  playing_this_week: boolean | null;
  cup_scorer_for_team_id: string | null;
};

type WeeklyCupScoreRecord = {
  player_id: string;
  gross_score: number;
};

type WeeklyCupResultSnapshotRecord = {
  player_id: string;
  gross_score: number | null;
  net_score: number | null;
  finish_position: number | null;
  points_earned: number;
};

type CupResultRow = {
  teamId: string;
  team: string;
  officialScorer: string | null;
  status: "Scored" | "DNP";
  finishPosition: number | null;
  isTiedFinish: boolean;
  gross: number | null;
  net: number | null;
  points: number;
  pointsSource: "team finish" | "DNP vacant split";
};

type WeekSummary = {
  activePlayersCount: number;
  scoresEnteredCount: number;
  missingScoreNames: string[];
  activePlayerNames: string[];
};

type LeaderboardPreviewRow = {
  full_name: string;
  gross_score: number;
  rank_position: number;
};

type PreviewRow = {
  rank: number;
  isTiedRank: boolean;
  player: string;
  gross: number;
  net: number;
  isSigned: boolean;
};

function resolveOfficialScorerByTeam(params: {
  teams: CupTeam[];
  members: CupTeamMember[];
  participation: WeeklyParticipationCupRecord[];
  players: PlayerCupData[];
}): {
  scorerByTeam: Map<string, string | null>;
  ambiguityErrors: string[];
} {
  const { teams, members, participation, players } = params;
  const membersByTeam = new Map<string, string[]>();
  members.forEach((member) => {
    const list = membersByTeam.get(member.cup_team_id) ?? [];
    list.push(member.player_id);
    membersByTeam.set(member.cup_team_id, list);
  });

  const participationByPlayerId = new Map(participation.map((record) => [record.player_id, record]));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const scorerByTeam = new Map<string, string | null>();
  const ambiguityErrors: string[] = [];

  teams.forEach((team) => {
    const teamMemberIds = membersByTeam.get(team.id) ?? [];
    const teamMemberSet = new Set(teamMemberIds);
    const designated = participation.find(
      (record) =>
        record.cup_scorer_for_team_id === team.id &&
        record.cup &&
        record.playing_this_week === true &&
        teamMemberSet.has(record.player_id)
    );

    if (designated?.player_id) {
      scorerByTeam.set(team.id, designated.player_id);
      return;
    }

    const eligiblePlayingMembers = teamMemberIds.filter((playerId) => {
      const player = playerById.get(playerId);
      const rec = participationByPlayerId.get(playerId);
      return Boolean(player?.cup) && rec?.cup === true && rec.playing_this_week === true;
    });

    if (eligiblePlayingMembers.length === 1) {
      scorerByTeam.set(team.id, eligiblePlayingMembers[0]);
      return;
    }

    if (eligiblePlayingMembers.length > 1) {
      ambiguityErrors.push(
        `${team.name}: multiple team members are marked playing. Mark only one player as playing for this week.`
      );
      scorerByTeam.set(team.id, null);
      return;
    }

    scorerByTeam.set(team.id, null);
  });

  return { scorerByTeam, ambiguityErrors };
}

export default function AdminFinalizeWeekPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [weeks, setWeeks] = useState<LeagueWeek[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [cupError, setCupError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [loadingCup, setLoadingCup] = useState(false);
  const [cupRows, setCupRows] = useState<CupResultRow[]>([]);

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
      .select("id, season_id, week_number, week_date, is_finalized, week_type, status")
      .eq("season_id", seasonId)
      .order("week_number", { ascending: true });

    if (err) {
      setError(err.message);
      setWeeks([]);
      setLoadingWeeks(false);
      return;
    }

    const nextWeeks = (data as LeagueWeek[]) ?? [];
    const { filteredWeeks, initialWeekId } = await resolveWeekDropdownState({
      supabase,
      weeks: nextWeeks,
      fallbackWeekId: "",
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

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.id === selectedWeekId) ?? null,
    [weeks, selectedWeekId]
  );
  const loadSummary = useCallback(() => {
    if (!selectedWeekId) {
      setSummary(null);
      setPreviewRows([]);
      setPreviewError(null);
      return;
    }

    setLoadingSummary(true);
    setSaveError(null);

    const supabase = createClient();

    Promise.all([
      supabase.from("players").select("id, full_name").order("full_name"),
      supabase
        .from("weekly_participation")
        .select("player_id")
        .eq("league_week_id", selectedWeekId)
        .eq("playing_this_week", true),
      supabase
        .from("weekly_scores")
        .select("player_id, is_scorecard_signed")
        .eq("league_week_id", selectedWeekId),
    ]).then(([playersRes, participationRes, scoresRes]) => {
      if (playersRes.error) {
        setError(playersRes.error.message);
        setSummary(null);
        setLoadingSummary(false);
        return;
      }

      if (participationRes.error) {
        setError(participationRes.error.message);
        setSummary(null);
        setLoadingSummary(false);
        return;
      }

      if (scoresRes.error) {
        setError(scoresRes.error.message);
        setSummary(null);
        setLoadingSummary(false);
        return;
      }

      const players = (playersRes.data as Player[]) ?? [];
      const participation = (participationRes.data as ParticipationRecord[]) ?? [];
      const scores = (scoresRes.data as WeeklyScoreRecord[]) ?? [];

      const activePlayerIds = new Set(participation.map((record) => record.player_id));
      const scoredPlayerIds = new Set(scores.map((record) => record.player_id));

      const activePlayers = players.filter((player) => activePlayerIds.has(player.id));
      const missingScoreNames = activePlayers
        .filter((player) => !scoredPlayerIds.has(player.id))
        .map((player) => player.full_name);

      setSummary({
        activePlayersCount: activePlayers.length,
        scoresEnteredCount: scores.length,
        missingScoreNames,
        activePlayerNames: activePlayers.map((player) => player.full_name),
      });
      setLoadingSummary(false);
    });
  }, [selectedWeekId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const loadPreview = useCallback(
    (activePlayerNames: string[]) => {
      if (!selectedWeekId) {
        setPreviewRows([]);
        return;
      }

      setLoadingPreview(true);
      setPreviewError(null);
      const supabase = createClient();

      Promise.all([
        supabase.rpc("get_weekly_leaderboard", { p_league_week_id: selectedWeekId }),
        supabase.from("players").select("id, full_name, handicap_index"),
        supabase
          .from("weekly_handicaps")
          .select("player_id, final_computed_handicap")
          .eq("league_week_id", selectedWeekId),
        supabase
          .from("weekly_scores")
          .select("player_id, is_scorecard_signed")
          .eq("league_week_id", selectedWeekId),
      ]).then(([leaderboardRes, playersRes, weeklyHandicapsRes, scoresRes]) => {
        if (leaderboardRes.error) {
          setPreviewError(leaderboardRes.error.message);
          setPreviewRows([]);
          setLoadingPreview(false);
          return;
        }

        if (playersRes.error) {
          setPreviewError(playersRes.error.message);
          setPreviewRows([]);
          setLoadingPreview(false);
          return;
        }
        if (weeklyHandicapsRes.error) {
          setPreviewError(weeklyHandicapsRes.error.message);
          setPreviewRows([]);
          setLoadingPreview(false);
          return;
        }
        if (scoresRes.error) {
          setPreviewError(scoresRes.error.message);
          setPreviewRows([]);
          setLoadingPreview(false);
          return;
        }

        const leaderboard =
          (leaderboardRes.data as LeaderboardPreviewRow[] | null) ?? [];
        const players = (playersRes.data as PlayerHandicap[]) ?? [];
        const weeklyHandicaps =
          (weeklyHandicapsRes.data as WeeklyHandicapRecord[] | null) ?? [];
        const scoreRows =
          (scoresRes.data as { player_id: string; is_scorecard_signed: boolean }[] | null) ?? [];
        const weeklyHandicapByPlayerId = new Map(
          weeklyHandicaps.map((row) => [row.player_id, Number(row.final_computed_handicap)])
        );
        const handicapByName = new Map(
          players.map((player) => [
            player.full_name,
            weeklyHandicapByPlayerId.get(player.id) ?? Number(player.handicap_index),
          ])
        );
        const playerNameById = new Map(
          players.map((player) => [player.id, player.full_name])
        );
        const signedByName = new Map<string, boolean>();
        scoreRows.forEach((scoreRow) => {
          const playerName = playerNameById.get(scoreRow.player_id);
          if (playerName) {
            signedByName.set(playerName, scoreRow.is_scorecard_signed === true);
          }
        });
        const activeNames = new Set(activePlayerNames);

        const rows: PreviewRow[] = leaderboard
          .filter((row) => activeNames.has(row.full_name))
          .map((row) => {
            const handicap = handicapByName.get(row.full_name) ?? 0;
            return {
              rank: 0,
              isTiedRank: false,
              player: row.full_name,
              gross: row.gross_score,
              net: Number((row.gross_score - handicap).toFixed(1)),
              isSigned: signedByName.get(row.full_name) === true,
            };
          })
          .sort((a, b) => {
            if (a.net !== b.net) return a.net - b.net;
            return a.player.localeCompare(b.player);
          })
          .map((row, rowIndex, sortedRows) => {
            const isSameNetAsPrevious = rowIndex > 0 && sortedRows[rowIndex - 1]?.net === row.net;
            const rank = isSameNetAsPrevious ? sortedRows[rowIndex - 1]!.rank : rowIndex + 1;
            const hasTie =
              (rowIndex > 0 && sortedRows[rowIndex - 1]?.net === row.net) ||
              (rowIndex < sortedRows.length - 1 && sortedRows[rowIndex + 1]?.net === row.net);
            return {
              ...row,
              rank,
              isTiedRank: hasTie,
            };
          });

        setPreviewRows(rows);
        setLoadingPreview(false);
      });
    },
    [selectedWeekId]
  );

  useEffect(() => {
    if (!selectedWeekId || !summary) {
      setPreviewRows([]);
      setPreviewError(null);
      return;
    }

    const shouldShowPreview =
      selectedWeek?.is_finalized === true || summary.missingScoreNames.length === 0;

    if (!shouldShowPreview) {
      setPreviewRows([]);
      setPreviewError(null);
      return;
    }

    loadPreview(summary.activePlayerNames);
  }, [selectedWeekId, summary, selectedWeek?.is_finalized, loadPreview]);

  const loadCupResults = useCallback(() => {
    if (!selectedWeekId || !selectedWeek) {
      setCupRows([]);
      setCupError(null);
      return;
    }

    setLoadingCup(true);
    setCupError(null);
    const supabase = createClient();

    Promise.all([
      supabase
        .from("cup_teams")
        .select("id, name")
        .eq("season_id", selectedWeek.season_id)
        .order("name"),
      supabase
        .from("cup_team_members")
        .select("cup_team_id, player_id")
        .eq("season_id", selectedWeek.season_id),
      supabase.from("players").select("id, full_name, handicap_index, cup"),
      supabase
        .from("weekly_participation")
        .select("player_id, cup, playing_this_week, cup_scorer_for_team_id")
        .eq("league_week_id", selectedWeekId),
      supabase
        .from("weekly_scores")
        .select("player_id, gross_score")
        .eq("league_week_id", selectedWeekId),
      supabase
        .from("weekly_handicaps")
        .select("player_id, final_computed_handicap")
        .eq("league_week_id", selectedWeekId),
      supabase
        .from("weekly_cup_results")
        .select("player_id, gross_score, net_score, finish_position, points_earned")
        .eq("league_week_id", selectedWeekId),
    ]).then(
      ([
        teamsRes,
        membersRes,
        playersRes,
        participationRes,
        scoresRes,
        weeklyHandicapsRes,
        cupResultsRes,
      ]) => {
        if (teamsRes.error) {
          setCupError(teamsRes.error.message);
          setCupRows([]);
          setLoadingCup(false);
          return;
        }
        if (membersRes.error) {
          setCupError(membersRes.error.message);
          setCupRows([]);
          setLoadingCup(false);
          return;
        }
        if (playersRes.error) {
          setCupError(playersRes.error.message);
          setCupRows([]);
          setLoadingCup(false);
          return;
        }
        if (participationRes.error) {
          setCupError(participationRes.error.message);
          setCupRows([]);
          setLoadingCup(false);
          return;
        }
        if (scoresRes.error) {
          setCupError(scoresRes.error.message);
          setCupRows([]);
          setLoadingCup(false);
          return;
        }
        if (weeklyHandicapsRes.error) {
          setCupError(weeklyHandicapsRes.error.message);
          setCupRows([]);
          setLoadingCup(false);
          return;
        }
        if (cupResultsRes.error) {
          setCupError(cupResultsRes.error.message);
          setCupRows([]);
          setLoadingCup(false);
          return;
        }
        const teams = (teamsRes.data as CupTeam[]) ?? [];
        const members = (membersRes.data as CupTeamMember[]) ?? [];
        const players = (playersRes.data as PlayerCupData[]) ?? [];
        const participation =
          (participationRes.data as WeeklyParticipationCupRecord[]) ?? [];
        const scores = (scoresRes.data as WeeklyCupScoreRecord[]) ?? [];
        const weeklyHandicaps =
          (weeklyHandicapsRes.data as WeeklyHandicapRecord[] | null) ?? [];
        const cupResults =
          (cupResultsRes.data as WeeklyCupResultSnapshotRecord[]) ?? [];
        const weeklyHandicapByPlayerId = new Map(
          weeklyHandicaps.map((row) => [row.player_id, Number(row.final_computed_handicap)])
        );
        const playersForCupScoring = players.map((player) => ({
          ...player,
          handicap_index: weeklyHandicapByPlayerId.get(player.id) ?? 0,
        }));
        const teamByPlayerId = new Map<string, string>();
        members.forEach((member) => {
          teamByPlayerId.set(member.player_id, member.cup_team_id);
        });

        const playerById = new Map(playersForCupScoring.map((player) => [player.id, player]));
        const { scorerByTeam } = resolveOfficialScorerByTeam({
          teams,
          members,
          participation,
          players: playersForCupScoring,
        });
        const officialScorerIds = Array.from(scorerByTeam.values()).filter((id): id is string => Boolean(id));
        const liveCupRows = computeWeeklyCupResults({
          players: playersForCupScoring,
          participation,
          scores: scores.map((score) => ({ player_id: score.player_id, gross_score: score.gross_score })),
          teamMembers: members,
          scoringPlayerIds: officialScorerIds,
        });
        const rowsSource = selectedWeek.is_finalized
          ? cupResults.map((row) => ({
              player_id: row.player_id,
              gross_score: row.gross_score,
              net_score: row.net_score,
              finish_position: row.finish_position,
              points_earned: row.points_earned,
            }))
          : liveCupRows;

        const rowByTeamId = new Map<string, WeeklyCupResultSnapshotRecord>();
        rowsSource.forEach((row) => {
          const teamId = teamByPlayerId.get(row.player_id);
          if (!teamId) return;

          const existing = rowByTeamId.get(teamId);
          if (!existing) {
            rowByTeamId.set(teamId, row);
            return;
          }

          const existingHasFinish = existing.finish_position != null;
          const incomingHasFinish = row.finish_position != null;
          if (incomingHasFinish && !existingHasFinish) {
            rowByTeamId.set(teamId, row);
            return;
          }

          if (incomingHasFinish === existingHasFinish) {
            const existingPoints = Number(existing.points_earned ?? 0);
            const incomingPoints = Number(row.points_earned ?? 0);
            if (incomingPoints > existingPoints) {
              rowByTeamId.set(teamId, row);
            }
          }
        });

        const persistedByTeamId = new Map<string, WeeklyCupResultSnapshotRecord>();
        cupResults.forEach((row) => {
          const teamId = teamByPlayerId.get(row.player_id);
          if (teamId && !persistedByTeamId.has(teamId)) {
            persistedByTeamId.set(teamId, row);
          }
        });
        const liveByTeamId = new Map<string, WeeklyCupResultSnapshotRecord>();
        liveCupRows.forEach((row) => {
          const teamId = teamByPlayerId.get(row.player_id);
          if (teamId && !liveByTeamId.has(teamId)) {
            liveByTeamId.set(teamId, row);
          }
        });
        const finishCounts = new Map<number, number>();
        rowByTeamId.forEach((row) => {
          if (row.finish_position == null) return;
          const finish = Number(row.finish_position);
          finishCounts.set(finish, (finishCounts.get(finish) ?? 0) + 1);
        });

        const membersByTeamId = new Map<string, string[]>();
        members.forEach((member) => {
          const list = membersByTeamId.get(member.cup_team_id) ?? [];
          list.push(member.player_id);
          membersByTeamId.set(member.cup_team_id, list);
        });
        const scoreByPlayerId = new Map(scores.map((score) => [score.player_id, score.gross_score]));
        const traceTeam =
          teams.find((team) => !rowByTeamId.has(team.id) && (membersByTeamId.get(team.id) ?? []).some((id) => scoreByPlayerId.has(id))) ??
          teams[0];
        if (traceTeam) {
          const memberIds = membersByTeamId.get(traceTeam.id) ?? [];
          console.info("[FinalizeTrace][TeamSection]", {
            weekId: selectedWeekId,
            selectedWeekFinalized: selectedWeek.is_finalized,
            uiSource: selectedWeek.is_finalized ? "weekly_cup_results" : "computeWeeklyCupResults(live)",
            teamId: traceTeam.id,
            teamName: traceTeam.name,
            teamMemberPlayerIds: memberIds,
            playerScoreRowsFound: memberIds
              .filter((id) => scoreByPlayerId.has(id))
              .map((id) => ({ playerId: id, gross: scoreByPlayerId.get(id) })),
            computedTeamResult: liveByTeamId.get(traceTeam.id) ?? null,
            persistedTeamResultBeforeFinalize: persistedByTeamId.get(traceTeam.id) ?? null,
            uiDisplayedTeamResult: rowByTeamId.get(traceTeam.id) ?? null,
          });
        }

        const teamRows: CupResultRow[] = teams
          .map((team) => {
            const row = rowByTeamId.get(team.id) ?? null;
            const officialScorerId = scorerByTeam.get(team.id) ?? null;
            const officialScorer = officialScorerId
              ? playerById.get(officialScorerId)?.full_name ?? null
              : null;
            const status: CupResultRow["status"] =
              row?.finish_position != null ? "Scored" : "DNP";
            const pointsSource: CupResultRow["pointsSource"] =
              row?.finish_position != null ? "team finish" : "DNP vacant split";

            return {
              teamId: team.id,
              team: team.name,
              officialScorer,
              status,
              finishPosition: row?.finish_position ?? null,
              isTiedFinish:
                row?.finish_position != null &&
                (finishCounts.get(Number(row.finish_position)) ?? 0) > 1,
              gross: row?.gross_score ?? null,
              net: row?.net_score ?? null,
              points: Number(row?.points_earned ?? 0),
              pointsSource,
            };
          })
          .sort((a, b) => {
            const rankA = a.finishPosition ?? Number.MAX_SAFE_INTEGER;
            const rankB = b.finishPosition ?? Number.MAX_SAFE_INTEGER;
            if (rankA !== rankB) return rankA - rankB;
            return a.team.localeCompare(b.team);
          });

        setCupRows(teamRows);
        setLoadingCup(false);
      }
    );
  }, [selectedWeekId, selectedWeek]);

  useEffect(() => {
    loadCupResults();
  }, [loadCupResults]);

  const finalizeWeek = useCallback(async () => {
    if (!selectedWeekId || !selectedWeek || selectedWeek.is_finalized) {
      return;
    }

    setSaveError(null);
    setSaving(true);

    const supabase = createClient();
    const [playersRes, participationRes, scoresRes, teamsRes, membersRes, weeklyHandicapsRes] = await Promise.all([
      supabase.from("players").select("id, full_name, handicap_index, cup"),
      supabase
        .from("weekly_participation")
        .select("player_id, cup, playing_this_week, cup_scorer_for_team_id")
        .eq("league_week_id", selectedWeekId),
      supabase.from("weekly_scores").select("player_id, gross_score").eq("league_week_id", selectedWeekId),
      supabase.from("cup_teams").select("id, name").eq("season_id", selectedWeek.season_id),
      supabase.from("cup_team_members").select("cup_team_id, player_id").eq("season_id", selectedWeek.season_id),
      supabase
        .from("weekly_handicaps")
        .select("player_id, final_computed_handicap")
        .eq("league_week_id", selectedWeekId),
    ]);

    if (playersRes.error) {
      setSaveError(playersRes.error.message);
      setSaving(false);
      return;
    }
    if (participationRes.error) {
      setSaveError(participationRes.error.message);
      setSaving(false);
      return;
    }
    if (scoresRes.error) {
      setSaveError(scoresRes.error.message);
      setSaving(false);
      return;
    }
    if (teamsRes.error) {
      setSaveError(teamsRes.error.message);
      setSaving(false);
      return;
    }
    if (membersRes.error) {
      setSaveError(membersRes.error.message);
      setSaving(false);
      return;
    }
    if (weeklyHandicapsRes.error) {
      setSaveError(weeklyHandicapsRes.error.message);
      setSaving(false);
      return;
    }
    const players = (playersRes.data as PlayerCupData[]) ?? [];
    const participation =
      ((participationRes.data as WeeklyParticipationCupRecord[]) ?? []);
    const scores = (scoresRes.data as { player_id: string; gross_score: number }[]) ?? [];
    const teams = (teamsRes.data as CupTeam[]) ?? [];
    const members = (membersRes.data as CupTeamMember[]) ?? [];
    const weeklyHandicaps =
      (weeklyHandicapsRes.data as WeeklyHandicapRecord[] | null) ?? [];
    const weeklyHandicapByPlayerId = new Map(
      weeklyHandicaps.map((row) => [row.player_id, Number(row.final_computed_handicap)])
    );
    const playersForCupScoring = players.map((player) => ({
      ...player,
      handicap_index: weeklyHandicapByPlayerId.get(player.id) ?? 0,
    }));
    const teamByPlayerId = new Map<string, string>();
    const membersByTeamId = new Map<string, string[]>();
    members.forEach((member) => {
      teamByPlayerId.set(member.player_id, member.cup_team_id);
      const list = membersByTeamId.get(member.cup_team_id) ?? [];
      list.push(member.player_id);
      membersByTeamId.set(member.cup_team_id, list);
    });
    const scoreByPlayerId = new Map(scores.map((score) => [score.player_id, score.gross_score]));
    const traceTeam =
      teams.find((team) => (membersByTeamId.get(team.id) ?? []).some((id) => scoreByPlayerId.has(id))) ??
      teams[0];

    const { data: existingCupRowsBefore } = await supabase
      .from("weekly_cup_results")
      .select("player_id, gross_score, net_score, finish_position, points_earned")
      .eq("league_week_id", selectedWeekId);

    const { scorerByTeam, ambiguityErrors } = resolveOfficialScorerByTeam({
      teams,
      members,
      participation,
      players: playersForCupScoring,
    });

    if (ambiguityErrors.length > 0) {
      setSaveError(ambiguityErrors.join(" "));
      setSaving(false);
      return;
    }

    const { error: clearScorerError } = await supabase
      .from("weekly_participation")
      .update({ cup_scorer_for_team_id: null })
      .eq("league_week_id", selectedWeekId);

    if (clearScorerError) {
      setSaveError(clearScorerError.message);
      setSaving(false);
      return;
    }

    const scorerAssignments = Array.from(scorerByTeam.entries()).filter(([, playerId]) => Boolean(playerId));
    for (const [teamId, playerId] of scorerAssignments) {
      const { error: assignScorerError } = await supabase
        .from("weekly_participation")
        .update({ cup_scorer_for_team_id: teamId })
        .eq("league_week_id", selectedWeekId)
        .eq("player_id", playerId as string);

      if (assignScorerError) {
        setSaveError(assignScorerError.message);
        setSaving(false);
        return;
      }
    }

    const officialScorerIds = scorerAssignments.map(([, playerId]) => playerId as string);
    const weeklyCupRows = computeWeeklyCupResults({
      players: playersForCupScoring,
      participation,
      scores,
      teamMembers: members,
      scoringPlayerIds: officialScorerIds,
    });

    if (traceTeam) {
      const teamMemberIds = membersByTeamId.get(traceTeam.id) ?? [];
      const existingByTeam = new Map<string, WeeklyCupResultSnapshotRecord>();
      (((existingCupRowsBefore as WeeklyCupResultSnapshotRecord[] | null) ?? [])).forEach((row) => {
        const teamId = teamByPlayerId.get(row.player_id);
        if (teamId && !existingByTeam.has(teamId)) {
          existingByTeam.set(teamId, row);
        }
      });
      const computedByTeam = new Map<string, WeeklyCupResultSnapshotRecord>();
      weeklyCupRows.forEach((row) => {
        const teamId = teamByPlayerId.get(row.player_id);
        if (teamId && !computedByTeam.has(teamId)) {
          computedByTeam.set(teamId, row);
        }
      });

      console.info("[FinalizeTrace][BeforePersist]", {
        weekId: selectedWeekId,
        teamId: traceTeam.id,
        teamName: traceTeam.name,
        teamMemberPlayerIds: teamMemberIds,
        playerScoreRowsFound: teamMemberIds
          .filter((id) => scoreByPlayerId.has(id))
          .map((id) => ({ playerId: id, gross: scoreByPlayerId.get(id) })),
        computedTeamResult: computedByTeam.get(traceTeam.id) ?? null,
        persistedTeamResultBeforeFinalize: existingByTeam.get(traceTeam.id) ?? null,
      });
    }

    const { error: clearCupRowsError } = await supabase
      .from("weekly_cup_results")
      .delete()
      .eq("league_week_id", selectedWeekId);

    if (clearCupRowsError) {
      setSaveError(clearCupRowsError.message);
      setSaving(false);
      return;
    }

    if (weeklyCupRows.length > 0) {
      const { error: upsertCupError } = await supabase.from("weekly_cup_results").upsert(
        weeklyCupRows.map((row) => ({
          league_week_id: selectedWeekId,
          player_id: row.player_id,
          gross_score: row.gross_score,
          net_score: row.net_score,
          finish_position: row.finish_position,
          points_earned: row.points_earned,
        })),
        { onConflict: "league_week_id,player_id" }
      );

      if (upsertCupError) {
        setSaveError(upsertCupError.message);
        setSaving(false);
        return;
      }
    }

    if (traceTeam) {
      const { data: existingCupRowsAfter } = await supabase
        .from("weekly_cup_results")
        .select("player_id, gross_score, net_score, finish_position, points_earned")
        .eq("league_week_id", selectedWeekId);
      const existingByTeamAfter = new Map<string, WeeklyCupResultSnapshotRecord>();
      (((existingCupRowsAfter as WeeklyCupResultSnapshotRecord[] | null) ?? [])).forEach((row) => {
        const teamId = teamByPlayerId.get(row.player_id);
        if (teamId && !existingByTeamAfter.has(teamId)) {
          existingByTeamAfter.set(teamId, row);
        }
      });
      console.info("[FinalizeTrace][AfterPersist]", {
        weekId: selectedWeekId,
        teamId: traceTeam.id,
        teamName: traceTeam.name,
        persistedTeamResultAfterFinalize: existingByTeamAfter.get(traceTeam.id) ?? null,
      });
    }

    const { error: updateError } = await supabase
      .from("league_weeks")
      .update({ is_finalized: true, status: "finalized" })
      .eq("id", selectedWeekId);

    if (updateError) {
      setSaveError(updateError.message);
      setSaving(false);
      return;
    }

    setWeeks((prev) =>
      prev.map((week) =>
        week.id === selectedWeekId ? { ...week, is_finalized: true, status: "finalized" } : week
      )
    );
    setSaving(false);
  }, [selectedWeekId, selectedWeek]);

  const unfinalizeWeek = useCallback(async () => {
    if (!selectedWeekId || !selectedWeek || !selectedWeek.is_finalized) {
      return;
    }

    setSaveError(null);
    setSaving(true);

    const supabase = createClient();
    const { error: deleteCupError } = await supabase
      .from("weekly_cup_results")
      .delete()
      .eq("league_week_id", selectedWeekId);

    if (deleteCupError) {
      setSaveError(deleteCupError.message);
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("league_weeks")
      .update({ is_finalized: false, status: "open" })
      .eq("id", selectedWeekId);

    if (updateError) {
      setSaveError(updateError.message);
      setSaving(false);
      return;
    }

    setWeeks((prev) =>
      prev.map((week) =>
        week.id === selectedWeekId ? { ...week, is_finalized: false, status: "open" } : week
      )
    );
    setSaving(false);
  }, [selectedWeekId, selectedWeek]);

  if (loadingWeeks) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-4 sm:py-6 md:py-8">
        <p className="text-zinc-600">Loading…</p>
      </div>
    );
  }

  if (error && weeks.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-4 sm:py-6 md:py-8">
        <p className="text-red-600">Error: {error}</p>
        <Link
          href="/admin"
          className="mt-4 inline-block text-sm text-white hover:text-emerald-200 transition-colors"
        >
          ← Admin
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 sm:py-6 md:py-8">
      <div className="mb-4 flex justify-end md:mb-6">
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

      {previewError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {previewError}
        </div>
      )}

      {cupError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {cupError}
        </div>
      )}

      <div className="mb-5 md:mb-6">
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
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Select a week…</option>
          {weeks.map((week) => (
            <option key={week.id} value={week.id}>
              Week {week.week_number} — {week.week_date} ({week.week_type}, {week.status})
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-3 sm:p-4">
        {!selectedWeekId ? (
          <p className="text-sm text-zinc-600">Select a week.</p>
        ) : loadingSummary || !summary ? (
          <p className="text-sm text-zinc-600">Loading summary…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Players Playing
                </p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900">
                  {summary.activePlayersCount}
                </p>
              </div>
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Scores Entered
                </p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900">
                  {summary.scoresEnteredCount}
                </p>
              </div>
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Missing Scores
                </p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900">
                  {summary.missingScoreNames.length}
                </p>
              </div>
              <div className="rounded-md border border-zinc-200 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Status
                </p>
                <p
                  className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                    selectedWeek?.is_finalized
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {selectedWeek?.is_finalized ? "Finalized" : "Not Finalized"}
                </p>
              </div>
            </div>

            {summary.missingScoreNames.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-900">
                  Players Missing Scores
                </p>
                <p className="mt-2 text-sm text-amber-800">
                  {summary.missingScoreNames.join(", ")}
                </p>
              </div>
            )}

            {(selectedWeek?.is_finalized ||
              summary.missingScoreNames.length === 0) && (
              <div className="space-y-3">
                <div className="space-y-3 md:hidden">
                  {loadingPreview ? (
                    <div className="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-500">
                      Loading preview…
                    </div>
                  ) : previewRows.length === 0 ? (
                    <div className="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-500">
                      No preview rows available yet.
                    </div>
                  ) : (
                    previewRows.map((row) => (
                      <article
                        key={`${row.rank}-${row.player}`}
                        className="rounded-lg border border-zinc-200 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-base font-semibold text-zinc-900">
                            {row.player}
                          </h3>
                          <div className="flex flex-wrap justify-end gap-2">
                            <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                              Rank {row.isTiedRank ? `T${row.rank}` : row.rank}
                            </span>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                row.isSigned
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-rose-100 text-rose-700"
                              }`}
                            >
                              {row.isSigned ? "Signed" : "Unsigned"}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div className="rounded-md bg-zinc-50 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Gross
                            </p>
                            <p className="mt-0.5 font-medium text-zinc-900">
                              {row.gross}
                            </p>
                          </div>
                          <div className="rounded-md bg-zinc-50 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Net
                            </p>
                            <p className="mt-0.5 font-medium text-zinc-900">
                              {row.net}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>

                <div className="hidden overflow-hidden rounded-lg border border-zinc-200 md:block">
                  <table className="min-w-full divide-y divide-zinc-200">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
                        >
                          Rank
                        </th>
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
                          Gross
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
                        >
                          Net
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
                        >
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 bg-white">
                      {loadingPreview ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-8 text-center text-zinc-500"
                          >
                            Loading preview…
                          </td>
                        </tr>
                      ) : previewRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-8 text-center text-zinc-500"
                          >
                            No preview rows available yet.
                          </td>
                        </tr>
                      ) : (
                        previewRows.map((row) => (
                          <tr
                            key={`${row.rank}-${row.player}`}
                            className="transition-colors hover:bg-zinc-50"
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900">
                              {row.isTiedRank ? `T${row.rank}` : row.rank}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900">
                              {row.player}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                              {row.gross}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                              {row.net}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                  row.isSigned
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-rose-100 text-rose-700"
                                }`}
                              >
                                {row.isSigned ? "Signed" : "Unsigned"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-700">
                RMR Cup Results
              </h2>
              <div className="space-y-3">
                <div className="space-y-3 md:hidden">
                  {!selectedWeekId ? (
                    <div className="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-500">
                      Select a week.
                    </div>
                  ) : loadingCup ? (
                    <div className="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-500">
                      Loading cup results…
                    </div>
                  ) : cupRows.length === 0 ? (
                    <div className="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-500">
                      No cup team rows available for this week.
                    </div>
                  ) : (
                    cupRows.map((row) => (
                      <article
                        key={row.teamId}
                        className={`rounded-lg border p-4 ${
                          row.status === "Scored"
                            ? "border-emerald-200 bg-emerald-50/30"
                            : "border-rose-200 bg-rose-50/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-base font-semibold text-zinc-900">
                            {row.team}
                          </h3>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              row.status === "Scored"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {row.status}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                          <div className="rounded-md bg-white/80 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Finish
                            </p>
                            <p className="mt-0.5 font-medium text-zinc-900">
                              {row.finishPosition != null
                                ? row.isTiedFinish
                                  ? `T${row.finishPosition}`
                                  : row.finishPosition
                                : "—"}
                            </p>
                          </div>
                          <div className="rounded-md bg-white/80 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Gross
                            </p>
                            <p className="mt-0.5 font-medium text-zinc-900">
                              {row.gross ?? "—"}
                            </p>
                          </div>
                          <div className="rounded-md bg-white/80 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Net
                            </p>
                            <p className="mt-0.5 font-medium text-zinc-900">
                              {row.net ?? "—"}
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm text-zinc-700">
                          <span className="font-medium text-zinc-900">Points:</span>{" "}
                          {row.points}
                        </p>
                      </article>
                    ))
                  )}
                </div>

                <div className="hidden overflow-hidden rounded-lg border border-zinc-200 md:block">
                  <table className="min-w-full divide-y divide-zinc-200">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
                        >
                          Team
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
                          Finish
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
                        >
                          Gross
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
                        >
                          Net
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500"
                        >
                          Points
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 bg-white">
                      {!selectedWeekId ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-8 text-center text-zinc-500"
                          >
                            Select a week.
                          </td>
                        </tr>
                      ) : loadingCup ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-8 text-center text-zinc-500"
                          >
                            Loading cup results…
                          </td>
                        </tr>
                      ) : cupRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-8 text-center text-zinc-500"
                          >
                            No cup team rows available for this week.
                          </td>
                        </tr>
                      ) : (
                        cupRows.map((row) => (
                          <tr
                            key={row.teamId}
                            className="transition-colors hover:bg-zinc-50"
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900">
                              {row.team}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                  row.status === "Scored"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-rose-100 text-rose-700"
                                }`}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                              {row.finishPosition != null
                                ? row.isTiedFinish
                                  ? `T${row.finishPosition}`
                                  : row.finishPosition
                                : "—"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                              {row.gross ?? "—"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                              {row.net ?? "—"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                              {row.points}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={
                  selectedWeek?.is_finalized ? unfinalizeWeek : finalizeWeek
                }
                disabled={saving || !selectedWeek}
                className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {selectedWeek?.is_finalized
                  ? saving
                    ? "Unfinalizing…"
                    : "Unfinalize Week"
                  : saving
                    ? "Finalizing…"
                    : "Finalize Week"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
