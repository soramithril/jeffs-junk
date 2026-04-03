/**
 * Supabase Edge Function: vehicle-telemetry
 *
 * Polls Geotab for:
 *   1. Odometer readings → vehicle_odometers table → checks maintenance_schedules
 *   2. Driver safety/efficiency data → driver_scores table
 *
 * Called every 6 hours by pg_cron.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, call as geotabCall } from "../_shared/geotab-client.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ── Helpers ──

function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

// Flexible vehicle matching: exact first, then normalized words overlap
function matchVehicle(geotabName: string, vehicles: { vid: string; name: string }[]): { vid: string; name: string } | undefined {
  const gn = geotabName.toLowerCase().trim();
  // Exact match first
  const exact = vehicles.find(v => v.name.toLowerCase().trim() === gn);
  if (exact) return exact;
  // Normalize: extract meaningful words (letters/digits), ignore short words
  const gWords = gn.replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 2);
  let bestMatch: { vid: string; name: string } | undefined;
  let bestScore = 0;
  for (const v of vehicles) {
    const vn = v.name.toLowerCase().trim();
    const vWords = vn.replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 2);
    // Count overlapping words
    const overlap = gWords.filter(w => vWords.some(vw => vw.includes(w) || w.includes(vw))).length;
    const score = overlap / Math.max(gWords.length, vWords.length);
    if (score > bestScore && score >= 0.4) { bestScore = score; bestMatch = v; }
  }
  return bestMatch;
}

// ── Odometer Polling ──

async function pollOdometers(): Promise<{ vid: string; km: number; deviceId: string }[]> {
  // Get all devices
  const devices = await geotabCall("Get", {
    typeName: "Device",
    search: { groups: [{ id: "GroupCompanyId" }] },
  }) as any[];

  if (!devices?.length) return [];

  // Get latest StatusData for odometer (DiagnosticOdometerAdjustmentId)
  const results: { vid: string; km: number; deviceId: string }[] = [];

  for (const device of devices) {
    try {
      const statusData = await geotabCall("Get", {
        typeName: "StatusData",
        search: {
          deviceSearch: { id: device.id },
          diagnosticSearch: { id: "DiagnosticOdometerAdjustmentId" },
          fromDate: new Date(Date.now() - 7 * 86400000).toISOString(),
          toDate: new Date().toISOString(),
        },
        resultsLimit: 1,
      }) as any[];

      if (statusData?.length) {
        const km = Math.round(statusData[0].data / 1000); // Geotab returns meters
        results.push({ vid: device.name || device.id, km, deviceId: device.id });
      }
    } catch (e) {
      console.warn(`Odometer fetch failed for ${device.name}:`, e);
    }
  }

  return results;
}

async function updateOdometersAndCheckMaintenance(readings: { vid: string; km: number; deviceId: string }[]): Promise<void> {
  // Get vehicles from DB to match by name
  const { data: vehicles } = await supabase.from("vehicles").select("vid, name");
  if (!vehicles?.length) return;

  for (const reading of readings) {
    // Match Geotab device name to vehicle name (flexible matching)
    const vehicle = matchVehicle(reading.vid, vehicles as { vid: string; name: string }[]);
    if (!vehicle) { console.log(`No vehicle match for Geotab device: "${reading.vid}"`); continue; }

    // Upsert odometer reading
    await supabase.from("vehicle_odometers").upsert({
      vid: vehicle.vid,
      geotab_device_id: reading.deviceId,
      odometer_km: reading.km,
      updated_at: new Date().toISOString(),
    }, { onConflict: "vid" });

    // Check maintenance schedules for this vehicle
    const { data: schedules } = await supabase
      .from("maintenance_schedules")
      .select("*")
      .eq("vid", vehicle.vid);

    if (!schedules?.length) continue;

    for (const sched of schedules) {
      const nextDue = sched.last_service_km + sched.interval_km;
      let status = "ok";
      if (reading.km >= nextDue) status = "overdue";
      else if (reading.km >= nextDue - Math.round(sched.interval_km * 0.1)) status = "due"; // within 10%

      await supabase.from("maintenance_schedules").update({
        next_due_km: nextDue,
        status,
        updated_at: new Date().toISOString(),
      }).eq("id", sched.id);
    }
  }
}

// ── Driver Safety Polling ──

async function pollDriverScores(): Promise<void> {
  const today = todayISO();
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

  // Get all devices
  const devices = await geotabCall("Get", {
    typeName: "Device",
    search: { groups: [{ id: "GroupCompanyId" }] },
  }) as any[];

  if (!devices?.length) return;

  // Get vehicles from DB to match
  const { data: vehicles } = await supabase.from("vehicles").select("vid, name");
  if (!vehicles?.length) return;

  for (const device of devices) {
    const vehicle = matchVehicle(device.name || "", vehicles as { vid: string; name: string }[]);
    if (!vehicle) { console.log(`No vehicle match for Geotab device: "${device.name}"`); continue; }

    try {
      // Get trips for yesterday to compute metrics
      const trips = await geotabCall("Get", {
        typeName: "Trip",
        search: {
          deviceSearch: { id: device.id },
          fromDate: yesterday + "T00:00:00Z",
          toDate: today + "T00:00:00Z",
        },
      }) as any[];

      // Get exception events (safety) for yesterday
      const exceptions = await geotabCall("Get", {
        typeName: "ExceptionEvent",
        search: {
          deviceSearch: { id: device.id },
          fromDate: yesterday + "T00:00:00Z",
          toDate: today + "T00:00:00Z",
        },
      }) as any[];

      // Compute metrics from trips
      let totalDistanceKm = 0;
      let totalDriveMinutes = 0;
      let totalStopMinutes = 0;
      let totalIdleMinutes = 0;

      if (trips?.length) {
        for (const trip of trips) {
          totalDistanceKm += (trip.distance || 0);
          const start = new Date(trip.start).getTime();
          const stop = new Date(trip.stop).getTime();
          totalDriveMinutes += Math.max(0, (stop - start) / 60000);
          // Geotab returns durations as ISO 8601 duration or seconds — handle both
          const stopDur = typeof trip.stopDuration === 'number' ? trip.stopDuration : 0;
          const idleDur = typeof trip.idlingDuration === 'number' ? trip.idlingDuration : 0;
          totalStopMinutes += stopDur > 1000 ? stopDur / 60000 : stopDur / 60;
          totalIdleMinutes += idleDur > 1000 ? idleDur / 60000 : idleDur / 60;
        }
      }

      // Categorize exceptions by rule
      let harshBraking = 0, harshAccel = 0, speedingEvents = 0, seatbeltOff = 0;
      if (exceptions?.length) {
        for (const ex of exceptions) {
          const ruleId = ex.rule?.id?.toLowerCase() || "";
          if (ruleId.includes("harshbrake") || ruleId.includes("harsh brake")) harshBraking++;
          else if (ruleId.includes("harshaccel") || ruleId.includes("harsh accel")) harshAccel++;
          else if (ruleId.includes("speed") || ruleId.includes("posted")) speedingEvents++;
          else if (ruleId.includes("seatbelt") || ruleId.includes("seat belt")) seatbeltOff++;
        }
      }

      // Calculate scores (0-100, higher is better)
      const totalEvents = harshBraking + harshAccel + speedingEvents + seatbeltOff;
      const safetyScore = Math.max(0, Math.min(100, 100 - (totalEvents * 10)));

      const idleRatio = totalDriveMinutes > 0 ? Math.min(1, totalIdleMinutes / totalDriveMinutes) : 0;
      const efficiencyScore = Math.max(0, Math.min(100, 100 - (idleRatio * 100)));

      // Productivity: based on drive time ratio (if no stop data, default to 50)
      const totalTime = totalDriveMinutes + totalStopMinutes;
      const productivityScore = totalTime > 0
        ? Math.max(0, Math.min(100, (totalDriveMinutes / totalTime) * 100))
        : (totalDriveMinutes > 0 ? 50 : 0);

      // Overall: weighted — safety 65%, efficiency 35%
      const overallScore = (safetyScore * 0.65) + (efficiencyScore * 0.35);

      // Upsert driver score for yesterday
      await supabase.from("driver_scores").upsert({
        vid: vehicle.vid,
        driver_name: device.name || "",
        period_date: yesterday,
        safety_score: Math.round(safetyScore * 10) / 10,
        harsh_braking: harshBraking,
        harsh_accel: harshAccel,
        speeding_events: speedingEvents,
        seatbelt_off: seatbeltOff,
        efficiency_score: Math.round(efficiencyScore * 10) / 10,
        idle_minutes: Math.round(totalIdleMinutes),
        fuel_used_l: 0, // Geotab fuel data requires FuelTransaction, skip for now
        distance_km: Math.round(totalDistanceKm * 10) / 10,
        productivity_score: Math.round(productivityScore * 10) / 10,
        jobs_completed: 0, // Could cross-reference with jobs table later
        drive_minutes: Math.round(totalDriveMinutes),
        stop_minutes: Math.round(totalStopMinutes),
        overall_score: Math.round(overallScore * 10) / 10,
      }, { onConflict: "vid,period_date" });

    } catch (e) {
      console.warn(`Driver score poll failed for ${device.name}:`, e);
    }
  }
}

// ── Main Handler ──

Deno.serve(async (req) => {
  try {
    await authenticate();

    const readings = await pollOdometers();
    console.log(`Polled odometers for ${readings.length} devices`);
    await updateOdometersAndCheckMaintenance(readings);

    await pollDriverScores();
    console.log("Driver scores updated");

    return new Response(JSON.stringify({ ok: true, devices: readings.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("vehicle-telemetry error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
