/**
 * Supabase Edge Function: vehicle-telemetry
 *
 * Polls Geotab for:
 *   1. Odometer readings → vehicle_odometers table → checks maintenance_schedules
 *   2. Driver safety/efficiency data → driver_scores table
 *   3. Individual safety events → safety_events table → crew attribution
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
  const exact = vehicles.find(v => v.name.toLowerCase().trim() === gn);
  if (exact) return exact;
  const gWords = gn.replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 2);
  let bestMatch: { vid: string; name: string } | undefined;
  let bestScore = 0;
  for (const v of vehicles) {
    const vn = v.name.toLowerCase().trim();
    const vWords = vn.replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 2);
    const overlap = gWords.filter(w => vWords.some(vw => vw.includes(w) || w.includes(vw))).length;
    const score = overlap / Math.max(gWords.length, vWords.length);
    if (score > bestScore && score >= 0.4) { bestScore = score; bestMatch = v; }
  }
  return bestMatch;
}

// Categorize a Geotab exception event by rule ID
function categorizeException(ruleId: string): string | null {
  const r = ruleId.toLowerCase();
  if (r.includes("harshbrake") || r.includes("harsh brake")) return "harsh_braking";
  if (r.includes("harshaccel") || r.includes("harsh accel")) return "harsh_accel";
  if (r.includes("speed") || r.includes("posted")) return "speeding";
  if (r.includes("seatbelt") || r.includes("seat belt")) return "seatbelt_off";
  if (r.includes("corner") || r.includes("cornering")) return "cornering";
  return null;
}

// ── Odometer Polling ──

async function pollOdometers(): Promise<{ vid: string; km: number; deviceId: string }[]> {
  const devices = await geotabCall("Get", {
    typeName: "Device",
    search: { groups: [{ id: "GroupCompanyId" }] },
  }) as any[];

  if (!devices?.length) return [];

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
        const km = Math.round(statusData[0].data / 1000);
        results.push({ vid: device.name || device.id, km, deviceId: device.id });
      }
    } catch (e) {
      console.warn(`Odometer fetch failed for ${device.name}:`, e);
    }
  }

  return results;
}

async function updateOdometersAndCheckMaintenance(readings: { vid: string; km: number; deviceId: string }[]): Promise<void> {
  const { data: vehicles } = await supabase.from("vehicles").select("vid, name");
  if (!vehicles?.length) return;

  for (const reading of readings) {
    const vehicle = matchVehicle(reading.vid, vehicles as { vid: string; name: string }[]);
    if (!vehicle) { console.log(`No vehicle match for Geotab device: "${reading.vid}"`); continue; }

    await supabase.from("vehicle_odometers").upsert({
      vid: vehicle.vid,
      geotab_device_id: reading.deviceId,
      odometer_km: reading.km,
      updated_at: new Date().toISOString(),
    }, { onConflict: "vid" });

    const { data: schedules } = await supabase
      .from("maintenance_schedules")
      .select("*")
      .eq("vid", vehicle.vid);

    if (!schedules?.length) continue;

    for (const sched of schedules) {
      const nextDue = sched.last_service_km + sched.interval_km;
      let status = "ok";
      if (reading.km >= nextDue) status = "overdue";
      else if (reading.km >= nextDue - Math.round(sched.interval_km * 0.1)) status = "due";

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

  const devices = await geotabCall("Get", {
    typeName: "Device",
    search: { groups: [{ id: "GroupCompanyId" }] },
  }) as any[];

  if (!devices?.length) return;

  const { data: vehicles } = await supabase.from("vehicles").select("vid, name");
  if (!vehicles?.length) return;

  for (const device of devices) {
    const vehicle = matchVehicle(device.name || "", vehicles as { vid: string; name: string }[]);
    if (!vehicle) { console.log(`No vehicle match for Geotab device: "${device.name}"`); continue; }

    try {
      const trips = await geotabCall("Get", {
        typeName: "Trip",
        search: {
          deviceSearch: { id: device.id },
          fromDate: yesterday + "T00:00:00Z",
          toDate: today + "T00:00:00Z",
        },
      }) as any[];

      const exceptions = await geotabCall("Get", {
        typeName: "ExceptionEvent",
        search: {
          deviceSearch: { id: device.id },
          fromDate: yesterday + "T00:00:00Z",
          toDate: today + "T00:00:00Z",
        },
      }) as any[];

      // Compute trip metrics
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
          const stopDur = typeof trip.stopDuration === 'number' ? trip.stopDuration : 0;
          const idleDur = typeof trip.idlingDuration === 'number' ? trip.idlingDuration : 0;
          totalStopMinutes += stopDur > 1000 ? stopDur / 60000 : stopDur / 60;
          totalIdleMinutes += idleDur > 1000 ? idleDur / 60000 : idleDur / 60;
        }
      }

      // Categorize exceptions and store individual events
      let harshBraking = 0, harshAccel = 0, speedingEvents = 0, seatbeltOff = 0, corneringEvents = 0;
      const eventRows: { vid: string; event_type: string; event_time: string; period_date: string }[] = [];

      if (exceptions?.length) {
        for (const ex of exceptions) {
          const ruleId = ex.rule?.id?.toLowerCase() || "";
          const eventType = categorizeException(ruleId);
          if (!eventType) continue;

          // Count for vehicle aggregate
          if (eventType === "harsh_braking") harshBraking++;
          else if (eventType === "harsh_accel") harshAccel++;
          else if (eventType === "speeding") speedingEvents++;
          else if (eventType === "seatbelt_off") seatbeltOff++;
          else if (eventType === "cornering") corneringEvents++;

          // Collect for individual event storage
          const eventTime = ex.activeFrom || ex.dateTime || new Date().toISOString();
          eventRows.push({
            vid: vehicle.vid,
            event_type: eventType,
            event_time: eventTime,
            period_date: yesterday,
          });
        }
      }

      // Store individual events in safety_events table
      if (eventRows.length) {
        // Delete old events for this vid+date first (idempotent on re-run)
        await supabase.from("safety_events")
          .delete()
          .eq("vid", vehicle.vid)
          .eq("period_date", yesterday);

        // Insert fresh
        const { error: evtErr } = await supabase.from("safety_events").insert(eventRows);
        if (evtErr) console.warn(`Failed to insert safety_events for ${vehicle.vid}:`, evtErr.message);
      }

      // Calculate scores
      const totalEvents = harshBraking + harshAccel + speedingEvents + seatbeltOff + corneringEvents;
      const safetyScore = Math.max(0, Math.min(100, 100 - (totalEvents * 10)));

      const idleRatio = totalDriveMinutes > 0 ? Math.min(1, totalIdleMinutes / totalDriveMinutes) : 0;
      const efficiencyScore = Math.max(0, Math.min(100, 100 - (idleRatio * 100)));

      const totalTime = totalDriveMinutes + totalStopMinutes;
      const productivityScore = totalTime > 0
        ? Math.max(0, Math.min(100, (totalDriveMinutes / totalTime) * 100))
        : (totalDriveMinutes > 0 ? 50 : 0);

      const overallScore = (safetyScore * 0.65) + (efficiencyScore * 0.35);

      // Upsert vehicle-level driver score
      await supabase.from("driver_scores").upsert({
        vid: vehicle.vid,
        driver_name: device.name || "",
        period_date: yesterday,
        safety_score: Math.round(safetyScore * 10) / 10,
        harsh_braking: harshBraking,
        harsh_accel: harshAccel,
        speeding_events: speedingEvents,
        seatbelt_off: seatbeltOff,
        cornering_events: corneringEvents,
        efficiency_score: Math.round(efficiencyScore * 10) / 10,
        idle_minutes: Math.round(totalIdleMinutes),
        fuel_used_l: 0,
        distance_km: Math.round(totalDistanceKm * 10) / 10,
        productivity_score: Math.round(productivityScore * 10) / 10,
        jobs_completed: 0,
        drive_minutes: Math.round(totalDriveMinutes),
        stop_minutes: Math.round(totalStopMinutes),
        overall_score: Math.round(overallScore * 10) / 10,
      }, { onConflict: "vid,period_date" });

    } catch (e) {
      console.warn(`Driver score poll failed for ${device.name}:`, e);
    }
  }

  // After all vehicles processed, attribute events to crew members
  await attributeEventsToCrew(yesterday);
}

// ── Crew Attribution ──

async function attributeEventsToCrew(periodDate: string): Promise<void> {
  // Get all unattributed events for this date
  const { data: events } = await supabase
    .from("safety_events")
    .select("*")
    .eq("period_date", periodDate)
    .is("crew_member_id", null);

  if (!events?.length) {
    console.log(`No unattributed events for ${periodDate}`);
    return;
  }

  // Get all assignments that overlap this date
  const dayStart = periodDate + "T00:00:00";
  const dayEnd = periodDate + "T23:59:59";
  const { data: assignments } = await supabase
    .from("vehicle_assignments")
    .select("*")
    .gte("started_at", dayStart)
    .lte("started_at", dayEnd);

  if (!assignments?.length) {
    console.log(`No crew assignments for ${periodDate}, events stay unattributed`);
    return;
  }

  // Build lookup: vid → sorted assignments by started_at
  const byVid: Record<string, any[]> = {};
  for (const a of assignments) {
    if (!byVid[a.vid]) byVid[a.vid] = [];
    byVid[a.vid].push(a);
  }
  for (const vid of Object.keys(byVid)) {
    byVid[vid].sort((a: any, b: any) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
  }

  // Attribute each event to the crew member who was driving at that time
  for (const evt of events) {
    const vidAssignments = byVid[evt.vid];
    if (!vidAssignments?.length) continue;

    const evtTime = new Date(evt.event_time).getTime();
    let matchedCrew: string | null = null;

    for (const a of vidAssignments) {
      const start = new Date(a.started_at).getTime();
      const end = a.ended_at ? new Date(a.ended_at).getTime() : Infinity;
      if (evtTime >= start && evtTime <= end) {
        matchedCrew = a.crew_member_id;
        break;
      }
    }

    if (matchedCrew) {
      await supabase.from("safety_events")
        .update({ crew_member_id: matchedCrew })
        .eq("id", evt.id);
    }
  }

  // Now aggregate into crew_driver_scores for this date
  await aggregateCrewScores(periodDate);
}

async function aggregateCrewScores(periodDate: string): Promise<void> {
  // Get all attributed events grouped by crew member
  const { data: events } = await supabase
    .from("safety_events")
    .select("*")
    .eq("period_date", periodDate)
    .not("crew_member_id", "is", null);

  if (!events?.length) return;

  // Group by crew_member_id
  const byCrew: Record<string, { harsh_braking: number; harsh_accel: number; speeding: number; seatbelt_off: number; cornering: number; vids: Set<string> }> = {};

  for (const evt of events) {
    const cid = evt.crew_member_id;
    if (!byCrew[cid]) byCrew[cid] = { harsh_braking: 0, harsh_accel: 0, speeding: 0, seatbelt_off: 0, cornering: 0, vids: new Set() };
    const c = byCrew[cid];
    c.vids.add(evt.vid);
    if (evt.event_type === "harsh_braking") c.harsh_braking++;
    else if (evt.event_type === "harsh_accel") c.harsh_accel++;
    else if (evt.event_type === "speeding") c.speeding++;
    else if (evt.event_type === "seatbelt_off") c.seatbelt_off++;
    else if (evt.event_type === "cornering") c.cornering++;
  }

  // Also get drive time/distance from driver_scores for the vehicles each crew drove
  for (const [crewId, data] of Object.entries(byCrew)) {
    const vids = Array.from(data.vids);
    let totalDistance = 0;
    let totalDriveMin = 0;

    for (const vid of vids) {
      const { data: scores } = await supabase
        .from("driver_scores")
        .select("distance_km, drive_minutes")
        .eq("vid", vid)
        .eq("period_date", periodDate)
        .limit(1);

      if (scores?.length) {
        // Proportional: if multiple crew drove this vehicle, split evenly
        const crewOnVid = Object.values(byCrew).filter(d => d.vids.has(vid)).length || 1;
        totalDistance += Number(scores[0].distance_km) / crewOnVid;
        totalDriveMin += Math.round(scores[0].drive_minutes / crewOnVid);
      }
    }

    const totalEvents = data.harsh_braking + data.harsh_accel + data.speeding + data.seatbelt_off + data.cornering;
    const safetyScore = Math.max(0, Math.min(100, 100 - (totalEvents * 10)));

    await supabase.from("crew_driver_scores").upsert({
      crew_member_id: crewId,
      period_date: periodDate,
      safety_score: Math.round(safetyScore * 10) / 10,
      harsh_braking: data.harsh_braking,
      harsh_accel: data.harsh_accel,
      speeding_events: data.speeding,
      seatbelt_off: data.seatbelt_off,
      cornering_events: data.cornering,
      total_events: totalEvents,
      distance_km: Math.round(totalDistance * 10) / 10,
      drive_minutes: totalDriveMin,
      vehicles_driven: vids,
    }, { onConflict: "crew_member_id,period_date" });
  }

  // Also insert zero-event rows for crew who were assigned but had no events
  const { data: allAssignments } = await supabase
    .from("vehicle_assignments")
    .select("crew_member_id, vid")
    .gte("started_at", periodDate + "T00:00:00")
    .lte("started_at", periodDate + "T23:59:59");

  if (allAssignments?.length) {
    for (const a of allAssignments) {
      if (byCrew[a.crew_member_id]) continue; // Already handled above
      // This crew had no events — clean record
      await supabase.from("crew_driver_scores").upsert({
        crew_member_id: a.crew_member_id,
        period_date: periodDate,
        safety_score: 100,
        harsh_braking: 0,
        harsh_accel: 0,
        speeding_events: 0,
        seatbelt_off: 0,
        cornering_events: 0,
        total_events: 0,
        distance_km: 0,
        drive_minutes: 0,
        vehicles_driven: [a.vid],
      }, { onConflict: "crew_member_id,period_date" });
    }
  }

  console.log(`Crew scores aggregated for ${periodDate}: ${Object.keys(byCrew).length} crew with events`);
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
