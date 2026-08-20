// ══════════════════════════════════════════════════════════════════════════
//  PROSPECTS — businesses we want, that aren't customers yet
// ══════════════════════════════════════════════════════════════════════════
// Built around service areas, because the job is "which town am I driving to
// this afternoon and who do I see when I get there". city_drive_times already
// holds 54 towns with minutes from base, so that table is the spine.
//
// Two kinds of target, deliberately counted differently:
//   • direct   — contractors, roofers, property managers. They book bins
//                themselves, so their own record is the measure.
//   • referral — realtors, storage units, estate lawyers. They send us a
//                homeowner who books under their own name, so judging them on
//                work booked in their name would mark every one a failure.
//
// Depends on app.js: db, toast, escHtml, currentUser, go, closeM.
(function(){
  'use strict';

  var STAGES = [
    ['new',       'New',       '#6d7f75'],
    ['contacted', 'Contacted', '#0891b2'],
    ['quoted',    'Quoted',    '#b45309'],
    ['won',       'Won',       '#16a34a'],
    ['lost',      'Lost',      '#b3261e']
  ];
  // Named from what actually turns up in the client base, so the list matches the
  // language the yard already uses. No ranking here on purpose — the whole list
  // loads and the rep works out what converts.
  var TYPES = ['Roofing','Construction / reno','Trades (plumbing, HVAC, electrical)',
    'Property management','Institutional / municipal','Landscaping / fencing / paving',
    'Realtor / real estate','Storage','Hospitality','Other'];

  var S = { rows:[], visits:{}, drive:[], q:'', stage:'', city:'', band:'', type:'', loaded:false };

  function esc(s){
    return String(s==null?'':s).replace(/[&<>"]/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
    });
  }
  function host(){ return document.getElementById('prospects-page'); }
  function me(){
    return (typeof currentUser!=='undefined' && currentUser)
      ? (currentUser.displayName || String(currentUser.email||'').split('@')[0]) : 'Unknown';
  }
  function stageMeta(v){
    for(var i=0;i<STAGES.length;i++){ if(STAGES[i][0]===v) return STAGES[i]; }
    return STAGES[0];
  }
  function minutesFor(city){
    if(!city) return null;
    var c = String(city).trim().toLowerCase();
    for(var i=0;i<S.drive.length;i++){
      if(String(S.drive[i].city||'').trim().toLowerCase()===c) return S.drive[i].minutes;
    }
    return null;
  }
  function fdate(d){
    if(!d) return '';
    var p = String(d).split('-');
    if(p.length!==3) return String(d);
    return p[2]+'/'+p[1]+'/'+p[0].slice(2);
  }
  function today(){ return new Date().toISOString().slice(0,10); }

  // ── Load ──────────────────────────────────────────────────────────────────
  async function load(){
    var r = await Promise.all([
      db.from('prospects').select('*').order('business_name',{ascending:true}),
      db.from('prospect_visits').select('*').order('visited_on',{ascending:false}),
      db.from('city_drive_times').select('city,minutes').order('minutes',{ascending:true})
    ]);
    if(r[0].error){ toast('Couldn\'t load prospects: '+r[0].error.message,'error'); return false; }
    S.rows = r[0].data || [];
    S.drive = r[2].data || [];
    S.visits = {};
    (r[1].data||[]).forEach(function(v){
      if(!S.visits[v.prospect_id]) S.visits[v.prospect_id] = [];
      S.visits[v.prospect_id].push(v);
    });
    S.loaded = true;
    return true;
  }

  function lastVisit(id){
    var v = S.visits[id];
    return (v && v.length) ? v[0] : null;
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  function visible(){
    var q = S.q.trim().toLowerCase();
    return S.rows.filter(function(p){
      if(S.stage && p.stage !== S.stage) return false;
      if(S.type && p.biz_type !== S.type) return false;
      if(S.city && String(p.city||'').trim().toLowerCase() !== S.city.toLowerCase()) return false;
      if(S.band){
        var m = minutesFor(p.city);
        if(m === null || m > Number(S.band)) return false;
      }
      if(q){
        var hay = [p.business_name,p.contact_name,p.phone,p.email,p.city,p.address,p.biz_type,p.notes]
          .join(' ').toLowerCase();
        if(hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function(a,b){
      // Overdue and never-touched first — the list should answer "who now?".
      var an = a.next_action_date || '', bn = b.next_action_date || '';
      if(an && bn && an !== bn) return an < bn ? -1 : 1;
      if(an && !bn) return -1;
      if(!an && bn) return 1;
      var am = minutesFor(a.city), bm = minutesFor(b.city);
      if(am !== null && bm !== null && am !== bm) return am - bm;
      return String(a.business_name||'').localeCompare(String(b.business_name||''));
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function pill(text, color, solid){
    return '<span style="display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.4px;'
      + 'padding:2px 8px;border-radius:99px;'
      + (solid ? 'background:'+color+';color:#fff;' : 'color:'+color+';border:1px solid '+color+';')
      + '">'+esc(text)+'</span>';
  }

  function cardHtml(p){
    var sm = stageMeta(p.stage);
    var mins = minutesFor(p.city);
    var lv = lastVisit(p.id);
    var overdue = p.next_action_date && p.next_action_date <= today();
    var line = function(icon,val){
      return '<div style="display:flex;gap:8px;font-size:12.5px;color:var(--text-secondary);min-width:0">'
        + '<span style="flex:none;width:15px;text-align:center">'+icon+'</span>'
        + '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(val)+'</span></div>';
    };
    return '<div style="background:var(--surface);border:1px solid var(--border-strong);border-radius:14px;'
      + 'box-shadow:var(--shadow-sm);padding:14px'+(overdue?';border-left:4px solid #b45309':'')+'">'
      + '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:9px">'
        + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:15px;font-weight:800;color:var(--text)">'+esc(p.business_name||'(no name)')+'</div>'
          + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px">'
            + pill(sm[1], sm[2], true)
            + (p.biz_type ? pill(p.biz_type, 'var(--muted)') : '')
            + (p.city ? pill(p.city + (mins!==null ? ' · '+mins+' min' : ''), '#0891b2') : '')
            + (p.partner_type==='referral' ? pill('sends referrals', '#8b5cf6') : '')
          + '</div>'
        + '</div>'
      + '</div>'
      + '<div style="display:grid;gap:5px;border-top:1px solid var(--border);padding-top:10px">'
        + (p.contact_name ? line('🗣️','Ask for '+p.contact_name) : '')
        + (p.phone ? line('📞',p.phone) : '')
        + (p.address ? line('📍',p.address) : '')
        + (lv ? line('🕘','Last: '+fdate(lv.visited_on)+' — '+(lv.outcome||lv.kind||'contacted')) : line('🕘','Never contacted'))
        + (p.next_action_date ? line(overdue?'🔴':'📅', (overdue?'Due ':'Next ')+fdate(p.next_action_date)) : '')
      + '</div>'
      + '<div style="display:flex;gap:7px;margin-top:11px">'
        + '<button class="btn btn-primary btn-sm" style="flex:1" onclick="JJProspects.logVisit(\''+p.id+'\')">Log a call / visit</button>'
        + '<button class="btn btn-ghost btn-sm" onclick="JJProspects.edit(\''+p.id+'\')">Edit</button>'
      + '</div>'
      + '</div>';
  }

  function controlsHtml(){
    var towns = S.drive.slice().sort(function(a,b){
      return String(a.city).localeCompare(String(b.city));
    });
    var townOpts = towns.map(function(t){
      return '<option value="'+esc(t.city)+'"'+(S.city===t.city?' selected':'')+'>'+esc(t.city)+' — '+t.minutes+' min</option>';
    }).join('');
    var typeOpts = TYPES.map(function(t){
      return '<option value="'+esc(t)+'"'+(S.type===t?' selected':'')+'>'+esc(t)+'</option>';
    }).join('');
    var stageBtns = [['','All']].concat(STAGES.map(function(s){ return [s[0],s[1]]; }))
      .map(function(s){
        var on = S.stage===s[0];
        return '<button class="btn '+(on?'btn-primary':'btn-ghost')+' btn-sm" '
          + 'onclick="JJProspects.setStage(\''+s[0]+'\')">'+esc(s[1])+'</button>';
      }).join('');

    return '<div class="filters-bar" style="flex-wrap:wrap;gap:8px;row-gap:8px">'
      + '<input class="search-input search-icon" type="text" placeholder="Search name, contact, phone, town..." '
        + 'value="'+esc(S.q)+'" oninput="JJProspects.setQ(this.value)" style="width:100%;max-width:340px">'
      + '<select class="crange-select" style="width:auto" onchange="JJProspects.setBand(this.value)">'
        + '<option value="">Any distance</option>'
        + ['15','25','35','45'].map(function(b){
            return '<option value="'+b+'"'+(S.band===b?' selected':'')+'>Within '+b+' min</option>';
          }).join('')
      + '</select>'
      + '<select class="crange-select" style="width:auto" onchange="JJProspects.setCity(this.value)">'
        + '<option value="">All towns</option>'+townOpts
      + '</select>'
      + '<select class="crange-select" style="width:auto" onchange="JJProspects.setType(this.value)">'
        + '<option value="">All types</option>'+typeOpts
      + '</select>'
      + '<div style="display:flex;gap:5px;flex-wrap:wrap">'+stageBtns+'</div>'
      + '</div>';
  }

  function render(){
    var el = host(); if(!el) return;
    var list = visible();
    var overdue = list.filter(function(p){ return p.next_action_date && p.next_action_date <= today(); }).length;
    var never = list.filter(function(p){ return !lastVisit(p.id); }).length;

    var head = '<div class="page-header" style="flex-wrap:wrap;gap:12px">'
      + '<div><div class="page-title page-title-sm">🎯 Prospects</div>'
      + '<div class="page-sub">'+list.length.toLocaleString()+' shown'
        + (overdue?' · <strong style="color:#b45309">'+overdue+' due now</strong>':'')
        + (never?' · '+never+' never contacted':'')
      + '</div></div>'
      + '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
        + '<button class="btn btn-ghost" onclick="JJProspects.importCsv()">⬆ Import CSV</button>'
        + '<button class="btn btn-primary" onclick="JJProspects.add()">+ Add prospect</button>'
      + '</div></div>';

    var body;
    if(!S.rows.length){
      body = '<div style="padding:48px 24px;text-align:center;color:var(--muted)">'
        + '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px">No prospects yet</div>'
        + '<div style="font-size:13.5px;max-width:460px;margin:0 auto 16px">Add businesses as you come across them, '
        + 'or bring a list in with Import CSV. Then pick a town and work it.</div>'
        + '<button class="btn btn-primary" onclick="JJProspects.add()">+ Add the first one</button></div>';
    } else if(!list.length){
      body = '<div style="padding:40px;text-align:center;color:var(--muted);font-size:13.5px">'
        + 'Nothing matches those filters. <button class="btn btn-ghost btn-sm" onclick="JJProspects.clear()">Clear filters</button></div>';
    } else {
      body = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px">'
        + list.map(cardHtml).join('') + '</div>';
    }
    el.innerHTML = head + controlsHtml() + body;
  }

  // ── Prospect editor ───────────────────────────────────────────────────────
  function field(id,label,val,type,ph){
    return '<div><label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:3px">'+esc(label)+'</label>'
      + '<input id="'+id+'" type="'+(type||'text')+'" value="'+esc(val||'')+'" placeholder="'+esc(ph||'')+'" '
      + 'style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid var(--border);'
      + 'background:var(--surface2);color:var(--text);font-size:13.5px"></div>';
  }

  function editor(p){
    var isNew = !p.id;
    var townOpts = '<option value="">— town —</option>' + S.drive.slice().sort(function(a,b){
      return String(a.city).localeCompare(String(b.city));
    }).map(function(t){
      return '<option value="'+esc(t.city)+'"'+(p.city===t.city?' selected':'')+'>'+esc(t.city)+' — '+t.minutes+' min</option>';
    }).join('');
    var typeOpts = '<option value="">— type —</option>' + TYPES.map(function(t){
      return '<option value="'+esc(t)+'"'+(p.biz_type===t?' selected':'')+'>'+esc(t)+'</option>';
    }).join('');
    var stageOpts = STAGES.map(function(s){
      return '<option value="'+s[0]+'"'+((p.stage||'new')===s[0]?' selected':'')+'>'+esc(s[1])+'</option>';
    }).join('');

    var html = '<div class="modal-overlay open" id="pr-overlay" onclick="if(event.target===this)JJProspects.close()">'
      + '<div style="background:var(--surface);border-radius:14px;padding:22px;max-width:620px;width:94%;'
      + 'max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
      + '<div style="font-size:17px;font-weight:800;margin-bottom:14px">'+(isNew?'Add prospect':'Edit prospect')+'</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'
        + '<div style="grid-column:1/-1">'+field('pr-name','Business name *',p.business_name,'text','Simcoe Ridge Roofing')+'</div>'
        + '<div><label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:3px">Type</label>'
          + '<select id="pr-type" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13.5px">'+typeOpts+'</select></div>'
        + '<div><label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:3px">Town</label>'
          + '<select id="pr-city" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13.5px">'+townOpts+'</select></div>'
        + field('pr-contact','Who to ask for',p.contact_name,'text','Dave, owner')
        + field('pr-phone','Phone',p.phone,'text','')
        + field('pr-email','Email',p.email,'email','')
        + field('pr-website','Website',p.website,'text','')
        + '<div style="grid-column:1/-1">'+field('pr-address','Address',p.address,'text','12 Industrial Rd')+'</div>'
        + '<div><label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:3px">Stage</label>'
          + '<select id="pr-stage" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13.5px">'+stageOpts+'</select></div>'
        + field('pr-next','Next action date',p.next_action_date,'date')
      + '</div>'
      + '<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;margin-bottom:10px">'
        + '<input id="pr-referral" type="checkbox"'+(p.partner_type==='referral'?' checked':'')+'>'
        + '<span>They send us customers rather than booking themselves '
        + '<span style="color:var(--muted)">(realtors, storage, lawyers — judged on work they send)</span></span></label>'
      + '<div style="margin-bottom:12px"><label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:3px">Notes</label>'
        + '<textarea id="pr-notes" rows="3" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid var(--border);'
        + 'background:var(--surface2);color:var(--text);font-size:13.5px;font-family:inherit;resize:vertical">'+esc(p.notes||'')+'</textarea></div>'
      + '<div style="display:flex;justify-content:space-between;gap:8px">'
        + '<div>'+(isNew?'':'<button class="btn btn-ghost btn-sm" style="color:#b3261e" onclick="JJProspects.remove(\''+p.id+'\')">Delete</button>')+'</div>'
        + '<div style="display:flex;gap:8px">'
          + '<button class="btn btn-ghost" onclick="JJProspects.close()">Cancel</button>'
          + '<button class="btn btn-primary" onclick="JJProspects.save(\''+(p.id||'')+'\')">Save</button>'
        + '</div></div>'
      + '</div></div>';
    var old=document.getElementById('pr-overlay'); if(old) old.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    var f=document.getElementById('pr-name'); if(f) f.focus();
  }

  function readEditor(){
    var v = function(id){ var e=document.getElementById(id); return e ? e.value.trim() : ''; };
    var cb = document.getElementById('pr-referral');
    return {
      business_name: v('pr-name'),
      biz_type: v('pr-type'),
      city: v('pr-city'),
      contact_name: v('pr-contact'),
      phone: v('pr-phone'),
      email: v('pr-email'),
      website: v('pr-website'),
      address: v('pr-address'),
      stage: v('pr-stage') || 'new',
      next_action_date: v('pr-next') || null,
      partner_type: (cb && cb.checked) ? 'referral' : 'direct',
      notes: v('pr-notes')
    };
  }

  // ── Visit log ─────────────────────────────────────────────────────────────
  function visitModal(p){
    var past = (S.visits[p.id]||[]).map(function(v){
      return '<div style="border-top:1px solid var(--border);padding:7px 0;font-size:12.5px">'
        + '<strong>'+fdate(v.visited_on)+'</strong> · '+esc(v.kind||'contact')
        + (v.spoke_to?' · spoke to '+esc(v.spoke_to):'')
        + (v.outcome?' — '+esc(v.outcome):'')
        + (v.notes?'<div style="color:var(--muted);margin-top:2px;white-space:pre-wrap">'+esc(v.notes)+'</div>':'')
        + '</div>';
    }).join('') || '<div style="font-size:12.5px;color:var(--muted);padding:7px 0">Nothing logged yet.</div>';

    var html = '<div class="modal-overlay open" id="pv-overlay" onclick="if(event.target===this)JJProspects.close()">'
      + '<div style="background:var(--surface);border-radius:14px;padding:22px;max-width:520px;width:94%;'
      + 'max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
      + '<div style="font-size:17px;font-weight:800">'+esc(p.business_name)+'</div>'
      + '<div style="font-size:12px;color:var(--muted);margin-bottom:14px">Log what happened while it is fresh.</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'
        + '<div><label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:3px">What was it?</label>'
          + '<select id="pv-kind" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13.5px">'
          + '<option value="call">Phone call</option><option value="drop-in">Dropped in</option>'
          + '<option value="email">Email</option><option value="quote">Gave a quote</option></select></div>'
        + field('pv-date','When',today(),'date')
        + field('pv-spoke','Spoke to','','text','Dave')
        + '<div><label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:3px">How did it go?</label>'
          + '<select id="pv-outcome" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13.5px">'
          + '<option value="interested">Interested</option><option value="call back">Call back later</option>'
          + '<option value="not now">Not right now</option><option value="uses a competitor">Uses a competitor</option>'
          + '<option value="no answer">No answer</option><option value="not interested">Not interested</option></select></div>'
      + '</div>'
      + '<div style="margin-bottom:10px"><label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:3px">Notes</label>'
        + '<textarea id="pv-notes" rows="3" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid var(--border);'
        + 'background:var(--surface2);color:var(--text);font-size:13.5px;font-family:inherit;resize:vertical"></textarea></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'
        + field('pv-next','Come back on','','date')
        + '<div><label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:3px">Move to stage</label>'
          + '<select id="pv-stage" style="width:100%;padding:8px 11px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13.5px">'
          + STAGES.map(function(s){ return '<option value="'+s[0]+'"'+((p.stage||'new')===s[0]?' selected':'')+'>'+esc(s[1])+'</option>'; }).join('')
          + '</select></div>'
      + '</div>'
      + '<div style="font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">History</div>'
      + past
      + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">'
        + '<button class="btn btn-ghost" onclick="JJProspects.close()">Cancel</button>'
        + '<button class="btn btn-primary" onclick="JJProspects.saveVisit(\''+p.id+'\')">Save</button>'
      + '</div></div></div>';
    var old=document.getElementById('pv-overlay'); if(old) old.remove();
    document.body.insertAdjacentHTML('beforeend', html);
  }

  // ── CSV import ────────────────────────────────────────────────────────────
  // Handles quoted fields and embedded commas; anything fancier belongs in a
  // spreadsheet before it gets here.
  function parseCsv(text){
    var rows=[], row=[], cur='', q=false, i;
    text = String(text).replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    for(i=0;i<text.length;i++){
      var ch=text[i];
      if(q){
        if(ch==='"' && text[i+1]==='"'){ cur+='"'; i++; }
        else if(ch==='"'){ q=false; }
        else cur+=ch;
      } else {
        if(ch==='"') q=true;
        else if(ch===','){ row.push(cur); cur=''; }
        else if(ch==='\n'){ row.push(cur); rows.push(row); row=[]; cur=''; }
        else cur+=ch;
      }
    }
    if(cur!=='' || row.length){ row.push(cur); rows.push(row); }
    return rows.filter(function(r){ return r.some(function(c){ return String(c).trim()!==''; }); });
  }

  // Forgiving header matching — a list from a directory rarely uses our names.
  var HEADER_MAP = {
    business_name:['business','business name','company','company name','name'],
    contact_name:['contact','contact name','owner','ask for','person'],
    phone:['phone','telephone','tel','phone number','mobile'],
    email:['email','e-mail','email address'],
    address:['address','street','street address'],
    city:['city','town','municipality'],
    website:['website','url','web','site'],
    biz_type:['type','category','industry','trade','business type'],
    notes:['notes','note','comment','comments']
  };

  function mapHeaders(hdr){
    var out = {};
    hdr.forEach(function(h,i){
      var k = String(h).trim().toLowerCase();
      Object.keys(HEADER_MAP).forEach(function(field){
        if(out[field] === undefined && HEADER_MAP[field].indexOf(k) !== -1) out[field] = i;
      });
    });
    return out;
  }

  function importModal(){
    var html = '<div class="modal-overlay open" id="pi-overlay" onclick="if(event.target===this)JJProspects.close()">'
      + '<div style="background:var(--surface);border-radius:14px;padding:22px;max-width:560px;width:94%;'
      + 'max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
      + '<div style="font-size:17px;font-weight:800;margin-bottom:4px">Import prospects from CSV</div>'
      + '<div style="font-size:12.5px;color:var(--muted);margin-bottom:14px">First row should be headers. '
      + 'It looks for business name, contact, phone, email, address, city, website, type and notes — '
      + 'spelled however your list spells them. Anything it can\'t match is left blank.</div>'
      + '<input type="file" id="pi-file" accept=".csv,text/csv" '
      + 'style="width:100%;padding:10px;border:1px dashed var(--border-strong);border-radius:8px;font-size:13px;margin-bottom:12px">'
      + '<div id="pi-preview" style="font-size:12.5px;color:var(--muted);margin-bottom:12px"></div>'
      + '<div style="display:flex;justify-content:flex-end;gap:8px">'
        + '<button class="btn btn-ghost" onclick="JJProspects.close()">Cancel</button>'
        + '<button class="btn btn-primary" id="pi-go" disabled onclick="JJProspects.runImport()">Import</button>'
      + '</div></div></div>';
    var old=document.getElementById('pi-overlay'); if(old) old.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('pi-file').addEventListener('change', previewImport);
  }

  var _pending = [];
  function previewImport(e){
    var f = e.target.files && e.target.files[0];
    var box = document.getElementById('pi-preview');
    var btn = document.getElementById('pi-go');
    _pending = [];
    if(!f){ box.textContent=''; btn.disabled=true; return; }
    var rd = new FileReader();
    rd.onload = function(){
      var rows = parseCsv(rd.result);
      if(rows.length < 2){ box.innerHTML='<span style="color:#b3261e">That file has no data rows.</span>'; btn.disabled=true; return; }
      var map = mapHeaders(rows[0]);
      if(map.business_name === undefined){
        box.innerHTML = '<span style="color:#b3261e">No business-name column found. '
          + 'Rename one of your headers to "Business Name" and try again.</span>';
        btn.disabled = true; return;
      }
      var cell = function(r,k){ return map[k]!==undefined ? String(r[map[k]]||'').trim() : ''; };
      rows.slice(1).forEach(function(r){
        var name = cell(r,'business_name');
        if(!name) return;
        _pending.push({
          business_name:name, contact_name:cell(r,'contact_name'), phone:cell(r,'phone'),
          email:cell(r,'email'), address:cell(r,'address'), city:cell(r,'city'),
          website:cell(r,'website'), biz_type:cell(r,'biz_type'), notes:cell(r,'notes'),
          stage:'new', partner_type:'direct', created_by: me()
        });
      });
      var found = Object.keys(map).length;
      var unknownTowns = _pending.filter(function(p){ return p.city && minutesFor(p.city)===null; }).length;
      box.innerHTML = '<strong>'+_pending.length+'</strong> prospects ready · matched '+found+' columns'
        + (unknownTowns ? '<br><span style="color:#b45309">'+unknownTowns+' have a town not in your service areas — '
            + 'they will import, but won\'t show under a distance filter.</span>' : '');
      btn.disabled = _pending.length === 0;
    };
    rd.readAsText(f);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  var API = {
    async open(){
      var el = host();
      if(el && !S.loaded) el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);font-size:13px">Loading…</div>';
      if(await load()) render();
    },
    setQ(v){ S.q=v; render(); },
    setStage(v){ S.stage=v; render(); },
    setCity(v){ S.city=v; S.band=''; render(); },
    setBand(v){ S.band=v; S.city=''; render(); },
    setType(v){ S.type=v; render(); },
    clear(){ S.q=''; S.stage=''; S.city=''; S.band=''; S.type=''; render(); },

    add(){ editor({stage:'new', partner_type:'direct'}); },
    edit(id){
      var p = S.rows.find(function(x){ return x.id===id; });
      if(p) editor(p);
    },
    logVisit(id){
      var p = S.rows.find(function(x){ return x.id===id; });
      if(p) visitModal(p);
    },
    importCsv(){ importModal(); },

    async save(id){
      var patch = readEditor();
      if(!patch.business_name){ toast('A business name is required.','error'); return; }
      var r;
      if(id){
        r = await db.from('prospects').update(patch).eq('id', id);
      } else {
        patch.created_by = me();
        patch.owner = me();
        r = await db.from('prospects').insert(patch);
      }
      if(r.error){ toast('Save failed: '+r.error.message,'error'); return; }
      toast('✓ Saved');
      API.close();
      await API.open();
    },

    async saveVisit(id){
      var v = function(x){ var e=document.getElementById(x); return e ? e.value.trim() : ''; };
      var visit = {
        prospect_id: id,
        visited_on: v('pv-date') || today(),
        kind: v('pv-kind'),
        spoke_to: v('pv-spoke'),
        outcome: v('pv-outcome'),
        notes: v('pv-notes'),
        created_by: me()
      };
      var r = await db.from('prospect_visits').insert(visit);
      if(r.error){ toast('Couldn\'t log that: '+r.error.message,'error'); return; }
      // The visit is the record; stage and next date live on the prospect so the
      // list can sort by them without reading every visit.
      var patch = { stage: v('pv-stage') || 'new' };
      var next = v('pv-next');
      if(next) patch.next_action_date = next;
      var r2 = await db.from('prospects').update(patch).eq('id', id);
      if(r2.error) toast('Logged, but the stage didn\'t update: '+r2.error.message,'error');
      else toast('✓ Logged');
      API.close();
      await API.open();
    },

    async remove(id){
      if(!confirm('Delete this prospect and everything logged against it? This cannot be undone.')) return;
      var r = await db.from('prospects').delete().eq('id', id);
      if(r.error){ toast('Delete failed: '+r.error.message,'error'); return; }
      toast('✓ Deleted');
      API.close();
      await API.open();
    },

    async runImport(){
      if(!_pending.length) return;
      var btn = document.getElementById('pi-go');
      if(btn){ btn.disabled = true; btn.textContent = 'Importing…'; }
      // Chunked so a long list doesn't ride on one oversized request.
      var done = 0, failed = 0;
      for(var i=0; i<_pending.length; i+=200){
        var slice = _pending.slice(i, i+200);
        var r = await db.from('prospects').insert(slice);
        if(r.error){ failed += slice.length; } else { done += slice.length; }
      }
      _pending = [];
      API.close();
      if(failed) toast('Imported '+done+', but '+failed+' failed. Check the file and try those again.','error');
      else toast('✓ Imported '+done+' prospects');
      await API.open();
    },

    close(){
      ['pr-overlay','pv-overlay','pi-overlay'].forEach(function(id){
        var el=document.getElementById(id); if(el) el.remove();
      });
    }
  };

  window.JJProspects = API;
  // app.js's router calls this by name, same as every other page.
  window.renderProspects = function(){ API.open(); };
})();
