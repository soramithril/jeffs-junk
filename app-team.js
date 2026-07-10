// ── TEAM MANAGEMENT PAGE (full-page master list) ──────────────────────────
// One place to manage every person. crew_members is the MASTER. Toggles set which
// side(s) a person works (Junk/Bins, Jeff White Group), whether they're active, and
// their seasonal availability (Summer/Winter). JWG people are mirrored into
// jwg_employees (linked by crew_members.jwg_id) so the JWG schedule and Staff
// Check-In — which still read jwg_employees — stay in sync while we transition.
// Replaces the old "Manage Crew Members" card modal.
(function(){
  'use strict';

  var _team = null;       // every crew_members row (master), incl. inactive
  var _openColour = null; // id of the person whose colour palette is open
  var _gifts = [];        // employee_incentives rows (admins only — RLS hides them otherwise)
  var _giftOpen = null;   // id of the person whose gift-card modal is open

  // Card types are Tim Hortons plus whatever's been logged before — picking
  // "New card type…" in the modal lets admins add more as needed.
  var GIFT_SEED = ['Tim Hortons'];

  // Colour palette — 24 hues spaced evenly around the wheel (15° apart) so no
  // two people are close cousins. Everyone gets a distinct one; taken colours
  // are locked out in the picker so no two active people can share.
  var TEAM_PALETTE = [
    '#cc3333','#cc5933','#cc8033','#cca633','#cccc33','#a6cc33','#80cc33','#59cc33',
    '#33cc33','#33cc59','#33cc80','#33cca6','#33cccc','#33a6cc','#3380cc','#3359cc',
    '#3333cc','#5933cc','#8033cc','#a633cc','#cc33cc','#cc33a6','#cc3380','#cc3359'
  ];

  function host(){ return document.getElementById('team-page'); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function canRemove(){ return typeof canDelete !== 'undefined' && canDelete; }
  function canGift(){ return typeof canAccessAnalytics === 'function' && canAccessAnalytics(); }

  // Avatar helpers — initials in the person's real driver colour (same colour
  // Dispatch uses). Falls back to the app's per-id palette when none is set.
  function initials(name){
    var parts = String(name||'').trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return '?';
    if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0]+parts[1][0]).toUpperCase();
  }
  function avatarColor(p){
    if(p.color) return p.color;
    return (typeof crewAvatarColor==='function') ? crewAvatarColor(p.id) : '#6b7280';
  }
  function ink(hex){                              // readable initials colour for the avatar
    var h=String(hex||'').replace('#',''); if(h.length===3) h=h.split('').map(function(c){return c+c;}).join('');
    var n=parseInt(h,16); if(isNaN(n)) return '#fff';
    var r=(n>>16)&255, g=(n>>8)&255, b=n&255;
    return (0.299*r+0.587*g+0.114*b)/255 > 0.62 ? '#1a1a2e' : '#ffffff';
  }

  async function load(){
    var r = await db.from('crew_members').select('*').order('name');
    if(r.error) throw r.error;
    _team = r.data || [];
    _gifts = [];
    if(canGift()){
      // Incentives are a side panel — a load failure here shouldn't block the roster
      var g = await db.from('employee_incentives').select('*').order('given_at',{ascending:false});
      if(g.error) console.warn('Incentives load failed:', g.error.message);
      else _gifts = g.data || [];
    }
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
    var av = avatarColor(p);
    var cells = ''
      + '<td style="padding:11px 14px"><div style="display:flex;align-items:center;gap:12px;position:relative">'
        + '<button type="button" class="team-av'+(p.active?'':' team-av-off')+'" onclick="TeamMgr.openColour(\''+p.id+'\')" title="Set '+esc(p.name)+'’s driver colour" style="--av:'+esc(av)+';box-shadow:0 3px 9px '+esc(av)+'59,inset 0 1px 0 rgba(255,255,255,.4)">'
          + '<span style="color:'+ink(av)+'">'+esc(initials(p.name))+'</span>'
        + '</button>'
        + '<span style="font-size:14.5px;font-weight:700;letter-spacing:-.2px'+(p.active?'':';color:#adb5bd;text-decoration:line-through')+'">'+esc(p.name)+'</span>'
        + '<button onclick="TeamMgr.rename(\''+p.id+'\')" title="Rename" style="background:none;border:none;color:#c3c9cf;cursor:pointer;font-size:13px">✎</button>'
        + (_openColour===p.id ? colourPopover(p) : '')
      + '</div></td>'
      + '<td style="padding:9px 8px;text-align:center">'+pill(p.id,'on_junk',p.on_junk,'Junk / Bins','#16a34a')+'</td>'
      + '<td style="padding:9px 8px;text-align:center">'+pill(p.id,'on_jwg',p.on_jwg,'Jeff White Group','#0d6efd')+'</td>'
      + '<td style="padding:9px 8px;text-align:center">'+pill(p.id,'summer',p.summer,'Summer','#f59e0b')+'</td>'
      + '<td style="padding:9px 8px;text-align:center">'+pill(p.id,'winter',p.winter,'Winter','#38bdf8')+'</td>'
      + '<td style="padding:9px 8px;text-align:center">'+pill(p.id,'active',p.active,p.active?'Active':'Inactive','#6b7280')+'</td>'
      + (canGift() ? '<td style="padding:9px 8px;text-align:center">'+giftCell(p)+'</td>' : '')
      + '<td style="padding:9px 12px;text-align:right">'
        + (rm ? '<button onclick="TeamMgr.remove(\''+p.id+'\')" title="Remove (soft — keeps history)" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:16px">×</button>' : '')
      + '</td>';
    return '<tr style="border-bottom:1px solid var(--border)'+(p.active?'':';background:rgba(0,0,0,.02)')+'">'+cells+'</tr>';
  }

  // Palette popover: swatches, with colours already used by another active
  // person locked out so no two people can share a colour.
  function colourPopover(p){
    var cur = String(p.color||'').toLowerCase();
    var swatches = TEAM_PALETTE.map(function(hex){
      var isCur = hex.toLowerCase()===cur;
      var takenBy = _team.find(function(x){ return x.id!==p.id && x.active && x.color && String(x.color).toLowerCase()===hex.toLowerCase(); });
      if(takenBy && !isCur){
        return '<span class="team-sw team-sw-taken" title="Used by '+esc(takenBy.name)+'" style="background:'+hex+'"></span>';
      }
      return '<button type="button" class="team-sw'+(isCur?' team-sw-cur':'')+'" title="'+hex+'" style="background:'+hex+'" onclick="TeamMgr.pick(\''+p.id+'\',\''+hex+'\')"></button>';
    }).join('');
    return '<div class="team-pop-bd" onclick="TeamMgr.closeColour()"></div>'
      + '<div class="team-pop" onclick="event.stopPropagation()">'
        + '<div class="team-pop-t">'+esc(p.name)+'’s colour</div>'
        + '<div class="team-pop-grid">'+swatches+'</div>'
        + '<label class="team-pop-custom">Custom <input type="color" value="'+esc(p.color||avatarColor(p))+'" onchange="TeamMgr.pick(\''+p.id+'\',this.value)"></label>'
      + '</div>';
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
      +  th('Person','left') + th('Junk / Bins') + th('JWG') + th('Summer') + th('Winter') + th('Active') + (canGift() ? th('Gift Cards') : '') + th('','right')
      +  '</tr></thead><tbody>'
      +  people.map(row).join('')
      +  '</tbody></table></div>';

    h += '<div style="font-size:11.5px;color:#adb5bd;margin-top:12px;line-height:1.5">'
      +  'Removing someone keeps their history (they go inactive, not deleted). The Junk/Bins toggle takes effect across dispatch, the crew schedule and pickers right away. '
      +  'JWG people also appear on the Jeff White Group schedule and Staff Check-In.'
      +  '</div>';
    h += '</div>';
    if(_giftOpen) h += giftModal();
    el.innerHTML = h;
  }

  // ── gift-card incentives (admins only) ──
  function giftCell(p){
    var mine = _gifts.filter(function(g){ return g.crew_member_id===p.id; });
    var n = mine.reduce(function(s,g){ return s+(g.qty||1); }, 0);
    return '<button onclick="TeamMgr.openGift(\''+p.id+'\')" title="Gift cards given to '+esc(p.name)+'" '
      + 'style="cursor:pointer;font-family:inherit;font-size:11.5px;font-weight:700;padding:5px 12px;border-radius:99px;white-space:nowrap;'
      + (n ? 'background:rgba(245,158,11,.12);color:#b45309;border:1.5px solid rgba(245,158,11,.4);'
           : 'background:#fff;color:#adb5bd;border:1.5px solid #e9ecef;')
      + '">🎁 '+n+'</button>';
  }
  function giftModal(){
    var p = find(_giftOpen); if(!p) return '';
    var mine = _gifts.filter(function(g){ return g.crew_member_id===p.id; });
    var hist = mine.length ? mine.map(function(g){
      var d = g.given_at ? new Date(g.given_at+'T00:00:00').toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'}) : '';
      return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px">'
        + '<span style="font-weight:700;white-space:nowrap">'+esc(g.gift_card)+(g.qty>1?' ×'+g.qty:'')+'</span>'
        + '<span style="flex:1;color:var(--muted)">'+esc(g.reason||'')+'</span>'
        + '<span style="color:var(--muted);font-size:11.5px;white-space:nowrap">'+d+(g.created_by?' · '+esc(g.created_by):'')+'</span>'
        + '<button onclick="TeamMgr.removeGift(\''+g.id+'\')" title="Remove entry" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:14px">×</button>'
        + '</div>';
    }).join('') : '<div style="padding:18px 0;color:var(--muted);font-size:13px;text-align:center">No gift cards logged yet.</div>';
    var types = GIFT_SEED.slice();
    _gifts.forEach(function(g){ if(g.gift_card && types.indexOf(g.gift_card)===-1) types.push(g.gift_card); });
    types.sort();
    var opts = types.map(function(c){ return '<option value="'+esc(c)+'">'+esc(c)+'</option>'; }).join('')
      + '<option value="__new">➕ New card type…</option>';
    return '<div class="modal-overlay open" onclick="if(event.target===this)TeamMgr.closeGift()"><div class="modal" style="max-width:560px;width:92vw">'
      + '<h3 style="margin:0 0 4px">🎁 '+esc(p.name)+' — Gift cards</h3>'
      + '<div style="font-size:12.5px;color:var(--muted);margin-bottom:14px">Log a gift card given for a good review or great work.</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px">'
      +   '<select id="gift-card-sel" onchange="document.getElementById(\'gift-card-new\').style.display=this.value===\'__new\'?\'\':\'none\'" style="padding:8px 10px;border-radius:8px;border:1px solid var(--border);font-family:inherit;font-size:13px">'+opts+'</select>'
      +   '<input id="gift-card-new" type="text" placeholder="New card type (e.g. Canadian Tire)" style="display:none;min-width:160px;padding:8px 10px;border-radius:8px;border:1px solid var(--border);font-family:inherit;font-size:13px">'
      +   '<input id="gift-qty" type="number" min="1" value="1" style="width:60px;padding:8px 10px;border-radius:8px;border:1px solid var(--border);font-family:inherit;font-size:13px">'
      +   '<input id="gift-reason" type="text" placeholder="Why? (e.g. 5-star review from the Hansons)" style="flex:1;min-width:170px;padding:8px 10px;border-radius:8px;border:1px solid var(--border);font-family:inherit;font-size:13px">'
      +   '<button class="btn btn-primary" onclick="TeamMgr.giveGift()" style="padding:9px 18px;font-size:13px">Give it</button>'
      + '</div>'
      + '<div style="margin-top:14px;max-height:300px;overflow-y:auto">'+hist+'</div>'
      + '<div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn btn-ghost" onclick="TeamMgr.closeGift()">Close</button></div>'
      + '</div></div>';
  }
  function openGift(id){ _giftOpen = id; paint(); }
  function closeGift(){ _giftOpen = null; paint(); }
  async function giveGift(){
    var p = find(_giftOpen); if(!p) return;
    var sel = document.getElementById('gift-card-sel').value;
    var card = sel === '__new' ? document.getElementById('gift-card-new').value.trim() : sel;
    if(!card){ toast('Type the new card name first.', 'error'); return; }
    var qty = parseInt(document.getElementById('gift-qty').value, 10) || 1;
    var reason = document.getElementById('gift-reason').value.trim();
    var by = (typeof currentUser!=='undefined' && currentUser) ? (currentUser.displayName || String(currentUser.email||'').split('@')[0]) : '';
    var r = await db.from('employee_incentives').insert({crew_member_id:p.id, gift_card:card, qty:qty, reason:reason||null, created_by:by}).select();
    if(r.error){ toast('Couldn\'t save: '+r.error.message, 'error'); return; }
    if(r.data && r.data[0]) _gifts.unshift(r.data[0]);
    toast('🎁 Logged — '+card+(qty>1?' ×'+qty:'')+' for '+p.name);
    paint();
  }
  async function removeGift(id){
    if(!confirm('Remove this gift card entry?')) return;
    var r = await db.from('employee_incentives').delete().eq('id', id);
    if(r.error){ toast('Couldn\'t remove: '+r.error.message, 'error'); return; }
    _gifts = _gifts.filter(function(g){ return g.id!==id; });
    paint();
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

  function openColour(id){ _openColour = (_openColour===id) ? null : id; paint(); }
  function closeColour(){ if(_openColour){ _openColour = null; paint(); } }
  async function pick(id, hex){
    var p = find(id); if(!p) return;
    var clash = _team.find(function(x){ return x.id!==id && x.active && x.color && String(x.color).toLowerCase()===String(hex).toLowerCase(); });
    if(clash){ if(typeof toast==='function') toast(hex+' is already '+clash.name+'’s colour — pick another.', 'error'); return; }
    _openColour = null;
    await color(id, hex);   // persists + syncs the junk-side list
    paint();
  }
  function firstFreeColour(){
    var used = {}; _team.forEach(function(x){ if(x.color) used[String(x.color).toLowerCase()] = 1; });
    for(var i=0;i<TEAM_PALETTE.length;i++){ if(!used[TEAM_PALETTE[i].toLowerCase()]) return TEAM_PALETTE[i]; }
    return TEAM_PALETTE[0];
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
        name:name, active:true, on_junk:onJunk, on_jwg:onJwg, summer:true, winter:true, jwg_id:jwgId, color:firstFreeColour()
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
  window.TeamMgr = { toggle:toggle, rename:rename, color:color, add:add, remove:remove,
    openColour:openColour, closeColour:closeColour, pick:pick,
    openGift:openGift, closeGift:closeGift, giveGift:giveGift, removeGift:removeGift };
})();
