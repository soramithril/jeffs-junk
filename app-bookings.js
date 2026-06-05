// ── BOOKINGS PAGE ──────────────────────────────────────────
// Shows what was booked (jobs entered into the system) per day, by user.
// Uses created_at, NOT service date. Page is manager-only (gated in go()).
// renderTodayBookings() is the small dashboard widget visible to everyone.
// Standalone module. Depends on app.js globals: db, openDetail, fm, fd,
// todayStr, ymdLocal, toast, go.

var _bookingsPeriod = 'today';
var _bookingsCustomStart = '';
var _bookingsCustomEnd = '';

function _bkEsc(s){ return (s==null?'':(''+s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

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

function _bookingsRangeLabel(mode, range){
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
    .select('id,name,service,date,price,created_at,created_by,status')
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
  var totalRev = 0;
  list.forEach(function(j){
    var u = j.created_by || 'unknown';
    if(!byUser[u]) byUser[u] = { count: 0, rev: 0 };
    byUser[u].count++;
    var p = parseFloat(j.price); if(!isNaN(p)){ byUser[u].rev += p; totalRev += p; }
  });
  var userArr = Object.keys(byUser).map(function(u){
    return { name: u, count: byUser[u].count, rev: byUser[u].rev };
  }).sort(function(a,b){ return b.count - a.count; });

  // 7-day chart — anchored on range.end (or today if custom is in past)
  var chartDays = [];
  var endAnchor = new Date(range.end + 'T00:00:00');
  for(var i=6;i>=0;i--){
    var dd = new Date(endAnchor); dd.setDate(dd.getDate()-i);
    chartDays.push(ymdLocal(dd));
  }
  var chartStartISO = chartDays[0] + 'T00:00:00';
  var chartEndD = new Date(chartDays[6] + 'T00:00:00'); chartEndD.setDate(chartEndD.getDate()+1);
  var chartEndISO = ymdLocal(chartEndD) + 'T00:00:00';
  var rChart = await db.from('jobs').select('created_at,created_by').gte('created_at', chartStartISO).lt('created_at', chartEndISO);
  var perDay = {};
  chartDays.forEach(function(d){ perDay[d] = 0; });
  (rChart.data||[]).forEach(function(j){
    var d = (j.created_at||'').slice(0,10);
    if(perDay[d] !== undefined) perDay[d]++;
  });
  var maxDay = 0;
  chartDays.forEach(function(d){ if(perDay[d] > maxDay) maxDay = perDay[d]; });

  var html = '';

  // Summary cards
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:18px">'+
            '<div class="chart-card" style="padding:14px 18px">'+
              '<div style="font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--muted);text-transform:uppercase">Jobs Booked</div>'+
              '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:36px;line-height:1;color:var(--accent);margin-top:4px">'+list.length+'</div>'+
              '<div style="font-size:11px;color:var(--muted);margin-top:4px">'+_bookingsRangeLabel(_bookingsPeriod, range)+'</div>'+
            '</div>'+
            '<div class="chart-card" style="padding:14px 18px">'+
              '<div style="font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--muted);text-transform:uppercase">Total Value</div>'+
              '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:36px;line-height:1;color:#22c55e;margin-top:4px">'+fm(totalRev)+'</div>'+
              '<div style="font-size:11px;color:var(--muted);margin-top:4px">price sum (incl. quotes)</div>'+
            '</div>'+
          '</div>';

  // Per-user breakdown
  html += '<div class="chart-card" style="padding:14px 18px;margin-bottom:18px">'+
            '<div class="card-head" style="margin-bottom:10px"><span class="emo">👤</span>By User</div>';
  if(!userArr.length){
    html += '<div style="color:var(--muted);font-size:13px">No bookings in this period.</div>';
  } else {
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap">';
    userArr.forEach(function(u){
      html += '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;min-width:140px">'+
                '<div style="font-weight:700;font-size:14px;color:var(--text)">'+_bkEsc(u.name)+'</div>'+
                '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:24px;line-height:1;color:var(--accent);margin-top:2px">'+u.count+'</div>'+
                '<div style="font-size:11px;color:var(--muted)">'+fm(u.rev)+'</div>'+
              '</div>';
    });
    html += '</div>';
  }
  html += '</div>';

  // 7-day chart
  html += '<div class="chart-card" style="padding:14px 18px;margin-bottom:18px">'+
            '<div class="card-head" style="margin-bottom:14px"><span class="emo">📊</span>Last 7 Days (all users)</div>'+
            '<div style="display:flex;align-items:flex-end;gap:10px;height:160px">';
  chartDays.forEach(function(d){
    var n = perDay[d];
    var h = maxDay ? Math.round((n/maxDay)*120) : 0;
    var lbl = new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',day:'numeric'});
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;justify-content:flex-end;height:100%">'+
              '<div style="font-size:11px;font-weight:700;color:var(--text)">'+n+'</div>'+
              '<div style="width:100%;height:'+h+'px;background:linear-gradient(180deg,var(--accent),rgba(0,0,0,.06));border-radius:6px 6px 0 0;min-height:2px"></div>'+
              '<div style="font-size:10px;color:var(--muted);white-space:nowrap">'+lbl+'</div>'+
            '</div>';
  });
  html += '</div></div>';

  // Job list
  html += '<div class="chart-card" style="padding:0;overflow:hidden">'+
            '<div style="padding:14px 18px;border-bottom:1px solid var(--border)">'+
              '<div class="card-head" style="margin:0"><span class="emo">🧾</span>Bookings — '+_bookingsRangeLabel(_bookingsPeriod, range)+'</div>'+
              '<div style="font-size:11px;color:var(--muted);margin-top:2px">Click a row to open the job</div>'+
            '</div>';
  if(!list.length){
    html += '<div style="text-align:center;padding:30px;color:var(--muted)">No bookings in this period.</div>';
  } else {
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'+
              '<thead><tr style="background:var(--surface2);text-align:left">'+
                '<th style="padding:8px 12px">Job</th>'+
                '<th style="padding:8px 12px">Customer</th>'+
                '<th style="padding:8px 12px">Service</th>'+
                '<th style="padding:8px 12px">Service Date</th>'+
                '<th style="padding:8px 12px;text-align:right">Price</th>'+
                '<th style="padding:8px 12px">Booked By</th>'+
                '<th style="padding:8px 12px">Booked At</th>'+
              '</tr></thead><tbody>';
    list.forEach(function(j){
      var ts = j.created_at ? new Date(j.created_at) : null;
      var tsStr = ts ? ts.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '—';
      var cancelled = (j.status==='Cancelled');
      var rowStyle = cancelled ? 'opacity:.55;text-decoration:line-through' : '';
      html += '<tr style="cursor:pointer;border-top:1px solid var(--border);'+rowStyle+'" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'transparent\'" onclick="openDetail(\''+_bkEsc(j.id)+'\')">'+
                '<td style="padding:8px 12px;font-weight:700">'+_bkEsc(j.id)+'</td>'+
                '<td style="padding:8px 12px">'+_bkEsc(j.name||'—')+'</td>'+
                '<td style="padding:8px 12px">'+_bkEsc(j.service||'—')+'</td>'+
                '<td style="padding:8px 12px">'+fd(j.date)+'</td>'+
                '<td style="padding:8px 12px;text-align:right">'+(j.price?fm(j.price):'—')+'</td>'+
                '<td style="padding:8px 12px">'+_bkEsc(j.created_by||'—')+'</td>'+
                '<td style="padding:8px 12px;color:var(--muted)">'+tsStr+'</td>'+
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

// ── Booked Today dashboard widget (visible to everyone) ─────
async function renderTodayBookings(){
  var host = document.getElementById('dash-today-bookings');
  if(!host) return;
  var t = todayStr();
  var startISO = t + 'T00:00:00';
  var endD = new Date(t + 'T00:00:00'); endD.setDate(endD.getDate()+1);
  var endISO = ymdLocal(endD) + 'T00:00:00';
  var r = await db.from('jobs')
    .select('id,name,service,price,created_by,created_at,status')
    .gte('created_at', startISO).lt('created_at', endISO)
    .order('created_at', { ascending: false });
  if(r.error){ host.innerHTML = '<div style="color:var(--muted);font-size:12px">Could not load today\'s bookings.</div>'; return; }
  var list = r.data || [];
  var totalRev = 0;
  var byUser = {};
  list.forEach(function(j){
    var u = j.created_by || 'unknown';
    if(!byUser[u]) byUser[u] = 0;
    byUser[u]++;
    var p = parseFloat(j.price); if(!isNaN(p)) totalRev += p;
  });
  var users = Object.keys(byUser).sort(function(a,b){ return byUser[b] - byUser[a]; });
  var n = list.length;

  var moreBtn = document.getElementById('dash-bookings-more');
  if(moreBtn) moreBtn.style.display = (typeof canAccessAnalytics === 'function' && canAccessAnalytics()) ? '' : 'none';

  var summary = '<div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:'+(n?'10px':'0')+'">'+
                  '<span style="font-family:\'Bebas Neue\',sans-serif;font-size:32px;line-height:1;color:var(--accent)">'+n+'</span>'+
                  '<span style="font-size:13px;color:var(--text)">job'+(n===1?'':'s')+' booked today</span>'+
                  (totalRev?'<span style="font-size:13px;color:#22c55e;font-weight:700">'+fm(totalRev)+'</span>':'')+
                '</div>';
  var chips = users.length
    ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:'+(list.length?'12px':'0')+'">' + users.map(function(u){
        return '<span style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:3px 11px;font-size:12px;font-weight:600;color:var(--text)">'+
                  _bkEsc(u)+' <span style="color:var(--muted);font-weight:500">'+byUser[u]+'</span>'+
                '</span>';
      }).join('') + '</div>'
    : '';
  var rows = list.slice(0, 8).map(function(j){
    var ts = j.created_at ? new Date(j.created_at) : null;
    var tsStr = ts ? ts.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '';
    var cancelled = (j.status === 'Cancelled');
    var rowOp = cancelled ? 'opacity:.55;text-decoration:line-through;' : '';
    return '<div style="display:grid;grid-template-columns:60px 1fr 1fr 90px 80px;gap:8px;align-items:center;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12.5px;'+rowOp+'" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'transparent\'" onclick="openDetail(\''+_bkEsc(j.id)+'\')">'+
              '<span style="font-weight:700">'+_bkEsc(j.id)+'</span>'+
              '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_bkEsc(j.name||'—')+'</span>'+
              '<span style="color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_bkEsc(j.service||'')+'</span>'+
              '<span style="color:var(--muted);font-size:11px">'+_bkEsc(j.created_by||'')+'</span>'+
              '<span style="color:var(--muted);font-size:11px;text-align:right">'+tsStr+'</span>'+
            '</div>';
  }).join('');
  var listHtml = list.length
    ? rows + (list.length > 8 ? '<div style="text-align:center;font-size:11px;color:var(--muted);padding:6px">+ '+(list.length-8)+' more</div>' : '')
    : '<div style="font-size:13px;color:var(--muted);padding:6px 0">No bookings yet today.</div>';
  host.innerHTML = summary + chips + listHtml;
}
