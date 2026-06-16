# Podcast Script — "Your Plan, Your Agents: The Claude Agent SDK Billing Change"

**Format:** Two-host conversational podcast (~9–11 minutes read aloud)
**Hosts:** MAYA (host/explainer) and DEV (engineer, plays the curious builder)
**Topic:** The change to how Claude Agent SDK usage is billed against your Claude plan, plus concrete ways to use it in the RMR Golf League workflow.
**Source article:** [Use the Claude Agent SDK with your Claude plan — Claude Help Center](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)

> Accuracy note for the record: the support article is the source of truth. Independent coverage from mid-June 2026 indicates the rollout of the separate Agent SDK credit was paused/in flux right at launch (June 15, 2026). Confirm the live status in your Claude account before relying on specific numbers.

---

## COLD OPEN

**MAYA:** If you've ever wired up the Claude Agent SDK, run a `claude -p` script in a cron job, and then watched your Claude subscription mysteriously hit its usage limit at 9am on a Monday — this episode is for you.

**DEV:** Guilty. I had a nightly script chewing through my Max plan and I couldn't figure out why my afternoon coding sessions kept getting throttled.

**MAYA:** Right. So Anthropic changed how that works, and today we're breaking down exactly what changed, why it matters, and — for our resident golf-app builder — five real ways to put it to work.

---

## SEGMENT 1 — What actually changed

**MAYA:** Quick level-set. The Claude Agent SDK is the toolkit for building your own agents on the same harness that powers Claude Code — file tools, bash, MCP servers, the agent loop, all of it. You can run it interactively, or headless and programmatic with `claude -p`.

**DEV:** And the question that always came up was: "When I run an agent SDK script, what wallet does that come out of? My Pro or Max subscription, or a separate API bill?"

**MAYA:** Exactly. Historically, if you authenticated with your subscription, that programmatic usage counted against the *same* usage limits as your interactive Claude Code and Claude.ai sessions. So your background automation competed with you, the human, for the same quota.

**DEV:** Which is a terrible feeling. Your robots eat your lunch.

**MAYA:** So the announced change — effective around June 15, 2026 — was: Agent SDK and `claude -p` usage gets moved *off* your interactive subscription limits and onto a **separate monthly Agent SDK credit**. Your subscription usage limits stay reserved for the interactive stuff: Claude Code, Cowork, Claude.ai.

**DEV:** So the headline is "your automation no longer steals from your interactive quota."

**MAYA:** That's the intent. The reported credit amounts were roughly twenty dollars on Pro, a hundred on Max 5x, and two hundred on Max 20x — and that credit is billed at standard API rates, it's per-user, it refreshes with your billing cycle, and it can't be pooled or shared across teammates.

**DEV:** Per-user, no pooling. So a team of five doesn't get one big shared bucket — everybody gets their own.

**MAYA:** Correct. Now — the honesty caveat, because it's June 16th as we record this: there was reporting that the rollout got paused or was in flux right at launch. So treat the specific dollar figures as "check your account," not gospel. The mechanics and the *direction* are the durable part.

---

## SEGMENT 2 — How you actually authenticate

**DEV:** Okay, practical question. How do I point the Agent SDK at my plan instead of an API key?

**MAYA:** The Agent SDK wraps the Claude Code CLI, and the CLI understands two kinds of credentials: a standard API key, or an OAuth token tied to your subscription. For the subscription path:

**DEV:** Walk me through it.

**MAYA:** Install the Claude CLI, then run `claude setup-token`. It takes you through OAuth authorization and prints a token. You copy that and set it as the `CLAUDE_CODE_OAUTH_TOKEN` environment variable. The SDK picks it up, and calls land on your subscription / Agent SDK credit instead of a pay-as-you-go API bill.

**DEV:** And the alternative is just `ANTHROPIC_API_KEY` with a Console key, pay-as-you-go.

**MAYA:** Right. And here's the important governance point: the OAuth-subscription path is intended for *your own individual use* of Claude Code and Anthropic's own apps. If you're building a **product or service that other people use** — something multi-tenant, something you ship — Anthropic's guidance is to use **API key authentication** through the Console, not subscription OAuth tokens.

**DEV:** So: personal automation and my own dev tooling — subscription token is fair game. A SaaS I sell to other golf leagues — API key.

**MAYA:** You nailed the line. Keep that distinction in your head, because it decides which auth and which wallet is appropriate.

---

## SEGMENT 3 — Five ways to use this in the RMR Golf League workflow

**MAYA:** Let's make this concrete. Our builder runs the RMR Golf League app — Next.js App Router, TypeScript, Supabase, mobile-first for iPhone Safari. Weekly 9-hole league scoring, leaderboards, and the RMR Cup competition with its own points-by-finish standings. Here are five Agent SDK uses that fit that workflow like a glove.

