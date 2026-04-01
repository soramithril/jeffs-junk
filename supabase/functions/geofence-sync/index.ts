/**
 * Supabase Edge Function: geofence-sync
 *
 * Manages Geotab geofences tied to the daily job list.
 *
 * Endpoints (POST body JSON):
 *   { action: "job-change", event: "INSERT"|"UPDATE"|"DELETE", job: {...} }
 *     -> Called by Supabase webhook on job table changes.
 *
 *   { action: "morning-sync" }
 *     -> Called by 6am cron. Creates today's zones, deletes stale ones.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authenticate,
  geocodeAddress,
  createZone,
  deleteZone,
  getOrCreateBinRentalsGroup,
  getAutoZones,
  ZONE_PREFIX,
} from "../_shared/geotab-client.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// --- Types ---

interface Job {
  job_id: string;
  service: string;
  status: string;
  date: string;
  address: string;
  city: string;
  bin_dropoff?: string;
  bin_pickup?: string;
}

interface GeofenceRow {
  job_id: string;
  zone_id: string;
  zone_name: string;
  address: string;
  lat: number;
  lng: number;
}

// --- Helpers ---

/** Get today's date in Eastern Time (Ontario) as YYYY-MM-DD. */
function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

function isActiveToday(job: Job): boolean {
  const today = todayISO();

  if (job.service === "Bin Rental") {
    // Active if today is the dropoff day OR the pickup day
    return job.bin_dropoff === today || job.bin_pickup === today;
  }

  // Junk removal / other services: active on the scheduled date
  return job.date === today;
}

function isTerminalStatus(status: string): boolean {
  return status === "Completed" || status === "Cancelled";
}

/**
 * Create a geofence for a single job. Geocodes the address, creates
 * the Geotab zone, and records the mapping in Supabase.
 */
async function createGeofenceForJob(job: Job, groupId: string): Promise<void> {
  const fullAddress = job.city ? `${job.address}, ${job.city}, ON` : `${job.address}, ON`;

  const { lat, lng } = await geocodeAddress(fullAddress);

  // Active window: job date midnight UTC to next day end UTC.
  // Generous window avoids EDT/EST edge cases. Morning sync handles cleanup.
  const jobDate = job.date || todayISO();
  const activeFrom = `${jobDate}T00:00:00Z`;
  const nextDay = new Date(jobDate + "T00:00:00Z");
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const activeTo = `${nextDay.toISOString().split("T")[0]}T23:59:59Z`;

  const zoneId = await createZone(job.job_id, lat, lng, groupId, activeFrom, activeTo);

  const row: GeofenceRow = {
    job_id: job.job_id,
    zone_id: zoneId,
    zone_name: `${ZONE_PREFIX}${job.job_id}`,
    address: fullAddress,
    lat,
    lng,
  };

  const { error } = await supabase.from("geofences").upsert(row, { onConflict: "job_id" });
  if (error) throw new Error(`Failed to save geofence record: ${error.message}`);

  console.log(`Created geofence ${row.zone_name} for job ${job.job_id}`);
}

/**
 * Delete the geofence for a job. Removes from Geotab and Supabase.
 */
async function deleteGeofenceForJob(jobId: string): Promise<void> {
  const { data, error } = await supabase
    .from("geofences")
    .select("zone_id, zone_name")
    .eq("job_id", jobId)
    .single();

  if (error || !data) {
    console.log(`No geofence found for job ${jobId}, skipping delete`);
    return;
  }

  await deleteZone(data.zone_id);

  const { error: delError } = await supabase.from("geofences").delete().eq("job_id", jobId);
  if (delError) throw new Error(`Failed to delete geofence record: ${delError.message}`);

  console.log(`Deleted geofence ${data.zone_name} for job ${jobId}`);
}

// --- Action handlers ---

/**
 * Handle a job table change event (INSERT, UPDATE, DELETE).
 */
async function handleJobChange(
  event: string,
  job: Job,
  groupId: string,
): Promise<string> {
  if (event === "DELETE") {
    await deleteGeofenceForJob(job.job_id);
    return `Deleted geofence for job ${job.job_id}`;
  }

  // If the job is completed/cancelled, remove its geofence
  if (isTerminalStatus(job.status)) {
    await deleteGeofenceForJob(job.job_id);
    return `Removed geofence for completed/cancelled job ${job.job_id}`;
  }

  // If the job is active today and has an address, ensure it has a geofence
  if (isActiveToday(job) && job.address) {
    // Check if geofence already exists
    const { data: existing } = await supabase
      .from("geofences")
      .select("zone_id")
      .eq("job_id", job.job_id)
      .single();

    if (existing) {
      // Address may have changed — delete old and recreate
      await deleteGeofenceForJob(job.job_id);
    }

    await createGeofenceForJob(job, groupId);
    return `Created/updated geofence for job ${job.job_id}`;
  }

  return `No geofence action needed for job ${job.job_id}`;
}

