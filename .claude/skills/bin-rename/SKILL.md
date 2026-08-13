---
name: bin-rename
description: Rename a bin's number everywhere (database id + label + all five reference tables) when Jake gives an old-to-new pair, e.g. "change bin 14R-07 to 14R-31" or "do another bin". Pre-agreed runbook - follow it verbatim, no need to re-confirm the approach.
---

# Rename a bin

Jake renumbers the physical bins as he goes - the sticker is already changed
and the database is the thing that's wrong. Rename BOTH the id (`bid`) and the
label (`num`), plus all five reference tables. Never the label alone: the
assign picker shows `num` but job rows and dispatch show `bid`, so a
half-rename makes one bin read as two different numbers.

## Step 1 - Check it's safe (Supabase MCP SQL, read-only)

```sql
select
  (select count(*) from bin_items where bid='NEW' or num='NEW') as target_taken,
  (select count(*) from bin_items where bid='OLD') as source_exists,
  (select count(*) from bin_history where bin_num='OLD') as history,
  (select count(*) from jobs where bin_bid='OLD') as jobs,
  (select count(*) from damage_reports where bin_bid='OLD') as damage,
  (select count(*) from geofence_notifications where bin_bid='OLD') as geofence;
```

`target_taken` must be 0 and `source_exists` must be 1. Never reuse a freed
number for a different bin - old records would resolve to the wrong physical
bin.

## Step 2 - Run it through Jake's signed-in browser session

**A plain SQL UPDATE always fails.** The `bin_items_guard()` trigger calls
`is_admin()`, which reads `auth.uid()`, and an MCP SQL connection has none.
Do NOT disable the trigger - Jake is `role='admin'`, so his signed-in session
is allowed with every check intact.

Use `mcp__claude-in-chrome__javascript_tool` on the dashboard tab with the
page's own `db` client. Confirm `(await db.rpc('is_admin')).data === true`
first. Do `bin_items` first - it's the guarded one, so a refusal there is a
clean no-op:

```js
const OLD='14LW-01', NEW='14LW-29';
const clash = await db.from('bin_items').select('bid').or('bid.eq.'+NEW+',num.eq.'+NEW);
if((clash.data||[]).length) throw new Error(NEW+' already exists - aborted');
const r1 = await db.from('bin_items').update({bid:NEW,num:NEW}).eq('bid',OLD).select('bid,num');
const r2 = r1.error ? null : await db.from('bin_history').update({bin_num:NEW}).eq('bin_num',OLD).select('id');
const r3 = r1.error ? null : await db.from('jobs').update({bin_bid:NEW}).eq('bin_bid',OLD).select('job_id');
const r4 = r1.error ? null : await db.from('damage_reports').update({bin_bid:NEW}).eq('bin_bid',OLD).select('id');
const r5 = r1.error ? null : await db.from('geofence_notifications').update({bin_bid:NEW}).eq('bin_bid',OLD).select('id');
JSON.stringify({bin:r1.error?'ERR '+r1.error.message:(r1.data||[]).length,
  history:(r2?.data||[]).length, jobs:(r3?.data||[]).length,
  damage:(r4?.data||[]).length, geofence:(r5?.data||[]).length,
  errs:[r2,r3,r4,r5].map(r=>r?.error?.message).filter(Boolean)});
```

If the tab has no data loaded (`binItems.length===0`) the tab is frozen or
backgrounded - have Jake click the window. No `setTimeout`/polling loops in
evals; they hang the tab.

## Step 3 - Verify from MCP SQL, then tell Jake to refresh

```sql
select
  (select count(*) from bin_items where bid='NEW' and num='NEW') as renamed,
  (select count(*) from bin_items where bid='OLD' or num='OLD')
  + (select count(*) from bin_history where bin_num='OLD')
  + (select count(*) from jobs where bin_bid='OLD')
  + (select count(*) from damage_reports where bin_bid='OLD')
  + (select count(*) from geofence_notifications where bin_bid='OLD') as left_behind;
```

`renamed`=1 and `left_behind`=0. Then tell him to refresh - `binItems` is held
in page memory, so the dashboard keeps showing the old number until reload.

## Step 4 - Log it

Add the old/new pair with row counts to the bin-renumbering-project memory's
table so the fleet map stays current.
