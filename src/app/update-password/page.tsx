"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type StatusMessage = {
  type: "error" | "success";
  text: string;
};

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [canReset, setCanReset] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let mounted = true;

    const initializeRecoverySession = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const code = searchParams.get("code");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error && mounted) {
          setMessage({ type: "error", text: "Reset link is invalid or expired. Request a new one." });
        }
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error && mounted) {
          setMessage({ type: "error", text: "Reset link is invalid or expired. Request a new one." });
        }
        if (window.location.hash) {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session) {
        setCanReset(true);
      } else {
        setCanReset(false);
        setMessage((current) => current ?? { type: "error", text: "No valid reset session found. Request a new link." });
      }

      setInitializing(false);
    };

    initializeRecoverySession();

    return () => {
      mounted = false;
    };
  }, [supabase.auth]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!canReset) {
      setMessage({ type: "error", text: "No valid reset session found. Request a new link." });
      return;
    }

    if (!password || password.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }

    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage({ type: "error", text: error.message });
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login?reset=success");
    router.refresh();
  };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      <div
        className="fixed inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/backgrounds/login-bg.jpg')" }}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 -z-10 bg-gradient-to-b from-[#0b211b]/70 via-[#12362d]/58 to-[#17453a]/44"
        aria-hidden="true"
      />
      <div
        className="fixed inset-x-0 bottom-0 -z-10 h-28 bg-gradient-to-b from-white/0 via-zinc-100/55 to-zinc-100"
        aria-hidden="true"
      />

      <div className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-emerald-200 bg-white p-8 shadow-lg">
          <h1 className="mb-2 text-center text-2xl font-bold text-emerald-800">Update Password</h1>
          <p className="mb-6 text-center text-sm text-zinc-600">Choose a new password for your account.</p>

          {initializing ? (
            <p className="text-center text-sm text-zinc-600">Verifying reset link…</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-zinc-700">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={!canReset}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 sm:text-sm placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-zinc-700">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  disabled={!canReset}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 sm:text-sm placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
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
                disabled={!canReset || loading}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Updating password…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
