// ── JUNK QUOTES: booked, follow-up, not going ahead ────────────────────────
// Kelly's ask (2026-10-16): see which Junk Quotes turned into jobs and which didn't,
// and chase the ones that didn't. Four jobs columns carry it — quote_outcome
// (booked | lost | null = still open), quote_job_id, quote_note, quote_followed_up_at.
// They are written ONLY here, through patchJob, and are deliberately left out of
// jobToDb: saving a quote in the booking form can never wipe them.
//
// Five places show it, all big on purpose (Jake: "big and clear so it's easily
// noticeable"):
//   - the Junk Quotes page (#jq-root): the year's tally and every quote, by outcome;
//   - the dashboard's Needs you card: ONLY quotes visited in the last QF_FRESH_DAYS
//     that are due a call (Jake, 2026-10-16 — the dashboard was getting full, and a
//     two-month-old quote is not a call anyone will make). renderNeedsYou in app.js
//     reads them from qfFreshQuotes();
//   - the Morning Brief (app-brief.js), one reminder line linking to the Junk Quotes page;
//   - the 1 pm nudge card, once a day, for whatever is still due by then;
//   - the box at the top of a quote's Job details (#det-quote-box).
//
// "Due" (Kelly, 2026-10-16: remind us about quotes that are neither booked nor
// marked not going ahead): never followed up, or followed up QF_SNOOZE_DAYS ago or
// more. "Followed up" puts a quote to sleep for a few days, never away for good —
// only Booked or Not going ahead does that.
// Own queries, like Review follow-ups — the in-memory `jobs` array only holds this week.
//
// "Not going ahead" counts cancelled quotes too: a cancelled quote visit is a quote
// that didn't book. Two catch-ups on 2026-10-16 say so in their notes: 66 quotes booked
// by hand were matched to their job by address, and 25 open quotes over 60 days old
// were closed as "No answer".
var QF_START = '2026-01-01';   // the tally counts this year's quotes
var QF_FRESH_DAYS = 14;        // how far back the dashboard looks
var QF_SNOOZE_DAYS = 3;        // "Followed up" brings the quote back after this many days
var QF_NUDGE_HOUR = 13;        // the afternoon nudge card, local time
var QF_COLS = 'job_id,name,status,date,junk_date,price,address,city,quote_outcome,quote_job_id,quote_note,quote_followed_up_at';
var _qfFresh = [];             // the dashboard's quote rows, filled by refreshQuoteNeedsYou
var _qfTab = 'open';           // Junk Quotes page: which outcome is listed

function _qfDay(row){ return row.junk_date || row.date || ''; }
function _qfLost(row){ return row.quote_outcome === 'lost' || row.status === 'Cancelled'; }
// Visited, and nobody has said how it went. A visit still to come isn't a follow-up yet.
function _qfOpen(row, today){ return !row.quote_outcome && row.status !== 'Cancelled' && _qfDay(row) && _qfDay(row) <= today; }
// Open, and nobody has called in the last QF_SNOOZE_DAYS.
function _qfDue(row, today){
  if(!_qfOpen(row, today)) return false;
  if(!row.quote_followed_up_at) return true;
  var back = new Date(row.quote_followed_up_at); back.setDate(back.getDate() + QF_SNOOZE_DAYS);
  return ymdLocal(back) <= today;
}
function _qfShortDate(ymd){
  return new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric'});
}
function _qfAgo(day, today){
  var n = Math.round((new Date(today + 'T12:00:00') - new Date(day + 'T12:00:00')) / 86400000);
  return n === 0 ? 'today' : n === 1 ? '1 day ago' : n + ' days ago';
}
function _qfMeta(q, today){
  return ['Quote visit ' + _qfShortDate(_qfDay(q)) + ' · ' + _qfAgo(_qfDay(q), today),
          q.price ? '$' + q.price : '', [q.address, q.city].filter(Boolean).join(', ')]
    .filter(Boolean).map(escHtml).join(' · ');
}
function _qfChased(q){
  return q.quote_followed_up_at
    ? '<div style="font-size:14px;font-weight:700;color:#1d4ed8;margin-top:4px">📞 Followed up ' + _qfShortDate(q.quote_followed_up_at.slice(0, 10))
      + (q.quote_note ? ': ' + escHtml(q.quote_note) : '') + '</div>'
    : '';
}

