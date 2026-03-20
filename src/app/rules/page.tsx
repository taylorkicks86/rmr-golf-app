import Link from "next/link";

import { PageHeader } from "@/components/ui/PageHeader";

type RuleSection = {
  title: string;
  lines: string[];
};

const RULE_SECTIONS: RuleSection[] = [
  {
    title: "League Format",
    lines: [
      "Schedule:",
      "13 regular season weeks, 2 playoff weeks (best net score of the two weeks).",
      "",
      "If Newton Comm cancels a regular season round for any reason, that week will become a bye week (no make-up).",
      "",
      "If a playoff round is rained out and you are/were unable to make the other playoff round, a random round from your 10-best regular season scores will be applied as your playoff score (ping pong ball system).",
    ],
  },
  {
    title: "Buy-In and Payouts",
    lines: [
      "Buy-in:",
      "$150 per team/solo player",
      "",
      "Regular Season Payout:",
      "$800 to 1st, $350 to 2nd, $150 to 3rd",
      "",
      "Playoff Payout:",
      "$150 to 1st + $50 trophy",
    ],
  },
  {
    title: "Handicaps",
    lines: [
      "85% Handicap Allowance and the USGA GHIN Handicap Calculator will determine your weekly Playing Handicap.",
      "",
      "Scores for each round must be posted in the Teams chat no later than the Monday following the round.",
    ],
  },
  {
    title: "Scoring",
    lines: [
      "A player’s best 10 weeks (by points earned, not net score) out of the 13 regular season weeks will count towards their leaderboard ranking (i.e. each player receives 3 free DNPs).",
      "",
      "After the first rain-out/cancel (i.e. a 12- or 11-week regular season), we will reduce this to the best 9 weeks.",
      "",
      "After the third rain-out/cancel, we will reduce this to the best 8 weeks. No further reductions will apply.",
      "",
      "Players receive points regardless of attendance (no fill-ins). Players who do not attend a given week will split the vacant position points (e.g. if 3 players do not attend, they will split the total points for 8 through 10 – 150 points each).",
    ],
  },
  {
    title: "Playoffs",
    lines: [
      "Final two weeks of league play will be a 9-hole playoff (best net score out of the two weeks).",
      "",
      "The regular season winner and runner-up will each receive a one-stroke advantage (which will apply to your best net score out of the two weeks).",
    ],
  },
  {
    title: "Mulligans",
    lines: ["One (1) mulligan per round allowed on the first tee shot only. You must play that second ball."],
  },
  {
    title: "Lift, Clean, Play",
    lines: [
      "Ball in the fairway or rough (not bunker or hazard) may be picked up, cleaned, and placed back in its same spot with no penalty at any time. Balls may be moved out of divots, no closer to the hole.",
    ],
  },
  {
    title: "Putting",
    lines: [
      "No \"gimmes\" on the green, ball must be holed.",
      "",
      "Accidental movement of ball by a player is not a penalty (even at address). Put it back where it belongs and putt.",
    ],
  },
  {
    title: "Out of Bounds (OB)",
    lines: [
      "Pace of play is the priority, therefore no stroke-and-distance penalty for OB. Keep it moving.",
      "",
      "Searching for a ball that enters woods or excessively deep rough should last no longer than one minute once you reach search area. If you find it, play it with no penalty.",
      "",
      "If lost, one-stroke penalty and ball should be dropped two club-lengths, no closer to the hole, from where the ball first crossed into the woods/deep rough (if viewable) or vanished from view, whichever is furthest from the hole.",
    ],
  },
  {
    title: "Provisional Ball",
    lines: ["No provisionals. If your ball is OB or lost, follow OB rules above."],
  },
  {
    title: "Relief",
    lines: [
      "Two club-lengths drop, no closer to the hole, for any man-made immovable impediment (fences, netting, telephone pole, cart path) or temporary impediment (dirt pile, standing water) near a ball that would not allow a full swing to be made (includes bunkers, but relief drop must be taken in bunker).",
    ],
  },
  {
    title: "Unplayable Ball",
    lines: [
      "A ball can be declared unplayable at any time for a one-stroke penalty. Options:",
      "",
      "Drop a ball two club-lengths from unplayable ball, no closer to the hole.",
      "",
      "Drop a ball back towards the tee box on a line that runs through the ball from the hole.",
    ],
  },
  {
    title: "Bunkers",
    lines: [
      "Practice swings that contact sand or testing the sand with the club is a one-stroke penalty if done in the bunker where ball is being played. No penalty if done in a separate bunker.",
    ],
  },
  {
    title: "Wrong Ball",
    lines: [
      "Two-stroke penalty for playing the wrong ball. If an opponent’s in-play ball, opponent gets free drop in original spot, no closer to the hole.",
    ],
  },
  {
    title: "Double Hit Ball",
    lines: ["No penalty for contacting a ball twice in the same swing."],
  },
];

export default function RulesPage() {
  return (
    <div className="relative">
      <PageHeader
        label="RMR CUP"
        title="2026 Season"
        subtitle="Player Guide"
        backgroundImage="/images/backgrounds/rmr-course-bg.jpg"
        contentClassName="mx-auto max-w-screen-xl px-4 pb-8 pt-8 sm:px-5 sm:pb-10 sm:pt-10"
        rightSlot={
          <Link href="/" className="text-sm font-medium text-emerald-100 hover:text-white hover:underline">
            ← Home
          </Link>
        }
      />

      <div className="relative z-10 mx-auto -mt-1 w-full max-w-5xl px-3 pb-6 sm:px-4 sm:pb-8">
        <div className="space-y-3 sm:space-y-4">
          {RULE_SECTIONS.map((section, index) => (
            <details
              key={section.title}
              open={index === 0}
              className="group overflow-hidden rounded-md border border-emerald-900/20 bg-[#f8f7f2] shadow-md"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-emerald-950/30 bg-[#17453a] px-3 py-2.5 text-left text-white marker:hidden">
                <span className="text-sm font-semibold sm:text-base">{section.title}</span>
                <span className="text-lg leading-none text-emerald-100 transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="px-3 py-3 sm:px-4">
                <div className="space-y-2 text-sm leading-relaxed text-zinc-800">
                  {section.lines.map((line, lineIndex) =>
                    line === "" ? (
                      <div key={`${section.title}-${lineIndex}`} className="h-2" />
                    ) : (
                      <p key={`${section.title}-${lineIndex}`}>{line}</p>
                    )
                  )}
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
