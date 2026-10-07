# Ideas

Jake's board for things he wants built. Say **"add an idea: ..."** and it lands here;
say **"pull up the ideas file"** to read it back.

Nothing loads this file. It is only read when you ask for it.

Keep it to ideas. No keys, customer names or payroll detail - this repo is public.

**When an idea gets built, cross it off in the same breath - nobody should have to ask for
that.** Move it to Done with the version it went out in. Two rules keep the board honest:
only strike what actually reached `main` (work sitting on an unmerged branch is not done),
and only strike an idea whose every part is finished. Most ideas here have two or three
parts and usually only one gets built - if something is still owed, leave the idea on Now
and trim it down to what is left.

---

## Now

*Things you want next.*

- **Refresh the help and tutorial for everything that's changed** - The walkthrough is out of date, the Live Jobs help already describes a screen that doesn't exist. Go through every page and bring the help in line with what is actually there now.
  <sub>Jake, 2026-09-08</sub>
- **Crew in/out and gate times logged from UniFi** - Not an app feature: UniFi Protect already does the face recognition in the back shop and reads plates at the gate. It sends us a small line per sighting - who, which camera, when - plus a link that opens that moment in Protect. No video or snapshots stored here. Payroll stops scrubbing footage by hand. Measured 2026-09-08: about 50 sightings a day is 5-7 MB a year against a 500 MB allowance, so cost is not a reason not to. Scoped 2026-08-29, not built.
  <sub>Jake, 2026-09-08 - see unifi-protect-plan note</sub>
- **Notifications aimed at one person, on a schedule** - Barbara gets a reminder on her phone to do the JWG schedule, on the same day and time each week. Same idea for anyone else with a recurring job.
  <sub>Jake, 2026-09-08</sub>
- **Make Jeff's app fully work and put today's quotes front and centre** - Today's quotes should be the main thing on his screen, not buried. Plus notifications built for him - oil change due, yellow sticker, that kind of thing. And a pass over the whole page to make sure it all works and reads clearly.
  <sub>Jake, 2026-09-08 - quotes now lead the screen and the wrong-day jobs are fixed, both in v677 (see Done). Still owed: notifications that actually reach his phone (needs a manifest and a service worker on his page - iOS will not deliver web push without them), and the read-through of The Day, Photos and Trucks.</sub>
- **Revamp the Furniture Bank quote page layout, and the booking that follows it** - The truck animation and the way items get added stay exactly as they are; Jake loves those. The layout around them is the problem - it is not the best and there is a better one out there. Look over the whole page again, and the booking step the same way. Mockup first, not code.
  <sub>Jake, 2026-10-05</sub>
- **Finish Kelly's screens on the 32-inch** - The dashboard and the booking form went out in v685 (see Done). Being built now, not live yet: the Schedule's full-page screens (wider, and restyled to match the rest of the app), the Add/Edit Client form in two columns, the dashboard search list, the item suggestions list, and the sign-in screen down to the one anime picture. Jake also asked whether the Schedule screens should get a frosted-glass background - mockup only, his call.
  <sub>Jake, 2026-09-08 - second half of the bin-picker idea. Swept and mocked up 2026-10-05/06; first batch shipped in v684, second in v685.</sub>
- **Winter operations playbook lives in the app** - Today it is a Canva document that only Jake can really change. Build it in the app so the office can read it and edit it themselves if Jake is not around. Wait for the contracts to come back and the Canva version to be finished first; that is the source to port.
  <sub>Jake, 2026-10-05 - on Now from 2026-10-05</sub>

## Later

*Things worth doing sometime.*


## Done

*Built and live. Newest first.*

- ~~**Kelly's dashboard and booking form on the 32-inch**~~ - **v685, 2026-10-06.** On her 2560-wide screen the long dashboard lists read in two newspaper columns (down the left, then the right), so the page is about a third shorter and ticking off an email moves only one row across. A bin rental booking fits on one screen with Save showing, and on Edit Job the bin list runs full width under the form, 24 bins a row instead of 8. Laptops unchanged, except the dashboard jump bar now lights the button you clicked.
  <sub>Jake, 2026-10-06</sub>

