/**
 * Supabase Edge Function: snow-times-sync
 *
 * Builds the Snow Times snapshot (jwg_snow_events / jwg_snow_machines /
 * jwg_snow_visits) from MyGeotab history. Runs daily in winter from pg_cron; the
 * Snow Times view on the JWG Winter page reads the tables, never Geotab.
 *
 *   POST {}                              -> work out today's snow day and write it
 *   POST { date: "YYYY-MM-DD" }          -> the same for one named snow day
 *   POST { dates: ["YYYY-MM-DD", ...] }  -> several days in one go (backfill)
 *   POST { date, dryRun: true }          -> compute and report, write nothing
 *   POST { probe: true, from, to }       -> list the days a tractor went out
 *                                           between two dates, write nothing
 *
 * The rule is Jake's (2026-11-18): a snow event is a day the tractors go out.
 * Tractors only clear snow, so nobody has to label anything. Salt-only nights,
 * garbage pickup and everything else are left out. "Go out" means at least two
 * tractors each worked a winter site: checked against last winter, that keeps
 * the real nights (four or five tractors, 25 to 34 sites) and drops both the
 * autumn days the tractors are only driven to where they are kept (0 sites) and
 * a lone tractor touching up three lots. When there is an event, every
 * other vehicle that was out with the tractors and stopped at a winter site is
 * recorded too ("keep track of all vehicles that go out at the same time as the
 * tractors and the loader, roughly").
 *
 * A "snow day" D runs from 6 pm the evening before to 6 pm on D, Eastern, so a
 * run that starts before midnight and ends after it is one event, not two.
 *
 * The sites are the winter book's own list (jwg_service_locations with
 * has_winter_service). This function only READS them.
 *
 * Read-only against Geotab, like everything else here. About 4 Geotab calls a
 * run (sign in, devices, trips, one batched GPS pull), inside the 10/min quota.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

/** The five tractors, by Geotab device id (ids survive renames; names do not).
 *  On 2026-11-18 they were named TRACTOR 1 - MATT (bE), TRACTOR 2 - Brian (bF),
 *  TRACTOR 3 - CHRIS G (bC), TRACTOR 4 - DARRIN (bD), TRACTOR 5 - Andrew Boyd (bB). */
const TRACTORS = new Set(["bE", "bF", "bC", "bD", "bB"]);

/** The junk-removal fleet: five Hinos and the two vans. They are out every working
 *  morning on bin and junk runs, and one of the winter sites is a coffee shop, so
 *  without this a 7 am coffee stop on a snow morning would read as snow work. */
const JUNK_FLEET = new Set(["b3", "b4", "b5", "b6", "b10", "b7", "b2"]);

const TZ = "America/Toronto";
const DAY_STARTS_HOUR = 18;    // a snow day runs 6 pm to 6 pm
const YARD_M = 200;            // this close to the yard is "at the yard"
const TRACTOR_OUT_M = 500;     // a tractor that stops this far from the yard went out...
const TRACTOR_OUT_KM = 2;      // ...or one that covered this much ground
const SITE_M = 80;             // a GPS point this close to a site is at that site
const SAME_VISIT_MIN = 15;     // two spells at one site this close together are one visit
const MIN_VISIT_MIN = 3;       // under this is a drive-past, not a visit
const WINDOW_PAD_MIN = 60;     // others count if out within this of the tractors
const MIN_TRACTORS = 2;        // this many tractors working sites makes it an event

/** The Ottaway Ave / Davidson St yard, where everything parks. */
const YARD = [
  { lat: 44.40353, lon: -79.69292 },
  { lat: 44.40405, lon: -79.69155 },
  { lat: 44.40399, lon: -79.69106 },
];

/** Daily snowfall, Government of Canada climate stations (api.weather.gc.ca),
 *  nearest first. Shanty Bay is about 5 km from downtown but its records arrive
 *  weeks late; Orillia and Coldwater are current to within two days. Every run
 *  re-reads the last 45 days, so an event picks up the nearer station's figure
 *  once it is published. */
