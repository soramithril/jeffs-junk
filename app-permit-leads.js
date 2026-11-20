// ══════════════════════════════════════════════════════════════════════════
//  PERMIT LEADS — building permits the towns publish, as a call list
// ══════════════════════════════════════════════════════════════════════════
// A screen inside Prospects (v757). The permit-leads-sync edge function fills
// public.permit_leads every morning from Barrie's permit map (about a week
// behind) and Innisfil's monthly list (posted around the 12th).
//
// The public lists carry an address, the work and a date. No name, no phone.
// So the screen is two piles:
//   • Past customers — a permit at an address we have done a job at. The only
//     pile that can be phoned straight away; permit_leads_list() finds them.
//   • Everyone else  — an address. A door hanger, or (for a business) add it to
//     Prospects and look the company up.
//
// Marking a lead (called / hanger / prospect / skip) only moves it out of the
// way; the row is never deleted, and the fetcher never overwrites a mark.
//
// Depends on app.js: db, toast, currentUser. Borrows the jjp-* look from
// app-prospects.js, which must have rendered once (it owns #prospects-page).
(function(){
  'use strict';

  // Work that fills a wheelbarrow, not a bin. Hidden by "Bin-sized jobs only".
  var SMALL = /deck|porch|accessory|shed|pool|fence|septic|sign|tent|plumbing|solar/i;

  var S = { rows:[], town:'', big:true, done:false, loaded:false, newCount:null };

  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function host(){ return document.getElementById('prospects-page'); }
  function me(){
    return (typeof currentUser!=='undefined' && currentUser)
      ? (currentUser.displayName || String(currentUser.email||'').split('@')[0]) : 'Unknown';
  }
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fdate(d){
    var p = String(d||'').slice(0,10).split('-');
    return p.length === 3 ? MONTHS[+p[1]-1] + ' ' + (+p[2]) : '';
  }
  function money(v){
    return (v === null || v === undefined) ? '' : '$' + Math.round(+v).toLocaleString('en-CA');
  }
  // "20 PRINCE OF WALES DR" → "20 Prince Of Wales Dr"
  function nice(a){
    return String(a||'').toLowerCase().replace(/\b[a-z]/g, function(c){ return c.toUpperCase(); });
  }

  async function load(){
    var r = await db.rpc('permit_leads_list');
    if(r.error){ toast('Couldn’t load permit leads: ' + r.error.message, 'error'); return false; }
    S.rows = r.data || [];
    S.loaded = true;
    S.newCount = S.rows.filter(function(x){ return x.state === 'new'; }).length;
    return true;
  }

  function visible(){
    return S.rows.filter(function(x){
      if(S.town && x.town !== S.town) return false;
      if(!S.done && x.state !== 'new') return false;
      // A past customer is worth a call even for a deck, so "bin-sized" only
      // thins out the strangers.
      if(S.big && !x.client_name && SMALL.test(x.work)) return false;
      return true;
    });
  }

  function styles(){
    if(document.getElementById('jpl-style')) return;
    var css = ''
    + '.jpl-wrap{position:relative;height:100vh;overflow-y:auto;}'
    + '@media(max-width:1024px){.jpl-wrap{height:calc(100vh - 72px);}}'
    + '.jpl-col{max-width:880px;margin:0 auto;padding:6px 14px 80px;}'
    + '.jpl-lead{display:flex;gap:12px;align-items:center;padding:13px 15px;border-radius:16px;margin-bottom:8px;}'
    + '.jpl-lead .jpl-main{flex:1;min-width:0;}'
    + '.jpl-t{font-size:15.5px;font-weight:600;letter-spacing:-.3px;color:#F4F8F5;}'
    + '.jpl-s{font-size:12.5px;color:var(--jjp-dim);margin-top:3px;line-height:1.45;}'
    + '.jpl-acts{display:flex;gap:7px;flex:none;flex-wrap:wrap;justify-content:flex-end;}'
    + '.jpl-b{font:inherit;font-size:12.5px;font-weight:600;padding:8px 12px;border-radius:999px;cursor:pointer;'
    +   'background:rgba(255,255,255,.07);border:1px solid var(--jjp-line);color:var(--jjp-ink);}'
    + '.jpl-b:hover{background:rgba(255,255,255,.12);}'
    + '.jpl-b.go{background:var(--jjp-green);border-color:var(--jjp-green);color:#04130a;}'
    + '.jpl-b.on{background:rgba(34,197,94,.18);border-color:rgba(34,197,94,.5);color:var(--jjp-green-lt);}'
    + '.jpl-tag{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;'
    +   'background:rgba(255,255,255,.08);color:var(--jjp-dim);margin-left:6px;vertical-align:1px;}'
    + '.jpl-cust{background:linear-gradient(140deg,rgba(34,197,94,.16),rgba(34,197,94,.04));'
    +   'border:1px solid rgba(34,197,94,.4);}'
    + '.jpl-tel{color:var(--jjp-green-lt);text-decoration:none;font-weight:600;}'
    + '@media(max-width:640px){.jpl-lead{flex-direction:column;align-items:stretch;}'
    +   '.jpl-acts{justify-content:flex-start;}}';
    var st = document.createElement('style');
    st.id = 'jpl-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  var DONE_LABEL = { called:'Called', hanger:'Door hanger left', prospect:'In Prospects', skip:'Skipped' };

  function doneTag(x){
    if(x.state === 'new') return '';
    return '<span class="jpl-tag">' + esc(DONE_LABEL[x.state])
      + (x.state_by ? ' · ' + esc(x.state_by) : '') + '</span>';
  }

  function btn(label, id, state, cls){
    return '<button class="jpl-b' + (cls ? ' ' + cls : '') + '" onclick="JJPermitLeads.mark(' + id + ',\'' + state + '\')">'
      + label + '</button>';
  }

  function undoBtn(x){
    return '<button class="jpl-b" onclick="JJPermitLeads.mark(' + x.id + ',\'new\')">Put back</button>';
  }

  function custRow(x){
    var jobs = +x.client_jobs;
    return '<div class="jpl-lead jpl-cust">'
      + '<div class="jpl-main">'
        + '<div class="jpl-t">' + esc(x.client_name || 'Customer') + doneTag(x) + '</div>'
        + '<div class="jpl-s">' + esc(nice(x.address)) + ', ' + esc(x.town)
          + ' · ' + jobs + (jobs === 1 ? ' job' : ' jobs') + ' with us, last ' + esc(fdate(x.client_last_job))
          + ' ' + esc(String(x.client_last_job||'').slice(0,4)) + '</div>'
        + '<div class="jpl-s">' + esc(x.work) + (x.value ? ' · ' + money(x.value) : '')
          + ' · permit ' + esc(fdate(x.issued_on))
          + (x.client_phone ? ' · <a class="jpl-tel" href="tel:' + esc(String(x.client_phone).replace(/[^0-9+]/g,'')) + '">'
              + esc(x.client_phone) + '</a>' : ' · no phone on file') + '</div>'
      + '</div>'
      + '<div class="jpl-acts">'
        + (x.state === 'new' ? btn('Called', x.id, 'called', 'go') + btn('Skip', x.id, 'skip') : undoBtn(x))
      + '</div></div>';
  }

  function otherRow(x){
    return '<div class="jpl-lead jjp-fr">'
      + '<div class="jpl-main">'
        + '<div class="jpl-t">' + esc(nice(x.address)) + '<span class="jpl-tag">' + esc(x.town) + '</span>' + doneTag(x) + '</div>'
        + '<div class="jpl-s">' + esc(x.work) + (x.value ? ' · ' + money(x.value) : '')
          + ' · permit ' + esc(fdate(x.issued_on)) + '</div>'
      + '</div>'
      + '<div class="jpl-acts">'
        + (x.state === 'new'
            ? btn('Door hanger left', x.id, 'hanger')
              + '<button class="jpl-b" onclick="JJPermitLeads.toProspects(' + x.id + ')">Add to Prospects</button>'
              + btn('Skip', x.id, 'skip')
            : undoBtn(x))
      + '</div></div>';
  }

  function chip(label, on, call){
    return '<button class="jpl-b' + (on ? ' on' : '') + '" onclick="JJPermitLeads.' + call + '">' + label + '</button>';
  }

  function render(){
    var el = host(); if(!el) return;
    styles();
    var old = el.querySelector('.jpl-wrap');
    var keep = old ? old.scrollTop : 0;

    var list = visible();
    var cust = list.filter(function(x){ return x.client_name; });
    var rest = list.filter(function(x){ return !x.client_name; });
    var towns = {};
    S.rows.forEach(function(x){ towns[x.town] = 1; });

    var head = '<div style="display:flex;align-items:center;gap:11px;padding:16px 2px 12px">'
      + '<div class="jjp-fr" style="width:40px;height:40px;border-radius:999px;display:flex;align-items:center;'
        + 'justify-content:center;flex:none;cursor:pointer;color:var(--jjp-ink);font-size:20px" '
        + 'onclick="JJPermitLeads.back()" title="Back to Prospects">&#8592;</div>'
      + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:20px;font-weight:700;letter-spacing:-.5px;color:#F4F8F5">Permit leads</div>'
        + '<div style="font-size:12.5px;color:var(--jjp-dim);margin-top:1px">'
          + S.newCount + ' not dealt with yet · Barrie runs about a week behind, Innisfil posts once a month</div>'
      + '</div></div>';

    var filters = '<div style="display:flex;gap:7px;flex-wrap:wrap;padding:0 2px 16px">'
      + chip('All towns', !S.town, 'setTown(\'\')')
      + Object.keys(towns).sort().map(function(t){
          return chip(esc(t), S.town === t, 'setTown(\'' + esc(t) + '\')');
        }).join('')
      + chip('Bin-sized jobs only', S.big, 'toggle(\'big\')')
      + chip('Show dealt with', S.done, 'toggle(\'done\')')
      + '</div>';

    var body;
    if(!S.rows.length){
      body = '<div style="padding:46px 24px;text-align:center;color:var(--jjp-dim);font-size:14px;line-height:1.5">'
        + 'No permits have come in yet. The list fills itself every morning.</div>';
    } else {
      body = '<div class="jjp-lab" style="padding:0 4px 9px">Past customers with a new permit · ' + cust.length + '</div>'
        + (cust.length ? cust.map(custRow).join('')
            : '<div class="jpl-s" style="padding:0 4px 14px">None right now.</div>')
        + '<div class="jjp-lab" style="padding:16px 4px 9px">Everyone else · ' + rest.length
          + ' · address only, no name or phone</div>'
        + (rest.length ? rest.map(otherRow).join('')
            : '<div class="jpl-s" style="padding:0 4px 14px">Nothing matches those filters.</div>');
    }

    el.innerHTML = '<div class="jpl-wrap"><div class="jpl-col">' + head + filters + body + '</div></div>';
    el.querySelector('.jpl-wrap').scrollTop = keep;
  }

  function find(id){
    for(var i=0;i<S.rows.length;i++){ if(S.rows[i].id === id) return S.rows[i]; }
    throw new Error('Permit lead ' + id + ' is not loaded');
  }

  async function setState(id, state){
    var x = find(id);
    var patch = { state: state, state_by: state === 'new' ? null : me(),
                  state_at: state === 'new' ? null : new Date().toISOString() };
    var r = await db.from('permit_leads').update(patch).eq('id', id);
    if(r.error){ toast('Couldn’t save that: ' + r.error.message, 'error'); return false; }
    x.state = patch.state; x.state_by = patch.state_by; x.state_at = patch.state_at;
    S.newCount = S.rows.filter(function(y){ return y.state === 'new'; }).length;
    return true;
  }

  var API = {
    async open(){
      var el = host(); if(!el) return;
      styles();
      el.innerHTML = '<div style="padding:60px;text-align:center;color:rgba(232,239,234,.45);font-size:14px">Loading…</div>';
      if(await load()) render();
    },
    back(){ JJProspects.open(); },
    setTown(t){ S.town = t; render(); },
    toggle(k){ S[k] = !S[k]; render(); },

    async mark(id, state){
      if(await setState(id, state)) render();
    },

    // A business permit becomes a normal prospect; someone looks the company up
    // from the address. The permit itself stays here, marked as moved.
    async toProspects(id){
      var x = find(id);
      var r = await db.from('prospects').insert({
        business_name: nice(x.address) + ' (permit)',
        address: nice(x.address),
        city: x.town,
        biz_type: 'building',
        why_them: x.work + (x.value ? ' · ' + money(x.value) : '') + ' · permit ' + fdate(x.issued_on) + ' ' + String(x.issued_on).slice(0,4),
        created_by: me(),
        owner: me()
      });
      if(r.error){ toast('Couldn’t add it: ' + r.error.message, 'error'); return; }
      if(await setState(id, 'prospect')){ toast('✓ Added to Prospects under ' + x.town); render(); }
    },

    // The card Prospects shows on its towns screen. The number arrives a moment
    // after the card does, the first time.
    card(){
      if(S.newCount === null && !S.counting){
        S.counting = true;
        db.from('permit_leads').select('id', { count:'exact', head:true }).eq('state','new')
          .then(function(r){
            if(r.error) throw new Error('permit lead count: ' + r.error.message);
            S.newCount = r.count;
            var n = document.getElementById('jpl-card-n');
            if(n) n.textContent = r.count;
          });
      }
      return '<div class="jjp-row" style="margin:2px 14px 9px;'
        + 'background:linear-gradient(140deg,rgba(56,189,248,.16),rgba(56,189,248,.04));'
        + 'border:1px solid rgba(56,189,248,.35)" onclick="JJPermitLeads.open()">'
        + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:16px;font-weight:600;letter-spacing:-.3px;color:#7dd3fc">Permit leads</div>'
          + '<div style="font-size:12px;margin-top:3px;color:var(--jjp-faint)">new building permits from the towns</div>'
        + '</div>'
        + '<span id="jpl-card-n" style="font-size:24px;font-weight:300;letter-spacing:-1px;color:#7dd3fc">'
          + (S.newCount === null ? '' : S.newCount) + '</span></div>';
    }
  };

  window.JJPermitLeads = API;
})();
