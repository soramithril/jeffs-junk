/**
 * Supabase Edge Function: geofence-events (v16)
 *
 * Crosses bin jobs off the Live Jobs board by watching truck GPS trails.
 *
 * Each poll (pg_cron, every 15 min on weekdays) it:
 *   1. loads today's active bin jobs that have a BIN_AUTO_ zone — the zone
 *      centres come from OUR geofences table, not Geotab,
 *   2. fetches today's GPS breadcrumbs (LogRecord) for ALL devices in ONE
 *      Geotab call — easy on the 10-calls/minute quota,
 *   3. walks each trail against each zone circle and inserts
 *      geofence_notifications rows on enter ('dropped') and leave ('pickedup').
 *
 * Why not ExceptionEvents (the pre-v16 approach): we only ever create ZONES in
 * Geotab, never per-zone Rules, so the rule->zone lookup matched 0% of events
 * and no notification was ever inserted.
 *
 * VISUAL-ONLY (per Jake, 2026-07-02): this function NEVER writes to the jobs
 * table. bin_instatus stays entirely user-controlled.
 *
 * State machine per job per day (geofence_visits table):
 *   no visit -> 'dropped' (truck dwelling in zone) -> 'pickedup' (truck left).
 * Because every poll re-reads the FULL day of breadcrumbs, a missed poll or a
 * mid-day deploy self-heals on the next run.
 *
 * POST {"dryRun": true} computes and reports what it WOULD do — no writes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEOTAB_AUTH_URL = "https://my.geotab.com/apiv1";
const ZONE_RADIUS_M = 30;        // zone circles are 25 m; +5 m for GPS jitter
const DWELL_MS = 150000;         // must stay >=2.5 min inside — filters passing traffic
const EXIT_CONFIRM_MS = 120000;  // outside >=2 min after last inside point = truly left

interface GeotabCredentials {
  database: string;
  userName: string;
  sessionId: string;
}

interface AuthResult {
  credentials: GeotabCredentials;
  path: string;
}

let _credentials: GeotabCredentials | null = null;
let _serverUrl: string = GEOTAB_AUTH_URL;

async function rpc(url: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  const body = JSON.stringify({ id: 0, method, params });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`Geotab HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.error) throw new Error(`Geotab API error: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function geotabCall(method: string, params: Record<string, unknown>): Promise<unknown> {
  if (!_credentials) throw new Error("Not authenticated");
  return rpc(_serverUrl, method, { ...params, credentials: _credentials });
}

async function authenticate(): Promise<void> {
  const database = Deno.env.get("GEOTAB_DATABASE");
  const userName = Deno.env.get("GEOTAB_USERNAME");
  const password = Deno.env.get("GEOTAB_PASSWORD");
  if (!database || !userName || !password) {
    throw new Error("Missing Geotab credentials");
  }
  const res = await rpc(GEOTAB_AUTH_URL, "Authenticate", { database, userName, password });
  const auth = res as AuthResult;
  _credentials = auth.credentials;
  if (auth.path && auth.path !== "ThisServer") {
    _serverUrl = `https://${auth.path}/apiv1`;
  }
}

// ============================================================

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface LogRecord {
  device: { id: string };
  latitude: number;
  longitude: number;
  dateTime: string;
}

interface ZoneJob {
  jobId: string;
  lat: number;
  lng: number;
  name: string | null;
  binBid: string | null;
  address: string | null;
  city: string | null;
}

interface VisitState {
  job_id: string;
  device_id: string | null;
  inside: boolean;
  entered_at: string | null;
  exited_at: string | null;
}

interface Action {
  jobId: string;
  status: "dropped" | "pickedup";
  at: string;
  deviceId: string;
}

/** Today's date in Eastern Time (Ontario) as YYYY-MM-DD. */
function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

