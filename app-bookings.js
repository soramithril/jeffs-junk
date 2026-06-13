// ── BOOKINGS PAGE ──────────────────────────────────────────
// Shows what was booked (jobs entered into the system) per day, by user.
// Uses created_at, NOT service date. Page is manager-only (gated in go()).
// renderTodayBookings() is the small dashboard widget visible to everyone.
// We do NOT track or display price/$ here — count-only.
// Standalone module. Depends on app.js globals: db, openDetail, fd, todayStr,
// ymdLocal, sb, jid, canAccessAnalytics.

var _bookingsPeriod = 'today';
var _bookingsCustomStart = '';
var _bookingsCustomEnd = '';

function _bkEsc(s){ return (s==null?'':(''+s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function _bkUserColor(name){
  var palette = ['#2563eb','#9333ea','#dc2626','#16a34a','#ea580c','#0891b2','#db2777','#65a30d','#7c3aed','#0284c7'];
  var h = 5381;
  var s = name || '';
  for(var i=0;i<s.length;i++){ h = ((h<<5) + h + s.charCodeAt(i)) >>> 0; }
  return palette[h % palette.length];
}

function _bkInitial(name){
  var s = (name||'?').trim();
  return s ? s.charAt(0).toUpperCase() : '?';
}

function _bkRelTime(d){
  var diff = (Date.now() - d.getTime()) / 1000;
  if(diff < 60) return 'just now';
  if(diff < 3600) return Math.floor(diff/60) + 'm ago';
  if(diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}

function _bookingsRange(mode){
  var now = new Date();
  var s, e;
  if(mode==='today'){ s = ymdLocal(now); e = ymdLocal(now); }
  else if(mode==='yesterday'){ var d = new Date(now); d.setDate(d.getDate()-1); s = ymdLocal(d); e = ymdLocal(d); }
  else if(mode==='week'){ var ws = new Date(now); ws.setDate(now.getDate()-now.getDay()); s = ymdLocal(ws); e = ymdLocal(now); }
  else if(mode==='month'){ s = ymdLocal(new Date(now.getFullYear(),now.getMonth(),1)); e = ymdLocal(now); }
  else if(mode==='custom'){ s = _bookingsCustomStart || ymdLocal(now); e = _bookingsCustomEnd || ymdLocal(now); }
  return { start: s, end: e };
}

function _bookingsRangeLabel(range){
  if(range.start === range.end) return fd(range.start);
  return fd(range.start) + ' – ' + fd(range.end);
}

async function renderBookings(){
  var host = document.getElementById('bookings-body');
  if(!host) return;
  host.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">Loading…</div>';

  document.querySelectorAll('.bk-period-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-period') === _bookingsPeriod);
  });
  var cr = document.getElementById('bk-custom-range');
  if(cr) cr.style.display = (_bookingsPeriod === 'custom') ? 'flex' : 'none';

  var range = _bookingsRange(_bookingsPeriod);
  var startISO = range.start + 'T00:00:00';
  var endDate = new Date(range.end + 'T00:00:00'); endDate.setDate(endDate.getDate()+1);
  var endISO = ymdLocal(endDate) + 'T00:00:00';

  var r = await db.from('jobs')
    .select('job_id,name,service,date,created_at,created_by,status')
    .gte('created_at', startISO)
    .lt('created_at', endISO)
    .order('created_at', { ascending: false });
  if(r.error){
    host.innerHTML = '<div style="color:#dc3545;padding:20px">Error loading bookings: ' + _bkEsc(r.error.message) + '</div>';
    return;
  }
  var list = r.data || [];

  // Per-user breakdown
  var byUser = {};
  list.forEach(function(j){
    var u = j.created_by || 'unknown';
    if(!byUser[u]) byUser[u] = 0;
    byUser[u]++;
  });
  var userArr = Object.keys(byUser).map(function(u){
    return { name: u, count: byUser[u] };
  }).sort(function(a,b){ return b.count - a.count; });

  // 7-day chart — anchored on range.end
  var chartDays = [];
  var endAnchor = new Date(range.end + 'T00:00:00');
  for(var i=6;i>=0;i--){
    var dd = new Date(endAnchor); dd.setDate(dd.getDate()-i);
    chartDays.push(ymdLocal(dd));
  }
  var chartStartISO = chartDays[0] + 'T00:00:00';
  var chartEndD = new Date(chartDays[6] + 'T00:00:00'); chartEndD.setDate(chartEndD.getDate()+1);
  var chartEndISO = ymdLocal(chartEndD) + 'T00:00:00';
  var rChart = await db.from('jobs').select('created_at').gte('created_at', chartStartISO).lt('created_at', chartEndISO);
  var perDay = {};
  chartDays.forEach(function(d){ perDay[d] = 0; });
  (rChart.data||[]).forEach(function(j){
    var d = (j.created_at||'').slice(0,10);
    if(perDay[d] !== undefined) perDay[d]++;
  });
  var maxDay = 0;
  chartDays.forEach(function(d){ if(perDay[d] > maxDay) maxDay = perDay[d]; });
  var todayKey = todayStr();

  var html = '';

  // ── Hero summary ─────────────────────────────────────────
  html += '<div class="chart-card" style="padding:24px 28px;margin-bottom:16px;background:linear-gradient(135deg,rgba(34,197,94,.06),rgba(34,197,94,0));border:1px solid var(--border)">'+
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap">'+
              '<div>'+
                '<div style="font-size:11px;font-weight:700;letter-spacing:.6px;color:var(--muted);text-transform:uppercase">Jobs Booked</div>'+
                '<div style="display:flex;align-items:baseline;gap:14px;margin-top:6px">'+
                  '<span style="font-family:\'Bebas Neue\',sans-serif;font-size:64px;line-height:.9;color:var(--accent);letter-spacing:.5px">'+list.length+'</span>'+
                  '<span style="font-size:14px;color:var(--text);font-weight:600">job'+(list.length===1?'':'s')+'</span>'+
                '</div>'+
              '</div>'+
              '<div style="display:inline-flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:8px 16px;font-size:13px;color:var(--text);font-weight:600">'+
                '<span style="font-size:14px">📅</span>'+_bookingsRangeLabel(range)+
              '</div>'+
            '</div>'+
          '</div>';

  // ── Per-user breakdown — initial avatars + medals ────────
  html += '<div class="chart-card" style="padding:16px 20px;margin-bottom:16px">'+
            '<div class="card-head" style="margin-bottom:14px"><span class="emo">👤</span>By User</div>';
  if(!userArr.length){
    html += '<div style="color:var(--muted);font-size:13px;padding:6px 0">No bookings in this period.</div>';
  } else {
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
    userArr.forEach(function(u, idx){
      var color = _bkUserColor(u.name);
      var medal = idx===0 ? '🥇' : (idx===1 ? '🥈' : (idx===2 ? '🥉' : ''));
      var ring = (idx<3 && userArr.length>1) ? 'box-shadow:0 0 0 2px '+color+'22, 0 6px 14px '+color+'1a;' : '';
      html += '<div style="display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:10px 18px 10px 12px;min-width:170px;transition:transform .15s,box-shadow .15s;'+ring+'" onmouseover="this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.transform=\'translateY(0)\'">'+
                '<div style="position:relative;flex-shrink:0">'+
                  '<div style="width:40px;height:40px;border-radius:50%;background:'+color+';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;letter-spacing:.5px">'+_bkEsc(_bkInitial(u.name))+'</div>'+
                  (medal?'<div style="position:absolute;top:-7px;right:-7px;font-size:15px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.2))">'+medal+'</div>':'')+
                '</div>'+
                '<div>'+
                  '<div style="font-weight:700;font-size:13px;color:var(--text);line-height:1.1">'+_bkEsc(u.name)+'</div>'+
                  '<div style="font-size:12px;color:var(--muted);margin-top:3px"><strong style="color:var(--accent);font-size:15px">'+u.count+'</strong> booking'+(u.count===1?'':'s')+'</div>'+
                '</div>'+
              '</div>';
    });
    html += '</div>';
  }
  html += '</div>';

  // ── 7-day chart ──────────────────────────────────────────
  html += '<div class="chart-card" style="padding:16px 20px;margin-bottom:16px">'+
            '<div class="card-head" style="margin-bottom:18px"><span class="emo">📊</span>Last 7 Days</div>'+
            '<div style="display:flex;align-items:flex-end;gap:14px;height:190px;padding:0 4px">';
  chartDays.forEach(function(d){
    var n = perDay[d];
    var pct = maxDay ? (n/maxDay) : 0;
    var h = Math.round(pct * 130);
    var isMax = maxDay && n === maxDay && n > 0;
    var isToday = d === todayKey;
    var lblD = new Date(d+'T12:00:00');
    var dow = lblD.toLocaleDateString('en-US',{weekday:'short'});
    var dnum = lblD.getDate();
    var barColor = isMax
      ? 'linear-gradient(180deg,var(--accent),rgba(34,197,94,.35))'
      : 'linear-gradient(180deg,rgba(120,120,120,.28),rgba(120,120,120,.08))';
    var lblBg = isToday ? 'background:var(--accent);color:#fff' : 'background:var(--surface2);color:var(--muted)';
    var numColor = isMax ? 'var(--accent)' : 'var(--text)';
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;justify-content:flex-end;height:100%" title="'+_bkEsc(fd(d))+': '+n+' booked">'+
              '<div style="font-size:12px;font-weight:700;color:'+numColor+'">'+n+'</div>'+
              '<div style="width:100%;max-width:54px;height:'+h+'px;background:'+barColor+';border-radius:7px 7px 2px 2px;min-height:3px;transition:height .3s ease"></div>'+
              '<div style="display:inline-flex;align-items:center;justify-content:center;gap:3px;padding:3px 9px;border-radius:10px;font-size:10px;font-weight:700;'+lblBg+'">'+dow+' '+dnum+'</div>'+
            '</div>';
  });
  html += '</div></div>';

  // ── Job list — zebra, service badges, jid styling ───────
  html += '<div class="chart-card" style="padding:0;overflow:hidden">'+
            '<div style="padding:14px 18px;border-bottom:1px solid var(--border)">'+
              '<div class="card-head" style="margin:0"><span class="emo">🧾</span>Bookings — '+_bookingsRangeLabel(range)+'</div>'+
              '<div style="font-size:11px;color:var(--muted);margin-top:2px">Click a row to open the job</div>'+
            '</div>';
  if(!list.length){
    html += '<div style="text-align:center;padding:36px;color:var(--muted);font-size:13px">No bookings in this period.</div>';
  } else {
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'+
              '<thead><tr style="text-align:left;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;background:var(--surface2)">'+
                '<th style="padding:10px 14px">Customer</th>'+
                '<th style="padding:10px 14px">Service</th>'+
                '<th style="padding:10px 14px">Service Date</th>'+
                '<th style="padding:10px 14px">Booked By</th>'+
                '<th style="padding:10px 14px">Booked At</th>'+
              '</tr></thead><tbody>';
    list.forEach(function(j, idx){
      var ts = j.created_at ? new Date(j.created_at) : null;
      var tsStr = ts ? ts.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '—';
      var cancelled = (j.status==='Cancelled');
      var rowStyle = cancelled ? 'opacity:.55;text-decoration:line-through;' : '';
      var zebraBg = idx%2 ? 'rgba(0,0,0,.018)' : 'transparent';
      var color = _bkUserColor(j.created_by||'unknown');
      var avatar = '<span style="display:inline-flex;align-items:center;gap:8px"><span style="width:26px;height:26px;border-radius:50%;background:'+color+';color:#fff;font-weight:700;font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">'+_bkInitial(j.created_by||'?')+'</span>'+_bkEsc(j.created_by||'—')+'</span>';
      html += '<tr style="cursor:pointer;border-top:1px solid var(--border);background:'+zebraBg+';'+rowStyle+'" onmouseover="this.style.background=\'rgba(34,197,94,.06)\'" onmouseout="this.style.background=\''+zebraBg+'\'" onclick="openDetail(\''+_bkEsc(j.job_id)+'\')">'+
                '<td style="padding:10px 14px;font-weight:600">'+_bkEsc(j.name||'—')+'</td>'+
                '<td style="padding:10px 14px">'+(j.service?sb(j.service):'—')+'</td>'+
                '<td style="padding:10px 14px">'+fd(j.date)+'</td>'+
                '<td style="padding:10px 14px">'+avatar+'</td>'+
                '<td style="padding:10px 14px;color:var(--muted);font-size:12px">'+tsStr+'</td>'+
              '</tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  host.innerHTML = html;
}

function setBookingsPeriod(p){
  _bookingsPeriod = p;
  if(p === 'custom'){
    var t = todayStr();
    if(!_bookingsCustomStart) _bookingsCustomStart = t;
    if(!_bookingsCustomEnd) _bookingsCustomEnd = t;
    var s = document.getElementById('bk-custom-start');
    var e = document.getElementById('bk-custom-end');
    if(s) s.value = _bookingsCustomStart;
    if(e) e.value = _bookingsCustomEnd;
  }
  renderBookings();
}
function setBookingsCustomStart(v){ _bookingsCustomStart = v; if(_bookingsPeriod === 'custom') renderBookings(); }
function setBookingsCustomEnd(v){ _bookingsCustomEnd = v; if(_bookingsPeriod === 'custom') renderBookings(); }

// Service → accent color, matching the Today's Jobs category colors.
function _bkSvcColor(svc){
  return ({
    'Bin Rental':       '#0891b2',
    'Junk Removal':     '#eab308',
    'Junk Quote':       '#0d6efd',
    'Furniture Pickup': '#8b5cf6',
    'Furniture Delivery':'#f97316'
  })[svc] || 'var(--accent)';
}

// ── Booked Today dashboard widget (visible to everyone) ─────
// Styled to match the Today's Jobs rows for dashboard unity.
async function renderTodayBookings(){
  var host = document.getElementById('dash-today-bookings');
  if(!host) return;
  var t = todayStr();
  var startISO = t + 'T00:00:00';
  var endD = new Date(t + 'T00:00:00'); endD.setDate(endD.getDate()+1);
  var endISO = ymdLocal(endD) + 'T00:00:00';
  var r = await db.from('jobs')
    .select('job_id,name,service,address,city,bin_size,date,created_by,created_at,status,email_sent,email_confirmed')
    .gte('created_at', startISO).lt('created_at', endISO)
    .order('created_at', { ascending: false });
  if(r.error){ host.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 16px">Could not load today\'s bookings.</div>'; return; }
  var list = r.data || [];
  var n = list.length;

  var countEl = document.getElementById('dash-bookings-count');
  if(countEl) countEl.textContent = n ? (n + ' job' + (n===1?'':'s') + ' booked today') : '';
  var chipEl = document.getElementById('dash-tab-n-bookings');
  if(chipEl) chipEl.textContent = n;

  var moreBtn = document.getElementById('dash-bookings-more');
  if(moreBtn) moreBtn.style.display = (typeof canAccessAnalytics === 'function' && canAccessAnalytics()) ? '' : 'none';

  if(!list.length){
    host.innerHTML = (typeof emptyStateHTML === 'function')
      ? emptyStateHTML('📝','Nothing Booked Yet','No new jobs have been entered today.')
      : '<div style="font-size:13px;color:var(--muted);padding:10px 16px">No bookings yet today.</div>';
    return;
  }

  host.innerHTML = list.map(function(j){
    var ts = j.created_at ? new Date(j.created_at) : null;
    var tsStr = ts ? _bkRelTime(ts) : '';
    var cancelled = (j.status === 'Cancelled');
    var rowOp = cancelled ? ';opacity:.55' : '';
    var nameStyle = cancelled ? 'text-decoration:line-through;' : '';
    var svcColor = _bkSvcColor(j.service);
    var uColor = _bkUserColor(j.created_by||'unknown');
    var addr = j.address ? _bkEsc(j.address.split(',')[0]) : '';
    // Bin size badge — same "X YD" treatment as Today's Jobs
    var sizeBadge = (j.service==='Bin Rental' && j.bin_size)
      ? '<span style="font-size:11px;font-weight:700;background:rgba(8,145,178,.1);color:#0891b2;border:1px solid rgba(8,145,178,.3);border-radius:5px;padding:2px 8px;white-space:nowrap;flex-shrink:0">'+_bkEsc(j.bin_size.replace(/\s*yard/i,' YD').toUpperCase())+'</span>'
      : '';
    // City chip — reuse the dashboard's shared _cityColor palette (matches Today's Jobs)
    var cc = (typeof _cityColor==='function') ? _cityColor(j.city) : null;
    var cityChip = (j.city && cc)
      ? '<span style="background:'+cc.bg+';color:'+cc.fg+';border:1px solid '+cc.bd+';border-left:3px solid '+cc.ac+';font-family:\'Bebas Neue\',sans-serif;font-size:14px;padding:2px 10px;border-radius:5px;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;line-height:1.3;flex-shrink:0">'+_bkEsc(j.city)+'</span>'
      : '';
    // Email status chip — green = sent, orange = needs sending (click opens the email modal)
    var emailChip = (j.email_sent||j.email_confirmed)
      ? '<span title="Email sent — click to view or resend" onclick="event.stopPropagation();openEmailModal(\''+_bkEsc(j.job_id)+'\')" style="cursor:pointer;font-size:11px;color:#22c55e;font-weight:700;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.35);border-radius:4px;padding:3px 8px;white-space:nowrap;flex-shrink:0">📧 ✓</span>'
      : '<span title="Email not sent — click to send" onclick="event.stopPropagation();openEmailModal(\''+_bkEsc(j.job_id)+'\')" style="cursor:pointer;font-size:11px;color:#e67e22;font-weight:700;background:rgba(230,126,34,.1);border:1px solid rgba(230,126,34,.5);border-radius:4px;padding:3px 8px;white-space:nowrap;flex-shrink:0">📧 Send</span>';
    return '<div class="today-job-row" style="display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:10px;align-items:center;padding:11px 12px;background:var(--surface);border:1px solid var(--border);border-left:5px solid '+svcColor+';border-radius:0 8px 8px 0;margin:0 8px 5px;cursor:pointer;font-size:12.5px'+rowOp+'" onclick="openDetail(\''+_bkEsc(j.job_id)+'\')">'+
              '<div style="min-width:0;display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden">'+
                '<span style="color:var(--text);font-weight:600;font-size:13px;flex-shrink:0;'+nameStyle+'">'+_bkEsc(j.name||'—')+'</span>'+
                (j.service?sb(j.service):'')+
                (addr?'<span style="color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;min-width:0">· '+addr+'</span>':'')+
              '</div>'+
              '<div style="display:flex;align-items:center;gap:8px;justify-self:end">'+emailChip+sizeBadge+cityChip+'</div>'+
              '<div style="display:inline-flex;align-items:center;gap:7px;color:var(--muted);font-size:12px;justify-self:end;white-space:nowrap">'+
                '<span style="width:22px;height:22px;border-radius:50%;background:'+uColor+';color:#fff;font-weight:700;font-size:10px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">'+_bkEsc(_bkInitial(j.created_by||'?'))+'</span>'+
                '<span>'+_bkEsc(j.created_by||'—')+'</span>'+
              '</div>'+
              '<div style="color:var(--muted);font-size:11px;justify-self:end;white-space:nowrap;min-width:62px;text-align:right">'+tsStr+'</div>'+
            '</div>';
  }).join('');
}
