/* ── SCHEDULE LOOKS (try-out, 2026-10-20) ─────────────────────────────────────
   Six redesigns of the crew Schedule page, side by side, on SAMPLE crew data so
   Barb can flip through them and pick a favourite (Jake: "Barb can switch
   through them to pick her fav"). Nothing here reads or writes the real
   schedule. The only write is her pick: jwg_app_settings 'schedule_look_picks',
   a {name: {look, at}} map, so every pick stays visible to Jake.

   Opened by the "New looks" banner on the Schedule page (app-jwg-scheduler.js).
   Under 900px each look draws its phone layout. Remove this file, its CSS, the
   index.html tags and the banner once a look is chosen and built for real.
   ─────────────────────────────────────────────────────────────────────────── */
(function(){
'use strict';

const P={
  cut:'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12',
  garden:'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10zM2 21c0-3 1.85-5.36 5.08-6',
  office:'M3 4h18v12H3zM8 20h8M12 16v4',
  bins:'M1 4h14v12H1zM15 8h4l3 3v5h-7zM5.5 20.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 20.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  junk:'M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V3h6v3',
  furn:'M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2zM5 18v2M19 18v2',
  shop:'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  extra:'M3 20l6-10 4 6 3-4 5 8z',
  vac:'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  sick:'M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z',
  off:'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  closed:'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  appt:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  plus:'M12 5v14M5 12h14', check:'M20 6 9 17l-5-5', x:'M18 6 6 18M6 6l12 12',
  copy:'M9 9h12v12H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  erase:'M20 20H8l-4-4a2 2 0 0 1 0-2.8L13 4.2a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L11 20M7 11l6 6',
  undo:'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13', arrow:'M5 12h14M13 6l6 6-6 6',
  repeat:'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  trash:'M3 6h18M19 6l-1 14H6L5 6'
};
const JOBS=[
  {k:'cut',name:'Cutting crew',sh:'Cutting',c:'#166534',t:'#dcfce7',s:'#16a34a',d:'7–4'},
  {k:'garden',name:'Garden crew',sh:'Garden',c:'#9d174d',t:'#fce7f3',s:'#db2777',d:'7–4'},
  {k:'office',name:'Office',sh:'Office',c:'#1e40af',t:'#dbeafe',s:'#2563eb',d:'8:30–4:30'},
  {k:'bins',name:'Bins',sh:'Bins',c:'#115e59',t:'#ccfbf1',s:'#0d9488',d:'7–5'},
  {k:'junk',name:'Junk',sh:'Junk',c:'#9a3412',t:'#ffedd5',s:'#ea580c',d:'7–4'},
  {k:'furn',name:'Furniture Bank',sh:'Furniture',c:'#5b21b6',t:'#ede9fe',s:'#7c3aed',d:'8–4'},
  {k:'shop',name:'Shop',sh:'Shop',c:'#854d0e',t:'#fef3c7',s:'#ca8a04',d:'7–3:30'},
  {k:'extra',name:'Landscape',sh:'Landscape',c:'#334155',t:'#e2e8f0',s:'#475569',d:'7–4'}
];
const JM=Object.fromEntries(JOBS.map(j=>[j.k,j]));
const AWAY=[{k:'vac',name:'Vacation'},{k:'sick',name:'Sick'},{k:'off',name:'Day off'},{k:'closed',name:'Closed'},{k:'appt',name:'Appt'}];
const AM=Object.fromEntries(AWAY.map(a=>[a.k,a]));
const HOURS=['7–4','7–5','8:30–4:30','10–4','3–7'];
const HRS={'7–4':9,'7–5':10,'8:30–4:30':8,'10–4':6,'3–7':4,'7–3:30':8.5,'8–4':8};
const DAYS=[['Mon','19','Monday'],['Tue','20','Tuesday'],['Wed','21','Wednesday'],['Thu','22','Thursday'],['Fri','23','Friday']];
const AVC=[['#e0e7ff','#3730a3'],['#fae8ff','#86198f'],['#e0f2fe','#075985'],['#fef3c7','#92400e'],['#dcfce7','#166534'],['#ffe4e6','#9f1239'],['#f1f5f9','#334155']];
const CREWS=[
  ['Owners',[['jeff','Jeff'],['barb','Barb']]],
  ['Office',[['sam','Sam'],['kelly','Kelly'],['rachel','Rachel']]],
  ['Misc jobs',[['josh','Josh'],['jordan','Jordan'],['max','Max'],['tylerm','Tyler']]],
  ['Cutting crew',[['darrin','Darrin'],['jasper','Jasper'],['tylerc','Tyler']]],
  ['Garden crew',[['micaela','Micaela']]],
  ['Bins',[['kevin','Kevin'],['neil','Neil']]],
  ['IT',[['jake','Jake']]]
];
const O='office|8:30–4:30',T='office|10–4',J='junk|7–4',C='cut|7–4',B='bins|7–5',S7='shop|7–3:30',G='garden|7–4';
const START={
  jeff:[T,'',T,'',T], barb:[O,O,O,O,'off'], sam:[O,O,O,O,O], kelly:[O,O,'appt',O,O], rachel:[T,T,'',T,'vac'],
  josh:[J,J,J,J,J], jordan:[J,J,'furn|8–4',J,''], max:['furn|8–4',J,J,J,'vac'], tylerm:[S7,S7,S7,'extra|7–4','extra|7–4'],
  darrin:[C,C,C,C,S7], jasper:[C,C,C,C,C], tylerc:[C,C,'',C,C], micaela:[G,G,'off',G,G], kevin:[B,B,B,B,B], neil:[B,B,B,B,'off'], jake:['',T,'',T,'']
};
const USUAL={
  jeff:[T,'',T,'',T], barb:[O,O,O,O,O], sam:[O,O,O,O,O], kelly:[O,O,O,O,O], rachel:[T,T,'',T,T],
  josh:[J,J,J,J,J], jordan:[J,J,J,J,J], max:[J,J,J,J,J], tylerm:[S7,S7,S7,S7,S7],
  darrin:[C,C,C,C,C], jasper:[C,C,C,C,C], tylerc:[C,C,C,C,C], micaela:[G,G,G,G,G], kevin:[B,B,B,B,B], neil:[B,B,B,B,B], jake:['',T,'',T,'']
};
const LOOKS=['Tidy grid','Paint the week','Job board','Day timeline','Usual week','Person cards'];
const PICK_KEY='schedule_look_picks';

const PEOPLE={},ORDER=[];
let _n=0;
CREWS.forEach(([,ppl])=>ppl.forEach(([id,name])=>{PEOPLE[id]={name,av:AVC[_n++%AVC.length]};ORDER.push(id);}));

let S=null;
function fresh(look){
  return {look:look||1,sched:clone(START),usual:clone(USUAL),sel:{p:'tylerc',d:2},day:2,selP:'tylerc',
    brush:{kind:'job',k:'cut',time:'7–4'},hist:[],mode:'week',crew:'All',picks:{},painting:false};
}

// ── helpers ──
function clone(o){return JSON.parse(JSON.stringify(o));}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function ico(d){return `<svg class="sl-i" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;}
function parse(code){
  if(!code)return {kind:'empty'};
  if(AM[code])return {kind:'away',a:AM[code]};
  const i=code.indexOf('|');
  return {kind:'job',job:JM[code.slice(0,i)],time:code.slice(i+1)};
}
function avS(id){const a=PEOPLE[id].av;return `background:${a[0]};color:${a[1]}`;}
function av(id,size){
  const sz=size?`;width:${size}px;height:${size}px;font-size:${Math.round(size*0.36)}px`:'';
  return `<span class="sl-av" style="${avS(id)}${sz}">${PEOPLE[id].name.slice(0,2)}</span>`;
}
function tile(j,size){return `<span class="sl-tile" style="background:${j.s};width:${size}px;height:${size}px">${ico(P[j.k])}</span>`;}
function hoursOf(codes){return codes.reduce((t,c)=>{const v=parse(c);return t+(v.kind==='job'?(HRS[v.time]||8):0);},0);}
function usualOf(id){return S.usual[id].find(c=>c)||O;}
function phone(){return window.innerWidth<900;}
function dA(a,p,d,k){return `data-a="${a}"${p?` data-p="${p}"`:''}${d!=null?` data-d="${d}"`:''}${k!=null?` data-k="${k}"`:''}`;}
function lab(t){return `<div class="sl-lab">${t}</div>`;}
function editTarget(){return S.look===5&&S.mode==='usual'?S.usual:S.sched;}
function dayLabel(d){return `${DAYS[d][2]} · Oct ${DAYS[d][1]}`;}
function weekNav(){return `<div class="sl-wk"><span class="sl-wkb">${ico('M15 18l-6-6 6-6')}</span><span>Oct 19 – 25</span><span class="sl-wkb">${ico('M9 18l6-6-6-6')}</span></div>`;}

// A day cell: job = tinted block, away = hatched, empty = faint plus.
function cell(code,act,p,d,on,big){
  const v=parse(code),cls=`sl-cell${on?' sl-on':''}${big?' sl-big':''}`;
  if(v.kind==='job')return `<button class="${cls}" style="background:${v.job.t};color:${v.job.c}" ${dA(act,p,d)} aria-label="${PEOPLE[p]?PEOPLE[p].name:''} ${DAYS[d][0]}">${tile(v.job,big?36:28)}<span>${v.time}</span>${big?`<span class="sl-cell-nm">${v.job.name}</span>`:''}</button>`;
  if(v.kind==='away')return `<button class="${cls} sl-away" ${dA(act,p,d)}>${ico(P[v.a.k])}<span>${v.a.name}</span></button>`;
  return `<button class="${cls} sl-empty" ${dA(act,p,d)} aria-label="Add">${ico(P.plus)}</button>`;
}

// The one editor every look shares: job tiles, hour chips, away chips. Acts on S.sel.
function editor(variant){
  const t=editTarget(),v=parse(t[S.sel.p][S.sel.d]);
  const usualMode=S.look===5&&S.mode==='usual';
  const jobs=JOBS.map(j=>{
    const on=v.kind==='job'&&v.job.k===j.k;
    if(variant==='icons')return `<button class="sl-dj${on?' sl-on':''}" style="background:${j.s}" ${dA('ed-job',null,null,j.k)} title="${j.name}" aria-label="${j.name}">${ico(P[j.k])}</button>`;
    return `<button class="sl-jt" style="${on?`border-color:${j.s};background:${j.t};box-shadow:0 0 0 1.5px ${j.s}`:''}" ${dA('ed-job',null,null,j.k)}>${tile(j,34)}<span>${variant==='short'?j.sh:j.name}</span></button>`;
  }).join('');
  const hours=HOURS.map(h=>`<button class="sl-hc${v.kind==='job'&&v.time===h?' sl-on':''}${v.kind!=='job'?' sl-dim':''}" ${dA('ed-hrs',null,null,h)}>${h}</button>`).join('');
  const list=usualMode?[{k:'off',name:'Not working'}]:AWAY;
  const aways=list.map(a=>`<button class="sl-ac${v.kind==='away'&&v.a.k===a.k?' sl-on':''}" ${dA('ed-away',null,null,a.k)} title="${a.name}">${ico(P[a.k])}${variant==='icons'?'':a.name}</button>`).join('');
  return {jobs,hours,aways,v};
}

// ── shell ──
function shell(body){
  const me=myName(),mine=me&&S.picks[me]?S.picks[me].look:null;
  const tabs=LOOKS.map((nm,i)=>`<button class="sl-tab${S.look===i+1?' sl-on':''}" ${dA('look',null,null,i+1)}><span class="sl-tabn">${i+1}</span>${nm}</button>`).join('');
  const picks=Object.keys(S.picks).sort().map(n=>`<span class="sl-pk">${esc(n)} <b>${S.picks[n].look} · ${esc(LOOKS[S.picks[n].look-1]||'')}</b></span>`).join('');
  return `<div class="sl-top">
    <div class="sl-toprow">
      <div class="sl-ttl"><b>New looks for Schedule</b><span>Sample crew. Nothing here changes the real schedule.</span></div>
      <button class="sl-pick${mine===S.look?' sl-on':''}" ${dA('pick')}>${ico(P.check)}${mine===S.look?'Your pick':'Pick this one'}</button>
      <button class="sl-x" ${dA('close')} aria-label="Close">${ico(P.x)}</button>
    </div>
    <div class="sl-tabs">${tabs}</div>
    ${picks?`<div class="sl-pks">Picks so far: ${picks}</div>`:''}
  </div>
  <div class="sl-body${phone()?' sl-phone':''}">${body}</div>`;
}

// ── 1 · Tidy grid ──
function gridHead(extra){
  return `<div class="sl-row sl-hdrow"><div class="sl-hd" style="padding-left:16px">Team</div>${DAYS.map((d,i)=>`<div class="sl-hd${i===0?' sl-today':''}"${extra||''}><b>${d[0]}</b>Oct ${d[1]}</div>`).join('')}</div>`;
}
function totalsRow(){
  return `<div class="sl-row sl-foot"><div class="sl-who">On shift</div>${DAYS.map((_,d)=>{
    let n=0,h=0;ORDER.forEach(id=>{const v=parse(S.sched[id][d]);if(v.kind==='job'){n++;h+=HRS[v.time]||8;}});
    return `<div class="sl-c"><b class="sl-green">${n} on</b> · ${h}h</div>`;}).join('')}</div>`;
}
function legend(){
  return `<div class="sl-legend">${JOBS.map(j=>`<span class="sl-lg">${tile(j,26)}${j.name}</span>`).join('')}<span class="sl-lg"><span class="sl-tile sl-hatch" style="width:26px;height:26px"></span>Away</span></div>`;
}
function look1(){
  if(phone())return look1p();
  let g=gridHead();
  CREWS.forEach(([cn,ppl])=>{
    g+=`<div class="sl-band">${cn} · ${ppl.length}</div>`;
    ppl.forEach(([id,name])=>{
      const hr=hoursOf(S.sched[id]);
      g+=`<div class="sl-row"><div class="sl-who">${av(id)}<div><div class="sl-nm">${name}</div><div class="sl-bar"><i style="width:${Math.min(100,Math.round(hr/45*100))}%"></i></div></div><span class="sl-hr">${hr}h</span></div>${S.sched[id].map((code,d)=>`<div class="sl-c${d===0?' sl-today':''}">${cell(code,'sel',id,d,S.sel&&S.sel.p===id&&S.sel.d===d)}</div>`).join('')}</div>`;
    });
  });
  g+=totalsRow();
  let panel=`<div class="sl-panel sl-card"><div class="sl-muted" style="padding:30px 0;text-align:center">Tap a day on the grid</div></div>`;
  if(S.sel){
    const e=editor('full'),p=S.sel.p,d=S.sel.d;
    panel=`<div class="sl-panel sl-card">
      <div class="sl-ph">${av(p,46)}<div><div class="sl-pname">${PEOPLE[p].name}</div><div class="sl-muted">${dayLabel(d)}</div></div></div>
      ${e.v.kind==='empty'?`<div class="sl-cell sl-big sl-empty sl-notyet">Not working yet</div>`:cell(S.sched[p][d],'none',p,d,false,true)}
      <div>${lab('Job')}<div class="sl-jobs">${e.jobs}</div></div>
      <div>${lab('Hours')}<div class="sl-wrap">${e.hours}<button class="sl-hc">Other…</button></div></div>
      <div>${lab('Away')}<div class="sl-wrap">${e.aways}</div></div>
      <div class="sl-pfoot"><button class="sl-ghost" ${dA('ed-clear')}>${ico(P.trash)}Clear day</button><span class="sl-saved">${ico(P.check)}Saved</span></div>
    </div>`;
  }
  return `<div class="sl-bar-top">${weekNav()}<span class="sl-pill">This week</span><span class="sl-grow"></span><span class="sl-saved">${ico(P.check)}Saved</span><button class="sl-btn">${ico(P.copy)}Copy last week</button></div>
    ${legend()}
    <div class="sl-main"><div class="sl-card sl-scrollx sl-grow2"><div class="sl-grid">${g}</div></div>${panel}</div>`;
}
function dayStrip(sub){
  return `<div class="sl-days">${DAYS.map((d,i)=>`<button class="sl-dt${i===S.day?' sl-on':''}" ${dA('day',null,i)}><span class="sl-dta">${d[0]}</span><b>${d[1]}</b>${sub(i)}</button>`).join('')}</div>`;
}
function onCount(d){return ORDER.filter(id=>parse(S.sched[id][d]).kind==='job').length;}
function look1p(){
  let h=dayStrip(i=>`<span class="sl-dtc">${onCount(i)} on</span>`);
  CREWS.forEach(([cn,ppl])=>{
    h+=`<div class="sl-pband">${cn}</div>`;
    ppl.forEach(([id,name])=>{
      const v=parse(S.sched[id][S.day]),on=S.sel&&S.sel.p===id;
      let blk;
      if(v.kind==='job')blk=`<span class="sl-blk" style="background:${v.job.t};color:${v.job.c}">${tile(v.job,26)}${v.time}</span>`;
      else if(v.kind==='away')blk=`<span class="sl-blk sl-away">${ico(P[v.a.k])}${v.a.name}</span>`;
      else blk=`<span class="sl-blk sl-blk-empty">+ Add</span>`;
      h+=`<button class="sl-prow${on?' sl-on':''}" ${dA('selday',id)}>${av(id)}<span class="sl-nm sl-grow">${name}</span>${blk}</button>`;
    });
  });
  h+=`<div style="height:24px"></div>`;
  if(S.sel){
    const e=editor('short'),p=S.sel.p;
    h+=`<button class="sl-scrim" ${dA('unsel')} aria-label="Close"></button>
    <div class="sl-sheet"><div class="sl-grab"></div>
      <div class="sl-ph">${av(p,42)}<div><div class="sl-pname">${PEOPLE[p].name}</div><div class="sl-muted">${dayLabel(S.sel.d)}</div></div></div>
      <div>${lab('Job')}<div class="sl-jobs">${e.jobs}</div></div>
      <div>${lab('Hours')}<div class="sl-hscroll">${e.hours}</div></div>
      <div>${lab('Away')}<div class="sl-hscroll">${e.aways}</div></div>
      <button class="sl-done" ${dA('unsel')}>${ico(P.check)}Done</button>
    </div>`;
  }
  return h;
}

// ── 2 · Paint the week ──
function brushInfo(){
  const b=S.brush;
  if(b.kind==='job'){const j=JM[b.k];return {name:j.name,time:b.time,icon:P[j.k],tile:j.s,bg:`background:${j.t};color:${j.c}`};}
  if(b.kind==='away')return {name:AM[b.k].name,time:'Away · no hours',icon:P[b.k],tile:'#5f6563',bg:'background:#eef1f0'};
  return {name:'Eraser',time:'Clears a day',icon:P.erase,tile:'#1a211e',bg:'background:#eef1f0'};
}
function paletteParts(iconsOnly){
  const b=S.brush;
  const jobs=JOBS.map(j=>{
    const on=b.kind==='job'&&b.k===j.k;
    if(iconsOnly)return `<button class="sl-br-i${on?' sl-on':''}" style="background:${j.s}" ${dA('b-job',null,null,j.k)} aria-label="${j.name}">${ico(P[j.k])}</button>`;
    return `<button class="sl-br" style="${on?`border-color:${j.s};background:${j.t};box-shadow:0 0 0 1.5px ${j.s}`:''}" ${dA('b-job',null,null,j.k)}>${tile(j,26)}${j.name}</button>`;
  }).join('');
  const hours=HOURS.map(h=>`<button class="sl-hc${b.kind==='job'&&b.time===h?' sl-on':''}${b.kind!=='job'?' sl-dim':''}" ${dA('b-hrs',null,null,h)}>${h}</button>`).join('');
  const aways=AWAY.map(a=>`<button class="sl-ac${b.kind==='away'&&b.k===a.k?' sl-on':''}" ${dA('b-away',null,null,a.k)} title="${a.name}">${ico(P[a.k])}${iconsOnly?'':a.name}</button>`).join('')
    +`<button class="sl-ac sl-erase${b.kind==='erase'?' sl-on':''}" ${dA('b-erase')} title="Eraser">${ico(P.erase)}${iconsOnly?'':'Eraser'}</button>`;
  const bi=brushInfo();
  const now=`<div class="sl-now" style="${bi.bg}"><span class="sl-tile" style="background:${bi.tile};width:44px;height:44px">${ico(bi.icon)}</span><div><div class="sl-nowname">${bi.name}</div><div class="sl-nowtime">${bi.time}</div></div></div>`;
  return {jobs,hours,aways,now};
}
function paintCell(code,p,d,compact){
  const v=parse(code);
  if(v.kind==='job')return `<button class="sl-pc" style="background:${v.job.s}" ${dA('paint',p,d)} aria-label="${PEOPLE[p].name} ${DAYS[d][0]}">${ico(P[v.job.k])}${compact?'':`<span>${v.time}</span>`}</button>`;
  if(v.kind==='away')return `<button class="sl-pc sl-away" ${dA('paint',p,d)}>${ico(P[v.a.k])}${compact?'':`<span>${v.a.name}</span>`}</button>`;
  return `<button class="sl-pc sl-pc-empty" ${dA('paint',p,d)} aria-label="${PEOPLE[p].name} ${DAYS[d][0]}"></button>`;
}
function look2(){
  const pp=paletteParts(phone());
  if(phone()){
    let g=`<div class="sl-pgrid sl-pgrid-hd"><span></span>${DAYS.map((d,i)=>`<span class="sl-pdh${i===0?' sl-today':''}"><b>${d[0]}</b>${d[1]}</span>`).join('')}</div><div class="sl-pgrid">`;
    CREWS.forEach(([cn,ppl])=>{
      g+=`<div class="sl-pband sl-span">${cn}</div>`;
      ppl.forEach(([id,name])=>{g+=`<div class="sl-pwho">${av(id,26)}${name}</div>${S.sched[id].map((c,d)=>paintCell(c,id,d,true)).join('')}`;});
    });
    g+=`</div><div style="height:250px"></div>`;
    return `<div class="sl-bar-top"><span class="sl-muted">Tap days to paint</span><span class="sl-grow"></span><button class="sl-btn" ${dA('undo')}>${ico(P.undo)}Undo</button></div>${g}
      <div class="sl-palette-fixed">${pp.now}<div class="sl-hscroll">${pp.jobs}</div><div class="sl-hscroll">${pp.hours}</div><div class="sl-hscroll">${pp.aways}</div></div>`;
  }
  let g=gridHead(' style="text-align:center"');
  CREWS.forEach(([cn,ppl])=>{
    g+=`<div class="sl-band">${cn} · ${ppl.length}</div>`;
    ppl.forEach(([id,name])=>{
      g+=`<div class="sl-row"><div class="sl-who"><button class="sl-whob" ${dA('fillrow',id)} title="Paint all week">${av(id)}<div><div class="sl-nm">${name}</div><div class="sl-hr">${hoursOf(S.sched[id])}h this week</div></div><span class="sl-fill">${ico(P.arrow)}</span></button></div>${S.sched[id].map((c,d)=>`<div class="sl-c${d===0?' sl-today':''}">${paintCell(c,id,d,false)}</div>`).join('')}</div>`;
    });
  });
  g+=totalsRow();
  return `<div class="sl-bar-top">${weekNav()}<span class="sl-pill">This week</span><span class="sl-grow"></span><span class="sl-saved">${ico(P.check)}Saved</span><button class="sl-btn" ${dA('undo')}>${ico(P.undo)}Undo</button><button class="sl-btn">${ico(P.copy)}Copy last week</button></div>
    <div class="sl-palette sl-card">${pp.now}
      <div class="sl-pg" style="flex:3 1 520px">${lab('Job')}<div class="sl-brushes">${pp.jobs}</div></div>
      <div class="sl-pg" style="flex:1 1 260px">${lab('Hours')}<div class="sl-hgrid">${pp.hours}<button class="sl-hc">Other…</button></div></div>
      <div class="sl-pg" style="flex:1 1 330px">${lab('Away')}<div class="sl-hgrid">${pp.aways}</div></div>
    </div>
    <div class="sl-card sl-scrollx sl-nosel"><div class="sl-grid">${g}</div></div>`;
}

// ── 3 · Job board ──
function freeOn(d){return ORDER.filter(id=>!S.sched[id][d]).length;}
function chip(id,d,v){
  if(v.kind==='away')return `<button class="sl-chip sl-away" ${dA('rm',id,d)} aria-label="Take ${PEOPLE[id].name} off">${av(id,30)}${PEOPLE[id].name}${ico(P[v.a.k])}</button>`;
  return `<button class="sl-chip" style="background:${v.job.t};color:${v.job.c}" ${dA('rm',id,d)} aria-label="Take ${PEOPLE[id].name} off">${av(id,30)}${PEOPLE[id].name}<span class="sl-chipt">${v.time}</span></button>`;
}
function addBtn(d,code){
  const n=S.selP?PEOPLE[S.selP].name:'';
  return `<button class="sl-add${S.selP?' sl-ready':''}" ${dA('place',null,d,code)} aria-label="${S.selP?'Put '+n+' here':'Pick someone first'}">${ico(P.plus)}${n}</button>`;
}
function boardRows(){
  const rows=JOBS.map(j=>({j,name:j.name,tile:tile(j,36),code:j.k+'|'+j.d,match:v=>v.kind==='job'&&v.job.k===j.k}));
  rows.push({j:null,name:'Away',tile:`<span class="sl-tile" style="background:#5f6563;width:36px;height:36px">${ico(P.off)}</span>`,code:'off',match:v=>v.kind==='away'});
  return rows;
}
function trayPeople(compact){
  return ORDER.map(id=>{
    const on=S.selP===id,hr=hoursOf(S.sched[id]);
    if(compact)return `<button class="sl-tp${on?' sl-on':''}${!S.sched[id][S.day]?' sl-free':''}" ${dA('selp',id)}>${av(id,42)}<span class="sl-tpn">${PEOPLE[id].name}</span><span class="sl-muted sl-small">${hr}h</span></button>`;
    const dots=S.sched[id].map(c=>{const v=parse(c);return v.kind==='job'?`<span class="sl-dot" style="background:${v.job.s}"></span>`:`<span class="sl-dot sl-dot-${v.kind}"></span>`;}).join('');
    return `<button class="sl-pp${on?' sl-on':''}" ${dA('selp',id)}>${av(id)}<div><div class="sl-nm">${PEOPLE[id].name}</div><div class="sl-muted sl-small">${hr}h</div></div><span class="sl-dots">${dots}</span></button>`;
  });
}
function look3(){
  const rows=boardRows();
  if(phone()){
    let h=dayStrip(i=>{const f=freeOn(i);return `<span class="sl-free${f?'':' sl-none'}">${f?f+' free':'All set'}</span>`;});
    rows.forEach(r=>{
      const chips=ORDER.filter(id=>r.match(parse(S.sched[id][S.day]))).map(id=>chip(id,S.day,parse(S.sched[id][S.day])));
      h+=`<div class="sl-sec sl-card"><div class="sl-sech">${r.tile}<b class="sl-grow">${r.name}</b><span class="sl-muted">${chips.length||''}</span></div><div class="sl-wrap">${chips.join('')}${addBtn(S.day,r.code)}</div></div>`;
    });
    const f=freeOn(S.day);
    h+=`<div style="height:130px"></div><div class="sl-tray-fixed"><div class="sl-trl"><span>Team</span><span>${f?f+' free · orange ring':'Everyone placed'}</span></div><div class="sl-hscroll sl-pad">${trayPeople(true).join('')}</div></div>`;
    return h;
  }
  let g=`<div class="sl-brow"><div class="sl-hd" style="padding-left:16px">Job</div>${DAYS.map((d,i)=>{const f=freeOn(i);return `<div class="sl-hd${i===0?' sl-today':''}"><span><b>${d[0]}</b> Oct ${d[1]}</span><span class="sl-free${f?'':' sl-none'}">${f?f+' free':'All set'}</span></div>`;}).join('')}</div>`;
  rows.forEach(r=>{
    let shifts=0;
    const slots=DAYS.map((_,d)=>{
      const ids=ORDER.filter(id=>r.match(parse(S.sched[id][d])));shifts+=ids.length;
      return `<div class="sl-slot${d===0?' sl-today':''}">${ids.map(id=>chip(id,d,parse(S.sched[id][d]))).join('')}${addBtn(d,r.code)}</div>`;
    }).join('');
    g+=`<div class="sl-brow"><div class="sl-job">${r.tile}<div><div class="sl-nm"><b>${r.name}</b></div><div class="sl-muted sl-small">${r.j?shifts+' shifts':'Vacation, sick, day off'}</div></div></div>${slots}</div>`;
  });
  let tray='';
  CREWS.forEach(([cn,ppl])=>{tray+=lab(cn)+trayPeople(false).filter((_,i)=>ppl.some(p=>p[0]===ORDER[i])).join('');});
  return `<div class="sl-bar-top">${weekNav()}<span class="sl-pill">This week</span><div class="sl-seg"><button class="sl-on">By job</button><button>By person</button></div><span class="sl-grow"></span><span class="sl-saved">${ico(P.check)}Saved</span></div>
    <div class="sl-main"><div class="sl-card sl-scrollx sl-grow2"><div class="sl-grid">${g}</div></div><div class="sl-tray sl-card"><div class="sl-trh"><b>Team</b><span class="sl-muted">${onCount(0)} on today</span></div>${tray}</div></div>`;
}

// ── 4 · Day timeline ──
function toH(x){const p=x.split(':');return Number(p[0])+(p[1]?Number(p[1])/60:0);}
function span(time){const p=time.split('–');let a=toH(p[0]),b=toH(p[1]);if(a<6)a+=12;if(b<=a)b+=12;return [a,b];}
function pos(a,b){return `left:calc(${(a-6)/14*100}% + 2px);width:calc(${(b-a)/14*100}% - 4px)`;}
function mix(d){
  const counts={};ORDER.forEach(id=>{const v=parse(S.sched[id][d]);if(v.kind==='job')counts[v.job.k]=(counts[v.job.k]||0)+1;});
  return `<span class="sl-mix">${JOBS.filter(j=>counts[j.k]).map(j=>`<i style="background:${j.s};flex:${counts[j.k]}"></i>`).join('')}</span>`;
}
function track(id){
  const v=parse(S.sched[id][S.day]),on=S.sel&&S.sel.p===id;
  let inner;
  if(v.kind==='job'){const [a,b]=span(v.time);inner=`<button class="sl-tbar${on?' sl-on':''}" style="${pos(a,b)};background:${v.job.s}" ${dA('sel4',id)}>${ico(P[v.job.k])}${v.time}<span class="sl-tbn">${phone()?'':v.job.name}</span></button>`;}
  else if(v.kind==='away')inner=`<button class="sl-tbar sl-away${on?' sl-on':''}" style="left:3px;right:3px" ${dA('sel4',id)}>${ico(P[v.a.k])}${v.a.name}</button>`;
  else{const u=parse(usualOf(id)),[a,b]=span(u.time);inner=`<button class="sl-tadd" style="${pos(a,b)}" ${dA('add4',id)}>+ ${phone()?u.time:u.job.name+' '+u.time}</button>`;}
  const now=S.day===0?`<span class="sl-now-line" style="left:${(10+40/60-6)/14*100}%"></span>`:'';
  return `<div class="sl-track">${inner}${now}</div>`;
}
function dock(){
  if(!S.sel)return '';
  const e=editor('icons'),p=S.sel.p;
  return `<div class="sl-dock"><div class="sl-dockw">${av(p,36)}<div><div class="sl-pname">${PEOPLE[p].name}</div><div class="sl-dockd">${dayLabel(S.sel.d)}</div></div></div>
    <div class="sl-hscroll">${e.jobs}</div><div class="sl-hscroll">${e.hours}</div><div class="sl-hscroll">${e.aways}</div>
    <button class="sl-dockx" ${dA('unsel')} aria-label="Done">${ico(P.check)}</button></div>`;
}
function look4(){
  if(phone()){
    let h=dayStrip(i=>mix(i))+`<div class="sl-axis">${['6a','8a','10a','12p','2p','4p','6p'].map(t=>`<span>${t}</span>`).join('')}</div>`;
    CREWS.forEach(([cn,ppl])=>{
      h+=`<div class="sl-pband">${cn}</div>`;
      ppl.forEach(([id,name])=>{h+=`<div class="sl-trow"><div class="sl-tname">${av(id,20)}${name}</div>${track(id)}</div>`;});
    });
    return h+`<div style="height:${S.sel?260:20}px"></div>${S.sel?`<div class="sl-dock-fixed">${dock()}</div>`:''}`;
  }
  const tabs=`<div class="sl-ttabs">${DAYS.map((d,i)=>`<button class="sl-ttab${i===S.day?' sl-on':''}" ${dA('day',null,i)}><span><b>${d[0]}</b> <span class="sl-muted">Oct ${d[1]}</span></span>${mix(i)}<b class="sl-green">${onCount(i)} on</b></button>`).join('')}</div>`;
  let g=`<div class="sl-trowd sl-hdrow"><div class="sl-hd" style="padding-left:16px">Team</div><div class="sl-hours">${['6a','7a','8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p'].map(t=>`<span>${t}</span>`).join('')}</div></div>`;
  CREWS.forEach(([cn,ppl])=>{
    g+=`<div class="sl-band">${cn}</div>`;
    ppl.forEach(([id,name])=>{g+=`<div class="sl-trowd"><div class="sl-who">${av(id,32)}<span class="sl-nm">${name}</span></div>${track(id)}</div>`;});
  });
  return `<div class="sl-bar-top">${weekNav()}<span class="sl-grow"></span><span class="sl-saved">${ico(P.check)}Saved</span><button class="sl-btn">${ico(P.copy)}Copy last week</button></div>
    ${tabs}<div class="sl-card sl-scrollx"><div class="sl-grid" style="min-width:900px">${g}</div></div>${S.sel?`<div class="sl-dock-sticky">${dock()}</div>`:''}`;
}

// ── 5 · Usual week + changes ──
function changes(){
  const out=[];
  ORDER.forEach(id=>S.sched[id].forEach((code,d)=>{if(code!==S.usual[id][d])out.push({id,d,code});}));
  return out;
}
function tileOf(code,ghost){
  const v=parse(code);
  if(v.kind==='job')return `<span class="sl-tile${ghost?' sl-ghost':''}" style="background:${v.job.s};width:30px;height:30px">${ico(P[v.job.k])}</span>`;
  if(v.kind==='away')return `<span class="sl-tile sl-hatch" style="width:30px;height:30px">${ico(P[v.a.k])}</span>`;
  return `<span class="sl-tile sl-tnone" style="width:30px;height:30px">${ico(P.x)}</span>`;
}
function cell5(id,d){
  const isWeek=S.mode==='week',code=(isWeek?S.sched:S.usual)[id][d],base=S.usual[id][d],v=parse(code);
  const changed=isWeek&&code!==base,on=S.sel&&S.sel.p===id&&S.sel.d===d;
  const dot=changed?'<i class="sl-cdot"></i>':'';
  const cls=`sl-cell${on?' sl-on':''}`;
  if(v.kind==='job')return changed
    ?`<button class="${cls} sl-changed" style="background:${v.job.s}" ${dA('sel',id,d)}>${ico(P[v.job.k])}<span>${v.time}</span>${dot}</button>`
    :`<button class="${cls}" style="background:${v.job.t};color:${v.job.c}" ${dA('sel',id,d)}>${ico(P[v.job.k])}<span>${v.time}</span></button>`;
  if(v.kind==='away')return `<button class="${cls} sl-away" ${dA('sel',id,d)}>${ico(P[v.a.k])}<span>${v.a.name}</span>${dot}</button>`;
  if(changed)return `<button class="${cls} sl-gone" ${dA('sel',id,d)}>${ico(P.x)}<span>Not this week</span>${dot}</button>`;
  return `<button class="${cls} sl-empty" ${dA('sel',id,d)} aria-label="Add">${ico(P.plus)}</button>`;
}
function modeSeg(){
  return `<div class="sl-seg sl-seg-big"><button class="${S.mode==='week'?'sl-on':''}" ${dA('mode',null,null,'week')}>This week</button><button class="${S.mode==='usual'?'sl-on':''}" ${dA('mode',null,null,'usual')}>${ico(P.repeat)}Usual week</button></div>`;
}
function look5(){
  const ch=changes();
  if(phone()){
    let h=modeSeg();
    if(S.mode==='week'){
      h+=`<div class="sl-count"><b>${ch.length}</b><span>changes from<br>the usual week</span></div><div class="sl-card sl-list">`;
      ch.forEach(c=>{
        const v=parse(c.code),what=v.kind==='job'?v.job.name+' '+v.time:v.kind==='away'?v.a.name:'Not working';
        h+=`<div class="sl-chg">${av(c.id,36)}<div class="sl-grow"><div class="sl-nm"><b>${PEOPLE[c.id].name}</b></div><div class="sl-muted sl-small">${DAYS[c.d][2]} · ${what}</div></div>${tileOf(S.usual[c.id][c.d],true)}<span class="sl-muted">${ico(P.arrow)}</span>${tileOf(c.code)}<button class="sl-undo" ${dA('reset5',c.id,c.d)} aria-label="Back to usual">${ico(P.undo)}</button></div>`;
      });
      const changed=new Set(ch.map(c=>c.id)),rest=ORDER.filter(id=>!changed.has(id));
      h+=`</div><div class="sl-card sl-rest"><span class="sl-stack">${rest.slice(0,7).map(id=>av(id,30)).join('')}</span><span class="sl-muted">${rest.length} others on their usual week</span></div>`;
    } else {
      h+=`<div class="sl-note">${ico(P.repeat)}Set once. Every new week starts like this.</div><div class="sl-card sl-list"><div class="sl-urow sl-urow-hd"><span></span>${['M','T','W','T','F'].map(x=>`<span>${x}</span>`).join('')}</div>`;
      ORDER.forEach(id=>{
        h+=`<div class="sl-urow"><span class="sl-uname">${av(id,28)}${PEOPLE[id].name}</span>${S.usual[id].map((c,d)=>{const v=parse(c);return v.kind==='job'?`<button class="sl-sq" style="background:${v.job.s}" ${dA('utap',id,d)}>${ico(P[v.job.k])}</button>`:`<button class="sl-sq sl-pc-empty" ${dA('utap',id,d)} aria-label="Add"></button>`;}).join('')}</div>`;
      });
      h+='</div>';
    }
    return h;
  }
  let banner;
  if(S.mode==='week'){
    banner=`<div class="sl-banner sl-card"><div class="sl-bigcount"><b>${ch.length}</b><span>changes<br>from usual</span></div>${ch.map(c=>{const v=parse(c.code);const t=v.kind==='job'?`<span class="sl-tile" style="background:${v.job.s};width:22px;height:22px">${ico(P[v.job.k])}</span>`:v.kind==='away'?`<span class="sl-tile sl-hatch" style="width:22px;height:22px">${ico(P[v.a.k])}</span>`:`<span class="sl-tile sl-tnone" style="width:22px;height:22px">${ico(P.x)}</span>`;return `<button class="sl-chgchip" ${dA('sel',c.id,c.d)}>${av(c.id,30)}${PEOPLE[c.id].name} <span class="sl-muted">${DAYS[c.d][0]}</span>${t}</button>`;}).join('')}</div>
      <div class="sl-key"><span><i class="sl-sw" style="background:#dbeafe"></i>Usual</span><span><i class="sl-sw" style="background:#2563eb"><i class="sl-cdot"></i></i>Changed</span><span><i class="sl-sw sl-hatch"><i class="sl-cdot"></i></i>Away</span><span><i class="sl-sw sl-sw-dash"><i class="sl-cdot"></i></i>Not in this week</span></div>`;
  } else {
    banner=`<div class="sl-banner sl-card sl-blue">${ico(P.repeat)}Set it once. Every new week starts like this.</div>`;
  }
  let g=`<div class="sl-row sl-hdrow"><div class="sl-hd" style="padding-left:16px">Team</div>${DAYS.map(d=>`<div class="sl-hd"><b>${d[0]}</b>${S.mode==='week'?'Oct '+d[1]:'every week'}</div>`).join('')}</div>`;
  CREWS.forEach(([cn,ppl])=>{
    g+=`<div class="sl-band">${cn}</div>`;
    ppl.forEach(([id,name])=>{g+=`<div class="sl-row"><div class="sl-who">${av(id,32)}<span class="sl-nm">${name}</span></div>${DAYS.map((_,d)=>`<div class="sl-c">${cell5(id,d)}</div>`).join('')}</div>`;});
  });
  let strip='';
  if(S.sel){
    const e=editor('icons'),p=S.sel.p,d=S.sel.d,same=S.sched[p][d]===S.usual[p][d];
    strip=`<div class="sl-strip"><div class="sl-ph">${av(p,40)}<div><div class="sl-pname">${PEOPLE[p].name}</div><div class="sl-muted sl-small">${S.mode==='week'?dayLabel(d):'Every '+DAYS[d][2]}</div></div></div>
      ${S.mode==='week'?`<button class="sl-reset${same?' sl-dim':''}" ${dA('ed-reset')}>${ico(P.undo)}Back to usual</button>`:''}
      <span class="sl-sep"></span><div class="sl-wrap">${e.jobs}</div><span class="sl-sep"></span><div class="sl-wrap">${e.hours}</div><span class="sl-sep"></span><div class="sl-wrap">${e.aways}</div>
      <button class="sl-x" style="margin-left:auto" ${dA('unsel')} aria-label="Close">${ico(P.x)}</button></div>`;
  }
  return `<div class="sl-bar-top">${modeSeg()}${S.mode==='week'?weekNav():''}<span class="sl-grow"></span><span class="sl-saved">${ico(P.check)}Saved</span></div>
    ${banner}<div class="sl-card sl-scrollx"><div class="sl-grid">${g}</div></div>${strip?`<div class="sl-dock-sticky">${strip}</div>`:''}`;
}

// ── 6 · Person cards (one layout for every width) ──
function look6(){
  const filters=['All'].concat(CREWS.map(c=>c[0])).map(f=>`<button class="sl-f${S.crew===f?' sl-on':''}" ${dA('crew',null,null,f)}>${f}</button>`).join('');
  const circ=2*Math.PI*19;
  let cards='';
  CREWS.forEach(([cn,ppl])=>{
    if(S.crew!=='All'&&S.crew!==cn)return;
    cards+=`<div class="sl-crewh">${cn}</div>`;
    ppl.forEach(([id,name])=>{
      const u=parse(usualOf(id)),hr=hoursOf(S.sched[id]),ring=hr>=40?'#16a34a':hr>=24?'#ca8a04':'#cbcfcd';
      const dash=(Math.min(1,hr/45)*circ).toFixed(1)+' '+circ.toFixed(1);
      const days=S.sched[id].map((code,d)=>{
        const v=parse(code),today=d===0?' sl-today':'';
        if(v.kind==='job')return `<button class="sl-day${today}" style="background:${v.job.s}" ${dA('tap6',id,d)} aria-label="${name} ${DAYS[d][0]}">${ico(P[v.job.k])}<span>${v.time}</span></button>`;
        if(v.kind==='away')return `<button class="sl-day sl-away${today}" ${dA('tap6',id,d)}>${ico(P[v.a.k])}<span>${v.a.name}</span></button>`;
        return `<button class="sl-day sl-day-empty${today}" ${dA('tap6',id,d)} aria-label="${name} ${DAYS[d][0]}">+</button>`;
      }).join('');
      cards+=`<div class="sl-pcard sl-card"><div class="sl-ph">${av(id,44)}<div class="sl-grow"><div class="sl-pname">${name}</div><div class="sl-muted sl-small sl-usual"><span class="sl-tile" style="background:${u.job.s};width:20px;height:20px">${ico(P[u.job.k])}</span>${u.job.name} · ${u.time}</div></div>
        <span class="sl-ring"><svg viewBox="0 0 46 46" width="46" height="46" aria-hidden="true"><circle cx="23" cy="23" r="19" fill="none" stroke="#eef1f0" stroke-width="5"/><circle cx="23" cy="23" r="19" fill="none" stroke="${ring}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${dash}" transform="rotate(-90 23 23)"/></svg><b>${hr}h</b></span></div>
        <div class="sl-week">${DAYS.map((d,i)=>`<span class="sl-dl${i===0?' sl-today':''}">${d[0]}</span>`).join('')}${days}</div></div>`;
    });
  });
  const how=`<span class="sl-how">Tap a day <span class="sl-tile" style="background:#16a34a;width:20px;height:20px">${ico(P.cut)}</span>→<span class="sl-tile sl-hatch" style="width:20px;height:20px">${ico(P.off)}</span>→<span class="sl-tile sl-tnone" style="width:20px;height:20px"></span></span>`;
  return `<div class="sl-bar-top">${weekNav()}<span class="sl-pill">This week</span><span class="sl-grow"></span><span class="sl-saved">${ico(P.check)}Saved</span>${phone()?'':`<button class="sl-btn">${ico(P.copy)}Copy last week</button>`}</div>
    <div class="sl-bar-top"><div class="sl-hscroll">${filters}</div>${phone()?'':'<span class="sl-grow"></span>'}${how}</div>
    <div class="sl-cards">${cards}</div>`;
}

const RENDER=[look1,look2,look3,look4,look5,look6];

// ── actions ──
function act(a,p,d,k){
  const t=editTarget();
  switch(a){
    case 'look': S.look=Number(k); S.sel=S.look===6||S.look===2||S.look===3?null:S.sel; break;
    case 'close': close(); return;
    case 'pick': savePick(); return;
    case 'sel': S.sel={p,d}; break;
    case 'selday': S.sel={p,d:S.day}; break;
    case 'sel4': S.sel={p,d:S.day}; break;
    case 'unsel': S.sel=null; break;
    case 'day': S.day=d; S.sel=null; break;
    case 'ed-job': {const v=parse(t[S.sel.p][S.sel.d]),j=JM[k];t[S.sel.p][S.sel.d]=k+'|'+(v.kind==='job'?v.time:j.d);break;}
    case 'ed-hrs': {const v=parse(t[S.sel.p][S.sel.d]);if(v.kind!=='job')return;t[S.sel.p][S.sel.d]=v.job.k+'|'+k;break;}
    case 'ed-away': t[S.sel.p][S.sel.d]=(S.look===5&&S.mode==='usual')?'':k; break;
    case 'ed-clear': t[S.sel.p][S.sel.d]=''; break;
    case 'ed-reset': S.sched[S.sel.p][S.sel.d]=S.usual[S.sel.p][S.sel.d]; break;
    case 'b-job': S.brush={kind:'job',k,time:S.brush.kind==='job'?S.brush.time:JM[k].d}; break;
    case 'b-hrs': if(S.brush.kind!=='job')return; S.brush={...S.brush,time:k}; break;
    case 'b-away': S.brush={kind:'away',k}; break;
    case 'b-erase': S.brush={kind:'erase'}; break;
    case 'undo': {const prev=S.hist.pop();if(!prev)return;S.sched=prev;break;}
    case 'fillrow': {S.hist.push(clone(S.sched));const c=brushCode();S.sched[p]=[c,c,c,c,c];break;}
    case 'selp': S.selP=S.selP===p?null:p; break;
    case 'place': if(!S.selP)return; S.sched[S.selP][d]=k; break;
    case 'rm': S.sched[p][d]=''; break;
    case 'add4': S.sched[p][S.day]=usualOf(p); S.sel={p,d:S.day}; break;
    case 'mode': S.mode=k; S.sel=null; break;
    case 'reset5': S.sched[p][d]=S.usual[p][d]; break;
    case 'utap': {const v=parse(S.usual[p][d]);S.usual[p][d]=v.kind==='job'?'':usualOf(p);break;}
    case 'tap6': {const v=parse(S.sched[p][d]);S.sched[p][d]=v.kind==='job'?'off':v.kind==='away'?'':usualOf(p);break;}
    case 'crew': S.crew=k; break;
    default: return;
  }
  render();
}
function brushCode(){const b=S.brush;return b.kind==='job'?b.k+'|'+b.time:b.kind==='away'?b.k:'';}
function paint(p,d){
  const c=brushCode();
  if(S.sched[p][d]===c)return;
  S.sched[p][d]=c;
  render();
}

// ── picks ──
function myName(){
  if(!window.currentUser)return '';
  return currentUser.displayName||(currentUser.email||'').split('@')[0];
}
async function loadPicks(){
  const rows=await JWG.sbF('GET',`jwg_app_settings?select=value&key=eq.${PICK_KEY}`);
  S.picks=rows.length?rows[0].value:{};
}
async function savePick(){
  const me=myName();
  if(!me)throw new Error('Schedule looks: no signed-in user to save the pick under');
  try{
    await loadPicks();
    S.picks[me]={look:S.look,at:new Date().toISOString()};
    await JWG.sbF('POST','jwg_app_settings?on_conflict=key',{key:PICK_KEY,value:S.picks,updated_at:new Date().toISOString()});
    render();
    JWG.toast(`Saved: you picked ${S.look} · ${LOOKS[S.look-1]}`);
  }catch(e){
    console.error('[schedule looks] pick save failed',e);
    JWG.toast('Could not save your pick — try again','error');
  }
}

// ── open / close / render ──
let wasPhone=null;
function el(){
  const m=document.getElementById('looks-modal');
  if(!m)throw new Error('Schedule looks: #looks-modal is missing from index.html');
  return m;
}
function render(){
  const box=el().querySelector('.sl-modal');
  wasPhone=phone();
  box.innerHTML=shell(RENDER[S.look-1]());
}
function open(){
  S=fresh(S?S.look:1);
  render();
  el().classList.add('open');
  loadPicks().then(render).catch(e=>console.error('[schedule looks] loading picks failed',e));
}
function close(){el().classList.remove('open');}

function wire(){
  const m=el();
  m.addEventListener('click',e=>{
    const b=e.target.closest('[data-a]');
    if(!b||b.dataset.a==='paint')return;
    act(b.dataset.a,b.dataset.p,b.dataset.d!==undefined?Number(b.dataset.d):null,b.dataset.k);
  });
  m.addEventListener('mousedown',e=>{
    const b=e.target.closest('[data-a="paint"]');
    if(!b)return;
    e.preventDefault();
    S.hist.push(clone(S.sched));
    S.painting=true;
    paint(b.dataset.p,Number(b.dataset.d));
  });
  m.addEventListener('mouseover',e=>{
    if(!S||!S.painting)return;
    const b=e.target.closest('[data-a="paint"]');
    if(b)paint(b.dataset.p,Number(b.dataset.d));
  });
  document.addEventListener('mouseup',()=>{if(S)S.painting=false;});
  window.addEventListener('resize',()=>{if(S&&m.classList.contains('open')&&phone()!==wasPhone)render();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();

window.ScheduleLooks={open,close};
})();
