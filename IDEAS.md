# Ideas

Jake's running list for the dashboard. Say **"pull up the ideas file"** and Claude reads it back; say **"add an idea: ..."** and it gets appended here.

Seeded 2026-09-08 by sweeping 99 project notes and 12 audit documents, then checking each item against the actual code. 64 items that turned out to be already built were thrown away rather than listed.

Nothing here is loaded automatically — this file is only read when you ask for it.

Keep it to feature ideas. No keys, passwords, customer names or payroll details — this repo is public.

---

## Next up

Small and well defined. Most of these finish something that is already half built.

- **Test the phone alerts on a real iPhone** — The push-alert code is in place, but nobody has confirmed an alert actually lands on an iPhone.  
  <sub>from feature-backlog-jul2026.md</sub>
- **Test the calendar invite from a quote on a phone** — The quote calendar-invite download is built and lists Jeff and Barbara as guests, but nobody has confirmed it opens correctly on a phone.  
  <sub>from feature-backlog-jul2026.md</sub>
- **Switch off the page-visit counter when it has run long enough** — The temporary counter that logs which pages staff open is still running and still writing a row on every page view.  
  <sub>from page-usage-tracking.md</sub>
- **Save the original scheduler's own files back to their project** — Six files in the standalone scheduler project have been changed but never saved back, so that project no longer matches what is actually running.  
  <sub>from scheduler-merge-decisions.md</sub>
- **Job pairing can come out differently on different office computers** — Addresses looked up on one office computer are only remembered on that computer, so two people can still see slightly different double-stack suggestions.  
  <sub>from dispatch-estimate-audit.md</sub>
- **The staff-rating records still accept the old wider scale** — The rating store still accepts 4s and 5s even though the screen only offers 1 to 3, so a stray value could get in.  
  <sub>from employee-ratings-feature.md</sub>
- **Add an on/off switch for the booking sound** — The booking sound can only be silenced by editing hidden browser settings — there is still no on/off switch anywhere on screen.  
  <sub>from motion-layer-v541.md, work-order-stamps.md</sub>
- **Eight prospects were flagged for someone to check against existing customers** — Eight names on the sales prospect list are still flagged as possibly being customers you already have, and nobody has checked them.  
  <sub>from prospect-list-import-aug2026.md</sub>
- **Check the staff schedule on a real phone** — The phone layout of the staff schedule was built but nobody has confirmed how it actually looks on a phone.  
  <sub>from jwg-scheduler-review-fixes.md, schedule-mobile-v554.md</sub>
- **Furniture deliveries are counted on the dashboard but never listed** — A furniture delivery booked for today bumps the job count at the top of the dashboard, but no row for it ever appears in the list, so nobody sees the job.  
  <sub>from dashboard-redesign-aug2026.md</sub>
- **Stop time and idle time always show as zero** — Every truck shows zero minutes stopped and zero minutes idling because the numbers arrive from Geotab in a format the code refuses to read.  
  <sub>from driver-telemetry-data-traps.md</sub>
- **Truck days are counted on the wrong clock** — A truck's "day" is measured from 8 pm the night before to 8 pm, so the driving hours shown do not line up with the actual working day.  
  <sub>from driver-telemetry-data-traps.md</sub>
- **The truck status list is out of date** — The trucks' "In Shop / Available" labels are typed in by hand and nothing keeps them current — the dashboard now works this out for itself, but Jeff's screen still shows the old hand-typed field.  
  <sub>from driver-telemetry-data-traps.md</sub>
- **Changes to a job's email address never show up in the job's history** — When someone edits the email address on a booking, that edit is invisible in the job's change history, so a wrongly-sent confirmation can't be traced back to who changed what.  
  <sub>from email-wrong-recipient-guard.md</sub>
- **Delete the retired AI helper and kill the Google key inside it** — The old helper has been stripped of its key and now refuses everyone, but the function itself still needs deleting in the Supabase dashboard, and the Google key it carried needs switching off in the Google console because it was callable by anyone from March to 8 September.  
  <sub>from security-review-aug2026.md</sub>
- **Rename the job form's Cancel button so it stops looking like it cancels the job** — The button that just closes the booking form still says Cancel, which reads like it cancels the customer's job.  
  <sub>from invisible-dateless-jobs.md</sub>
- **The phone number painted on the login screen bin was never checked against anything real** — The phone number printed across the bottom of the sign-in screen came from an AI answer and nobody has confirmed it's actually the business's number.  
  <sub>from login-art.md (login-art-nine-sheets)</sub>
- **The Live Jobs help text describes the wrong page** — The help pop-up on Live Jobs describes stats and job types that aren't on the page, so anyone reading it is being told about a screen that doesn't exist.  
  <sub>from ux-research-aug2026.md</sub>
- **The deploy and health-check routines still tell you to run a tool that isn't on the machine** — Two of the saved routines still tell Claude to run a GitHub command that isn't installed on Jake's computer, so that step always fails.  
  <sub>from claude-tooling-aug2026.md</sub>
