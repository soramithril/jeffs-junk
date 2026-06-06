/**
 * Tests for the BIN_AUTO_ zone sweep selection logic.
 * Run with: `deno test supabase/functions/_shared/sweep-logic_test.ts`
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickDuplicates, pickExpired, SweepZone } from "./sweep-logic.ts";

const NOW = new Date("2026-06-06T12:00:00Z");

function z(id: string, name: string, activeTo: string): SweepZone {
  return { id, name, activeTo };
}

Deno.test("pickExpired selects only zones with activeTo strictly before now", () => {
  const zones: SweepZone[] = [
    z("a", "BIN_AUTO_1", "2026-06-05T23:59:59Z"), // expired
    z("b", "BIN_AUTO_2", "2026-06-06T11:59:59Z"), // expired (1s ago)
    z("c", "BIN_AUTO_3", "2026-06-06T12:00:00Z"), // exactly now → NOT expired
    z("d", "BIN_AUTO_4", "2026-06-07T00:00:00Z"), // active
  ];
  const result = pickExpired(zones, NOW);
  assertEquals(result.sort(), ["a", "b"]);
});

Deno.test("pickExpired never selects a non-BIN_AUTO_ zone", () => {
  const zones: SweepZone[] = [
    z("x", "BIN_AUTO_1", "2020-01-01T00:00:00Z"),
    z("y", "Customer Site - Walmart", "2020-01-01T00:00:00Z"), // not ours
    z("z", "BinAuto_1", "2020-01-01T00:00:00Z"), // close but wrong case
    z("w", "AUTO_BIN_1", "2020-01-01T00:00:00Z"), // wrong order
  ];
  const result = pickExpired(zones, NOW);
  assertEquals(result, ["x"]);
});

Deno.test("pickExpired returns empty when no zones are expired", () => {
  const zones: SweepZone[] = [
    z("a", "BIN_AUTO_1", "2030-01-01T00:00:00Z"),
    z("b", "BIN_AUTO_2", "2030-01-01T00:00:00Z"),
  ];
  assertEquals(pickExpired(zones, NOW), []);
});

Deno.test("pickDuplicates keeps the latest activeTo, drops the rest", () => {
  const zones: SweepZone[] = [
    z("old", "BIN_AUTO_42", "2026-06-05T00:00:00Z"),
    z("new", "BIN_AUTO_42", "2026-06-07T00:00:00Z"), // latest → keep
    z("mid", "BIN_AUTO_42", "2026-06-06T00:00:00Z"),
    z("solo", "BIN_AUTO_99", "2026-06-06T00:00:00Z"), // singleton → keep
  ];
  const result = pickDuplicates(zones).sort();
  assertEquals(result, ["mid", "old"]);
});

Deno.test("pickDuplicates ignores non-BIN_AUTO_ zones entirely", () => {
  const zones: SweepZone[] = [
    z("p", "Pickup Zone", "2026-06-05T00:00:00Z"),
    z("q", "Pickup Zone", "2026-06-06T00:00:00Z"),
  ];
  assertEquals(pickDuplicates(zones), []);
});

Deno.test("pickDuplicates returns empty when every name is unique", () => {
  const zones: SweepZone[] = [
    z("a", "BIN_AUTO_1", "2026-06-06T00:00:00Z"),
    z("b", "BIN_AUTO_2", "2026-06-06T00:00:00Z"),
  ];
  assertEquals(pickDuplicates(zones), []);
});
