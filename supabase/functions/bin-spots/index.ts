/**
 * Supabase Edge Function: bin-spots
 *
 * Keeps `bin_spots` up to date: one map point per bin sitting at a customer (a Bin
 * Rental job with bin_instatus 'dropped', not cancelled), so the office TV can draw
 * every bin where it actually is (Jake, 2026-11-05).
 *
 * Called by the office TV after each data load (every 15 minutes). Each call:
 *   1. looks up, in ONE Geotab GetCoordinates request, every bin whose address has no
 *      point yet (or whose address changed) — Geotab allows 10 calls a minute across
 *      the whole account, and the live truck map lives on the same account;
 *   2. removes rows for bins that are no longer out.
 * An address Geotab cannot place is saved with no point, so it is not asked again
 * until the address changes.
 *
 * Only a signed-in staff account (the TV's display account included) may call it.
 * verify_jwt is off and the caller is checked here instead, the same way the other
 * browser-facing functions are run since the legacy keys were switched off.
 * Writes only `bin_spots`; never touches jobs.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, call } from "../_shared/geotab-client.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SB_SECRET_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const STAFF = ["developer", "owner", "lead", "office", "display"];
const MAX_PER_CALL = 60;   // more than the whole fleet; one Geotab request either way

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// The same address form geofence-sync gives Geotab for a bin's zone.
function spotAddress(j: { address: string; city: string | null }): string {
  return j.city ? `${j.address}, ${j.city}, ON` : `${j.address}, ON`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, error: "Method not allowed" }, 405);
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: who, error: whoErr } = await supabase.auth.getUser(token);
    if (whoErr || !who?.user) return reply({ ok: false, error: "Sign in first" }, 401);
    const { data: prof, error: profErr } = await supabase.from("user_profiles").select("role").eq("id", who.user.id).maybeSingle();
    if (profErr) throw new Error(`profile lookup failed: ${profErr.message}`);
    if (!prof || STAFF.indexOf(prof.role) < 0) return reply({ ok: false, error: "Not a staff account" }, 403);

    const { data: out, error: outErr } = await supabase.from("jobs").select("job_id,address,city")
      .eq("service", "Bin Rental").eq("bin_instatus", "dropped").neq("status", "Cancelled");
    if (outErr) throw new Error(`bins-out query failed: ${outErr.message}`);
    const { data: have, error: haveErr } = await supabase.from("bin_spots").select("job_id,address");
    if (haveErr) throw new Error(`bin_spots read failed: ${haveErr.message}`);

    const known = new Map((have || []).map((r) => [r.job_id, r.address]));
    const outIds = new Set((out || []).map((j) => j.job_id));
    const todo = (out || [])
      .filter((j) => j.address && known.get(j.job_id) !== spotAddress(j))
      .slice(0, MAX_PER_CALL);

    let placed = 0, unplaced = 0;
    if (todo.length) {
      await authenticate();
      const addresses = todo.map(spotAddress);
      const pts = (await call("GetCoordinates", { addresses })) as ({ x: number; y: number } | null)[];
      const rows = todo.map((j, i) => {
        const p = pts && pts[i];
        const ok = p && !(p.x === 0 && p.y === 0);
        if (ok) placed++; else unplaced++;
        return { job_id: j.job_id, address: addresses[i], lat: ok ? p!.y : null, lng: ok ? p!.x : null, geocoded_at: new Date().toISOString() };
      });
      const { error: upErr } = await supabase.from("bin_spots").upsert(rows, { onConflict: "job_id" });
      if (upErr) throw new Error(`bin_spots save failed: ${upErr.message}`);
    }

    // Bins that came home (or whose job was cancelled) leave the map.
    const gone = (have || []).map((r) => r.job_id).filter((id) => !outIds.has(id));
    for (let i = 0; i < gone.length; i += 200) {
      const { error: delErr } = await supabase.from("bin_spots").delete().in("job_id", gone.slice(i, i + 200));
      if (delErr) throw new Error(`bin_spots cleanup failed: ${delErr.message}`);
    }

    return reply({ ok: true, out: outIds.size, placed, unplaced, removed: gone.length });
  } catch (err) {
    console.error("bin-spots error:", err);
    return reply({ ok: false, error: (err as Error).message }, 500);
  }
});
