// AI Advisor — Gemini proxy for the Jeff's Junk dashboard (employees only).
// Modes: analysis | digest | question | winback | search.
// GEMINI_API_KEY must be set as an Edge Function secret (Supabase dashboard →
// Edge Functions → Secrets). Until it is, every call returns {error:'not_configured'}
// and the dashboard shows setup instructions.
// Privacy by design: the dashboard sends aggregate stats, anonymized win-back rows
// (index + counts, no names), or just the user's typed question — never customer records.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': 'https://soramithril.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Model ids retire over time — and being listed by the API does NOT mean a new
// key may call it (gemini-2.5-flash lists fine but 404s for new keys). When a
// mode starts returning gemini_404, call mode 'models' to see what this key can
// actually use, then update this map. That is the whole fix.
const MODELS: Record<string, string> = {
  analysis: 'gemini-3.5-flash',
  digest: 'gemini-3.5-flash',
  question: 'gemini-3.5-flash',
  winback: 'gemini-3.5-flash-lite',
  search: 'gemini-3.5-flash-lite',
};

// Gemini 3.x thinking is billed against this same ceiling, so these are sized
// well above the visible answer or the reply gets starved and truncated.
const MAX_TOKENS: Record<string, number> = {
  analysis: 8000, digest: 3000, question: 5000, winback: 4000, search: 2000,
};

const BUSINESS = "Jeff's Junk is a junk removal and dumpster bin rental company serving Barrie, Innisfil and nearby towns in Ontario, Canada. Services: Bin Rental (4/7/14/20 yard bins), Junk Removal, Junk Quote (an estimate visit), Furniture Delivery and Furniture Pickup (charity furniture bank runs), and Extra Jobs (odd labour jobs). The reader is the owner and office staff — plain language, no jargon, no hedging boilerplate.";

const SEARCH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: 'customer name fragment, if mentioned' },
    city: { type: 'STRING', description: 'town/city name, if mentioned' },
    address: { type: 'STRING', description: 'street fragment, if mentioned' },
    item: { type: 'STRING', description: 'ONE keyword likely to appear in the job item list, e.g. couch' },
    service: { type: 'STRING', enum: ['Bin Rental', 'Junk Removal', 'Junk Quote', 'Furniture Delivery', 'Furniture Pickup', 'Extra Jobs'] },
    status: { type: 'STRING', enum: ['active', 'Completed', 'Cancelled', 'Postponed'] },
    date_from: { type: 'STRING', description: 'YYYY-MM-DD' },
    date_to: { type: 'STRING', description: 'YYYY-MM-DD' },
    summary: { type: 'STRING', description: 'short human-readable description of the interpreted search' },
  },
  required: ['summary'],
};

const WINBACK_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      n: { type: 'INTEGER', description: 'the customer row number from the input' },
      reason: { type: 'STRING', description: 'one short sentence: why call them and what to offer' },
    },
    required: ['n', 'reason'],
  },
};

