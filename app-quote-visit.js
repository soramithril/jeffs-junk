// ── PHONE QUOTE ANSWERS ON THE DASHBOARD ───────────────────────────────────
// quotes.html (Jake, 2026-11-02) is where Jeff, Josh and Jake answer a quote visit
// on their phones. It writes onto the Junk Quote: photos and price in their usual
// columns, the rest in quote_bins, quote_crew, quote_hours, quote_flags, quote_fb.
// This file only READS those and shows them in three places:
//   - the box at the top of the quote's Job details, and a short line on the
//     Junk Quotes page (both drawn by app-quote-followup.js);
//   - the job the quote was booked as ("From the quote", app-quote-followup.js);
//   - the printed Junk Removal sheet: Quoted By, and a line beside Equipment
//     Needed (printJunkRemoval in app.js).
// The quote_* columns are left out of jobToDb on purpose, like the follow-up ones,
// so saving a quote in the booking form can never wipe them.

// The answers plus what the boxes need beside them. Callers add job_id/price/dates
// themselves where their own select lacks them (PostgREST must not see a column twice).
var QV_COLS = 'quote_bins,quote_bins_max,quote_crew,quote_hours,quote_flags,quote_fb,quote_visit_note,assigned_crew_ids,photos';

function qvHas(q){ return !!q && q.quote_bins != null; }

// One number (¼ .. 1, 5 = "5+") or a range, quote_bins to quote_bins_max ("1–2").
function _qvOneBin(n){
  n = Number(n);
  if(n >= 5) return '5+';
  var w = Math.floor(n), f = n - w;
  return (w ? String(w) : '') + (f === 0.25 ? '¼' : f === 0.5 ? '½' : f === 0.75 ? '¾' : '');
}
function qvBinsNum(q){ return _qvOneBin(q.quote_bins) + (q.quote_bins_max != null ? '–' + _qvOneBin(q.quote_bins_max) : ''); }
function qvBinsWord(q){ return Number(q.quote_bins_max != null ? q.quote_bins_max : q.quote_bins) <= 1 ? 'bin' : 'bins'; }
function qvBins(q){ return qvBinsNum(q) + ' ' + qvBinsWord(q); }
function qvHours(h){ return String(Number(h)).replace(/\.0+$/, ''); }
function qvFb(q){ return {yes:'Yes', maybe:'Maybe', no:'No'}[q.quote_fb] || ''; }

// Who went: the crew on the quote (quotes.html puts the sender on an unassigned one).
function qvWho(q){
  return (q.assigned_crew_ids || []).map(function(id){
    var m = teamRoster.find(function(r){ return r.id === id; });
    return m ? m.name : '';
  }).filter(Boolean).join(', ');
}

// "2 bins · 3 guys · 4.5 h" — the Junk Quotes page row.
function qvShortLine(q){
  return qvBins(q) + ' · ' + q.quote_crew + ' guys · ' + qvHours(q.quote_hours) + ' h';
}

// The box on the quote (title "From Josh's visit") and on the booked job ("From the quote").
function qvBoxHtml(q, title){
  var tile = function(big, small){
    return '<div style="background:var(--surface2);border-radius:10px;padding:8px 10px;min-width:0">'
      + '<div style="font-size:26px;font-weight:900;line-height:1">' + escHtml(big) + '</div>'
      + '<div style="font-size:12px;font-weight:700;color:var(--muted)">' + small + '</div></div>';
  };
  var flags = (q.quote_flags || []).map(function(f){
    return '<span style="font-size:13px;font-weight:700;background:var(--surface2);border-radius:99px;padding:4px 10px">' + escHtml(f) + '</span>';
  }).join('');
  var fb = q.quote_fb === 'maybe'
    ? '<div style="background:#fff7ed;color:#9a3412;border-radius:10px;padding:9px 12px;font-size:14px;font-weight:700">Furniture Bank: maybe. Ask the customer when you call.</div>'
    : '<div style="font-size:14px;font-weight:700;color:' + (q.quote_fb === 'yes' ? '#6d28d9' : 'var(--muted)') + '">Furniture Bank: ' + qvFb(q) + '</div>';
  var nPhotos = (q.photos || []).length;
  return '<div style="background:var(--surface);border:2px solid #16a34a;border-radius:14px;padding:14px 16px;margin-bottom:14px;display:flex;flex-direction:column;gap:10px">'
    + '<div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#15803d">' + escHtml(title) + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(' + (q.price != null ? 4 : 3) + ',minmax(0,1fr));gap:8px">'
      + tile(qvBinsNum(q), qvBinsWord(q))
      + tile(String(q.quote_crew), 'guys')
      + tile(qvHours(q.quote_hours), 'hours')
      + (q.price != null ? tile('$' + Number(q.price).toLocaleString('en-CA', {maximumFractionDigits: 2}), 'quoted') : '')
    + '</div>'
    + (flags ? '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span style="font-size:13px;font-weight:700;color:var(--muted)">Harder:</span>' + flags + '</div>' : '')
    + fb
    + (q.quote_visit_note ? '<div style="font-size:14px;line-height:1.45;white-space:pre-line;background:var(--surface2);border-radius:10px;padding:9px 12px"><b>Notes:</b> ' + escHtml(q.quote_visit_note) + '</div>' : '')
    + (nPhotos ? '<div style="font-size:13px;color:var(--muted)">' + nPhotos + ' photo' + (nPhotos === 1 ? '' : 's') + ' on the quote</div>' : '')
  + '</div>';
}

// The quote a job was booked as, with its visit answers, or null.
async function qvForJob(jobId){
  var r = await db.from('jobs').select('job_id,price,junk_date,date,' + QV_COLS).eq('quote_job_id', jobId).eq('quote_outcome', 'booked').limit(1);
  if(r.error) throw new Error('Quote lookup for job ' + jobId + ' failed: ' + r.error.message);
  return r.data.length ? r.data[0] : null;
}

// What the printed Junk Removal sheet gets. Helvetica (pdf-lib) is WinAnsi only, so
// everything here is plain text; ¼ ½ ¾ and · are in WinAnsi.
function qvSheetLines(q){
  var when = q.junk_date || q.date;
  var who = qvWho(q);
  var sub = (q.quote_flags || []).slice();
  if(q.quote_fb === 'yes' || q.quote_fb === 'maybe') sub.push('Furniture Bank: ' + q.quote_fb);
  return {
    by: who ? who + (when ? '  (quoted ' + new Date(when + 'T12:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) + ')' : '') : '',
    head: (qvBins(q) + '  ·  ' + q.quote_crew + ' guys  ·  about ' + qvHours(q.quote_hours) + ' hours').toUpperCase(),
    sub: sub.join(', '),
    // Goes at the top of the sheet's notes box, ahead of the office's notes.
    note: q.quote_visit_note ? 'From the quote: ' + q.quote_visit_note.trim() : ''
  };
}