- **The day planner still pairs stops in the same town even when they are far apart** — Two 14-yard drops in the same town still get put on one trip even when the map says they are miles apart, which can make a day look easier than it is.  
  <sub>from dispatch-overhaul-v595.md</sub>
- **Delete the temporary truck-trip lookup that was left switched off** — A one-off truck-trip lookup built for the August time review is still deployed on the database, switched off but never removed.  
  <sub>from jordan-time-review-aug2026.md</sub>
- **Check the leaked Google address key was actually deleted** — The address-lookup key that got published in the code needs to be switched off in Google's console so nobody can spend money on our account.  
  <sub>from address-autocomplete-google-swap.md</sub>
- **Turn on the $1 spending alert for the Google address lookups** — A one-dollar spending alarm on the Google account so a runaway address-lookup bill is noticed the same day.  
  <sub>from address-autocomplete-google-swap.md</sub>
- **Stock kept in the other room does not show on the office screen** — Darrin's kiosk shows the backstock count, but the office inventory page doesn't, so the office is looking at an incomplete picture.  
  <sub>from backshop-inventory-kiosk.md</sub>
- **Remove the old browser that launches itself on the back-shop PC** — The back-shop computer still auto-opens an old Edge full-screen page at startup, which fights with the kiosk.  
  <sub>from backshop-inventory-kiosk.md</sub>
- **Two colours are missing on the back-shop kiosk screen** — Two colours the kiosk asks for were never defined there, so a REMOVED badge and the salt count box lose their colour on Darrin's screen.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **Bins and confirmed jobs still pop up a message instead of leaving a stamp** — Dropping a bin now leaves a stamp on the work order, but marking a customer confirmed still just flashes a message that disappears.  
  <sub>from work-order-stamps.md</sub>
- **A few of the rebuilt jobs still carry small errors in their details** — Some of the jobs recovered after last year's mix-up still have the town duplicated on the end of the street address.  
  <sub>from job-id-collision-upsert-bug.md</sub>
- **Try the dispatch Undo button for real while signed in** — The Dispatch "Undo last change" button is built and on the screen, but nobody has clicked it once while signed in to make sure it really puts the drivers back.  
  <sub>from dispatch-crew-not-logged.md</sub>
- **About twenty buttons say "done" before the change is actually saved** — Lots of buttons flash a green "done" message the instant you click, before the save has actually reached the system, so a failed save shows as a success first.  
  <sub>from BUG_AUDIT_FINDINGS.md</sub>
- **Evening views count a rental as one day older than it is** — How many days a bin has been out still changes at lunchtime instead of at midnight, so the same bin reads one day shorter in the morning than it does in the afternoon.  
  <sub>from BUG_AUDIT_FINDINGS.md</sub>
- **Double-clicking Add Client creates two duplicate customers** — Double-clicking Save on a new customer still creates two customers with two different numbers.  
  <sub>from BUG_AUDIT_WORKFLOWS.md</sub>
- **Three "picked up" buttons behave two different ways** — The Mark Picked Up button inside a job's detail window leaves the 'waiting on customer call' flag switched on, while the two list buttons clear it.  
  <sub>from BUG_AUDIT_WORKFLOWS.md</sub>
- **Two people editing different email templates overwrite each other** — Saving one email template writes all eight of them back at once, so two people editing different templates will wipe out each other's wording.  
  <sub>from BUG_AUDIT_FINDINGS.md</sub>
- **Creating or deleting a job leaves no trace in the change history** — The job history records edits but records nothing at all when a job is first created or when one is deleted.  
  <sub>from BUG_AUDIT_DATABASE.md</sub>
- **Three live behind-the-scenes services have no copy kept anywhere** — Several small background services are running live with no saved copy of how they were built, so they cannot be rebuilt if lost.  
  <sub>from BUG_AUDIT_FINAL_REPORT.md</sub>
- **A standing check that every job still points to a real customer** — Nothing regularly checks that every job is still attached to a real customer, so an orphaning slip would go unnoticed.  
  <sub>from BUG_AUDIT_TESTS.md</sub>
- **The bin rename check wrongly warns that a number is taken** — When you rename a bin, the safety check can wrongly say the new number is already in use because it counts the bin you are renaming.  
  <sub>from bin-renumbering-project.md</sub>
- **Have the office TV check in every hour so we know it's running** — The wall screen still only reports in when it first starts up, so nothing tells you it is still running through the day.  
  <sub>from office-tv-briefing-audio.md</sub>
- **Confirm the Sunday database backup is really running** — Nobody has proved the weekly copy of the business data is actually being made.  
  <sub>from suggestion-batch-v551.md</sub>
- **Saving a truck's time-off can lose that truck's whole history** — Saving a truck's days off still wipes them all first and writes them back, so a failure in between can lose that truck's whole list.  
  <sub>from BUG_AUDIT_FINDINGS.md</sub>
