"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { resolvePlayerProfileForUser } from "@/lib/player-profile";

type Message = {
  type: "error" | "success";
  text: string;
};

function mapPlayerError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("players_email_key") || (lower.includes("email") && lower.includes("duplicate"))) {
    return "That email is already in use.";
  }
  if (lower.includes("players_ghin_key") || (lower.includes("ghin") && lower.includes("duplicate"))) {
    return "That GHIN is already in use.";
  }
  if (lower.includes("players_auth_user_id_key") || lower.includes("auth_user_id")) {
    return "A player profile already exists for this account.";
  }
  return message;
}

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ghin, setGhin] = useState("");
  const [handicapIndex, setHandicapIndex] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);

  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!isMounted) return;

      const user = data.user;
      if (!user) {
        setChecking(false);
        return;
      }

      if (!isMounted) return;

      const playerResolution = await resolvePlayerProfileForUser({
        supabase,
        userId: user.id,
        userEmail: user.email ?? null,
      });

      if (!isMounted) return;

      if (playerResolution.status === "resolved") {
        router.push("/");
        router.refresh();
        return;
      }

      if (playerResolution.status === "error" || playerResolution.status === "conflict") {
        setMessage({ type: "error", text: playerResolution.message });
        setChecking(false);
        return;
      }

      if (user.email) {
        setEmail(user.email);
      }
      setChecking(false);
    });

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const supabase = createClient();

    const nextFullName = fullName.trim();
    const nextEmail = email.trim().toLowerCase();
    const nextGhin = ghin.trim();
    const nextHandicap = handicapIndex.trim();

    if (!nextFullName || !nextEmail || !password || !nextGhin || !nextHandicap) {
      setMessage({ type: "error", text: "All fields are required." });
      return;
    }

    const handicap = Number(nextHandicap);
    if (Number.isNaN(handicap) || handicap < 0 || handicap > 54) {
      setMessage({
        type: "error",
        text: "Handicap index must be a number between 0 and 54.",
      });
      return;
    }

    setLoading(true);

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    let userId: string;
    let playerEmail = nextEmail;

    if (currentUser) {
      const playerResolution = await resolvePlayerProfileForUser({
        supabase,
        userId: currentUser.id,
        userEmail: currentUser.email ?? null,
      });

      if (playerResolution.status === "resolved") {
        setMessage({
          type: "error",
          text: "A player profile already exists for this account.",
        });
        setLoading(false);
        router.push("/");
        router.refresh();
        return;
      }

      if (playerResolution.status === "error" || playerResolution.status === "conflict") {
        setMessage({ type: "error", text: playerResolution.message });
        setLoading(false);
        return;
      }

      userId = currentUser.id;
      playerEmail = currentUser.email ?? nextEmail;
    } else {
      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        email: nextEmail,
        password,
      });

      if (signupError) {
        setMessage({ type: "error", text: signupError.message });
        setLoading(false);
        return;
      }

      const newUser = signupData.user;
      if (!newUser) {
        setMessage({
          type: "error",
          text: "Signup succeeded, but user session is unavailable. Please sign in.",
        });
        setLoading(false);
        return;
      }

      userId = newUser.id;
      playerEmail = newUser.email ?? nextEmail;
    }

    const { error: playerError } = await supabase.from("players").insert({
      auth_user_id: userId,
      full_name: nextFullName,
      email: playerEmail,
      ghin: nextGhin,
      handicap_index: handicap,
      is_approved: false,
    });

    if (playerError) {
      setMessage({ type: "error", text: mapPlayerError(playerError.message) });
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
    setLoading(false);
  };

  if (checking) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-emerald-50 px-4">
        <p className="text-sm text-zinc-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-emerald-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-emerald-200 bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-center text-2xl font-bold text-emerald-800">
          Create Account
        </h1>
        <p className="mb-6 text-center text-sm text-zinc-600">
          Set up your RMR Golf League player profile
        </p>

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <div>
            <label htmlFor="full-name" className="mb-1 block text-sm font-medium text-zinc-700">
              Full Name
            </label>
            <input
              id="full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 sm:text-sm placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 sm:text-sm placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

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
            />
          </div>

          <div>
            <label htmlFor="ghin" className="mb-1 block text-sm font-medium text-zinc-700">
              GHIN
            </label>
            <input
              id="ghin"
              type="text"
              value={ghin}
              onChange={(e) => setGhin(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 sm:text-sm placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="handicap-index" className="mb-1 block text-sm font-medium text-zinc-700">
              Handicap Index
            </label>
            <input
              id="handicap-index"
              type="number"
              min={0}
              max={54}
              step="0.1"
              value={handicapIndex}
              onChange={(e) => setHandicapIndex(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 sm:text-sm placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

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
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-emerald-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
