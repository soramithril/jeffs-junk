/**
 * Supabase Edge Function: geofence-events
 *
 * Polls Geotab GetFeed for ExceptionEvents on BIN_AUTO_ zones.
 * When a vehicle enters or exits a zone, updates the job's bin_instatus
 * in Supabase. The dashboard picks this up via Realtime subscriptions.
 *
 * Called every 2 minutes by pg_cron.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEOTAB_AUTH_URL = "https://my.geotab.com/apiv1";
const ZONE_PREFIX = "BIN_AUTO_";

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

interface ExceptionEvent {
  id: string;
  rule: { id: string; name?: string };
  device: { id: string; name?: string };
  activeFrom: string;
  activeTo: string;
  state: string;
}

interface ZoneInfo {
  id: string;
  name: string;
}

/**
 * Poll Geotab for new ExceptionEvents (zone stops).
 */
async function pollExceptionEvents(fromVersion: string): Promise<{ events: ExceptionEvent[]; toVersion: string }> {
  const result = await geotabCall("GetFeed", {
    typeName: "ExceptionEvent",
    fromVersion,
    resultsLimit: 1000,
  }) as { data: ExceptionEvent[]; toVersion: string };

  return { events: result.data || [], toVersion: result.toVersion };
}

/**
 * Look up a Geotab Rule to find the zone it's associated with.
 */
async function getRuleZone(ruleId: string): Promise<string | null> {
  const rules = await geotabCall("Get", {
    typeName: "Rule",
    search: { id: ruleId },
  }) as { id: string; name: string; baseType: string; condition: { zone?: { id: string }; children?: { zone?: { id: string } }[] } }[];

  if (!rules || rules.length === 0) return null;

  const rule = rules[0];
  if (rule.condition?.zone?.id) return rule.condition.zone.id;
  if (rule.condition?.children) {
    for (const child of rule.condition.children) {
      if (child.zone?.id) return child.zone.id;
    }
  }
  return null;
}

/**
 * Look up a zone by ID to check if it's a BIN_AUTO_ zone.
 */
async function getZone(zoneId: string): Promise<ZoneInfo | null> {
  const zones = await geotabCall("Get", {
    typeName: "Zone",
    search: { id: zoneId },
  }) as ZoneInfo[];

  if (!zones || zones.length === 0) return null;
  return zones[0];
}

function extractJobId(zoneName: string): string {
  return zoneName.slice(ZONE_PREFIX.length);
}

/**
 * Determine bin_instatus based on whether the vehicle is still in the zone.
 * - Event active (activeTo far future) = vehicle in zone = "dropped"
 * - Event ended (activeTo in past) = vehicle left zone = "pickedup"
 */
function determineStatus(event: ExceptionEvent): "dropped" | "pickedup" {
  const activeTo = new Date(event.activeTo);
  const maxDate = new Date("2050-01-01");

  if (activeTo < maxDate && activeTo <= new Date()) {
    return "pickedup";
  }
  return "dropped";
}

async function processEvents(): Promise<string> {
  const { data: stateRow } = await supabase
    .from("geofence_poll_state")
    .select("value")
    .eq("key", "feed_version")
    .single();

  const fromVersion = stateRow?.value || "0000000000000000";

  const { events, toVersion } = await pollExceptionEvents(fromVersion);

  await supabase
    .from("geofence_poll_state")
    .update({ value: toVersion })
    .eq("key", "feed_version");

  if (events.length === 0) {
    return `No new events. Version: ${toVersion}`;
  }

  const updates: string[] = [];
  const zoneCache = new Map<string, ZoneInfo | null>();
  const ruleZoneCache = new Map<string, string | null>();

  for (const event of events) {
    let zoneId = ruleZoneCache.get(event.rule.id);
    if (zoneId === undefined) {
      zoneId = await getRuleZone(event.rule.id);
      ruleZoneCache.set(event.rule.id, zoneId);
    }
    if (!zoneId) continue;

    let zone = zoneCache.get(zoneId);
    if (zone === undefined) {
      zone = await getZone(zoneId);
      zoneCache.set(zoneId, zone);
    }
    if (!zone || !zone.name.startsWith(ZONE_PREFIX)) continue;

    const jobId = extractJobId(zone.name);
    const newStatus = determineStatus(event);

    // Fetch current job to check if status actually changed
    const { data: currentJob } = await supabase
      .from("jobs")
      .select("bin_instatus, customer_name, bin_bid, address, city")
      .eq("job_id", jobId)
      .single();

    if (currentJob?.bin_instatus === newStatus) continue;

    const { error } = await supabase
      .from("jobs")
      .update({ bin_instatus: newStatus })
      .eq("job_id", jobId);

    if (error) {
      console.error(`Failed to update job ${jobId}: ${error.message}`);
      continue;
    }

    // Log notification for dashboard history
    await supabase.from("geofence_notifications").insert({
      job_id: jobId,
      status: newStatus,
      customer_name: currentJob?.customer_name || null,
      bin_bid: currentJob?.bin_bid || null,
      address: currentJob?.address || null,
      city: currentJob?.city || null,
    });

    updates.push(`${jobId} -> ${newStatus}`);
    console.log(`Updated job ${jobId} bin_instatus to ${newStatus}`);
  }

  return `Processed ${events.length} events, ${updates.length} job updates: ${updates.join(", ") || "none matched BIN_AUTO_ zones"}`;
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    await authenticate();
    const message = await processEvents();

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