- **One last bin still needs its new number when it comes home** — One 14-yard bin still has to be relabelled to the free number once it comes back from its job.  
  <sub>from bin-renumbering-project.md</sub>
- **Two outside code libraries can change under the live site with no deploy** — Two pieces of borrowed code are loaded as 'newest version', so an outside update can change the live site overnight without anyone pushing anything.  
  <sub>from BUG_AUDIT_SYSTEM_MAP.md</sub>
- **Bin spreadsheet still lists the featherlights in the old spot** — Jake's bin inventory spreadsheet still puts the two featherlight bins at numbers 54-55 instead of 79-80, so it disagrees with the numbering plan the bins are actually being painted to.  
  <sub>from bin-renumbering-project.md</sub>

- **Every scheduled task shifts by an hour when the clocks change** — The automatic overnight jobs run on a fixed clock, so every one of them happens an hour later once the clocks change in the fall.  
  <sub>from BUG_AUDIT_DATABASE.md</sub>
## Someday

Bigger, vaguer, or waiting on a decision from you.

- **Put real customer names on the lawn-care locations** — The lawn-cut times page still lists jobs by street address only, with no customer names attached.  
  <sub>from cut-times-page.md</sub>
- **Greens written into the app's code were never folded into the green scheme** — Dozens of green colours are still typed directly into the code instead of coming from the app's shared colour settings, so a future colour change would miss them.  
  <sub>from green-hierarchy.md</sub>
- **Save the times the dispatch board works out, so the staff schedule can use them** — The dispatch board never saves the arrival times it calculates, so the staff schedule has to guess them again every time it loads.  
  <sub>from scheduler-merge-decisions.md</sub>
- **Match junk crew names to staff-schedule names once and for all** — The junk jobs are matched onto the staff schedule by comparing names in lowercase, so a nickname or spelling difference silently drops someone's jobs off their row.  
  <sub>from scheduler-merge-decisions.md</sub>
- **Nothing raises an alarm when Jeff's phone page stops working** — If Jeff's phone page breaks again, nothing anywhere will notice or tell anyone.  
  <sub>from jeff-page-blank-two-weeks.md</sub>
- **Sixteen prospects have no real town, so distance filters skip them** — Fourteen prospects have no proper town on them, so they disappear whenever the list is sorted or filtered by how far away they are.  
  <sub>from prospect-list-import-aug2026.md</sub>
- **The prospect list still needs re-checking against newer customers** — Some prospects on the list may have become customers since the list was imported, and nobody has re-checked.  
  <sub>from prospect-list-import-aug2026.md</sub>
- **Leftover styling from the old phone schedule was never cleared out** — A few hundred lines of old, unused styling from the schedule's previous life are still sitting in the file doing nothing.  
  <sub>from schedule-mobile-v554.md</sub>
- **Turn the dashboard's jump bar into tabs that switch sections** — The row of buttons at the top of the dashboard still just scrolls you down the page instead of switching between sections like tabs.  
  <sub>from dashboard-redesign-aug2026.md</sub>
- **The dashboard's "needs attention" area was never actually built** — There is code that gathers the overdue bins for a dedicated attention panel, but that panel does not exist on the page, so the code quits straight away and overdue bins only show inside the bins-out list.  
  <sub>from dashboard-redesign-aug2026.md</sub>
- **Driver scores are missing every Friday and Saturday** — The truck-behaviour scores have no Friday rows at all and barely any Saturday ones, so any weekly driving comparison is missing the end of the week.  
  <sub>from driver-telemetry-data-traps.md</sub>
- **The record of which truck dropped a bin gets wiped when it's picked up** — When a bin is picked back up, the note of which truck dropped it off is overwritten, so most drop-offs no longer have a truck attached to them.  
  <sub>from driver-telemetry-data-traps.md</sub>
- **Two bins at the same address get counted twice** — When one customer has two bins at the same address, one truck visit ticks both of them off, which inflates the visit numbers.  
  <sub>from driver-telemetry-data-traps.md</sub>
- **A read-only database login for safe looking around** — Anyone (or any tool) poking around the database is doing it with a full-power admin login, so there is nothing stopping an accidental change to real customer data.  
  <sub>from no-staging-environment.md</sub>
- **Capture the full database layout so a test copy becomes possible** — The repo only describes a slice of the real database, so there is no way to spin up a practice copy to test risky changes against.  
  <sub>from no-staging-environment.md</sub>
- **Decide whether broken-build alerts should ping Jake's phone** — When the automatic code check fails, nothing tells Jake — the failure just sits there unnoticed.  
  <sub>from parse-check-is-advisory-only.md</sub>
- **Jeff's screen still has no sign-in of its own** — Jeff's phone screen has no login of its own — it rides on whatever dashboard session is on the device, and Jake's phone jumps straight into it before any sign-in check runs.  
  <sub>from sign-in-always-required.md</sub>
