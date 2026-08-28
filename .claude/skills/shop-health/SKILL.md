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

## Report

Write `SHOP-HEALTH-YYYY-MM-DD.md` at the repo root. Do NOT commit it - the
repo is public and deploys straight to the live site; reports stay local like
the QA and crew-time reports already at root. Structure: a one-line verdict
up top ("all clear" or the list of things needing action), then the numbers.
Delete health reports older than a month while there.
