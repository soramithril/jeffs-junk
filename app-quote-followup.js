// ── QUOTE FOLLOW-UPS ───────────────────────────────────────────────────────
// Kelly's ask (2026-10-16): see which Junk Quotes turned into jobs and which didn't,
// and chase the ones that didn't. Three jobs columns carry it — quote_outcome
// (booked | lost | null = still open), quote_job_id, quote_note + quote_followed_up_at.
// They are written ONLY here, through patchJob, and are deliberately left out of
// jobToDb: saving a quote in the booking form can never wipe them.
//
// Two places show it, both big on purpose (Jake: "big and clear so it's easily
// noticeable"): the dashboard card #dash-quote-followups, and the box at the top of
// a quote's Job details (#det-quote-box). Its own query, like Review follow-ups —
// the in-memory `jobs` array only holds the current week.
//
// "Not going ahead" counts cancelled quotes too: a cancelled quote visit is a quote
// that didn't book. The 66 quotes that were already booked by hand before this
// existed were matched by address on 2026-10-16 and say so in their note.
var QF_START = '2026-01-01';   // the tally counts this year's quotes
var QF_COLS = 'job_id,name,status,date,junk_date,price,address,city,quote_outcome,quote_job_id,quote_note,quote_followed_up_at';

function _qfDay(row){ return row.junk_date || row.date || ''; }
function _qfLost(row){ return row.quote_outcome === 'lost' || row.status === 'Cancelled'; }
function _qfShortDate(ymd){
  return new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric'});
}

async function renderQuoteFollowups(){
  var el = document.getElementById('dash-quote-followups');
  if(!el) return;
  var r = await db.from('jobs').select(QF_COLS).eq('service', 'Junk Quote')
    .or('junk_date.gte.' + QF_START + ',date.gte.' + QF_START);
  if(r.error) throw new Error('Quote follow-ups query failed: ' + r.error.message);
  var today = todayStr();
  var rows = (r.data || []).filter(function(q){ return _qfDay(q) >= QF_START; });
  var booked = rows.filter(function(q){ return q.quote_outcome === 'booked'; }).length;
  var lost = rows.filter(_qfLost).length;
  // Open = the visit has happened and nobody has said how it went. A quote still to
  // be visited is not a follow-up yet.
  var open = rows.filter(function(q){
    return !q.quote_outcome && q.status !== 'Cancelled' && _qfDay(q) && _qfDay(q) <= today;
  }).sort(function(a, b){
    // Never chased first, then newest visit first — a fresh quote is the one most
    // worth a call.
    var fa = a.quote_followed_up_at ? 1 : 0, fb = b.quote_followed_up_at ? 1 : 0;
    if(fa !== fb) return fa - fb;
    return _qfDay(a) < _qfDay(b) ? 1 : _qfDay(a) > _qfDay(b) ? -1 : 0;
  });

  var tile = function(n, label, fg, bg){
    return '<div style="flex:1 1 150px;background:' + bg + ';border-radius:14px;padding:14px 18px">'
      + '<div style="font-size:34px;font-weight:900;line-height:1;color:' + fg + '">' + n + '</div>'
      + '<div style="font-size:14px;font-weight:800;color:' + fg + ';margin-top:6px">' + label + '</div></div>';
  };
  var tiles = '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">'
    + tile(booked, '✅ Booked', '#15803d', '#dcfce7')
    + tile(open.length, '📞 Need a follow-up', '#b45309', '#fef3c7')
    + tile(lost, '✕ Not going ahead', '#475569', '#f1f5f9')
    + '</div>';

  var rowsHtml = open.length ? open.map(function(q){
    var day = _qfDay(q);
    var days = Math.round((new Date(today + 'T12:00:00') - new Date(day + 'T12:00:00')) / 86400000);
    var addr = [q.address, q.city].filter(Boolean).join(', ');
    var meta = ['Quote visit ' + _qfShortDate(day) + ' · ' + (days === 0 ? 'today' : days === 1 ? '1 day ago' : days + ' days ago'),
                q.price ? '$' + q.price : '', addr].filter(Boolean).map(escHtml).join(' · ');
    var chased = q.quote_followed_up_at
      ? '<div style="font-size:14px;font-weight:700;color:#1d4ed8;margin-top:4px">📞 Followed up ' + _qfShortDate(q.quote_followed_up_at.slice(0, 10))
        + (q.quote_note ? ': ' + escHtml(q.quote_note) : '') + '</div>'
      : '';
    return '<div style="background:#fffdf5;border:1px solid var(--border);border-left:5px solid #f59e0b;border-radius:12px;padding:14px 16px;margin-bottom:8px">'
      + '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px">'
        + '<div style="flex:1 1 260px;min-width:0;cursor:pointer" onclick="openDetail(\'' + q.job_id + '\')">'
          + '<div style="font-size:17px;font-weight:800">' + escHtml(q.name || ('Quote ' + q.job_id)) + '</div>'
          + '<div style="font-size:13px;color:var(--muted);margin-top:2px">' + meta + '</div>'
          + chased
        + '</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:8px">' + _qfButtons(q.job_id, 'card', true) + '</div>'
      + '</div>'
      + '<div id="qf-card-' + q.job_id + '"></div>'
    + '</div>';
  }).join('') : '<div style="font-size:15px;font-weight:700;color:#15803d;padding:6px 4px">Every quote has been followed up. 👍</div>';

  el.innerHTML = '<div class="chart-card" style="padding:18px;box-shadow:0 8px 28px rgba(0,0,0,.07)">'
    + '<div style="display:flex;align-items:center;gap:9px;margin-bottom:3px;padding:0 4px">'
      + '<span class="jj-sec-chip warm"></span>'
      + '<span style="font-size:15px;font-weight:900;text-transform:uppercase;letter-spacing:.6px;color:var(--accent-warm)">Junk quotes</span>'
    + '</div>'
    + '<div style="font-size:13px;color:var(--muted);padding:0 4px 12px">This year\'s quotes — which ones turned into jobs, and the ones still waiting on a call.</div>'
    + tiles
    + (open.length ? '<div style="max-height:620px;overflow-y:auto;overflow-x:hidden">' + rowsHtml + '</div>' : rowsHtml)
  + '</div>';
}