/**
 * Morning sync: create geofences for all of today's active jobs,
 * and clean up any stale zones from previous days.
 */
async function handleMorningSync(groupId: string): Promise<string> {
  const today = todayISO();
  const results: string[] = [];

  // 1. Get all of today's active jobs from Supabase
  const { data: todayJobs, error } = await supabase
    .from("jobs")
    .select("job_id, service, status, date, address, city, bin_dropoff, bin_pickup")
    .or(`date.eq.${today},bin_dropoff.eq.${today},bin_pickup.eq.${today}`)
    .not("status", "in", '("Completed","Cancelled")')
    .not("address", "is", null);

  if (error) throw new Error(`Failed to query today's jobs: ${error.message}`);

  // 2. Get existing geofence records from Supabase
  const { data: existingFences } = await supabase.from("geofences").select("job_id, zone_id");
  const existingByJobId = new Map((existingFences || []).map((f) => [f.job_id, f.zone_id]));

  // 3. Create geofences for today's jobs that don't have one yet
  const todayJobIds = new Set<string>();
  for (const job of todayJobs || []) {
    todayJobIds.add(job.job_id);

    if (!existingByJobId.has(job.job_id)) {
      await createGeofenceForJob(job as Job, groupId);
      results.push(`Created: ${ZONE_PREFIX}${job.job_id}`);
    }
  }

  // 4. Delete geofences that are no longer needed (job not active today)
  for (const [jobId, zoneId] of existingByJobId) {
    if (!todayJobIds.has(jobId)) {
      await deleteZone(zoneId);
      await supabase.from("geofences").delete().eq("job_id", jobId);
      results.push(`Cleaned up: ${ZONE_PREFIX}${jobId}`);
    }
  }

  // 5. Safety check: verify Geotab zones match our records
  //    Delete any orphaned BIN_AUTO_ zones in the Bin Rentals group
  const geotabZones = await getAutoZones(groupId);
  const trackedZoneIds = new Set(
    ((await supabase.from("geofences").select("zone_id")).data || []).map((f) => f.zone_id),
  );

  for (const zone of geotabZones) {
    if (!trackedZoneIds.has(zone.id)) {
      await deleteZone(zone.id);
      results.push(`Orphan removed: ${zone.name}`);
    }
  }

  return `Morning sync complete. ${results.length} actions: ${results.join(", ") || "none"}`;
}

/**
 * Nightly cleanup (10pm EDT): delete all geofences for the day.
 * Morning sync will recreate tomorrow's as needed.
 */
async function handleNightlyCleanup(groupId: string): Promise<string> {
  const results: string[] = [];

  const { data: allFences } = await supabase.from("geofences").select("job_id, zone_id, zone_name");

  for (const fence of allFences || []) {
    await deleteZone(fence.zone_id);
    await supabase.from("geofences").delete().eq("job_id", fence.job_id);
    results.push(`Deleted: ${fence.zone_name}`);
  }

  // Safety: clean up any orphaned BIN_AUTO_ zones in Geotab
  const geotabZones = await getAutoZones(groupId);
  for (const zone of geotabZones) {
    await deleteZone(zone.id);
    results.push(`Orphan removed: ${zone.name}`);
  }

  return `Nightly cleanup complete. ${results.length} zones removed: ${results.join(", ") || "none"}`;
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (!action) {
      throw new Error("Missing 'action' in request body");
    }

    // Authenticate with Geotab (once per invocation)
    await authenticate();
    const groupId = await getOrCreateBinRentalsGroup();

    let message: string;

    switch (action) {
      case "job-change": {
        const { event, job } = body;
        if (!event || !job) throw new Error("job-change requires 'event' and 'job' fields");
        message = await handleJobChange(event, job as Job, groupId);
        break;
      }

      case "morning-sync": {
        message = await handleMorningSync(groupId);
        break;
      }

      case "nightly-cleanup": {
        message = await handleNightlyCleanup(groupId);
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ ok: true, message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("geofence-sync error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