async function _qfQuery(since){
  var r = await db.from('jobs').select(QF_COLS).eq('service', 'Junk Quote')
    .or('junk_date.gte.' + since + ',date.gte.' + since);
  if(r.error) throw new Error('Junk quotes query failed: ' + r.error.message);
  return (r.data || []).filter(function(q){ return _qfDay(q) >= since; });
}

// ── The due ones: Needs you, the morning brief and the 1 pm nudge all read this ──
async function qfDueQuotes(){
  var today = todayStr();
  var d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - QF_FRESH_DAYS);
  var rows = await _qfQuery(ymdLocal(d));
  return rows.filter(function(q){ return _qfDue(q, today); })
    .sort(function(a, b){ return _qfDay(a) < _qfDay(b) ? 1 : _qfDay(a) > _qfDay(b) ? -1 : 0; });
}
async function refreshQuoteNeedsYou(){
  _qfFresh = await qfDueQuotes();
  renderNeedsYou();
  if(document.getElementById('qf-nudge')) _qfNudgePaint();
}
function qfFreshQuotes(){ return _qfFresh; }

// One Needs you row — the email rows' shape, with the quote's own buttons.
function qfNeedsYouRowHtml(q){
  return '<div class="ny-row" data-nyk="' + q.job_id + ':quote" style="background:#fffdf5;border:1px solid var(--border);border-left:3px solid #f59e0b;border-radius:12px;padding:13px 16px;margin-bottom:7px">'
    + '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px">'
      + '<span style="flex:none;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;background:#fef3c7">📞</span>'
      + '<div style="flex:1 1 220px;min-width:0;cursor:pointer" onclick="openDetail(\'' + q.job_id + '\')">'
        + '<div style="font-size:15px;font-weight:700">' + escHtml(q.name || ('Quote ' + q.job_id)) + ' — follow up on the quote</div>'
        + '<div style="font-size:13px;color:var(--muted)">' + _qfMeta(q, todayStr()) + '</div>'
        + _qfChased(q)
      + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px">' + _qfButtons(q.job_id, 'card', true) + '</div>'
    + '</div>'
    + '<div id="qf-card-' + q.job_id + '"></div>'
  + '</div>';
}

// ── The 1 pm nudge ──
// Once a day per browser, from QF_NUDGE_HOUR on, a card in the corner for the quotes
// still due. Never over the booking form or the morning brief: it waits a minute and
// asks again. Silent on purpose — sounds are for things a person just did.
function _qfNudgeTick(){
  if(!currentUser) return;
  if(new Date().getHours() < QF_NUDGE_HOUR) return;
  var today = todayStr();
  if(localStorage.getItem('jjQuoteNudgeDay') === today) return;
  if(document.getElementById('job-modal').classList.contains('open')) return;
  if(document.getElementById('morning-brief-modal').classList.contains('open')) return;
  localStorage.setItem('jjQuoteNudgeDay', today);   // checked = done for today, due or not
  refreshQuoteNeedsYou().then(function(){ if(_qfFresh.length) _qfNudgePaint(); });
}
setInterval(_qfNudgeTick, 60000);

