/**
 * Supabase Edge Function: permit-leads-sync (v2, 2026-11-20)
 *
 * Pulls the building permits the towns publish into public.permit_leads, which
 * the Prospects page shows as "Permit leads". Called once a morning by pg_cron
 * (permit-leads-daily).
 *
 * Sources - all public, no key, no sign-in:
 *   Barrie    the city's own "Issued Building Permits" map layer. Runs about a
 *             week behind. No construction value.
 *   Innisfil  one web page per month, posted around the 12th of the NEXT month.
 *             Before that the page says "no report found", which is normal.
 *   Oro-Medonte  the township's permit layer on the County's map server, fed
 *             from its permit system the same day a permit is issued.
 *
 * What is kept: the address, the work, the value, the date and - v2, on Jake's
 * word - the COMPANY named on the permit (Oro-Medonte only; the builder first,
 * then the applicant's firm). The Oro-Medonte layer's raw record (original_json)
 * also holds people's names, emails and phone numbers. That looks like a mistake
 * on the township's side: it is read here only to pick out the company name, and
 * no person's name, email or phone is ever kept or written anywhere. The raw
 * record is cut off at 2,000 characters, so it is walked party by party instead
 * of parsed whole.
 *
 * A permit is written once and never touched again (unique town + permit_no,
 * duplicates ignored), so whatever the office marked on a lead survives every
 * later run.
 *
 * verify_jwt is off; the caller is checked here: only the database (x-cron-secret
 * from public.cron_config) may call it.
 *
 * POST {"dryRun": true} fetches and counts but writes nothing.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BARRIE_URL =
  "https://gispublic.barrie.ca/arcgis/rest/services/Open_Data/APLI/MapServer/1/query";
const INNISFIL_URL = "https://eservices.innisfil.ca/BuildingIssuedReports/GetReport";
const ORO_URL =
  "https://maps2.simcoe.ca/arcgis/rest/services/SimcoeCounty/Oro_Medonte_Building_Permits/MapServer/0/query";
const BARRIE_LOOKBACK_DAYS = 45;
const ORO_LOOKBACK_DAYS = 45;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SB_SECRET_KEY")!,
);

interface Lead {
  town: string;
  permit_no: string;
  address: string;
  work: string;
  value: number | null;
  issued_on: string; // YYYY-MM-DD
  company: string | null;
  company_role: string | null;
}

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Barrie: every permit whose status date falls in the lookback window.
 *  Date_Status is text, "YYYY.MM.DD", so a text comparison sorts correctly. */
async function barrie(today: Date): Promise<Lead[]> {
  const from = new Date(today.getTime() - BARRIE_LOOKBACK_DAYS * 86400000);
  const stamp = from.toISOString().slice(0, 10).replaceAll("-", ".");
  const q = new URLSearchParams({
    where: `Date_Status >= '${stamp}'`,
    outFields: "RECORD_ID,Full_Address,Sub_Type,Description,Date_Status",
    returnGeometry: "false",
    resultRecordCount: "2000",
    f: "json",
  });
  const res = await fetch(`${BARRIE_URL}?${q}`);
  if (!res.ok) throw new Error(`Barrie answered ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`Barrie: ${body.error.message}`);
  if (!Array.isArray(body.features)) throw new Error("Barrie: no features in the answer");
  if (body.exceededTransferLimit) throw new Error("Barrie: more rows than one page holds");

  const leads: Lead[] = [];
  for (const f of body.features) {
    const a = f.attributes;
    const permit = clean(a.RECORD_ID), address = clean(a.Full_Address);
    const date = clean(a.Date_Status).replaceAll(".", "-");
    if (!permit || !address || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    leads.push({
      town: "Barrie",
      permit_no: permit,
      address,
      work: clean(a.Description) || clean(a.Sub_Type) || "Building permit",
      value: null,
      issued_on: date,
      company: null,
      company_role: null,
    });
  }
  return leads;
}

const BACKSLASH = String.fromCharCode(92);
// Whose company is worth a call, best first. Designers and consultants are left
// out: they draw the job, they do not order the bin.
const COMPANY_ROLES = ["Builder", "Applicant", "Payer", "Sewage system installer", "Property owner"];

/** The complete party records at the start of a (possibly cut-off) raw permit
 *  record. A party that the 2,000-character cut lands inside is dropped. */
function partiesIn(raw: string): Array<Record<string, unknown>> {
  const start = raw.indexOf('"parties":[');
  if (start < 0) return [];
  const out: Array<Record<string, unknown>> = [];
  let depth = 0, inStr = false, esc = false, objStart = -1;
  for (let i = start + 11; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === BACKSLASH) esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") { if (depth === 0) objStart = i; depth++; }
    else if (ch === "}") { depth--; if (depth === 0) out.push(JSON.parse(raw.slice(objStart, i + 1))); }
    else if (ch === "]" && depth === 0) break;
  }
  return out;
}

/** The one company to show for a permit, and its role. Company name only. */
function companyOn(raw: string): { company: string | null; company_role: string | null } {
  const parties = partiesIn(raw);
  for (const role of COMPANY_ROLES) {
    for (const p of parties) {
      const name = clean(p.corporationOrPartnership);
      if (name && Array.isArray(p.roles) && p.roles.includes(role)) {
        return { company: name, company_role: role };
      }
    }
  }
  return { company: null, company_role: null };
}

/** Oro-Medonte: permits issued in the lookback window. `issued` is a real
 *  timestamp; the day is read on the Ontario clock. */
async function oroMedonte(today: Date): Promise<Lead[]> {
  const from = new Date(today.getTime() - ORO_LOOKBACK_DAYS * 86400000);
  const q = new URLSearchParams({
    where: `issued >= DATE '${from.toISOString().slice(0, 10)}'`,
    outFields: "municipalCaseId,address,title,projectValue,issued,original_json",
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetch(`${ORO_URL}?${q}`);
  if (!res.ok) throw new Error(`Oro-Medonte answered ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`Oro-Medonte: ${body.error.message}`);
  if (!Array.isArray(body.features)) throw new Error("Oro-Medonte: no features in the answer");
  if (body.exceededTransferLimit) throw new Error("Oro-Medonte: more rows than one page holds");

  const ontarioDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" });
  const leads: Lead[] = [];
  for (const f of body.features) {
    const a = f.attributes;
    const permit = clean(a.municipalCaseId), address = clean(a.address);
    if (!permit || !address || typeof a.issued !== "number") continue;
    const value = Number(a.projectValue);
    leads.push({
      town: "Oro-Medonte",
      permit_no: permit,
      address,
      work: clean(a.title) || "Building permit",
      value: Number.isFinite(value) && value > 0 ? value : null,
      issued_on: ontarioDay.format(new Date(a.issued)),
      ...companyOn(String(a.original_json ?? "")),
    });
  }
  return leads;
}

