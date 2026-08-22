// ── ADMIN-ONLY STAFF CHECK-IN PAGE (contribution heat map) ──────────────
// Full-page daily 1-3 ratings board (1 bad · 2 average/normal · 3 good). Two
// views: Crew cards (a GitHub-style contribution graph per person — weeks run
// across, weekdays run down) and Team grid (one dense row per person for
// side-by-side comparison). History window 4w-104w, Year to Date, or All, four
// palettes. WEEKDAYS ONLY — Sundays are excluded everywhere; the crew DOES
// work Saturdays (Jake 2026-07-10). No saved row = 2 ("average, normal day");
// picking a plain 2 with no note DELETES the row, so the table only holds
// deviations (1s/3s) and notes. Rows saved on the old 1-5 scale display
// clamped to 3. ANY weekday inside the loaded window can be rated or
// corrected — click its square — so a missed day can be filled in later.
// Future days are never rateable. Server-side security is the employee_ratings
// RLS policy (user_profiles.role='admin'); the nav gating here is just UI.
(function(){
  'use strict';

  // Admins do the rating, they don't get rated — leave them off the roster
  // (per Jake 2026-07-03). Exact full-name match against jwg_employees names.
  var ADMIN_NAMES = ['jake','josh','barb','jeff','sam','samantha'];

  var LABELS = {1:'Bad day', 2:'Average (normal)', 3:'Good'};
  var FG_SEL = {1:'#fff', 2:'#7c4a03', 3:'#fff'};
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var DOW_LETTER = ['M','T','W','T','F','S'];   // Mon..Sat — Sunday is never drawn
  // 3 swatches per palette: bad / okay / good. The good color is a real fill —
  // a 3 (default or hand-picked) must never look blank in the heat map.
  var PALETTES = {
    classic: { name:'Classic', c:['#d6453d','#f0a13c','#2fa863'] },
    ocean:   { name:'Ocean',   c:['#d97706','#f4c163','#3987bf'] },
    earth:   { name:'Earth',   c:['#c2410c','#f4a261','#2a968c'] },
    plum:    { name:'Plum',    c:['#b91c1c','#e59866','#8a63d2'] }
  };
  var WEEK_PRESETS = [4, 8, 12, 24, 'ytd', 'all'];
  var CELL_GAP = 2;      // gap between day squares in the team grid
  var WEEK_GAP = 3;      // extra breathing room where a new week starts
  var MONTH_H  = 13;     // height of the month label rail above a heat map

  // view state (persisted so the page opens how you left it)
  var st = {
    view:  localStorage.getItem('sc_view') || 'cards',
    weeksN: (function(){ var w = localStorage.getItem('sc_weeks');
      if(w === 'all' || w === 'ytd') return w; var n = parseInt(w,10);
      return (!isNaN(n) && n >= 1 && n <= 104) ? n : 12; })(),
    pal:   PALETTES[localStorage.getItem('sc_pal')] ? localStorage.getItem('sc_pal') : 'classic',
    open:  null,           // 'employeeId|YYYY-MM-DD' whose rating popover is open
    noteFor: null,         // 'employeeId|YYYY-MM-DD' whose note editor is open
    manage: false          // manage mode: show Hide/Show controls
  };

  // data cache
  var _emps = null;        // [{id,name}] alphabetical
  var _minDate = null;     // oldest saved rating_date ('' = none yet)
  var _ratings = {};       // 'empId|YYYY-MM-DD' -> {rating, note}
  var _loadedFrom = null;  // earliest date currently covered by _ratings
  var _hidden = {};        // employee id -> true (not tracked; shared via jwg_app_settings 'checkin_hidden')

  function ymdLocal(d){
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function isAdmin(){ return typeof canAccessAnalytics === 'function' && canAccessAnalytics(); }
  function host(){ return document.getElementById('sc-page'); }
  function persist(){
    localStorage.setItem('sc_view', st.view);
    localStorage.setItem('sc_weeks', String(st.weeksN));
    localStorage.setItem('sc_pal', st.pal);
  }
  // A day can be rated if it is a weekday (Sundays are not tracked) and is not
  // in the future. Everything in the window past that is fair game.
  function rateable(ds){
    return !!ds && ds <= todayStr() && parseLocalDate(ds).getDay() !== 0;
  }

  async function renderStaffCheckin(){
    var el = host(); if(!el) return;
    if(!isAdmin()){
      el.innerHTML = '<div style="padding:60px;text-align:center;color:var(--muted);font-size:14px">Admins only.</div>';
      return;
    }
    if(!_emps){
      el.innerHTML = '<div style="padding:60px;text-align:center;color:var(--muted);font-size:14px">Loading…</div>';
      try {
        var rEmp = await db.from('jwg_employees').select('id,name').order('name');
        if(rEmp.error) throw rEmp.error;
        // jwg_employees has no active flag — the Team page (crew_members) is the
        // master roster. Anyone soft-removed there, or taken off the JWG side,
        // keeps their history but stops being tracked here. Same rule the
        // scheduler uses in applyCrewFlags().
        var rCrew = await db.from('crew_members').select('jwg_id,active,on_jwg');
        if(rCrew.error) throw rCrew.error;
        var offRoster = {};
        (rCrew.data || []).forEach(function(c){
          if(c.jwg_id && (c.active === false || c.on_jwg === false)) offRoster[c.jwg_id] = true;
        });
        _emps = (rEmp.data || []).filter(function(e){
          if(offRoster[e.id]) return false;
          return ADMIN_NAMES.indexOf(String(e.name).trim().toLowerCase()) === -1;
        });
        var rMin = await db.from('employee_ratings').select('rating_date').order('rating_date',{ascending:true}).limit(1);
        if(rMin.error) throw rMin.error;
        _minDate = (rMin.data && rMin.data[0]) ? rMin.data[0].rating_date : '';
        var rHid = await db.from('jwg_app_settings').select('value').eq('key','checkin_hidden');
        if(rHid.error) throw rHid.error;
        _hidden = {};
        (((rHid.data && rHid.data[0]) || {}).value || []).forEach(function(id){ _hidden[id] = true; });
      } catch(e){
        _emps = null;
        el.innerHTML = '<div style="padding:60px;text-align:center;color:#dc2626;font-size:13px">Couldn\'t load: '+escHtml((e && e.message) || String(e))+'</div>';
        return;
      }
    }
    await ensureWindow();
    paint();
  }

  function windowDays(){
    var today = todayStr();
    if(st.weeksN === 'ytd'){
      var jan1 = new Date(parseLocalDate(today).getFullYear(), 0, 1);
      return Math.round((parseLocalDate(today) - jan1) / 86400000) + 1;
    }
    var weeks;
    if(st.weeksN === 'all'){
      if(_minDate){
        var span = (parseLocalDate(today) - parseLocalDate(_minDate)) / 86400000 + 1;
        weeks = Math.max(1, Math.min(104, Math.ceil(span / 7)));
      } else weeks = 12;
    } else weeks = st.weeksN;
    return weeks * 7;
  }
  function parseLocalDate(s){ var p = String(s).split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }

  async function ensureWindow(){
    var today = todayStr();
    var startD = new Date(parseLocalDate(today)); startD.setDate(startD.getDate() - (windowDays() - 1));
    var start = ymdLocal(startD);
    if(_loadedFrom && _loadedFrom <= start) return;
    try {
      var r = await db.from('employee_ratings')
        .select('employee_id,rating_date,rating,note')
        .gte('rating_date', start);
      if(r.error) throw r.error;
      (r.data || []).forEach(function(x){
        _ratings[x.employee_id + '|' + x.rating_date] = { rating: x.rating, note: x.note || '' };
      });
      _loadedFrom = start;
    } catch(e){
      toast('Ratings load failed: ' + ((e && e.message) || e), 'error');
    }
  }

  // ── page build ──
  function paint(){
    var el = host(); if(!el || !_emps) return;
    var today = todayStr();
    var DAYS = windowDays();
    var PC = PALETTES[st.pal].c;
    var COLORS = {1:PC[0], 2:PC[1], 3:PC[2]};
    var startD = new Date(parseLocalDate(today)); startD.setDate(startD.getDate() - (DAYS - 1));

    // Calendar model. Mon–Sat only. Every day also carries the contribution-graph
    // coordinates: col = which week column, row = which weekday row (Mon=0).
    // The grid is anchored to the Monday of the FIRST day actually drawn — anchor
    // it to the window start and a window that opens on a Sunday wastes a column.
    var firstMon = null;
    var dates = [], cols = [], rows = [], monthMarks = [], lastCol = -1, lastMonth = -1;
    for(var i = 0; i < DAYS; i++){
      var d = new Date(startD); d.setDate(startD.getDate() + i);
      var dow = d.getDay();
      if(dow === 0) continue;
      if(!firstMon){ firstMon = new Date(d); firstMon.setDate(firstMon.getDate() - (dow - 1)); }
      var col = Math.floor(Math.round((d - firstMon) / 86400000) / 7);
      // A month is labelled on the first week column that starts in it, so the
      // labels line up with column edges instead of landing mid-week on top of
      // each other (a 4-week window can hold two months in one column).
      if(col !== lastCol){
        if(d.getMonth() !== lastMonth){
          monthMarks.push({ n: MONTHS[d.getMonth()], idx: dates.length, col: col });
          lastMonth = d.getMonth();
        }
        lastCol = col;
      }
      dates.push(ymdLocal(d)); cols.push(col); rows.push(dow - 1);
    }
    var N = dates.length || 1;
    var weeksShown = cols.length ? cols[cols.length - 1] + 1 : 1;
    // The newest tracked day. On a Sunday that is Saturday, not "today" — rating
    // a Sunday would write a row no screen ever shows again.
    var lastDs = dates[N - 1] || today;
    // A month that owns only one week column is a sliver at the edge of the
    // window; its label would sit on top of the next one, so leave it off.
    var marks = monthMarks.filter(function(m, k){
      var nextCol = (k + 1 < monthMarks.length) ? monthMarks[k+1].col : weeksShown;
      return nextCol - m.col >= 2;
    });
    if(!marks.length) marks = monthMarks.slice(-1);

    // Team grid geometry: one dense row per person, a small gap where weeks turn.
    var pitch = Math.max(6, Math.min(12, Math.floor((1010 - weeksShown * WEEK_GAP) / N)));
    var cellW = pitch - CELL_GAP;
    var cellR = Math.max(2, Math.round(cellW / 4));
    var xs = [], gx = 0;
    for(var i2 = 0; i2 < N; i2++){
      if(i2 > 0 && rows[i2] === 0) gx += WEEK_GAP;
      xs.push(gx); gx += pitch;
    }
    var gridW = Math.max(1, gx - CELL_GAP);

    // Crew card geometry: squares shrink as the window grows so a year still fits.
    var miniCell = Math.max(4, Math.min(11, Math.floor(320 / weeksShown) - 2));
    var miniGap = miniCell >= 8 ? 3 : 2;
    var miniPitch = miniCell + miniGap;
    var miniR = Math.max(1.5, Math.round(miniCell / 4));
    var railW = 15;
    var cardMin = Math.min(680, Math.max(242, weeksShown * miniPitch + railW + 42));

    function thinLabels(list, minGap){
      var out = [];
      list.forEach(function(m){
        if(!out.length || m.x - out[out.length-1].x >= minGap) out.push(m);
      });
      return out;
    }
    var gridMonths = thinLabels(marks.map(function(m){ return { n:m.n, x:xs[m.idx] }; }), 34);
    var cardMonths = thinLabels(marks.map(function(m){ return { n:m.n, x:m.col * miniPitch }; }), 26);

    function tipFor(ds, v, note){
      var d = parseLocalDate(ds);
      return d.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'})
        + ' — ' + v + '/3 ' + LABELS[v] + (note ? ' · ' + note : '');
    }
    function sq(cl, w, radius, extra){
      return '<span title="'+escHtml(tipFor(cl.ds, cl.v, cl.note)).replace(/"/g,'&quot;')+'" '
        + 'onclick="StaffRatings.togglePop(\''+cl.empId+'\',\''+cl.ds+'\')" '
        + 'style="'+(extra||'')+'width:'+w+'px;height:'+w+'px;border-radius:'+radius+'px;background:'+COLORS[cl.v]+';'
        + 'box-shadow:inset 0 0 0 1px rgba(27,31,35,.07)'+(cl.ds === lastDs ? ',0 0 0 2px #1a1a2e' : '')+';cursor:pointer"></span>';
    }

    var roster = _emps.filter(function(e){ return !_hidden[e.id]; });
    var hiddenList = _emps.filter(function(e){ return _hidden[e.id]; });

    var emps = roster.map(function(e){
      var cells = [], sum = 0;
      for(var i3 = 0; i3 < N; i3++){
        var rec = _ratings[e.id + '|' + dates[i3]];
        // No entry = 2 (average / normal day). Legacy 1-5 rows: 4s and 5s = 3.
        var v = rec ? Math.min(3, rec.rating) : 2;
        cells.push({ v: v, set: !!rec, note: rec ? rec.note : '', ds: dates[i3], col: cols[i3], row: rows[i3], empId: e.id });
        sum += v;
      }
      var avg = sum / N;
      var HALF = Math.min(14, Math.floor(N / 2));
      var recent = 0, prior = 0;
      for(var k = 0; k < HALF; k++){ recent += cells[N-1-k].v; prior += cells[N-1-HALF-k].v; }
      var diff = HALF ? (recent - prior) / HALF : 0;
      var trend = diff > 0.06 ? '↑' : (diff < -0.06 ? '↓' : '→');
      var streakN = 0;
      for(var s = N-1; s >= 0 && cells[s].v >= 2; s--) streakN++;   // a rough day is a 1
      var streak = streakN >= N ? 'no rough days' : streakN + 'd since a rough day';
      return {
        id: e.id, name: e.name,
        initials: e.name.split(/\s+/).map(function(p){ return p[0]; }).join('').slice(0,2).toUpperCase(),
        cells: cells, avg: avg, trend: trend,
        streak: streak, curV: cells[N-1].v, curSet: cells[N-1].set
      };
    });

    var teamToday = emps.length ? (emps.reduce(function(a,e){ return a + e.curV; }, 0) / emps.length).toFixed(1) : '—';
    var goods = emps.filter(function(e){ return e.curV === 3; }).length;
    var okays = emps.filter(function(e){ return e.curV === 2; }).length;
    var roughs = emps.filter(function(e){ return e.curV === 1; }).length;
    var changed = emps.filter(function(e){ return e.curSet; }).length;
    var curLabel = lastDs === today ? 'Team today' : 'Team ' + fmtDate(lastDs);
    var quickLabel = lastDs === today ? 'Today' : fmtDate(lastDs);

    var todayLong = parseLocalDate(today).toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'});

    var h = '<div style="max-width:1340px;margin:0 auto;padding:34px 28px 60px">';

    // header
    h += '<div style="display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap">'
      +  '<div><div style="font-family:\'Bebas Neue\',sans-serif;font-size:44px;letter-spacing:1.5px;line-height:1;color:#1a1a2e">STAFF CHECK-IN</div>'
      +  '<div style="font-size:13px;color:#868e96;margin-top:7px">'+todayLong+' · admins only · Monday–Saturday · no entry = 2 (average, normal day) — only 1s, 3s and notes are saved · click any square to rate or fix that day, today or back · click a name for their 12-month summary</div></div>'
      +  '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">'
      +  '<span style="display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:99px;background:#fff;border:1px solid #e9ecef;font-size:12px;font-weight:600;color:#495057">'+curLabel+' <span style="font-family:\'Bebas Neue\',sans-serif;font-size:18px;line-height:1;color:'+PC[2]+'">'+teamToday+'</span></span>'
      +  '<span style="display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:99px;background:#fff;border:1px solid #e9ecef;font-size:12px;font-weight:600;color:#495057"><span style="width:8px;height:8px;border-radius:50%;background:'+PC[2]+'"></span>'+goods+' good · <span style="width:8px;height:8px;border-radius:50%;background:'+PC[1]+'"></span>'+okays+' okay · <span style="width:8px;height:8px;border-radius:50%;background:'+PC[0]+'"></span>'+roughs+' rough</span>'
      +  '</div></div>';

    // controls bar
    var isCustom = WEEK_PRESETS.indexOf(st.weeksN) === -1;
    h += '<div style="display:flex;align-items:center;gap:10px;margin:20px 0 14px;background:#fff;border:1px solid #e9ecef;border-radius:14px;padding:8px 12px;flex-wrap:wrap">'
      +  '<div style="display:flex;gap:3px;background:#f1f3f5;border-radius:10px;padding:3px">'
      +  [['cards','Crew cards'],['grid','Team grid']].map(function(p){
           var sel = st.view === p[0];
           return '<button onclick="StaffRatings.setView(\''+p[0]+'\')" style="border:none;cursor:pointer;font-family:\'Inter\',sans-serif;font-size:12.5px;font-weight:700;padding:8px 16px;border-radius:8px;background:'+(sel?'#fff':'transparent')+';color:'+(sel?'#1a1a2e':'#868e96')+';box-shadow:'+(sel?'0 1px 4px rgba(0,0,0,.10)':'none')+'">'+p[1]+'</button>';
         }).join('')
      +  '</div>'
      +  '<div style="width:1px;height:24px;background:#e9ecef"></div>'
      +  '<span style="font-size:10.5px;font-weight:700;letter-spacing:.6px;color:#adb5bd;text-transform:uppercase">History</span>'
      +  '<div style="display:flex;gap:4px">'
      +  WEEK_PRESETS.map(function(n){
           var sel = st.weeksN === n;
           return '<button onclick="StaffRatings.setWeeks(\''+n+'\')" style="cursor:pointer;font-family:\'Inter\',sans-serif;font-size:12px;font-weight:700;padding:7px 11px;border-radius:99px;border:1px solid '+(sel?'#1a1a2e':'#e9ecef')+';background:'+(sel?'#1a1a2e':'#fff')+';color:'+(sel?'#fff':'#868e96')+'">'+(n==='all'?'All':(n==='ytd'?'Year to Date':n+'w'))+'</button>';
         }).join('')
      +  '<input type="number" min="1" max="104" placeholder="#" title="Type any number of weeks, press Enter" '
      +  'value="'+(isCustom?st.weeksN:'')+'" onkeydown="StaffRatings.weeksKey(event)" onblur="StaffRatings.weeksBlur(event)" '
      +  'style="width:58px;padding:6px 4px 6px 10px;border-radius:99px;border:1px solid '+(isCustom?'#1a1a2e':'#e9ecef')+';background:#fff;color:#495057;font-family:\'Inter\',sans-serif;font-size:12px;font-weight:700;outline:none">'
      +  '</div>'
      +  '<div style="width:1px;height:24px;background:#e9ecef"></div>'
      +  '<span style="font-size:10.5px;font-weight:700;letter-spacing:.6px;color:#adb5bd;text-transform:uppercase">Palette</span>'
      +  '<div style="display:flex;gap:6px">'
      +  Object.keys(PALETTES).map(function(key){
           var sel = st.pal === key;
           return '<button onclick="StaffRatings.setPal(\''+key+'\')" title="'+PALETTES[key].name+'" style="cursor:pointer;display:inline-flex;align-items:center;gap:2px;padding:6px 8px;border-radius:99px;border:1.5px solid '+(sel?'#1a1a2e':'#e9ecef')+';background:'+(sel?'#f8f9fa':'#fff')+'">'
             + PALETTES[key].c.map(function(c){ return '<span style="width:11px;height:11px;border-radius:3px;background:'+c+';border:1px solid rgba(0,0,0,.06)"></span>'; }).join('')
             + '</button>';
         }).join('')
      +  '</div>'
      +  '<button onclick="StaffRatings.toggleManage()" style="margin-left:auto;cursor:pointer;font-family:\'Inter\',sans-serif;font-size:12px;font-weight:700;padding:7px 13px;border-radius:99px;border:1px solid '+(st.manage?'#1a1a2e':'#e9ecef')+';background:'+(st.manage?'#1a1a2e':'#fff')+';color:'+(st.manage?'#fff':'#868e96')+'">'
      +  (st.manage ? 'Done' : 'Manage crew' + (hiddenList.length ? ' · '+hiddenList.length+' hidden' : ''))
      +  '</button>'
      +  '</div>';

    // legend — one for the whole page, both views
    h += '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 14px;padding:0 4px">'
      +  '<span style="font-size:10.5px;font-weight:700;letter-spacing:.6px;color:#adb5bd;text-transform:uppercase">Legend</span>'
      +  [1,2,3].map(function(v){
           return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:#868e96"><span style="width:11px;height:11px;border-radius:3px;background:'+COLORS[v]+';box-shadow:inset 0 0 0 1px rgba(27,31,35,.07)"></span>'+v+' '+LABELS[v]+'</span>';
         }).join('')
      +  '<span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:#868e96"><span style="width:11px;height:11px;border-radius:3px;background:'+COLORS[2]+';box-shadow:inset 0 0 0 1px rgba(27,31,35,.07),0 0 0 2px #1a1a2e"></span>'+(lastDs === today ? 'today' : fmtDate(lastDs))+'</span>'
      +  '<span style="margin-left:auto;font-size:11.5px;color:#adb5bd">hover a square for its date and note · click it to rate or comment that day</span>'
      +  '</div>';

    if(st.view === 'grid'){
      var innerW = 150 + 14 + gridW + 14 + 40 + (st.manage ? 74 : 0);
      h += '<div style="background:#fff;border:1px solid #e9ecef;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,.05)">'
        +  '<div style="overflow-x:auto;padding:16px 30px 14px"><div style="min-width:'+innerW+'px">'
        +  '<div style="display:flex"><div style="width:164px;flex:none"></div><div style="position:relative;height:'+MONTH_H+'px;flex:1">'
        +  gridMonths.map(function(m){ return '<span style="position:absolute;top:0;left:'+m.x+'px;font-size:10.5px;font-weight:700;letter-spacing:.6px;color:#adb5bd;text-transform:uppercase">'+m.n+'</span>'; }).join('')
        +  '</div></div>';
      emps.forEach(function(emp){
        h += '<div style="display:flex;align-items:center;gap:14px;padding:5px 0;position:relative">'
          +  '<div style="width:150px;flex:none;display:flex;align-items:center;gap:9px">'
          +  (typeof teamAvatar==='function' ? teamAvatar(emp.name, crewAvatarColor(emp.id), 26) : '<span style="width:26px;height:26px;border-radius:50%;background:rgba(34,197,94,.12);display:inline-flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',sans-serif;font-size:12px;color:#16a34a;flex:none">'+escHtml(emp.initials)+'</span>')
          +  '<span onclick="StaffRatings.summary(\''+emp.id+'\')" title="View 12-month summary" style="font-size:13px;font-weight:600;color:#1a1a2e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer">'+escHtml(emp.name)+'</span>'
          +  '</div>'
          +  '<div style="display:flex;gap:'+CELL_GAP+'px;position:relative">';
        emp.cells.forEach(function(cl, i4){
          h += sq(cl, cellW, cellR, (i4 > 0 && cl.row === 0) ? 'margin-left:'+WEEK_GAP+'px;' : '');
        });
        var openP = (st.open||'').split('|'), noteP = (st.noteFor||'').split('|');
        if(openP[0] === emp.id){
          var opRec = _ratings[emp.id+'|'+openP[1]];
          h += '<div style="position:absolute;right:-12px;bottom:22px;background:#fff;border:1px solid #e9ecef;border-radius:12px;box-shadow:0 14px 34px rgba(0,0,0,.16);padding:9px;display:flex;gap:6px;z-index:6;align-items:center">'
            +  '<span style="font-size:11px;font-weight:700;color:#868e96;padding:0 3px;white-space:nowrap">'+fmtDate(openP[1])+'</span>'
            +  chipsForDay(emp.id, openP[1], opRec ? Math.min(3, opRec.rating) : 2, COLORS, false)
            +  '<button onclick="StaffRatings.closePop()" title="Close" style="flex:none;cursor:pointer;font-size:12px;font-weight:700;padding:7px 9px;border-radius:8px;border:1px solid #e9ecef;background:#fff;color:#868e96">&#x2715;</button></div>';
        } else if(noteP[0] === emp.id){
          h += '<div style="position:absolute;right:-12px;bottom:22px;background:#fff;border:1px solid #e9ecef;border-radius:12px;box-shadow:0 14px 34px rgba(0,0,0,.16);padding:9px;display:flex;gap:6px;z-index:6;align-items:center;width:330px">'
            +  '<span style="font-size:11px;font-weight:700;color:#868e96;white-space:nowrap">'+fmtDate(noteP[1])+'</span>'
            +  noteEditorHtml(emp, noteP[1]) + '</div>';
        }
        h += '</div>'
          +  '<div style="width:40px;flex:none;text-align:right;font-family:\'Bebas Neue\',sans-serif;font-size:19px;letter-spacing:.5px;color:'+(emp.avg>=2.34?PC[2]:(emp.avg<=1.66?PC[0]:'#495057'))+'">'+emp.avg.toFixed(1)+'</div>'
          +  (st.manage ? '<button onclick="StaffRatings.hide(\''+emp.id+'\')" style="flex:none;cursor:pointer;font-family:\'Inter\',sans-serif;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid #e9ecef;background:#fff;color:#adb5bd">Hide</button>' : '')
          +  '</div>';
      });
      h += '</div></div>'
        +  '<div style="padding:14px 30px;border-top:1px solid #e9ecef;display:flex;align-items:center">'
        +  '<span style="font-size:12px;color:#868e96">'+(lastDs === today ? 'Today\'s' : fmtDate(lastDs)+'\'s')+' column is outlined.</span>'
        +  '<span style="margin-left:auto;font-size:12px;font-weight:600;color:'+PC[2]+'">'+changed+' rating'+(changed===1?'':'s')+' recorded for '+(lastDs === today ? 'today' : fmtDate(lastDs))+'</span>'
        +  '</div></div>';
    } else {
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax('+cardMin+'px,1fr));gap:14px">';
      emps.forEach(function(emp){
        var openP = (st.open||'').split('|'), noteP = (st.noteFor||'').split('|');
        h += '<div class="sc-crew-card" style="background:#fff;border:1px solid #e9ecef;border-radius:14px;padding:16px 16px 14px;display:flex;flex-direction:column;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,.04)">'
          +  '<div style="display:flex;align-items:center;gap:9px">'
          +  (typeof teamAvatar==='function' ? teamAvatar(emp.name, crewAvatarColor(emp.id), 30) : '<span style="width:30px;height:30px;border-radius:50%;background:rgba(34,197,94,.12);display:inline-flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',sans-serif;font-size:13px;color:#16a34a;flex:none">'+escHtml(emp.initials)+'</span>')
          +  '<span onclick="StaffRatings.summary(\''+emp.id+'\')" title="View 12-month summary" style="font-size:13.5px;font-weight:700;color:#1a1a2e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer">'+escHtml(emp.name)+'</span>'
          +  '<span style="margin-left:auto;font-size:13px;font-weight:700;color:'+(emp.trend==='↑'?PC[2]:(emp.trend==='↓'?PC[0]:'#adb5bd'))+'">'+emp.trend+'</span>'
          +  (st.manage ? '<button onclick="StaffRatings.hide(\''+emp.id+'\')" style="flex:none;cursor:pointer;font-family:\'Inter\',sans-serif;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;border:1px solid #e9ecef;background:#fff;color:#adb5bd">Hide</button>' : '')
          +  '</div>'
          // quick-rate row for the newest tracked day
          +  '<div style="display:flex;align-items:center;gap:8px">'
          +  '<span style="flex:none;font-size:10.5px;font-weight:700;letter-spacing:.5px;color:#adb5bd;text-transform:uppercase;width:44px">'+escHtml(quickLabel)+'</span>'
          +  '<div style="flex:1;display:flex;gap:5px">'+chipsForDay(emp.id, lastDs, emp.curV, COLORS, true)+'</div>'
          +  '</div>';
        // editing a past day: chips or the note box, both stamped with the date
        if(openP[0] === emp.id && openP[1] !== lastDs){
          var opRec2 = _ratings[emp.id+'|'+openP[1]];
          h += '<div style="display:flex;align-items:center;gap:8px;background:#f8f9fa;border:1px solid #e9ecef;border-radius:10px;padding:7px 8px">'
            +  '<span style="flex:none;font-size:11px;font-weight:700;color:#495057;white-space:nowrap">'+fmtDate(openP[1])+'</span>'
            +  '<div style="flex:1;display:flex;gap:5px">'+chipsForDay(emp.id, openP[1], opRec2 ? Math.min(3, opRec2.rating) : 2, COLORS, true)+'</div>'
            +  '<button onclick="StaffRatings.closePop()" title="Close" style="flex:none;cursor:pointer;font-size:12px;font-weight:700;padding:6px 8px;border-radius:8px;border:1px solid #e9ecef;background:#fff;color:#868e96">&#x2715;</button>'
            +  '</div>';
        }
        if(noteP[0] === emp.id){
          h += '<div style="display:flex;gap:6px;align-items:center">'
            +  '<span style="flex:none;font-size:11px;font-weight:700;color:#868e96;white-space:nowrap">'+fmtDate(noteP[1])+'</span>'
            +  noteEditorHtml(emp, noteP[1]) + '</div>';
        }
        // the contribution graph: weeks across, Mon–Sat down
        h += '<div style="display:flex;gap:4px;overflow-x:auto">'
          +  '<div style="flex:none;width:'+railW+'px;display:grid;grid-template-rows:repeat(6,'+miniCell+'px);gap:'+miniGap+'px;margin-top:'+MONTH_H+'px">'
          +  DOW_LETTER.map(function(L, r){
               var show = (r === 0 || r === 2 || r === 4 || (r === 5 && miniPitch >= 11));
               return '<span style="display:flex;align-items:center;font-size:'+Math.max(7, Math.min(9, miniCell))+'px;font-weight:700;color:#adb5bd;line-height:1">'+(show?L:'')+'</span>';
             }).join('')
          +  '</div>'
          +  '<div style="flex:none">'
          +  '<div style="position:relative;height:'+MONTH_H+'px">'
          +  cardMonths.map(function(m){ return '<span style="position:absolute;top:0;left:'+m.x+'px;font-size:9.5px;font-weight:700;letter-spacing:.4px;color:#adb5bd;text-transform:uppercase">'+m.n+'</span>'; }).join('')
          +  '</div>'
          +  '<div style="display:grid;grid-template-columns:repeat('+weeksShown+','+miniCell+'px);grid-template-rows:repeat(6,'+miniCell+'px);gap:'+miniGap+'px">';
        emp.cells.forEach(function(cl){
          h += sq(cl, miniCell, miniR, 'grid-column:'+(cl.col+1)+';grid-row:'+(cl.row+1)+';');
        });
        h += '</div></div></div>'
          +  '<div style="display:flex;align-items:baseline;gap:8px;border-top:1px solid #f1f3f5;padding-top:10px">'
          +  '<span style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;line-height:1;color:'+(emp.avg>=2.34?PC[2]:(emp.avg<=1.66?PC[0]:'#495057'))+'">'+emp.avg.toFixed(1)+'</span>'
          +  '<span style="font-size:10.5px;font-weight:600;color:#adb5bd;text-transform:uppercase;letter-spacing:.4px">avg</span>'
          +  '<span style="margin-left:auto;font-size:11px;color:#868e96">'+escHtml(emp.streak)+'</span>'
          +  '</div></div>';
      });
      h += '</div>';
    }

    // hidden crew — only surfaced in manage mode, with a Show button to bring
    // someone back. Hidden people are skipped everywhere else (rows, stats).
    if(st.manage){
      h += '<div style="margin-top:14px;background:#fff;border:1px solid #e9ecef;border-radius:14px;padding:16px 22px">'
        +  '<div style="font-size:10.5px;font-weight:700;letter-spacing:.6px;color:#adb5bd;text-transform:uppercase;margin-bottom:10px">Hidden — not tracked</div>';
      if(hiddenList.length){
        h += '<div style="display:flex;flex-wrap:wrap;gap:8px">'
          +  hiddenList.map(function(e){
               var ini = e.name.split(/\s+/).map(function(p){ return p[0]; }).join('').slice(0,2).toUpperCase();
               return '<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 8px 6px 6px;border-radius:99px;background:#f8f9fa;border:1px solid #e9ecef">'
                 + (typeof teamAvatar==='function' ? teamAvatar(e.name, crewAvatarColor(e.id), 24) : '<span style="width:24px;height:24px;border-radius:50%;background:#f1f3f5;display:inline-flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',sans-serif;font-size:11px;color:#adb5bd">'+escHtml(ini)+'</span>')
                 + '<span style="font-size:12.5px;font-weight:600;color:#868e96">'+escHtml(e.name)+'</span>'
                 + '<button onclick="StaffRatings.show(\''+e.id+'\')" style="cursor:pointer;font-family:\'Inter\',sans-serif;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;border:1px solid #1a1a2e;background:#1a1a2e;color:#fff">Show</button>'
                 + '</span>';
             }).join('')
          +  '</div>';
      } else {
        h += '<div style="font-size:12px;color:#adb5bd">No one is hidden. Use the Hide buttons above to stop tracking someone.</div>';
      }
      h += '</div>';
    }

    h += '</div>';
    el.innerHTML = h;
    if(st.noteFor){
      var ni = document.getElementById('sc-note-' + st.noteFor.split('|')[0]);
      if(ni){ ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); }
    }
  }

  // Chip row for one specific day — every day drawn on the page gets one, so a
  // forgotten entry or comment can be filled in after the fact.
  function chipsForDay(empId, ds, curV, COLORS, flexy){
    return [1,2,3].map(function(v){
      var sel = v === curV;
      return '<button onclick="StaffRatings.rate(\''+empId+'\','+v+',\''+ds+'\')" title="'+v+' — '+LABELS[v]+'" '
        + 'style="'+(flexy?'flex:1;':'width:32px;')+'height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;'
        + 'font-family:\'Inter\',sans-serif;font-size:'+(flexy?'12':'13')+'px;font-weight:800;cursor:pointer;'
        + 'background:'+(sel?COLORS[v]:'#f8f9fa')+';color:'+(sel?FG_SEL[v]:'#868e96')+';border:1.5px solid '+(sel?COLORS[v]:'#e9ecef')+'">'+v+'</button>';
    }).join('');
  }

  // Inline note editor shown right after rating a 1 or a 3 (also reopens when
  // the day's square or chip is clicked again, so comments can be fixed later).
  function noteEditorHtml(emp, ds){
    var rec = _ratings[emp.id + '|' + ds];
    var val = rec ? (rec.note || '') : '';
    return '<input id="sc-note-'+emp.id+'" type="text" maxlength="200" placeholder="Add a comment — what happened? (optional)" value="'+escHtml(val).replace(/"/g,'&quot;')+'" '
      +  'onkeydown="if(event.key===\'Enter\')StaffRatings.saveNote(\''+emp.id+'\',\''+ds+'\');if(event.key===\'Escape\')StaffRatings.closeNote()" '
      +  'style="flex:1;min-width:0;padding:7px 10px;border-radius:8px;border:1.5px solid #1a1a2e;background:#fff;color:#1a1a2e;font-family:\'Inter\',sans-serif;font-size:12px;outline:none">'
      +  '<button onclick="StaffRatings.saveNote(\''+emp.id+'\',\''+ds+'\')" style="flex:none;cursor:pointer;font-family:\'Inter\',sans-serif;font-size:11.5px;font-weight:700;padding:7px 12px;border-radius:8px;border:1px solid #1a1a2e;background:#1a1a2e;color:#fff">Save</button>'
      +  '<button onclick="StaffRatings.closeNote()" title="Skip" style="flex:none;cursor:pointer;font-size:12px;font-weight:700;padding:7px 9px;border-radius:8px;border:1px solid #e9ecef;background:#fff;color:#868e96">&#x2715;</button>';
  }

  // ── handlers ──
  function setView(v){ st.view = v; st.open = null; st.noteFor = null; persist(); paint(); }
  function setPal(p){ if(PALETTES[p]){ st.pal = p; persist(); paint(); } }
  function setWeeks(n){
    st.weeksN = (n === 'all' || n === 'ytd') ? n : parseInt(n,10);
    st.open = null; st.noteFor = null; persist();
    ensureWindow().then(paint); paint();
  }
  function weeksKey(e){ if(e.key === 'Enter'){ applyCustom(e.target); e.target.blur(); } }
  function weeksBlur(e){ if(e.target.value !== '') applyCustom(e.target); }
  function applyCustom(inp){
    var n = parseInt(inp.value, 10);
    if(!isNaN(n) && n >= 1) setWeeks(Math.min(104, n));
  }
  function togglePop(empId, ds){
    if(!rateable(ds)){ toast('Only weekdays up to today can be rated.', 'error'); return; }
    var k = empId + '|' + ds;
    st.open = (st.open === k) ? null : k;
    st.noteFor = null;
    paint();
  }
  function closePop(){ st.open = null; paint(); }
  function toggleManage(){ st.manage = !st.manage; st.open = null; st.noteFor = null; paint(); }

  async function setHidden(empId, hide){
    var was = !!_hidden[empId];
    if(hide) _hidden[empId] = true; else delete _hidden[empId];
    paint();
    try {
      var r = await db.from('jwg_app_settings').upsert(
        {key: 'checkin_hidden', value: Object.keys(_hidden), updated_at: new Date().toISOString()},
        {onConflict: 'key'});
      if(r.error) throw r.error;
    } catch(e){
      if(was) _hidden[empId] = true; else delete _hidden[empId];
      toast('Save failed: ' + ((e && e.message) || e), 'error');
      paint();
    }
  }

  async function rate(empId, v, ds){
    if(!rateable(ds)){ toast('Only weekdays up to today can be rated.', 'error'); return; }
    var key = empId + '|' + ds;
    var prev = _ratings[key];
    var note = prev ? (prev.note || '') : '';
    st.open = null;
    try {
      // 2 is the default (average/normal) — a plain 2 with no note is stored as
      // "no row", so the table only ever holds deviations (1s and 3s) and notes.
      if(v === 2 && !note){
        var rD = await db.from('employee_ratings').delete()
          .eq('employee_id', empId).eq('rating_date', ds);
        if(rD.error) throw rD.error;
        delete _ratings[key];
      } else {
        var rU = await db.from('employee_ratings').upsert(
          {employee_id: empId, rating_date: ds, rating: v, note: note || null, updated_at: new Date().toISOString()},
          {onConflict: 'employee_id,rating_date'});
        if(rU.error) throw rU.error;
        _ratings[key] = { rating: v, note: note };
        if(!_minDate || ds < _minDate) _minDate = ds;
      }
      // A 1 or a 3 is worth a word — open the comment box (2 = normal, no ask)
      st.noteFor = (v === 1 || v === 3) ? key : null;
      paint();
    } catch(e){
      toast('Save failed: ' + ((e && e.message) || e), 'error');
      paint();
    }
  }

  async function saveNote(empId, ds){
    var inp = document.getElementById('sc-note-' + empId);
    if(!inp) return;
    if(!rateable(ds)){ toast('Only weekdays up to today can be rated.', 'error'); return; }
    var note = inp.value.trim();
    var key = empId + '|' + ds;
    var rating = _ratings[key] ? Math.min(3, _ratings[key].rating) : 2;
    st.noteFor = null;
    try {
      if(rating === 2 && !note){
        var rD = await db.from('employee_ratings').delete()
          .eq('employee_id', empId).eq('rating_date', ds);
        if(rD.error) throw rD.error;
        delete _ratings[key];
      } else {
        var rU = await db.from('employee_ratings').upsert(
          {employee_id: empId, rating_date: ds, rating: rating, note: note || null, updated_at: new Date().toISOString()},
          {onConflict: 'employee_id,rating_date'});
        if(rU.error) throw rU.error;
        _ratings[key] = { rating: rating, note: note };
        if(!_minDate || ds < _minDate) _minDate = ds;
      }
      paint();
    } catch(e){
      toast('Save failed: ' + ((e && e.message) || e), 'error');
      paint();
    }
  }
  function closeNote(){ st.noteFor = null; paint(); }

  // ── 12-month summary modal: every saved 1 and 3 (and noted 2s), grouped ──
  function fmtDate(ds){
    var d = parseLocalDate(ds);
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== new Date().getFullYear() ? ', ' + d.getFullYear() : '');
  }
  async function summary(empId){
    var emp = _emps && _emps.find(function(e){ return e.id === empId; });
    if(!emp) return;
    var startD = new Date(parseLocalDate(todayStr())); startD.setFullYear(startD.getFullYear() - 1);
    var r = await db.from('employee_ratings').select('rating_date,rating,note')
      .eq('employee_id', empId).gte('rating_date', ymdLocal(startD))
      .order('rating_date', {ascending:false});
    if(r.error){ toast('Summary load failed: ' + r.error.message, 'error'); return; }
    var rows = (r.data || []).map(function(x){ return { d: x.rating_date, v: Math.min(3, x.rating), note: x.note || '' }; });
    var goods = rows.filter(function(x){ return x.v === 3; });
    var bads  = rows.filter(function(x){ return x.v === 1; });
    var noted2 = rows.filter(function(x){ return x.v === 2 && x.note; });

    // per-month counts, newest month first (only months that have entries)
    var monthsSeen = [], byMonth = {};
    rows.forEach(function(x){
      var mk = x.d.slice(0,7);
      if(!byMonth[mk]){ byMonth[mk] = {g:0, b:0}; monthsSeen.push(mk); }
      if(x.v === 3) byMonth[mk].g++;
      if(x.v === 1) byMonth[mk].b++;
    });
    var PC = PALETTES[st.pal].c;

    function entryList(list, emptyText){
      var withNote = list.filter(function(x){ return x.note; });
      var plain = list.length - withNote.length;
      if(!list.length) return '<div style="font-size:12.5px;color:#adb5bd;padding:4px 0">'+emptyText+'</div>';
      return withNote.map(function(x){
          return '<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #f1f3f5;font-size:13px">'
            + '<span style="flex:none;width:64px;color:#868e96;font-weight:600">'+fmtDate(x.d)+'</span>'
            + '<span style="color:#1a1a2e">'+escHtml(x.note)+'</span></div>';
        }).join('')
        + (plain ? '<div style="font-size:12px;color:#adb5bd;padding-top:7px">+ '+plain+' more without a comment</div>' : '');
    }

    var body =
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'
      + '<span style="display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:99px;background:#fff;border:1px solid #e9ecef;font-size:12.5px;font-weight:700;color:#495057"><span style="width:9px;height:9px;border-radius:50%;background:'+PC[2]+'"></span>'+goods.length+' good day'+(goods.length===1?'':'s')+'</span>'
      + '<span style="display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:99px;background:#fff;border:1px solid #e9ecef;font-size:12.5px;font-weight:700;color:#495057"><span style="width:9px;height:9px;border-radius:50%;background:'+PC[0]+'"></span>'+bads.length+' rough day'+(bads.length===1?'':'s')+'</span>'
      + '</div>'
      + (monthsSeen.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">'
        + monthsSeen.map(function(mk){
            var m = byMonth[mk]; var p = mk.split('-');
            return '<span style="font-size:11.5px;font-weight:600;color:#868e96;background:#f8f9fa;border:1px solid #e9ecef;border-radius:8px;padding:5px 9px">'
              + MONTHS[+p[1]-1] + ' ' + p[0].slice(2)
              + (m.g ? ' <b style="color:'+PC[2]+'">'+m.g+'↑</b>' : '')
              + (m.b ? ' <b style="color:'+PC[0]+'">'+m.b+'↓</b>' : '') + '</span>';
          }).join('') + '</div>' : '')
      + '<div style="font-size:10.5px;font-weight:700;letter-spacing:.6px;color:'+PC[2]+';text-transform:uppercase;margin-bottom:2px">Positives</div>'
      + entryList(goods, 'No good days recorded in the last 12 months.')
      + '<div style="font-size:10.5px;font-weight:700;letter-spacing:.6px;color:'+PC[0]+';text-transform:uppercase;margin:16px 0 2px">Negatives</div>'
      + entryList(bads, 'No rough days recorded in the last 12 months. 🎉')
      + (noted2.length ? '<div style="font-size:10.5px;font-weight:700;letter-spacing:.6px;color:#868e96;text-transform:uppercase;margin:16px 0 2px">Other notes (average days)</div>' + entryList(noted2, '') : '');

    if(!document.getElementById('sc-sum-modal')){
      var div = document.createElement('div');
      div.className = 'modal-overlay';
      div.id = 'sc-sum-modal';
      div.innerHTML = '<div class="modal" style="max-width:560px"><div class="modal-header"><div class="modal-title" id="sc-sum-title"></div><button class="modal-close" onclick="closeM(\'sc-sum-modal\')">&#x2715;</button></div><div id="sc-sum-body" style="max-height:65vh;overflow-y:auto;padding-right:2px"></div></div>';
      div.addEventListener('click', function(e){ if(e.target === div) closeM('sc-sum-modal'); });
      document.body.appendChild(div);
    }
    document.getElementById('sc-sum-title').textContent = emp.name + ' — last 12 months';
    document.getElementById('sc-sum-body').innerHTML = body;
    document.getElementById('sc-sum-modal').classList.add('open');
  }

  window.renderStaffCheckin = renderStaffCheckin;
  window.StaffRatings = {
    rate: rate, setView: setView, setPal: setPal, setWeeks: setWeeks,
    weeksKey: weeksKey, weeksBlur: weeksBlur, togglePop: togglePop,
    closePop: closePop, toggleManage: toggleManage,
    saveNote: saveNote, closeNote: closeNote, summary: summary,
    hide: function(id){ setHidden(id, true); },
    show: function(id){ setHidden(id, false); }
  };
})();
