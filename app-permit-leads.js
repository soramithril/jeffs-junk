// ══════════════════════════════════════════════════════════════════════════
//  PERMIT LEADS — building permits the towns publish, as a call list
// ══════════════════════════════════════════════════════════════════════════
// A screen inside Prospects (v757, laid out as list + call card in v758). The
// permit-leads-sync edge function fills public.permit_leads every morning from
// Barrie's permit map (about a week behind), Innisfil's monthly list and
// Oro-Medonte's same-day feed.
//
// The public lists carry an address, the work and a date - no person's name, no
// personal phone. Oro-Medonte's also names the COMPANY on the permit; the
// fetcher keeps that and reads the company's own website for its public phone,
// email and one-line description.
//
// Every lead is sorted three ways so the office never has to think about order:
//   • potential — Hot / Worth a call / Low. See potential() for the whole rule.
//   • town      — with the drive time from the yard (city_drive_times).
//   • kind      — Demolition, New build, Renovation, Commercial, Small job.
// The card on the right is everything needed for the call: what to say, the
// bin to offer, the facts, the company and what it has on the go.
//
// A lead is never deleted. Marking it (booked / call back / not interested /
// door hanger / in Prospects / skipped) moves it out of the way, and the
// fetcher never overwrites a mark.
//
// Depends on app.js: db, toast, currentUser. Borrows the jjp-* look from
// app-prospects.js, which owns #prospects-page and has rendered once.
(function(){
  'use strict';

  // ── Kinds of work ────────────────────────────────────────────────────────
  // Order matters: first match wins. A "new deck" is a small job, not a new
  // build, so the small-job words are tested before the new-build ones.
  var KINDS = [
    ['demo',  /demol/i],
    ['small', /deck|porch|pool|fence|shed|accessory|sign|tent|septic|sewage|solar|plumbing|carport|garage/i],
    ['reno',  /second (suite|dwelling)|basement|alter|renov|interior|addition|repair|change of use|finish|below grade|fire damage/i],
    ['build', /new|single|detached|dwelling|townhouse|semi|apartment|high-rise|sfd|duplex|stor(e)?y|model/i],
    ['comm',  /commercial|industrial|institutional|retail|tenant|office|warehouse/i]
  ];
  var KIND_LABEL = { demo:'Demolition', small:'Small job', reno:'Renovation', build:'New build', comm:'Commercial', other:'Other' };
  // No size per kind of work: the office picks the bin once they know the job (Jake, 2026-11-20).
  var BIN = 'Usually a 20 yard. Your call once you know the job.';
  var BIG = { demo:1, build:1, reno:1, comm:1 };
  var FRESH_DAYS = 14;

  var S = { rows:[], drive:{}, town:'', kind:'', done:false, sel:null, loaded:false, newCount:null, perCompany:{} };

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
  function ymd(d){
    return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
  }
  function today(){ return ymd(new Date()); }
  function plusDays(n){ var d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
  function fdate(d){
    var p = String(d||'').slice(0,10).split('-');
    return p.length === 3 ? MONTHS[+p[1]-1] + ' ' + (+p[2]) : '';
  }
  function daysAgo(d){
    var p = String(d||'').slice(0,10).split('-');
    var t = today().split('-');
    return Math.round((Date.UTC(+t[0], +t[1]-1, +t[2]) - Date.UTC(+p[0], +p[1]-1, +p[2])) / 86400000);
  }
  function ago(d){
    var n = daysAgo(d);
    if(n <= 0) return 'today';
    if(n === 1) return 'yesterday';
    if(n < 14) return n + ' days ago';
    if(n < 60) return Math.round(n/7) + ' weeks ago';
    return Math.round(n/30) + ' months ago';
  }
  function money(v){
    return (v === null || v === undefined) ? '' : '$' + Math.round(+v).toLocaleString('en-CA');
  }
  // "20 PRINCE OF WALES DR" → "20 Prince Of Wales Dr"
  function nice(a){
    return String(a||'').toLowerCase().replace(/\b[a-z]/g, function(c){ return c.toUpperCase(); });
  }
  // The street without the house number, for the opening line.
  function street(a){ return nice(String(a||'').replace(/^\s*[\d-]+[a-z]?\s+/i, '')); }
  function tel(p){ return String(p).replace(/[^0-9+]/g,''); }

  function kindOf(x){
    for(var i=0;i<KINDS.length;i++){ if(KINDS[i][1].test(x.work)) return KINDS[i][0]; }
    return 'other';
  }

  // ── Potential: the whole rule, in one place ──────────────────────────────
  //   due  — we said we'd call back and the day has come.
  //   hot  — a past customer; or a company with two or more permits on the
  //          list; or real construction (demolition, new build, renovation,
  //          commercial) whose permit is 14 days old or less.
  //   good — real construction that is older, or any permit naming a company.
  //   low  — decks, pools, sheds, fences: a door hanger at most.
  function potential(x){
    if(x.state === 'callback' && x.call_back && x.call_back <= today()) return 'due';
    if(x.client_name) return 'hot';
    if(x.company && S.perCompany[x.company] >= 2) return 'hot';
    var big = BIG[x.kind];
    if(big && daysAgo(x.issued_on) <= FRESH_DAYS) return 'hot';
    if(big || x.company) return 'good';
    return 'low';
  }
  var POT = {
    due:  ['Call back today',   '#fbbf24'],
    hot:  ['Hot · call today',  '#fb923c'],
    good: ['Worth a call',      '#7dd3fc'],
    low:  ['Low · door hanger', 'rgba(232,239,234,.38)']
  };
  var POT_ORDER = ['due','hot','good','low'];

  // ── What to say ──────────────────────────────────────────────────────────
  function opener(x){
    var st = street(x.address);
    var line = {
      demo:  'I see there’s a demolition permit on ' + st + '. I can have a bin there tomorrow morning.',
      build: 'I see the new build on ' + st + ' just got its permit. Who’s looking after your bins through framing and drywall?',
      reno:  'I saw the renovation permit for ' + st + '. Want a bin dropped before demo day?',
      comm:  'I see the permit for the work on ' + st + '. We do bins and clean-outs for commercial jobs, one invoice per site.',
      small: 'I saw the permit for the work on ' + st + '. If the old one’s coming out, we can take it away for you.',
      other: 'I saw the building permit for ' + st + '. If you need a bin on site, we can have one there tomorrow.'
    }[x.kind];
    if(x.client_name){
      var first = String(x.client_name).trim().split(/\s+/)[0];
      return 'Hi ' + first + ', it’s Jeff’s Junk — you had us out in '
        + String(x.client_last_job||'').slice(0,4) + '. ' + line;
    }
    return line;
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  async function load(){
    var r = await Promise.all([
      db.rpc('permit_leads_list'),
      db.from('city_drive_times').select('city,minutes')
    ]);
    for(var i=0;i<r.length;i++){
      if(r[i].error){ toast('Couldn’t load permit leads: ' + r[i].error.message, 'error'); return false; }
    }
    S.rows = r[0].data || [];
    S.drive = {};
    (r[1].data||[]).forEach(function(d){ S.drive[String(d.city).toLowerCase()] = d.minutes; });
    S.perCompany = {};
    S.rows.forEach(function(x){
      x.kind = kindOf(x);
      if(x.company) S.perCompany[x.company] = (S.perCompany[x.company]||0) + 1;
    });
    S.rows.forEach(function(x){ x.pot = potential(x); });
    S.loaded = true;
    count();
    return true;
  }
  function isOpen(x){ return x.state === 'new' || x.state === 'callback'; }
  function count(){ S.newCount = S.rows.filter(isOpen).length; }
  function mins(town){
    var m = S.drive[String(town).toLowerCase()];
    return (m === undefined || m === null) ? null : m;
  }

  function visible(){
    return S.rows.filter(function(x){
      if(S.town && x.town !== S.town) return false;
      if(S.kind && x.kind !== S.kind) return false;
      if(!S.done && !isOpen(x)) return false;
      return true;
    });
  }

  // ── Look ─────────────────────────────────────────────────────────────────
  function styles(){
    if(document.getElementById('jpl-style')) return;
    var css = ''
    + '.jpl{display:flex;flex-direction:column;height:100vh;position:relative;}'
    + '@media(max-width:1024px){.jpl{height:calc(100vh - 72px);}}'
    + '.jpl-top{flex:none;padding:14px 18px 10px;}'
    + '.jpl-grid{flex:1;min-height:0;display:grid;grid-template-columns:minmax(300px,5fr) minmax(0,7fr);gap:14px;padding:0 18px 16px;}'
    + '.jpl-list,.jpl-card{overflow-y:auto;min-height:0;}'
    + '.jpl-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:12px 0 11px;}'
    + '.jpl-tile{border-radius:14px;padding:11px 13px;}'
    + '.jpl-num{font-size:30px;font-weight:300;letter-spacing:-1.4px;line-height:1;font-variant-numeric:tabular-nums;}'
    + '.jpl-cap{font-size:12px;color:var(--jjp-dim);margin-top:4px;}'
    + '.jpl-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;}'
    + '.jpl-b{font:inherit;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:999px;cursor:pointer;'
    +   'background:rgba(255,255,255,.06);border:1px solid var(--jjp-line);color:var(--jjp-ink);white-space:nowrap;}'
    + '.jpl-b:hover{background:rgba(255,255,255,.12);}'
    + '.jpl-b.go{background:var(--jjp-green);border-color:var(--jjp-green);color:#04130a;}'
    + '.jpl-b.on{background:rgba(34,197,94,.18);border-color:rgba(34,197,94,.5);color:var(--jjp-green-lt);}'
    + '.jpl-b .n{opacity:.6;font-weight:500;margin-left:5px;}'
    + '.jpl-lab{font-size:11.5px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;padding:13px 4px 7px;}'
    + '.jpl-row{display:flex;gap:11px;align-items:center;padding:10px 12px;border-radius:14px;margin-bottom:6px;cursor:pointer;'
    +   'background:rgba(255,255,255,.045);border:1px solid var(--jjp-line);}'
    + '.jpl-row:hover{background:rgba(255,255,255,.08);}'
    + '.jpl-row.sel{border-color:var(--jjp-green);background:rgba(34,197,94,.10);}'
    + '.jpl-dot{width:9px;height:9px;border-radius:50%;flex:none;}'
    + '.jpl-t{font-size:14.5px;font-weight:600;letter-spacing:-.25px;color:#F4F8F5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.jpl-s{font-size:12.5px;color:var(--jjp-dim);margin-top:2px;line-height:1.45;}'
    + '.jpl-tag{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;'
    +   'background:rgba(255,255,255,.08);color:var(--jjp-dim);margin-left:6px;vertical-align:1px;}'
    + '.jpl-card{border-radius:18px;padding:18px 20px 22px;}'
    + '.jpl-h{font-size:22px;font-weight:700;letter-spacing:-.6px;color:#F4F8F5;line-height:1.2;}'
    + '.jpl-say{background:linear-gradient(140deg,rgba(34,197,94,.20),rgba(34,197,94,.07));border:1px solid rgba(34,197,94,.42);'
    +   'border-radius:14px;padding:12px 14px;margin:14px 0;font-size:15px;line-height:1.5;color:#F4F8F5;}'
    + '.jpl-say b{display:block;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:var(--jjp-green-lt);margin-bottom:4px;}'
    + '.jpl-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px 16px;margin-bottom:14px;}'
    + '.jpl-facts span{display:block;font-size:11.5px;color:var(--jjp-faint);margin-bottom:1px;}'
    + '.jpl-facts div{font-size:14px;color:#F4F8F5;}'
    + '.jpl-box{border-radius:14px;padding:12px 14px;margin-bottom:14px;background:rgba(56,189,248,.07);border:1px solid rgba(56,189,248,.28);}'
    + '.jpl-box.cust{background:rgba(34,197,94,.07);border-color:rgba(34,197,94,.3);}'
    + '.jpl-box h4{margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#7dd3fc;}'
    + '.jpl-box.cust h4{color:var(--jjp-green-lt);}'
    + '.jpl-box .jpl-s{color:var(--jjp-ink);}'
    + '.jpl-a{color:#7dd3fc;text-decoration:none;font-weight:600;}'
    + '.jpl-a.g{color:var(--jjp-green-lt);}'
    + '.jpl-acts{display:flex;gap:7px;flex-wrap:wrap;margin-top:6px;}'
    + '.jpl-note{width:100%;min-height:54px;margin-top:12px;font:inherit;font-size:13.5px;padding:9px 11px;border-radius:12px;'
    +   'background:rgba(255,255,255,.05);border:1px solid var(--jjp-line);color:var(--jjp-ink);resize:vertical;}'
    + '.jpl-back{display:none;}'
    + '.jpl-empty{padding:46px 24px;text-align:center;color:var(--jjp-dim);font-size:14px;line-height:1.5;}'
    + '@media(max-width:900px){'
    +   '.jpl-grid{grid-template-columns:minmax(0,1fr);}'
    +   '.jpl-tiles{grid-template-columns:repeat(2,minmax(0,1fr));}'
    +   '.jpl-card{display:none;}'
    +   '.jpl.card-open .jpl-list,.jpl.card-open .jpl-top{display:none;}'
    +   '.jpl.card-open .jpl-card{display:block;}'
    +   '.jpl.card-open .jpl-grid{padding-top:14px;}'
    +   '.jpl-back{display:inline-block;margin-bottom:12px;}'
    + '}';
    var st = document.createElement('style');
    st.id = 'jpl-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  // ── List ─────────────────────────────────────────────────────────────────
  var DONE_LABEL = { booked:'Booked', callback:'Call back', no:'Not interested',
                     hanger:'Door hanger left', prospect:'In Prospects', skip:'Skipped' };

  function titleOf(x){
    if(x.client_name) return x.client_name;
    if(x.company) return x.company;
    return nice(x.address);
  }

  function rowHtml(x){
    var m = mins(x.town);
    var tag = !isOpen(x) ? '<span class="jpl-tag">' + esc(DONE_LABEL[x.state]) + '</span>'
            : (x.state === 'callback' ? '<span class="jpl-tag">call back ' + esc(fdate(x.call_back)) + '</span>' : '');
    return '<div class="jpl-row' + (S.sel === x.id ? ' sel' : '') + '" onclick="JJPermitLeads.select(' + x.id + ')">'
      + '<span class="jpl-dot" style="background:' + (x.client_name ? '#86efac' : POT[x.pot][1]) + '"></span>'
      + '<div style="flex:1;min-width:0">'
        + '<div class="jpl-t">' + (x.client_name ? 'Past customer · ' : '') + esc(titleOf(x)) + tag + '</div>'
        + '<div class="jpl-s">' + esc(KIND_LABEL[x.kind]) + ' · ' + esc(x.town)
          + (m !== null ? ' ' + m + ' min' : '') + ' · ' + esc(ago(x.issued_on)) + '</div>'
      + '</div></div>';
  }

  function listHtml(list){
    if(!S.rows.length) return '<div class="jpl-empty">No permits have come in yet. The list fills itself every morning.</div>';
    if(!list.length) return '<div class="jpl-empty">Nothing matches those filters.</div>';
    return POT_ORDER.map(function(p){
      var rows = list.filter(function(x){ return x.pot === p; });
      if(!rows.length) return '';
      return '<div class="jpl-lab" style="color:' + POT[p][1] + '">' + POT[p][0] + ' · ' + rows.length + '</div>'
        + rows.map(rowHtml).join('');
    }).join('');
  }

  // ── The call card ────────────────────────────────────────────────────────
  var ROLE_LABEL = { 'Builder':'The builder', 'Applicant':'Applied for the permit', 'Payer':'Paid for the permit',
                     'Sewage system installer':'Septic installer', 'Property owner':'Owns the property' };

  function fact(label, value){ return '<div><span>' + label + '</span>' + value + '</div>'; }

  function companyBox(x){
    if(!x.company) return '';
    var others = S.rows.filter(function(y){ return y.company === x.company && y.id !== x.id; });
    var jobs = +x.company_jobs;
    var lines = [];
    lines.push((ROLE_LABEL[x.company_role] || 'Named on the permit')
      + ' · ' + (jobs > 0 ? 'already a customer, ' + jobs + (jobs === 1 ? ' job' : ' jobs') + ' with us' : 'not a customer yet'));
    if(x.company_about) lines.push('“' + esc(x.company_about) + '”');
    var reach = [];
    if(x.company_phone) reach.push('<a class="jpl-a" href="tel:' + esc(tel(x.company_phone)) + '">' + esc(x.company_phone) + '</a>');
    if(x.company_email) reach.push('<a class="jpl-a" href="mailto:' + esc(x.company_email) + '">' + esc(x.company_email) + '</a>');
    if(x.company_site)  reach.push('<a class="jpl-a" href="https://' + esc(x.company_site) + '" target="_blank" rel="noopener">' + esc(x.company_site) + '</a>');
    if(reach.length) lines.push(reach.join(' &nbsp;·&nbsp; '));
    if(others.length){
      lines.push('Also on the list: ' + others.slice(0,4).map(function(y){
        return esc(KIND_LABEL[y.kind].toLowerCase()) + ' on ' + esc(street(y.address));
      }).join(', ') + (others.length > 4 ? ' and ' + (others.length - 4) + ' more' : ''));
    }
    return '<div class="jpl-box"><h4>' + esc(x.company) + '</h4>'
      + lines.map(function(l){ return '<div class="jpl-s">' + l + '</div>'; }).join('')
      + (!x.company_phone ? '<div class="jpl-acts"><button class="jpl-b" onclick="JJPermitLeads.lookUp(' + x.id + ')">Look up their number</button></div>' : '')
      + '</div>';
  }

  function customerBox(x){
    if(!x.client_name) return '';
    var jobs = +x.client_jobs;
    return '<div class="jpl-box cust"><h4>Past customer</h4>'
      + '<div class="jpl-s">' + esc(x.client_name) + ' · ' + jobs + (jobs === 1 ? ' job' : ' jobs')
        + ' at this address, last ' + esc(fdate(x.client_last_job)) + ' ' + esc(String(x.client_last_job||'').slice(0,4)) + '</div>'
      + '<div class="jpl-s">'
        + (x.client_phone ? '<a class="jpl-a g" href="tel:' + esc(tel(x.client_phone)) + '">' + esc(x.client_phone) + '</a>'
                          : 'No phone on file')
      + '</div></div>';
  }

  function actions(x){
    var b = function(label, call, cls){
      return '<button class="jpl-b' + (cls ? ' ' + cls : '') + '" onclick="JJPermitLeads.' + call + '">' + label + '</button>';
    };
    if(!isOpen(x)){
      return '<div class="jpl-s">' + esc(DONE_LABEL[x.state]) + (x.state_by ? ' · ' + esc(x.state_by) : '')
        + (x.state_at ? ' · ' + esc(fdate(x.state_at)) : '') + '</div>'
        + '<div class="jpl-acts">' + b('Put back on the list', 'mark(' + x.id + ',\'new\')') + '</div>';
    }
    var callable = x.client_name || x.company;
    return '<div class="jpl-lab" style="padding:4px 0 7px;color:var(--jjp-faint)">'
        + (callable ? 'How did the call go?' : 'No name or number on this one') + '</div>'
      + '<div class="jpl-acts">'
        + (callable ? b('Booked a bin', 'mark(' + x.id + ',\'booked\')', 'go')
                    + b('No answer', 'mark(' + x.id + ',\'noanswer\')')
                    + b('Call back in a week', 'mark(' + x.id + ',\'callback\')')
                    + b('Not interested', 'mark(' + x.id + ',\'no\')') : '')
        + b('Door hanger left', 'mark(' + x.id + ',\'hanger\')')
        + b('Add to Prospects', 'toProspects(' + x.id + ')')
        + b('Skip', 'mark(' + x.id + ',\'skip\')')
      + '</div>';
  }

  function cardHtml(x){
    if(!x) return '<div class="jpl-empty">Pick a lead on the left.</div>';
    var m = mins(x.town);
    return '<button class="jpl-b jpl-back" onclick="JJPermitLeads.select(null)">&#8592; Back to the list</button>'
      + '<div class="jpl-h">' + esc(titleOf(x)) + '</div>'
      + '<div class="jpl-s" style="font-size:13.5px">' + esc(nice(x.address)) + ', ' + esc(x.town)
        + ' · <span style="color:' + POT[x.pot][1] + '">' + POT[x.pot][0].split(' · ')[0] + '</span></div>'
      + '<div class="jpl-say"><b>What to say</b>“' + esc(opener(x)) + '”</div>'
      + '<div class="jpl-facts">'
        + fact('The job', esc(x.work))
        + fact('Bin to offer', BIN)
        + (x.value ? fact('Job value', money(x.value)) : '')
        + fact('Permit issued', esc(fdate(x.issued_on)) + ' · ' + esc(ago(x.issued_on)))
        + fact('Where', esc(x.town) + (m !== null ? ' · ' + m + ' min from the yard' : ''))
      + '</div>'
      + customerBox(x)
      + companyBox(x)
      + actions(x)
      + '<textarea class="jpl-note" placeholder="Note for whoever picks this up next…" '
        + 'onchange="JJPermitLeads.saveNote(' + x.id + ',this.value)">' + esc(x.note || '') + '</textarea>';
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function chip(label, n, on, call){
    return '<button class="jpl-b' + (on ? ' on' : '') + '" onclick="JJPermitLeads.' + call + '">'
      + label + (n === null ? '' : '<span class="n">' + n + '</span>') + '</button>';
  }
  function tile(n, cap, colour){
    return '<div class="jpl-tile jjp-fr"><div class="jpl-num" style="color:' + colour + '">' + n + '</div>'
      + '<div class="jpl-cap">' + cap + '</div></div>';
  }

  function render(){
    var el = host(); if(!el) return;
    styles();
    var oldList = el.querySelector('.jpl-list');
    var keep = oldList ? oldList.scrollTop : 0;

    var live = S.rows.filter(isOpen);
    var list = visible();
    // A wide screen always has a lead open; a phone shows the list first.
    var wide = window.innerWidth > 900;
    var sel = null, i;
    for(i=0;i<list.length;i++){ if(list[i].id === S.sel) sel = list[i]; }
    if(!sel && wide){
      for(var p=0;p<POT_ORDER.length && !sel;p++){
        for(i=0;i<list.length;i++){ if(list[i].pot === POT_ORDER[p]){ sel = list[i]; break; } }
      }
    }
    S.sel = sel ? sel.id : null;

    var towns = {}, kinds = {};
    live.forEach(function(x){
      towns[x.town] = (towns[x.town]||0) + 1;
      if(!S.town || x.town === S.town) kinds[x.kind] = (kinds[x.kind]||0) + 1;
    });

    var top = '<div class="jpl-top">'
      + JJProspects.tabs('permits')
      + '<div style="font-size:12.5px;color:var(--jjp-dim);padding:0 2px">'
        + 'New building permits, best calls first. Oro-Medonte is same-day, Barrie about a week behind, Innisfil once a month.</div>'
      + '<div class="jpl-tiles">'
        + tile(live.filter(function(x){ return x.pot === 'hot' || x.pot === 'due'; }).length, 'hot · call today', '#fb923c')
        + tile(live.filter(function(x){ return x.client_name; }).length, 'past customers', '#86efac')
        + tile(live.filter(function(x){ return x.company; }).length, 'name a company', '#7dd3fc')
        + tile(live.filter(function(x){ return daysAgo(x.issued_on) <= 7; }).length, 'issued this week', '#F4F8F5')
      + '</div>'
      + '<div class="jpl-chips">'
        + chip('All towns', live.length, !S.town, 'setTown(\'\')')
        + Object.keys(towns).sort().map(function(t){
            var m = mins(t);
            return chip(esc(t) + (m !== null ? ' · ' + m + ' min' : ''), towns[t], S.town === t, 'setTown(\'' + esc(t) + '\')');
          }).join('')
      + '</div>'
      + '<div class="jpl-chips">'
        + chip('All work', null, !S.kind, 'setKind(\'\')')
        + ['demo','build','reno','comm','small','other'].filter(function(k){ return kinds[k]; }).map(function(k){
            return chip(KIND_LABEL[k], kinds[k], S.kind === k, 'setKind(\'' + k + '\')');
          }).join('')
        + chip('Show dealt with', null, S.done, 'toggleDone()')
      + '</div></div>';

    el.innerHTML = '<div class="jpl' + (sel && !wide ? ' card-open' : '') + '">' + top
      + '<div class="jpl-grid">'
        + '<div class="jpl-list">' + listHtml(list) + '</div>'
        + '<div class="jpl-card jjp-fr">' + cardHtml(sel) + '</div>'
      + '</div></div>';
    el.querySelector('.jpl-list').scrollTop = keep;
  }

  function find(id){
    for(var i=0;i<S.rows.length;i++){ if(S.rows[i].id === id) return S.rows[i]; }
    throw new Error('Permit lead ' + id + ' is not loaded');
  }

  async function patch(id, fields){
    var r = await db.from('permit_leads').update(fields).eq('id', id);
    if(r.error){ toast('Couldn’t save that: ' + r.error.message, 'error'); return false; }
    var x = find(id);
    Object.keys(fields).forEach(function(k){ x[k] = fields[k]; });
    x.pot = potential(x);
    count();
    return true;
  }

  // What each button does to the lead, and what it writes in the call log
  // (prospect_visits, the one log the Prospects scoreboard counts). Only a real
  // call is logged: a door hanger or a skip is not a call.
  var OUTCOME = {
    booked:   { state:'booked',   log:'booked',         say:'✓ Marked as booked. Book the bin from New Job as usual.' },
    callback: { state:'callback', log:'call back',      say:'✓ It comes back to the top in a week.', days:7 },
    noanswer: { state:'callback', log:'no answer',      say:'✓ No answer. It comes back tomorrow.', days:1 },
    no:       { state:'no',       log:'not interested', say:'✓ Not interested. Off the list.' },
    hanger:   { state:'hanger' },
    skip:     { state:'skip' },
    'new':    { state:'new' }
  };
  async function setOutcome(id, key){
    var o = OUTCOME[key];
    if(!o) throw new Error('Unknown permit lead outcome: ' + key);
    var fresh = o.state === 'new';
    var ok = await patch(id, {
      state: o.state,
      state_by: fresh ? null : me(),
      state_at: fresh ? null : new Date().toISOString(),
      call_back: o.days ? plusDays(o.days) : null
    });
    if(!ok) return false;
    if(o.log){
      var r = await db.from('prospect_visits').insert({
        permit_lead_id: id, visited_on: today(), kind: 'call',
        spoke_to: key === 'noanswer' ? 'nobody in' : '', outcome: o.log, created_by: me()
      });
      if(r.error){ toast('Saved, but the call didn’t reach the log: ' + r.error.message, 'error'); return true; }
    }
    if(o.say) toast(o.say);
    return true;
  }

  var API = {
    // id: a lead to open straight away (tapped on the Today list).
    async open(id){
      var el = host(); if(!el) return;
      styles();
      el.innerHTML = '<div style="padding:60px;text-align:center;color:rgba(232,239,234,.45);font-size:14px">Loading…</div>';
      if(!(await load())) return;
      if(id){ S.town = ''; S.kind = ''; S.sel = id; }
      render();
    },
    setTown(t){ S.town = t; S.kind = ''; render(); },
    setKind(k){ S.kind = k; render(); },
    toggleDone(){ S.done = !S.done; render(); },
    select(id){ S.sel = id; render(); },

    // For the Prospects page, which shows permit leads on its Today list.
    async rows(){ return (await load()) ? S.rows : null; },
    list(){ return S.rows; },
    callInfo(x){
      var m = mins(x.town);
      return {
        title: titleOf(x),
        phone: (x.client_name ? x.client_phone : x.company_phone) || '',
        past: !!x.client_name, pot: x.pot, open: isOpen(x), age: ago(x.issued_on),
        // Set aside for a later day: a call back whose date has not come yet.
        waiting: x.state === 'callback' && x.pot !== 'due',
        sub: KIND_LABEL[x.kind] + ' permit · ' + x.town + (m !== null ? ' · ' + m + ' min out' : '')
          + (x.client_name && x.client_last_job ? ' · had us out in ' + String(x.client_last_job).slice(0,4) : '')
      };
    },
    outcome: setOutcome,

    async mark(id, key){
      if(await setOutcome(id, key)) render();
    },

    async saveNote(id, text){
      if(await patch(id, { note: String(text).trim() || null })) toast('✓ Note saved');
    },

    // No phone was found on the company's own site: open a web search for it.
    lookUp(id){
      var x = find(id);
      window.open('https://www.google.com/search?q=' + encodeURIComponent(x.company + ' ' + x.town + ' Ontario phone'), '_blank', 'noopener');
    },

    // The lead becomes a normal prospect, under the company's name when the
    // permit gives one. The permit itself stays here, marked as moved.
    async toProspects(id){
      var x = find(id);
      var r = await db.from('prospects').insert({
        business_name: x.company || (nice(x.address) + ' (permit)'),
        address: nice(x.address),
        city: x.town,
        phone: x.company_phone || null,
        biz_type: 'building',
        why_them: x.work + (x.value ? ' · ' + money(x.value) : '') + ' · permit ' + fdate(x.issued_on) + ' ' + String(x.issued_on).slice(0,4),
        created_by: me(),
        owner: me()
      });
      if(r.error){ toast('Couldn’t add it: ' + r.error.message, 'error'); return; }
      if(await patch(id, { state:'prospect', state_by: me(), state_at: new Date().toISOString(), call_back: null })){
        toast('✓ Added to Prospects under ' + x.town);
        render();
      }
    }

  };

  window.JJPermitLeads = API;
})();
