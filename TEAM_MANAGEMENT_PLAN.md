# Crew / Team Management — Investigation & Unification Plan

_Investigation done 2026-07-03/04. **No data or code touched for this part — read-only.**_

## Short answer to your questions

- **Are Schedule Team and Manage Crew Members the same table?** No. They are **two
  completely separate database tables** that never talk to each other.
- **Why do more people show on the schedule than in Manage Crew Members?** Because
  they are different lists. The JWG schedule has **19 people**; Manage Crew Members
  shows **9** (the active ones). They were built at different times for different
  purposes and were never linked.
- **Which is the source of truth?** Neither, today. Each is the source of truth for
  its own half of the app (see below). That is exactly the problem.
- **Junk vs bins vs JWG staff handled separately?** Junk and bins share ONE list
  (`crew_members`). JWG scheduling uses a DIFFERENT list (`jwg_employees`). There is
  no "bin crew vs junk crew" split in the data — they're the same people.

## What actually exists

There are **two people lists** plus a separate **logins** list.

### List 1 — "Crew Members" (`crew_members` table) — the Junk/Bins side
- **Where you manage it:** Admin → **Crew Members**, and the "Manage Crew Members"
  button on the Crew Schedule page. Both edit the same list.
- **Who's on it:** 10 rows, 9 active (Darrin is set inactive). Jake, Jeff, Jon,
  Jordan, Josh, Kevin, Max, Neil, Tyler N.
- **What uses it:** dispatch & job crew assignment, the dashboard Crew Schedule,
  time-off (`crew_blocks`), truck clock-in, the driver leaderboard & safety scores,
  Live Jobs driver grouping, damage reports, and the office TV bin board.
- **Fields it has today:** name, **active** (true/false), color. That's it.
- **"Remove" is a soft delete** — it just sets active=false, the row stays.

### List 2 — "Team" in the Schedule page (`jwg_employees` table) — the JWG side
- **Where you manage it:** sidebar **Schedule** → **Team** tab (add/remove people).
- **Who's on it:** 19 rows. Includes everyone plus office/seasonal people who
  aren't junk crew: Barb, Beth, Jack, Jasper, Kelly, Micaela, Rachel, Samantha,
  Tyler M, etc.
- **What uses it:** the JWG schedule grid, **Staff Check-In ratings**, the office
  TV crew-schedule board, and the Clothing tab.
- **Fields it has today:** name only. **No active flag, no season flag, nothing.**
- **"Remove" is a hard delete** — the row is gone, and it **also deletes that
  person's rating history** (ratings are linked to this table).

### List 3 — Logins (`user_profiles`) — not a crew list
- Who can sign in and who's an admin. Separate concern, leave as-is.

### The only "connection" between List 1 and List 2
There is **no real link** — no shared ID. A couple of read-only displays (the office
TV, the junk→JWG schedule overlay) try to match people **by name text**. So "Tyler N"
in one list and "Tyler N" in the other only line up because the spelling happens to
match. Rename one and the match silently breaks. 9 of the 19 JWG names currently
match an active crew name; the other 10 JWG people exist only on the JWG side.

## Why this is confusing (in plain terms)

- The same person (e.g. Jon) exists as **two unrelated records** — one for
  dispatch/bins, one for the JWG schedule + ratings. Editing one doesn't touch the
  other.
- Office/seasonal staff (Barb, Rachel, etc.) only exist on the JWG side, so they show
  on the schedule but never in Manage Crew Members — which is the exact gap you saw.
- Two different "remove" behaviours: one is a safe soft-delete, the other permanently
  erases the person **and their rating history**.

## A few things worth knowing before any cleanup

These are landmines the plan has to respect so no data is lost:

1. **Deleting a JWG person deletes their ratings.** Any merge must preserve rating
   history.
2. **The name-matching bridge is fragile.** The TV board and the junk→JWG overlay
   pair people by exact name. A unify step must keep names stable or replace the
   name-match with a real ID link.
3. **Truck auto-assignment is hard-coded to names** (Max, Darrin, Neil, Kevin).
   Renaming any of them silently breaks their automatic truck clock-in.
4. **Two displays already show soft-deleted crew** (the TV board and the JWG overlay
   read the crew list without the active filter) — a pre-existing small bug we can
   fix as part of this.

## Recommended end state — one Team, assigned to areas

One **Team Management** page (grow the existing Manage Crew Members page into it).
Each person is added **once** and carries toggles:

| Toggle | Meaning |
|---|---|
| **Junk / Bins** | shows in dispatch, job assignment, bin board, leaderboard |
| **Jeff White Group** | shows in the JWG schedule, ratings, clothing |
| **Active / Inactive** | inactive people are hidden everywhere but not deleted |
| **Summer / Winter** | seasonal availability (new — no such flag exists today) |

Everything that currently reads either list would read this one Team list, filtered by
the relevant toggle (e.g. dispatch shows "Junk/Bins + Active", the JWG schedule shows
"JWG + Active", Staff Check-In rates "JWG + Active").

## How I'd get there safely (phased, reversible, no data loss)

I'm **not doing any of this yet** — this is the plan for your approval.

- **Phase 0 — add the toggles, change nothing visible.** Add `on_junk`, `on_jwg`,
  `active`, `season` columns to one chosen master table. No behaviour changes.
- **Phase 1 — reconcile the two lists once.** Match the 19 JWG people to the 10 crew
  people by name, you confirm the handful that are ambiguous, and I set the toggles
  (existing crew → Junk/Bins on; JWG-only office staff → JWG on). Both old lists keep
  working during this phase.
- **Phase 2 — point the app at the master list, one consumer at a time** (dispatch,
  then schedule, then ratings, then TV), verifying each still shows the right people.
  Keep the ID link so nothing depends on name spelling anymore.
- **Phase 3 — one Team page, retire the second "add person" spot.** The JWG Team tab
  becomes a filtered view of the same Team page instead of its own list.
- **Phase 4 — clean up** the soft-delete display bug and the hard-coded truck names.

Each phase is independently shippable and reversible, and no crew or rating rows get
deleted at any point.

## One thing I need from you before Phase 1

The reconciliation needs your eyes on a few names — e.g. is "Tyler M" (JWG) a
different person from "Tyler N" (crew)? Is "Sam"/"Samantha" one person or two? I'll
bring you a short match list to confirm rather than guessing.

## Decision needed

Do you want the **single master list** approach above? And should the master table be
the Junk-side `crew_members` (has active + color already) or the JWG-side
`jwg_employees` (has the ratings history attached)? My recommendation: **master =
`crew_members`** (safer delete behaviour, already has flags) and re-link ratings to
it during Phase 2 so no history is lost.
