/**
 * Geotab API client for zone (geofence) management.
 * Uses JSON-RPC over HTTPS. Authenticates once per session.
 */

const GEOTAB_AUTH_URL = "https://my.geotab.com/apiv1";
const ZONE_PREFIX = "BIN_AUTO_";
const ZONE_RADIUS_METERS = 25;
const CIRCLE_POINTS = 24; // polygon vertices to approximate a circle

interface GeotabCredentials {
  database: string;
  userName: string;
  sessionId: string;
}

interface Coordinate {
  x: number; // longitude
  y: number; // latitude
}

interface GeotabZone {
  id?: string;
  name: string;
  points: Coordinate[];
  groups: { id: string }[];
  zoneTypes: { id: string }[];
  externalReference: string;
  activeFrom: string;
  activeTo: string;
  displayed: boolean;
  mustIdentifyStops: boolean;
  fillColor: { r: number; g: number; b: number; a: number };
  comment: string;
}

interface AuthResult {
  credentials: GeotabCredentials;
  path: string;
}

// --- Authentication ---

let _credentials: GeotabCredentials | null = null;
let _serverUrl: string = GEOTAB_AUTH_URL;

export async function authenticate(): Promise<void> {
  const database = Deno.env.get("GEOTAB_DATABASE");
  const userName = Deno.env.get("GEOTAB_USERNAME");
  const password = Deno.env.get("GEOTAB_PASSWORD");

  if (!database || !userName || !password) {
    throw new Error("Missing GEOTAB_DATABASE, GEOTAB_USERNAME, or GEOTAB_PASSWORD env vars");
  }

  const res = await rpc(GEOTAB_AUTH_URL, "Authenticate", {
    database,
    userName,
    password,
  });

  const auth = res as AuthResult;
  _credentials = auth.credentials;

  // Use the server path returned by Geotab for subsequent calls
  if (auth.path && auth.path !== "ThisServer") {
    _serverUrl = `https://${auth.path}/apiv1`;
  }
}

function getCredentials(): GeotabCredentials {
  if (!_credentials) throw new Error("Not authenticated. Call authenticate() first.");
  return _credentials;
}

// --- Low-level JSON-RPC ---

async function rpc(url: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  const body = JSON.stringify({ id: 0, method, params });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Geotab HTTP ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();

  if (json.error) {
    throw new Error(`Geotab API error: ${JSON.stringify(json.error)}`);
  }

  return json.result;
}

export async function call(method: string, params: Record<string, unknown>): Promise<unknown> {
  return rpc(_serverUrl, method, { ...params, credentials: getCredentials() });
}

// --- Group management ---

/**
 * Get or create the "Bin Rentals" group in Geotab.
 * Returns the group ID.
 */
export async function getOrCreateBinRentalsGroup(): Promise<string> {
  const groups = (await call("Get", {
    typeName: "Group",
    search: { name: "Bin Rentals" },
  })) as { id: string; name: string }[];

  if (groups.length > 0) return groups[0].id;

  // Create the group under the company root
  const id = await call("Add", {
    typeName: "Group",
    entity: {
      name: "Bin Rentals",
      parent: { id: "GroupCompanyId" },
    },
  });

  return id as string;
}

// --- Geocoding ---

/**
 * Geocode an address using Geotab's built-in GetCoordinates API.
 * Returns { lat, lng }.
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
  const results = (await call("GetCoordinates", {
    addresses: [address],
  })) as Coordinate[];

  if (!results || results.length === 0 || (results[0].x === 0 && results[0].y === 0)) {
    throw new Error(`Geotab geocoding failed for address: "${address}"`);
  }

  return { lat: results[0].y, lng: results[0].x };
}

// --- Zone CRUD ---

/**
 * Build a circular polygon (approximated) around a center point.
 */
function buildCirclePoints(lat: number, lng: number, radiusMeters: number): Coordinate[] {
  const points: Coordinate[] = [];
  const earthRadius = 6371000; // meters
  const latRad = (lat * Math.PI) / 180;

  for (let i = 0; i <= CIRCLE_POINTS; i++) {
    const angle = (2 * Math.PI * i) / CIRCLE_POINTS;
    const dLat = (radiusMeters * Math.cos(angle)) / earthRadius;
    const dLng = (radiusMeters * Math.sin(angle)) / (earthRadius * Math.cos(latRad));

    points.push({
      x: lng + (dLng * 180) / Math.PI,
      y: lat + (dLat * 180) / Math.PI,
    });
  }

  return points;
}

