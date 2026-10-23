# Designed Google review email: plan (not built yet)

Started 2026-10-23 in the website session, moved here by Jake. Nothing in the app has changed; this branch only holds the mockup.

## The mockup
- `review-email-mockup.html`: the email at computer and phone width, bin rental and junk removal versions.
  Sam's copy: https://soramithril.github.io/site-preview/email-review.html
- `assets/email/review.html`, `review-junk.html`: the email itself, built the way email needs it (tables, inline styles,
  Arial, 600 px with Outlook-for-Windows fixes). Example customer: Sarah, 14 yard bin rental, Innisfil / Mike, junk removal, Barrie.
- `assets/email/`: `logo.png`, `review-photo-bin.jpg` (bin truck), `review-photo-junk.jpg` (junk truck). The photo matches the job's service.
- Source it was made from: `jjwebsite/mockup-build/review_email.py` (the wording defaults and layout are there).

## What Jake decided
- **Option 2:** the app sends the designed email itself through Microsoft 365 (Graph), not by copy-paste into Outlook.
- **Every email must land in the Outlook Sent folder** as the receipt (Graph `sendMail` with `saveToSentItems`).
- **Kelly, Sam or anyone can edit the words before sending:** subject, heading and each paragraph in their own box, with
  the finished email shown beside them. The stars, button, signature and footer stay fixed. Default wording editable on
  the Email Templates page like the other templates.
- **Hidden until Jake confirms the look with Sam:** behind a switch only Jake can turn on.
- **The rating line updates itself:** "4.9 from 258 Google reviews" comes from Google once a day (Places API (New) Place
  Details, fields `rating,userRatingCount`, using the existing `GOOGLE_PLACES_KEY` in `places-proxy`; one call a day is
  inside the free allowance).

## Still open (ask Jake)
- Which mailbox sends: assumed hello@jeffsjunk.ca. If Sam and Kelly use their own Outlook addresses, the design changes.
- Microsoft setup in Jake's account: register the app in the Entra admin centre, Graph **Mail.Send** (application),
  admin consent, client secret into Supabase secrets, then lock it to the one mailbox (Exchange application access policy /
  RBAC for Applications). Microsoft 365 is through GoDaddy (MX is Proofpoint `ppe-hosted`, autodiscover is Outlook),
  so first check Jake can reach the Entra admin centre; GoDaddy may need to turn on admin access.
- Photo of Jeff & Barbara for the signature (dashed `[Jeff: ...]` circle in the mockup).

## Rules already in the email
- Footer has the business mailing address and "Reply stop and we'll take you off our list" (CASL: sender ID, mailing
  address, unsubscribe). Only email customers from the last 2 years or who said yes.
- Every star and the button go to the same Google review link (no filtering happy customers: against Google's rules).
- Sending should stamp `review_asked_at` and file a `quote_correspondence` row, the same as the review text (app-review-text.js).
