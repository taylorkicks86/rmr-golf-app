import Link from "next/link";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { getCupTeamPlayingConflict } from "@/lib/cup-team-playing-guard";
import { verifyRsvpToken } from "@/lib/rsvp-email";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

type Result =
  | {
      status: "playing" | "out";
      playerName: string;
      weekLabel: string;
    }
  | {
      status: "error";
      message: string;
    };

type LeagueWeek = {
  id: string;
  week_date: string;
  play_date: string | null;
  side_to_play: "front" | "back";
  is_finalized: boolean;
};

type Player = {
  id: string;
  full_name: string;
  cup: boolean | null;
};

function formatWeekLabel(week: LeagueWeek): string {
  const rawDate = week.play_date ?? week.week_date;
  const [yearText, monthText, dayText] = rawDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date =
    Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
          timeZone: "UTC",
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : rawDate;
  return `${date} · ${week.side_to_play === "front" ? "Front 9" : "Back 9"}`;
}

function getServiceSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function saveRsvp(token: string | undefined): Promise<Result> {
  if (!token) {
    return { status: "error", message: "This RSVP link is missing its secure token." };
  }

  let payload: ReturnType<typeof verifyRsvpToken>;
  try {
    payload = verifyRsvpToken(token);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Invalid RSVP link." };
  }

  const supabase = getServiceSupabase();
  const [{ data: player, error: playerError }, { data: week, error: weekError }] = await Promise.all([
    supabase.from("players").select("id, full_name, cup").eq("id", payload.playerId).maybeSingle(),
    supabase
      .from("league_weeks")
      .select("id, week_date, play_date, side_to_play, is_finalized")
      .eq("id", payload.weekId)
      .maybeSingle(),
  ]);

  if (playerError || !player) {
    return { status: "error", message: "We could not find the player for this RSVP link." };
  }
  if (weekError || !week) {
    return { status: "error", message: "We could not find the week for this RSVP link." };
  }

  const resolvedPlayer = player as Player;
  const resolvedWeek = week as LeagueWeek;
  if (resolvedWeek.is_finalized) {
    return { status: "error", message: "This week is already finalized, so RSVP changes are closed." };
  }

  const playingThisWeek = payload.choice === "yes";
  const isCupPlayer = resolvedPlayer.cup === true;
  if (playingThisWeek && isCupPlayer) {
    const conflictCheck = await getCupTeamPlayingConflict({
      supabase,
      leagueWeekId: payload.weekId,
      playerId: payload.playerId,
    });
    if (conflictCheck.error) {
      return { status: "error", message: conflictCheck.error };
    }
    if (conflictCheck.hasConflict) {
      return {
        status: "error",
        message: "Only one member of a 2-player Cup team can be marked playing for this week.",
      };
    }
  }

  const { error: upsertError } = await supabase.from("weekly_participation").upsert(
    {
      league_week_id: payload.weekId,
      player_id: payload.playerId,
      playing_this_week: playingThisWeek,
      attendance_status: playingThisWeek ? "playing" : "not_playing",
      cup: playingThisWeek && isCupPlayer,
    },
    { onConflict: "league_week_id,player_id" }
  );

  if (upsertError) {
    return { status: "error", message: upsertError.message };
  }

  return {
    status: playingThisWeek ? "playing" : "out",
    playerName: resolvedPlayer.full_name,
    weekLabel: formatWeekLabel(resolvedWeek),
  };
}

export default async function RsvpRespondPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const result = await saveRsvp(params.token);
  const isError = result.status === "error";
  const statusText =
    result.status === "playing" ? "You are marked as playing" : result.status === "out" ? "You are marked as out" : "RSVP not updated";
  const heroText = isError ? "We could not update your RSVP." : "Your attendance has been updated for this week.";

  return (
    <main className="min-h-screen bg-[#f3f5ef] text-[#171717]">
      <section className="bg-[linear-gradient(rgba(29,57,47,.58),rgba(29,57,47,.58)),url('/images/backgrounds/rmr-course-bg.jpg')] bg-cover bg-center px-5 pb-28 pt-14">
        <div className="mx-auto max-w-3xl">
          <div className="text-[13px] font-extrabold uppercase leading-5 tracking-[4px] text-[#bceada]">RMR Golf League</div>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-normal text-white sm:text-5xl">
            {isError ? "RSVP needs attention" : "RSVP confirmed"}
          </h1>
          <p className="mt-3 text-lg font-bold leading-7 text-[#edf7f1]">{heroText}</p>
        </div>
      </section>

      <section className="mx-auto -mt-20 max-w-3xl px-5 pb-12">
        <div className="overflow-hidden rounded-lg border border-[#b9d9cc] bg-[#fffdf7] shadow-[0_14px_38px_rgba(29,57,47,.18)]">
          <div className="bg-[#1d392f] px-6 py-5 text-white">
            <span
              aria-hidden="true"
              className={`mr-3 inline-block h-3.5 w-3.5 rounded-full align-middle ${
                isError ? "bg-red-500" : "bg-[#15d6ad]"
              }`}
            />
            <span className="align-middle text-xl font-extrabold leading-7 sm:text-2xl">{statusText}</span>
          </div>
          <div className="px-6 py-7">
            {isError ? (
              <p className="m-0 text-base leading-7 text-[#5f6470]">{result.message}</p>
            ) : (
              <>
                <p className="m-0 text-sm font-extrabold uppercase leading-5 tracking-[2px] text-[#467866]">This Week</p>
                <h2 className="mb-2 mt-1 text-2xl font-extrabold leading-9 text-[#171717] sm:text-3xl">{result.weekLabel}</h2>
                <p className="m-0 text-base leading-7 text-[#5f6470]">
                  Thanks, {result.playerName}. The tee sheet and attendance list now show you as{" "}
                  {result.status === "playing" ? "playing" : "out"} this week.
                </p>
              </>
            )}
            <Link
              href="/"
              className="mt-6 inline-block rounded-md bg-[#0a9f6b] px-5 py-3.5 text-base font-extrabold leading-5 text-white"
            >
              Back to RMR Golf
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