- ~~**Kelly's popups and pages on the 32-inch**~~ - **v684, 2026-10-06.** On her 2560-wide screen: the confirmation email shows whole (templates down the left), Job details puts its buttons in a column on the right, the client profile has contact left and job history right, and the booking form's customer search, the Furniture calculator, Link a Bin, Change Pickup Date, Merge Clients, Help, Report Damage, the bin history panel and the Suggestions board all use the width. Small and medium popups grow on big screens, and warning popups are yellow and danger popups red on every screen. Laptops are unchanged apart from those alert colours. Same update: Inventory and Clothing are separate pages, former staff are hidden on Clothing (records kept), Summer & Winter is back in the menu, a big "Back to client" button in Job details, and the booking form's Save / Update Job bar stays on screen.
  <sub>Jake, 2026-09-08 and 2026-10-05/06</sub>

- ~~**Jeff's login fits his phone**~~ - **v677, 2026-09-09.** The sign-in box used to be pushed down by a fixed 43% of the screen height, measured against the taller screen iOS reports rather than the one Safari actually shows - so the password field and the SIGN IN button fell past the bottom and Jeff had to scroll to sign in. The card now sits at the bottom of the real screen with the poster above it, so it fits on any phone. The nine posters are untouched.
  <sub>Jake, 2026-09-09</sub>
- ~~**Today's quotes lead Jeff's screen, and his day shows the right jobs**~~ - **v677, 2026-09-09.** Quotes were capped at two small rows under a big green panel, so the jobs count caught the eye instead. They now get a card of their own listing every quote for the day, and Stops / Drops / Picks share one strip - seven blocks down to four, with the truck alert and Trucks row back above the fold. Also fixed: 175 jobs (124 junk removals, 47 quotes, 4 extras) were showing on the day they were booked rather than the day they happen.
  <sub>Jake, 2026-09-09 - part of the bigger "make Jeff's app fully work" idea, which stays on Now</sub>
- ~~**Track the landscaping trailers for their yellow stickers**~~ - **v677, 2026-09-09.** A trailer now carries its plate and its yellow sticker and nothing else: no oil dial, no odometer, no oil service box, no driver line, no "mark oil serviced" button, and the oil fields disappear from the form when you pick Trailer. The wide tile that shows a truck's odometer shows the trailer's plate instead. Still to do by hand: actually add the trailers on the Vehicles page - there are none in there yet.
  <sub>Jake, 2026-09-09</sub>
- ~~**Bin assigning is too small on Kelly's 32-inch monitor**~~ - **v676, 2026-09-09.** The assign-bins popup now follows the window: unchanged at 600px on a laptop, stretching to 1200px on her monitor, so a 14-yard job's 46 bins fit without scrolling. The wider sweep of her other screens was NOT done and is back on the Now list above.
  <sub>Jake, 2026-09-08</sub>

## Decided against

*Settled, so nobody pitches them again.*

- **Stop the nightly GPS matcher guessing between vehicles** - Jake, 2026-10-05: *"we don't really add new trucks, like, ever. Maybe once every three or five years."* The matcher only goes wrong when a truck is renamed or added, and that happens so rarely it is not worth guarding against. Every truck matched correctly when checked 2026-09-09. If a truck IS ever swapped, check the odometer readings by hand that week.
  <sub>Jake, 2026-10-05</sub>
- **Stop sales taking cash - route prospects through the office** - Jake, 2026-10-05: *"I can do that. That's not needed on here."* He handles it with the sales team directly, not in the app. Was on Now from 2026-09-08.
  <sub>Jake, 2026-10-05</sub>
- **Trucks setting their own In Shop / Good To Go status** - Jake, 2026-09-08: *"ill do 7 manually."* He keeps the truck status by hand rather than have the GPS set it. Don't re-propose automating it.
  <sub>Jake, 2026-09-08</sub>

---

<sub>Maintenance and bug findings do NOT belong here - they go in a dated health-check
snapshot under `audit/`. The most recent is `audit/HEALTH-CHECK-2026-09-08.md`.</sub>
