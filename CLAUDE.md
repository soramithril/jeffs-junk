# Jeff's Junk Dashboard

## Working agreement

Explain what you will change and ask to confirm the change so we are on the same page.

Commit as you go and **push once the change is verified — no need to ask first**. (Jake lifted the ask-before-push rule 2026-07-11; it had been in place since 2026-07-10.) Always verify the live site after pushing, and say in the reply what went out.

## Code rules

- Don't overengineer — simple beats complex.
- No fallbacks — one correct path, no alternatives.
- One way to do things, not many.
- Clarity over compatibility — clear code beats backward compatibility.
- Throw errors — fail fast when preconditions aren't met.
- No backups — trust the primary mechanism.
- Separation of concerns — each function does one thing.
- Surgical changes only — minimal, focused fixes.
- Evidence-based debugging — add minimal, targeted logging.
- Fix root causes, not symptoms.
- Collaborative — work with the user to find the most efficient solution.

## Project layout

The dashboard is one static site, three files at repo root:

- `index.html` (~1,940 lines) — HTML structure only. References `style.css` and `app.js`.
- `style.css` (~990 lines) — all CSS. Includes the `.modal-overlay` / `.modal-overlay.open` pattern that all modals rely on.
- `app.js` (~12,800 lines) — all JavaScript. Big file but flat — grep for function names.

Other folders:
- `docs/` — business PDFs.
- `assets/` — includes `intro-bg.mp4` (~8 MB). Don't churn this.

GitHub Pages auto-deploys from `main` branch root. Repo is `soramithril/jeffs-junk`.

## Dev workflow

Live site: **https://soramithril.github.io/jeffs-junk/** — GitHub Pages auto-deploys from `main` in ~30s.

Edit files in place — no temp clones, no copying around. Then:

1. **No local test servers** (Jake, 2026-07-25 — replaces the tiered local-check policy of
   2026-07-11). Don't spin up `python -m http.server` or any local preview before pushing.
   Push, then verify the LIVE site immediately — it deploys in ~25s and that check is now the
   only safety net against a JS syntax error blanking the whole site (`node` isn't installed,
   so there's no offline syntax check). Never end a deploy without step 4, and fix-forward
   fast if it's broken.
   Note for live checks: screenshots hang in the automation browser on this machine — verify
   via DOM/JS evals instead. The console always shows benign intro-video autoplay errors
   (AbortError/DOMException from `intro-bg.mp4`) — ignore those; a SyntaxError is the killer.
2. If you changed `app.js`, bump THREE things to the same number, in lockstep:
   - `<script src="app.js?v=N">` in `index.html` (near the bottom)
   - `var APP_VERSION = 'N';` near the top of `app.js`
   - the contents of `version.txt` at repo root
   Without this, users will hit cached JS and not see the fix, and the auto-update banner will misfire.
2b. Other files at repo root have their OWN separate `?v=` cache-busters in `index.html` (near the top). If you edit one, bump its query string too — to the same N as this deploy:
   - `<link rel="stylesheet" href="style.css?v=N">` when you change `style.css`
   - `<script src="app-bookings.js?v=N">` when you change `app-bookings.js` (the Bookings widget code)
   These are SEPARATE from `app.js`'s `?v`. Forget one and browsers keep serving the old cached file: e.g. new markup renders with class names that have no matching CSS rules, so the page looks broken/unstyled even though the pushed file is correct. (Whenever `version.txt` changes, also bump `APP_VERSION` in lockstep — otherwise the auto-update banner misfires forever.)
3. `git add`, `git commit -m "..."`, `git push origin main` — no push order needed
   (Jake lifted the ask-first rule 2026-07-11). GitHub Pages deploys in ~30s.
4. After every push, verify live (always — it's nearly free):
   - `curl -s https://soramithril.github.io/jeffs-junk/index.html | grep -ao 'app.js?v=[0-9]*'` — should show the new version (use `-a` because index.html trips ripgrep's binary heuristic). Poll a few times; the deploy takes ~25s.
   - Load the live site in a browser: confirm `APP_VERSION` matches and the console has no errors.

## Auto-update banner

`app.js` polls `version.txt` every 5 minutes (with `cache: 'no-store'` to bypass browser caching). When the fetched version differs from `APP_VERSION`, a sticky "New version available — click to refresh" banner appears in the top center. Clicking it reloads the page. This works around GitHub Pages' fixed cache headers — users on stale HTML still get notified once their cached HTML expires and they pick up the polling code.

## Modal pattern (gotcha)

All modals use the `.modal-overlay` / `.modal-overlay.open` pattern. To open a modal, use `element.classList.add('open')` — never `element.style.display = 'flex'`. The base CSS sets `opacity:0; pointer-events:none`, and only the `.open` class flips them. Inline `style.display` toggling will produce an invisible-but-present modal that traps any awaiting promise.

Also: don't put `style="display:none"` inline on the modal element in HTML. It overrides the class-based display and breaks the same way.

## MyGeotab is visual-only

- MyGeotab never writes to job data. The `geofence-events` edge function (pg_cron, every
  15 min on weekdays) only INSERTs `geofence_notifications` rows when a truck enters or
  leaves a bin zone; the Live Jobs page renders those as visual cues. It was made fully
  visual-only 2026-07-02 per Jake (before that, zone-enter auto-set `bin_instatus`).
  Don't give it write access to `jobs` without asking.

## Database

Supabase. The main tables are `jobs`, `bin_items`, `clients`, `vehicles`, `job_changes`.

**IDs (post-collision-disaster rules, 2026-07-24/25):** job numbers come from ONE shared
sequence via the `next_job_id` RPC for every service (Extra Jobs keeps its own LAND- sequence);
client numbers come from the `next_client_cid` RPC. Never hand-mint IDs, never compute
"max + 1", and never add a per-service sequence again — overlapping counters plus
upsert-on-save silently destroyed 88 jobs between April and July 2026 (all restored as jobs
39546–39633 from the `job_changes` log). Brand-new records INSERT (fail loudly on a duplicate);
upsert is only for updating records that already exist. `saveJob` also self-heals: quiet
retries on connection blips, fresh number on a taken one (v454).
