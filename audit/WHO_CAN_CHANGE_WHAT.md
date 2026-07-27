# Who can change what — 2026-07-26 (after v491)

Written for Jake to decide what staff *should* be able to do. Facts read from the live database
and the app code; nothing here is a recommendation until marked as one.

## The nine people

| Person | Role in database | Can delete? | Can see revenue? | Sees admin pages? |
|---|---|---|---|---|
| **Jake** | admin | yes | yes | yes |
| **Barbara** | admin | yes | yes | yes |
| **Sam** | admin | yes | **no** | yes |
| Kelly | user | no | no | no |
| Rachel | user | no | no | no |
| Josh | user | no | no | no |
| Jeff | user | no | no | no (locked to his own app) |
| Darrin | User | no | no | no (locked to the inventory kiosk) |
| OfficeTV | display | no | no | no (locked to the TV board) |

## There are two separate gates, and only one is real

**Gate 1 — the menu.** Twelve pages are hidden from anyone not on a hardcoded list of names in the
code: `ANALYTICS_USERS = ['Jake','Sam','Barbara']` (app.js:2153). The hidden pages are analytics,
utilization, leaderboard, advisor, bookings, staffcheckin, pricingconsole, **ourprices**,
**ourpriceseditor**, team, usage and emailtemplates.

**Gate 2 — the database.** Row Level Security. This is the one that actually stops anything.

**They do not agree.** The menu hides the pricing pages from Kelly, Rachel and Josh, but the
database happily accepts a price change from any signed-in account. The menu is a curtain, not a
lock.

Worth knowing: the admin list in the code is separate from the `role` column in the database. Adding
a manager means changing **both** — the database row *and* a hardcoded list that requires a code
deploy. If they drift, someone gets a half-admin experience.

## What ANY signed-in person can change today

Kelly, Rachel, Josh (and Jeff and Darrin, from their own apps) can change all of the following at
the database level, regardless of what the menu shows them:

| What | Table | Notes |
|---|---|---|
| **Bin pricing sheet** | `our_prices` | 47 town rows. **Your specific concern — yes, they can.** Menu-hidden only. |
| **Furniture prices** | `furniture_prices` | 109 items behind the furniture quote calculator. |
| **Email templates** | `email_presets` | The 7 templates sent to customers. Menu-hidden only. |
| Any job, any field | `jobs` | Price, dates, status, customer link, notes. |
| Any customer record | `clients` | Name, phone, address, notes. |
| Bins | `bin_items` | Add and edit. |
| Trucks | `vehicles` | Add and edit. |
| Staff records | `crew_members` | Add and edit. |
| Crew scheduling | `crew_blocks`, `vehicle_assignments`, `vehicle_blocks` | |
| Driver scoring | `driver_scores`, `crew_driver_scores`, `safety_events` | |
| Maintenance | `maintenance_schedules`, `vehicle_odometers` | |
| Customer email archive | `quote_correspondence` | Can add and edit entries. |
| Damage reports | `damage_reports` | |
| Competitor pricing | `competitors` | |
| Landscaping scheduler | all `jwg_*` tables | |
| Referral sources, suggestions | | |

In short: **at the database level there is currently no difference between an office user and an
admin, except deletion.**

## What only admins can do

Deleting is the one thing genuinely restricted, by the `can_delete` flag (Jake, Barbara, Sam only).
It covers: jobs, clients, bin_items, vehicles, crew_members, our_prices, competitors,
quote_correspondence, driver_scores, maintenance_schedules, vehicle_assignments, vehicle_blocks,
vehicle_odometers, damage_reports.

Revenue figures are hidden from everyone except Jake and Barbara (`can_see_revenue`) — note Sam is
an admin but does **not** see revenue.

## What anonymous visitors can do (after v491)

Only four things remain open without signing in, all for the public booking form:
create a job, create a customer, and read/add referral sources. As of tonight, nine internal tables
that were previously wide open now require a sign-in — including the customer email archive.

---

# UPDATE — locked down 2026-07-26 (v492)

Three changes applied since the above was written.

**1. Pricing and email templates are now admin-only to change.** `our_prices`, `furniture_prices`
and `email_presets` require `role = 'admin'` (Jake, Barbara, Sam) to add or edit. Everyone can still
*read* them — staff need prices to quote a job and templates to send an email.

**2. Nine internal tables now require signing in** (were open to anyone on the internet), including
the customer email archive.