- **Crew in-and-out times and a yard gate log from the shop cameras** — Using the shop cameras to log when crew arrive and leave and when trucks pass the gate was only ever sketched out — nothing has been built.  
  <sub>from unifi-protect-plan.md</sub>
- **Find out whether the camera alert names the person or plate it saw** — Nobody has yet checked whether the camera's alert actually tells you who it saw or which plate it read, which decides whether the whole idea works.  
  <sub>from unifi-protect-plan.md</sub>
- **Automatic gate opening for known plates** — Letting the yard gate open itself for recognised plates is an idea only, and it depends on the gate being motorised.  
  <sub>from unifi-protect-plan.md</sub>
- **Tell the crew the camera log will be used for payroll** — If camera timings ever get used to check hours, the crew need to be told first — that conversation has not happened.  
  <sub>from unifi-protect-plan.md</sub>
- **Email history stays filed under the old customer when a booking changes hands** — If a booking gets moved to a different customer, the emails already sent on it stay filed in the first customer's record, so neither profile tells the true story.  
  <sub>from email-wrong-recipient-guard.md</sub>
- **A tool for seeing why a bin didn't get crossed off is built but never switched on** — There's no way to look up why a truck visit failed to tick a bin off, so those misses stay a mystery.  
  <sub>from office-tv-board.md</sub>
- **A sound for when the day's last job is finished** — Finishing the last stop of the day — the biggest daily win — still happens in silence.  
  <sub>from sound-as-reward.md</sub>
- **A soft thunk when a job gets stamped complete** — Stamping a job done gives you the visual receipt but no sound, so the moment doesn't land the way booking does.  
  <sub>from sound-as-reward.md</sub>
- **A whoosh when a customer email goes out** — Sending a customer email is silent, even though it already has the ten-second Undo that a sound would pair with.  
  <sub>from sound-as-reward.md</sub>
- **A dispatch nudge saying how many of tomorrow's stops still have no driver** — Nothing on the dashboard tells you how many of tomorrow's stops still have no driver assigned, so unassigned work is only found by going looking for it.  
  <sub>from ux-research-aug2026.md</sub>
- **Run the Monday health check by hand once so the automatic runs stop stalling** — The weekly Monday health check may still be waiting on a first manual run so it can ask for its permissions, but there's no way to tell from the files.  
  <sub>from claude-tooling-aug2026.md</sub>
- **Decide whether an 8 AM drop-off is a real promise or just means first thing** — The day planner still treats an 8 AM drop-off as a hard promise the truck can miss, and nobody has decided whether that is right.  
  <sub>from dispatch-overhaul-v595.md</sub>
- **A handful of long stops still need someone to ask about them** — Four unusually long stops from early August were flagged for someone to ask about, and there is no sign anyone did.  
  <sub>from jordan-time-review-aug2026.md</sub>
- **A spare unused master key is still sitting in the database account** — There may still be a second, unused master key on the database account that nobody needs, but it can't be checked from here.  
  <sub>from security-review-aug2026.md</sub>
- **Customer names and addresses are put on screen without being cleaned first** — Customer names and addresses are still dropped straight into the page unfiltered in a lot of places, so odd characters in a name could break or hijack a screen.  
  <sub>from security-review-aug2026.md</sub>
- **Nobody has looked at the office TV map since the key was locked down** — The map is definitely loading somewhere every day, but nobody has confirmed the wall screen itself still shows it.  
  <sub>from tv-map-google-branch.md</sub>
- **Job pins on the office TV map show a whole town instead of the actual address** — Job pins on the wall map still sit on the middle of a town rather than the real address, because jobs don't carry map coordinates.  
  <sub>from tv-map-google-branch.md</sub>
- **Delete the spare Google key that still has 52 services switched on** — An old, wide-open Google key from March is still sitting on the account and should probably be removed once we're sure nothing uses it.  
  <sub>from address-autocomplete-google-swap.md</sub>
- **Back-shop PC is on a version of Windows that is no longer supported** — The shop computer runs Windows 10, which stopped getting security updates, and the free upgrade is still worth doing.  
  <sub>from backshop-inventory-kiosk.md</sub>
- **A wrong address that lands somewhere believable still slips through** — The planner catches addresses that geocode absurdly far away, but a wrong pin that lands a plausible distance out still adds fake driving to the day.  
  <sub>from dispatch-friday-calibration.md</sub>