// The buttons, shared by the dashboard row and the quote's own box (which draws its
// own, bigger Convert above them).
function _qfButtons(id, where, withConvert){
  var ghost = 'font-family:inherit;font-size:14px;font-weight:800;padding:11px 16px;border-radius:10px;cursor:pointer;background:var(--surface);';
  return (withConvert ? '<button class="djj-btn green" onclick="event.stopPropagation();qfConvert(\'' + id + '\')" style="font-size:15px;padding:12px 20px;border-radius:10px">⚡ Convert to job</button>' : '')
    + '<button onclick="event.stopPropagation();qfAsk(\'' + id + '\',\'' + where + '\',\'booked\')" style="' + ghost + 'border:2px solid #16a34a;color:#15803d">✓ Already booked</button>'
    + '<button onclick="event.stopPropagation();qfAsk(\'' + id + '\',\'' + where + '\',\'note\')" style="' + ghost + 'border:2px solid #2563eb;color:#1d4ed8">📞 Followed up</button>'
    + '<button onclick="event.stopPropagation();qfLost(\'' + id + '\')" style="' + ghost + 'border:2px solid var(--border-strong);color:var(--muted)">✕ Not going ahead</button>';
}

// One small inline box under the buttons: a job number for "Already booked", a note
// for "Followed up".
function qfAsk(id, where, kind){
  var box = document.getElementById('qf-' + where + '-' + id);
  if(!box) throw new Error('qfAsk: no box for ' + where + ' ' + id);
  var ph = kind === 'booked' ? 'Job number it was booked as, e.g. 40156' : 'What happened? e.g. left a voicemail, wants it in spring';
  box.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">'
    + '<input id="qf-in-' + where + '-' + id + '" placeholder="' + ph + '" style="flex:1 1 260px;font-size:15px;padding:11px 13px;border:2px solid var(--border-strong);border-radius:10px;font-family:inherit" onkeydown="if(event.key===\'Enter\')qfSave(\'' + id + '\',\'' + where + '\',\'' + kind + '\')">'
    + '<button class="djj-btn green" onclick="qfSave(\'' + id + '\',\'' + where + '\',\'' + kind + '\')" style="font-size:14px;padding:11px 18px;border-radius:10px">Save</button>'
    + '<button onclick="document.getElementById(\'qf-' + where + '-' + id + '\').innerHTML=\'\'" style="font-family:inherit;font-size:14px;font-weight:700;padding:11px 14px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface);color:var(--muted);cursor:pointer">Cancel</button>'
  + '</div>';
  document.getElementById('qf-in-' + where + '-' + id).focus();
}

async function qfSave(id, where, kind){
  var val = document.getElementById('qf-in-' + where + '-' + id).value.trim();
  if(!val){ toast(kind === 'booked' ? 'Type the job number first.' : 'Type a short note first.', 'error'); return; }
  if(kind === 'booked'){
    var r = await db.from('jobs').select('job_id,service').eq('job_id', val).maybeSingle();
    if(r.error) throw new Error('Job lookup failed: ' + r.error.message);
    if(!r.data){ toast('There is no job ' + val + ' — check the number.', 'error'); return; }
    if(r.data.service === 'Junk Quote'){ toast(val + ' is another quote, not a job.', 'error'); return; }
    await _qfPatch(id, {quote_outcome:'booked', quote_job_id:val});
    toast('✅ Quote ' + id + ' marked booked as job ' + val + '.');
  } else {
    await _qfPatch(id, {quote_note:val, quote_followed_up_at:new Date().toISOString()});
    toast('📞 Follow-up saved.');
  }
}

