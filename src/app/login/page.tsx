"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [sendingReset, setSendingReset] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "success") {
      setMessage({ type: "success", text: "Password updated. You can now sign in." });
      return;
    }
    if (params.get("error") === "auth") {
      setMessage({ type: "error", text: "Authentication link is invalid or expired. Please try again." });
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage({ type: "error", text: error.message });
      setLoading(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const nextPath = params.get("next");
    router.push(nextPath && nextPath.startsWith("/") ? nextPath : "/");
    router.refresh();
    setLoading(false);
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const emailToReset = resetEmail.trim().toLowerCase();
    if (!emailToReset) {
      setMessage({ type: "error", text: "Enter your email to reset your password." });
      return;
    }

    setSendingReset(true);
    const redirectTo = `${window.location.origin}/auth/confirm`;
    const { error } = await supabase.auth.resetPasswordForEmail(emailToReset, { redirectTo });

    if (error) {
      setMessage({ type: "error", text: error.message });
      setSendingReset(false);
      return;
    }

    setMessage({
      type: "success",
      text: "Password reset email sent. Check your inbox for the secure link.",
    });
    setSendingReset(false);
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
        <h1 className="mb-2 text-center text-2xl font-bold text-emerald-800">
          RMR Golf League
        </h1>
        <p className="mb-6 text-center text-sm text-zinc-600">
          Sign in to your account
        </p>

        <form onSubmit={resetMode ? handlePasswordReset : handleLogin} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={resetMode ? resetEmail : email}
              onChange={(e) => (resetMode ? setResetEmail(e.target.value) : setEmail(e.target.value))}
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 sm:text-sm placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="you@example.com"
            />
          </div>
          {!resetMode && (
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 sm:text-sm placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="••••••••"
              />
            </div>
          )}
          {message && (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                message.type === "error"
                  ? "bg-red-100 text-red-800"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {message.text}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || sendingReset}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {resetMode ? (sendingReset ? "Sending reset link…" : "Send reset link") : loading ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setResetMode((prev) => !prev);
            }}
            className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
          >
            {resetMode ? "Back to sign in" : "Forgot password?"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Need an account?{" "}
          <Link href="/signup" className="font-medium text-emerald-600 hover:underline">
            Create one
          </Link>
        </p>
      </div>
      </div>
    </div>
  );
}