- **Text sizes only half tidied up** — The app still uses two dozen different text sizes, which is why headings and labels don't line up from screen to screen.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **Two approved changes contradict each other on button edges** — Two things Jake already approved point opposite ways on whether buttons have outlines, so he needs to pick one before the buttons get touched.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **Decide whether Bin Fleet should open as a list instead of cards** — The Bin Fleet page still opens as picture cards; Jake never said whether he wants it to open as a plain list instead.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **Three pages still have their own separate look** — The AI Advisor, the pricing page and the Schedule page each still have their own colours and styling instead of matching the rest of the app.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **About 57 flagged colour problems were never checked** — Roughly fifty-seven suspected colour mistakes were listed but never actually verified against the real styles.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **Live Jobs paints every driver's route the same green** — On Live Jobs every driver's section is the same green, so you can't tell one driver's work from another's at a glance.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **The pricing page colours its distance zones like a warning light** — The pricing page shades far-away towns red and near ones green, which reads as 'something is wrong' rather than 'this is far'.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **Ask Jeff before restyling his screen** — Jeff's own screen could be brought in line with the new look, but he should be asked first since it's the screen he uses all day.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **Schedules and staff ratings still hang off the old staff list** — Shift records and staff ratings are still tied to the old staff table rather than the master list, so the two can drift apart.  
  <sub>from team-roster-two-tables.md</sub>
- **Work out what size storage unit is actually needed** — Nobody has worked out what size storage unit the business actually needs.  
  <sub>from suggestion-batch-v551.md</sub>
- **Every job save pings a truck-zone service that does nothing** — Every single time a job is saved, the system calls out to the truck-tracking service and, for almost every job, gets nothing useful back — burning our limited allowance of those calls.  
  <sub>from BUG_AUDIT_FINAL_REPORT.md</sub>
- **Nobody has confirmed the data could actually be restored after a disaster** — No one has ever proved we could actually get the customer and job data back if the database were lost.  
  <sub>from AUDIT_ENVIRONMENT_SAFETY.md</sub>
- **Some pop-ups close when you click outside and the rest do not** — Clicking the dark area outside a pop-up closes some windows and does nothing on others, so the app behaves two different ways.  
  <sub>from BUG_AUDIT_SYSTEM_MAP.md</sub>
- **More places offered for the 3D icons but never done** — The nice 3D icons made it onto the side menu but still have not been added to pop-up headers, the phone tab bar or the empty-screen messages.  
  <sub>from emboss-icon-system.md</sub>
- **The customer list takes twelve trips to load and looks empty meanwhile** — Start-up still pulls the whole customer list a thousand at a time, one request after another, before the app is ready.  
  <sub>from BUG_AUDIT_FINAL_REPORT.md</sub>
- **The price sheet has no junk removal prices in it** — The price list has bin prices for every town but the junk removal boxes are empty everywhere.  
  <sub>from pricing-data-structure.md</sub>
- **A practice copy of the system so changes can be tried safely** — There is still nowhere safe to try changes - everything happens on the real, live system.  
  <sub>from AUDIT_ENVIRONMENT_SAFETY.md</sub>
- **Send the morning briefing audio straight to the TV player instead** — The 9 AM spoken briefing could be handed straight to the TV player as an audio file instead of relying on the web page to play it — that has not been built.  
  <sub>from office-tv-briefing-audio.md</sub>
- **Charging extra for certain locations — proposal sent, no answer yet** — A proposal about charging more for far-out locations went to Jake; the only distance-based charge in the app today is the furniture pickup minimum.  
  <sub>from suggestion-batch-v551.md</sub>
- **Decide whether to delete six leftover truck photos** — Six big raw truck photos are still sitting in the project folder unused, waiting on a yes/no to delete them.  
  <sub>from vehicles-fleet-focus-redesign.md</sub>
- **An unsaved email template draft can still be sent to a customer** — Half-typed wording in the email template editor is used for real customer emails straight away, before Save is pressed.  
  <sub>from BUG_AUDIT_FINDINGS.md</sub>
- **A job has two competing ways of saying it is finished** — A job's 'finished' state is tracked in two separate places, which is confusing even though the screens currently agree.  
  <sub>from BUG_AUDIT_DATABASE.md</sub>
- **The public booking form has never been checked at all** — The booking form customers fill in on the website has never been reviewed, so nobody knows how it handles job numbers or double clicks.  
  <sub>from BUG_AUDIT_WORKFLOWS.md</sub>
- **Several everyday things still have no icon of their own** — A few common things on screen (boxes/deliveries, addresses and buildings, map pins) still show plain phone symbols instead of the app's own artwork.  
  <sub>from emboss-icon-system.md</sub>
- **Nothing stops two bins being painted the same number** — Checked 2026-09-08: the old guess-from-the-browser problem was fixed in July, and adding a bin can no longer overwrite one. What is left is smaller — the database has no rule making the painted bin number unique, so two bins could end up wearing the same number. A confusing label, not lost data; one query says whether it has happened.  
  <sub>from bin-fleet-permissions.md, verified against app.js:2083</sub>
- **Nothing stops two live rentals from holding the same bin** — The database still allows the same bin to be recorded as sitting at two customers at once - only the screens try to stop it.  
  <sub>from BUG_AUDIT_DATABASE.md</sub>
- **The pricing, tonnage and quote maths were never checked** — The part of the check-up covering price, weight and quote calculations was never finished, and there is still no record of anyone doing it.  
  <sub>from BUG_AUDIT_COVERAGE.md</sub>
