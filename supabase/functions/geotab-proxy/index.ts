/**
 * Supabase Edge Function: geotab-proxy
 *
 * Read-only proxy so the browser never sees Geotab credentials. Exposes just
 * what the Live Jobs map needs:
 *
 *   POST { action: "device-status" } -> { devices: [...] }
 *     Latest position for each whitelisted truck.
 *
 *   POST { action: "zones" } -> { zones: [...] }
 *     Every BIN_AUTO_ zone in the Bin Rentals group (polygon points + jobId).
 *
 *   POST { action: "trails" } -> { trails: [...] }
 *     Last TRAIL_WINDOW_MIN of GPS breadcrumbs per whitelisted truck, for the
 *     office TV to replay when it focuses a truck. History only — it says where a
 *     truck HAS BEEN, never where it's going (nothing links a truck to its job).
 *
 * Whitelist is constant DEFAULT_WHITELIST, overridable via env
 * GEOTAB_DEVICE_WHITELIST="Name 1,Name 2,...".
 *
 * TODO @jake: create a *read-only* MyGeotab service account (no zone write
 * scope) and put its creds in GEOTAB_READONLY_DATABASE/USERNAME/PASSWORD.
 * Right now this reuses the geofence-sync env vars (which have write scope) —
 * fine functionally but broader privilege than the proxy actually needs.
 */

import { authenticate, call, getOrCreateBinRentalsGroup, ZONE_PREFIX } from "../_shared/geotab-client.ts";

const DEFAULT_WHITELIST = [
  "Hino 2015",
  "Hino 2016",
  "Hino 2019",
  "Hino L7 2023",
  "Darrin Truck",
  "Furniture Bank Van",
];