/** Start of the Eastern-Time day as a UTC Date (DST-safe via offset probe). */
function easternDayStart(dayISO: string): Date {
  const probe = new Date(`${dayISO}T12:00:00Z`);
  const eastern = new Date(probe.toLocaleString("en-US", { timeZone: "America/Toronto" }));
  const offsetMs = probe.getTime() - eastern.getTime() + probe.getTimezoneOffset() * 60000;
  return new Date(new Date(`${dayISO}T00:00:00Z`).getTime() + offsetMs);
}

function sameEasternDay(iso: string | null, dayISO: string): boolean {
  if (!iso) return false;
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }) === dayISO;
}

/** Metres between two lat/lng points (equirectangular — fine at 30 m scale). */
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const x = dLng * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return R * Math.sqrt(dLat * dLat + x * x);
}

/** Load today's active bin jobs that have a zone (lat/lng from geofences). */
async function loadActiveZones(today: string): Promise<ZoneJob[]> {
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("job_id, name, bin_bid, address, city, status")
    .eq("service", "Bin Rental")
    .or(`bin_dropoff.eq.${today},bin_pickup.eq.${today}`);
  if (jobsErr) throw new Error(`jobs query failed: ${jobsErr.message}`);

  const active = (jobs || []).filter((j) => j.status !== "Cancelled");
  if (!active.length) return [];

  const ids = active.map((j) => j.job_id);
  const { data: fences, error: fenceErr } = await supabase
    .from("geofences")
    .select("job_id, lat, lng")
    .in("job_id", ids);
  if (fenceErr) throw new Error(`geofences query failed: ${fenceErr.message}`);

  const byId = new Map((fences || []).map((f) => [f.job_id, f]));
  return active
    .filter((j) => byId.has(j.job_id))
    .map((j) => {
      const f = byId.get(j.job_id)!;
      return {
        jobId: j.job_id,
        lat: f.lat,
        lng: f.lng,
        name: j.name,
        binBid: j.bin_bid,
        address: j.address,
        city: j.city,
      };
    });
}

/** One Geotab call: every device's GPS points for today (Eastern day). */
async function loadTodaysTrails(today: string): Promise<Map<string, LogRecord[]>> {
  const records = (await geotabCall("Get", {
    typeName: "LogRecord",
    search: {
      fromDate: easternDayStart(today).toISOString(),
      toDate: new Date().toISOString(),
    },
    resultsLimit: 30000,
  })) as LogRecord[];

  const trails = new Map<string, LogRecord[]>();
  for (const r of records || []) {
    if (!r.device?.id || typeof r.latitude !== "number") continue;
    if (!trails.has(r.device.id)) trails.set(r.device.id, []);
    trails.get(r.device.id)!.push(r);
  }
  for (const t of trails.values()) {
    t.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  }
  return trails;
}

/**
 * Walk trails against zones and decide enter/leave actions.
 * Pure computation — no writes.
 */