- **Small leftover spots still showing plain symbols** — A few small buttons and status tags around the app still show plain keyboard symbols instead of the newer 3D icons.  
  <sub>from emboss-icon-system.md</sub>
- **Editing a customer overwrites the contact name and phone on all their past jobs** — Saving a change to a customer rewrites the contact name and phone on every job they have ever had, including jobs booked under a different on-site contact.  
  <sub>from BUG_AUDIT_FINDINGS.md</sub>
- **The start-up bin check only ever marks bins out, never back in** — The tidy-up that runs when the dashboard opens can only mark a bin as out at a customer's, never bring one back into the yard.  
  <sub>from BUG_AUDIT_WORKFLOWS.md</sub>
- **Nothing on screen has been clicked through and checked** — Nobody has sat down and clicked through every screen at different window sizes to see what actually looks wrong.  
  <sub>from BUG_AUDIT_UI.md</sub>
- **Decide how much of a job a new hire should be able to change** — Right now anyone who can sign in can cancel a job, change its price or move its date, and you have to decide if that is right for a new hire.  
  <sub>from WHO_CAN_CHANGE_WHAT.md</sub>
- **Loading landscaping and snow locations from a spreadsheet** — There is still no way to load a list of lawn or snow locations from a spreadsheet - they have to be typed in one at a time.  
  <sub>from jwg-scheduler-review-fixes.md</sub>
- **Check whether the office TV is even showing the board during the day** — Nobody has confirmed the office TV actually displays the board during working hours, and there is still nothing in the app that would tell us from a distance.  
  <sub>from office-tv-briefing-audio.md</sub>
- **Nothing in the database enforces which customer a job belongs to** — A job is still tied to its customer only by a typed-in number that nothing checks, so a job can point at a customer who doesn't exist.  
  <sub>from BUG_AUDIT_JOB_IDS.md</sub>
- **Large parts of the app were never read during the check-up** — Big chunks of the app were never looked at in the big check-up, and the app has grown a lot since then.  
  <sub>from BUG_AUDIT_COVERAGE.md</sub>
- **Nobody knows whether customer notes and photos were already wiped** — The bug that could blank customers' private notes and photos is fixed, but nobody has yet gone back through the records to see whether it already did any damage.  
  <sub>from BUG_AUDIT_FINAL_REPORT.md</sub>
- **Decide whether office staff should edit staff records, driver scores and truck data** — Staff records are now manager-only, but any signed-in person can still change driver scores and truck details - that part was never decided.  
  <sub>from WHO_CAN_CHANGE_WHAT.md</sub>

## Decided against

Settled. Listed so nobody pitches them again — if you change your mind, move the line up.

- **Adding new lawn sites to the weekly schedule automatically** — New lawn locations found in the truck data are never added to the weekly staff schedule on their own — someone adds them by hand.  
  <sub>from cut-times-page.md</sub>
- **Letting the truck tracking move jobs between drivers on its own** — The GPS never reassigns a job by itself — it only points out a mismatch and waits for a person to click.  
  <sub>from dispatch-gps-mismatch.md</sub>
- **Picking a driver's truck by hand** — Assigning a driver to a truck by hand was removed on purpose — the app works it out from the day's GPS instead.  
  <sub>from no-driver-truck-pairings.md</sub>
- **Removing, hiding or shrinking the truck-filling animation** — The truck-filling animation Jake built stays exactly as it is and should never be proposed for removal.  
  <sub>from truck-animation-is-jakes.md</sub>
- **Sliding animations between pages — turned down** — Sliding animations when moving between pages were deliberately rejected because the tool has to feel instant.  
  <sub>from motion-layer-v541.md</sub>
- **Bringing in a second animation tool alongside the current one — turned down** — Adding a second animation library alongside the existing one was deliberately ruled out for good.  
  <sub>from motion-layer-v541.md</sub>
- **Reports on how far ahead customers book** — Reporting on how far in advance customers book was ruled out because jobs are almost always typed in the same day they happen.  
  <sub>from analytics-rebuild-v522.md</sub>
- **Money reports built from the job price box** — Revenue reporting from the job price box was ruled out because that box is empty on nearly every job; money lives in QuickBooks.  
  <sub>from analytics-rebuild-v522.md</sub>
- **Showing drivers inside the truck chips** — Jake decided drivers' names must stay out of the truck badges on the dashboard; trucks and people stay separate.  
  <sub>from dashboard-redesign-aug2026.md</sub>
- **Icon-only buttons on the job rows** — Jake chose to keep the words on the job-row buttons rather than shrink them to icons.  
  <sub>from dashboard-redesign-aug2026.md</sub>
- **Automatic bin handover for bookings made ahead of their day** — When a bin is assigned to a job whose day has not arrived yet, the app deliberately leaves the earlier job alone instead of guessing the bin has moved.  
  <sub>from bin-handoff-on-assign.md</sub>
