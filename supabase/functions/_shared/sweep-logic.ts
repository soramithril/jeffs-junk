/**
 * Pure selection logic for the daily BIN_AUTO_ zone sweep.
 *
 * Kept in its own module (no Geotab calls, no Supabase) so it can be unit
 * tested with `deno test` without auth or network. The sweep handler in
 * geofence-sync/index.ts composes these with deleteZone calls.
 */

import { ZONE_PREFIX } from "./geotab-client.ts";

export interface SweepZone {
  id: string;
  name: string;
  activeTo: string; // ISO 8601
}

/**
 * Pick zone ids that are strictly expired (activeTo < now) AND are BIN_AUTO_.
 * Defense-in-depth: we never select a non-BIN_AUTO_ zone, even if the caller
 * passed one in by accident.
 */
export function pickExpired(zones: SweepZone[], now: Date): string[] {
  return zones
    .filter((z) => z.name.startsWith(ZONE_PREFIX))
    .filter((z) => new Date(z.activeTo).getTime() < now.getTime())
    .map((z) => z.id);
}

/**
 * Pick zone ids that are duplicates by name among BIN_AUTO_ zones.
 * For each name with >1 zone, keep the one with the latest activeTo
 * and mark the rest for deletion.
 */
export function pickDuplicates(zones: SweepZone[]): string[] {
  const byName = new Map<string, SweepZone[]>();
  for (const z of zones) {
    if (!z.name.startsWith(ZONE_PREFIX)) continue;
    const arr = byName.get(z.name) ?? [];
    arr.push(z);
    byName.set(z.name, arr);
  }

  const dupes: string[] = [];
  for (const arr of byName.values()) {
    if (arr.length <= 1) continue;
    arr.sort(
      (a, b) => new Date(b.activeTo).getTime() - new Date(a.activeTo).getTime(),
    );
    for (let i = 1; i < arr.length; i++) dupes.push(arr[i].id);
  }
  return dupes;
}