var QF_NUDGE_ROWS = 3;   // more than this and it points at the Junk Quotes page instead
function _qfNudgePaint(){
  var el = document.getElementById('qf-nudge');
  if(!_qfFresh.length){
    if(!el) return;
    el.innerHTML = '<div style="font-size:17px;font-weight:800;color:#15803d">All answered ✓</div>';
    setTimeout(qfNudgeClose, 2500);
    return;
  }
  if(!el){
    el = document.createElement('div');
    el.id = 'qf-nudge';
    el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:450;width:min(460px,calc(100vw - 32px));max-height:75vh;overflow-y:auto;'
      + 'background:var(--surface);border:2px solid #f59e0b;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.22);padding:16px 18px;'
      + 'animation:jjPop 520ms cubic-bezier(.34,1.56,.64,1) both';
    document.body.appendChild(el);
  }
  var n = _qfFresh.length;
  var rows = _qfFresh.slice(0, QF_NUDGE_ROWS).map(function(q){
    return '<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px">'
      + '<div style="cursor:pointer" onclick="openDetail(\'' + q.job_id + '\')">'
        + '<div style="font-size:16px;font-weight:800">Did ' + escHtml(q.name || ('quote ' + q.job_id)) + ' book?</div>'
        + '<div style="font-size:13px;color:var(--muted)">' + _qfMeta(q, todayStr()) + '</div>'
        + _qfChased(q)
      + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">' + _qfButtons(q.job_id, 'nudge', false) + '</div>'
      + '<div id="qf-nudge-' + q.job_id + '"></div>'
    + '</div>';
  }).join('');
  var more = n > QF_NUDGE_ROWS
    ? '<button onclick="qfNudgeClose();go(\'junkquotes\')" style="margin-top:12px;background:none;border:none;padding:0;font-family:inherit;font-size:14px;font-weight:800;color:#b45309;text-decoration:underline;cursor:pointer">+ ' + (n - QF_NUDGE_ROWS) + ' more on the Junk Quotes page</button>'
    : '';
  el.innerHTML = '<div style="display:flex;align-items:flex-start;gap:10px">'
      + '<div style="flex:1;font-size:18px;font-weight:900;color:#b45309">📞 ' + n + (n === 1 ? ' quote is' : ' quotes are') + ' still waiting on an answer</div>'
      + '<button onclick="qfNudgeClose()" title="Later" style="flex:none;font-family:inherit;font-size:14px;font-weight:700;padding:6px 12px;border-radius:9px;border:1.5px solid var(--border);background:var(--surface);color:var(--muted);cursor:pointer">Later</button>'
    + '</div>'
    + rows + more;
}
function qfNudgeClose(){
  var el = document.getElementById('qf-nudge');
  if(el) el.remove();
}

// ── The Junk Quotes page ──
function qfTab(tab){ _qfTab = tab; renderJunkQuotesPage(); }