function prompt(mode: string, body: Record<string, unknown>): string {
  const data = JSON.stringify(body.data ?? {});
  const today = String(body.today ?? '');
  if (mode === 'analysis') {
    return BUSINESS + '\n\nToday is ' + today + '. Below is live aggregate business data (monthly job counts over several years, year-over-year numbers, per-city breakdowns, bin demand and fleet, repeat-customer stats, quote conversion, cancellations, lead times, and more).\n\nWrite a business analysis with exactly these sections:\n## The Verdict — 2-3 sentences on how the business is doing right now.\n## Connections & Anomalies — what the numbers say when read together, and anything unusual or off-pattern worth investigating. Only claim what the data actually shows.\n## Seasonal Outlook — what the same months in prior years suggest about the next 4-8 weeks, with rough numbers.\n## Do This Next — 3 to 5 concrete, specific actions, most valuable first.\n\nUse short paragraphs and "- " bullets. Bold key figures with **. No preamble, no closing pleasantries.\n\nDATA:\n' + data;
  }
  if (mode === 'digest') {
    return BUSINESS + '\n\nToday is ' + today + '. Using the aggregate data below, write a Monday-morning digest of about 120-150 words: how the current month is tracking against the same month last year, one thing to watch this week, and one thing to do. Plain sentences, "- " bullets allowed, bold key figures with **. No preamble.\n\nDATA:\n' + data;
  }
  if (mode === 'question') {
    return BUSINESS + '\n\nToday is ' + today + '. Answer the question below using ONLY the aggregate data provided. Work the numbers out step by step but reply with just the answer and the key figures behind it, concisely. If the data cannot answer it, say exactly what data is missing — do not guess.\n\nDATA:\n' + data + '\n\nQUESTION: ' + String(body.question ?? '');
  }
  if (mode === 'winback') {
    return BUSINESS + '\n\nToday is ' + today + '. Below are lapsed repeat customers, anonymized: n = row number, jobs = how many times they booked, monthsSince = months since their last job, avgGapMonths = their usual gap between bookings when active (null if unknown). Rank the 10 best win-back calls — favour customers whose silence is unusual for THEM (monthsSince far beyond their usual gap) and who booked often. Return JSON only.\n\nCUSTOMERS:\n' + JSON.stringify(body.customers ?? []);
  }
  if (mode === 'search') {
    return "Convert an office worker's question about jobs in a junk removal company database into search filters. Today is " + today + " — resolve relative dates (last month, this summer, July) into YYYY-MM-DD ranges. 'item' must be a single likely keyword (e.g. couch, mattress, concrete). Only include fields the question actually implies. 'active' status means the job is open/upcoming. Return JSON only.\n\nQUESTION: " + String(body.question ?? '');
  }
  throw new Error('unknown mode');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    // Employees only: the caller's JWT must belong to a real signed-in user.
    // (The platform's verify_jwt gate also passes the anon key, so check the user.)
    const auth = req.headers.get('authorization') || '';
    const userResp = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', {
      headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') || '' },
    });
    if (!userResp.ok) return json({ error: 'not_signed_in' }, 401);

    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'not_configured' });

    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode ?? '');

    // Diagnostic: ask Google which models THIS key may call. Model names change
    // over time and get retired for new keys — this is how we pick correct ids
    // without guessing. Returns names only; never the key.
    if (mode === 'models') {
      const listResp = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + key);
      if (!listResp.ok) {
        const t = await listResp.text();
        return json({ error: 'list_' + listResp.status, detail: t.replace(/key=[\w-]+/g, 'key=***').slice(0, 400) }, 502);
      }
      const listed = await listResp.json();
      const usable = (listed.models || [])
        .filter((m: Record<string, unknown>) =>
          ((m.supportedGenerationMethods as string[]) || []).indexOf('generateContent') > -1)
        .map((m: Record<string, unknown>) => String(m.name).replace('models/', ''));
      return json({ models: usable });
    }

    if (!MODELS[mode]) return json({ error: 'bad_mode' }, 400);

    const generationConfig: Record<string, unknown> = {
      temperature: mode === 'search' || mode === 'winback' ? 0.2 : 0.4,
      maxOutputTokens: MAX_TOKENS[mode],
    };
    if (mode === 'search') {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = SEARCH_SCHEMA;
    } else if (mode === 'winback') {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = WINBACK_SCHEMA;
    }

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODELS[mode] + ':generateContent?key=' + key;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt(mode, body) }] }],
        generationConfig,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      // Never echo the key back to the browser, whatever the error contains
      return json({ error: 'gemini_' + resp.status, detail: errText.replace(/key=[\w-]+/g, 'key=***').slice(0, 500) }, 502);
    }

    const dataResp = await resp.json();
    if (body.debug) return json({ raw: dataResp });
    // Gemini 3.x returns thinking alongside the answer: content.parts can hold
    // thought parts (thought:true) before the real text, and the answer itself
    // can span several parts. Take every non-thought part, in order.
    const parts = (dataResp?.candidates?.[0]?.content?.parts ?? []) as Array<Record<string, unknown>>;
    const text = parts
      .filter((p) => p.thought !== true && typeof p.text === 'string')
      .map((p) => p.text as string)
      .join('');
    const finish = dataResp?.candidates?.[0]?.finishReason ?? '';
    if (!text) return json({ error: 'empty_response', detail: 'finishReason=' + finish + ' parts=' + parts.length }, 502);
    if (finish === 'MAX_TOKENS') return json({ error: 'truncated', detail: 'The answer hit the token ceiling.' }, 502);

    if (mode === 'search' || mode === 'winback') {
      try { return json({ result: JSON.parse(text) }); }
      catch { return json({ error: 'bad_json_from_model', detail: text.slice(0, 300) }, 502); }
    }
    return json({ text });
  } catch (err) {
    // Exception messages can contain the request URL (which carries the key) — scrub it
    const msg = ((err as Error).message || '').replace(/key=[\w-]+/g, 'key=***');
    return json({ error: 'exception', detail: msg }, 500);
  }
});