- **Filling in bin numbers automatically from the truck GPS** — Working out which bin number was dropped from truck GPS was settled as impossible and must not be looked at again.  
  <sub>from driver-telemetry-data-traps.md</sub>
- **A remembered "already signed out" marker on the sign-in screen** — The idea of storing a note that someone had signed out was tried, failed, and must not come back — the sign-in screen now always shows.  
  <sub>from sign-in-always-required.md</sub>
- **Storing camera video or snapshots in the app** — Camera video and stills will never be copied into the app's own storage — only a link back to the camera system.  
  <sub>from unifi-protect-plan.md</sub>
- **Guessing the right email address by matching the customer's name** — The old habit of guessing a booking's email address from a name match is gone for good, and must not come back — it is what put ten confirmations in strangers' inboxes.  
  <sub>from email-wrong-recipient-guard.md</sub>
- **Instant schedule updates on the office TV instead of the 15-minute check** — Jake chose to keep the office TV refreshing every 15 minutes rather than updating the instant something changes — don't propose live updates again.  
  <sub>from office-tv-board.md</sub>
- **Showing bin rental prices on the office wall screen** — Pricing must never go back on the office wall screen — it belongs in the web app only.  
  <sub>from office-tv-board.md</sub>
- **Sounds for things the computer does on its own, like camera sightings or truck-in-zone alerts** — Sound is reserved for things a person just did — never for automatic events, or it stops meaning anything.  
  <sub>from sound-as-reward.md</sub>
- **Hiding or retiring the Live Jobs page because nobody opens it** — Live Jobs stays exactly as it is — low usage is never a reason to remove a page.  
  <sub>from ux-research-aug2026.md</sub>
- **Locking down the public booking form's ability to add jobs and customers** — The public website's booking form can still create jobs and customers on purpose — closing that would break online bookings.  
  <sub>from anon-key-data-exposure.md</sub>
- **Turning off the bin list's safety check to push through a bin renumber** — The database guard on bin records stays switched on during a renumber — turning it off was tried, refused, and isn't needed.  
  <sub>from bin-rename-protocol.md</sub>
- **Paying Google for traffic-aware drive times on the dispatch board** — Dispatch sticks with the free routing service for drive times; paying Google for traffic data was priced and turned down.  
  <sub>from dispatch-chain-model.md</sub>
- **Three extra analytics displays were turned down on purpose** — Three extra charts (a 12-month area hero, a loyalty donut, a row of five headline tiles) were deliberately left out of Analytics and should stay out.  
  <sub>from analytics-advisor-v556.md</sub>
- **Day-before pickup call reminders were taken off the dashboard for good** — The dashboard card is for emails that need sending only — the day-before pickup call list was removed on purpose and should not come back into that card.  
  <sub>from dashboard-emails-card.md</sub>
- **Testing changes on a local preview before pushing was dropped** — Trying changes on a local preview before pushing was dropped on purpose — push, then check the real site.  
  <sub>from no-local-server-testing.md</sub>
- **Swap-outs written only in the job notes stay unhandled** — Jake said a swap noted only in the notes doesn't matter, because it's still a drop and a pick at the same address.  
  <sub>from dispatch-friday-calibration.md</sub>
- **No lunch break built into the day's timings** — The crew doesn't take a midday break, so the day-planner should never pad one in.  
  <sub>from dispatch-friday-calibration.md</sub>
- **No saved start time for a driver's day** — The planner works backwards from what was promised to customers to say 'leave by', instead of storing a fixed start time.  
  <sub>from dispatch-friday-calibration.md</sub>
- **Filling in the driver automatically from truck GPS** — The office wants to keep assigning drivers by hand, so nothing should fill drivers in from truck GPS.  
  <sub>from gps-driver-autofill-parked.md</sub>
- **Decide whether the four row-button colours get retuned** — Jake already said the four different button hover colours stay exactly as they are.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **Decide whether town colours that clash with the warning colours get changed** — Jake already said the per-town colour chips stay as they are.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **The dark cockpit look for the app** — Jake ruled out the dark 'cockpit' styling; the app keeps its light look with the green sidebar.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **Row button colours, the pink Pick up button and town colours stay exactly as they are** — Jake looked at these three and said to leave them alone permanently.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **Shading bin numbers by ink depth, replaced by a red/amber/green signal** — Instead of shading bin numbers darker or lighter, Jake asked for a plain red/amber/green signal — and that is what is on screen.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **Restyling the office TV wall and the back-shop kiosk to match** — The TV wall keeps its cream-and-gold look and the kiosk stays dark, because both are read from across a room.  
  <sub>from overhaul-blueprint-aug2026.md</sub>
- **Switching the icons to the heavier solid style** — Making the little pictures throughout the app thicker and heavier was tried, measured and rejected — and the app has since moved to a completely different picture style anyway, so it no longer applies.  
  <sub>from emboss-icon-system.md</sub>