async function renderJunkQuotesPage(){
  var root = document.getElementById('jq-root');
  if(!root) throw new Error('renderJunkQuotesPage: #jq-root missing');
  var today = todayStr();
  var rows = await _qfQuery(QF_START);
  var lists = {
    open: rows.filter(function(q){ return _qfOpen(q, today); }).sort(function(a, b){
      // Never chased first, then newest visit first — a fresh quote is the one most worth a call.
      var fa = a.quote_followed_up_at ? 1 : 0, fb = b.quote_followed_up_at ? 1 : 0;
      if(fa !== fb) return fa - fb;
      return _qfDay(a) < _qfDay(b) ? 1 : _qfDay(a) > _qfDay(b) ? -1 : 0;
    }),
    booked: rows.filter(function(q){ return q.quote_outcome === 'booked'; }),
    lost: rows.filter(_qfLost)
  };
  ['booked', 'lost'].forEach(function(k){
    lists[k].sort(function(a, b){ return _qfDay(a) < _qfDay(b) ? 1 : _qfDay(a) > _qfDay(b) ? -1 : 0; });
  });

  var tile = function(key, label, fg, bg){
    var on = _qfTab === key;
    return '<button onclick="qfTab(\'' + key + '\')" style="flex:1 1 95px;text-align:left;font-family:inherit;cursor:pointer;background:' + bg + ';border:3px solid ' + (on ? fg : 'transparent') + ';border-radius:14px;padding:14px 18px">'
      + '<div style="font-size:34px;font-weight:900;line-height:1;color:' + fg + '">' + lists[key].length + '</div>'
      + '<div style="font-size:14px;font-weight:800;color:' + fg + ';margin-top:6px">' + label + '</div></button>';
  };
  var rowsHtml = lists[_qfTab].map(function(q){
    var right, extra = '';
    if(_qfTab === 'open'){
      right = _qfButtons(q.job_id, 'page', true);
      extra = _qfChased(q);
    } else if(_qfTab === 'booked'){
      right = q.quote_job_id ? '<button class="djj-btn green" onclick="openDetail(\'' + q.quote_job_id + '\')" style="font-size:14px;padding:10px 18px;border-radius:10px">Open job ' + escHtml(q.quote_job_id) + '</button>' : '';
      if(q.quote_note) extra = '<div style="font-size:13px;color:var(--muted);margin-top:4px">' + escHtml(q.quote_note) + '</div>';
    } else {
      right = q.status === 'Cancelled' ? '<span style="font-size:13px;font-weight:700;color:var(--muted)">Quote cancelled</span>'
        : '<button onclick="qfReopen(\'' + q.job_id + '\')" style="font-family:inherit;font-size:14px;font-weight:800;padding:10px 16px;border-radius:10px;cursor:pointer;background:var(--surface);border:2px solid var(--border-strong);color:var(--muted)">Reopen</button>';
      if(q.quote_note) extra = '<div style="font-size:13px;color:var(--muted);margin-top:4px">' + escHtml(q.quote_note) + '</div>';
    }
    var edge = {open:'#f59e0b', booked:'#16a34a', lost:'#94a3b8'}[_qfTab];
    return '<div style="background:var(--surface);border:1px solid var(--border);border-left:5px solid ' + edge + ';border-radius:12px;padding:14px 16px;margin-bottom:8px">'
      + '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px">'
        + '<div style="flex:1 1 260px;min-width:0;cursor:pointer" onclick="openDetail(\'' + q.job_id + '\')">'
          + '<div style="font-size:17px;font-weight:800">' + escHtml(q.name || ('Quote ' + q.job_id)) + '</div>'
          + '<div style="font-size:13px;color:var(--muted);margin-top:2px">' + _qfMeta(q, today) + '</div>'
          + extra
        + '</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:8px">' + right + '</div>'
      + '</div>'
      + '<div id="qf-page-' + q.job_id + '"></div>'
    + '</div>';
  }).join('');
  var empty = {open:'Every quote has been followed up. 👍', booked:'No booked quotes yet this year.', lost:'Nothing here.'}[_qfTab];

  root.innerHTML = '<div class="page-header"><div>'
      + '<div class="page-title page-title-sm">📞 Junk Quotes</div>'
      + '<div class="page-sub">This year\'s quote visits — which ones turned into jobs, and the ones still waiting on a call.</div>'
    + '</div></div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">'
      + tile('open', '📞 Need a follow-up', '#b45309', '#fef3c7')
      + tile('booked', '✅ Booked', '#15803d', '#dcfce7')
      + tile('lost', '✕ Not going ahead', '#475569', '#f1f5f9')
    + '</div>'
    + (rowsHtml || '<div style="font-size:15px;font-weight:700;color:var(--muted);padding:12px 4px">' + empty + '</div>');
}

// The buttons, shared by the dashboard row, the page and the quote's own box (which
// draws its own, bigger Convert above them).
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
    var r = await db.from('jobs').select('job_id,service,photos,notes').eq('job_id', val).maybeSingle();
    if(r.error) throw new Error('Job lookup failed: ' + r.error.message);
    if(!r.data){ toast('There is no job ' + val + ' — check the number.', 'error'); return; }
    if(r.data.service === 'Junk Quote'){ toast(val + ' is another quote, not a job.', 'error'); return; }
    var copied = await _qfCarryToJob(id, r.data);
    await _qfPatch(id, {quote_outcome:'booked', quote_job_id:val});
    toast('✅ Quote ' + id + ' marked booked as job ' + val + (copied ? ' — ' + copied + ' copied over.' : '.'));
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

