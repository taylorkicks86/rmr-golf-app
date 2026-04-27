"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Player = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  ghin: string;
  handicap_index: number;
  is_admin: boolean;
  is_approved: boolean;
  cup: boolean;
  cup_team_id: string | null;
  cup_team_name: string | null;
};

type CupTeam = {
  id: string;
  name: string;
  season_id: string;
};

type CupTeamMember = {
  player_id: string;
  cup_team_id: string;
};

type EditFormState = {
  id: string | null;
  full_name: string;
  email: string;
  ghin: string;
  handicap_index: string;
  is_admin: boolean;
  is_approved: boolean;
  cup: boolean;
  create_account: boolean;
  password: string;
  cup_team_id: string | null;
};

export default function AdminPlayersPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [savingPlayerId, setSavingPlayerId] = useState<string | null>(null);
  const [confirmDeletePlayerId, setConfirmDeletePlayerId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [accountForm, setAccountForm] = useState<{ player: Player; password: string } | null>(null);
  const [cupTeams, setCupTeams] = useState<CupTeam[]>([]);
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase
        .from("players")
        .select("id, auth_user_id, full_name, email, ghin, handicap_index, is_admin, is_approved, cup")
        .order("full_name"),
      supabase
        .from("seasons")
        .select("id")
        .order("is_active", { ascending: false })
        .order("year", { ascending: false })
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(async ([playersRes, seasonRes]) => {
      if (playersRes.error) {
        setError(playersRes.error.message);
        setPlayers([]);
        setLoading(false);
        return;
      }
      if (seasonRes.error) {
        setError(seasonRes.error.message);
        setPlayers([]);
        setLoading(false);
        return;
      }

      const seasonId = (seasonRes.data as { id: string } | null)?.id ?? null;
      setActiveSeasonId(seasonId);
      const basePlayers =
        ((playersRes.data as Omit<Player, "cup_team_id" | "cup_team_name">[]) ?? []).map((player) => ({
          ...player,
          cup_team_id: null,
          cup_team_name: null,
        }));

      if (!seasonId) {
        setPlayers(basePlayers);
        setCupTeams([]);
        setLoading(false);
        return;
      }

      const [teamsRes, membersRes] = await Promise.all([
        supabase.from("cup_teams").select("id, name, season_id").eq("season_id", seasonId).order("name"),
        supabase.from("cup_team_members").select("player_id, cup_team_id").eq("season_id", seasonId),
      ]);

      if (teamsRes.error) {
        setError(teamsRes.error.message);
        setPlayers(basePlayers);
        setLoading(false);
        return;
      }
      if (membersRes.error) {
        setError(membersRes.error.message);
        setPlayers(basePlayers);
        setLoading(false);
        return;
      }

      const teams = (teamsRes.data as CupTeam[]) ?? [];
      setCupTeams(teams);
      const teamById = new Map(teams.map((team) => [team.id, team.name]));
      const membershipByPlayer = new Map(
        ((membersRes.data as CupTeamMember[]) ?? []).map((member) => [member.player_id, member.cup_team_id])
      );
      setPlayers(
        basePlayers.map((player) => {
          const teamId = membershipByPlayer.get(player.id) ?? null;
          return {
            ...player,
            cup_team_id: teamId,
            cup_team_name: teamId ? teamById.get(teamId) ?? null : null,
          };
        })
      );
      setLoading(false);
    });
  }, []);

  const handleDelete = async (playerId: string) => {
    setSavingPlayerId(playerId);
    setActionError(null);
    setActionSuccess(null);

    const response = await fetch(`/api/admin/players/${playerId}`, {
      method: "DELETE",
    });
    const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

    if (!response.ok) {
      setActionError(body?.error ?? "Failed to delete player.");
      setSavingPlayerId(null);
      return;
    }

    setPlayers((prev) => prev.filter((player) => player.id !== playerId));
    setConfirmDeletePlayerId((current) => (current === playerId ? null : current));
    setActionSuccess(body?.message ?? "Player deleted.");
    router.refresh();
    setSavingPlayerId(null);
  };

  const openEditModal = (player: Player) => {
    setActionError(null);
    setActionSuccess(null);
    setEditForm({
      id: player.id,
      full_name: player.full_name,
      email: player.email,
      ghin: player.ghin,
      handicap_index: String(player.handicap_index),
      is_admin: player.is_admin,
      is_approved: player.is_approved,
      cup: player.cup,
      create_account: false,
      password: "",
      cup_team_id: player.cup_team_id,
    });
  };

  const openCreateModal = () => {
    setActionError(null);
    setActionSuccess(null);
    setEditForm({
      id: null,
      full_name: "",
      email: "",
      ghin: "",
      handicap_index: "0",
      is_admin: false,
      is_approved: false,
      cup: false,
      create_account: true,
      password: "",
      cup_team_id: null,
    });
  };

  const savePlayer = async () => {
    if (!editForm) {
      return;
    }

    const parsedHandicap = Number(editForm.handicap_index);
    if (!Number.isFinite(parsedHandicap) || parsedHandicap < 0 || parsedHandicap > 54) {
      setActionError("Handicap must be a number between 0 and 54.");
      return;
    }

    if (!editForm.id && editForm.create_account && editForm.password.length < 6) {
      setActionError("Password must be at least 6 characters.");
      return;
    }

    const saveKey = editForm.id ?? "new-player";
    setSavingPlayerId(saveKey);
    setActionError(null);
    setActionSuccess(null);

    const isEditing = Boolean(editForm.id);
    const response = await fetch(isEditing ? `/api/admin/players/${editForm.id}` : "/api/admin/players", {
      method: isEditing ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        full_name: editForm.full_name,
        email: editForm.email,
        ghin: editForm.ghin,
        handicap_index: parsedHandicap,
        is_admin: editForm.is_admin,
        is_approved: editForm.is_approved,
        cup: editForm.cup,
        cup_team_id: editForm.cup ? editForm.cup_team_id : null,
        create_account: !isEditing ? editForm.create_account : undefined,
        password: !isEditing && editForm.create_account ? editForm.password : undefined,
      }),
    });

    const body = (await response.json().catch(() => null)) as
      | { error?: string; message?: string; player?: Player }
      | null;

    if (!response.ok || !body?.player) {
      setActionError(body?.error ?? "Failed to update player.");
      setSavingPlayerId(null);
      return;
    }

    const refreshedPlayer = body.player;
    if (refreshedPlayer.cup_team_id && refreshedPlayer.cup_team_name) {
      const nextTeamId = refreshedPlayer.cup_team_id;
      const nextTeamName = refreshedPlayer.cup_team_name;
      setCupTeams((prev) => {
        if (prev.some((team) => team.id === nextTeamId)) return prev;
        if (!activeSeasonId) return prev;
        return [
          ...prev,
          { id: nextTeamId, name: nextTeamName, season_id: activeSeasonId },
        ].sort((a, b) => a.name.localeCompare(b.name));
      });
    }
    const teamName = refreshedPlayer.cup_team_id
      ? refreshedPlayer.cup_team_name ?? cupTeams.find((team) => team.id === refreshedPlayer.cup_team_id)?.name ?? null
      : null;
    setPlayers((prev) =>
      (isEditing
        ? prev.map((player) =>
            player.id === refreshedPlayer.id
              ? { ...refreshedPlayer, cup_team_name: teamName, cup_team_id: refreshedPlayer.cup_team_id ?? null }
              : player
          )
        : [
            ...prev,
            { ...refreshedPlayer, cup_team_name: teamName, cup_team_id: refreshedPlayer.cup_team_id ?? null },
          ])
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
    );
    setActionSuccess(body.message ?? (isEditing ? "Player updated." : "Player created."));
    setEditForm(null);
    setSavingPlayerId(null);
    router.refresh();
  };

  const createAccountForPlayer = async () => {
    if (!accountForm) {
      return;
    }

    if (accountForm.password.length < 6) {
      setActionError("Password must be at least 6 characters.");
      return;
    }

    setSavingPlayerId(`account-${accountForm.player.id}`);
    setActionError(null);
    setActionSuccess(null);

    const response = await fetch(`/api/admin/players/${accountForm.player.id}/account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: accountForm.password }),
    });

    const body = (await response.json().catch(() => null)) as
      | { error?: string; message?: string; player?: Pick<Player, "id" | "auth_user_id"> }
      | null;

    if (!response.ok || !body?.player?.auth_user_id) {
      setActionError(body?.error ?? "Failed to create account.");
      setSavingPlayerId(null);
      return;
    }

    setPlayers((prev) =>
      prev.map((player) =>
        player.id === body.player?.id ? { ...player, auth_user_id: body.player.auth_user_id } : player
      )
    );
    setActionSuccess(body.message ?? "Account created.");
    setAccountForm(null);
    setSavingPlayerId(null);
    router.refresh();
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[90rem] px-4 py-8">
        <p className="text-zinc-600">Loading players…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[90rem] px-4 py-8">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Create Player
        </button>
        <Link href="/admin" className="text-sm font-medium text-white hover:text-emerald-200 transition-colors">
          ← Admin
        </Link>
      </div>

      {actionError && <p className="mb-4 text-sm text-red-600">Error: {actionError}</p>}
      {actionSuccess && <p className="mb-4 text-sm text-emerald-700">{actionSuccess}</p>}

      <div className="space-y-3 md:hidden">
        {players.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500">
            No players found.
          </div>
        ) : (
          players.map((player) => (
            <article key={player.id} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-zinc-900">{player.full_name}</h2>
                <p className="text-sm text-zinc-600">{player.email}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <p className="text-zinc-500">GHIN</p>
                  <p className="text-right font-medium text-zinc-900">{player.ghin}</p>
                  <p className="text-zinc-500">Handicap</p>
                  <p className="text-right font-medium text-zinc-900">{player.handicap_index}</p>
                  <p className="text-zinc-500">Admin</p>
                  <p className="text-right font-medium text-zinc-900">{player.is_admin ? "Yes" : "No"}</p>
                  <p className="text-zinc-500">Approved</p>
                  <p className="text-right font-medium text-zinc-900">{player.is_approved ? "Yes" : "No"}</p>
                  <p className="text-zinc-500">Account</p>
                  <p className="text-right font-medium text-zinc-900">{player.auth_user_id ? "Linked" : "Needed"}</p>
                  <p className="text-zinc-500">Cup Player</p>
                  <p className="text-right font-medium text-zinc-900">{player.cup ? "Yes" : "No"}</p>
                  <p className="text-zinc-500">Cup Team</p>
                  <p className="truncate text-right font-medium text-zinc-900">{player.cup_team_name ?? "—"}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(player)}
                  disabled={savingPlayerId === player.id}
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  Edit
                </button>

                {!player.auth_user_id && (
                  <button
                    type="button"
                    onClick={() => {
                      setAccountForm({ player, password: "" });
                      setActionError(null);
                      setActionSuccess(null);
                    }}
                    disabled={savingPlayerId === `account-${player.id}`}
                    className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                  >
                    {savingPlayerId === `account-${player.id}` ? "Creating…" : "Create Account"}
                  </button>
                )}

                {confirmDeletePlayerId === player.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDelete(player.id)}
                      disabled={savingPlayerId === player.id}
                      className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {savingPlayerId === player.id ? "Deleting…" : "Confirm Delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeletePlayerId(null)}
                      disabled={savingPlayerId === player.id}
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeletePlayerId(player.id);
                      setActionError(null);
                      setActionSuccess(null);
                    }}
                    disabled={savingPlayerId === player.id}
                    className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>

              {confirmDeletePlayerId === player.id && (
                <p className="mt-2 text-xs text-red-700">
                  Confirm deletion. This removes the player, linked auth account, and related league data.
                </p>
              )}
            </article>
          ))
        )}
      </div>

      <div className="hidden md:block">
        <div className="w-full overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[1200px] divide-y divide-zinc-200">
          <thead className="bg-zinc-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Full Name
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Email
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                GHIN
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Handicap
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Admin
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Approved
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Account
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Cup Player
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Cup Team
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {players.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-zinc-500">
                  No players found.
                </td>
              </tr>
            ) : (
              players.map((player) => (
                <tr key={player.id} className="transition-colors hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900">{player.full_name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">{player.email}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">{player.ghin}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">{player.handicap_index}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">{player.is_admin ? "Yes" : "No"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">{player.is_approved ? "Yes" : "No"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                    {player.auth_user_id ? "Linked" : "Needed"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">{player.cup ? "Yes" : "No"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">{player.cup_team_name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEditModal(player)}
                        disabled={savingPlayerId === player.id}
                        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Edit
                      </button>

                      {!player.auth_user_id && (
                        <button
                          type="button"
                          onClick={() => {
                            setAccountForm({ player, password: "" });
                            setActionError(null);
                            setActionSuccess(null);
                          }}
                          disabled={savingPlayerId === `account-${player.id}`}
                          className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                        >
                          {savingPlayerId === `account-${player.id}` ? "Creating…" : "Account"}
                        </button>
                      )}

                      {confirmDeletePlayerId === player.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDelete(player.id)}
                            disabled={savingPlayerId === player.id}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {savingPlayerId === player.id ? "Deleting…" : "Confirm Delete"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePlayerId(null)}
                            disabled={savingPlayerId === player.id}
                            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeletePlayerId(player.id);
                            setActionError(null);
                            setActionSuccess(null);
                          }}
                          disabled={savingPlayerId === player.id}
                          className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    {confirmDeletePlayerId === player.id && (
                      <p className="mt-2 text-xs text-red-700">
                        Confirm deletion. This removes the player, linked auth account, and related league data.
                      </p>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {editForm && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (savingPlayerId !== editForm.id) {
                setEditForm(null);
              }
            }}
          />
          <div className="relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-lg sm:rounded-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">
                {editForm.id ? "Edit Player" : "Create Player"}
              </h2>
              <button
                type="button"
                onClick={() => setEditForm(null)}
                disabled={savingPlayerId === (editForm.id ?? "new-player")}
                className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Full Name</label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(event) =>
                    setEditForm((prev) => (prev ? { ...prev, full_name: event.target.value } : prev))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(event) =>
                    setEditForm((prev) => (prev ? { ...prev, email: event.target.value } : prev))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {!editForm.id && (
                <>
                  <label className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2">
                    <span className="text-sm font-medium text-zinc-700">Create Login Account</span>
                    <input
                      type="checkbox"
                      checked={editForm.create_account}
                      onChange={(event) =>
                        setEditForm((prev) => (prev ? { ...prev, create_account: event.target.checked } : prev))
                      }
                      className="h-5 w-5 accent-emerald-600"
                    />
                  </label>

                  {editForm.create_account && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-zinc-700">Password</label>
                      <input
                        type="password"
                        value={editForm.password}
                        onChange={(event) =>
                          setEditForm((prev) => (prev ? { ...prev, password: event.target.value } : prev))
                        }
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">GHIN</label>
                <input
                  type="text"
                  value={editForm.ghin}
                  onChange={(event) =>
                    setEditForm((prev) => (prev ? { ...prev, ghin: event.target.value } : prev))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Handicap</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="54"
                  value={editForm.handicap_index}
                  onChange={(event) =>
                    setEditForm((prev) => (prev ? { ...prev, handicap_index: event.target.value } : prev))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <label className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2">
                <span className="text-sm font-medium text-zinc-700">Admin</span>
                <input
                  type="checkbox"
                  checked={editForm.is_admin}
                  onChange={(event) =>
                    setEditForm((prev) => (prev ? { ...prev, is_admin: event.target.checked } : prev))
                  }
                  className="h-5 w-5 accent-emerald-600"
                />
              </label>

              <label className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2">
                <span className="text-sm font-medium text-zinc-700">Approved</span>
                <input
                  type="checkbox"
                  checked={editForm.is_approved}
                  onChange={(event) =>
                    setEditForm((prev) => (prev ? { ...prev, is_approved: event.target.checked } : prev))
                  }
                  className="h-5 w-5 accent-emerald-600"
                />
              </label>

              <label className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2">
                <span className="text-sm font-medium text-zinc-700">Cup Player</span>
                <input
                  type="checkbox"
                  checked={editForm.cup}
                  onChange={(event) =>
                    setEditForm((prev) => (prev ? { ...prev, cup: event.target.checked } : prev))
                  }
                  className="h-5 w-5 accent-emerald-600"
                />
              </label>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Cup Team</label>
                <select
                  value={editForm.cup_team_id ?? ""}
                  onChange={(event) =>
                    setEditForm((prev) =>
                      prev ? { ...prev, cup_team_id: event.target.value || null } : prev
                    )
                  }
                  disabled={!editForm.cup}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                >
                  <option value="">Auto-create/use default team</option>
                  {cupTeams
                    .filter((team) => !activeSeasonId || team.season_id === activeSeasonId)
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditForm(null)}
                disabled={savingPlayerId === (editForm.id ?? "new-player")}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePlayer}
                disabled={savingPlayerId === (editForm.id ?? "new-player")}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingPlayerId === (editForm.id ?? "new-player")
                  ? "Saving…"
                  : editForm.id
                    ? "Save Changes"
                    : "Create Player"}
              </button>
            </div>
          </div>
        </div>
      )}

      {accountForm && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (savingPlayerId !== `account-${accountForm.player.id}`) {
                setAccountForm(null);
              }
            }}
          />
          <div className="relative z-10 w-full rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-md sm:rounded-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Create Account</h2>
                <p className="mt-1 text-sm text-zinc-600">{accountForm.player.full_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setAccountForm(null)}
                disabled={savingPlayerId === `account-${accountForm.player.id}`}
                className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Email</label>
                <input
                  type="email"
                  value={accountForm.player.email}
                  readOnly
                  className="w-full rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-700"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Password</label>
                <input
                  type="password"
                  value={accountForm.password}
                  onChange={(event) =>
                    setAccountForm((prev) => (prev ? { ...prev, password: event.target.value } : prev))
                  }
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setAccountForm(null)}
                disabled={savingPlayerId === `account-${accountForm.player.id}`}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createAccountForPlayer}
                disabled={savingPlayerId === `account-${accountForm.player.id}`}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingPlayerId === `account-${accountForm.player.id}` ? "Creating…" : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
