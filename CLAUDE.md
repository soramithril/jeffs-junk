# Jeff's Junk Dashboard

## Working agreement

Explain what you will change and ask to confirm the change so we are on the same page.

When it's confirmed, push it live.

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

Live site: **https://soramithril.github.io/jeffs-junk/** — GitHub Pages auto-deploys from `main` in ~30s. This is where verification happens; there's no local dev server.

Edit files in place — no temp clones, no copying around. Then:

1. No local parse check — `node` isn't installed on this machine. JS syntax errors blank the whole site (including the sign-in screen), so verify on the live site after pushing (step 4).
2. If you changed `app.js`, bump THREE things to the same number, in lockstep:
   - `<script src="app.js?v=N">` in `index.html` (near the bottom)
   - `var APP_VERSION = 'N';` near the top of `app.js`
   - the contents of `version.txt` at repo root
   Without this, users will hit cached JS and not see the fix, and the auto-update banner will misfire.
2b. Other files at repo root have their OWN separate `?v=` cache-busters in `index.html` (near the top). If you edit one, bump its query string too — to the same N as this deploy:
   - `<link rel="stylesheet" href="style.css?v=N">` when you change `style.css`
   - `<script src="app-bookings.js?v=N">` when you change `app-bookings.js` (the Bookings widget code)
   These are SEPARATE from `app.js`'s `?v`. Forget one and browsers keep serving the old cached file: e.g. new markup renders with class names that have no matching CSS rules, so the page looks broken/unstyled even though the pushed file is correct. (Whenever `version.txt` changes, also bump `APP_VERSION` in lockstep — otherwise the auto-update banner misfires forever.)
3. `git add`, `git commit -m "..."`, `git push origin main`. GitHub Pages deploys in ~30s.
4. Verify live two ways:
   - `curl -s https://soramithril.github.io/jeffs-junk/index.html | grep -ao 'app.js?v=[0-9]*'` — should show the new version (use `-a` because index.html trips ripgrep's binary heuristic).
   - Load the live site in a browser to catch JS syntax errors that curl can't see.

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

Supabase. The main tables are `jobs`, `bin_items`, `clients`, `vehicles`, `job_changes`. Job IDs come from a per-service Supabase sequence (`next_job_id` RPC) — don't hand-mint IDs.