function computeActions(
  zones: ZoneJob[],
  trails: Map<string, LogRecord[]>,
  states: Map<string, VisitState>,
  today: string,
): Action[] {
  const actions: Action[] = [];
  const now = Date.now();

  for (const z of zones) {
    const state = states.get(z.jobId);
    const inside = (p: LogRecord) => distanceM(p.latitude, p.longitude, z.lat, z.lng) <= ZONE_RADIUS_M;

    // Already visited AND left today — done for the day.
    if (state && sameEasternDay(state.exited_at, today)) continue;

    // Truck previously seen inside today — watch its trail for the exit.
    if (state && state.inside && state.device_id && sameEasternDay(state.entered_at, today)) {
      const trail = (trails.get(state.device_id) || []).filter(
        (p) => new Date(p.dateTime).getTime() > new Date(state.entered_at!).getTime(),
      );
      if (!trail.length) continue;
      const last = trail[trail.length - 1];
      const insidePts = trail.filter(inside);
      const lastInsideT = insidePts.length
        ? new Date(insidePts[insidePts.length - 1].dateTime).getTime()
        : new Date(state.entered_at!).getTime();
      if (!inside(last) && new Date(last.dateTime).getTime() - lastInsideT >= EXIT_CONFIRM_MS) {
        actions.push({ jobId: z.jobId, status: "pickedup", at: last.dateTime, deviceId: state.device_id });
      }
      continue;
    }

    // No visit recorded today — scan every trail for a dwelling visit.
    for (const [deviceId, trail] of trails) {
      const firstInIdx = trail.findIndex(inside);
      if (firstInIdx === -1) continue;
      const firstIn = trail[firstInIdx];
      const after = trail.slice(firstInIdx + 1);
      const firstOut = after.find((p) => !inside(p));
      const lastPoint = trail[trail.length - 1];
      const dwellEnd = firstOut
        ? new Date(firstOut.dateTime).getTime()
        : Math.max(new Date(lastPoint.dateTime).getTime(), now);
      const dwell = dwellEnd - new Date(firstIn.dateTime).getTime();
      if (dwell < DWELL_MS) continue; // drive-by, not a visit

      actions.push({ jobId: z.jobId, status: "dropped", at: firstIn.dateTime, deviceId });

      // Same-batch exit (e.g. a morning visit processed later in the day)
      const insidePts = trail.slice(firstInIdx).filter(inside);
      const lastInsideT = new Date(insidePts[insidePts.length - 1].dateTime).getTime();
      if (!inside(lastPoint) && new Date(lastPoint.dateTime).getTime() - lastInsideT >= EXIT_CONFIRM_MS) {
        actions.push({ jobId: z.jobId, status: "pickedup", at: lastPoint.dateTime, deviceId });
      }
      break; // one visiting truck per job is enough
    }
  }
  return actions;
}

async function applyActions(actions: Action[], zones: ZoneJob[]): Promise<void> {
  const zoneById = new Map(zones.map((z) => [z.jobId, z]));
  for (const a of actions) {
    const z = zoneById.get(a.jobId);
    // Visual-only: log a notification, NEVER mutate the job.
    const { error: insErr } = await supabase.from("geofence_notifications").insert({
      job_id: a.jobId,
      status: a.status,
      customer_name: z?.name || null,
      bin_bid: z?.binBid || null,
      address: z?.address || null,
      city: z?.city || null,
    });
    if (insErr) throw new Error(`notification insert failed for ${a.jobId}: ${insErr.message}`);

    const stateRow =
      a.status === "dropped"
        ? { job_id: a.jobId, device_id: a.deviceId, inside: true, entered_at: a.at, exited_at: null, updated_at: new Date().toISOString() }
        : { job_id: a.jobId, device_id: a.deviceId, inside: false, exited_at: a.at, updated_at: new Date().toISOString() };
    const { error: stErr } = await supabase.from("geofence_visits").upsert(stateRow, { onConflict: "job_id" });
    if (stErr) throw new Error(`visit state upsert failed for ${a.jobId}: ${stErr.message}`);
  }
}

async function run(dryRun: boolean): Promise<string> {
  const today = todayISO();

  const zones = await loadActiveZones(today);
  if (!zones.length) return `No active bin jobs with zones today (${today}).`;

  const { data: stateRows } = await supabase
    .from("geofence_visits")
    .select("job_id, device_id, inside, entered_at, exited_at")
    .in("job_id", zones.map((z) => z.jobId));
  const states = new Map<string, VisitState>(
    ((stateRows || []) as VisitState[]).map((s) => [s.job_id, s]),
  );

  await authenticate();
  const trails = await loadTodaysTrails(today);

  const actions = computeActions(zones, trails, dryRun ? new Map() : states, today);

  if (!dryRun) await applyActions(actions, zones);

  const detail = actions.map((a) => `${a.jobId} -> ${a.status} @ ${a.at}`).join(", ") || "none";
  return `${dryRun ? "DRY RUN — " : ""}${zones.length} zones, ${trails.size} devices, ${actions.length} actions: ${detail}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  try {
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dryRun === true;
    } catch (_) { /* empty body = live run */ }

    const message = await run(dryRun);
    return new Response(JSON.stringify({ ok: true, message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("geofence-events error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
