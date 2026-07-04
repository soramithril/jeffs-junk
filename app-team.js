// ── TEAM MANAGEMENT PAGE (full-page master list) ──────────────────────────
// One place to manage every person. crew_members is the MASTER. Toggles set which
// side(s) a person works (Junk/Bins, Jeff White Group), whether they're active, and
// their seasonal availability (Summer/Winter). JWG people are mirrored into
// jwg_employees (linked by crew_members.jwg_id) so the JWG schedule and Staff
// Check-In — which still read jwg_employees — stay in sync while we transition.
// Replaces the old "Manage Crew Members" card modal.
(function(){
  'use strict';

  var _team = null;   // every crew_members row (master), incl. inactive

  function host(){ return document.getElementById('team-page'); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function canRemove(){ return typeof canDelete !== 'undefined' && canDelete; }

  async function load(){
    var r = await db.from('crew_members').select('*').order('name');
    if(r.error) throw r.error;
    _team = r.data || [];
    syncGlobalCrew();
  }

  // Keep the junk-side global list (dispatch, pickers, crew schedule, leaderboard,
  // damage) in sync with the master without a page reload: junk + active only.
  function syncGlobalCrew(){
    if(typeof crewMembers === 'undefined') return;
    crewMembers = _team.filter(function(p){ return p.on_junk && p.active; })
      .map(function(p){ return {id:p.id, name:p.name, color:p.color||null}; });
  }

  async function renderTeamPage(){
    var el = host(); if(!el) return;
    el.innerHTML = '<div style="padding:48px;text-align:center;color:var(--muted)">Loading team…</div>';
    try { await load(); }
    catch(e){ el.innerHTML = '<div style="padding:48px;text-align:center;color:#dc2626">Couldn\'t load team: '+esc((e&&e.message)||e)+'</div>'; return; }
    paint();
  }

  // one on/off pill
  function pill(id, field, on, label, onColor){
    var c = onColor || '#16a34a';
    return '<button onclick="TeamMgr.toggle(\''+id+'\',\''+field+'\')" title="'+esc(label)+'" '
      + 'style="cursor:pointer;font-family:inherit;font-size:11.5px;font-weight:700;padding:5px 12px;border-radius:99px;white-space:nowrap;'
      + (on
          ? 'background:'+c+';color:#fff;border:1.5px solid '+c+';'
          : 'background:#fff;color:#adb5bd;border:1.5px solid #e9ecef;')
      + '">'+esc(label)+'</button>';
  }

  function row(p){
    var rm = canRemove();
    var cells = ''
      + '<td style="padding:9px 12px">'
        + '<input type="color" value="'+(p.color||'#22c55e')+'" title="Colour" onchange="TeamMgr.color(\''+p.id+'\',this.value)" style="width:24px;height:24px;border:none;background:none;cursor:pointer;padding:0;vertical-align:middle">'
        + '<span style="font-size:14px;font-weight:700;margin-left:9px;vertical-align:middle'+(p.active?'':';color:#adb5bd;text-decoration:line-through')+'">'+esc(p.name)+'</span>'
        + '<button onclick="TeamMgr.rename(\''+p.id+'\')" title="Rename" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;margin-left:6px;vertical-align:middle">✎</button>'
      + '</td>'
      + '<td style="padding:9px 8px;text-align:center">'+pill(p.id,'on_junk',p.on_junk,'Junk / Bins','#16a34a')+'</td>'
      + '<td style="padding:9px 8px;text-align:center">'+pill(p.id,'on_jwg',p.on_jwg,'Jeff White Group','#0d6efd')+'</td>'
      + '<td style="padding:9px 8px;text-align:center">'+pill(p.id,'summer',p.summer,'Summer','#f59e0b')+'</td>'
      + '<td style="padding:9px 8px;text-align:center">'+pill(p.id,'winter',p.winter,'Winter','#38bdf8')+'</td>'
      + '<td style="padding:9px 8px;text-align:center">'+pill(p.id,'active',p.active,p.active?'Active':'Inactive','#6b7280')+'</td>'
      + '<td style="padding:9px 12px;text-align:right">'
        + (rm ? '<button onclick="TeamMgr.remove(\''+p.id+'\')" title="Remove (soft — keeps history)" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:16px">×</button>' : '')
      + '</td>';
    return '<tr style="border-bottom:1px solid var(--border)'+(p.active?'':';background:rgba(0,0,0,.02)')+'">'+cells+'</tr>';
  }

  function paint(){
    var el = host(); if(!el || !_team) return;
    var people = _team.slice().sort(function(a,b){
      if(!!a.active !== !!b.active) return a.active ? -1 : 1;      // active first
      return String(a.name).localeCompare(String(b.name));
    });
    var junk = _team.filter(function(p){return p.on_junk && p.active;}).length;
    var jwg  = _team.filter(function(p){return p.on_jwg && p.active;}).length;
    var inactive = _team.filter(function(p){return !p.active;}).length;

    var h = '<div style="max-width:1100px;margin:0 auto;padding:30px 26px 60px">';
    h += '<div style="display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap;margin-bottom:6px">'
      +  '<div><div style="font-family:\'Bebas Neue\',sans-serif;font-size:40px;letter-spacing:1.2px;line-height:1;color:#1a1a2e">TEAM</div>'
      +  '<div style="font-size:13px;color:#868e96;margin-top:6px">One list for everyone — tick the side(s) each person works. Add once; JWG people flow to the schedule &amp; check-in automatically.</div></div>'
      +  '<div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">'
      +  statChip(junk+' junk / bins', '#16a34a')
      +  statChip(jwg+' Jeff White Group', '#0d6efd')
      +  (inactive?statChip(inactive+' inactive', '#adb5bd'):'')
      +  '</div></div>';

    // add row
    h += '<div style="display:flex;gap:8px;align-items:center;margin:18px 0;background:#fff;border:1px solid var(--border);border-radius:12px;padding:10px 12px;flex-wrap:wrap">'
      +  '<input id="team-new-name" type="text" placeholder="Add a person…" onkeydown="if(event.key===\'Enter\')TeamMgr.add()" style="flex:1;min-width:160px;padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);font-size:13.5px;font-family:inherit">'
      +  '<span style="font-size:12px;color:#868e96">works:</span>'
      +  '<label style="font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" id="team-new-junk" checked> Junk / Bins</label>'
      +  '<label style="font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" id="team-new-jwg"> Jeff White Group</label>'
      +  '<button class="btn btn-primary" onclick="TeamMgr.add()" style="font-size:13px;padding:9px 20px">Add person</button>'
      +  '</div>';

    // table
    h += '<div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;box-shadow:var(--shadow-sm)">'
      +  '<table style="width:100%;border-collapse:collapse">'
      +  '<thead><tr style="background:var(--surface2)">'
      +  th('Person','left') + th('Junk / Bins') + th('JWG') + th('Summer') + th('Winter') + th('Active') + th('','right')
      +  '</tr></thead><tbody>'
      +  people.map(row).join('')
      +  '</tbody></table></div>';

    h += '<div style="font-size:11.5px;color:#adb5bd;margin-top:12px;line-height:1.5">'
      +  'Removing someone keeps their history (they go inactive, not deleted). The Junk/Bins toggle takes effect across dispatch, the crew schedule and pickers right away. '
      +  'JWG people also appear on the Jeff White Group schedule and Staff Check-In.'
      +  '</div>';
    h += '</div>';
    el.innerHTML = h;
  }
  function statChip(txt, color){
    return '<span style="display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border-radius:99px;background:#fff;border:1px solid #e9ecef;font-size:12px;font-weight:600;color:#495057"><span style="width:8px;height:8px;border-radius:50%;background:'+color+'"></span>'+esc(txt)+'</span>';
  }
  function th(label, align){
    return '<th style="padding:11px 12px;text-align:'+(align||'center')+';font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-weight:800;white-space:nowrap">'+esc(label)+'</th>';
  }

  // ── mutations (write master; mirror to jwg_employees for JWG people) ──
  function find(id){ return _team ? _team.find(function(p){return p.id===id;}) : null; }

  async function toggle(id, field){
    var p = find(id); if(!p) return;
    var next = !p[field];
    p[field] = next; paint();                    // optimistic
    try {
      var r = await db.from('crew_members').update(_setObj(field, next)).eq('id', id);
      if(r.error) throw r.error;
      // Turning JWG on for someone with no scheduler row → create + link it so
      // they show on the JWG schedule and can be rated.
      if(field==='on_jwg' && next && !p.jwg_id){
        var ins = await db.from('jwg_employees').insert({name:p.name}).select();
        if(!ins.error && ins.data && ins.data[0]){
          p.jwg_id = ins.data[0].id;
          await db.from('crew_members').update({jwg_id:p.jwg_id}).eq('id', id);
        }
      }
      syncGlobalCrew();
    } catch(e){
      p[field] = !next; paint();                 // roll back
      toast('Save failed: '+((e&&e.message)||e), 'error');
    }
  }
  function _setObj(field, val){ var o={}; o[field]=val; return o; }

  async function rename(id){
    var p = find(id); if(!p) return;
    var name = prompt('Rename person:', p.name); if(name===null) return;
    name = name.trim(); if(!name) return;
    var old = p.name; p.name = name; paint();
    try {
      var r = await db.from('crew_members').update({name:name}).eq('id', id);
      if(r.error) throw r.error;
      if(p.jwg_id) await db.from('jwg_employees').update({name:name}).eq('id', p.jwg_id);  // keep the JWG twin's name in sync
      syncGlobalCrew();
    } catch(e){ p.name = old; paint(); toast('Rename failed: '+((e&&e.message)||e), 'error'); }
  }

  async function color(id, col){
    var p = find(id); if(!p) return;
    var old = p.color; p.color = col;
    try { var r = await db.from('crew_members').update({color:col}).eq('id', id); if(r.error) throw r.error; syncGlobalCrew(); }
    catch(e){ p.color = old; toast('Colour update failed: '+((e&&e.message)||e), 'error'); }
  }

  async function add(){
    var inp = document.getElementById('team-new-name'); if(!inp) return;
    var name = inp.value.trim(); if(!name) return;
    var onJunk = !!document.getElementById('team-new-junk').checked;
    var onJwg  = !!document.getElementById('team-new-jwg').checked;
    inp.value = '';
    try {
      var jwgId = null;
      if(onJwg){                                  // JWG people need a scheduler row too
        var ins = await db.from('jwg_employees').insert({name:name}).select();
        if(ins.error) throw ins.error;
        jwgId = ins.data && ins.data[0] ? ins.data[0].id : null;
      }
      var r = await db.from('crew_members').insert({
        name:name, active:true, on_junk:onJunk, on_jwg:onJwg, summer:true, winter:true, jwg_id:jwgId
      }).select();
      if(r.error) throw r.error;
      if(r.data && r.data[0]) _team.push(r.data[0]);
      syncGlobalCrew(); paint();
    } catch(e){ toast('Couldn\'t add: '+((e&&e.message)||e), 'error'); }
  }

  async function remove(id){
    if(!canRemove()){ toast('⚠ You don\'t have permission to remove people.', 'error'); return; }
    var p = find(id); if(!p) return;
    if(!confirm('Remove '+p.name+'? They go inactive (history is kept, nothing is deleted).')) return;
    p.active = false; paint();
    try { var r = await db.from('crew_members').update({active:false}).eq('id', id); if(r.error) throw r.error; syncGlobalCrew(); }
    catch(e){ p.active = true; paint(); toast('Remove failed: '+((e&&e.message)||e), 'error'); }
  }

  window.renderTeamPage = renderTeamPage;
  window.TeamMgr = { toggle:toggle, rename:rename, color:color, add:add, remove:remove };
})();
