/**
 * Supabase Edge Function: cut-times-sync
 *
 * Rebuilds the Cut Times snapshot (jwg_cut_locations / jwg_cut_visits) from
 * MyGeotab trip history. Runs weekly from pg_cron; the Cut Times view on the JWG
 * Summer page reads the tables, never Geotab.
 *
 *   POST {}                        -> rebuild and write
 *   POST { dryRun: true }          -> compute and report, write nothing
 *   POST { toDate: "YYYY-MM-DD" }  -> end the window early, for checking a
 *                                     rebuild against a known baseline
 *
 * It rebuilds the WHOLE season every run rather than appending the new week.
 * The snapshot is derived data, so a full recompute can never drift from the raw
 * trips, and cluster ids cannot wander (Jake's call, 2026-07-28). One Geotab
 * call for the trips plus at most one geocode call; well inside the 10-calls/min
 * quota.
 *
 * Method and thresholds come from docs/cut-times/SPEC.md, which is local-only —
 * the raw pull is customer addresses plus one employee's movements and the repo
 * is public. The rules are restated here so this file stands alone.
 *
 * Sanity check for any change to this file — over May 25 to Jul 24 2026 it must
 * still produce 333 cuts, 50 locations, 44 min average, 243.9 h, 6 flagged.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Geotab auth, inlined the same way geofence-events does it — this needs three
// calls, not the whole zone-management client in _shared/geotab-client.ts.
const GEOTAB_AUTH_URL = "https://my.geotab.com/apiv1";
let _credentials: Record<string, unknown> | null = null;
let _serverUrl = GEOTAB_AUTH_URL;

async function rpc(url: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 0, method, params }),
  });
  if (!res.ok) throw new Error(`Geotab HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.error) throw new Error(`Geotab API error: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function authenticate(): Promise<void> {
  const database = Deno.env.get("GEOTAB_DATABASE");
  const userName = Deno.env.get("GEOTAB_USERNAME");
  const password = Deno.env.get("GEOTAB_PASSWORD");
  if (!database || !userName || !password) {
    throw new Error("Missing GEOTAB_DATABASE, GEOTAB_USERNAME, or GEOTAB_PASSWORD env vars");
  }
  const auth = await rpc(GEOTAB_AUTH_URL, "Authenticate", { database, userName, password }) as
    { credentials: Record<string, unknown>; path: string };
  _credentials = auth.credentials;
  if (auth.path && auth.path !== "ThisServer") _serverUrl = `https://${auth.path}/apiv1`;
}

function call(method: string, params: Record<string, unknown>): Promise<unknown> {
  if (!_credentials) throw new Error("Not authenticated");
  return rpc(_serverUrl, method, { ...params, credentials: _credentials });
}

/** The device name in Geotab has a TRAILING SPACE. Name search is unreliable,
 *  so every device is fetched and matched exactly. */
const DEVICE_NAME = "Darrin Truck ";
const SEASON_START = "2026-05-25";

const CLUSTER_M = 120;        // stop points this close are the same location
const HOME_BASE_M = 150;      // this close to an Ottaway Ave pin is the yard
const QUICK_STOP_MIN = 15;    // under this is a gas/coffee/drop-off stop
const LONG_PARK_MIN = 360;    // over this, away from the yard, is an overnight
const FLAG_RATIO = 1.5;       // "ran long" = over 1.5x the location average...
const FLAG_MIN_OVER = 30;     // ...AND at least this many minutes over it...
const FLAG_MIN_VISITS = 3;    // ...at locations with at least this many visits
const TZ = "America/Toronto"; // times are shown in Eastern

/** The truck parks overnight at the Ottaway Ave yard. */
const HOME_BASE = [
  { lat: 44.40353, lon: -79.69292 },
  { lat: 44.40405, lon: -79.69155 },
];

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface Stop { lat: number; lon: number; arrive: Date; depart: Date }
interface Visit extends Stop { cl: number; durMin: number; type: string }
interface Cluster {
  cl: number; lat: number; lon: number; n: number; address: string;
  /** Set when this cluster came from a location already in the table. Those keep
   *  their id and their centroid never moves, so the locations you have already
   *  checked stay exactly as they are. */
  knownCl: number | null;
}
interface KnownLoc { cl: number; address: string; lat: number; lon: number }

// ── geometry ──

