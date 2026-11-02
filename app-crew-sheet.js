// ── EXTRA JOBS CREW SHEET (Jake, 2026-11-02) ────────────────────────────────
// A one-page sheet for the guys doing an Extra Job: what, where, when, how long, how
// many people, what to do, what to bring, and big photos. Nothing the crew doesn't
// need — no customer phone or email, PO, booked-by, time sheet or sign-off; those stay
// on the full work order (printLandscaping in app.js), which is unchanged and still its
// own Print Form button. One copy, black and white, like the work order.
// Mockup Jake approved: https://claude.ai/artifact/Gty8Zufo5ZBgLUctKuJ5nQ

async function printCrewSheet(jobId){
  // Open the window synchronously (popup blockers require the user gesture), then fetch.
  var w = window.open('', '_blank');
  if(!w){ toast('⚠ Popup blocked — allow popups to print', 'error'); return; }
  // DB is the source of truth — the local cache can be stale (refresh pauses while modals are open).
  var r = await db.from('jobs').select('*').eq('job_id', jobId).single();
  if(r.error || !r.data){ w.close(); toast('Job not found', 'error'); return; }
  var j = dbToJob(r.data);
  if(j.service !== 'Extra Jobs'){ w.close(); throw new Error('printCrewSheet: job ' + jobId + ' is ' + j.service + ', not Extra Jobs'); }
  w.document.write(_crewSheetHtml(j));
  w.document.close();
}
window.printCrewSheet = printCrewSheet;

function _crewSheetHtml(j){
  var e = escHtml;
  var shop = isShopJob(j);
  var who = (j.names && j.names.length) ? j.names[0] : (j.name || '');
  var addr = [j.address, j.city].filter(Boolean).join(', ');
  var when = j.junkDate || j.date;
  var day = when ? new Date(when + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'}) : '';
  var time = j.junkTime ? ft(j.junkTime) : '';
  var blank = '<span class="fill"></span>';
  var tasks = (j.tasks || '').split(/\r?\n/).map(function(s){ return s.trim(); }).filter(Boolean);
  var bring = _notesToItems(j.items || '');
  if(j.toolsNeeded) bring = bring.concat(j.toolsNeeded.split(/\r?\n/).map(function(s){ return s.trim(); }).filter(Boolean));
  var photos = (j.photos || []).map(function(url){
    return '<img src="' + e(_cloudinaryDeliveryUrl(url, {width: 1000})) + '" alt="">';
  }).join('');

  return '<!DOCTYPE html><html><head><title>Crew Sheet — ' + e(j.id) + '</title><style>'
    + '@page{size:letter;margin:0.45in} html,body{margin:0;padding:0}'
    + 'body{font-family:Arial,Helvetica,sans-serif;color:#111}'
    + '.top{display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid #111;padding-bottom:6px;font-size:12px;font-weight:bold;letter-spacing:2px}'
    + '.name{font-size:34px;font-weight:bold;line-height:1.1;margin:12px 0 4px}'
    + '.addr{font-size:19px;font-weight:bold} .who{font-size:14px;color:#333;margin-top:2px}'
    + '.boxes{display:flex;gap:10px;margin:14px 0}'
    + '.box{flex:1;border:2px solid #111;border-radius:6px;padding:8px 12px}'
    + '.lbl{font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#333}'
    + '.big{font-size:28px;font-weight:bold;line-height:1.15} .mid{font-size:20px;font-weight:bold;line-height:1.2}'
    + '.sec{font-size:12px;font-weight:bold;letter-spacing:1.5px;border-bottom:1px solid #111;padding-bottom:3px;margin:16px 0 8px}'
    + '.todo{font-size:16px;line-height:1.5;white-space:pre-wrap}'
    + '.task{font-size:15px;line-height:2;display:flex;align-items:center;gap:10px}'
    + '.cb{display:inline-block;width:14px;height:14px;border:2px solid #111;border-radius:2px;flex:none}'
    + '.bring{font-size:15px;line-height:1.5}'
    + '.fill{display:inline-block;min-width:90px;border-bottom:1px solid #999;height:1.1em}'
    + '.photos{display:flex;flex-wrap:wrap;gap:8px}'
    + '.photos img{box-sizing:border-box;width:calc(50% - 4px);height:2.3in;object-fit:cover;border:1px solid #888;filter:grayscale(1);page-break-inside:avoid}'
    + '.done{display:flex;align-items:center;gap:10px;border-top:2px solid #111;margin-top:16px;padding-top:9px;font-size:14px;font-weight:bold;page-break-inside:avoid}'
    + '</style></head><body>'
    + '<div class="top"><span>JEFF WHITE GROUP · EXTRA JOBS</span><span>CREW SHEET · #' + e(j.id) + '</span></div>'
    + '<div class="name">' + e(j.jobName || 'Extra Job') + '</div>'
    + (shop
      ? '<div class="addr">Our shop — no customer</div>'
      : '<div class="addr">' + (addr ? e(addr) : blank) + '</div>' + (who ? '<div class="who">Ask for: ' + e(who) + '</div>' : ''))
    + '<div class="boxes">'
      + '<div class="box"><div class="lbl">WHEN</div><div class="mid">' + (day ? e(day) : blank) + '</div>' + (time ? '<div style="font-size:15px;font-weight:bold">' + e(time) + '</div>' : '') + '</div>'
      + '<div class="box"><div class="lbl">HOW LONG</div><div class="big">' + (j.estDurationMin ? e(fmtDur(j.estDurationMin)) : blank) + '</div></div>'
      + '<div class="box"><div class="lbl">PEOPLE</div><div class="big">' + (j.crewSize ? e(String(j.crewSize)) : blank) + '</div></div>'
    + '</div>'
    + '<div class="sec">WHAT TO DO</div>'
    + (j.notes ? '<div class="todo">' + e(j.notes) + '</div>' : '<div class="todo">' + blank + '</div>')
    + tasks.map(function(t){ return '<div class="task"><span class="cb"></span>' + e(t) + '</div>'; }).join('')
    + (bring.length ? '<div class="sec">BRING</div><div class="bring">' + bring.map(e).join(' · ') + '</div>' : '')
    + (photos ? '<div class="sec">PHOTOS</div><div class="photos">' + photos + '</div>' : '')
    + '<div class="done"><span class="cb"></span>Done. Take after photos and send them to the office.</div>'
    // Print once the photos have loaded, or they come out as empty boxes.
    + '<script>window.onload=function(){window.print();};<\/script>'
    + '</body></html>';
}
