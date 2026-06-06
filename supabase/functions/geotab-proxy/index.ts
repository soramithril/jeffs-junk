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
