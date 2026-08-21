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
// The eight categories (v598) come from the Aug-2026 segment research: they are
// the types that actually rent roll-off bins in Simcoe. Everything that looked
// like a prospect but can't buy — framers, drywallers, adjusters, site supers —
// was deliberately left out, so the rep can't file one as a target. Each carries
// the line to open with and the job title to ask for, because Josh doesn't need
// to know WHY a roofer converts; he needs to know what to say.
//
// Two gates decide whether a door is worth driving to at all:
//   • self_hauls    — owns a dump trailer. Kills it. They leave the round.
//   • decision_maker — logged per visit. If he's never reaching someone who can
//                      approve a bin, the list is wrong, not the pitch.
//
// Prices come from our_prices by town → zone. The rep may discount the RENTAL
// line down to the zone floor and never the dump fee: $135/tonne is what the
// tip costs us, so every dollar off it is a dollar lost.
//
// Look is the "Midnight" direction Jake picked 2026-08-21: near-black, frosted
// panels, one big green surface carrying the line. Two panes on a tablet or
// desktop, one column with a full-screen door on a phone.
//
// Depends on app.js: db, toast, currentUser, closeM.
(function(){
  'use strict';

  // ── The eight ────────────────────────────────────────────────────────────
  // [key, label, tint, what to say, who to ask for]
  var CATS = [
    ['roofing','Roofing & Exteriors','#22c55e',
      'Who’s your second bin guy when your regular can’t swap you same-day in October?',
      'The owner, or whoever books the tear-off schedule — never the foreman on the roof'],
    ['building','Builders & Renovators','#84cc16',
      'What do you do about demo day on the tight lots downtown? I’ve got a 14 that fits between the house and the fence.',
      'Owner or project manager'],
    ['restoration','Restoration','#a78bfa',
      'I’m not asking to replace anybody. I want to be the number you call when your guy can’t get you a bin next morning on a wet demo.',
      'Project or Mitigation Manager — get the after-hours number'],
    ['property','Property Managers','#2dd4bf',
      'I’m not after your front-load contract. I want the turnovers and the reno pushes — one invoice per property.',
      'Maintenance Manager or Superintendent first; the Property Manager signs'],
    ['shopyard','Shop & Yard','#38bdf8',
      'What’s it costing you to get that pile behind the shop gone — and does your landlord let you keep a bin out back?',
      'Owner or service manager'],
    ['public','Public & Institutional','#fbbf24',
      'We already work for the county. What does it take to get on your list before spring capital starts?',
      'Public Works Superintendent at the yard at 7am, then the purchasing clerk'],
    ['estate','Estate & Downsizing','#f472b6',
      'Who do you call when the house has to be empty by closing?',
      'The owner, or the estates law clerk who actually answers that question'],
    ['landscape','Landscape & Waterfront','#4ade80',
      'How many billable hours did your guys burn on dump runs last week? I’ll leave a 14 on the driveway.',
      'The owner-operator, early, in his own yard'],
    ['other','Other — one-off','#94a3b8','', '']
  ];

  var STAGES = [
    ['new',       'Not been in', '#64748b'],
    ['contacted', 'Been in',     '#38bdf8'],
    ['quoted',    'Wants a price','#fbbf24'],
    ['won',       'Booked us',   '#22c55e'],
    ['lost',      'No thanks',   '#f87171']
  ];

  // What the rep may drop the RENTAL line to, by zone. Zone 3 and beyond is
  // already under target margin at list, so there is nothing to give away.
  var ZONE_FLOOR = { 1: 165, 2: 210 };

  var S = { rows:[], visits:{}, drive:[], prices:[], q:'', cat:'', band:'',
            town:'', sel:null, loaded:false };

  function esc(s){
    return String(s==null?'':s).replace(/[&<>"]/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
    });
  }
  function attr(s){ return esc(s).replace(/'/g,'&#39;'); }
  function host(){ return document.getElementById('prospects-page'); }
  function me(){
    return (typeof currentUser!=='undefined' && currentUser)
      ? (currentUser.displayName || String(currentUser.email||'').split('@')[0]) : 'Unknown';
  }
  function today(){ return new Date().toISOString().slice(0,10); }
  function fdate(d){
    if(!d) return '';
    var p = String(d).split('-');
    if(p.length!==3) return String(d);
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1]-1]+' '+(+p[2]);
  }
  function catOf(v){
    for(var i=0;i<CATS.length;i++){ if(CATS[i][0]===v) return CATS[i]; }
    return CATS[CATS.length-1];
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

  // ── Price, from the live sheet ───────────────────────────────────────────
  // our_prices is per town and carries its own zone string. No town match means
  // no quote — say so rather than guessing a number the rep might repeat aloud.
  function priceFor(city){
    if(!city) return null;
    var c = String(city).trim().toLowerCase(), row = null;
    for(var i=0;i<S.prices.length;i++){
      if(String(S.prices[i].area||'').trim().toLowerCase()===c){ row = S.prices[i]; break; }
    }
    if(!row) return null;
    var m = /zone\s*(\d)/i.exec(row.zone||'');
    var zone = m ? +m[1] : null;
    var bins = row.bins || {};
    var list = parseFloat(bins['14 yard']) || null;
    var tonne = parseFloat(bins._tonne) || null;
    var floor = (zone && ZONE_FLOOR[zone]) ? ZONE_FLOOR[zone] : null;
    // Never advertise a floor at or above list — that would read as a discount
    // when it isn't one.
    if(floor && list && floor >= list) floor = null;
    return { zone: zone, list: list, floor: floor, tonne: tonne };
  }

  function lastVisit(id){
    var v = S.visits[id];
    return (v && v.length) ? v[0] : null;
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  async function load(){
    var r = await Promise.all([
      db.from('prospects').select('*').order('business_name',{ascending:true}),
      db.from('prospect_visits').select('*').order('visited_on',{ascending:false}),
      db.from('city_drive_times').select('city,minutes').order('minutes',{ascending:true}),
      db.from('our_prices').select('area,zone,bins')
    ]);
    for(var i=0;i<r.length;i++){
      if(r[i].error){ toast('Couldn’t load prospects: '+r[i].error.message,'error'); return false; }
    }
    S.rows   = r[0].data || [];
    S.drive  = r[2].data || [];
    S.prices = r[3].data || [];
    S.visits = {};
    (r[1].data||[]).forEach(function(v){
      (S.visits[v.prospect_id] = S.visits[v.prospect_id] || []).push(v);
    });
    S.loaded = true;
    return true;
  }

  // ── Filtering and the round ──────────────────────────────────────────────
  function visible(){
    var q = S.q.trim().toLowerCase();
    return S.rows.filter(function(p){
      // A self-hauler is out of the round for good — that is the whole point of
      // asking. They stay in the database so nobody walks in again by mistake.
      if(p.self_hauls) return false;
      if(S.cat && (p.biz_type||'') !== S.cat) return false;
      if(S.town && p.city !== S.town) return false;
      if(S.band){
        var m = minutesFor(p.city);
        if(m === null || m > +S.band) return false;
      }
      if(q){
        var hay = [p.business_name,p.contact_name,p.phone,p.city,p.address,p.why_them,p.notes]
          .filter(Boolean).join(' ').toLowerCase();
        if(hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  // Grouped by town, nearest town first, so the list reads as a route.
  function round(){
    var list = visible(), byTown = {}, order = [];
    list.forEach(function(p){
      var t = p.city || 'No town yet';
      if(!byTown[t]){ byTown[t] = []; order.push(t); }
      byTown[t].push(p);
    });
    order.sort(function(a,b){
      var am = minutesFor(a), bm = minutesFor(b);
      if(am === null) return 1;
      if(bm === null) return -1;
      return am - bm;
    });
    // Inside a town: overdue first, then never-visited, then the rest.
    order.forEach(function(t){
      byTown[t].sort(function(a,b){
        var ao = (a.next_action_date && a.next_action_date <= today()) ? 0 : 1;
        var bo = (b.next_action_date && b.next_action_date <= today()) ? 0 : 1;
        if(ao !== bo) return ao - bo;
        var av = lastVisit(a.id) ? 1 : 0, bv = lastVisit(b.id) ? 1 : 0;
        if(av !== bv) return av - bv;
        return String(a.business_name||'').localeCompare(String(b.business_name||''));
      });
    });
    return { order: order, byTown: byTown, count: list.length };
  }

  // ── Theme ────────────────────────────────────────────────────────────────
  // Injected once. Everything is scoped to the page or a jjp- class so it can't
  // leak into the rest of the dashboard, which is light.
  function styles(){
    if(document.getElementById('jjp-style')) return;
    var css = ''
    + '.main:has(> #view-prospects.active){padding:0 !important;}'
    + '@media(max-width:1024px){.main:has(> #view-prospects.active){padding:72px 0 0 !important;}'
    +   '#prospects-page{min-height:calc(100vh - 72px);}}'
    + '#prospects-page{--jjp-bg:#080B09;--jjp-ink:#E8EFEA;--jjp-dim:rgba(232,239,234,.55);'
    +   '--jjp-faint:rgba(232,239,234,.4);--jjp-line:rgba(255,255,255,.09);--jjp-green:#22c55e;'
    +   '--jjp-green-lt:#86efac;--jjp-bright:#4ade80;'
    +   'background:var(--jjp-bg);color:var(--jjp-ink);border-radius:0;padding:0;overflow:hidden;'
    +   'min-height:100vh;'
    +   'position:relative;font-family:\'Plus Jakarta Sans\',\'Inter\',system-ui,sans-serif;}'
    + '#prospects-page *{box-sizing:border-box;}'
    + '.jjp-wash{position:absolute;border-radius:999px;pointer-events:none;filter:blur(48px);}'
    + '.jjp-fr{background:rgba(255,255,255,.055);border:1px solid var(--jjp-line);'
    +   'box-shadow:0 1px 0 rgba(255,255,255,.07) inset;}'
    + '.jjp-lab{font-size:11.5px;font-weight:600;letter-spacing:1.3px;text-transform:uppercase;color:var(--jjp-faint);}'
    + '.jjp-chip{display:inline-flex;align-items:center;padding:6px 13px;border-radius:999px;font-size:12.5px;'
    +   'font-weight:500;background:rgba(255,255,255,.07);border:1px solid var(--jjp-line);color:rgba(232,239,234,.8);}'
    + '.jjp-btn{border:none;border-radius:999px;font-family:inherit;font-weight:600;cursor:pointer;'
    +   'display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:filter .15s,transform .15s;}'
    + '.jjp-btn:hover{filter:brightness(1.08);} .jjp-btn:active{transform:scale(.985);}'
    + '.jjp-btn-go{background:var(--jjp-green);color:#062412;min-height:52px;font-size:16.5px;}'
    + '.jjp-btn-q{background:rgba(255,255,255,.07);border:1px solid var(--jjp-line);color:rgba(232,239,234,.88);'
    +   'min-height:52px;font-size:15px;}'
    + '.jjp-sm{min-height:40px;font-size:13.5px;padding:0 16px;}'
    + '.jjp-in{width:100%;padding:11px 14px;border-radius:12px;border:1px solid var(--jjp-line);'
    +   'background:rgba(255,255,255,.05);color:var(--jjp-ink);font-size:14.5px;font-family:inherit;}'
    + '.jjp-in::placeholder{color:rgba(232,239,234,.32);}'
    + '.jjp-in:focus{outline:2px solid rgba(34,197,94,.5);outline-offset:1px;}'
    + 'select.jjp-in option{background:#12171A;color:#E8EFEA;}'
    + '.jjp-opt{min-height:52px;border-radius:999px;display:flex;align-items:center;justify-content:center;'
    +   'padding:0 12px;font-size:14.5px;font-weight:500;text-align:center;cursor:pointer;'
    +   'background:rgba(255,255,255,.055);border:1px solid var(--jjp-line);color:rgba(232,239,234,.72);}'
    + '.jjp-opt.on{background:rgba(34,197,94,.24);border-color:rgba(34,197,94,.44);color:var(--jjp-green-lt);font-weight:700;}'
    + '.jjp-yn{min-width:56px;min-height:44px;border-radius:999px;display:flex;align-items:center;'
    +   'justify-content:center;font-size:14.5px;font-weight:500;cursor:pointer;'
    +   'background:rgba(255,255,255,.07);color:rgba(232,239,234,.5);border:1px solid transparent;}'
    + '.jjp-yn.on{background:rgba(34,197,94,.26);color:var(--jjp-green-lt);font-weight:700;}'
    + '.jjp-row{border-radius:22px;padding:15px 17px;display:flex;gap:12px;align-items:center;'
    +   'min-height:44px;cursor:pointer;transition:background .15s;}'
    + '.jjp-row:hover{background:rgba(255,255,255,.09);}'
    + '.jjp-row.on{background:rgba(34,197,94,.14);border-color:rgba(34,197,94,.34);}'
    + '.jjp-hot{background:linear-gradient(140deg,rgba(34,197,94,.24),rgba(34,197,94,.07));'
    +   'border:1px solid rgba(34,197,94,.3);}'
    // Two panes from tablet up; one column with a full-screen door on a phone.
    + '.jjp-grid{display:grid;grid-template-columns:1fr;gap:0;height:100%;position:relative;}'
    + '.jjp-list{padding:0 0 14px;overflow-y:auto;}'
    + '.jjp-door{display:none;}'
    + '.jjp-door.open{display:flex;flex-direction:column;position:fixed;inset:0;z-index:420;'
    +   'background:var(--jjp-bg);color:var(--jjp-ink);overflow:hidden;'
    +   'font-family:\'Plus Jakarta Sans\',\'Inter\',system-ui,sans-serif;}'
    + '.jjp-dcols{display:flex;flex-direction:column;gap:13px;}'
    + '@media(min-width:900px){'
    +   '#prospects-page{height:100vh;}'
    +   '.jjp-grid{grid-template-columns:minmax(340px,420px) 1fr;}'
    +   '.jjp-list{border-right:1px solid var(--jjp-line);}'
    +   '.jjp-door{display:flex;flex-direction:column;position:relative;inset:auto;z-index:auto;overflow:hidden;}'
    +   '.jjp-door.open{position:relative;inset:auto;z-index:auto;}'
    +   '.jjp-back{display:none;}'
    + '}'
    // Past ~1240px a single column leaves half the pane empty, so the cards
    // that don't need full width pair up.
    + '@media(min-width:1240px){'
    +   '.jjp-dcols{display:grid;grid-template-columns:1fr 1fr;align-items:start;}'
    +   '.jjp-dbody{max-width:1100px;}'
    + '}'
    + '@media(min-width:700px){'
    +   '.jjp-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}'
    +   '.jjp-sheet-wide{max-width:760px;padding:28px;}'
    + '}'
    // Modals sit on body, so they carry their own dark surface.
    + '.jjp-sheet{background:#12171A;color:#E8EFEA;border-radius:22px;padding:22px;width:94%;max-width:560px;'
    +   'max-height:88vh;overflow-y:auto;box-shadow:0 30px 80px rgba(0,0,0,.6);'
    +   'border:1px solid rgba(255,255,255,.1);font-family:\'Plus Jakarta Sans\',\'Inter\',system-ui,sans-serif;}'
    + '.jjp-sheet *{box-sizing:border-box;}'
    + '.jjp-g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}'
    + '@media(prefers-reduced-motion:reduce){.jjp-btn{transition:none;}}';
    var el = document.createElement('style');
    el.id = 'jjp-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  var ICON = {
    phone:'<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5.5 3h3.2l1.7 4.3-2.2 1.4a11.5 11.5 0 0 0 5.1 5.1l1.4-2.2L20 13.3v3.2a1.5 1.5 0 0 1-1.6 1.5A15.9 15.9 0 0 1 4 4.6 1.5 1.5 0 0 1 5.5 3z"/></svg>',
    chev:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    back:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    tick:'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>',
    plus:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
  };

  // ── The round (left pane) ────────────────────────────────────────────────
  function rowHtml(p){
    var cat = catOf(p.biz_type);
    var overdue = p.next_action_date && p.next_action_date <= today();
    var lv = lastVisit(p.id);
    var sm = stageMeta(p.stage);
    var hot = overdue || !lv;
    var sub = overdue ? ('Due ' + fdate(p.next_action_date))
            : lv ? ('Last in ' + fdate(lv.visited_on) + (lv.outcome ? ' — ' + lv.outcome : ''))
            : 'Never been in';
    return '<div class="jjp-row ' + (hot ? 'jjp-hot' : 'jjp-fr') + (S.sel===p.id ? ' on' : '') + '" '
      + 'onclick="JJProspects.select(\'' + p.id + '\')">'
      + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:17px;font-weight:600;letter-spacing:-.4px;color:#F4F8F5;'
          + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(p.business_name||'(no name)') + '</div>'
        + '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'
          + (p.biz_type ? '<span class="jjp-chip" style="padding:3px 9px;font-size:11px;font-weight:700;'
              + 'background:' + cat[2] + '22;border-color:' + cat[2] + '44;color:' + cat[2] + '">' + esc(cat[1]) + '</span>' : '')
          + (p.size_note ? '<span class="jjp-chip" style="padding:3px 9px;font-size:11px">' + esc(p.size_note) + '</span>' : '')
          + (p.partner_type==='referral' ? '<span class="jjp-chip" style="padding:3px 9px;font-size:11px;color:#c4b5fd">sends referrals</span>' : '')
        + '</div>'
        + '<div style="font-size:13px;margin-top:9px;color:' + (overdue ? '#fbbf24' : hot ? 'var(--jjp-green-lt)' : 'var(--jjp-dim)') + '">'
          + esc(p.why_them || sub) + '</div>'
        + (p.why_them ? '<div style="font-size:12px;margin-top:4px;color:var(--jjp-faint)">' + esc(sub) + ' · ' + esc(sm[1]) + '</div>' : '')
      + '</div>'
      + '<span style="color:rgba(232,239,234,.42);flex:none">' + ICON.chev + '</span>'
      + '</div>';
  }

  function listHtml(){
    var r = round();
    var mins = 0;
    r.order.forEach(function(t){ var m = minutesFor(t); if(m) mins += m; });
    var overdue = 0;
    r.order.forEach(function(t){
      r.byTown[t].forEach(function(p){ if(p.next_action_date && p.next_action_date <= today()) overdue++; });
    });

    var head = '<div style="padding:20px 18px 4px">'
      + '<div style="display:flex;align-items:flex-end;gap:16px">'
        + '<div style="font-size:64px;font-weight:300;line-height:.82;letter-spacing:-3.4px;color:#F4F8F5">'
          + r.count + '</div>'
        + '<div style="padding-bottom:7px">'
          + '<div style="font-size:18px;font-weight:500;letter-spacing:-.5px;color:#F4F8F5">'
            + (r.count===1 ? 'door' : 'doors') + ' to work</div>'
          + '<div style="font-size:13.5px;color:var(--jjp-dim);margin-top:3px">'
            + r.order.length + (r.order.length===1?' town':' towns')
            + (overdue ? ' · <span style="color:#fbbf24">' + overdue + ' due now</span>' : '')
          + '</div>'
        + '</div>'
      + '</div></div>';

    var controls = '<div style="padding:16px 18px 10px;display:flex;flex-direction:column;gap:9px">'
      + '<input class="jjp-in" type="text" placeholder="Search a name, town or phone…" value="' + attr(S.q) + '" '
        + 'oninput="JJProspects.setQ(this.value)">'
      + '<div style="display:flex;gap:9px">'
        + '<select class="jjp-in" onchange="JJProspects.setBand(this.value)" style="flex:1">'
          + '<option value="">Any distance</option>'
          + ['15','25','35','45','60'].map(function(b){
              return '<option value="' + b + '"' + (S.band===b?' selected':'') + '>Within ' + b + ' min</option>';
            }).join('')
        + '</select>'
        + '<select class="jjp-in" onchange="JJProspects.setCat(this.value)" style="flex:1">'
          + '<option value="">All types</option>'
          + CATS.map(function(c){
              return '<option value="' + c[0] + '"' + (S.cat===c[0]?' selected':'') + '>' + esc(c[1]) + '</option>';
            }).join('')
        + '</select>'
      + '</div></div>';

    var body;
    if(!S.rows.length){
      body = '<div style="padding:46px 24px;text-align:center">'
        + '<div style="font-size:17px;font-weight:600;color:#F4F8F5;margin-bottom:8px">No prospects yet</div>'
        + '<div style="font-size:14px;color:var(--jjp-dim);max-width:340px;margin:0 auto 18px;line-height:1.5">'
        + 'Bring a list in with Import, or add businesses as you come across them. '
        + 'Then pick a town and work it.</div>'
        + '<button class="jjp-btn jjp-btn-go jjp-sm" onclick="JJProspects.add()">Add the first one</button></div>';
    } else if(!r.count){
      body = '<div style="padding:40px 24px;text-align:center;color:var(--jjp-dim);font-size:14px">'
        + 'Nothing matches those filters.<br><button class="jjp-btn jjp-btn-q jjp-sm" style="margin-top:14px" '
        + 'onclick="JJProspects.clear()">Clear filters</button></div>';
    } else {
      body = r.order.map(function(t){
        var m = minutesFor(t);
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 20px 10px">'
            + '<span class="jjp-lab">' + esc(t) + ' · ' + r.byTown[t].length + '</span>'
            + (m !== null ? '<span class="jjp-lab" style="color:rgba(134,239,172,.62)">' + m + ' min out</span>' : '')
          + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:9px;padding:0 14px">'
          + r.byTown[t].map(rowHtml).join('') + '</div>';
      }).join('');
    }

    var actions = '<div style="padding:0 18px 4px;display:flex;gap:9px">'
      + '<button class="jjp-btn jjp-btn-q jjp-sm" style="flex:1" onclick="JJProspects.importCsv()">Import a list</button>'
      + '<button class="jjp-btn jjp-btn-go jjp-sm" style="flex:1" onclick="JJProspects.add()">'
      + ICON.plus + 'Add one</button></div>';

    return head + controls + actions + body;
  }

  // ── The door (right pane / full screen on a phone) ───────────────────────
  function doorHtml(){
    var p = S.sel ? S.rows.find(function(x){ return x.id===S.sel; }) : null;
    if(!p){
      return '<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:40px;text-align:center">'
        + '<div style="color:var(--jjp-faint);font-size:14.5px;max-width:280px;line-height:1.5">'
        + 'Pick a door on the left to see who to ask for and what to say.</div></div>';
    }
    var cat = catOf(p.biz_type);
    var mins = minutesFor(p.city);
    var pr = priceFor(p.city);
    var lv = lastVisit(p.id);
    var sm = stageMeta(p.stage);
    var line = cat[3];
    var hist = (S.visits[p.id]||[]).slice(0,4).map(function(v){
      return '<div style="display:flex;gap:10px;align-items:baseline;padding:8px 0;border-top:1px solid var(--jjp-line)">'
        + '<span style="font-size:12.5px;color:var(--jjp-faint);min-width:52px">' + fdate(v.visited_on) + '</span>'
        + '<span style="flex:1;font-size:13.5px;color:rgba(232,239,234,.8)">' + esc(v.kind||'contact')
        + (v.spoke_to ? ' · ' + esc(v.spoke_to) : '')
        + (v.outcome ? ' — ' + esc(v.outcome) : '') + '</span></div>';
    }).join('');

    var head = '<div style="padding:16px 16px 0;display:flex;align-items:center;gap:9px;flex:none">'
      + '<div class="jjp-back jjp-fr" style="width:44px;height:44px;border-radius:999px;display:flex;'
        + 'align-items:center;justify-content:center;flex:none;cursor:pointer;color:var(--jjp-ink)" '
        + 'onclick="JJProspects.select(null)">' + ICON.back + '</div>'
      + '<div class="jjp-fr" style="flex:1;height:44px;border-radius:999px;display:flex;align-items:center;'
        + 'justify-content:center;gap:8px;font-size:14px">'
        + '<span style="color:rgba(232,239,234,.9);font-weight:500">' + esc(p.city||'No town') + '</span>'
        + (mins !== null ? '<span style="width:3px;height:3px;border-radius:99px;background:rgba(232,239,234,.35)"></span>'
            + '<span style="color:var(--jjp-dim)">' + mins + ' min out</span>' : '')
      + '</div>'
      + '<div class="jjp-fr" style="width:44px;height:44px;border-radius:999px;display:flex;align-items:center;'
        + 'justify-content:center;flex:none;cursor:pointer;color:var(--jjp-ink);font-size:15px" '
        + 'title="Edit" onclick="JJProspects.edit(\'' + p.id + '\')">✎</div>'
      + '</div>';

    var nameBlock = '<div><div style="font-size:36px;font-weight:600;line-height:1.04;letter-spacing:-1.3px;'
      + 'color:#F4F8F5">' + esc(p.business_name||'(no name)') + '</div>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:14px">'
        + (p.biz_type ? '<span class="jjp-chip" style="background:' + cat[2] + '24;border-color:' + cat[2]
            + '4d;color:' + cat[2] + ';font-weight:700">' + esc(cat[1]) + '</span>' : '')
        + (p.size_note ? '<span class="jjp-chip">' + esc(p.size_note) + '</span>' : '')
        + (pr && pr.zone ? '<span class="jjp-chip">Zone ' + pr.zone + '</span>' : '')
        + '<span class="jjp-chip" style="color:' + sm[2] + '">' + esc(sm[1]) + '</span>'
      + '</div></div>';

    var sayBlock = line
      ? '<div style="border-radius:26px;padding:21px 20px 23px;position:relative;overflow:hidden;'
        + 'background:linear-gradient(152deg,#22c55e 0%,#16a34a 55%,#14804a 100%);'
        + 'box-shadow:0 22px 54px -26px rgba(34,197,94,.55)">'
        + '<div style="position:absolute;top:-70px;right:-50px;width:200px;height:200px;border-radius:999px;'
        + 'background:rgba(255,255,255,.2);filter:blur(34px)"></div>'
        + '<div style="position:relative">'
        + '<div style="font-size:11.5px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;'
        + 'color:rgba(6,26,15,.6);margin-bottom:10px">Say this</div>'
        + '<div style="font-size:21px;font-weight:500;line-height:1.34;letter-spacing:-.4px;color:#062412">'
        + '\u201c' + esc(line) + '\u201d</div></div></div>'
      : '';

    var whyBlock = p.why_them
      ? '<div class="jjp-fr" style="border-radius:24px;padding:16px 18px">'
        + '<div class="jjp-lab" style="margin-bottom:8px">Why them</div>'
        + '<div style="font-size:15px;line-height:1.5;color:rgba(232,239,234,.8)">' + esc(p.why_them) + '</div></div>'
      : '';

    var askBlock = '<div class="jjp-fr" style="border-radius:24px;padding:16px 18px">'
      + '<div class="jjp-lab" style="margin-bottom:8px">Ask for</div>'
      + '<div style="font-size:20px;font-weight:600;letter-spacing:-.5px;line-height:1.2;color:#F4F8F5">'
        + esc(p.contact_name || 'Whoever is in the office') + '</div>'
      + (cat[4] ? '<div style="font-size:12.5px;color:var(--jjp-faint);margin-top:7px;line-height:1.4">'
          + esc(cat[4]) + '</div>' : '')
      + (p.address ? '<div style="font-size:13.5px;color:var(--jjp-dim);margin-top:9px">' + esc(p.address) + '</div>' : '')
      + '</div>';

    var priceBlock = (pr && pr.list)
      ? '<div>'
        + '<div style="display:flex;gap:11px">'
          + '<div class="jjp-fr" style="flex:1;border-radius:22px;padding:15px 17px">'
            + '<div class="jjp-lab" style="font-size:10.5px;margin-bottom:7px">List 14 yd</div>'
            + '<div style="font-size:30px;font-weight:600;letter-spacing:-1.3px;line-height:1;color:#F4F8F5">$'
            + pr.list + '</div></div>'
          + (pr.floor
              ? '<div class="jjp-fr" style="flex:1;border-radius:22px;padding:15px 17px;'
                + 'border-color:rgba(34,197,94,.28);background:rgba(34,197,94,.1)">'
                + '<div class="jjp-lab" style="font-size:10.5px;margin-bottom:7px;color:rgba(134,239,172,.75)">You can go to</div>'
                + '<div style="font-size:30px;font-weight:600;letter-spacing:-1.3px;line-height:1;color:var(--jjp-bright)">$'
                + pr.floor + '</div></div>'
              : '<div class="jjp-fr" style="flex:1;border-radius:22px;padding:15px 17px">'
                + '<div class="jjp-lab" style="font-size:10.5px;margin-bottom:7px;color:#fbbf24">Discount</div>'
                + '<div style="font-size:16px;font-weight:600;line-height:1.25;color:#fbbf24;padding-top:4px">'
                + 'Hold at list</div></div>')
        + '</div>'
        + '<div style="font-size:12.5px;color:var(--jjp-faint);line-height:1.45;margin-top:9px;padding:0 4px">'
        + (pr.tonne ? 'Dump is $' + pr.tonne + ' a tonne on top \u2014 that is our cost, it never moves.'
                    : 'The dump fee is our cost. It never moves.') + '</div></div>'
      : '<div class="jjp-fr" style="border-radius:22px;padding:15px 17px">'
        + '<div class="jjp-lab" style="margin-bottom:6px;color:#fbbf24">No price for this town</div>'
        + '<div style="font-size:13.5px;color:var(--jjp-dim);line-height:1.45">'
        + 'Set a town that is on the pricing sheet, or call the office before quoting.</div></div>';

    var histBlock = '<div class="jjp-fr" style="border-radius:24px;padding:16px 18px">'
      + '<div class="jjp-lab" style="margin-bottom:' + (hist?'4px':'8px') + '">What\u2019s happened so far</div>'
      + (hist || '<div style="font-size:14px;color:var(--jjp-faint)">Nothing yet \u2014 first time in</div>')
      + '</div>';

    var body = '<div style="flex:1;overflow-y:auto;padding:22px 16px 12px">'
      + '<div class="jjp-dbody" style="display:flex;flex-direction:column;gap:13px">'
      + nameBlock + sayBlock
      + '<div class="jjp-dcols">' + whyBlock + askBlock + priceBlock + histBlock + '</div>'
      + '</div></div>';

    var tel = String(p.phone||'').replace(/[^0-9+]/g,'');
    var foot = '<div style="padding:10px 16px 18px;display:flex;gap:10px;flex:none">'
      + (tel
          ? '<a class="jjp-btn jjp-btn-go" style="flex:2;text-decoration:none" href="tel:' + attr(tel) + '">'
            + ICON.phone + esc(p.phone) + '</a>'
          : '<button class="jjp-btn jjp-btn-q" style="flex:2" onclick="JJProspects.edit(\'' + p.id + '\')">Add a phone number</button>')
      + '<button class="jjp-btn jjp-btn-q" style="flex:1.15" onclick="JJProspects.logVisit(\'' + p.id + '\')">Log it</button>'
      + '</div>';

    return head + body + foot;
  }

  function wash(){
    return '<div class="jjp-wash" style="top:-150px;left:-110px;width:420px;height:420px;'
      + 'background:radial-gradient(circle,rgba(34,197,94,.26),transparent 66%)"></div>'
      + '<div class="jjp-wash" style="bottom:-170px;right:-130px;width:390px;height:390px;'
      + 'background:radial-gradient(circle,rgba(20,184,166,.17),transparent 68%)"></div>';
  }

  function render(){
    var el = host(); if(!el) return;
    styles();
    // A wide screen showing an empty right pane is half the window doing nothing,
    // so the first door on the round is always open. Narrow screens keep the list
    // to themselves until the rep taps something.
    var wide = (typeof window !== 'undefined' && window.innerWidth >= 900);
    var r = round();
    var onRound = false;
    r.order.forEach(function(t){
      r.byTown[t].forEach(function(x){ if(x.id === S.sel) onRound = true; });
    });
    if(!onRound) S.sel = (wide && r.count) ? r.byTown[r.order[0]][0].id : null;

    el.innerHTML = wash()
    + '<div class="jjp-grid">'
      + '<div class="jjp-list" style="position:relative">' + listHtml() + '</div>'
      + '<div class="jjp-door' + (S.sel ? ' open' : '') + '">' + doorHtml() + '</div>'
    + '</div>';
  }

  // ── Editor ───────────────────────────────────────────────────────────────
  function field(id,label,val,type,ph){
    return '<div><label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:5px;'
      + 'color:rgba(232,239,234,.6)">' + esc(label) + '</label>'
      + '<input id="' + id + '" class="jjp-in" type="' + (type||'text') + '" value="' + attr(val||'')
      + '" placeholder="' + attr(ph||'') + '"></div>';
  }

  function editor(p){
    var isNew = !p.id;
    var townOpts = '<option value="">— town —</option>' + S.drive.slice().sort(function(a,b){
      return String(a.city).localeCompare(String(b.city));
    }).map(function(t){
      return '<option value="' + attr(t.city) + '"' + (p.city===t.city?' selected':'') + '>'
        + esc(t.city) + ' — ' + t.minutes + ' min</option>';
    }).join('');
    var catOpts = '<option value="">— what kind of outfit —</option>' + CATS.map(function(c){
      return '<option value="' + c[0] + '"' + (p.biz_type===c[0]?' selected':'') + '>' + esc(c[1]) + '</option>';
    }).join('');
    var stageOpts = STAGES.map(function(s){
      return '<option value="' + s[0] + '"' + ((p.stage||'new')===s[0]?' selected':'') + '>' + esc(s[1]) + '</option>';
    }).join('');
    var lbl = function(t){ return '<label style="display:block;font-size:11.5px;font-weight:700;margin-bottom:5px;'
      + 'color:rgba(232,239,234,.6)">' + t + '</label>'; };

    var html = '<div class="modal-overlay open" id="pr-overlay" onclick="if(event.target===this)JJProspects.close()">'
      + '<div class="jjp-sheet jjp-sheet-wide">'
      + '<div style="font-size:22px;font-weight:700;letter-spacing:-.6px;margin-bottom:4px">'
        + (isNew?'Add a prospect':'Edit prospect') + '</div>'
      + '<div style="font-size:13.5px;color:rgba(232,239,234,.5);margin-bottom:20px">'
        + 'Only the name is required. Everything else can wait until you\u2019ve been in.</div>'
      + '<div class="jjp-g2 jjp-g3" style="margin-bottom:12px">'
        + '<div style="grid-column:1/-1">' + field('pr-name','Business name *',p.business_name,'text','Simcoe Ridge Roofing') + '</div>'
        + '<div>' + lbl('What kind of outfit') + '<select id="pr-type" class="jjp-in">' + catOpts + '</select></div>'
        + '<div>' + lbl('Town') + '<select id="pr-city" class="jjp-in">' + townOpts + '</select></div>'
        + field('pr-contact','Who to ask for',p.contact_name,'text','Dave, the owner')
        + field('pr-size','How big are they',p.size_note,'text','3 crews')
        + field('pr-phone','Phone',p.phone,'text','')
        + field('pr-email','Email',p.email,'email','')
        + '<div style="grid-column:1/-1">' + field('pr-address','Address',p.address,'text','12 Industrial Rd') + '</div>'
        + '<div>' + lbl('Where we’re at') + '<select id="pr-stage" class="jjp-in">' + stageOpts + '</select></div>'
        + field('pr-next','Come back on',p.next_action_date,'date')
      + '</div>'
      + '<div style="margin-bottom:12px">' + lbl('Why them — one line Josh reads at the door')
        + '<input id="pr-why" class="jjp-in" type="text" value="' + attr(p.why_them||'')
        + '" placeholder="Three crews, two roofs going up on Ferndale"></div>'
      + '<label style="display:flex;align-items:flex-start;gap:9px;font-size:13px;margin-bottom:10px;'
        + 'color:rgba(232,239,234,.8);cursor:pointer">'
        + '<input id="pr-referral" type="checkbox"' + (p.partner_type==='referral'?' checked':'') + ' style="margin-top:2px">'
        + '<span>They send us customers rather than booking themselves '
        + '<span style="color:var(--jjp-faint)">(realtors, storage, estate lawyers — judged on work they send)</span></span></label>'
      + '<label style="display:flex;align-items:flex-start;gap:9px;font-size:13px;margin-bottom:14px;'
        + 'color:rgba(232,239,234,.8);cursor:pointer">'
        + '<input id="pr-selfhaul" type="checkbox"' + (p.self_hauls?' checked':'') + ' style="margin-top:2px">'
        + '<span>They haul their own '
        + '<span style="color:#fbbf24">(dump trailer or roll-off truck — ticking this takes them out of the round)</span></span></label>'
      + '<div style="margin-bottom:16px">' + lbl('Notes')
        + '<textarea id="pr-notes" rows="3" class="jjp-in" style="resize:vertical">' + esc(p.notes||'') + '</textarea></div>'
      + '<div style="display:flex;justify-content:space-between;gap:8px">'
        + '<div>' + (isNew?'':'<button class="jjp-btn jjp-btn-q jjp-sm" style="color:#f87171" '
            + 'onclick="JJProspects.remove(\'' + p.id + '\')">Delete</button>') + '</div>'
        + '<div style="display:flex;gap:8px">'
          + '<button class="jjp-btn jjp-btn-q jjp-sm" onclick="JJProspects.close()">Cancel</button>'
          + '<button class="jjp-btn jjp-btn-go jjp-sm" onclick="JJProspects.save(\'' + (p.id||'') + '\')">Save</button>'
        + '</div></div>'
      + '</div></div>';
    var old = document.getElementById('pr-overlay'); if(old) old.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    var f = document.getElementById('pr-name'); if(f) f.focus();
  }

  function readEditor(){
    var v = function(id){ var e=document.getElementById(id); return e ? e.value.trim() : ''; };
    var ck = function(id){ var e=document.getElementById(id); return !!(e && e.checked); };
    return {
      business_name: v('pr-name'),
      biz_type: v('pr-type'),
      city: v('pr-city'),
      contact_name: v('pr-contact'),
      size_note: v('pr-size'),
      phone: v('pr-phone'),
      email: v('pr-email'),
      address: v('pr-address'),
      stage: v('pr-stage') || 'new',
      next_action_date: v('pr-next') || null,
      why_them: v('pr-why'),
      partner_type: ck('pr-referral') ? 'referral' : 'direct',
      self_hauls: ck('pr-selfhaul'),
      notes: v('pr-notes')
    };
  }

  // ── Log a visit ──────────────────────────────────────────────────────────
  // Four taps and a button. The two gates are the only new thing we ask for,
  // and "do they haul their own" is the one that ends the conversation.
  var _v = {};
  function visitModal(p){
    _v = { kind:'drop-in', outcome:'', dm:null, haul:null, back:'' };
    var opt = function(group,val,label,wide){
      return '<div class="jjp-opt" data-g="' + group + '" data-v="' + attr(val) + '"'
        + (wide?' style="grid-column:1/-1"':'')
        + ' onclick="JJProspects.pick(\'' + group + '\',\'' + attr(val) + '\',this)">' + esc(label) + '</div>';
    };
    var yn = function(group,val,label){
      return '<div class="jjp-yn" data-g="' + group + '" data-v="' + val + '" '
        + 'onclick="JJProspects.pick(\'' + group + '\',\'' + val + '\',this)">' + label + '</div>';
    };
    var q = function(t){ return '<div style="font-size:18px;font-weight:600;letter-spacing:-.5px;'
      + 'color:#F4F8F5;margin-bottom:11px">' + t + '</div>'; };

    var html = '<div class="modal-overlay open" id="pv-overlay" onclick="if(event.target===this)JJProspects.close()">'
      + '<div class="jjp-sheet">'
      + '<div style="font-size:11.5px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;'
        + 'color:var(--jjp-faint,rgba(232,239,234,.4))">Logging a visit</div>'
      + '<div style="font-size:20px;font-weight:700;letter-spacing:-.5px;margin:3px 0 20px">'
        + esc(p.business_name) + '</div>'

      + q('Who did you talk to?')
      + '<div class="jjp-g2" style="margin-bottom:22px">'
        + opt('dm','1','The owner') + opt('dm','1b','A manager')
        + opt('dm','0','Front desk') + opt('dm','none','Nobody in')
      + '</div>'

      + q('How’d it go?')
      + '<div class="jjp-g2" style="margin-bottom:22px">'
        + opt('outcome','wants a price','Wants a price') + opt('outcome','come back','Come back later')
        + opt('outcome','happy with theirs','Happy with theirs') + opt('outcome','not interested','Not interested')
      + '</div>'

      + q('Do they haul their own?')
      + '<div style="display:flex;align-items:center;gap:13px;margin-bottom:22px;padding:14px 16px;'
        + 'border-radius:20px;background:rgba(250,204,21,.09);border:1px solid rgba(250,204,21,.24)">'
        + '<div style="flex:1;font-size:13.5px;color:#fde68a;line-height:1.4">'
        + 'Dump trailer or roll-off truck. Yes takes them out of the round.</div>'
        + '<div style="display:flex;gap:6px;flex:none">' + yn('haul','1','Yes') + yn('haul','0','No') + '</div>'
      + '</div>'

      + q('Come back when?')
      + '<div style="display:flex;gap:9px;margin-bottom:12px">'
        + '<div class="jjp-opt" style="flex:1" data-g="back" data-v="7" onclick="JJProspects.pick(\'back\',\'7\',this)">Next week</div>'
        + '<div class="jjp-opt" style="flex:1" data-g="back" data-v="14" onclick="JJProspects.pick(\'back\',\'14\',this)">2 weeks</div>'
        + '<div class="jjp-opt" style="flex:1" data-g="back" data-v="30" onclick="JJProspects.pick(\'back\',\'30\',this)">A month</div>'
      + '</div>'
      + '<input id="pv-next" class="jjp-in" type="date" style="margin-bottom:22px">'

      + q('Anything worth remembering?')
      + '<textarea id="pv-notes" rows="3" class="jjp-in" style="resize:vertical;margin-bottom:18px" '
        + 'placeholder="Ryan’s in most mornings before 8…"></textarea>'

      + '<div style="display:flex;justify-content:flex-end;gap:8px">'
        + '<button class="jjp-btn jjp-btn-q jjp-sm" onclick="JJProspects.close()">Cancel</button>'
        + '<button class="jjp-btn jjp-btn-go jjp-sm" onclick="JJProspects.saveVisit(\'' + p.id + '\')">'
        + ICON.tick + 'Done</button>'
      + '</div></div></div>';
    var old = document.getElementById('pv-overlay'); if(old) old.remove();
    document.body.insertAdjacentHTML('beforeend', html);
  }

  // ── CSV import ───────────────────────────────────────────────────────────
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
    why_them:['why','why them','reason','note','notes','comment','comments']
  };

  function mapHeaders(hdr){
    var out = {};
    hdr.forEach(function(h,i){
      var k = String(h).trim().toLowerCase();
      Object.keys(HEADER_MAP).forEach(function(f){
        if(out[f] === undefined && HEADER_MAP[f].indexOf(k) !== -1) out[f] = i;
      });
    });
    return out;
  }

  // A directory says "Roofing Contractor"; we store a category key. Match on
  // the words we know, and leave anything else for a human to set.
  function catKeyFor(text){
    var t = String(text||'').toLowerCase();
    if(!t) return '';
    if(/roof|siding|eaves/.test(t)) return 'roofing';
    if(/build|contract|reno|renovat|demo|construct|carpent/.test(t)) return 'building';
    if(/restor|flood|fire|mould|mold|disaster/.test(t)) return 'restoration';
    if(/property|condo|apartment|rental|landlord|manage/.test(t)) return 'property';
    if(/glass|door|window|floor|shop|yard|install/.test(t)) return 'shopyard';
    if(/town|city|county|municipal|school|college|church|hospital/.test(t)) return 'public';
    if(/estate|downsiz|clean ?out|auction|mov/.test(t)) return 'estate';
    if(/landscap|lawn|hardscape|fenc|marina|tree|paving/.test(t)) return 'landscape';
    return '';
  }

  function importModal(){
    var html = '<div class="modal-overlay open" id="pi-overlay" onclick="if(event.target===this)JJProspects.close()">'
      + '<div class="jjp-sheet">'
      + '<div style="font-size:20px;font-weight:700;letter-spacing:-.5px;margin-bottom:6px">Import a list</div>'
      + '<div style="font-size:13.5px;color:rgba(232,239,234,.55);margin-bottom:16px;line-height:1.5">'
      + 'A CSV with headers in the first row. It looks for business name, contact, phone, email, address, '
      + 'town, website and type — spelled however your list spells them. Types get matched to our eight '
      + 'where it can tell; anything else comes in blank for you to set.</div>'
      + '<input type="file" id="pi-file" accept=".csv,text/csv" class="jjp-in" '
      + 'style="border-style:dashed;padding:14px;margin-bottom:14px">'
      + '<div id="pi-preview" style="font-size:13.5px;color:rgba(232,239,234,.55);margin-bottom:16px;line-height:1.5"></div>'
      + '<div style="display:flex;justify-content:flex-end;gap:8px">'
        + '<button class="jjp-btn jjp-btn-q jjp-sm" onclick="JJProspects.close()">Cancel</button>'
        + '<button class="jjp-btn jjp-btn-go jjp-sm" id="pi-go" disabled style="opacity:.5" '
        + 'onclick="JJProspects.runImport()">Import</button>'
      + '</div></div></div>';
    var old = document.getElementById('pi-overlay'); if(old) old.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('pi-file').addEventListener('change', previewImport);
  }

  var _pending = [];
  function previewImport(e){
    var f = e.target.files && e.target.files[0];
    var box = document.getElementById('pi-preview');
    var btn = document.getElementById('pi-go');
    _pending = [];
    if(!f){ box.textContent=''; btn.disabled=true; btn.style.opacity='.5'; return; }
    var rd = new FileReader();
    rd.onload = function(){
      var rows = parseCsv(rd.result);
      if(rows.length < 2){
        box.innerHTML = '<span style="color:#f87171">That file has no data rows.</span>';
        btn.disabled = true; btn.style.opacity = '.5'; return;
      }
      var map = mapHeaders(rows[0]);
      if(map.business_name === undefined){
        box.innerHTML = '<span style="color:#f87171">No business-name column found. '
          + 'Rename one of your headers to "Business Name" and try again.</span>';
        btn.disabled = true; btn.style.opacity = '.5'; return;
      }
      var cell = function(r,k){ return map[k]!==undefined ? String(r[map[k]]||'').trim() : ''; };
      rows.slice(1).forEach(function(r){
        var name = cell(r,'business_name');
        if(!name) return;
        _pending.push({
          business_name:name, contact_name:cell(r,'contact_name'), phone:cell(r,'phone'),
          email:cell(r,'email'), address:cell(r,'address'), city:cell(r,'city'),
          website:cell(r,'website'), biz_type:catKeyFor(cell(r,'biz_type')),
          why_them:cell(r,'why_them'), stage:'new', partner_type:'direct', created_by: me()
        });
      });
      var typed = _pending.filter(function(p){ return p.biz_type; }).length;
      var unknownTowns = _pending.filter(function(p){ return p.city && minutesFor(p.city)===null; }).length;
      box.innerHTML = '<strong style="color:#F4F8F5">' + _pending.length + '</strong> prospects ready · '
        + typed + ' matched to a type'
        + (unknownTowns ? '<br><span style="color:#fbbf24">' + unknownTowns + ' have a town that is not in your '
            + 'service areas — they will import, but won’t show under a distance filter.</span>' : '');
      btn.disabled = _pending.length === 0;
      btn.style.opacity = btn.disabled ? '.5' : '1';
    };
    rd.readAsText(f);
  }

  // ── Public API ───────────────────────────────────────────────────────────
  var API = {
    async open(){
      var el = host();
      styles();
      if(el && !S.loaded){
        el.innerHTML = '<div style="padding:60px;text-align:center;color:rgba(232,239,234,.45);font-size:14px">Loading…</div>';
      }
      if(await load()) render();
    },
    setQ(v){ S.q=v; render(); },
    setCat(v){ S.cat=v; render(); },
    setBand(v){ S.band=v; render(); },
    setTown(v){ S.town=v; render(); },
    clear(){ S.q=''; S.cat=''; S.band=''; S.town=''; render(); },
    select(id){ S.sel = id || null; render(); },

    // One handler for every tap-to-choose control in the visit sheet.
    pick(group,val,el){
      _v[group] = val;
      var sibs = document.querySelectorAll('[data-g="' + group + '"]');
      for(var i=0;i<sibs.length;i++) sibs[i].classList.remove('on');
      el.classList.add('on');
      if(group==='back'){
        var d = new Date();
        d.setDate(d.getDate() + (+val||0));
        var f = document.getElementById('pv-next');
        if(f) f.value = d.toISOString().slice(0,10);
      }
    },

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
      // dm carries both who they were and whether that person can approve a bin:
      // '1' owner, '1b' manager, '0' front desk, 'none' nobody in.
      var who = { '1':'the owner', '1b':'a manager', '0':'front desk', 'none':'nobody in' }[_v.dm] || '';
      var visit = {
        prospect_id: id,
        visited_on: today(),
        kind: 'drop-in',
        spoke_to: who,
        outcome: _v.outcome || '',
        decision_maker: _v.dm ? (_v.dm==='1' || _v.dm==='1b') : null,
        notes: v('pv-notes'),
        created_by: me()
      };
      var r = await db.from('prospect_visits').insert(visit);
      if(r.error){ toast('Couldn’t log that: '+r.error.message,'error'); return; }

      // Stage and next date live on the prospect so the round can sort by them
      // without reading every visit.
      var patch = {};
      if(_v.outcome === 'wants a price')        patch.stage = 'quoted';
      else if(_v.outcome === 'not interested')  patch.stage = 'lost';
      else if(_v.outcome === 'happy with theirs') patch.stage = 'lost';
      else if(_v.dm !== 'none')                 patch.stage = 'contacted';
      if(_v.haul === '1') patch.self_hauls = true;
      var next = v('pv-next');
      if(next) patch.next_action_date = next;

      if(Object.keys(patch).length){
        var r2 = await db.from('prospects').update(patch).eq('id', id);
        if(r2.error){ toast('Logged, but the record didn’t update: '+r2.error.message,'error'); }
        else toast(_v.haul === '1' ? '✓ Logged — they haul their own, so they’re out of the round' : '✓ Logged');
      } else {
        toast('✓ Logged');
      }
      if(_v.haul === '1') S.sel = null;
      API.close();
      await API.open();
    },

    async remove(id){
      if(!confirm('Delete this prospect and everything logged against it? This cannot be undone.')) return;
      var r = await db.from('prospects').delete().eq('id', id);
      if(r.error){ toast('Delete failed: '+r.error.message,'error'); return; }
      toast('✓ Deleted');
      if(S.sel === id) S.sel = null;
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
