// Address autocomplete — Google Places (New) proxy for the Jeff's Junk dashboard.
//
// The key lives here as an Edge Function secret (Supabase dashboard → Edge Functions
// → Secrets: GOOGLE_PLACES_KEY) rather than in app.js. A browser key would be public
// by definition — it ships in client JS on a static site — and a referrer restriction
// is browser-enforced, so anything that is not a browser can forge it and spend the
// day's quota. Held here, the key is never published, and the signed-in check below
// means only staff can spend it.
//
// The key is restricted to Places API (New) alone and capped at 300 requests/day in
// the Google console, so the worst case is a day of degraded suggestions, never a bill.
// Until the secret is set every call returns {error:'not_configured'} and the dashboard
// quietly falls back to the OpenStreetMap lookups.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': 'https://soramithril.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Barrie. The dashboard never asks staff for their location, so the bias is fixed here
// rather than accepted from the caller — one less thing a caller could widen. Bias, not
// restrict: an address outside the circle still comes back, just ranked lower.
const LAT = 44.3894;
const LON = -79.6903;
const RADIUS_M = 50000;   // the API's maximum

// Every call that reaches Google gets counted, so the dashboard's Usage page can show
// the month against Google's 10,000 free calls without anyone opening the Cloud console.
// This function is the only thing that talks to Google, so counting here counts
// everything — a browser-side tally would miss any future caller.
//
// A counter that fails must not cost anyone their address suggestions, so a failure is
// logged for the function log and the lookup carries on.
async function countCall(api: string) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const resp = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/bump_google_api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
    body: JSON.stringify({ p_api: api }),
  });
  if (!resp.ok) console.error('bump_google_api failed', resp.status, await resp.text());
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });

  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    // Employees only. The platform's verify_jwt gate also passes the anon key, which
    // every visitor to the site has, so confirm a real signed-in user — same check
    // ai-advisor makes. Without this, anyone could drain the daily cap.
    const auth = req.headers.get('authorization') || '';
    const userResp = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', {
      headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') || '' },
    });
    if (!userResp.ok) return json({ error: 'not_signed_in' }, 401);

    const key = Deno.env.get('GOOGLE_PLACES_KEY');
    if (!key) return json({ error: 'not_configured' });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const input = String(body.input ?? '').trim();
    // The form only asks from 4 characters up. Enforcing it here too means a stray
    // caller cannot burn the day's quota on one-letter lookups.
    if (input.length < 4) return json({ suggestions: [] });

    const resp = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({
        input,
        includedRegionCodes: ['ca'],
        locationBias: { circle: { center: { latitude: LAT, longitude: LON }, radius: RADIUS_M } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: 'places_' + resp.status, detail: t.slice(0, 300) }, 502);
    }

    // Counted after Google answered, because that is the call that spends the quota.
    await countCall('places_autocomplete');

    const data = await resp.json() as Record<string, unknown>;
    // Normalised here to the {street, city, extra} the dropdown already speaks, so the
    // browser never handles the raw Google payload and app.js keeps one shared shape
    // for both providers.
    const raw = (data.suggestions || []) as Array<Record<string, unknown>>;
    const suggestions = raw.map((s) => {
      const p = (s.placePrediction || {}) as Record<string, unknown>;
      const sf = (p.structuredFormat || {}) as Record<string, unknown>;
      const mainText = (sf.mainText || {}) as Record<string, unknown>;
      const secText = (sf.secondaryText || {}) as Record<string, unknown>;
      const pText = (p.text || {}) as Record<string, unknown>;
      const street = String(mainText.text || pText.text || '');
      const parts = String(secText.text || '').split(',').map((x) => x.trim()).filter(Boolean);
      return { street, city: parts[0] || '', extra: parts.slice(1).join(', ') };
    }).filter((a) => a.street);

    return json({ suggestions });
  } catch (err) {
    // Never let the key reach the browser, whatever an exception message contains.
    const msg = ((err as Error).message || '').replace(/AIza[\w-]+/g, '***');
    return json({ error: 'exception', detail: msg }, 500);
  }
});
