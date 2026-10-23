// The designed Google review email (Jake, 2026-10-23). Two jobs, one layout:
//
//   mode 'preview' → the finished email as HTML, for the app's editing window and the
//                    Email Templates page. Nothing is sent.
//   mode 'send'    → the same email, sent through Microsoft 365 from hello@jeffsjunk.ca
//                    (Graph sendMail with saveToSentItems, so every one lands in that
//                    mailbox's Sent folder as the receipt).
//
// The caller only supplies the words. The layout, the recipient and the pictures are
// decided here, so this can never be used to send anything but a review request to the
// address on the job (Jake's rule: the job's address, never the client's).
//
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET — the app registered in Microsoft Entra
//     with Graph Mail.Send (application), locked to hello@ by an Exchange access policy.
//     Until all three exist, sending answers 'microsoft_not_connected'.
//   GOOGLE_PLACES_KEY — shared with places-proxy, for the rating line.
//   SB_SECRET_KEY — the project's elevated key, as in places-proxy.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { encode as b64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { buildReviewEmail } from './build.js';

const CORS = {
  'Access-Control-Allow-Origin': 'https://soramithril.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SECRET_KEY = Deno.env.get('SB_SECRET_KEY') || '';
const SENDER = 'hello@jeffsjunk.ca';
const PLACE_ID = 'ChIJO526yTG9KogRwrEXa6bIjZA';
// The pictures are the site's own files, attached inside each email.
const ASSETS = 'https://soramithril.github.io/jeffs-junk/assets/email/';
const STAFF = ['developer', 'owner', 'lead', 'office'];
const DAY_MS = 86400000;
// CASL: only customers from the last two years.
const TWO_YEARS_MS = 730 * DAY_MS;
const PART_KEYS = ['heading', 'p1', 'p2', 'tip', 'closing'];

class Refusal extends Error {
  status: number;
  constructor(code: string, status: number) { super(code); this.status = status; }
}

async function rest(path: string, init: RequestInit = {}) {
  const resp = await fetch(SB_URL + '/rest/v1/' + path, {
    ...init,
    headers: { apikey: SECRET_KEY, Authorization: 'Bearer ' + SECRET_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!resp.ok) throw new Error('db ' + resp.status + ' ' + (await resp.text()).slice(0, 200));
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

// A signed-in member of staff, or a refusal. The platform's verify_jwt gate also passes
// the publishable key every visitor has, so check the user and their tier — the same
// check places-proxy and ai-advisor make, plus the tier.
async function staffMember(auth: string) {
  const userResp = await fetch(SB_URL + '/auth/v1/user', { headers: { Authorization: auth, apikey: SECRET_KEY } });
  if (!userResp.ok) throw new Refusal('not_signed_in', 401);
  const user = await userResp.json();
  const rows = await rest('user_profiles?select=role,username&id=eq.' + encodeURIComponent(user.id));
  const role = String(rows?.[0]?.role || '').toLowerCase();
  if (!STAFF.includes(role)) throw new Refusal('not_staff', 403);
  return { role, username: String(rows[0].username || user.email || '') };
}

async function setting(key: string) {
  const rows = await rest('jwg_app_settings?select=value&key=eq.' + encodeURIComponent(key));
  return rows?.[0]?.value ?? null;
}

// "4.9 from 258 Google reviews". Asked of Google at most once a day — the first preview
// or send of the day refreshes it — and kept in jwg_app_settings 'google_rating'.
async function googleRating() {
  const kept = await setting('google_rating');
  if (kept && Date.now() - Date.parse(kept.checked_at) < DAY_MS) return kept;
  const key = Deno.env.get('GOOGLE_PLACES_KEY');
  if (!key) throw new Refusal('google_not_configured', 503);
  const resp = await fetch('https://places.googleapis.com/v1/places/' + PLACE_ID, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'rating,userRatingCount' },
  });
  if (!resp.ok) throw new Error('google_' + resp.status + ' ' + (await resp.text()).slice(0, 200));
  await rest('rpc/bump_google_api', { method: 'POST', body: JSON.stringify({ p_api: 'places_details' }) });
  const data = await resp.json();
  const fresh = { rating: data.rating, count: data.userRatingCount, checked_at: new Date().toISOString() };
  if (typeof fresh.rating !== 'number' || typeof fresh.count !== 'number') throw new Error('google_no_rating');
  await rest('jwg_app_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: 'google_rating', value: fresh, updated_at: fresh.checked_at }),
  });
  return fresh;
}

function readParts(body: Record<string, unknown>) {
  const parts: Record<string, string> = {};
  for (const k of PART_KEYS) {
    const v = String(body[k] ?? '');
    if (v.length > 2000) throw new Refusal('too_long', 400);
    parts[k] = v;
  }
  return parts;
}

async function microsoftToken() {
  const tenant = Deno.env.get('MS_TENANT_ID'), id = Deno.env.get('MS_CLIENT_ID'), secret = Deno.env.get('MS_CLIENT_SECRET');
  if (!tenant || !id || !secret) throw new Refusal('microsoft_not_connected', 503);
  const resp = await fetch('https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  if (!resp.ok) throw new Error('microsoft_token_' + resp.status + ' ' + (await resp.text()).slice(0, 300));
  return (await resp.json()).access_token as string;
}

// Every cid: picture in the email, fetched from the site and attached inside it.
async function inlinePictures(html: string) {
  const names = [...new Set([...html.matchAll(/src="cid:([^"]+)"/g)].map((m) => m[1]))];
  return Promise.all(names.map(async (name) => {
    const resp = await fetch(ASSETS + name);
    if (!resp.ok) throw new Error('picture_' + resp.status + ' ' + name);
    return {
      '@odata.type': '#microsoft.graph.fileAttachment',
      name,
      contentType: name.endsWith('.png') ? 'image/png' : 'image/jpeg',
      contentBytes: b64(new Uint8Array(await resp.arrayBuffer())),
      contentId: name,
      isInline: true,
    };
  }));
}

async function send(body: Record<string, unknown>, who: { role: string; username: string }) {
  // Hidden until Jake turns it on (his switch on the Email Templates page); he can always send.
  if (who.role !== 'developer' && (await setting('review_email_on')) !== true) throw new Refusal('switched_off', 403);

  const jobId = String(body.job_id || '');
  const rows = await rest('jobs?select=job_id,service,status,emails,no_email,date,created_at&job_id=eq.' + encodeURIComponent(jobId));
  const job = rows?.[0];
  if (!job) throw new Refusal('job_not_found', 404);
  if (job.service === 'Extra Jobs') throw new Refusal('extra_jobs', 400);
  if (job.status === 'Cancelled') throw new Refusal('cancelled', 400);
  if (job.no_email) throw new Refusal('no_email', 400);
  const to = String((Array.isArray(job.emails) && job.emails[0]) || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Refusal('no_address', 400);
  if (Date.now() - Date.parse(job.date || job.created_at) > TWO_YEARS_MS) throw new Refusal('too_old', 400);

  const subject = String(body.subject || '').trim();
  if (!subject) throw new Refusal('subject_missing', 400);
  const html = buildReviewEmail(readParts(body), job.service, await googleRating());

  const token = await microsoftToken();
  const resp = await fetch('https://graph.microsoft.com/v1.0/users/' + SENDER + '/sendMail', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        attachments: await inlinePictures(html),
      },
      saveToSentItems: true,
    }),
  });
  // Graph answers 202 Accepted with no body when the mail is on its way.
  if (resp.status !== 202) throw new Error('microsoft_send_' + resp.status + ' ' + (await resp.text()).slice(0, 300));
  console.log('review email sent', jobId, 'by', who.username);
  return { sent: true, to };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const who = await staffMember(req.headers.get('authorization') || '');
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.mode === 'preview') {
      return json({ html: buildReviewEmail(readParts(body), String(body.service || ''), await googleRating()) });
    }
    if (body.mode === 'send') return json(await send(body, who));
    return json({ error: 'bad_mode' }, 400);
  } catch (err) {
    if (err instanceof Refusal) return json({ error: err.message }, err.status);
    // Never let a key reach the browser, whatever an exception message contains.
    const msg = ((err as Error).message || '').replace(/AIza[\w-]+/g, '***');
    console.error('review-email failed', msg);
    return json({ error: 'exception', detail: msg }, 500);
  }
});
