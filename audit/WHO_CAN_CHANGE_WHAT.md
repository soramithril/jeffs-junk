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