/**
 * Get zones with an exact name match inside the Bin Rentals group.
 * Used for idempotent zone creation and same-name de-dup in the daily sweep.
 */
export async function getZonesByName(
  name: string,
  groupId: string,
): Promise<{ id: string; name: string; activeTo: string }[]> {
  const zones = (await call("Get", {
    typeName: "Zone",
    search: { groups: [{ id: groupId }], name },
    resultsLimit: 100,
  })) as { id: string; name: string; activeTo: string }[];
  // Defense-in-depth: Geotab name search has historically been loose; enforce exact match.
  return zones.filter((z) => z.name === name);
}

/**
 * Create a geofence zone in Geotab for a job (idempotent).
 *
 * Race protection: if one or more zones with the same name already exist in the
 * Bin Rentals group (e.g. a duplicate webhook fired before our Supabase row was
 * upserted), keep the first, remove the rest, and return the first one's id
 * instead of creating a new one.
 *
 * Returns the Geotab zone ID (existing or new).
 */
export async function createZone(
  jobId: string,
  lat: number,
  lng: number,
  groupId: string,
  activeFrom: string,
  activeTo: string,
): Promise<string> {
  const zoneName = `${ZONE_PREFIX}${jobId}`;

  const existing = await getZonesByName(zoneName, groupId);
  if (existing.length > 0) {
    for (let i = 1; i < existing.length; i++) {
      await deleteZone(existing[i].id);
    }
    return existing[0].id;
  }

  const zone: GeotabZone = {
    name: zoneName,
    points: buildCirclePoints(lat, lng, ZONE_RADIUS_METERS),
    groups: [{ id: groupId }],
    zoneTypes: [{ id: "ZoneTypeCustomerId" }],
    externalReference: jobId,
    activeFrom,
    activeTo,
    displayed: true,
    mustIdentifyStops: true,
    fillColor: { r: 255, g: 165, b: 0, a: 80 },
    comment: `Auto-created for job ${jobId}`,
  };

  const zoneId = await call("Add", { typeName: "Zone", entity: zone });
  return zoneId as string;
}

/**
 * Delete a geofence zone from Geotab by its zone ID.
 */
export async function deleteZone(zoneId: string): Promise<void> {
  await call("Remove", { typeName: "Zone", entity: { id: zoneId } });
}

/**
 * Delete many zones in MultiCall batches — one API request per 150 zones, so
 * bulk cleanups fit inside Geotab's 10-calls-per-minute quota. A failed chunk
 * is logged and skipped so the rest still go through. Returns zones submitted.
 */
export async function removeZonesBulk(zoneIds: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < zoneIds.length; i += 150) {
    const chunk = zoneIds.slice(i, i + 150);
    const calls = chunk.map((id) => ({ method: "Remove", params: { typeName: "Zone", entity: { id } } }));
    try {
      await call("ExecuteMultiCall", { calls });
      removed += chunk.length;
    } catch (err) {
      console.error(`Bulk zone remove failed for chunk at ${i}: ${(err as Error).message}`);
    }
  }
  return removed;
}

/**
 * Get all BIN_AUTO_ zones that belong to the Bin Rentals group.
 * Returns zones matching BOTH conditions (prefix + group).
 *
 * resultsLimit is bumped high because Geotab's default page size has
 * silently truncated responses in the past, letting orphans accumulate.
 */
export async function getAutoZones(
  groupId: string,
): Promise<{ id: string; name: string; activeTo: string }[]> {
  const zones = (await call("Get", {
    typeName: "Zone",
    search: { groups: [{ id: groupId }] },
    resultsLimit: 50000,
  })) as { id: string; name: string; activeTo: string }[];

  // Filter to only BIN_AUTO_ prefixed zones (defense in depth)
  return zones.filter((z) => z.name.startsWith(ZONE_PREFIX));
}

export { ZONE_PREFIX };