// "Already booked" links a quote to a job someone made by hand, so the quote's photos
// and notes never reached it (Jake, 2026-10-27). Copy them on: photos the job lacks are
// added after its own, the notes go at the end under "From quote N:". Returns what was
// copied, in words, or '' when there was nothing to copy.
async function _qfCarryToJob(quoteId, job){
  var r = await db.from('jobs').select('photos,notes').eq('job_id', quoteId).single();
  if(r.error) throw new Error('Could not load quote ' + quoteId + ': ' + r.error.message);
  var have = job.photos || [];
  var add = (r.data.photos || []).filter(function(p){ return have.indexOf(p) < 0; });
  var qNotes = (r.data.notes || '').trim();
  var tag = 'From quote ' + quoteId + ':';
  var fields = {}, said = [];
  if(add.length){
    fields.photos = have.concat(add);
    said.push(add.length + ' photo' + (add.length === 1 ? '' : 's'));
  }
  if(qNotes && (job.notes || '').indexOf(tag) < 0){
    fields.notes = (job.notes ? job.notes + '\n\n' : '') + tag + '\n' + qNotes;
    said.push('the notes');
  }
  if(!said.length) return '';
  var w = await patchJob(job.job_id, fields);
  if(w.error) throw new Error('Could not copy quote ' + quoteId + ' onto job ' + job.job_id + ': ' + w.error.message);
  var local = jobs.find(function(j){ return j.id === job.job_id; });
  if(local){
    if(fields.photos) local.photos = fields.photos.slice();
    if(fields.notes) local.notes = fields.notes;
  }
  return said.join(' and ');
}

// Called by saveJob once a job made with Convert to job has saved.
function quoteMarkBooked(quoteId, jobId){
  _qfPatch(quoteId, {quote_outcome:'booked', quote_job_id:jobId});
}

// Every change redraws every place that shows quotes, wherever it was made.
async function _qfPatch(id, fields){
  var r = await patchJob(id, fields);
  if(r.error) return;            // patchJob already said so and put the screen back
  refreshQuoteNeedsYou();
  var page = document.getElementById('view-junkquotes');
  if(page && page.classList.contains('active')) renderJunkQuotesPage();
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

// The way back: a job that a quote was booked as names that quote at the top of its
// Job details, with a button to open it. Empty for every other job.
async function renderFromQuoteBox(jobId){
  var el = document.getElementById('det-fromquote-box');
  if(!el) return;
  var r = await db.from('jobs').select('job_id').eq('quote_job_id', jobId).eq('quote_outcome', 'booked').limit(1);
  if(r.error) throw new Error('From-quote lookup failed: ' + r.error.message);
  if(document.getElementById('det-fromquote-box') !== el || el.dataset.jid !== jobId) return;   // another job opened meanwhile
  if(!r.data.length){ el.innerHTML = ''; return; }
  var qid = r.data[0].job_id;
  el.innerHTML = '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;background:#fffbeb;border:2px solid #f59e0b;border-radius:14px;padding:12px 16px;margin-bottom:14px">'
    + '<div style="flex:1 1 auto;font-size:15px;font-weight:800;color:#b45309">📋 Booked from quote ' + escHtml(qid) + '</div>'
    + '<button class="djj-btn" onclick="openDetail(\'' + escHtml(qid) + '\')" style="font-size:14px;padding:10px 18px;border-radius:10px;border:2px solid #f59e0b;background:var(--surface);color:#b45309;font-weight:800">Open quote ' + escHtml(qid) + '</button>'
  + '</div>';
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
