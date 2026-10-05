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

## Later

*Things worth doing sometime.*

- **Check the rest of Kelly's screens on the 32-inch** - The bin picker is fixed (below), but that was only half of what you asked. Every other popup is still a fixed width, and the stylesheet has one big-screen rule in it, from August, for the booking form. Nothing else has been looked at on a big monitor.
  <sub>Jake, 2026-09-08 - second half of the bin-picker idea. Moved to Later 2026-10-05: Kelly has not complained, so back burner. Measured that day: every popup shares one 820px rule; only the booking form and the bin-assign popup know about big screens. When this comes up, do the look-over in a browser set to 2560 wide and pick which popups deserve widening - not one rule for all.</sub>
- **Winter operations playbook lives in the app** - Today it is a Canva document that only Jake can really change. Build it in the app so the office can read it and edit it themselves if Jake is not around. Wait for the contracts to come back and the Canva version to be finished first; that is the source to port.
  <sub>Jake, 2026-10-05</sub>

## Done

*Built and live. Newest first.*

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