const STATIONS = [
  { id: "6117684", name: "Shanty Bay" },
  { id: "6115811", name: "Orillia" },
  { id: "6111769", name: "Coldwater" },
];
const SNOW_REFRESH_DAYS = 45;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SB_SECRET_KEY")!,
);

// ── geometry and clock ──

function metres(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function yardDistance(lat: number, lon: number): number {
  return Math.min(...YARD.map((y) => metres(lat, lon, y.lat, y.lon)));
}

function eastern(d: Date): { date: string; hour: number } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/** The instant a given Eastern wall-clock hour happens on a given date. */
function easternInstant(date: string, hour: number): Date {
  for (const offset of [4, 5]) {
    const d = new Date(Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`) + offset * 3600000);
    const e = eastern(d);
    if (e.date === date && e.hour === hour) return d;
  }
  throw new Error(`No Eastern ${hour}:00 on ${date}`);
}

/** Which snow day an instant belongs to: 6 pm onward counts toward tomorrow. */
function snowDayOf(t: Date): string {
  return eastern(new Date(t.getTime() + (24 - DAY_STARTS_HOUR) * 3600000)).date;
}

function dayWindow(date: string): { from: Date; to: Date } {
  return {
    from: easternInstant(addDays(date, -1), DAY_STARTS_HOUR),
    to: easternInstant(date, DAY_STARTS_HOUR),
  };
}

// ── Geotab ──

interface Trip {
  device: { id: string };
  start: string;
  stop: string;
  distance: number;
  stopPoint?: { x: number; y: number };
}

/** Geotab durations and distances: distance is in km. */
function tripWentOut(t: Trip): boolean {
  if (t.distance >= TRACTOR_OUT_KM) return true;
  return !!t.stopPoint && yardDistance(t.stopPoint.y, t.stopPoint.x) > TRACTOR_OUT_M;
}

async function deviceNames(): Promise<Map<string, string>> {
  const devices = await call("Get", { typeName: "Device" }) as { id: string; name: string }[];
  const missing = [...TRACTORS].filter((id) => !devices.some((d) => d.id === id));
  if (missing.length) {
    throw new Error(
      `Tractor device ids not in Geotab: ${missing.join(", ")}. Geotab holds: ` +
        devices.map((d) => `${d.id}=${d.name}`).join(", "),
    );
  }
  return new Map(devices.map((d) => [d.id, d.name]));
}

async function tripsBetween(from: Date, to: Date, deviceId?: string): Promise<Trip[]> {
  const search: Record<string, unknown> = { fromDate: from.toISOString(), toDate: to.toISOString() };
  if (deviceId) search.deviceSearch = { id: deviceId };
  const trips = await call("Get", { typeName: "Trip", search, resultsLimit: 50000 }) as Trip[];
  if (trips.length === 50000) throw new Error("Geotab trip pull hit its 50,000 limit; narrow the dates");
  return trips.filter((t) => t.start && t.stop && t.device?.id);
}

interface Fix { lat: number; lon: number; t: number }

/** GPS points for several machines in ONE Geotab call. */
async function gpsFor(ids: string[], from: Date, to: Date): Promise<Map<string, Fix[]>> {
  const calls = ids.map((id) => ({
    method: "Get",
    params: {
      typeName: "LogRecord",
      search: { deviceSearch: { id }, fromDate: from.toISOString(), toDate: to.toISOString() },
    },
  }));
  const res = await call("ExecuteMultiCall", { calls }) as
    { latitude: number; longitude: number; dateTime: string }[][];
  const out = new Map<string, Fix[]>();
  ids.forEach((id, i) => {
    out.set(
      id,
      res[i].map((r) => ({ lat: r.latitude, lon: r.longitude, t: Date.parse(r.dateTime) }))
        .filter((f) => f.lat !== 0 || f.lon !== 0)
        .sort((a, b) => a.t - b.t),
    );
  });
  return out;
}

// ── sites and visits ──

interface Site { id: string; lat: number; lon: number }

async function winterSites(): Promise<Site[]> {
  const { data, error } = await supabase
    .from("jwg_service_locations")
    .select("id,lat,lng")
    .eq("has_winter_service", true)
    .eq("is_archived", false)
    .not("lat", "is", null);
  if (error) throw new Error(`read jwg_service_locations: ${error.message}`);
  // The shop is in the winter book, but every machine parks there: a "visit" to
  // it says nothing, so it is the yard here and not a site.
  return (data ?? [])
    .map((r) => ({ id: r.id as string, lat: Number(r.lat), lon: Number(r.lng) }))
    .filter((s) => yardDistance(s.lat, s.lon) > YARD_M);
}

function siteAt(f: Fix, sites: Site[]): string | null {
  let hit: string | null = null, best = SITE_M;
  for (const s of sites) {
    const d = metres(f.lat, f.lon, s.lat, s.lon);
    if (d <= best) { best = d; hit = s.id; }
  }
  return hit;
}

interface Visit { site: string; arrive: number; depart: number; min: number }

/** Turn one machine's GPS trail into visits. A spell is an unbroken run of points
 *  at the same site. Spells at one site within 15 minutes of each other are one
 *  visit (a plow works a lot, pushes into the next one, comes back), and the
 *  time counted is the time actually spent there, not the whole span. */
function visitsFrom(fixes: Fix[], sites: Site[]): Visit[] {
  const spells: { site: string; arrive: number; depart: number }[] = [];
  let open: { site: string; arrive: number; depart: number } | null = null;
  for (const f of fixes) {
    const s = siteAt(f, sites);
    if (open && s === open.site) { open.depart = f.t; continue; }
    if (open) { spells.push(open); open = null; }
    if (s) open = { site: s, arrive: f.t, depart: f.t };
  }
  if (open) spells.push(open);

  const visits: Visit[] = [];
  const last = new Map<string, Visit>();
  for (const sp of spells) {
    const prev = last.get(sp.site);
    if (prev && sp.arrive - prev.depart <= SAME_VISIT_MIN * 60000) {
      prev.min += (sp.depart - sp.arrive) / 60000;
      prev.depart = sp.depart;
    } else {
      const v = { site: sp.site, arrive: sp.arrive, depart: sp.depart, min: (sp.depart - sp.arrive) / 60000 };
      visits.push(v);
      last.set(sp.site, v);
    }
  }
  return visits.filter((v) => v.min >= MIN_VISIT_MIN).sort((a, b) => a.arrive - b.arrive);
}

// ── snowfall ──

/** date -> { cm, station } for every date in the range that any station has
 *  reported, nearest station winning. */
async function snowfall(from: string, to: string): Promise<Map<string, { cm: number; station: string }>> {
  const out = new Map<string, { cm: number; station: string }>();
  for (const st of STATIONS) {
    const url = "https://api.weather.gc.ca/collections/climate-daily/items?f=json" +
      `&CLIMATE_IDENTIFIER=${st.id}&datetime=${from}%2000:00:00/${to}%2000:00:00` +
      "&limit=400&properties=LOCAL_DATE,TOTAL_SNOW";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather records HTTP ${res.status} for ${st.name}`);
    const json = await res.json() as
      { features: { properties: { LOCAL_DATE: string; TOTAL_SNOW: number | null } }[] };
    for (const f of json.features) {
      const date = f.properties.LOCAL_DATE.slice(0, 10);
      if (f.properties.TOTAL_SNOW === null || out.has(date)) continue;
      out.set(date, { cm: f.properties.TOTAL_SNOW, station: st.name });
    }
  }
  return out;
}

/** Snow for an event: what fell on the day and the day before, because a night
 *  run is clearing the evening's snow. Null until BOTH days are reported. */
function eventSnow(date: string, snow: Map<string, { cm: number; station: string }>) {
  const a = snow.get(addDays(date, -1)), b = snow.get(date);
  if (!a || !b) return { snow_cm: null, snow_station: null };
  return {
    snow_cm: Math.round((a.cm + b.cm) * 10) / 10,
    snow_station: a.station === b.station ? b.station : `${a.station} / ${b.station}`,
  };
}

async function refreshRecentSnow(today: string): Promise<number> {
  const since = addDays(today, -SNOW_REFRESH_DAYS);
  const { data, error } = await supabase
    .from("jwg_snow_events").select("event_date,snow_cm,snow_station").gte("event_date", since);
  if (error) throw new Error(`read jwg_snow_events: ${error.message}`);
  if (!data?.length) return 0;
  const snow = await snowfall(addDays(since, -1), today);
  let changed = 0;
  for (const ev of data) {
    const s = eventSnow(ev.event_date, snow);
    if (s.snow_cm === null) continue;
    if (Number(ev.snow_cm) === s.snow_cm && ev.snow_station === s.snow_station) continue;
    const up = await supabase.from("jwg_snow_events").update(s).eq("event_date", ev.event_date);
    if (up.error) throw new Error(`update snowfall ${ev.event_date}: ${up.error.message}`);
    changed++;
  }
  return changed;
}

// ── runs ──

/** Which days between two dates had a tractor moving. One Geotab call per tractor.
 *  Wider than the event rule on purpose: it is the list of days worth checking. */
async function probe(
  from: string, to: string, names: Map<string, string>,
): Promise<Record<string, unknown>> {
  const days = new Map<string, Map<string, number>>();
  for (const id of TRACTORS) {
    const trips = await tripsBetween(dayWindow(from).from, dayWindow(to).to, id);
    for (const t of trips) {
      if (!tripWentOut(t)) continue;
      const day = snowDayOf(new Date(t.start));
      if (!days.has(day)) days.set(day, new Map());
      const m = days.get(day)!;
      m.set(id, (m.get(id) ?? 0) + t.distance);
    }
  }
  return {
    probe: true,
    from, to,
    days: [...days.entries()].sort().map(([date, m]) => ({
      date,
      tractors: m.size,
      km: [...m.entries()].map(([id, km]) => `${names.get(id)}: ${Math.round(km)} km`),
    })),
  };
}

async function runDay(
  date: string, dryRun: boolean, names: Map<string, string>,
): Promise<Record<string, unknown>> {
  const win = dayWindow(date);
  const trips = await tripsBetween(win.from, win.to);

  const tractorTrips = trips.filter((t) => TRACTORS.has(t.device.id));
  const moved = new Set(tractorTrips.filter(tripWentOut).map((t) => t.device.id));

  const noEvent = async () => {
    if (!dryRun) {
      const del = await supabase.from("jwg_snow_events").delete().eq("event_date", date);
      if (del.error) throw new Error(`clear ${date}: ${del.error.message}`);
    }
    return { date, dryRun, event: false };
  };
  if (moved.size < MIN_TRACTORS) return await noEvent();

  // The event is the stretch the tractors were moving, with an hour either side.
  // Anything else out in that stretch is a candidate.
  const outTrips = tractorTrips.filter((t) => moved.has(t.device.id));
  const first = Math.min(...outTrips.map((t) => Date.parse(t.start)));
  const last = Math.max(...outTrips.map((t) => Date.parse(t.stop)));
  const from = new Date(Math.max(win.from.getTime(), first - WINDOW_PAD_MIN * 60000));
  const to = new Date(Math.min(win.to.getTime(), last + WINDOW_PAD_MIN * 60000));

  const inEvent = trips.filter((t) =>
    Date.parse(t.stop) >= from.getTime() && Date.parse(t.start) <= to.getTime()
  );
  const candidates = [...new Set(inEvent.map((t) => t.device.id))]
    .filter((id) => moved.has(id) || (!TRACTORS.has(id) && !JUNK_FLEET.has(id)));

  const sites = await winterSites();
  const gps = await gpsFor(candidates, from, to);

  const machines: Record<string, unknown>[] = [];
  const visitRows: Record<string, unknown>[] = [];
  for (const id of candidates) {
    const visits = visitsFrom(gps.get(id) ?? [], sites);
    // A machine is part of the event only if it worked a site.
    if (!visits.length) continue;
    const isTractor = TRACTORS.has(id);
    const mine = inEvent.filter((t) => t.device.id === id);
    machines.push({
      event_date: date,
      device_id: id,
      device_name: names.get(id) ?? id,
      is_tractor: isTractor,
      first_out: new Date(Math.min(...mine.map((t) => Date.parse(t.start)))).toISOString(),
      last_back: new Date(Math.max(...mine.map((t) => Date.parse(t.stop)))).toISOString(),
      km: Math.round(mine.reduce((a, t) => a + t.distance, 0) * 10) / 10,
    });
    for (const v of visits) {
      visitRows.push({
        event_date: date,
        device_id: id,
        location_id: v.site,
        arrive: new Date(v.arrive).toISOString(),
        depart: new Date(v.depart).toISOString(),
        dur_min: Math.round(v.min * 10) / 10,
      });
    }
  }

  const working = machines.filter((m) => m.is_tractor).length;
  if (working < MIN_TRACTORS) return await noEvent();

  const snow = eventSnow(date, await snowfall(addDays(date, -1), date));
  const eventRow = {
    event_date: date,
    first_out: new Date(first).toISOString(),
    last_back: new Date(last).toISOString(),
    tractors_out: working,
    ...snow,
    computed_at: new Date().toISOString(),
  };

  const summary = {
    date, dryRun, event: true,
    tractors_out: working,
    machines: machines.map((m) =>
      `${m.device_name}: ${visitRows.filter((v) => v.device_id === m.device_id).length} sites, ${m.km} km`
    ),
    sites_in_book: sites.length,
    sites_visited: new Set(visitRows.map((v) => v.location_id)).size,
    visits: visitRows.length,
    gps_points: [...gps.values()].reduce((a, f) => a + f.length, 0),
    ...snow,
  };
  if (dryRun) return summary;

  // Derived data: the day is rebuilt whole, so a re-run can never leave half of
  // an older answer behind. Machines and visits go with the event (cascade).
  const del = await supabase.from("jwg_snow_events").delete().eq("event_date", date);
  if (del.error) throw new Error(`clear ${date}: ${del.error.message}`);
  const insE = await supabase.from("jwg_snow_events").insert(eventRow);
  if (insE.error) throw new Error(`write jwg_snow_events: ${insE.error.message}`);
  const insM = await supabase.from("jwg_snow_machines").insert(machines);
  if (insM.error) throw new Error(`write jwg_snow_machines: ${insM.error.message}`);
  if (visitRows.length) {
    const insV = await supabase.from("jwg_snow_visits").insert(visitRows);
    if (insV.error) throw new Error(`write jwg_snow_visits: ${insV.error.message}`);
  }
  return summary;
}

/** Only the database calls this function (pg_cron). It sends the shared secret
 *  from public.cron_config in the x-cron-secret header; anyone else gets a 401. */
async function callerIsDatabase(req: Request): Promise<boolean> {
  const { data, error } = await supabase
    .from("cron_config").select("value").eq("key", "edge_secret").single();
  if (error) throw new Error(`cron_config read failed: ${error.message}`);
  return req.headers.get("x-cron-secret") === data.value;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    if (!(await callerIsDatabase(req))) return json({ ok: false, error: "unauthorized" }, 401);
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch (_) { /* empty body = today */ }

    await authenticate();
    const names = await deviceNames();

    if (body.probe === true) {
      if (typeof body.from !== "string" || typeof body.to !== "string") {
        throw new Error("probe needs from and to dates");
      }
      return json({ ok: true, ...(await probe(body.from, body.to, names)) }, 200);
    }

    const today = eastern(new Date()).date;
    const dates = Array.isArray(body.dates)
      ? body.dates.map(String)
      : [typeof body.date === "string" ? body.date : today];
    const dryRun = body.dryRun === true;
    const days: Record<string, unknown>[] = [];
    for (const d of dates) days.push(await runDay(d, dryRun, names));
    const snow_updated = dryRun ? 0 : await refreshRecentSnow(today);
    return json({ ok: true, days, snow_updated }, 200);
  } catch (err) {
    console.error("snow-times-sync error:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
