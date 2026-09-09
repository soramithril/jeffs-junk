---
name: health-check
description: Monthly deep sweep for loose ends - unfinished work, known gaps and bugs across the code, the project notes and the audit folder - written to a fresh dated snapshot. Use when Jake asks for a health check of what needs fixing, or the monthly routine runs it. NOT the same as shop-health, which is the weekly data-drift and live-site check.
---

# Monthly health check

Finds what still needs fixing and writes a **fresh dated snapshot**. This is
maintenance, not ideas — Jake's own ideas live in `IDEAS.md` and nothing from
this sweep ever goes there.

## The one rule that matters

**Regenerate. Never hand-maintain the previous snapshot.**

The first run (2026-09-08) produced 258 candidates. **64 were already built**
and **18 more Jake had already decided against** — a third of it was wrong,
because it was assembled from notes nobody had updated. A fresh sweep cannot rot
that way; an edited one always does.

So: write `audit/HEALTH-CHECK-<YYYY-MM-DD>.md` and leave the old one alone.

## Where the output goes

`audit/` is **gitignored on purpose** — those notes name staff and map the
permission model, and this repo is PUBLIC. Never commit the snapshot.

Trap: `git mv` of a tracked file INTO `audit/` silently overrides the ignore and
stages it. After any such move, run `git check-ignore -v <path>` to confirm.

## Sweep

Fan out with the Workflow tool; a single pass cannot hold this.

1. **The code** — `app.js` (~19,700 lines, flat), `app-*.js`, `index.html`,
   `style.css`, `inventory.html`, `jeff.html`, `office-tv.html`, `supabase/`.
2. **The project notes** — `~/.claude/projects/.../memory/` (~100 files). Mine
   for "still open", "parked", "deferred", "not done", "never applied".
3. **The audit folder** — `audit/*.md`. Old and the most likely to be stale.
4. **Supabase advisors** — `get_advisors` for security and performance.

## Then verify every candidate, twice

A candidate is only real if it survives **both**:

1. **Against the code** — is it already built? Grep for the function, feature or
   class. Roughly a quarter of note-sourced "still open" items have shipped.
2. **Against Jake's decisions** — did he already say no? This lives ONLY in the
   memory notes and `CLAUDE.md`, in his own words. Look for "ruled out", "turned
   down", "deliberately", "on purpose", "stays as is", "parked", "we wouldn't",
   "keep it".

**Both, for every candidate.** The first run checked audit-sourced items against
the code but never against his decisions, and shipped him things he had already
declined. He noticed.

Require a **verbatim quote** for any strike. A wrong strike silently buries real
work, which is worse than one extra line on the list.

When de-duplicating, agents flag **both halves** of a pair — dropping both loses
the work. Keep one, and prefer the wording that carries a deadline.

## Writing it up

Group by what happens if it is ignored, not by size:

- **loses data** / **wrong numbers** / **wastes time** / **housekeeping** / **cosmetic**

For each item give a plain sentence a junk-removal business owner understands —
no jargon, no function names, name the button or screen a person touches — plus
the file and line, and what actually goes wrong if it is never done. **Be honest
when the answer is "very little."** A fake alarm costs Jake more than a shrug.

Also say, per item, whether fixing it changes **back-end usage**. Supabase FREE
tier: 500 MB database, 5 GB egress/month, one production project, no test copy.
Say "none — front-end only" when that is the truth.

## Hand over

Report the counts (real, already-built, already-declined), lead with anything
that loses data, and say plainly which items only Jake can do — a phone in hand,
a console login, a physical bin, a decision.

Never merge to `main` off the back of this; the snapshot is not committed at all.
