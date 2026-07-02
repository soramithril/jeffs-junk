// ── ADMIN-ONLY DAILY STAFF CHECK-IN + HEAT MAP ──────────────────────────
// Rate each employee's day 1-5. No saved row = 3 ("normal day"), so quiet
// days cost nothing. Picking 3 with no note DELETES the row — the table
// only ever holds deviations and notes. Server-side security is the
// employee_ratings RLS policy (user_profiles.role = 'admin'); the button
// gating here is just UI. Reads/writes go through the shared db client.
(function(){
  'use strict';

  var FACES = {1:'😞', 2:'😕', 3:'🙂', 4:'😀', 5:'🤩'};
  var LABELS = {1:'Very bad', 2:'Not great', 3:'Okay', 4:'Good', 5:'Great'};
  var HEAT_DAYS = 84; // 12 weeks of history in the heat map

  var _emps = [];            // [{id,name}]
  var _today = {};           // employee_id -> {rating, note}
  var _noteOpen = {};        // employee_id -> bool

  function isAdmin(){ return typeof canAccessAnalytics === 'function' && canAccessAnalytics(); }
  function heatColor(r){
    return {1:'#dc2626', 2:'#f59e0b', 3:'#e2e8e4', 4:'#86efac', 5:'#16a34a'}[r] || '#e2e8e4';
  }
  function ymdLocal(d){
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  async function openStaffCheckin(){
    if(!isAdmin()){ toast('Admins only', 'error'); return; }
    var m = document.getElementById('staff-checkin-modal');
    m.classList.add('open');
    document.getElementById('sc-body').innerHTML =
      '<div style="text-align:center;padding:30px;color:var(--muted)">Loading…</div>';
    try {
      var today = todayStr();
      var rEmp = await db.from('jwg_employees').select('id,name').order('name');
      if(rEmp.error) throw rEmp.error;
      _emps = rEmp.data || [];
      var rT = await db.from('employee_ratings').select('employee_id,rating,note').eq('rating_date', today);
      if(rT.error) throw rT.error;
      _today = {};
      (rT.data||[]).forEach(function(x){ _today[x.employee_id] = {rating:x.rating, note:x.note||''}; });
      _noteOpen = {};
      renderCheckin();
      loadHeatmap(); // fills the lower half when it arrives
    } catch(e){
      var msg = String((e && e.message) || e);
      document.getElementById('sc-body').innerHTML =
        '<div style="text-align:center;padding:26px;color:#dc2626;font-size:13px">'
        + ((e && e.code === '42P01')
            ? 'The staff-ratings table hasn\'t been set up in the database yet.'
            : 'Couldn\'t load ratings: ' + escHtml(msg))
        + '</div>';
    }
  }

  function renderCheckin(){
    var today = todayStr();
    var h = '<div class="sc-question">Daily Staff Check-In — want to update anyone\'s rating for today?</div>'
      + '<div class="sc-subnote">Everyone starts at 🙂 3 (normal day). Only changes are saved.</div>';
    _emps.forEach(function(e){
      var cur = _today[e.id] ? _today[e.id].rating : 3;
      var note = _today[e.id] ? (_today[e.id].note||'') : '';
      var btns = '';
      for(var v=1; v<=5; v++){
        btns += '<button class="sc-face'+(cur===v?' sel':'')+'" title="'+v+' — '+LABELS[v]+'"'
              + ' onclick="StaffRatings.setRating(\''+e.id+'\','+v+')">'+FACES[v]+'</button>';
      }
      h += '<div class="sc-row" id="sc-row-'+e.id+'">'
        + '<span class="sc-name">'+escHtml(e.name)+'</span>'
        + '<span class="sc-faces">'+btns+'</span>'
        + '<button class="sc-note-btn'+(note?' has-note':'')+'" title="'+(note?escHtml(note):'Add a note')+'"'
        + ' onclick="StaffRatings.toggleNote(\''+e.id+'\')">📝</button>'
        + '</div>'
        + '<div class="sc-note-wrap" id="sc-note-'+e.id+'" style="display:'+(_noteOpen[e.id]?'block':'none')+'">'
        + '<input class="sc-note-input" id="sc-note-input-'+e.id+'" placeholder="Optional note (admins only see this)"'
        + ' value="'+escHtml(note).replace(/"/g,'&quot;')+'" onchange="StaffRatings.saveNote(\''+e.id+'\')">'
        + '</div>';
    });
    h += '<div class="sc-heat-title">Last 12 weeks</div>'
      + '<div class="sc-heat-legend">'
      + [1,2,3,4,5].map(function(v){ return '<span class="sc-leg"><span class="sc-cell" style="background:'+heatColor(v)+'"></span>'+v+'</span>'; }).join('')
      + '<span class="sc-leg-note">blank day = 3</span></div>'
      + '<div id="sc-heat"><div style="color:var(--muted);font-size:12px;padding:8px 0">Loading history…</div></div>'
      + '<div class="sc-foot">Today: '+today+' · visible to admins only</div>';
    document.getElementById('sc-body').innerHTML = h;
  }

  async function setRating(empId, val){
    var today = todayStr();
    var note = (_today[empId] && _today[empId].note) || '';
    try {
      if(val === 3 && !note){
        // Back to the default → remove the row entirely (keeps the table tiny)
        var rD = await db.from('employee_ratings').delete()
          .eq('employee_id', empId).eq('rating_date', today);
        if(rD.error) throw rD.error;
        delete _today[empId];
      } else {
        var rU = await db.from('employee_ratings').upsert(
          {employee_id: empId, rating_date: today, rating: val, note: note || null, updated_at: new Date().toISOString()},
          {onConflict: 'employee_id,rating_date'});
        if(rU.error) throw rU.error;
        _today[empId] = {rating: val, note: note};
      }
      renderCheckin();
      loadHeatmap();
    } catch(e){
      toast('Save failed: ' + ((e && e.message) || e), 'error');
    }
  }

  function toggleNote(empId){
    _noteOpen[empId] = !_noteOpen[empId];
    var el = document.getElementById('sc-note-' + empId);
    if(el) el.style.display = _noteOpen[empId] ? 'block' : 'none';
    if(_noteOpen[empId]){
      var inp = document.getElementById('sc-note-input-' + empId);
      if(inp) inp.focus();
    }
  }

  async function saveNote(empId){
    var inp = document.getElementById('sc-note-input-' + empId);
    if(!inp) return;
    var note = inp.value.trim();
    var rating = (_today[empId] && _today[empId].rating) || 3;
    _today[empId] = {rating: rating, note: note};
    await setRating(empId, rating);   // reuses the delete-on-plain-3 rule
  }

  async function loadHeatmap(){
    var el = document.getElementById('sc-heat');
    if(!el) return;
    var start = new Date(); start.setDate(start.getDate() - (HEAT_DAYS - 1));
    var startStr = ymdLocal(start);
    try {
      var r = await db.from('employee_ratings')
        .select('employee_id,rating_date,rating,note')
        .gte('rating_date', startStr);
      if(r.error) throw r.error;
      var byEmp = {};
      (r.data||[]).forEach(function(x){
        (byEmp[x.employee_id] = byEmp[x.employee_id] || {})[x.rating_date] = x;
      });
      var days = [];
      for(var i=0; i<HEAT_DAYS; i++){
        var d = new Date(start); d.setDate(start.getDate() + i);
        days.push(ymdLocal(d));
      }
      var h = '';
      _emps.forEach(function(e){
        var cells = days.map(function(ds){
          var rec = (byEmp[e.id]||{})[ds];
          var v = rec ? rec.rating : 3;
          var tip = ds + ' — ' + v + '/5' + (rec && rec.note ? ' · ' + rec.note : '');
          return '<span class="sc-cell'+(rec?'':' dflt')+'" style="background:'+heatColor(v)+'" title="'+escHtml(tip)+'"></span>';
        }).join('');
        h += '<div class="sc-heat-row"><span class="sc-heat-name">'+escHtml(e.name)+'</span><span class="sc-heat-cells">'+cells+'</span></div>';
      });
      el.innerHTML = h || '<div style="color:var(--muted);font-size:12px">No employees.</div>';
    } catch(e){
      el.innerHTML = '<div style="color:#dc2626;font-size:12px">History failed to load: '+escHtml((e && e.message) || String(e))+'</div>';
    }
  }

  window.StaffRatings = { open: openStaffCheckin, setRating: setRating, toggleNote: toggleNote, saveNote: saveNote };
  window.openStaffCheckin = openStaffCheckin;
})();
