// send-push — web push notifications for the Jeff's Junk dashboard.
// Actions (POST JSON):
//   {action:'public-key'}                     -> returns the VAPID public key; generates
//                                                the keypair + trigger secret on first call.
//   {action:'notify', secret, event, ...}     -> sends pushes for an event. `secret` must
//                                                match push_config.trigger_secret (only the
//                                                DB trigger / cron jobs know it).
// Events (recipients per Jake, 2026-07-10):
//   quote-created {name, city}  -> Jeff
//   daily-bins                  -> Jeff, Barbara, Jake (counts today's bin drops + pickups)
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const RECIPIENTS: Record<string, string[]> = {
  'quote-created': ['jeff@jeffwhitegroup.com'],
  'daily-bins': ['jeff@jeffwhitegroup.com', 'barbara@jeffwhitegroup.com', 'jakewhite97@hotmail.com', 'soramithril@gmail.com'],
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};

function b64u(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getConfig() {
  let { data } = await db.from('push_config').select('*').eq('id', 1).maybeSingle();
  if (!data) {
    // First run: generate the VAPID keypair + trigger secret server-side so the
    // private key never leaves the database.
    const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey) as { d: string };
    const row = {
      id: 1,
      vapid_public_key: b64u(raw),
      vapid_private_key: jwk.d,
      trigger_secret: b64u(crypto.getRandomValues(new Uint8Array(24))),
    };
    const ins = await db.from('push_config').insert(row).select().single();
    if (ins.error) {  // lost a race with another instance — use theirs
      const rr = await db.from('push_config').select('*').eq('id', 1).single();
      data = rr.data;
    } else {
      data = ins.data;
    }
  }
  return data!;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const body = await req.json().catch(() => ({}));
  const cfg = await getConfig();

  if (body.action === 'public-key') {
    return new Response(JSON.stringify({ publicKey: cfg.vapid_public_key }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (body.action === 'notify') {
    if (!cfg.trigger_secret || body.secret !== cfg.trigger_secret) {
      return new Response('forbidden', { status: 403, headers: CORS });
    }
    let title = "Jeff's Junk";
    let msg = '';
    if (body.event === 'quote-created') {
      title = '\u{1F4CB} New junk quote';
      msg = [body.name, body.city].filter(Boolean).join(' — ') || 'A new junk quote was booked.';
    } else if (body.event === 'daily-bins') {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
      const [dr, pu] = await Promise.all([
        db.from('jobs').select('job_id', { count: 'exact', head: true }).eq('bin_dropoff', today).neq('status', 'Cancelled'),
        db.from('jobs').select('job_id', { count: 'exact', head: true }).eq('bin_pickup', today).neq('status', 'Cancelled'),
      ]);
      const d = dr.count ?? 0, p = pu.count ?? 0;
      title = '\u{1F69B} Today’s bins';
      msg = `${d} bin drop${d !== 1 ? 's' : ''} · ${p} pickup${p !== 1 ? 's' : ''}`;
    } else {
      return new Response('unknown event', { status: 400, headers: CORS });
    }

    const emails = RECIPIENTS[body.event] ?? [];
    const { data: subs } = await db.from('push_subscriptions').select('*').in('email', emails);
    webpush.setVapidDetails('mailto:hello@jeffsjunk.ca', cfg.vapid_public_key, cfg.vapid_private_key);
    const results = await Promise.all((subs ?? []).map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body: msg, url: './' }),
      ).then(() => 'ok').catch(async (e: { statusCode?: number; message?: string }) => {
        if (e.statusCode === 404 || e.statusCode === 410) {  // device unsubscribed
          await db.from('push_subscriptions').delete().eq('id', s.id);
          return 'expired';
        }
        console.error('push failed:', s.email, e.statusCode, e.message);
        return 'error';
      })
    ));
    return new Response(JSON.stringify({ recipients: subs?.length ?? 0, results }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  return new Response('bad request', { status: 400, headers: CORS });
});
