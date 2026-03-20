# RMR Golf League Web App – AGENTS.md

You are working on the **RMR Golf League web application**.

This file defines the rules, priorities, and guardrails for all AI agents working on this repository.

Agents must read this file before making any changes.


--------------------------------
PROJECT CONTEXT
--------------------------------

Tech stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Supabase

Primary device target
- Mobile-first design
- Safari on iPhone is the primary user experience

Project purpose
- Weekly 9-hole golf league scoring system
- Track league participation
- Track weekly scores
- Generate leaderboards
- Manage the RMR Cup competition


--------------------------------
GENERAL DEVELOPMENT RULES
--------------------------------

Always follow these principles:

1. **Mobile-first UI**
   - All layouts must work well on iPhone screens first
   - Avoid fixed widths
   - Prefer stacked layouts and large touch targets

2. **Preserve existing scoring logic**
   - Do not change scoring calculations unless explicitly requested

3. **Preserve Supabase schema**
   - Do not remove or modify existing tables or columns unless explicitly instructed
   - Small additive fields/tables are acceptable if required for official RMR Cup rules

4. **Prefer additive improvements**
   - Favor UI improvements or small logic additions
   - Avoid large rewrites of working pages

5. **Reuse existing components**
   - Always inspect the repo for reusable components before creating new ones

6. **Assume Supabase is already connected**

7. **Do not modify unrelated pages**

8. **After making changes**
   - Summarize files changed
   - Run a production build
   - Confirm no build errors


--------------------------------
PROJECT STRUCTURE
--------------------------------

Important directories

app/
Route pages and layouts

components/
Reusable UI components

lib/
Shared utilities and Supabase client

public/images/backgrounds/
Hero and background images used across the app


Important pages

Home / Dashboard  
Score Entry  
Leaderboard  
Schedule  
Players  
Admin pages


--------------------------------
RMR CUP IMPLEMENTATION RULE
--------------------------------

All RMR Cup logic applies **ONLY** to players marked as Cup players.

Cup player column

players.cup boolean

Cup player definition

cup = true


Regular league players may still:

- Enter scores
- Appear in weekly leaderboards
- Participate in weekly play

But **Cup scoring, Cup standings, Cup points, and Cup playoffs must only apply to Cup players**.


--------------------------------
RMR CUP OFFICIAL RULES
--------------------------------

The official **RMR Cup Player Guide** is the source of truth.

The app should reflect the following Cup rules.


Regular season
- 13 regular season weeks


Playoffs
- Final 2 weeks are playoff weeks


Standings calculation
- Regular season standings are based on **points earned by finish position**
- Standings are **NOT based on cumulative net score**


Best weeks rule
- A player’s **best 10 regular season weeks** count toward standings


Rainout adjustment

If league weeks are cancelled:

- After the **first rainout**, best weeks reduce from **10 to 9**
- After the **third rainout**, best weeks reduce from **9 to 8**
- No further reductions after that


Points table

Position → Points

1 → 750  
2 → 600  
3 → 475  
4 → 400  
5 → 350  
6 → 300  
7 → 250  
8 → 200  
9 → 150  
10 → 100


Attendance rule
- Players receive points **regardless of attendance**


Fill-in rule
- **No fill-ins are allowed**


Vacant position rule
- Players who do not attend split the vacant position points


Playoff scoring
- Final result is determined by the **best net score across the two playoff weeks**


Playoff advantage
- Regular season **winner** receives **one stroke advantage**
- Regular season **runner-up** receives **one stroke advantage**


--------------------------------
IMPLEMENTATION GUIDELINES
--------------------------------

When implementing Cup features:

1. Never apply Cup logic to players where `cup = false`

2. Weekly league scoring and Cup standings must remain **separate concepts**

3. Leaderboards should be able to display

- Weekly results
- Cup standings

4. Cup standings must be calculated using

- Weekly finish position
- Points table
- Best-weeks rule

5. Avoid redesigning working scoring systems unless required

6. Admin tools may be added if needed to support

- Cup player designation
- Rainout tracking
- Cup standings


--------------------------------
AGENT BUILD PROTOCOL
--------------------------------

All agents must follow this workflow when implementing features.

STEP 1  
Inspect the current file before modifying it.

STEP 2  
Prefer editing existing components instead of creating new ones.

STEP 3  
Never invent database columns or tables without checking Supabase schema first.

STEP 4  
If a schema change is required

- Propose the change first
- Explain why it is required

STEP 5  
Make the smallest possible change to accomplish the task.

STEP 6  
After coding

- List files changed
- Explain logic changes
- Run a production build


--------------------------------
BUILD COMMAND
--------------------------------

Run the production build after making changes.

npm run build


--------------------------------
FINAL RULE
--------------------------------

If instructions from previous chats conflict with this file or the official Player Guide:

Follow the **official RMR Cup rules**.