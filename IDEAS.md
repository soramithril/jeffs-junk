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
- **Check the rest of Kelly's screens on the 32-inch** - The bin picker is fixed (below), but that was only half of what you asked. Every other popup is still a fixed width, and the stylesheet has one big-screen rule in it, from August, for the booking form. Nothing else has been looked at on a big monitor.
  <sub>Jake, 2026-09-08 - second half of the bin-picker idea</sub>
- **Stop sales taking cash - route prospects through the office** - Josh shouldn't be collecting money on jobs; we've had problems with this before. Make a prospect have to be set up with someone in the office before it can become a paid job.
  <sub>Jake, 2026-09-08</sub>
- **Crew in/out and gate times logged from UniFi** - Not an app feature: UniFi Protect already does the face recognition in the back shop and reads plates at the gate. It sends us a small line per sighting - who, which camera, when - plus a link that opens that moment in Protect. No video or snapshots stored here. Payroll stops scrubbing footage by hand. Measured 2026-09-08: about 50 sightings a day is 5-7 MB a year against a 500 MB allowance, so cost is not a reason not to. Scoped 2026-08-29, not built.
  <sub>Jake, 2026-09-08 - see unifi-protect-plan note</sub>
- **Notifications aimed at one person, on a schedule** - Barbara gets a reminder on her phone to do the JWG schedule, on the same day and time each week. Same idea for anyone else with a recurring job.
  <sub>Jake, 2026-09-08</sub>
- **Make Jeff's app fully work and put today's quotes front and centre** - Today's quotes should be the main thing on his screen, not buried. Plus notifications built for him - oil change due, yellow sticker, that kind of thing. And a pass over the whole page to make sure it all works and reads clearly.
  <sub>Jake, 2026-09-08 - today's quotes landed in v676. Still owed: notifications that actually reach his phone, and the read-through. Note a finished fix for his stop list is sitting unmerged on branch `kelly-jeff-truckstatus` (commit 0d0f308).</sub>

## Later

*Things worth doing sometime.*

- **Stop the nightly GPS matcher guessing between vehicles** - It matches trucks to their trackers by NAME, falling back to fuzzy word-overlap and taking the best row it finds, so a badly-named vehicle could take another one's odometer reading with no error shown. Not urgent - checked 2026-09-09 and 'Landscape Trailer' scores zero against every truck - but worth restricting to vehicles that actually have a tracker, next time that background job is touched.
  <sub>Claude, 2026-09-09</sub>

## Done

*Built and live. Newest first.*

- ~~**Track the landscaping trailers for their yellow stickers**~~ - **v677, 2026-09-09.** A trailer now carries its plate and its yellow sticker and nothing else: no oil dial, no odometer, no oil service box, no driver line, no "mark oil serviced" button, and the oil fields disappear from the form when you pick Trailer. The wide tile that shows a truck's odometer shows the trailer's plate instead. Still to do by hand: actually add the trailers on the Vehicles page - there are none in there yet.
  <sub>Jake, 2026-09-09</sub>
- ~~**Bin assigning is too small on Kelly's 32-inch monitor**~~ - **v676, 2026-09-09.** The assign-bins popup now follows the window: unchanged at 600px on a laptop, stretching to 1200px on her monitor, so a 14-yard job's 46 bins fit without scrolling. The wider sweep of her other screens was NOT done and is back on the Now list above.
  <sub>Jake, 2026-09-08</sub>

## Decided against

*Settled, so nobody pitches them again.*

- **Trucks setting their own In Shop / Good To Go status** - Jake, 2026-09-08: *"ill do 7 manually."* He keeps the truck status by hand rather than have the GPS set it. Don't re-propose automating it.
  <sub>Jake, 2026-09-08</sub>

---

<sub>Maintenance and bug findings do NOT belong here - they go in a dated health-check
snapshot under `audit/`. The most recent is `audit/HEALTH-CHECK-2026-09-08.md`.</sub>