- **The check-up write-ups stay off the live site on purpose** — The written-up findings from the app check-up are deliberately kept off the live website, because anything added to the site's folder gets published publicly.  
  <sub>from BUG_AUDIT_BLOCKED.md</sub>
- **Tracking money or revenue in the app** — Money stays in QuickBooks — the app deliberately never records prices or revenue.  
  <sub>from money-lives-in-quickbooks.md</sub>
- **Asking after every email whether it sent, or sending emails automatically** — Emails will keep opening in your own mail program with a short Undo, rather than sending themselves or nagging you afterwards to confirm.  
  <sub>from review-followup-feature.md</sub>
- **The second, paused database cannot be used as a practice copy** — The other, switched-off database is not a practice copy and will not be used as one.  
  <sub>from AUDIT_ENVIRONMENT_SAFETY.md</sub>
- **Separating the two old rentals that will follow the reused bin number** — When bin 14R-29 gets its new sticker number, two old rentals from a bin that never existed will show up in its history, and that is on purpose.  
  <sub>from bin-renumbering-project.md</sub>
- **Replacing the status dots, medals and weather symbols with icons** — The coloured dots, gold/silver/bronze medals and weather symbols stay as plain emoji instead of becoming 3D tiles.  
  <sub>from emboss-icon-system.md</sub>
- **Locking the shop inventory page to admins only** — The back-shop stock screen stays open to whoever is signed in, because locking it would stop Darrin doing his job.  
  <sub>from jwg-scheduler-review-fixes.md</sub>
- **Writing safety checks now, before there is anywhere to run them, was ruled out** — Writing automatic safety checks was deliberately put off, because there is nowhere to run them and untested checks would give false confidence.  
  <sub>from BUG_AUDIT_TESTS.md</sub>
- **Renaming the whole bin fleet in one batch at the end** — Doing all the bin number changes in one go at the end was ruled out — each bin gets changed the day its new sticker goes on.  
  <sub>from bin-renumbering-project.md</sub>
- **Putting the 3D icons on the tiny calendar chips** — The little calendar chips keep their plain symbols instead of the 3D tiles — the tiles are too big for those one-line cells.  
  <sub>from emboss-icon-system.md</sub>
- **Testing changes against the live system was ruled out** — Trying out risky changes against the real live system was refused and stays refused — there is nowhere safe to test.  
  <sub>from AUDIT_ENVIRONMENT_SAFETY.md</sub>
- **The back-shop stock list stays unlocked on purpose** — The back-shop stock list is left open to everyone deliberately, because locking it would stop the shop kiosk working.  
  <sub>from WHO_CAN_CHANGE_WHAT.md</sub>
- **Furniture drop-offs — we don't do them any more** — Furniture drop-offs were deliberately retired and the app no longer offers them - don't propose bringing them back.  
  <sub>from suggestion-batch-v551.md</sub>
- **Crew blocks, landscaping schedules and workshop tasks stay deletable by everyone** — Leaving crew time-off, landscaping schedules and workshop tasks deletable by any signed-in staff member was Jake's deliberate choice - don't lock them down.  
  <sub>from WHO_CAN_CHANGE_WHAT.md</sub>
- **The stolen-password check for staff sign-ins** — Jake decided on 8 September not to turn this on: it is an internal app used by a handful of staff, and he judged the risk not worth the setting. Don't re-propose it.  
  <sub>from security-review-aug2026.md</sub>
- **Decide whether a 14-yard bin can ride along with a 20-yard** — Decided against: you set it aside on 5 September - stacking stays 14+14 only.  
  <sub>from the 2026-09-08 re-check</sub>
- **Dashboard rework parked — one combined to-do list would be too long** — Decided against: you parked it after the mockups - "sometimes there's thirty things in one day".  
  <sub>from the 2026-09-08 re-check</sub>
- **Screens still showing a bin's old number — fix deliberately on hold** — Decided against: on hold until you finish relabelling the fleet; the note says not to propose it before then.  
  <sub>from the 2026-09-08 re-check</sub>
- **Nobody has actually measured how long a truck sits at the dump** — Decided against: you kept the 20 minutes after the real GPS Friday was studied.  
  <sub>from the 2026-09-08 re-check</sub>
- **There are almost no automatic safety checks on the app** — Decided against: already in Decided against - put off until there is a practice database.  
  <sub>from the 2026-09-08 re-check</sub>
- **Decide whether the Duckworth Street stop stays on the lawn list** — Decided against: you already ruled: it stays, and only comes out if it clutters.  
  <sub>from the 2026-09-08 re-check</sub>
- **Letting the AI write customer emails and win-back outreach** — Decided against: your words: "we wouldnt do the emails as of now".  
  <sub>from the 2026-09-08 re-check</sub>
- **Decide whether to rename the Jeff White Group menu heading** — Decided against: you answered on 2026-07-10: keep the nav wording.  
  <sub>from the 2026-09-08 re-check</sub>