async function qfLost(id){
  await _qfPatch(id, {quote_outcome:'lost'});
  toast('Quote ' + id + ' marked not going ahead. Open the quote to undo.');
}

async function qfReopen(id){
  await _qfPatch(id, {quote_outcome:null, quote_job_id:null});
  toast('Quote ' + id + ' is open again.');
}

// Called by saveJob once a job made with Convert to job has saved.
function quoteMarkBooked(quoteId, jobId){
  _qfPatch(quoteId, {quote_outcome:'booked', quote_job_id:jobId});
}

async function _qfPatch(id, fields){
  var r = await patchJob(id, fields);
  if(r.error) return;            // patchJob already said so and put the screen back
  renderQuoteFollowups();
  var box = document.getElementById('det-quote-box');
  if(box && box.dataset.qid === id) renderQuoteDetailBox(id);
}

// convertQuoteToJob reads the quote out of the in-memory `jobs` array, which only
// holds this week — a quote from last month has to be fetched in first.
async function qfConvert(id){
  if(!jobs.some(function(j){ return j.id === id; })){
    var r = await db.from('jobs').select('*').eq('job_id', id).single();
    if(r.error) throw new Error('Could not load quote ' + id + ': ' + r.error.message);
    jobs.push(dbToJob(r.data));
  }
  convertQuoteToJob(id);
}

// The box at the top of a quote's Job details.
async function renderQuoteDetailBox(id){
  var el = document.getElementById('det-quote-box');
  if(!el) return;
  var r = await db.from('jobs').select(QF_COLS).eq('job_id', id).single();
  if(r.error) throw new Error('Quote box query failed: ' + r.error.message);
  var q = r.data;
  if(document.getElementById('det-quote-box') !== el || el.dataset.qid !== id) return;   // another job opened meanwhile
  if(q.status === 'Cancelled'){ el.innerHTML = ''; return; }
  var note = q.quote_note
    ? '<div style="font-size:14px;margin-top:8px;color:var(--text-secondary)">' + (q.quote_followed_up_at ? '📞 ' + _qfShortDate(q.quote_followed_up_at.slice(0, 10)) + ': ' : '') + escHtml(q.quote_note) + '</div>'
    : '';
  var reopen = '<button onclick="qfReopen(\'' + id + '\')" style="margin-top:10px;background:none;border:none;padding:0;font-family:inherit;font-size:13px;font-weight:700;color:var(--muted);text-decoration:underline;cursor:pointer">Not right? Reopen this quote</button>';
  if(q.quote_outcome === 'booked'){
    el.innerHTML = '<div style="background:#dcfce7;border:2px solid #16a34a;border-radius:14px;padding:16px 18px;margin-bottom:14px">'
      + '<div style="font-size:22px;font-weight:900;color:#15803d">✅ BOOKED</div>'
      + '<div style="font-size:15px;font-weight:700;margin-top:4px">This quote became job ' + escHtml(q.quote_job_id || '') + '.</div>'
      + (q.quote_job_id ? '<button class="djj-btn green" onclick="openDetail(\'' + q.quote_job_id + '\')" style="margin-top:10px;font-size:14px;padding:10px 18px;border-radius:10px">Open job ' + escHtml(q.quote_job_id) + '</button>' : '')
      + note + '<div>' + reopen + '</div></div>';
    return;
  }
  if(q.quote_outcome === 'lost'){
    el.innerHTML = '<div style="background:#f1f5f9;border:2px solid #94a3b8;border-radius:14px;padding:16px 18px;margin-bottom:14px">'
      + '<div style="font-size:22px;font-weight:900;color:#475569">✕ NOT GOING AHEAD</div>'
      + note + '<div>' + reopen + '</div></div>';
    return;
  }
  el.innerHTML = '<div style="background:#fffbeb;border:2px solid #f59e0b;border-radius:14px;padding:16px 18px;margin-bottom:14px">'
    + '<div style="font-size:15px;font-weight:900;color:#b45309;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Did this quote turn into a job?</div>'
    + '<button class="djj-btn green" onclick="qfConvert(\'' + id + '\')" style="width:100%;justify-content:center;font-size:19px;padding:16px 20px;border-radius:12px">⚡ Convert quote to job</button>'
    + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">'
      + _qfButtons(id, 'det', false)
    + '</div>'
    + '<div id="qf-det-' + id + '"></div>'
    + note
  + '</div>';
}