**3. Profiles are read-only from the browser.** The old policy let every user UPDATE THEIR OWN ROW
— including setting `role = 'admin'`, which would have walked straight through change 1, or setting
`username` to a name on the code's admin list to unlock the admin menu. The browser only ever reads
a profile at sign-in, so writing is now closed entirely. Changing someone's role is a Supabase
dashboard action.

## What a regular user (Kelly, Rachel, Josh) can still change

Confirmed against the live policies after the lockdown. They can add and edit:

**Customer and job data** — jobs (any field: price, dates, status, customer link, notes), clients,
quote_correspondence, damage_reports, bin_history, referral_sources (add only), suggestions.

**Fleet and yard** — bin_items, vehicles, vehicle_blocks, vehicle_odometers, maintenance_schedules,
geofences and geofence_notifications.

**People and scheduling** — crew_members, crew_blocks, vehicle_assignments, driver_scores,
crew_driver_scores, safety_events, employee_ratings, employee_incentives, jwg_employees and
jwg_employee_clothing.

**Landscaping side** — every `jwg_*` table (schedules, service locations, service types, inventory,
workshop tasks, salt bins, app settings).

**Reference data** — competitors, city_drive_times.

They **cannot**: change any price or email template; delete anything at all (only Jake, Barbara and
Sam can, via `can_delete`); see revenue figures (only Jake and Barbara); or alter their own
permissions.

The single biggest remaining item is **jobs** — any signed-in user can change a job's price, date,
status or which customer it belongs to. That is probably correct for office staff doing the work,
but it is worth a deliberate decision rather than an accident.

---

# UPDATE 2 — Jake's rules applied (v493, 2026-07-26)

**Bins.** Office staff call bins in and out and record condition — colour, damage, decals, repaint,
notes. They cannot create or delete a bin (admin only, in the database now, not just hidden on
screen) and cannot rename one: a trigger refuses any change to `bid`, `num`, `size` or `type` from
a non-admin, because the code on the side of the bin is its identity and size/type are what that
code encodes.

**Landscaping.** The schedule is theirs to build — `jwg_schedules`, `jwg_workshop_tasks` and
`crew_blocks` stay fully editable including delete. The people and the places are reference data,
readable by all and changeable only by an admin: `jwg_employees`, `jwg_service_locations`,
`jwg_service_types`, `jwg_location_services`, and `crew_members` on the junk side. Extra Jobs are
rows in `jobs`, which already required an admin to delete.

**Whole-record writes removed.** Calling a bin in or out used to rewrite all 86 bin records from
that tab's memory (23 places did it). It now writes one field for one bin via `patchBin`. This was
the third instance of the same pattern, after the client merge rewriting every customer and cancel
blanking a job's notes.

**Admin preview.** Jake has an eye button beside the phone one that shows the dashboard as office
staff see it, with a banner to switch back. It changes what is on screen, not what the database
allows — it answers "what do they see", not "what can they do".

## Still deletable by a non-admin

Deliberate, per Jake: `crew_blocks`, `jwg_schedules`, `jwg_workshop_tasks`.

Not yet decided: `bin_history`, `city_drive_times`, `driver_scores`, `crew_driver_scores`,
`safety_events`, `geofences`, `geofence_notifications`, `geofence_poll_state`, `suggestions`,
`jwg_inventory_items`, `jwg_inventory_categories`, `jwg_app_settings`, `jwg_salt_bins`,
`jwg_employee_clothing`. Inventory is left open on purpose — Darrin's kiosk needs to update stock,
and locking it would break him.

## Recommendations (your call)

1. **Lock pricing to admins.** `our_prices` and `furniture_prices` should require an admin, not just
   a sign-in. This is a small database change and closes the gap you asked about. It's the one I'd
   do first.
2. **Lock email templates to admins** for the same reason — they go out over your name.
3. **Consider whether office staff should edit staff records, driver scores and truck data.** These
   feel like management data that happens to be writable by everyone.
4. **Make the admin list come from the database**, not a hardcoded array, so adding a manager is one
   change instead of two-plus-a-deploy.
5. **Decide about job deletion.** Only admins can delete, which is good — but any signed-in user can
   set a job's status to Cancelled, change its price, or move its date. If that's too much for a
   new hire, the tighter control is per-field, which is a bigger piece of work.

None of these are done. Tell me which you want and I'll implement them.
