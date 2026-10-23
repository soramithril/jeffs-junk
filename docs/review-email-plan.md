# Designed Google review email

Started 2026-10-23. Built on branch `review-email-build-1023` (from `review-email-design`, which holds the mockup).
NOT merged: the plain review email and the review text carry on unchanged until Jake approves the look with Sam.

## The mockup
- `review-email-mockup.html`: the email at computer and phone width, bin rental and junk removal versions.
  Sam's copy: https://soramithril.github.io/site-preview/email-review.html
- `assets/email/`: `logo.png`, `review-photo-bin.jpg` (bin truck), `review-photo-junk.jpg` (junk truck).
  The sending piece attaches these inside each email, so they must stay at these paths.

## Jake's answers (2026-10-23)
- Sends from **hello@jeffsjunk.ca**. Every email lands in its Sent folder; replies come back to its inbox.
- Signature: the **logo stands in** for the photo of Jeff & Barbara until there is one.
- Build now, hidden. Jake will change things later; the wording is editable by anyone, the design by asking.

## How it is built
- `supabase/functions/review-email/build.js`: the email itself (the mockup's HTML, word boxes filled in, escaped).
  Plain JS so a V8 check can run it; checked against `assets/email/review.html` (same apart from the signature).
- `supabase/functions/review-email/index.ts`: `mode:'preview'` returns the HTML; `mode:'send'` sends it with
  Microsoft Graph `sendMail` + `saveToSentItems:true`. The recipient is the job's first email (never the client's).
  Refuses: not staff, switched off (unless developer), no_email, no address, cancelled, Extra Jobs, job older than 2 years.
  Pictures go inside the email (inline attachments, `cid:`), fetched from the live site's `assets/email/`.
- Rating line: Google Places (New) Place Details `rating,userRatingCount` with `GOOGLE_PLACES_KEY`, counted as
  `places_details` by `bump_google_api`, kept in `jwg_app_settings` key `google_rating`. Asked at most once a day,
  by the first preview or send of the day (so ~1 call a day, only on days it's used).
- `app-review-email.js`: the "✉️ Review email" button in Job details, the editing window (subject + five boxes,
  live preview of the real email, Send holds 10 s with Undo), and the Email Templates tab "Review Email (designed)".
  After sending: stamps `review_asked_at`, files a `quote_correspondence` row (channel `email`), like the review text.
- The switch: `jwg_app_settings` key `review_email_on`. Only Jake (developer tier) sees the switch (on the Email
  Templates tab). Off: only Jake sees the button and the tab, and the function refuses everyone else.
- Wording: `email_presets` key `review_email`, body = JSON of the five boxes. New placeholder `{job}`
  ("14 yard bin rental" / "junk removal"), added to every template's placeholder list.
- No database changes.

## Microsoft setup (Jake does these; nothing can send until they're done)
1. Sign in at **entra.microsoft.com** with the jeffsjunk.ca admin account. If it says no access, call GoDaddy:
   "I need admin access to my Microsoft 365 tenant to register an app."
2. **App registrations → New registration.** Name: `Jeff's Junk dashboard - review email`. "Accounts in this
   organizational directory only". No redirect. Register.
3. From its Overview page, copy the **Application (client) ID** and the **Directory (tenant) ID**.
4. **API permissions → Add a permission → Microsoft Graph → Application permissions → Mail.Send → Add.**
   Then **Grant admin consent** (the green tick must show).
5. **Certificates & secrets → New client secret**, 24 months. Copy the **Value** at once (it's shown one time).
   Note the expiry date: sending stops the day it runs out.
6. Lock it to hello@ only (otherwise Mail.Send can send as any mailbox). Done together in Exchange Online
   PowerShell: a mail-enabled security group holding hello@, then
   `New-ApplicationAccessPolicy -AppId <client id> -PolicyScopeGroupId <group> -AccessRight RestrictAccess`.
7. **Supabase → Edge Functions → Secrets**, add `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`.
   Jake pastes these himself.

## Going live (needs Jake's word)
1. The `review-email` function is already up (version 2, 2026-10-23, Jake's OK): byte-identical to this branch,
   checked with `get_edge_function`, and it refuses signed-out callers (401 `not_signed_in`). Version 1 had a
   placeholder `build.js` by mistake; nothing ever called it. Redeploy and re-compare after any change here.
2. Merge the branch, bump app.js's three version numbers and `app-review-email.js?v=` to the deploy's number
   (re-read `version.txt` first), verify live.
3. Jake sends test emails to himself, opens them in Outlook on the PC and on his phone, checks with Sam.
4. Jake flips the switch on the Email Templates page.