**DEV:** And notice — most of these are *headless, scheduled* jobs. Which is exactly the usage this billing change is about.

### Idea 1 — Weekly standings recompute + email generation

**MAYA:** A scheduled Agent SDK job runs every Sunday night. It pulls the week's scores from Supabase, recalculates the RMR Cup standings — points by finish position, the best-10-weeks rule, the rainout reductions — and then fills in the existing email templates: the tee sheet, the leaderboard, the reminders.

**DEV:** They already have `email-tee-sheet-preview.html` and `email-reminder-preview.html` sitting in the repo. The agent populates those and queues them to send. No human in the loop on a Sunday night.

**MAYA:** And because it's a `claude -p` style job, it draws on the Agent SDK credit, not the commissioner's interactive quota.

### Idea 2 — Score-entry data-quality agent

**DEV:** Score entry is mobile, on the course, thumbs on glass. Mistakes happen.

**MAYA:** So an agent reviews newly submitted scores for anomalies — an impossible 9-hole total, a duplicate entry for the same player and week, a Cup player who's missing entirely — and flags them to the admin before they pollute the standings.

**DEV:** Critically, it respects the rule from `AGENTS.md`: Cup logic only applies to players where `cup = true`. The agent flags, it doesn't silently "fix" scoring.

### Idea 3 — PR review agent in CI

**MAYA:** This one's for the developer, not the league. Drop the Agent SDK into a GitHub Action that reviews every pull request against the project's own rulebook — mobile-first layouts, don't touch the scoring calculations, preserve the Supabase schema, smallest-possible-change.

**DEV:** Basically encode `AGENTS.md` as a reviewer. It runs `npm run build`, confirms no errors, and comments if a PR violates a guardrail.

**MAYA:** That's a textbook Agent SDK use — and in CI you'd typically use an API key, since it's running as infrastructure rather than a person at a keyboard.

### Idea 4 — Natural-language admin assistant

**DEV:** Embed an Agent SDK-powered assistant right in the `/admin` page.

**MAYA:** The commissioner types, "Who's leading the Cup after week 8?" or "Mark week 6 as a rainout and recompute standings." The agent runs the Supabase queries, applies the best-weeks reduction — ten drops to nine after the first rainout, nine to eight after the third — and reports back.

**DEV:** And if this becomes a feature real users log into, that's the "product" case — so API-key auth, not a personal subscription token.

### Idea 5 — Playoff and rainout automation

**MAYA:** The Cup has two playoff weeks decided by best net score across them, with a one-stroke advantage for the regular-season winner and runner-up. An agent can detect when the regular season closes, lock standings, seed the playoff, and apply those stroke advantages automatically.

**DEV:** All the fiddly rules that are easy to get wrong by hand at 11pm — delegated to a deterministic, repeatable agent run.

---

## SEGMENT 4 — The mental model to walk away with

**MAYA:** So if you remember three things from this episode—

**DEV:** One: your background agents and your interactive sessions are being separated into different wallets, so automation stops cannibalizing your own quota.

**MAYA:** Two: authentication is a fork in the road. `claude setup-token` plus `CLAUDE_CODE_OAUTH_TOKEN` for your *own* use; a Console API key for anything you *ship to others*.

**DEV:** And three: the highest-value uses in a workflow like the golf league are the boring, scheduled, headless ones — weekly recomputes, data-quality checks, CI review — which is exactly the usage this change is designed around.

**MAYA:** Check your account for the live credit numbers, because that piece was still settling as of mid-June. But the architecture is the takeaway: build the agents, point them at the right wallet, and let the Sunday-night work do itself.

**DEV:** Now go automate your leaderboard so you can actually watch the golf.

**MAYA:** Thanks for listening.

---

## SOURCES

- [Use the Claude Agent SDK with your Claude plan — Claude Help Center](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [Use Claude Code with your Pro or Max plan — Claude Help Center](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)
- [Authentication — Claude Code Docs](https://code.claude.com/docs/en/authentication)
- [How to use your Claude Pro/Max subscription with the Agent SDK (Python + TypeScript) — DEV Community](https://dev.to/aviv_shaked/how-to-use-your-claude-promax-subscription-with-the-agent-sdk-python-typescript-4emi)
- [Anthropic Ends Subscription Subsidy for Agents June 15 — TechTimes](https://www.techtimes.com/articles/317625/20260602/anthropic-ends-subscription-subsidy-agents-june-15-credit-pool-replaces-flat-rate-access.htm)
- [Claude Credit Overhaul 2026: Anthropic Pauses the June 15 Change — Digital Applied](https://www.digitalapplied.com/blog/anthropic-claude-credit-overhaul-june-15-2026)
