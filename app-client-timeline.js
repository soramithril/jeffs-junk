// ── CLIENT TIMELINE ─────────────────────────────────────────────────────────
// Jake, 2026-10-19 (from the Jobber comparison): one dated list on the client
// profile of everything the customer saw or heard from us, newest first. It
// replaces the "Emails sent to this client" table — those rows are in here,
// expandable to the full message, with the same delete for people who may.
// Nothing new is recorded; it reads what the app already keeps:
//   jobs                   booked (created_at / created_by)
//   quote_correspondence   emails and review texts sent from the app
//   job_changes            confirmed · bin dropped / picked up · drop-off or
//                          pick-up moved · cancelled / postponed / completed
//   geofence_notifications truck arrived at / left the address (MyGeotab)
//   marketing_exports      included in a marketing email batch
// Not here, because nobody records them: phone calls and the customer's replies.
// The first TL_LIMIT rows show; "Show all" opens the rest.

var TL_LIMIT = 40;
var _tlEvents = [];   // the open profile's events, for Show all
var _tlCid = '';

// job_changes fields that the customer would have noticed. Everything else in that
// log (name fixes, notes, phone) is office housekeeping.
var TL_FIELDS = ['Confirmed','Bin Status','Pickup','Drop-off','Date','Status','Swap Count'];

