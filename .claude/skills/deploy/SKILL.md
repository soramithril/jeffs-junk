---
name: deploy
description: Ship committed dashboard changes to the live site the safe way - version bumps in lockstep, push through the tripwire, verify live in Jake's Chrome. Use whenever dashboard changes are ready to go out, or Jake says "push it" / "ship it" / "deploy".
---

# Deploy the dashboard

The site is static files on GitHub Pages, auto-deployed from `main` in ~25-30s.
There is no staging and no local test server (Jake's rule, 2026-07-25): push,
then verify the LIVE site immediately. That live check is the safety net.

## Steps

1. **Timing.** A version bump fires the full-page "Update now" takeover for
   every signed-in user - that's intentional, but time pushes for quiet
   moments. If it's mid-workday and Jake didn't just ask for the push, say so
   and confirm timing.

2. **Pick the number.** N = current `version.txt` + 1. One deploy, one N.

3. **If `app.js` changed, bump THREE things to N in lockstep:**
   - `<script src="app.js?v=N">` in `index.html` (near the bottom)
   - `var APP_VERSION = 'N';` near the top of `app.js`
   - the contents of `version.txt`

4. **Every other changed file loaded with `?v=` gets its own `?v=` bumped
   to N - on EVERY page that loads it.** There are four HTML entry points and
   each carries its own number for the same file: `index.html`,
   `inventory.html` (Darrin's back-shop kiosk), `jeff.html`, `office-tv.html`.
   Bumping one does nothing for the others - the kiosk sat eleven days on a
   stale `app-jwg-scheduler.js` exactly that way. Find every page that loads
   a file you changed:
   ```bash
   grep -ao 'CHANGED-FILE?v=[0-9]*' *.html
   ```

5. **Before pushing**, check the parse-check workflow isn't already red from
   a previous push (`gh run list --workflow=parse-check.yml --limit 1`).
   It's advisory only - Pages deploys even when it's red - so a red run means
   the live site may already be broken and needs attention first.

6. **Commit and push** (`git push origin main`). The pre-push tripwire
   (`scripts/prepush_check.py`, wired as a hook in `.claude/settings.json`)
   parses every changed JS file in V8 and re-checks steps 3-4. If it blocks
   the push, fix the problem - never work around the tripwire.

7. **Verify live** (always - it's nearly free):
   - Poll `curl -s https://soramithril.github.io/jeffs-junk/version.txt`
     until it shows N (~25-30s).
   - `curl -s https://soramithril.github.io/jeffs-junk/index.html | grep -ao 'app.js?v=[0-9]*'`
     (the `-a` matters - index.html trips the binary heuristic).
   - Load the live site in Jake's real Chrome (`claude-in-chrome` tools, NOT
     the in-app Browser pane - background tabs there freeze async JS). Confirm
     `APP_VERSION` matches via a sync DOM eval and the console has no errors.
     Ignore the intro-bg.mp4 autoplay AbortError noise; a SyntaxError is the
     killer. Screenshots hang on this machine - use DOM/JS evals.

8. **Report** what went out and that live verification passed. Never end a
   deploy without step 7 - fix forward fast if it's broken.
