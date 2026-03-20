"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminSeasonSelector } from "@/components/admin/AdminSeasonSelector";
import { createClient } from "@/lib/supabase/client";

type Season = {
  id: string;
  name: string;
  year: number;
  is_active: boolean;
};

type Player = {
  id: string;
  full_name: string;
  cup: boolean;
};

type CupTeam = {
  id: string;
  name: string;
  season_id: string;
};

type CupTeamMember = {
  id: string;
  cup_team_id: string;
  player_id: string;
  season_id: string;
};

export default function AdminCupTeamsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [season, setSeason] = useState<Season | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<CupTeam[]>([]);
  const [members, setMembers] = useState<CupTeamMember[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [newTeamName, setNewTeamName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [addingMemberTeamId, setAddingMemberTeamId] = useState<string | null>(null);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const [confirmDeleteTeamId, setConfirmDeleteTeamId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedPlayerByTeam, setSelectedPlayerByTeam] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSeasonData = useCallback(async (seasonId: string) => {
    const supabase = createClient();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!seasonId) {
      setTeams([]);
      setMembers([]);
      setPlayers([]);
      setLoading(false);
      return;
    }

    const [teamsRes, membersRes, playersRes] = await Promise.all([
      supabase.from("cup_teams").select("id, name, season_id").eq("season_id", seasonId).order("name"),
      supabase
        .from("cup_team_members")
        .select("id, cup_team_id, player_id, season_id")
        .eq("season_id", seasonId),
      supabase.from("players").select("id, full_name, cup").order("full_name"),
    ]);

    if (teamsRes.error) {
      setError(teamsRes.error.message);
      setLoading(false);
      return;
    }
    if (membersRes.error) {
      setError(membersRes.error.message);
      setLoading(false);
      return;
    }
    if (playersRes.error) {
      setError(playersRes.error.message);
      setLoading(false);
      return;
    }

    const loadedTeams = (teamsRes.data as CupTeam[]) ?? [];
    setTeams(loadedTeams);
    setMembers((membersRes.data as CupTeamMember[]) ?? []);
    setPlayers((playersRes.data as Player[]) ?? []);
    setTeamNames(
      loadedTeams.reduce<Record<string, string>>((acc, team) => {
        acc[team.id] = team.name;
        return acc;
      }, {})
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    supabase
      .from("seasons")
      .select("id, name, year, is_active")
      .order("is_active", { ascending: false })
      .order("year", { ascending: false })
      .order("start_date", { ascending: false })
      .then(({ data, error: seasonsError }) => {
        if (seasonsError) {
          setError(seasonsError.message);
          setSeasons([]);
          setLoading(false);
          return;
        }

        const loadedSeasons = (data as Season[]) ?? [];
        setSeasons(loadedSeasons);
        const initialSeasonId = loadedSeasons[0]?.id ?? "";
        setSelectedSeasonId(initialSeasonId);
        setSeason(loadedSeasons.find((entry) => entry.id === initialSeasonId) ?? null);
      });
  }, []);

  useEffect(() => {
    setSeason(seasons.find((entry) => entry.id === selectedSeasonId) ?? null);
    void loadSeasonData(selectedSeasonId);
  }, [selectedSeasonId, seasons, loadSeasonData]);

  const playerNameById = useMemo(
    () => new Map(players.map((player) => [player.id, player.full_name])),
    [players]
  );

  const membersByTeam = useMemo(() => {
    const map = new Map<string, CupTeamMember[]>();
    members.forEach((member) => {
      const existing = map.get(member.cup_team_id) ?? [];
      existing.push(member);
      map.set(member.cup_team_id, existing);
    });
    return map;
  }, [members]);

  const unassignedCupPlayers = useMemo(() => {
    const assignedPlayerIds = new Set(members.map((member) => member.player_id));
    return players
      .filter((player) => player.cup && !assignedPlayerIds.has(player.id))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [players, members]);

  const saveTeamName = async (teamId: string) => {
    const nextName = (teamNames[teamId] ?? "").trim();
    if (!nextName) {
      setError("Team name is required.");
      return;
    }

    setSavingTeamId(teamId);
    setError(null);
    setSuccess(null);

    const response = await fetch(`/api/admin/cup-teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName }),
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string; message?: string; team?: CupTeam }
      | null;

    if (!response.ok) {
      setError(body?.error ?? "Failed to update team name.");
      setSavingTeamId(null);
      return;
    }

    setTeams((prev) =>
      prev
        .map((team) => (team.id === teamId ? { ...team, name: body?.team?.name ?? nextName } : team))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setSuccess(body?.message ?? "Team name updated.");
    setSavingTeamId(null);
  };

  const createTeam = async () => {
    if (!selectedSeasonId) return;
    const name = newTeamName.trim();
    if (!name) {
      setError("Team name is required.");
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/admin/cup-teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seasonId: selectedSeasonId, name }),
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string; message?: string; team?: CupTeam }
      | null;

    if (!response.ok || !body?.team) {
      setError(body?.error ?? "Failed to create Cup team.");
      setCreating(false);
      return;
    }

    const created = body.team;
    setTeams((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setTeamNames((prev) => ({ ...prev, [created.id]: created.name }));
    setNewTeamName("");
    setSuccess(body.message ?? "Cup team created.");
    setCreating(false);
  };

  const removeMember = async (memberId: string) => {
    setError(null);
    setSuccess(null);

    const response = await fetch(`/api/admin/cup-teams/members/${memberId}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;
    if (!response.ok) {
      setError(body?.error ?? "Failed to remove team member.");
      return;
    }
    setMembers((prev) => prev.filter((member) => member.id !== memberId));
    setSuccess(body?.message ?? "Team member removed.");
  };

  const addMember = async (teamId: string) => {
    const playerId = selectedPlayerByTeam[teamId] ?? "";
    if (!playerId) {
      setError("Select a Cup player to add.");
      return;
    }

    setAddingMemberTeamId(teamId);
    setError(null);
    setSuccess(null);
    const response = await fetch(`/api/admin/cup-teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string; message?: string; member?: CupTeamMember }
      | null;

    if (!response.ok || !body?.member) {
      setError(body?.error ?? "Failed to add team member.");
      setAddingMemberTeamId(null);
      return;
    }

    const createdMember = body.member as CupTeamMember;
    setMembers((prev) => [...prev, createdMember]);
    setSelectedPlayerByTeam((prev) => ({ ...prev, [teamId]: "" }));
    setSuccess(body?.message ?? "Team member added.");
    setAddingMemberTeamId(null);
  };

  const deleteTeam = async (teamId: string) => {
    setDeletingTeamId(teamId);
    setError(null);
    setSuccess(null);

    const response = await fetch(`/api/admin/cup-teams/${teamId}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as
      | { error?: string; message?: string; deletedTeamId?: string }
      | null;

    if (!response.ok) {
      setError(body?.error ?? "Failed to delete Cup team.");
      setDeletingTeamId(null);
      return;
    }

    setTeams((prev) => prev.filter((team) => team.id !== teamId));
    setMembers((prev) => prev.filter((member) => member.cup_team_id !== teamId));
    setTeamNames((prev) => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
    setSelectedPlayerByTeam((prev) => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
    setConfirmDeleteTeamId((current) => (current === teamId ? null : current));
    setSuccess(body?.message ?? "Cup team deleted.");
    setDeletingTeamId(null);
  };

  if (loading && seasons.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-zinc-600">Loading cup teams…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex justify-end">
        <Link href="/admin" className="shrink-0 text-sm font-medium text-white hover:text-emerald-200 transition-colors">
          ← Admin
        </Link>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <AdminSeasonSelector
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onChange={setSelectedSeasonId}
        disabled={loading || seasons.length === 0}
        className="mb-4"
      />

      {season && (
        <section className="mb-4 rounded-lg border border-zinc-200 bg-white p-4">
          <label className="mb-2 block text-sm font-medium text-zinc-700">Create New Team</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={newTeamName}
              onChange={(event) => setNewTeamName(event.target.value)}
              placeholder="Team name"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={createTeam}
              disabled={creating}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create Team"}
            </button>
          </div>
        </section>
      )}

      <div className="space-y-3 md:hidden">
        {teams.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500">
            No cup teams found.
          </div>
        ) : (
          teams.map((team) => {
            const teamMembers = membersByTeam.get(team.id) ?? [];
            const canDeleteTeam = teamMembers.length === 0;
            const canAddMember = teamMembers.length < 2 && unassignedCupPlayers.length > 0;
            return (
              <article key={team.id} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={teamNames[team.id] ?? ""}
                    onChange={(event) => setTeamNames((prev) => ({ ...prev, [team.id]: event.target.value }))}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => saveTeamName(team.id)}
                    disabled={savingTeamId === team.id}
                    className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                  >
                    {savingTeamId === team.id ? "Saving…" : "Save"}
                  </button>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <p className="text-zinc-500">Members</p>
                  {teamMembers.length === 0 ? (
                    <p className="text-zinc-500">No members yet.</p>
                  ) : (
                    teamMembers.map((member) => (
                      <div key={member.id} className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1.5">
                        <span className="truncate text-zinc-800">{playerNameById.get(member.player_id) ?? "Unknown Player"}</span>
                        <button
                          type="button"
                          onClick={() => removeMember(member.id)}
                          className="rounded border border-red-300 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-3">
                  <label htmlFor={`add-member-${team.id}`} className="mb-1 block text-xs font-medium text-zinc-600">
                    Add Member
                  </label>
                  <div className="flex gap-2">
                    <select
                      id={`add-member-${team.id}`}
                      value={selectedPlayerByTeam[team.id] ?? ""}
                      onChange={(event) =>
                        setSelectedPlayerByTeam((prev) => ({ ...prev, [team.id]: event.target.value }))
                      }
                      disabled={!canAddMember || addingMemberTeamId === team.id}
                      className="w-full rounded-md border border-zinc-300 px-2 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
                    >
                      <option value="">{canAddMember ? "Select Cup player" : "No Cup players available"}</option>
                      {unassignedCupPlayers.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.full_name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => addMember(team.id)}
                      disabled={!canAddMember || addingMemberTeamId === team.id}
                      className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {addingMemberTeamId === team.id ? "Adding…" : "Add"}
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  {confirmDeleteTeamId === team.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => deleteTeam(team.id)}
                        disabled={deletingTeamId === team.id}
                        className="rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {deletingTeamId === team.id ? "Deleting…" : "Confirm Delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTeamId(null)}
                        disabled={deletingTeamId === team.id}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTeamId(team.id)}
                      disabled={!canDeleteTeam || deletingTeamId === team.id}
                      title={!canDeleteTeam ? "Remove or reassign all members before deleting this team." : undefined}
                      className="rounded-md border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Delete Team
                    </button>
                  )}
                  {!canDeleteTeam && (
                    <p className="mt-1 text-[11px] text-zinc-500">Remove or reassign all members before deleting.</p>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-zinc-200 md:block">
        <table className="min-w-full divide-y divide-zinc-200">
          <thead className="bg-zinc-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Team Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Members</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {teams.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                  No cup teams found.
                </td>
              </tr>
            ) : (
              teams.map((team) => {
                const teamMembers = membersByTeam.get(team.id) ?? [];
                const canDeleteTeam = teamMembers.length === 0;
                const canAddMember = teamMembers.length < 2 && unassignedCupPlayers.length > 0;
                return (
                  <tr key={team.id} className="align-top">
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={teamNames[team.id] ?? ""}
                        onChange={(event) => setTeamNames((prev) => ({ ...prev, [team.id]: event.target.value }))}
                        className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {teamMembers.length === 0 ? (
                        <span className="text-sm text-zinc-500">No members</span>
                      ) : (
                        <div className="space-y-1">
                          {teamMembers.map((member) => (
                            <div key={member.id} className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1.5 text-sm">
                              <span className="truncate text-zinc-800">{playerNameById.get(member.player_id) ?? "Unknown Player"}</span>
                              <button
                                type="button"
                                onClick={() => removeMember(member.id)}
                                className="rounded border border-red-300 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          value={selectedPlayerByTeam[team.id] ?? ""}
                          onChange={(event) =>
                            setSelectedPlayerByTeam((prev) => ({ ...prev, [team.id]: event.target.value }))
                          }
                          disabled={!canAddMember || addingMemberTeamId === team.id}
                          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 disabled:bg-zinc-100"
                        >
                          <option value="">{canAddMember ? "Select Cup player" : "No Cup players available"}</option>
                          {unassignedCupPlayers.map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.full_name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => addMember(team.id)}
                          disabled={!canAddMember || addingMemberTeamId === team.id}
                          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {addingMemberTeamId === team.id ? "Adding…" : "Add"}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => saveTeamName(team.id)}
                          disabled={savingTeamId === team.id}
                          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {savingTeamId === team.id ? "Saving…" : "Save Name"}
                        </button>
                        {confirmDeleteTeamId === team.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => deleteTeam(team.id)}
                              disabled={deletingTeamId === team.id}
                              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              {deletingTeamId === team.id ? "Deleting…" : "Confirm Delete"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTeamId(null)}
                              disabled={deletingTeamId === team.id}
                              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTeamId(team.id)}
                            disabled={!canDeleteTeam || deletingTeamId === team.id}
                            title={!canDeleteTeam ? "Remove or reassign all members before deleting this team." : undefined}
                            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Delete Team
                          </button>
                        )}
                      </div>
                      {!canDeleteTeam && (
                        <p className="mt-1 text-[11px] text-zinc-500">Remove or reassign all members before deleting.</p>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