function tlDay(iso){
  return new Date(iso).toLocaleDateString('en-CA', {weekday:'short', month:'short', day:'numeric', year:'numeric'});
}
function tlTime(iso){
  return new Date(iso).toLocaleTimeString('en-CA', {hour:'numeric', minute:'2-digit'});
}
// A logged value is a date when it looks like one; anything else is shown as is.
function tlVal(v){
  v = String(v || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? fd(v) : v;
}
// "bin rental at 142 Bayfield St" — enough to tell one job from the next on a
// contractor who has fifty.
function tlJobTag(j){
  var where = j.address ? String(j.address).split(',')[0] : '';
  return escHtml(serviceWord(j)) + (where ? ' at ' + escHtml(where) : '');
}

function tlChangeText(c, j){
  var tag = tlJobTag(j), nv = c.new_value || '', ov = c.old_value || '';
  switch(c.field_name){
    case 'Confirmed':
      return nv === 'true' ? {icon:'✅', text:'Confirmed by phone — ' + tag}
                           : {icon:'↩️', text:'Confirmation taken back — ' + tag};
    case 'Bin Status':
      if(nv === 'dropped')  return {icon:'🚛', text:'Bin dropped off — ' + tag};
      if(nv === 'pickedup') return {icon:'🚚', text:'Bin picked up — ' + tag};
      return {icon:'↩️', text:'Bin status cleared — ' + tag};
    case 'Pickup':   return {icon:'🗓️', text:'Pick-up moved to ' + tlVal(nv) + (ov ? ' (was ' + tlVal(ov) + ')' : '') + ' — ' + tag};
    case 'Drop-off': return {icon:'🗓️', text:'Drop-off moved to ' + tlVal(nv) + (ov ? ' (was ' + tlVal(ov) + ')' : '') + ' — ' + tag};
    case 'Date':     return {icon:'🗓️', text:'Date moved to ' + tlVal(nv) + (ov ? ' (was ' + tlVal(ov) + ')' : '') + ' — ' + tag};
    case 'Status':
      if(nv === 'Cancelled') return {icon:'🚫', text:'Cancelled — ' + tag};
      if(nv === 'Postponed') return {icon:'⏸', text:'Postponed — ' + tag};
      if(nv === 'Completed') return {icon:'🏁', text:'Completed — ' + tag};
      if(!nv && ov) return {icon:'▶', text:'Reopened (was ' + escHtml(ov) + ') — ' + tag};
      return null;
    case 'Swap Count': return {icon:'🔁', text:'Bin swapped — ' + tag};
  }
  return null;
}

async function tlRender(cl, clientJobs){
  var host = document.getElementById('cdet-timeline');
  if(!host) return;
  _tlCid = cl.cid;
  host.innerHTML = '<div class="detail-section"><div class="detail-section-title">🕓 Timeline</div>'
    + '<div style="font-size:13px;color:var(--muted)">Loading…</div></div>';
  var byId = {};
  clientJobs.forEach(function(j){ byId[j.id] = j; });
  // Newest 300 jobs is every job for all but a handful of contractors, and keeps
  // the .in() list a size the API is happy with.
  var ids = clientJobs.slice(0, 300).map(function(j){ return j.id; });
  var rs = await Promise.all([
    ids.length ? db.from('job_changes').select('job_id,field_name,old_value,new_value,changed_at,changed_by')
                   .in('job_id', ids).in('field_name', TL_FIELDS).order('changed_at', {ascending:false}).limit(400)
               : {data:[]},
    ids.length ? db.from('geofence_notifications').select('job_id,status,address,created_at')
                   .in('job_id', ids).order('created_at', {ascending:false}).limit(200)
               : {data:[]},
    db.from('marketing_exports').select('batch,exported_on,exported_by').eq('cid', cl.cid)
  ]);
  rs.forEach(function(r){ if(r.error) throw new Error('Timeline query failed: ' + r.error.message); });
  if(_tlCid !== cl.cid) return;   // another profile opened while this one loaded

  var ev = [];
  clientJobs.forEach(function(j){
    if(!j.createdAt) return;
    var when = j.service === 'Bin Rental' ? (j.binDropoff ? ', drop-off ' + fd(j.binDropoff) : '')
             : (jobSchedDate(j) ? ' for ' + fd(jobSchedDate(j)) : '');
    ev.push({at:j.createdAt, icon:'📋', text:'Booked ' + tlJobTag(j) + when, who:j.createdBy || ''});
  });
  (quoteCorrespondence || []).forEach(function(q){
    if(q.client_id !== cl.cid || !q.sent_at) return;
    var text = q.channel === 'text'
      ? 'Review request texted to ' + escHtml(q.to_phone || '—')
      : 'Emailed “' + escHtml(q.subject || '(no subject)') + '” to ' + escHtml(q.to_email || '—');
    ev.push({at:q.sent_at, icon:q.channel === 'text' ? '💬' : '📧', text:text, who:q.sent_by || '', msg:q});
  });
  (rs[0].data || []).forEach(function(c){
    var j = byId[c.job_id]; if(!j) return;
    var t = tlChangeText(c, j); if(!t) return;
    ev.push({at:c.changed_at, icon:t.icon, text:t.text, who:(c.changed_by || '').split('@')[0]});
  });
  (rs[1].data || []).forEach(function(g){
    var where = g.address ? String(g.address).split(',')[0] : (byId[g.job_id] ? byId[g.job_id].address : '');
    ev.push({at:g.created_at, icon:'📍',
             text:(g.status === 'pickedup' ? 'Truck left ' : 'Truck arrived at ') + escHtml(where || 'the address'),
             who:'MyGeotab'});
  });
  (rs[2].data || []).forEach(function(m){
    if(!m.exported_on) return;
    ev.push({at:m.exported_on + 'T12:00:00', dateOnly:true, icon:'✉️',
             text:'Included in marketing email batch' + (m.batch ? ' “' + escHtml(String(m.batch)) + '”' : ''), who:m.exported_by || ''});
  });
  ev.sort(function(a, b){ return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  _tlEvents = ev;
  tlPaint(false);
}

function tlPaint(showAll){
  var host = document.getElementById('cdet-timeline');
  if(!host) return;
  var ev = _tlEvents;
  var body;
  if(!ev.length){
    body = '<p style="font-size:13px;color:var(--muted);margin:0">Nothing yet — bookings, emails, texts, confirmations, bin drops and pick-ups, and truck visits all land here as they happen.</p>';
  } else {
    var shown = showAll ? ev : ev.slice(0, TL_LIMIT);
    var lastDay = '';
    body = '<div style="display:flex;flex-direction:column;gap:2px">' + shown.map(function(e, i){
      var day = tlDay(e.at), head = '';
      if(day !== lastDay){
        head = '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin:' + (lastDay ? '14px' : '0') + ' 0 4px">' + day + '</div>';
        lastDay = day;
      }
      var open = e.msg ? ' onclick="tlToggle(' + i + ')" style="cursor:pointer"' : '';
      var del = (e.msg && canDelete)
        ? '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();deleteQuoteRecord(\'' + e.msg.id + '\',\'' + _tlCid + '\')" title="Delete this record" style="margin-left:auto;flex:none">' + lineIcon('del', 14) + '</button>'
        : '';
      return head
        + '<div class="tl-row"' + open + '>'
        +   '<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:9px;background:var(--surface2)">'
        +     '<span style="flex:none;width:52px;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums">' + (e.dateOnly ? '' : tlTime(e.at)) + '</span>'
        +     '<span style="flex:none;width:22px;text-align:center">' + e.icon + '</span>'
        +     '<span style="flex:1;min-width:0;font-size:14px">' + e.text
        +       (e.who ? ' <span style="font-size:12px;color:var(--muted)">· ' + escHtml(e.who) + '</span>' : '')
        +       (e.msg ? ' <span style="font-size:11px;color:var(--accent)">▸ message</span>' : '')
        +     '</span>' + del
        +   '</div>'
        +   (e.msg ? '<pre id="tl-msg-' + i + '" style="display:none;white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.5;margin:4px 0 6px 84px;padding:10px 14px;border-radius:9px;background:rgba(0,0,0,.06);color:var(--text)">' + escHtml(e.msg.body || '') + '</pre>' : '')
        + '</div>';
    }).join('') + '</div>'
    + (ev.length > shown.length
        ? '<button class="btn btn-ghost btn-sm" onclick="tlPaint(true)" style="margin-top:12px">Show all ' + ev.length + '</button>'
        : '');
  }
  host.innerHTML = '<div class="detail-section"><div class="detail-section-title">🕓 Timeline'
    + (ev.length ? ' <span style="font-weight:400;letter-spacing:0;text-transform:none">— ' + ev.length + ' entries, newest first</span>' : '')
    + '</div>' + body + '</div>';
}

function tlToggle(i){
  var el = document.getElementById('tl-msg-' + i);
  if(el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