function getWhitelist(): string[] {
  const env = Deno.env.get("GEOTAB_DEVICE_WHITELIST");
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return DEFAULT_WHITELIST;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ProxyDevice {
  id: string;
  name: string;
  lat: number;
  lng: number;
  speed: number;
  isDriving: boolean;
  bearing: number;
  lastUpdate: string;
}

interface ProxyZone {
  id: string;
  name: string;
  jobId: string;
  points: { lat: number; lng: number }[];
  activeFrom: string;
  activeTo: string;
}

interface ProxyTrail {
  id: string;
  name: string;
  points: [number, number][];   // [lat, lng], oldest -> newest
}

/**
 * How far back a trail reaches, and how many points survive thinning.
 *
 * 90 minutes is what the office TV replays per truck when it focuses one. The
 * point cap moves with the window on purpose: these two are one setting, not
 * two. At 500 points a 90-min trail samples roughly every 11s (~180 m at road
 * speed), which still traces the streets at the zoom a 90-min run frames to.
 * Leaving the cap at 250 would have sampled every ~22s and straight-lined the
 * corners.
 */
const TRAIL_WINDOW_MIN = 90;
const TRAIL_MAX_POINTS = 500;

async function handleDeviceStatus(): Promise<{ devices: ProxyDevice[] }> {
  const whitelist = new Set(getWhitelist());

  const allDevices = (await call("Get", { typeName: "Device" })) as Array<{
    id: string;
    name: string;
  }>;
  const allowed = allDevices.filter((d) => whitelist.has(d.name));
  if (allowed.length === 0) return { devices: [] };
  const allowedIds = new Set(allowed.map((d) => d.id));
  const nameById = new Map(allowed.map((d) => [d.id, d.name]));

  const statuses = (await call("Get", { typeName: "DeviceStatusInfo" })) as Array<{
    device: { id: string };
    latitude: number;
    longitude: number;
    speed: number;
    isDriving: boolean;
    bearing?: number;
    dateTime: string;
  }>;

  const devices: ProxyDevice[] = statuses
    .filter((s) => allowedIds.has(s.device.id))
    .map((s) => ({
      id: s.device.id,
      name: nameById.get(s.device.id) || s.device.id,
      lat: s.latitude,
      lng: s.longitude,
      speed: s.speed,
      isDriving: s.isDriving,
      bearing: s.bearing ?? 0,
      lastUpdate: s.dateTime,
    }));

  return { devices };
}

async function handleZones(groupId: string): Promise<{ zones: ProxyZone[] }> {
  const raw = (await call("Get", {
    typeName: "Zone",
    search: { groups: [{ id: groupId }] },
    resultsLimit: 5000,
  })) as Array<{
    id: string;
    name: string;
    externalReference?: string;
    points: { x: number; y: number }[];
    activeFrom: string;
    activeTo: string;
  }>;

  const zones: ProxyZone[] = raw
    .filter((z) => z.name.startsWith(ZONE_PREFIX))
    .map((z) => ({
      id: z.id,
      name: z.name,
      jobId: z.externalReference || z.name.slice(ZONE_PREFIX.length),
      points: (z.points || []).map((p) => ({ lat: p.y, lng: p.x })),
      activeFrom: z.activeFrom,
      activeTo: z.activeTo,
    }));

  return { zones };
}

/**
 * Rolling-window breadcrumbs per truck. One LogRecord call covers every device,
 * so this costs the same whether we have one truck or ten.
 *
 * Raw LogRecord is a point every few seconds — thousands per truck over the
 * window — so each trail is thinned to at most TRAIL_MAX_POINTS before it goes
 * over the wire. The newest point is always kept so the line meets the truck.
 *
 * Widening TRAIL_WINDOW_MIN has a second effect worth knowing: the TV frames the
 * map to the whole trail, so a longer window zooms the map OUT. And with the
 * point cap fixed, a longer window is sampled more coarsely, so the line starts
 * cutting corners. Raise TRAIL_MAX_POINTS alongside it.
 */
async function handleTrails(): Promise<{ trails: ProxyTrail[] }> {
  const whitelist = new Set(getWhitelist());
  const allDevices = (await call("Get", { typeName: "Device" })) as Array<{
    id: string;
    name: string;
  }>;
  const nameById = new Map(
    allDevices.filter((d) => whitelist.has(d.name)).map((d) => [d.id, d.name]),
  );
  if (nameById.size === 0) return { trails: [] };

  const now = Date.now();
  const records = (await call("Get", {
    typeName: "LogRecord",
    search: {
      fromDate: new Date(now - TRAIL_WINDOW_MIN * 60000).toISOString(),
      toDate: new Date(now).toISOString(),
    },
    resultsLimit: 30000,
  })) as Array<{
    device: { id: string };
    latitude: number;
    longitude: number;
    dateTime: string;
  }>;

  const byDevice = new Map<string, { lat: number; lng: number; t: number }[]>();
  for (const r of records || []) {
    const id = r.device?.id;
    if (!id || !nameById.has(id)) continue;
    if (typeof r.latitude !== "number" || typeof r.longitude !== "number") continue;
    if (!byDevice.has(id)) byDevice.set(id, []);
    byDevice.get(id)!.push({ lat: r.latitude, lng: r.longitude, t: Date.parse(r.dateTime) });
  }

  const trails: ProxyTrail[] = [];
  for (const [id, pts] of byDevice) {
    pts.sort((a, b) => a.t - b.t);
    const step = Math.ceil(pts.length / TRAIL_MAX_POINTS);
    const kept = step > 1 ? pts.filter((_, i) => i % step === 0) : pts.slice();
    const newest = pts[pts.length - 1];
    if (kept[kept.length - 1] !== newest) kept.push(newest);
    trails.push({
      id,
      name: nameById.get(id)!,
      points: kept.map((p) => [p.lat, p.lng] as [number, number]),
    });
  }
  return { trails };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { action } = body;
    if (!action) throw new Error("Missing 'action' in body");

    await authenticate();

    let payload: Record<string, unknown>;
    switch (action) {
      case "device-status":
        payload = await handleDeviceStatus();
        break;
      case "zones": {
        const groupId = await getOrCreateBinRentalsGroup();
        payload = await handleZones(groupId);
        break;
      }
      case "trails":
        payload = await handleTrails();
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ ok: true, ...payload }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("geotab-proxy error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
