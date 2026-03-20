"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type ChangePasswordFormProps = {
  email?: string;
  userId?: string;
};

type Message = {
  type: "error" | "success";
  text: string;
};

const MIN_PASSWORD_LENGTH = 6;

export function ChangePasswordForm({ email, userId }: ChangePasswordFormProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (!newPassword || !confirmPassword) {
      setMessage({ type: "error", text: "All fields are required." });
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setMessage({ type: "error", text: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "New password and confirmation do not match." });
      return;
    }

    setSaving(true);

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setMessage({ type: "error", text: updateError.message });
      setSaving(false);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setMessage({ type: "success", text: "Password updated successfully." });
    setSaving(false);
    router.refresh();
  };

  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-white/95 p-5 shadow-lg backdrop-blur sm:p-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-zinc-700">
            New Password
          </label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-zinc-700">
            Confirm New Password
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            placeholder="••••••••"
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
          {saving ? "Updating password..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}