function metres(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function atHomeBase(lat: number, lon: number): boolean {
  return HOME_BASE.some((h) => metres(lat, lon, h.lat, h.lon) <= HOME_BASE_M);
}

// ── Eastern wall clock ──

function easternParts(d: Date): { date: string; day: string; time: string } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    day: p.weekday,
    time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`,
  };
}

// ── Geotab ──

async function findDevice(): Promise<string> {
  const devices = await call("Get", { typeName: "Device" }) as { id: string; name: string }[];
  const hit = devices.find((d) => d.name === DEVICE_NAME);
  if (!hit) {
    throw new Error(
      `Geotab device ${JSON.stringify(DEVICE_NAME)} not found among ${devices.length} devices`,
    );
  }
  return hit.id;
}

interface GeotabTrip {
  stop: string;
  nextTripStart?: string;
  stopPoint?: { x: number; y: number };
}

/** One stop event per trip: where it stopped, when it arrived, when it left.
 *  A trip with no nextTripStart is the truck's current stop — it has not left
 *  yet, so there is no visit to measure and it is left for the next run. */
async function fetchStops(deviceId: string, toDate: string): Promise<Stop[]> {
  const trips = await call("Get", {
    typeName: "Trip",
    search: { deviceSearch: { id: deviceId }, fromDate: SEASON_START, toDate },
    resultsLimit: 10000,
  }) as GeotabTrip[];

  const stops: Stop[] = [];
  for (const t of trips) {
    if (!t.stopPoint || !t.stop || !t.nextTripStart) continue;
    stops.push({
      lat: t.stopPoint.y,
      lon: t.stopPoint.x,
      arrive: new Date(t.stop),
      depart: new Date(t.nextTripStart),
    });
  }
  stops.sort((a, b) => a.arrive.getTime() - b.arrive.getTime());
  return stops;
}

async function geocode(pts: { lat: number; lon: number }[]): Promise<string[]> {
  if (!pts.length) return [];
  const res = await call("GetAddresses", {
    coordinates: pts.map((p) => ({ x: p.lon, y: p.lat })),
  }) as { formattedAddress: string }[];
  return res.map((r) => r.formattedAddress);
}

// ── analysis ──

/** Greedy 120 m clustering in time order, seeded with the locations already in
 *  the table.
 *
 *  Seeding matters: 660 Bayview Dr Unit 5 and 131 Saunders Rd are two real,
 *  separate sites 103.6 m apart — inside the 120 m rule — so a from-scratch pass
 *  merges them and the location count drops by one. Starting from the known
 *  list keeps sites that have already been eyeballed exactly as they are, and
 *  keeps their ids stable week to week. Only genuinely new ground makes a new
 *  cluster. */
function clusterStops(stops: Stop[], seeds: KnownLoc[]): { clusters: Cluster[]; of: number[] } {
  const clusters: Cluster[] = seeds.map((s, i) => ({
    cl: i, lat: Number(s.lat), lon: Number(s.lon), n: 1,
    address: s.address, knownCl: s.cl,
  }));
  const of: number[] = [];
  for (const s of stops) {
    let hit = -1, best = CLUSTER_M;
    for (let i = 0; i < clusters.length; i++) {
      const d = metres(s.lat, s.lon, clusters[i].lat, clusters[i].lon);
      if (d <= best) { best = d; hit = i; }
    }
    if (hit === -1) {
      clusters.push({
        cl: clusters.length, lat: s.lat, lon: s.lon, n: 1, address: "", knownCl: null,
      });
      hit = clusters.length - 1;
    } else {
      const c = clusters[hit];
      // A known site sits where it sits; only new clusters drift to their mean.
      if (c.knownCl === null) {
        c.lat = (c.lat * c.n + s.lat) / (c.n + 1);
        c.lon = (c.lon * c.n + s.lon) / (c.n + 1);
        c.n++;
      }
    }
    of.push(hit);
  }
  return { clusters, of };
}

/** Back-to-back stops at the same location are one visit — first arrival to
 *  last departure. This is the truck working its way down a street mid-cut. */
function mergeVisits(stops: Stop[], of: number[]): Visit[] {
  const visits: Visit[] = [];
  for (let i = 0; i < stops.length; i++) {
    const last = visits[visits.length - 1];
    if (last && last.cl === of[i]) {
      last.depart = stops[i].depart;
    } else {
      visits.push({ ...stops[i], cl: of[i], durMin: 0, type: "" });
    }
  }
  for (const v of visits) {
    v.durMin = Math.round(((v.depart.getTime() - v.arrive.getTime()) / 60000) * 10) / 10;
    v.type = atHomeBase(v.lat, v.lon)
      ? "home_base"
      : v.durMin < QUICK_STOP_MIN
      ? "quick_stop"
      : v.durMin > LONG_PARK_MIN
      ? "long_park"
      : "job_visit";
  }
  return visits;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

interface LocStat {
  cl: number; lat: number; lon: number; address: string; visits: number;
  avg: number; median: number; min: number; max: number; total_hrs: number; flagged: number;
}

/** A location is a cluster with at least one cut. Averages count cuts only —
 *  quick stops, the yard and overnight parks stay out of them. */
function summarise(visits: Visit[], clusters: Cluster[]): LocStat[] {
  const byCl = new Map<number, number[]>();
  for (const v of visits) {
    if (v.type !== "job_visit") continue;
    if (!byCl.has(v.cl)) byCl.set(v.cl, []);
    byCl.get(v.cl)!.push(v.durMin);
  }
  const stats: LocStat[] = [];
  for (const [cl, mins] of byCl) {
    const c = clusters[cl];
    const avg = mins.reduce((a, b) => a + b, 0) / mins.length;
    stats.push({
      cl, lat: c.lat, lon: c.lon, address: c.address, visits: mins.length,
      avg: r1(avg), median: r1(median(mins)), min: r1(Math.min(...mins)),
      max: r1(Math.max(...mins)), total_hrs: r2(mins.reduce((a, b) => a + b, 0) / 60),
      flagged: 0,
    });
  }
  return stats.sort((a, b) => b.visits - a.visits);
}

function applyFlags(visits: Visit[], stats: LocStat[]): Set<Visit> {
  const byCl = new Map(stats.map((s) => [s.cl, s]));
  const flagged = new Set<Visit>();
  for (const v of visits) {
    if (v.type !== "job_visit") continue;
    const s = byCl.get(v.cl);
    if (!s || s.visits < FLAG_MIN_VISITS) continue;
    if (v.durMin > s.avg * FLAG_RATIO && v.durMin - s.avg >= FLAG_MIN_OVER) {
      flagged.add(v);
      s.flagged++;
    }
  }
  return flagged;
}

// ── run ──

async function run(dryRun: boolean, endDate?: string): Promise<Record<string, unknown>> {
  await authenticate();
  const deviceId = await findDevice();
  const today = endDate ?? new Date().toISOString().slice(0, 10);
  const stops = await fetchStops(deviceId, today);
  if (!stops.length) throw new Error("Geotab returned no usable trips for the season");

  const { data: known, error: knownErr } = await supabase
    .from("jwg_cut_locations").select("cl,address,lat,lon");
  if (knownErr) throw new Error(`read jwg_cut_locations: ${knownErr.message}`);
  const seeds = (known ?? []) as KnownLoc[];

  const { clusters, of } = clusterStops(stops, seeds);
  const visits = mergeVisits(stops, of);

  // Known sites keep their id and address. Everything else — new ground, the
  // yard, quick stops — gets a fresh id and one geocode so it has an address to
  // show.
  const remap = new Map<number, number>();
  const needGeocode: Cluster[] = [];
  let nextId = Math.max(0, ...seeds.map((k) => k.cl)) + 1;
  for (const c of clusters) {
    if (c.knownCl !== null) {
      remap.set(c.cl, c.knownCl);
    } else {
      remap.set(c.cl, nextId++);
      needGeocode.push(c);
    }
  }
  const fresh = await geocode(needGeocode);
  needGeocode.forEach((c, i) => { c.address = fresh[i] ?? ""; });

  const stats = summarise(visits, clusters);
  const flagged = applyFlags(visits, stats);
  const addressOf = new Map(clusters.map((c) => [c.cl, c.address]));
  const locRows = stats.map((s) => ({
    cl: remap.get(s.cl)!, address: s.address, lat: s.lat, lon: s.lon,
    visits: s.visits, avg_min: s.avg, median_min: s.median, min_min: s.min,
    max_min: s.max, total_hrs: s.total_hrs, flagged: s.flagged,
  }));

  const visitRows = visits.map((v) => {
    const p = easternParts(v.arrive);
    return {
      cl: remap.get(v.cl) ?? v.cl,
      address: addressOf.get(v.cl) ?? "",
      type: v.type,
      visit_date: p.date,
      day: p.day,
      arrive: p.time,
      depart: easternParts(v.depart).time,
      dur_min: v.durMin,
      flag: flagged.has(v),
    };
  });

  const cuts = visits.filter((v) => v.type === "job_visit");
  const summary = {
    dryRun,
    window: `${SEASON_START} to ${today}`,
    cuts: cuts.length,
    locations: locRows.length,
    avg_min: Math.round(cuts.reduce((a, v) => a + v.durMin, 0) / cuts.length),
    total_hrs: r1(cuts.reduce((a, v) => a + v.durMin, 0) / 60),
    flagged: flagged.size,
    overnight_away: visits.filter((v) => v.type === "long_park").length,
    quick_stops: visits.filter((v) => v.type === "quick_stop").length,
    new_locations: needGeocode.length,
  };
  if (dryRun) return summary;

  const del1 = await supabase.from("jwg_cut_visits").delete().gte("id", 0);
  if (del1.error) throw new Error(`clear jwg_cut_visits: ${del1.error.message}`);
  const del2 = await supabase.from("jwg_cut_locations").delete().gte("cl", 0);
  if (del2.error) throw new Error(`clear jwg_cut_locations: ${del2.error.message}`);

  const insL = await supabase.from("jwg_cut_locations").insert(locRows);
  if (insL.error) throw new Error(`write jwg_cut_locations: ${insL.error.message}`);
  for (let i = 0; i < visitRows.length; i += 500) {
    const insV = await supabase.from("jwg_cut_visits").insert(visitRows.slice(i, i + 500));
    if (insV.error) throw new Error(`write jwg_cut_visits: ${insV.error.message}`);
  }
  return summary;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    let dryRun = false;
    let toDate: string | undefined;
    try {
      const body = await req.json();
      dryRun = body?.dryRun === true;
      if (typeof body?.toDate === "string") toDate = body.toDate;
    } catch (_) { /* empty body = live run */ }
    const summary = await run(dryRun, toDate);
    return new Response(JSON.stringify({ ok: true, ...summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("cut-times-sync error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