/** Innisfil: one month's page. Returns [] when the month is not posted yet. */
async function innisfilMonth(month: number, year: number): Promise<Lead[]> {
  const res = await fetch(`${INNISFIL_URL}/${month}/${year}`);
  if (!res.ok) throw new Error(`Innisfil ${month}/${year} answered ${res.status}`);
  const html = await res.text();
  if (/no report found/i.test(html)) return [];

  // The town builds these pages by hand: October 2026 has a proper header row,
  // September 2026 has the whole header squashed into one cell. The ten columns
  // are in the same order on both, so a permit row is recognised by its shape
  // (ten cells, a permit number first, a date fifth), not by the header.
  const table = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!table) throw new Error(`Innisfil ${month}/${year}: no table on the page`);
  const rows = table[1].split(/<tr[^>]*>/i).slice(1).map((r) =>
    [...r.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) =>
      clean(c[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"))
    )
  );
  const cPermit = 0, cAddr = 1, cTitle = 3, cDate = 4, cValue = 8;
  const permitRows = rows.filter((r) =>
    r.length === 10 && /^\d{4}-\d{3,5}$/.test(r[cPermit]) && /^\d{4}-\d{2}-\d{2}$/.test(r[cDate])
  );
  if (!permitRows.length) {
    throw new Error(`Innisfil ${month}/${year}: a report is posted but no permit rows were recognised`);
  }

  const leads: Lead[] = [];
  for (const r of permitRows) {
    const permit = r[cPermit], address = r[cAddr], date = r[cDate];
    if (!address) continue;
    const value = Number(r[cValue]);
    leads.push({
      town: "Innisfil",
      permit_no: permit,
      address,
      work: r[cTitle] || "Building permit",
      value: Number.isFinite(value) && value > 0 ? value : null,
      issued_on: date,
      company: null,
      company_role: null,
    });
  }
  return leads;
}

/** This month and the two before it, so a late posting is still picked up. */
async function innisfil(today: Date): Promise<Lead[]> {
  const leads: Lead[] = [];
  for (let back = 0; back < 3; back++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
    leads.push(...await innisfilMonth(d.getUTCMonth() + 1, d.getUTCFullYear()));
  }
  return leads;
}

async function callerIsDatabase(req: Request): Promise<boolean> {
  const { data, error } = await supabase
    .from("cron_config").select("value").eq("key", "edge_secret").single();
  if (error) throw new Error(`cron_config read failed: ${error.message}`);
  return req.headers.get("x-cron-secret") === data.value;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    if (!(await callerIsDatabase(req))) return json({ ok: false, error: "unauthorized" }, 401);
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch (_) { /* empty body = a normal run */ }

    // One town failing must not cost the other town its run; the failure is
    // still reported, and the whole call answers 500 so it shows in the logs.
    const today = new Date();
    const summary: Record<string, unknown> = {};
    const leads: Lead[] = [];
    const failures: string[] = [];
    for (const [town, fetchTown] of [["Barrie", barrie], ["Innisfil", innisfil], ["Oro-Medonte", oroMedonte]] as const) {
      try {
        const got = await fetchTown(today);
        summary[town] = got.length;
        leads.push(...got);
      } catch (e) {
        failures.push(`${town}: ${(e as Error).message}`);
      }
    }

    let added = 0;
    if (body.dryRun !== true && leads.length) {
      const { data, error } = await supabase.from("permit_leads")
        .upsert(leads, { onConflict: "town,permit_no", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(`write permit_leads: ${error.message}`);
      added = data.length;
    }
    return json({ ok: failures.length === 0, fetched: summary, added, failures },
      failures.length ? 500 : 200);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
