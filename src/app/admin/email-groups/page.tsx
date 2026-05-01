"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Player = {
  id: string;
  full_name: string;
  email: string;
  is_approved: boolean;
  paid: boolean;
};

type EmailGroupResponse = {
  error?: string;
  totalRecipients?: number;
  sent?: number;
  failed?: number;
};

function sortPlayers(a: Player, b: Player) {
  return Number(b.paid) - Number(a.paid) || a.full_name.localeCompare(b.full_name);
}

export default function AdminEmailGroupsPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [includePaidMembers, setIncludePaidMembers] = useState(true);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("players")
      .select("id, full_name, email, is_approved, paid")
      .eq("is_approved", true)
      .order("paid", { ascending: false })
      .order("full_name")
      .then(({ data, error: playersError }) => {
        if (playersError) {
          setError(playersError.message);
          setPlayers([]);
        } else {
          setPlayers(((data as Player[] | null) ?? []).sort(sortPlayers));
        }
        setLoading(false);
      });
  }, []);

  const paidMemberCount = useMemo(() => players.filter((player) => player.paid).length, [players]);

  const recipientCount = useMemo(() => {
    const ids = new Set<string>();
    if (includePaidMembers) {
      players.forEach((player) => {
        if (player.paid) {
          ids.add(player.id);
        }
      });
    }
    selectedPlayerIds.forEach((playerId) => ids.add(playerId));
    return ids.size;
  }, [includePaidMembers, players, selectedPlayerIds]);

  const canSend = subject.trim().length >= 3 && message.trim().length >= 3 && recipientCount > 0 && !sending;

  const togglePlayer = (playerId: string) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const sendEmail = async () => {
    if (!canSend) return;

    setSending(true);
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/admin/email-groups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject,
        message,
        includePaidMembers,
        playerIds: Array.from(selectedPlayerIds),
      }),
    });

    const body = (await response.json().catch(() => null)) as EmailGroupResponse | null;
    if (!response.ok) {
      setError(body?.error ?? "Failed to send group email.");
      setSending(false);
      return;
    }

    const sent = body?.sent ?? 0;
    const failed = body?.failed ?? 0;
    const total = body?.totalRecipients ?? sent + failed;
    setSuccess(
      failed > 0
        ? `Sent ${sent} of ${total} emails. ${failed} failed.`
        : `Sent ${sent} email${sent === 1 ? "" : "s"}.`
    );
    setSending(false);
    setShowConfirm(false);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex justify-end">
        <Link href="/admin" className="shrink-0 text-sm font-medium text-white hover:text-emerald-200 transition-colors">
          ← Admin
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Compose Email</h2>
          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Subject</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={160}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Email</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={12}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </label>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-600">
              Recipients selected: <span className="font-semibold text-zinc-900">{recipientCount}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSuccess(null);
                setShowConfirm(true);
              }}
              disabled={!canSend}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send Email"}
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Recipients</h2>
          <label className="mb-4 flex items-center justify-between gap-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-3">
            <span>
              <span className="block text-sm font-semibold text-zinc-900">Paid Members</span>
              <span className="block text-xs text-zinc-600">{paidMemberCount} approved paid players</span>
            </span>
            <input
              type="checkbox"
              checked={includePaidMembers}
              onChange={(event) => setIncludePaidMembers(event.target.checked)}
              className="h-5 w-5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
          </label>

          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-900">Individual Players</h3>
            <button
              type="button"
              onClick={() => setSelectedPlayerIds(new Set())}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
            >
              Clear
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-zinc-500">Loading players…</p>
          ) : (
            <div className="max-h-[520px] overflow-auto rounded-md border border-zinc-200">
              {players.map((player) => (
                <label
                  key={player.id}
                  className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-3 last:border-b-0"
                >
                  <span>
                    <span className="block text-sm font-medium text-zinc-900">{player.full_name}</span>
                    <span className="block text-xs text-zinc-500">
                      {player.paid ? "Paid member" : "Sub"} · {player.email || "No email"}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={selectedPlayerIds.has(player.id)}
                    onChange={() => togglePlayer(player.id)}
                    className="h-5 w-5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </label>
              ))}
            </div>
          )}
        </section>
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="group-email-title"
        >
          <div className="w-full max-w-md rounded-lg border border-emerald-900/20 bg-white shadow-xl">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h3 id="group-email-title" className="text-lg font-semibold text-zinc-900">
                Send Group Email
              </h3>
              <p className="mt-1 text-sm text-zinc-600">
                This will send “{subject.trim()}” to {recipientCount} selected recipient{recipientCount === 1 ? "" : "s"} from RMR Golf.
              </p>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={sending}
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
              >
                No
              </button>
              <button
                type="button"
                onClick={sendEmail}
                disabled={sending}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {sending ? "Sending…" : "Yes, Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
