// New staff logins for the dashboard's Users page (2026-10-16).
//
// The Users page used to call auth.signUp straight from the browser, which only works
// while PUBLIC sign-up is switched on — and with it on, anyone who found the site could
// make their own login. Public sign-up is now off, so new logins are made here instead,
// with the project's secret key, and only for a signed-in admin (developer, owner or
// lead — the same people the database lets add a user_profiles row, see is_admin()).
//
// The login is created already confirmed, so the person can sign in straight away, and
// its staff profile is written in the same call: a login without a profile can see
// nothing (see migration 20261016_staff_only_access).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': 'https://soramithril.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SECRET_KEY = Deno.env.get('SB_SECRET_KEY') || '';
const URL_BASE = Deno.env.get('SUPABASE_URL') || '';
const ADMIN_ROLES = ['developer', 'owner', 'lead'];
const ROLES = ['developer', 'owner', 'lead', 'office', 'yard', 'display'];

const asAdmin = { 'Content-Type': 'application/json', apikey: SECRET_KEY, Authorization: 'Bearer ' + SECRET_KEY };

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });

  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const userResp = await fetch(URL_BASE + '/auth/v1/user', {
      headers: { Authorization: req.headers.get('authorization') || '', apikey: SECRET_KEY },
    });
    if (!userResp.ok) return json({ error: 'Not signed in.' }, 401);
    const caller = await userResp.json();

    const profResp = await fetch(URL_BASE + '/rest/v1/user_profiles?select=role&id=eq.' + caller.id, { headers: asAdmin });
    const prof = (await profResp.json())[0];
    if (!prof || !ADMIN_ROLES.includes(String(prof.role || '').toLowerCase())) {
      return json({ error: 'Only owners and leads can add logins.' }, 403);
    }

    const body = await req.json() as Record<string, unknown>;
    const email = String(body.email ?? '').trim();
    const password = String(body.password ?? '');
    const username = String(body.username ?? '').trim();
    const role = String(body.role ?? '');
    const canDelete = body.can_delete === true;
    if (!email || !username) return json({ error: 'Email and username are required.' }, 400);
    if (password.length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400);
    if (!ROLES.includes(role)) return json({ error: 'Unknown role: ' + role }, 400);

    const createResp = await fetch(URL_BASE + '/auth/v1/admin/users', {
      method: 'POST',
      headers: asAdmin,
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const created = await createResp.json();
    if (!createResp.ok) return json({ error: created.msg || created.message || 'Could not create the login.' }, 400);

    const insResp = await fetch(URL_BASE + '/rest/v1/user_profiles', {
      method: 'POST',
      headers: { ...asAdmin, Prefer: 'return=minimal' },
      body: JSON.stringify({ id: created.id, username, role, can_delete: canDelete }),
    });
    if (!insResp.ok) {
      // A login with no profile is useless and would block a retry with the same email.
      const why = await insResp.text();
      await fetch(URL_BASE + '/auth/v1/admin/users/' + created.id, { method: 'DELETE', headers: asAdmin });
      return json({ error: 'Profile insert failed: ' + why }, 400);
    }

    return json({ id: created.id });
  } catch (e) {
    console.error('create-staff-login failed', e);
    return json({ error: String(e) }, 500);
  }
});
