"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type AccountProfileFormProps = {
  playerId: string;
  userId: string;
  initialFullName: string;
  initialEmail: string;
  initialGhin: string;
  initialHandicapIndex: number;
};

type Message = {
  type: "error" | "success";
  text: string;
};

export function AccountProfileForm({
  playerId,
  userId,
  initialFullName,
  initialEmail,
  initialGhin,
  initialHandicapIndex,
}: AccountProfileFormProps) {
  const [fullName, setFullName] = useState(initialFullName);
  const [ghin, setGhin] = useState(initialGhin);
  const [handicapIndex, setHandicapIndex] = useState(String(initialHandicapIndex));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    const nextFullName = fullName.trim();
    const nextGhin = ghin.trim();
    const nextHandicapRaw = handicapIndex.trim();

    if (!nextFullName || !nextGhin || !nextHandicapRaw) {
      setMessage({ type: "error", text: "Full name, GHIN, and handicap index are required." });
      return;
    }

    const parsedHandicap = Number(nextHandicapRaw);
    if (!Number.isFinite(parsedHandicap) || parsedHandicap < 0 || parsedHandicap > 54) {
      setMessage({ type: "error", text: "Handicap index must be a number between 0 and 54." });
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("players")
      .update({
        full_name: nextFullName,
        ghin: nextGhin,
        handicap_index: Number(parsedHandicap.toFixed(1)),
      })
      .eq("id", playerId)
      .eq("auth_user_id", userId)
      .select("full_name, ghin, handicap_index")
      .maybeSingle();

    if (error) {
      setMessage({ type: "error", text: error.message });
      setSaving(false);
      return;
    }

    if (!data) {
      setMessage({
        type: "error",
        text: "Could not update profile for this account. Please refresh and try again.",
      });
      setSaving(false);
      return;
    }

    setFullName(String(data.full_name ?? nextFullName));
    setGhin(String(data.ghin ?? nextGhin));
    setHandicapIndex(String(Number(data.handicap_index ?? parsedHandicap)));
    setMessage({ type: "success", text: "Profile updated successfully." });
    setSaving(false);
  };

  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-white/95 p-5 shadow-lg backdrop-blur sm:p-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="account-full-name" className="mb-1 block text-sm font-medium text-zinc-700">
            Full Name
          </label>
          <input
            id="account-full-name"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="account-email" className="mb-1 block text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            id="account-email"
            type="email"
            value={initialEmail}
            readOnly
            className="w-full rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-base text-zinc-700"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Email changes are managed through account auth flow.
          </p>
        </div>

        <div>
          <label htmlFor="account-ghin" className="mb-1 block text-sm font-medium text-zinc-700">
            GHIN
          </label>
          <input
            id="account-ghin"
            type="text"
            value={ghin}
            onChange={(event) => setGhin(event.target.value)}
            required
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="account-handicap-index" className="mb-1 block text-sm font-medium text-zinc-700">
            Handicap Index
          </label>
          <input
            id="account-handicap-index"
            type="number"
            min={0}
            max={54}
            step="0.1"
            value={handicapIndex}
            onChange={(event) => setHandicapIndex(event.target.value)}
            required
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {message && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              message.type === "error" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </form>
    </div>
  );
}
