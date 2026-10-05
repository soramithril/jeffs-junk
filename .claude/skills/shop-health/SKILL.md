---
name: shop-health
description: Run the weekly data-drift and live-site health checks for the Jeff's Junk dashboard and write a short report. Use when Jake asks for a health check, or when the Monday routine runs it.
---

# Shop health check

Measure everything - real numbers, never estimates (Jake's rule). Keep the
report short and plain-language; lead with anything that needs action, and if
everything is fine say so in one line.

## Checks

1. **Invisible dateless jobs** (Supabase MCP SQL). An active job with no date
   shows on NO screen. The reopen path was gated in v517, but new paths can
   appear:
   ```sql
   select job_id, name, service from jobs
   where date is null and coalesce(status,'') not in ('Cancelled','Postponed')
     and service <> 'Extra Jobs';
   ```
   `Extra Jobs` (LAND-) are undated on purpose - never "fix" those.

2. **Duplicate clients creeping back** (same name + same phone; the Aug 2026
   merge folded 201 of these):
   ```sql
   select count(*) from (
     select trim(lower(name)) n, regexp_replace(coalesce(phone,''),'\D','','g') p, count(*)
     from clients where coalesce(trim(name),'') <> ''
     group by 1,2 having count(*) > 1 and regexp_replace(coalesce(phone,''),'\D','','g') <> ''
   ) d;
   ```

3. **Database size vs the free tier** (500 MB limit is CRUCIAL):
   ```sql
   select pg_size_pretty(pg_database_size(current_database())) as db_size;
   ```
   Also `select count(*) from page_views;` - that table is TEMPORARY usage
   tracking (v442, added 2026-07-23, meant to come out after 2-4 weeks).
   While it still exists, report its row count and remind that the
   keep-or-remove decision is Jake's, overdue since early August 2026.

4. **Live site matches the repo:**
   - `curl -s https://soramithril.github.io/jeffs-junk/version.txt` must equal
     `git show origin/main:version.txt` (after a `git fetch`). A mismatch
     means a deploy silently failed or never went out.
   - `gh run list --workflow=parse-check.yml --limit 1` - parse-check is
     advisory only and once sat red for 20 hours while the site was dead. Red
     here = drop everything and check the live site loads.

5. **Cache-buster drift between pages.** Each HTML entry point carries its
   own `?v=` for the same shared file, so one page can quietly fall behind
   and serve a stale copy. Report any file whose number differs across pages:
   ```bash
   for f in $(grep -haoE '[a-z0-9-]+\.(js|css)\?v=[0-9]+' *.html | sed 's/?.*//' | sort -u); do
     echo "$f: $(grep -alo "$f?v=[0-9]*" *.html | while read p; do
       printf '%s=%s ' "$p" "$(grep -ao "$f?v=[0-9]*" "$p" | head -1 | sed 's/.*v=//')"; done)"
   done | awk '{n=0; for(i=2;i<=NF;i++){split($i,a,"="); if(!(a[2] in seen)){seen[a[2]]=1;n++}} delete seen; if(n>1) print "DRIFT: "$0}'
   ```
   The pre-push tripwire blocks NEW drift, but anything already live predates
   that guard and needs a manual bump.

6. **Live console check** only if anything above looks off: load the live
   site in Jake's real Chrome (claude-in-chrome, not the in-app Browser
   pane), confirm `APP_VERSION` via sync DOM eval, console free of errors
   (the intro-bg.mp4 autoplay AbortError noise is benign).

7. **Is Dispatch still telling the truth about the day?** Added 2026-09-05 after
   the model was rebuilt as a chain and calibrated on the crew's real Friday
   (see the dispatch-friday-calibration memory note). Replay the last week
   against what the trucks actually did and report the average error per stop:

   ```sql
   select v.device_id, v.job_id, v.entered_at, v.exited_at,
          j.name, j.city, j.address, j.bin_size, j.bin_bid,
          case when j.bin_pickup = v.entered_at::date then 'pickup' else 'drop' end as leg
   from geofence_visits v join jobs j on j.job_id = v.job_id
   where v.entered_at >= current_date - 7
   order by v.device_id, v.entered_at;
   ```
   Walk each truck's real order through `dispatchSimulateLane` in V8 (the
   harness pattern in the calibration note: load the shipping `app-dispatch.js`,
   stub the browser, inject an OSRM table for the day's points) and compare the
   model's arrival at each stop with `entered_at`. **Baseline to beat: 16 minutes
   average across 19 stops, measured 2026-09-04.** Drifting well past that means
   the crew's habits have moved and the constants need another look; comfortably
   under it means this check has done its job.

   Two traps: `exited_at` is quantised to the 15-minute poll so on-site time is
   an upper bound only, and a stop the GPS never logged makes the model look
   early for the rest of the run - count stops, not just minutes.

   **This check is temporary.** Once the number holds steady for a month or so,
   drop it (Jake, 2026-09-05: "after a while we don't need to do it").

8. **Is the backup actually running?** (Jake, 2026-09-29: "always make sure its
   working".) The weekly backup is its OWN private repo - `soramithril/supabase-backups`,
   the "Weekly Supabase Backup" Action (`.github/workflows/nightly-backup.yml`, workflow
   id 257636944, Sunday 9 PM ET) runs `backup.py` and commits
   `data/jeffs-junk/<table>.csv`. It failed silently for ELEVEN WEEKS (2026-07-13 to
   2026-09-21; last good copy before the fix was 2026-07-06) and nobody noticed, so never
   skip this and never assume from a green tick. No `gh` CLI on this machine - get a token
   with `printf "protocol=https\nhost=github.com\n\n" | git credential fill` and send it
   as an `Authorization: token ...` header. Four numbers, and ANY one of them bad means
   the backup is down and it goes in the loud first line:
   - **Age of the newest backup** - newest commit touching the data folder:
     `/repos/soramithril/supabase-backups/commits?path=data/jeffs-junk&per_page=1`.
     Older than 8 days = red. This is the number that actually matters, because a run can
     finish green and commit nothing at all.
   - **Did the last SCHEDULED run pass** -
     `.../actions/workflows/nightly-backup.yml/runs?per_page=10`, then find the newest run
     whose `event` is `schedule`. A manual `workflow_dispatch` success can mask weeks of
     failing scheduled runs: that was exactly the state on 2026-09-28, when the hand-run
     passed eight hours after the scheduled run had already failed.
   - **Table count** - files under `data/jeffs-junk`. 60 as of 2026-09-28 (the table list
     is read from the REST root, so new tables are picked up on their own). Fewer than
     that means tables are being silently skipped.
   - **Workflow still switched on** - `state` on `.../actions/workflows/257636944` must be
     `active`. GitHub disables scheduled workflows after 60 days of repo inactivity, and a
     backup that commits nothing generates no activity, so a long outage can quietly kill
     the schedule on top of everything else.

## Report

Write `SHOP-HEALTH-YYYY-MM-DD.md` at the repo root. Do NOT commit it - the
repo is public and deploys straight to the live site; reports stay local like
the QA and crew-time reports already at root. Structure: a one-line verdict
up top ("all clear" or the list of things needing action), then the numbers.
Delete health reports older than a month while there.
