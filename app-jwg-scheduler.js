/* app-jwg-scheduler.js -- JWG Staff Scheduler. Edited directly (the old
   build_jwg_js.py bundler and its source files are retired). */
(function(){
/* ===== config.js ===== */
// ── CONFIG.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

const SUPABASE_URL=window.SUPABASE_URL,SUPABASE_ANON_KEY=window.SUPABASE_KEY;
const DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const WEEKDAYS=["Monday","Tuesday","Wednesday","Thursday","Friday"];
const WEEKEND=["Saturday","Sunday"];

// Work hours – default 7am–5pm
let WH=JSON.parse(localStorage.getItem("ss_wh")||"null")||{start:7,end:17};

// ── APP SETTINGS (Supabase-backed) ──
async function saveSetting(key,value){
  localStorage.setItem("ss_"+key,JSON.stringify(value));
  try{await sbF("POST","jwg_app_settings?on_conflict=key",{key,value,updated_at:new Date().toISOString()});}catch(e){console.warn("Setting save failed:",e);}
}
async function loadSettings(){
  try{
    const rows=await sbF("GET","jwg_app_settings?select=*");
    if(!Array.isArray(rows))return;
    rows.forEach(row=>{
      if(row.key==="tasks"){
        const t=row.value;
        if(Array.isArray(t)&&t.length){
          // Only override if remote has custom tasks (more than defaults or different labels)
          tasks=t;localStorage.setItem("ss_tasks",JSON.stringify(t));
        }
      } else if(row.key==="wh"){
        WH=row.value;localStorage.setItem("ss_wh",JSON.stringify(WH));
      } else if(row.key==="crew_groups"){
        localStorage.setItem("ss_crew_groups",JSON.stringify(row.value));
      } else if(row.key==="emp_order"){
        localStorage.setItem("ss_emp_order",JSON.stringify(row.value));
      }
    });
  }catch(e){console.warn("Settings load failed:",e);}
}

function saveWH(){localStorage.setItem("ss_wh",JSON.stringify(WH));saveSetting("wh",WH);}

function fmtHour(h,m=0){const ap=h<12?"AM":"PM",hh=h===0?12:h>12?h-12:h;return m===0?`${hh}${ap}`:`${hh}:${String(m).padStart(2,"0")}${ap}`;}
function fmtKey(k){if(!k)return"";const[h,m]=k.split(":").map(Number);return fmtHour(h,m);}
function fmtRange(s,e){return s&&e?`${fmtKey(s)}–${fmtKey(e)}`:""}

function buildTimeOpts(sel){
  let h="";
  for(let hr=WH.start;hr<WH.end;hr++){
    const k0=`${hr}:00`,k30=`${hr}:30`;
    h+=`<option value="${k0}"${sel===k0?" selected":""}>${fmtHour(hr,0)}</option>`;
    h+=`<option value="${k30}"${sel===k30?" selected":""}>${fmtHour(hr,30)}</option>`;
  }
  const ke=`${WH.end}:00`;
  h+=`<option value="${ke}"${sel===ke?" selected":""}>${fmtHour(WH.end,0)}</option>`;
  return h;
}
function buildHourOpts(sel){let h="";for(let i=0;i<24;i++)h+=`<option value="${i}"${sel===i?" selected":""}>${fmtHour(i,0)}</option>`;return h;}

// Tasks — jobs and time away share ONE list (Jake, 2026-10-20). An away:true type (Day off,
// Sick, No work, Vacation, Office closed, Personal, Appointment) is grey and striped, counts
// no hours, and with no times on it lasts all day. The three built-in away types are fixed;
// every other type is Barb's to rename, recolour or remove.
function taskColours(hex){const[r,g,b]=hex2rgb(hex);return{bg:`rgba(${r},${g},${b},0.12)`,text:darken(hex),dot:hex};}
const AWAY_GREY="#64748b";
const DEFAULT_TASKS=[
  {id:"off",label:"Day off",...taskColours(AWAY_GREY),builtIn:true,away:true},
  {id:"sick",label:"Sick",...taskColours(AWAY_GREY),builtIn:true,away:true},
  {id:"nowork",label:"No work",...taskColours(AWAY_GREY),builtIn:true,away:true},
  {id:"bins",label:"Bins",...taskColours("#0d9488")},
  {id:"junk",label:"Junk Removals",...taskColours("#ea580c")},
  {id:"furniture",label:"Furniture Bank",...taskColours("#dc2626")},
  {id:"garbage",label:"Garbage",...taskColours("#7c3aed")},
  {id:"shop",label:"Shop",...taskColours("#ca8a04")},
];
let tasks=JSON.parse(localStorage.getItem("ss_tasks")||"null")||DEFAULT_TASKS;
const TM=()=>Object.fromEntries(tasks.map(t=>[t.id,t]));
// ── Icon set (handoff "Emboss"): task/status id -> emboss tile. Built-in ids
// (bins/junk/furniture/off/sick/shop) get the 3-D tile; custom tasks & 'garbage'
// fall back to a colour dot. JWGIcons is loaded in index.html BEFORE this file.
function schTile(id,size){
  if(id&&window.JWGIcons&&JWGIcons.PATHS[id]) return JWGIcons.embossTile(id,{size:size||20});
  return "";
}
function schChip(t,size){                 // tile if known, else the legacy colour dot
  var tile=schTile(t&&t.id,size); if(tile) return tile;
  var d=Math.max(7,Math.round((size||20)*0.4));
  return '<span style="width:'+d+'px;height:'+d+'px;border-radius:50%;background:'+((t&&t.dot)||"#ccc")+';display:inline-block;flex-shrink:0"></span>';
}
function saveTasks(){localStorage.setItem("ss_tasks",JSON.stringify(tasks));saveSetting("tasks",tasks);}
function hex2rgb(h){try{return[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];}catch{return[94,106,210];}}
function darken(h){try{const[r,g,b]=hex2rgb(h);return`rgb(${Math.round(r*.55)},${Math.round(g*.55)},${Math.round(b*.55)})`;}catch{return h;}}

const AVC=[
  ["#15803d","#fff"],["#1d4ed8","#fff"],["#7c3aed","#fff"],
  ["#dc2626","#fff"],["#a16207","#fff"],["#0369a1","#fff"],
  ["#c2410c","#fff"],["#0f766e","#fff"]
];
// Person avatar colour: prefer each person's MASTER colour (crew_members, shared
// across the whole app via teamColorByName) so the same person is the same colour
// everywhere; fall back to the local name-hash palette if the master isn't loaded.
const ac=n=>{
  if(typeof teamColorByName==="function"){
    const col=teamColorByName(n||"");
    if(col) return [col, (typeof teamInk==="function"?teamInk(col):"#fff")];
  }
  const s=n||"?";const h=([...s]).reduce((a,c)=>a+c.charCodeAt(0),0);return AVC[h%AVC.length];
};
function empInitials(name){if(window.crewAvatarInitials)return crewAvatarInitials(name);const p=(name||"?").trim().split(/\s+/);if(p.length>=2)return(p[0][0]+p[1][0]).toUpperCase();if(name.length>=2)return(name[0]+name[1]).toUpperCase();return name[0].toUpperCase();}
function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML;}

/* ===== state.js ===== */
// ── STATE.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

function defSched(){const s={};DAYS.forEach(d=>{s[d]={status:"off",shifts:[]};});return s;}
// The built-in away types count as away even before the saved task list has caught up.
const AWAY_BUILTIN=["off","sick","nowork"];
function taskOf(id){return TM()[id]||DEFAULT_TASKS.find(t=>t.id===id)||null;}
function taskLabel(id){const t=taskOf(id);return t?t.label:String(id);}
function isAwayTask(id){if(AWAY_BUILTIN.includes(id))return true;const t=TM()[id];return!!(t&&t.away);}
function shiftIsAway(sh){const ids=getShiftTasks(sh);return ids.length>0&&ids.every(isAwayTask);}
function awayTypes(){return[...AWAY_BUILTIN.map(taskOf),...tasks.filter(t=>t.away&&!AWAY_BUILTIN.includes(t.id))];}
function jobTypes(){return tasks.filter(t=>!isAwayTask(t.id));}
// The one place a day's status is decided: "work" when a job is on it, "away" when it only
// holds time away, "off" when empty. Before 2026-10-20 time away was a STATUS of its own
// (dayoff / sick / nonworking, no shifts); a day still saved that way reads as the away
// entry it is now. The office TV counts "work" days, so away days must never say "work".
function normDay(v){
  if(!v)return{status:"off",shifts:[]};
  let shifts=Array.isArray(v.shifts)?v.shifts:[];
  const legacy={dayoff:"off",sick:"sick",nonworking:"nowork"}[v.status];
  if(legacy&&!shifts.length)shifts=[{tasks:[legacy]}];
  const status=!shifts.length?"off":shifts.some(sh=>!shiftIsAway(sh))?"work":"away";
  return{...v,status,shifts};
}
// Migrate old format (single shift object) to new format (status+shifts array)
function migrateSched(s){
  if(!s)return defSched();
  const out={};
  DAYS.forEach(d=>{
    const v=s[d];
    if(!v){out[d]={status:"off",shifts:[]};return;}
    if(v.status!==undefined){out[d]=normDay(v);return;}
    // Old format: {task, start, end}
    if(v.task==="off"||!v.task){out[d]={status:"off",shifts:[]};}
    else if(v.task==="sick"){out[d]=normDay({status:"sick",shifts:[]});}
    else{out[d]=normDay({status:"work",shifts:[{task:v.task,start:v.start,end:v.end}]});}
  });
  return out;
}
function toHrs(k){const[h,m]=k.split(":").map(Number);return h+(m||0)/60;}
// Time away counts no hours, timed or not (Jake: vacation and office closed are not paid).
function shiftHours(sh){return shiftIsAway(sh)||!sh.start||!sh.end?0:toHrs(sh.end)-toHrs(sh.start);}
function dayHours(day){return(day&&day.shifts||[]).reduce((t,sh)=>t+shiftHours(sh),0);}
function countH(s){if(!s)return 0;return Math.round(DAYS.reduce((t,d)=>t+dayHours(s[d]),0)*10)/10;}
function hShort(k){const[h,m]=k.split(":").map(Number);const hh=h>12?h-12:(h===0?12:h);return m?`${hh}:${String(m).padStart(2,"0")}`:`${hh}`;}
function rangeShort(s,e){return s&&e?`${hShort(s)}–${hShort(e)}`:"";}

// ── TYPE ICONS ── one plain glyph per job or away type: white on the job's colour, grey for away.
const GLYPH={
  scissors:"M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12",
  leaf:"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10zM2 21c0-3 1.85-5.36 5.08-6",
  monitor:"M3 4h18v12H3zM8 20h8M12 16v4",
  truck:"M1 4h14v12H1zM15 8h4l3 3v5h-7zM5.5 20.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 20.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  trash:"M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V3h6v3",
  sofa:"M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2zM5 18v2M19 18v2",
  wrench:"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
  mountain:"M3 20l6-10 4 6 3-4 5 8z",
  sun:"M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  thermo:"M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z",
  moon:"M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
  lock:"M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  clock:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  user:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  pause:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM10 9v6M14 9v6",
  snow:"M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9",
  clip:"M9 2h6v4H9zM15 4h3v18H6V4h3M9 12h6M9 16h4",
  people:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  gift:"M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C10 4 6 4 7 7M12 8c2-4 6-4 5-1",
  dot:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"
};
const GLYPH_BY_ID={off:"moon",sick:"thermo",nowork:"pause",bins:"truck",junk:"trash",furniture:"sofa",garbage:"trash",shop:"wrench"};
const GLYPH_BY_WORD=[["cut","scissors"],["mow","scissors"],["garden","leaf"],["office","monitor"],["admin","monitor"],["closed","lock"],
  ["vacation","sun"],["holiday","sun"],["personal","user"],["out of office","user"],["appoint","clock"],["snow","snow"],["salt","snow"],
  ["quote","clip"],["meeting","people"],["training","people"],["landscap","mountain"],["extra","mountain"],["birthday","gift"],
  ["bin","truck"],["junk","trash"],["garbage","trash"],["furniture","sofa"],["shop","wrench"]];
function glyphOf(t){
  if(!t)return GLYPH.dot;
  if(GLYPH_BY_ID[t.id])return GLYPH[GLYPH_BY_ID[t.id]];
  const l=String(t.label||"").toLowerCase();
  const w=GLYPH_BY_WORD.find(([k])=>l.includes(k));
  return GLYPH[w?w[1]:(t.away?"user":"dot")];
}
function typeTile(t,size){
  const bg=t&&isAwayTask(t.id)?AWAY_GREY:((t&&t.dot)||"#94a3b8");
  return`<span class="ty-tile" style="background:${bg};width:${size}px;height:${size}px"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${glyphOf(t)}"/></svg></span>`;
}
function typeIcon(t){return`<svg class="ty-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${glyphOf(t)}"/></svg>`;}

// Default working days: Monday–Saturday
let S={tab:"schedule",weekOffset:0,employees:[],allSchedules:[],schedule:{},activeDays:[...WEEKDAYS,"Saturday"],saving:false,aPeriod:"4w",hFilter:"all",hOpen:{},mView:"week",mDay:null,mPerson:null,sortAlpha:false};

function getWS(off=0){const n=new Date(),d=n.getDay(),r=new Date(n);r.setDate(n.getDate()-d+(d===0?-6:1)+off*7);r.setHours(0,0,0,0);return r;}
// Use local date (Eastern) not UTC – avoids midnight-UTC rollover mismatching week keys
function localDateStr(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function wkey(off){return localDateStr(getWS(off));}
function fmtW(d){const e=new Date(d);e.setDate(e.getDate()+6);const o={month:"short",day:"numeric"};return`${d.toLocaleDateString("en-US",o)} – ${e.toLocaleDateString("en-US",{...o,year:"numeric"})}`;}
function wlbl(o){return o===0?"This Week":o===1?"Next Week":o===-1?"Last Week":`Week ${o>0?"+":""}${o}`;}

/* ===== utils.js ===== */
// ── UTILS.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

async function sbF(m,p,b){
  let token=SUPABASE_ANON_KEY;
  try{const _s=await db.auth.getSession();if(_s&&_s.data&&_s.data.session&&_s.data.session.access_token)token=_s.data.session.access_token;}catch(e){}
  const isUpsert=m==="POST"&&p.includes("on_conflict");
  const prefer=isUpsert?"return=representation,resolution=merge-duplicates":m==="POST"?"return=representation":"";
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${p}`,{method:m,headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(prefer?{Prefer:prefer}:{})},body:b?JSON.stringify(b):undefined});
  if(!r.ok)throw new Error(await r.text());
  return r.status===204?null:r.json();
}
async function loadEmps(){return sbF("GET","jwg_employees?select=*&order=name");}
// The dashboard Team page is the master roster (crew_members). Someone soft-
// removed there (active=false) — or taken off the JWG side — stays in
// jwg_employees so their history keeps rendering, but must stop being offered
// anywhere new (v559, Jake: Beth was still assignable after removal).
async function loadCrewFlags(){try{return await sbF("GET","crew_members?select=jwg_id,active,on_jwg,crew_group,is_manager");}catch(e){return[];}}
function applyCrewFlags(crew){
  const m={};(crew||[]).forEach(c=>{if(c.jwg_id)m[c.jwg_id]=c;});
  S.employees.forEach(e=>{
    const c=m[e.id];
    e.hidden=!!(c&&(c.active===false||c.on_jwg===false));
    // Which crew someone is on rides along with the hidden flag — same master
    // table (crew_members), same cross-read, so the grid groups and the Team page
    // can never disagree about who is where.
    e.group=(c&&c.crew_group)||"";
    e.manager=!!(c&&c.is_manager);
  });
}
// The group ORDER is a setting, not a hardcoded list (Jake, 2026-10-02: official
// group names are coming later, so renaming must not need a deploy). Anyone whose
// group is missing from it — or who has none — falls to the end under "Everyone
// else", which is also what a brand-new hire looks like until someone files them.
const UNGROUPED="Everyone else";
function crewGroupOrder(){
  try{const v=JSON.parse(localStorage.getItem("ss_crew_groups")||"null");if(Array.isArray(v))return v;}catch(e){}
  return [];
}

// ── REPEATING WEEKS ───────────────────────────────────────────────────────
// Someone whose week never changes (the cutting crew) can be set to repeat.
// Their week is then filled in by ONE BUTTON on the grid, writing real shifts.
//
// It was briefly built as a read-only "ghost" overlay instead — dashed shifts
// drawn on blank days, never written. That was wrong for two measured reasons:
// Past schedules and Insights read saved rows, and so does office-tv.html
// (workingTodayCount), so the wall would have under-reported the crew by four
// people every day while the office screen showed them booked. A shift that is
// on screen has to be a shift in the database.
//
// It is still not the v559 auto-seed: nothing happens until someone presses the
// button, and it only ever fills a day that is empty.
function usualDay(emp,day){
  if(!emp||!emp.repeats_weekly||!emp.usual_week)return null;
  const d=emp.usual_week[day];
  return dayHasData(d)?d:null;
}
// How long ago a usual week was stored, in whole months. Null when unknown.
// The repeat deliberately never expires — see usual_week_saved_at in the database
// — but a pattern saved two seasons ago is probably wrong now, so the bar says so.
function usualAgeMonths(emp){
  if(!emp||!emp.usual_week_saved_at)return null;
  const t=Date.parse(emp.usual_week_saved_at);
  if(isNaN(t))return null;
  return Math.floor((Date.now()-t)/(30.44*86400000));
}
const USUAL_STALE_MONTHS=3;
// Does this person's usual week hold anything at all?
function usualDayAny(emp){return DAYS.some(d=>usualDay(emp,d));}
// People set to repeat who still have blank days in the week on screen. Only
// blank days count: a shift, a day off or a sick day already set is not "missing".
function pendingUsual(){
  // Never offer to fill a week that has already happened. Backfilling old weeks
  // would rewrite history and throw off hours and Insights — and the repeat is
  // a plan for work still to come, not a record of work already done.
  if(S.weekOffset<0)return[];
  return visEmps().map(e=>{
    if(!e.repeats_weekly)return null;
    const sc=S.schedule[e.id]||{};
    const days=DAYS.filter(d=>usualDay(e,d)&&!dayHasData(sc[d]));
    return days.length?{emp:e,days:days}:null;
  }).filter(Boolean);
}
// The one button. Writes real shifts into empty days only, for everyone set to
// repeat — so the hours badge, Insights, Past schedules and the office TV all
// see the same week the grid shows.
async function fillWeekFromUsual(){
  const pend=pendingUsual();
  if(!pend.length)return;
  const names=pend.map(x=>x.emp.name);
  const whoStr=names.length<=4?names.join(", "):names.slice(0,3).join(", ")+` and ${names.length-3} more`;
  const dayN=pend.reduce((n,x)=>n+x.days.length,0);
  if(!(await jwgConfirm({
    title:"Fill in this week",
    target:whoStr,
    message:`${dayN} day${dayN===1?"":"s"} will be filled in from their usual week, for ${wlbl(S.weekOffset).toLowerCase()}. Days that already have something on them are left alone.`,
    confirmLabel:`Fill ${dayN} day${dayN===1?"":"s"}`
  })))return;
  let filled=0;
  pend.forEach(({emp,days})=>{
    if(!S.schedule[emp.id])S.schedule[emp.id]=defSched();
    days.forEach(d=>{S.schedule[emp.id][d]=normDay(JSON.parse(JSON.stringify(usualDay(emp,d))));filled++;});
    updBadge(emp.id);
  });
  autoSave(null);
  refreshGrid();
  toast(`Filled ${filled} day${filled===1?"":"s"} for ${pend.length} ${pend.length===1?"person":"people"} — ${wlbl(S.weekOffset)} is set`);
}
function visEmps(){return S.employees.filter(e=>!e.hidden);}
// Does this week's schedule hold anything worth showing for a hidden person?
function dayHasData(dd){return !!(dd&&((dd.status&&dd.status!=="off")||(dd.shifts&&dd.shifts.length)||dd.note));}
function empHasWeekData(sc){if(!sc)return false;return DAYS.some(d=>dayHasData(sc[d]));}
async function loadScheds(){const since=new Date();since.setFullYear(since.getFullYear()-1);return sbF("GET","jwg_schedules?select=*&week_start=gte."+localDateStr(since));}
async function upsertSched(eid,ws,data){const w=localDateStr(ws);return sbF("POST","jwg_schedules?on_conflict=employee_id,week_start",{employee_id:eid,week_start:w,schedule_data:data,updated_at:new Date().toISOString()});}

// ── ROSTER CLEAN-UP — called by the Team page when someone is removed ──
// Going inactive on the Team page used to only HIDE the person here, so their
// booked shifts sat on the grid and the office kept seeing them (Jake, Aug 2026:
// "staff scheduler still has jack on it" — inactive for weeks and still down
// Mon–Fri, with rows out to December). Removal now clears them from today on.
// Everything before today is left exactly as it is: history has to keep
// rendering, badged REMOVED.
function todayDayIdx(){return(new Date().getDay()+6)%7;}   // DAYS is Monday-first; Date#getDay is Sunday-first
// Removal empties today and the rest of the week; the days before today stay put.
function blankFromToday(sc){for(let i=todayDayIdx();i<DAYS.length;i++)sc[DAYS[i]]={status:"off",shifts:[]};return sc;}
// What a removal would wipe, so the Team page can say it out loud beforehand.
async function rosterForwardSummary(empId){
  const cur=wkey(0),from=todayDayIdx();
  const rows=await sbF("GET","jwg_schedules?select=week_start,schedule_data&employee_id=eq."+empId+"&week_start=gte."+cur)||[];
  const who=await sbF("GET","jwg_employees?select=usual_week&id=eq."+empId);
  const weeks=rows.filter(r=>{
    const sc=migrateSched(r.schedule_data);
    return (r.week_start===cur?DAYS.slice(from):DAYS).some(d=>dayHasData(sc[d]));
  }).length;
  return {weeks:weeks,saved:!!(who&&who[0]&&who[0].usual_week)};
}
async function rosterClearForward(empId){
  const cur=wkey(0);
  await sbF("DELETE","jwg_schedules?employee_id=eq."+empId+"&week_start=gt."+cur);
  // This week keeps the days already worked; today and the rest of it go.
  const rows=await sbF("GET","jwg_schedules?select=schedule_data&employee_id=eq."+empId+"&week_start=eq."+cur);
  if(rows&&rows.length)await upsertSched(empId,getWS(0),blankFromToday(migrateSched(rows[0].schedule_data)));
  await sbF("PATCH","jwg_employees?id=eq."+empId,{usual_week:null});
  rosterPruneLocal(empId);
}
// Keep a scheduler already loaded in this tab honest without a reload: forget the
// future weeks and blank this week from today on. Called after the database work
// above, and also straight off the roster event in every OTHER open tab — the
// jwg_schedules delete event carries only the row id, never whose row it was, so
// it can't do this job itself.
function rosterPruneLocal(empId){
  const cur=wkey(0);
  S.allSchedules=S.allSchedules.filter(s=>!(s.employee_id===empId&&s.week_start>cur));
  const held=S.allSchedules.find(s=>s.employee_id===empId&&s.week_start===cur);
  let curData=null;
  if(held){curData=blankFromToday(migrateSched(held.schedule_data));held.schedule_data=curData;}
  const emp=S.employees.find(e=>e.id===empId);
  if(emp)emp.usual_week=null;
  const viewed=wkey(S.weekOffset);
  if(viewed===cur)S.schedule[empId]=curData?JSON.parse(JSON.stringify(curData)):defSched();
  else if(viewed>cur)S.schedule[empId]=defSched();
}

let toastT;
const TOAST_ICONS={success:"✓",error:"✕",info:"ℹ"};
function toast(msg,type="success"){
  const el=document.getElementById("jwg-toast");
  if(!el) return;
  el.className=type+" show";
  el.innerHTML=`<span class="t-icon">${TOAST_ICONS[type]||"✓"}</span><span class="t-msg">${msg}</span><span class="t-close" onclick="JWG.dismissToast()">✕</span>`;
  clearTimeout(toastT);
  // A success can slide away on its own; a failure waits to be dismissed. At the
  // kiosk a missed error means the stock counts are wrong and nobody knows.
  if(type!=="error") toastT=setTimeout(()=>dismissToast(),3200);
}
function dismissToast(){
  const el=document.getElementById("jwg-toast");
  el.classList.remove("show");el.classList.add("hide");
  setTimeout(()=>{el.className="";el.innerHTML="";},280);
}

// A full-page modal covers the viewport but the page underneath keeps its own
// scrollbar, so you end up looking at two. Freeze the page while one is open.
function closeModal(){const o=document.getElementById("moverlay");if(o)o.remove();document.body.classList.remove("jwg-modal-open");}
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
// fullpage=true renders the modal as a full page (day editor, assign/clear
// multiple, usual weeks, locations) with a floating ✕; small dialogs stay cards.
const FP_CLOSE='<button class="mfp-close" onclick="JWG.closeModal()" aria-label="Close">✕</button>';
function updateModal(html,width,fullpage){
  // Update existing modal content in-place (preserves scroll, no flicker)
  const m=document.querySelector("#moverlay .modal");
  if(m){
    const scrollTop=m.scrollTop;
    m.innerHTML=(fullpage?FP_CLOSE:"")+html;
    if(width&&!fullpage)m.style.width=width;
    m.scrollTop=scrollTop;
  } else {
    openModal(html,width,fullpage);
  }
}
function openModal(html,width,fullpage){
  closeModal();
  const ov=document.createElement("div");ov.className="moverlay open"+(fullpage?" fullpage":"");ov.id="moverlay";
  ov.onmousedown=e=>{if(e.target===ov)closeModal();};
  const m=document.createElement("div");m.className="modal";
  if(width&&!fullpage)m.style.width=width;
  m.innerHTML=(fullpage?FP_CLOSE:"")+html;ov.appendChild(m);(document.getElementById("view-jwgscheduler")||document.body).appendChild(ov);
  if(fullpage)document.body.classList.add("jwg-modal-open");
}
// Shared confirm dialog (branded, named target + consequence). Returns Promise<boolean>.
function jwgConfirm(opts){
  opts=opts||{};
  const title=opts.title||"Are you sure?";
  const message=opts.message||"";
  const target=opts.target||"";
  const consequence=opts.consequence||"";
  const confirmLabel=opts.confirmLabel||"Delete";
  return new Promise(resolve=>{
    const ov=document.createElement("div");ov.className="moverlay open";ov.id="jwg-confirm";ov.style.zIndex="3000";
    const m=document.createElement("div");m.className="modal";m.style.maxWidth="400px";
    m.innerHTML=`<div style="font-size:17px;font-weight:700;color:var(--fg);margin-bottom:10px">${esc(title)}</div>`
      +(target?`<div style="font-size:15px;font-weight:600;color:var(--fg);background:var(--bg-deep);border-radius:8px;padding:9px 12px;margin-bottom:10px">${esc(target)}</div>`:"")
      +(message?`<div style="font-size:13px;color:var(--fg-muted);margin-bottom:8px">${esc(message)}</div>`:"")
      +(consequence?`<div style="font-size:13px;color:#c2410c;font-weight:600;margin-bottom:6px">${esc(consequence)}</div>`:"")
      +`<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button class="modal-cancel" id="jc-cancel">Cancel</button><button class="modal-done" id="jc-ok" style="background:#dc2626">${esc(confirmLabel)}</button></div>`;
    ov.appendChild(m);(document.getElementById("view-jwgscheduler")||document.body).appendChild(ov);
    function done(val){document.removeEventListener("keydown",onKey,true);ov.remove();resolve(val);}
    function onKey(e){if(e.key==="Escape"){e.stopImmediatePropagation();done(false);}}
    document.addEventListener("keydown",onKey,true);
    ov.onmousedown=e=>{if(e.target===ov)done(false);};
    m.querySelector("#jc-cancel").onclick=()=>done(false);
    m.querySelector("#jc-ok").onclick=()=>done(true);
    setTimeout(()=>{const b=m.querySelector("#jc-cancel");if(b)b.focus();},30);
  });
}

/* ===== ui.js ===== */
// ── UI.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

// ── GLOBAL ERROR HANDLER ──
window.onerror=function(msg,src,line,col,err){
  console.error("Unhandled error:",msg,src,line,col,err);
  toast("Something went wrong — check console for details","error");
};
window.addEventListener("unhandledrejection",function(e){
  console.error("Unhandled promise rejection:",e.reason);
  toast("A background operation failed","error");
});

// ── BROWSER HISTORY FOR TAB NAVIGATION ──
/* popstate disabled: host owns routing */

function switchTab(t){
  const app=document.getElementById("app");
  if(S.tab===t){render();return;}
  app.classList.add("tab-out");
  setTimeout(()=>{
    S.tab=t;
    // Show skeleton for async tabs while data loads
    if(["summer","winter","inventory","tasks"].includes(t)){
      showSkeleton();
    }
    render();
    app.classList.remove("tab-out");
    app.classList.add("tab-in");
    setTimeout(()=>app.classList.remove("tab-in"),300);
  },150);
}

// ── SKELETON LOADER ──
function showSkeleton(){
  const app=document.getElementById("app");
  if(!app)return;
  const rows=Array.from({length:5},(_,i)=>`
    <div class="skel-row">
      <div class="skeleton skel-avatar"></div>
      <div class="skeleton skel-name" style="width:${70+i*15}px"></div>
      <div style="flex:1;display:flex;gap:8px;padding-left:12px">
        ${Array.from({length:5},()=>`<div class="skeleton skel-bar" style="flex:1"></div>`).join("")}
      </div>
    </div>`).join("");
  app.innerHTML=`<div class="card"><div class="skel-wrap">
    <div class="skeleton skel-hdr" style="width:180px;height:16px;margin-bottom:22px"></div>
    ${rows}
  </div></div>`;
}

// ── SCROLL-TO-TOP VISIBILITY ──
// The floating 👥 button that sat beside this repeated "Assign shifts" and went with the
// 2026-10-20 rebuild; Assign lives under More now.
function updateFAB(){
  const stt=document.getElementById("scroll-top");
  // Scroll to top — show when scrolled >300px on history tab
  if(stt){
    if(window.scrollY>300&&S.tab==="history"){
      stt.classList.add("stt-show");
    } else {
      stt.classList.remove("stt-show");
      stt.style.display="none";
    }
  }
}
window.addEventListener("scroll",updateFAB,{passive:true});
window.addEventListener("resize",updateFAB);

// ── SAVE STATUS SHIMMER ──
function setSaveStatus(state,msg){
  const bar=document.getElementById("save-bar");
  const el=document.getElementById("save-status");
  if(!el)return;
  if(state==="saving"){
    bar?.classList.add("saving");
    el.className="saving-txt";el.textContent="⟳ Saving…";
  } else if(state==="saved"){
    bar?.classList.remove("saving");
    el.className="saved";el.textContent="✓ Saved";
    setTimeout(()=>{if(el)el.textContent="";},2500);
  } else if(state==="error"){
    bar?.classList.remove("saving");
    el.className="error-txt";el.textContent="✕ "+(msg||"Save failed");
  }
}
function animateCounters(){
  document.querySelectorAll(".stat-num[data-count]").forEach(el=>{
    const target=parseFloat(el.dataset.count)||0;
    const suffix=el.dataset.suffix||"";
    const isFloat=String(target).includes(".");
    const dur=900,steps=50,step=dur/steps;
    let i=0;
    el.classList.add("counting");
    const t=setInterval(()=>{
      i++;
      const progress=1-Math.pow(1-(i/steps),3); // ease-out cubic
      const val=target*progress;
      el.textContent=(isFloat?Math.round(val*10)/10:Math.round(val))+suffix;
      if(i>=steps){clearInterval(t);el.textContent=target+suffix;}
    },step);
  });
}
function playSplitReveal(cb){
  const ov=document.getElementById("split-overlay");
  if(!ov){cb&&cb();return;}
  ov.classList.remove("reveal","done");
  ov.style.display="";
  // Hold logo visible briefly, then split apart
  setTimeout(()=>{
    ov.classList.add("reveal");
    setTimeout(()=>{
      ov.classList.add("done");
      cb&&cb();
    },950);
  },650);
}

// ── WORKSHOP TASKS ──────────────────────────────────────────────────────────────
/* ===== settings.js ===== */
// ── SETTINGS.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

function openWHSettings(){
  const h=`<div class="modal-title">Work Hours</div>
  <div class="modal-sub">Set the day range for the schedule. Shifts are shown within this time window.</div>
  <div class="wh-form">
    <div class="wh-field"><label>Day Start</label><select id="wh_start">${buildHourOpts(WH.start)}</select></div>
    <div class="wh-field"><label>Day End</label><select id="wh_end">${buildHourOpts(WH.end)}</select></div>
  </div>
  <div class="info-box">Currently <strong>${fmtHour(WH.start,0)}</strong> to <strong>${fmtHour(WH.end,0)}</strong> — ${WH.end-WH.start}-hour window</div>
  <div style="display:flex;justify-content:space-between;align-items:center">
    <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
    <button class="modal-done" onclick="JWG.applyWH()">Apply</button>
  </div>`;
  openModal(h,"360px");
}
function applyWH(){
  const s=+document.getElementById("wh_start").value,e=+document.getElementById("wh_end").value;
  if(e<=s){toast("End must be after start","error");return;}
  WH={start:s,end:e};saveWH();closeModal();render();toast("Work hours updated");
}

// ── TASK MANAGER ──
function openTaskMgr(){openModal(buildTMHtml(),"480px");}
// Jobs first, then time away. Time away is always grey, so it has no colour to pick. Rows
// carry their index into `tasks` (data-i): tmLC / tmCC / tmDel address tasks by index, and
// grouping the list means the screen order is no longer the array order.
function tmRow(t,i){
  const away=isAwayTask(t.id);
  return`<div class="titem">
    ${away?`<span class="tswatch tswatch-away">${typeIcon(t)}</span>`:`<div class="tswatch" data-i="${i}" style="background:${t.dot}"><input type="color" value="${t.dot}" oninput="JWG.tmCC(${i},this.value)"></div>`}
    <input class="tname" value="${esc(t.label)}" oninput="JWG.tmLC(${i},this.value)"${t.builtIn?' title="Built-in"':''}>
    ${!t.builtIn?`<button class="tdelbtn" onclick="JWG.tmDel(${i})">Remove</button>`:`<span style="font-size:10px;color:rgba(0,0,0,0.38);flex-shrink:0;font-style:italic">default</span>`}
  </div>`;
}
function tmListHtml(){
  const idx=tasks.map((t,i)=>[t,i]);
  return`<div class="sect-label">Jobs</div>${idx.filter(([t])=>!isAwayTask(t.id)).map(([t,i])=>tmRow(t,i)).join("")}
    <div class="sect-label" style="margin-top:14px">Time away · counts no hours</div>${idx.filter(([t])=>isAwayTask(t.id)).map(([t,i])=>tmRow(t,i)).join("")}`;
}
function buildTMHtml(){
  return`<div class="modal-title">Job types &amp; time away</div>
  <div class="modal-sub">Rename, recolour, or add your own.</div>
  <div id="tmList">${tmListHtml()}</div>
  <div class="modal-divider"></div>
  <div class="sect-label">Add new</div>
  <div class="add-task-row">
    <div class="new-color-wrap" id="ncw" style="background:#1a7a3c"><input type="color" id="ncol" value="#1a7a3c" oninput="document.getElementById('ncw').style.background=this.value"></div>
    <input class="new-tname" id="nname" placeholder="e.g. Showing, Training, Open House…" onkeydown="if(event.key==='Enter')JWG.tmAdd()">
    <button class="add-tbtn" onclick="JWG.tmAdd()">Add</button>
  </div>
  <label class="tm-away-opt"><input type="checkbox" id="naway"> Time away, not a job (grey, no hours)</label>
  <div style="display:flex;justify-content:flex-end;margin-top:20px"><button class="modal-done" onclick="JWG.closeModal()">Done</button></div>`;
}
function reTMList(){const el=document.getElementById("tmList");if(el)el.innerHTML=tmListHtml();}
function tmLC(i,v){tasks[i].label=v;saveTasks();}
function tmCC(i,hex){
  Object.assign(tasks[i],taskColours(hex));
  const sw=document.querySelector(`.tswatch[data-i="${i}"]`);if(sw)sw.style.background=hex;
  saveTasks();
}
// Removing a job type does not just remove the type: it strips that job off
// every shift in the week on screen, deletes any shift left with nothing, and
// flips any day left empty back to "off". That used to happen on one click with
// no warning — pressing Remove beside "Cutting Crew" quietly emptied three
// people's whole week, and the next bulk save wrote it. Now it counts the damage
// first and says it out loud (Jake, 2026-10-05: big changes should double check).
async function tmDel(i){
  if(tasks[i].builtIn){toast("Can't delete default tasks","error");return;}
  const id=tasks[i].id,label=tasks[i].label;
  // What this would take off the week currently loaded.
  let hitShifts=0;const hitPeople=new Set();
  Object.keys(S.schedule).forEach(empId=>DAYS.forEach(d=>{
    const dd=S.schedule[empId][d];
    (dd&&dd.shifts||[]).forEach(sh=>{
      if(getShiftTasks(sh).includes(id)){hitShifts++;hitPeople.add(empId);}
    });
  }));
  const who=[...hitPeople].map(x=>(S.employees.find(e=>e.id===x)||{}).name).filter(Boolean);
  const whoStr=who.length<=3?who.join(", "):who.slice(0,3).join(", ")+` and ${who.length-3} more`;
  const impact=hitShifts
    ? `It is also taken off ${hitShifts} shift${hitShifts===1?"":"s"} in ${wlbl(S.weekOffset).toLowerCase()} — ${whoStr}. Any day left with nothing on it goes back to off.`
    : `Nothing in ${wlbl(S.weekOffset).toLowerCase()} is using it.`;
  if(!(await jwgConfirm({
    title:"Remove job type",
    target:label,
    message:impact,
    consequence:hitShifts?"This can't be undone.":"",
    confirmLabel:"Remove"
  })))return;
  tasks.splice(i,1);
  const touched=[...hitPeople];
  Object.values(S.schedule).forEach(emp=>DAYS.forEach(d=>{
    if(emp[d]?.shifts){
      emp[d].shifts=emp[d].shifts.map(sh=>{const t=getShiftTasks(sh).filter(t=>t!==id);return{...sh,tasks:t};}).filter(sh=>sh.tasks.length>0);
    }
    if(emp[d])emp[d]=normDay(emp[d]);
  }));
  saveTasks();
  // The schedule really changed, so save it now rather than leaving a wiped week
  // in memory for some later edit to write.
  if(touched.length){touched.forEach(id2=>autoSave(id2));refreshGrid();}
  reTMList();
  toast(hitShifts?`"${label}" removed, and taken off ${hitShifts} shift${hitShifts===1?"":"s"}`:`"${label}" removed`);
}
function tmAdd(){const n=document.getElementById("nname"),c=document.getElementById("ncol"),aw=document.getElementById("naway");const nm=(n?.value||"").trim();if(!nm){toast("Enter a name","error");return;}const away=!!(aw&&aw.checked);tasks.push({id:"c"+Date.now(),label:nm,...taskColours(away?AWAY_GREY:(c?.value||"#1a7a3c")),...(away?{away:true}:{})});saveTasks();if(n)n.value="";if(aw)aw.checked=false;reTMList();toast(`"${nm}" added`);}

// ── RENDER ──
/* ===== shifts.js ===== */
// ── SHIFTS.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

// ── OVERLAP CHECK ──
function shiftsOverlap(a,b){
  if(!a.start||!a.end||!b.start||!b.end)return false;
  const[as2,am]=a.start.split(":").map(Number),[ae,aem]=a.end.split(":").map(Number);
  const[bs,bm]=b.start.split(":").map(Number),[be,bem]=b.end.split(":").map(Number);
  return(as2+am/60)<(be+bem/60)&&(ae+aem/60)>(bs+bm/60);
}
function hasOverlap(shifts,newShift,skipIdx){
  return shifts.some((sh,i)=>i!==skipIdx&&shiftsOverlap(newShift,sh));
}
// Returns an array of task IDs for a shift (handles both new {tasks:[]} and legacy {task:""} format)
function getShiftTasks(sh){if(!sh)return[];return sh.tasks&&sh.tasks.length?sh.tasks:(sh.task?[sh.task]:[]);}
// Returns display label for shift tasks, joining with " + "
function shiftTaskLabel(sh,tm){return getShiftTasks(sh).map(id=>(tm[id]?.label||id)).join(" + ")||"(no task)";}

// ── SHIFT MODAL ──
// ── DAY EDITOR ──────────────────────────────────────────
// Clicking a day opens its editor: a panel beside the grid on a computer, a sheet that slides
// up on a phone (Barb picked the tidy grid, and liked the person cards for phones — 2026-10-20).
// Every tap saves. The old full-page box held a pick until "Add shift" and threw it away on
// Close; now a job, a time-away type or an hour button writes the day straight away.
// _ed.idx is the entry the hour buttons act on; -1 means the next pick adds another entry.
const HOUR_PRESETS=[["7:00","16:00"],["7:00","17:00"],["8:30","16:30"],["10:00","16:00"],["15:00","19:00"]];
let _ed=null;
function isPhone(){return window.innerWidth<=900;}
function openShiftModal(empId,day){
  if(!S.schedule[empId])S.schedule[empId]=defSched();
  const n=((S.schedule[empId][day]||{}).shifts||[]).length;
  _ed={empId,day,idx:n?n-1:-1,custom:false};
  paintEditor();
}
function closeEditor(){_ed=null;paintEditor();}
function edDay(){return normDay(S.schedule[_ed.empId][_ed.day]);}
function edWrite(shifts){
  S.schedule[_ed.empId][_ed.day]=normDay({...edDay(),shifts});
  if(_ed.idx>=shifts.length)_ed.idx=shifts.length-1;
  updBadge(_ed.empId);autoSave(_ed.empId);paintEditor();
}
// A new job lands on the hours this person last worked it, so office staff get 8:30–4:30 and
// the cutting crew 7–4 without touching an hour button.
function lastHoursFor(empId,taskId){
  const sc=S.schedule[empId]||{};let any=null;
  for(const d of DAYS){
    for(const sh of((sc[d]||{}).shifts||[])){
      if(!sh.start||!sh.end||shiftIsAway(sh))continue;
      if(getShiftTasks(sh).includes(taskId))return[sh.start,sh.end];
      any=any||[sh.start,sh.end];
    }
  }
  return any||HOUR_PRESETS[0];
}
// A second entry starts where the last timed one ends.
function nextHours(shifts){
  const timed=shifts.filter(sh=>sh.start&&sh.end);
  if(!timed.length)return HOUR_PRESETS[0];
  const last=timed[timed.length-1].end,e=Math.min(toHrs(last)+2,23);
  return[last,`${Math.floor(e)}:${e%1?"30":"00"}`];
}
function edJob(id){
  const shifts=[...edDay().shifts],cur=_ed.idx>=0?shifts[_ed.idx]:null;
  if(cur&&!shiftIsAway(cur)){shifts[_ed.idx]={...cur,tasks:[id]};}
  else if(_ed.idx===-1&&shifts.length){
    const[s,e]=nextHours(shifts),entry={tasks:[id],start:s,end:e};
    if(hasOverlap(shifts,entry,-1)){toast("That overlaps another entry — set its hours after adding","error");return;}
    shifts.push(entry);_ed.idx=shifts.length-1;
  }
  else if(cur&&shifts.length>1){const[s,e]=lastHoursFor(_ed.empId,id);shifts[_ed.idx]={tasks:[id],start:cur.start||s,end:cur.end||e};}
  else{const[s,e]=lastHoursFor(_ed.empId,id);shifts.splice(0,shifts.length,{tasks:[id],start:s,end:e});_ed.idx=0;}
  edWrite(shifts);
}
function edAway(id){
  const shifts=[...edDay().shifts],cur=_ed.idx>=0?shifts[_ed.idx]:null;
  if(cur&&shiftIsAway(cur)){shifts[_ed.idx]={...cur,tasks:[id]};}
  else if(_ed.idx===-1&&shifts.length){shifts.push({tasks:[id]});_ed.idx=shifts.length-1;}
  else{shifts.splice(0,shifts.length,{tasks:[id]});_ed.idx=0;}
  edWrite(shifts);
}
function edHrs(s,e){
  const shifts=[...edDay().shifts],cur=_ed.idx>=0?shifts[_ed.idx]:null;
  if(!cur){toast("Pick a job first, then its hours","error");return;}
  if(toHrs(e)<=toHrs(s)){toast("End time must be after start","error");return;}
  const next={...cur,start:s,end:e};
  if(hasOverlap(shifts,next,_ed.idx)){toast("Those hours overlap another entry on this day","error");return;}
  shifts[_ed.idx]=next;_ed.custom=false;
  edWrite(shifts);
}
function edAllDay(){
  const shifts=[...edDay().shifts],cur=shifts[_ed.idx];
  if(!cur||!shiftIsAway(cur))return;
  const{start,end,...rest}=cur;shifts[_ed.idx]=rest;
  edWrite(shifts);
}
function edCustom(){_ed.custom=!_ed.custom;paintEditor();}
function edCustomSet(){edHrs(document.getElementById("dp_s").value,document.getElementById("dp_e").value);}
function edSel(i){_ed.idx=i;_ed.custom=false;paintEditor();}
function edAdd(){_ed.idx=-1;_ed.custom=false;paintEditor();}
function edRemove(i){const shifts=[...edDay().shifts];shifts.splice(i,1);_ed.idx=shifts.length-1;edWrite(shifts);}
function edClear(){_ed.idx=-1;edWrite([]);}
function edNote(val){
  const dd=edDay();
  S.schedule[_ed.empId][_ed.day]=normDay({...dd,note:val.trim()});
  autoSave(_ed.empId);
}
// The Jeff's Junk strip's "Use this" (app-jwg-feed.js): put a booking on the day as a job.
function edApply(id,s,e){
  const shifts=[...edDay().shifts],entry={tasks:[id],start:s,end:e};
  if(!shifts.length||shifts.every(shiftIsAway)){shifts.splice(0,shifts.length,entry);_ed.idx=0;}
  else if(hasOverlap(shifts,entry,-1)){toast("That booking overlaps a shift already on this day","error");return;}
  else{shifts.push(entry);_ed.idx=shifts.length-1;}
  edWrite(shifts);
}
function paintEditor(){
  refreshGrid();
  const phone=isPhone();
  const panel=document.getElementById("day-panel");
  if(panel)panel.innerHTML=!phone&&_ed?editorHtml():panelIdleHtml();
  const sheet=document.getElementById("day-sheet");
  if(sheet){
    sheet.classList.toggle("open",phone&&!!_ed);
    sheet.innerHTML=phone&&_ed?sheetHtml():"";
  }
  if(_ed)document.dispatchEvent(new CustomEvent("jwg:editor",{detail:{empId:_ed.empId,day:_ed.day}}));
}
function sheetHtml(){return`<button class="ds-scrim" onclick="JWG.closeEditor()" aria-label="Close"></button><div class="ds-sheet"><div class="ds-grab"></div>${editorHtml()}</div>`;}
function panelIdleHtml(){
  return`<div class="dp-idle"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v18H3zM16 2v4M8 2v4M3 10h18"/></svg><b>Click a day</b><span>to set the job, hours or time away</span></div>`;
}
function editorHtml(){
  const emp=S.employees.find(e=>e.id===_ed.empId)||{name:""};
  const dd=edDay(),shifts=dd.shifts,cur=_ed.idx>=0?shifts[_ed.idx]:null;
  const curAway=!!cur&&shiftIsAway(cur),curIds=cur?getShiftTasks(cur):[];
  const[abg,afg]=ac(emp.name);
  const dt=new Date(getWS(S.weekOffset));dt.setDate(dt.getDate()+DAYS.indexOf(_ed.day));
  const dLbl=`${_ed.day} · ${dt.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;
  const X=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

  const entries=shifts.length?shifts.map((sh,i)=>{
    const t=taskOf(getShiftTasks(sh)[0]),away=shiftIsAway(sh);
    const lbl=getShiftTasks(sh).map(taskLabel).join(" + ");
    const when=sh.start&&sh.end?rangeShort(sh.start,sh.end):(away?"All day":"");
    return`<div class="dp-entry${i===_ed.idx?" on":""}${away?" away":""}"${away?"":` style="--tb:${t?t.bg:"#f1f5f9"};--tt:${t?t.text:"#334155"}"`}>
      <button class="dp-entry-main" onclick="JWG.edSel(${i})">${typeTile(t,30)}<span class="dp-entry-nm">${esc(lbl)}</span><span class="dp-entry-t">${when}</span></button>
      <button class="dp-x" onclick="JWG.edRemove(${i})" aria-label="Remove ${esc(lbl)}">${X}</button>
    </div>`;
  }).join(""):`<div class="dp-none">Not working yet</div>`;
  const adding=_ed.idx===-1&&shifts.length;

  const jobs=jobTypes().map(t=>{
    const on=!curAway&&curIds.includes(t.id);
    return`<button class="task-opt dp-job${on?" sel":""}" id="topt_${t.id}" onclick="JWG.edJob('${t.id}')"${on?` style="border-color:${t.dot};background:${t.bg}"`:""}>${typeTile(t,32)}<span>${esc(t.label)}</span></button>`;
  }).join("");

  let hours="";
  if(cur){
    const timed=cur.start&&cur.end;
    if(curAway)hours+=`<button class="dp-hc${timed?"":" on"}" onclick="JWG.edAllDay()">All day</button>`;
    const inPreset=HOUR_PRESETS.some(([s,e])=>s===cur.start&&e===cur.end);
    HOUR_PRESETS.forEach(([s,e])=>{hours+=`<button class="dp-hc${cur.start===s&&cur.end===e?" on":""}" onclick="JWG.edHrs('${s}','${e}')">${rangeShort(s,e)}</button>`;});
    if(timed&&!inPreset)hours+=`<button class="dp-hc on" onclick="JWG.edCustom()">${rangeShort(cur.start,cur.end)}</button>`;
    hours+=`<button class="dp-hc${_ed.custom?" on":""}" onclick="JWG.edCustom()">Other…</button>`;
    if(_ed.custom){
      const[ds,de]=timed?[cur.start,cur.end]:HOUR_PRESETS[0];
      hours+=`<div class="dp-custom"><select id="dp_s" class="sf-select">${buildTimeOpts(ds)}</select><span>to</span><select id="dp_e" class="sf-select">${buildTimeOpts(de)}</select><button class="dp-set" onclick="JWG.edCustomSet()">Set</button></div>`;
    }
  }else{
    hours=`<div class="dp-hint">Pick a job or time away first</div>`;
  }

  const aways=awayTypes().map(t=>{
    const on=curAway&&curIds.includes(t.id);
    return`<button class="dp-ac${on?" on":""}" onclick="JWG.edAway('${t.id}')">${typeIcon(t)}${esc(t.label)}</button>`;
  }).join("");

  return`<div class="dp-editor">
    <div class="dp-head">
      <span class="dp-av" style="background:${abg};color:${afg}">${empInitials(emp.name)}</span>
      <div class="dp-who"><b>${esc(emp.name)}</b><span>${dLbl}</span></div>
      <button class="dp-close" onclick="JWG.closeEditor()" aria-label="Close">${X}</button>
    </div>
    <div class="dp-q"></div>
    <div class="dp-entries">${entries}
      ${adding?`<div class="dp-adding">Pick a job or time away to add <button onclick="JWG.edSel(${shifts.length-1})">Cancel</button></div>`:(shifts.length?`<button class="dp-add" onclick="JWG.edAdd()">+ Add another</button>`:"")}
    </div>
    <div class="dp-sec"><div class="dp-lab">Job</div><div class="dp-jobs">${jobs}</div></div>
    <div class="dp-sec"><div class="dp-lab">Hours</div><div class="dp-hours">${hours}</div></div>
    <div class="dp-sec"><div class="dp-lab">Time away</div><div class="dp-aways">${aways}</div></div>
    <textarea class="dp-note" rows="2" placeholder="Note (optional)" oninput="JWG.edNote(this.value)">${esc(dd.note||"")}</textarea>
    ${shifts.length?`<div class="dp-foot"><button class="dp-clear" onclick="JWG.edClear()">Clear day</button></div>`:""}
  </div>`;
}
// Redraw only when the screen crosses between phone and computer layout. A phone keyboard
// opening is a resize too, and redrawing then would wipe a note half-typed.
let _edPhone=isPhone();
window.addEventListener("resize",()=>{
  const p=isPhone();if(p===_edPhone)return;_edPhone=p;
  if(_ed&&document.getElementById("day-panel"))paintEditor();
});

/* ===== multi.js ===== */
// ── MULTI.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

// ── MULTI-ASSIGN ──
let _ma={tasks:[],days:[],empIds:[],start:null,end:null};

function openMultiAssign(){
  _ma={tasks:[],days:[],empIds:[],start:null,end:null};
  renderMultiAssign();
}

function renderMultiAssign(){
  const tm=TM();
  const defStart=`${WH.start}:00`,defEnd=`${WH.end}:00`;
  // Preserve any time the user has already selected before re-rendering
  const curStart=document.getElementById("ma_start");
  const curEnd=document.getElementById("ma_end");
  if(curStart)_ma.start=curStart.value;
  if(curEnd)_ma.end=curEnd.value;
  const selStart=_ma.start||defStart;
  const selEnd=_ma.end||defEnd;

  // Task grid
  let taskHtml='<div class="task-grid">';
  [...jobTypes(),...awayTypes()].forEach(t=>{
    const sel=_ma.tasks.includes(t.id);
    taskHtml+=`<button class="task-opt${sel?" sel":""}" id="matopt_${t.id}"
      style="background:${t.bg};color:${t.text};border-color:${sel?t.dot:"transparent"}"
      onclick="JWG.maPick('${t.id}')">
      ${schChip(t,24)}
      ${esc(t.label)}
    </button>`;
  });
  taskHtml+='</div>';

  // Day picker
  let dayHtml='<div class="ma-day-list">';
  S.activeDays.forEach(d=>{
    const on=_ma.days.includes(d);
    dayHtml+=`<button class="ma-day-btn${on?" on":""}" onclick="JWG.maToggleDay('${d}')">${d.slice(0,3)}</button>`;
  });
  // Add "All Days" shortcut
  const allDaysOn=S.activeDays.every(d=>_ma.days.includes(d));
  dayHtml+=`<button class="ma-day-btn${allDaysOn?" on":""}" onclick="JWG.maToggleAllDays()" style="font-style:italic">All</button>`;
  dayHtml+='</div>';

  // Employee list — visible people only (soft-removed stay out of new work)
  const maEmps=visEmps();
  const allOn=maEmps.length>0&&maEmps.every(e=>_ma.empIds.includes(e.id));
  let empHtml=`<button class="ma-everyone-btn${allOn?" all-on":""}" onclick="JWG.maToggleEveryone()">
    ${allOn?"✓ Everyone selected":"👥 Select Everyone"}
  </button>
  <div class="ma-emp-list">`;
  maEmps.forEach(e=>{
    const checked=_ma.empIds.includes(e.id);
    const[abg,afg]=ac(e.name);
    empHtml+=`<div class="ma-emp-row${checked?" checked":""}" onclick="JWG.maToggleEmp('${e.id}')">
      <span class="ma-chk">${checked?`<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="7" fill="var(--accent)"/><path d="M4 7l2 2 4-4" stroke="white" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`:`<span style="width:14px;height:14px;border-radius:50%;border:2px solid var(--border);display:inline-block;"></span>`}</span>
      <div class="avatar" style="background:${abg};color:${afg};width:26px;height:26px;font-size:11px;flex-shrink:0">${empInitials(e.name)}</div>
      <span class="ma-emp-name">${esc(e.name)}</span>
    </div>`;
  });
  empHtml+='</div>';

  const selCount=_ma.empIds.length;
  const readyToAssign=_ma.tasks.length>0&&_ma.days.length>0&&selCount>0;

  const h=`
  <div class="modal-title">➕ Assign shifts</div>
  <div class="modal-sub">Four quick picks — everyone you choose gets the same shift on each chosen day.</div>

  <div class="sect-label"><span class="step-n">1</span> Job</div>
  ${taskHtml}

  <div class="modal-divider"></div>
  <div class="sect-label"><span class="step-n">2</span> Time</div>
  <div class="shift-form">
    <div><div class="sf-label">Start</div><select class="sf-select" id="ma_start">${buildTimeOpts(selStart)}</select></div>
    <div><div class="sf-label">End</div><select class="sf-select" id="ma_end">${buildTimeOpts(selEnd)}</select></div>
  </div>

  <div class="modal-divider"></div>
  <div class="sect-label"><span class="step-n">3</span> Days</div>
  ${dayHtml}

  <div class="modal-divider"></div>
  <div class="sect-label"><span class="step-n">4</span> People <span style="font-weight:500;opacity:.6;text-transform:none;letter-spacing:0">${selCount>0?`(${selCount} selected)`:""}</span></div>
  ${maEmps.length?empHtml:'<div style="font-size:12px;color:var(--fg-muted);padding:8px 0">No employees yet — add them on the Team page.</div>'}

  <div class="ma-actions">
    <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
    <button class="modal-done" onclick="JWG.applyMultiAssign()" ${readyToAssign?"":'disabled style="opacity:.45;cursor:not-allowed"'}>
      Assign${(selCount>0&&_ma.days.length>0)?" to "+selCount+" \xD7 "+_ma.days.length+" day"+(_ma.days.length!==1?"s":""):""}
    </button>
  </div>`;

  updateModal(h,null,true);
}

function maPick(id){
  const i=_ma.tasks.indexOf(id);
  if(i>=0) _ma.tasks.splice(i,1); else _ma.tasks.push(id);
  // Update button styles in-place (no full re-render = no scroll reset)
  const tm=TM();
  document.querySelectorAll(".task-opt[id^='matopt_']").forEach(b=>{b.classList.remove("sel");b.style.borderColor="transparent";});
  _ma.tasks.forEach(tid=>{
    const el=document.getElementById("matopt_"+tid);
    if(el){el.classList.add("sel");const t=tm[tid];if(t)el.style.borderColor=t.dot;}
  });
  // Update the Assign button label/state
  const btn=document.querySelector(".modal-done");
  if(btn){
    const ready=_ma.tasks.length>0&&_ma.days.length>0&&_ma.empIds.length>0;
    btn.disabled=!ready;btn.style.opacity=ready?"1":"0.45";btn.style.cursor=ready?"pointer":"not-allowed";
    if(_ma.empIds.length>0&&_ma.days.length>0)
      btn.textContent=`Assign to ${_ma.empIds.length} × ${_ma.days.length} day${_ma.days.length!==1?"s":""}`;
    else btn.textContent="Assign";
  }
}
function maToggleDay(d){
  const i=_ma.days.indexOf(d);
  if(i>=0)_ma.days.splice(i,1);else _ma.days.push(d);
  renderMultiAssign();
}
function maToggleAllDays(){
  const allOn=S.activeDays.every(d=>_ma.days.includes(d));
  _ma.days=allOn?[]:[...S.activeDays];
  renderMultiAssign();
}
function maToggleEmp(id){
  const i=_ma.empIds.indexOf(id);
  if(i>=0)_ma.empIds.splice(i,1);else _ma.empIds.push(id);
  renderMultiAssign();
}
function maToggleEveryone(){
  const emps=visEmps();
  const allOn=emps.every(e=>_ma.empIds.includes(e.id));
  _ma.empIds=allOn?[]:emps.map(e=>e.id);
  renderMultiAssign();
}

async function applyMultiAssign(){
  const s=document.getElementById("ma_start")?.value||_ma.start;
  const e=document.getElementById("ma_end")?.value||_ma.end;
  if(!_ma.tasks.length){toast("Select at least one task first","error");return;}
  if(!_ma.days.length){toast("Select at least one day","error");return;}
  if(!_ma.empIds.length){toast("Select at least one employee","error");return;}
  // Time away is a whole day: it replaces what is there. A job is added alongside, and skips
  // anyone away that day rather than writing over their vacation.
  const awayPick=_ma.tasks.every(isAwayTask);
  if(!awayPick&&_ma.tasks.some(isAwayTask)){toast("Pick jobs or time away, not both","error");return;}
  if(s&&e){
    const[sh,sm]=s.split(":").map(Number),[eh,em]=e.split(":").map(Number);
    if((eh+em/60)<=(sh+sm/60)){toast("End time must be after start","error");return;}
  }
  // A bulk write across people and days deserves a beat, the same as Clear does.
  const _tmA=TM();
  const _taskStr=_ma.tasks.map(id=>_tmA[id]?.label||id).join(" + ");
  const _names=_ma.empIds.map(id=>(S.employees.find(x=>x.id===id)||{}).name).filter(Boolean);
  const _whoStr=_names.length<=4?_names.join(", "):_names.slice(0,3).join(", ")+` and ${_names.length-3} more`;
  if(_ma.empIds.length*_ma.days.length>1&&!(await jwgConfirm({
    title:"Assign shifts",
    target:_whoStr,
    message:awayPick?`"${_taskStr}" (all day) replaces whatever is on ${_ma.days.length} day${_ma.days.length===1?"":"s"} for ${_ma.empIds.length} ${_ma.empIds.length===1?"person":"people"}.`:`"${_taskStr}" ${s&&e?fmtRange(s,e)+" ":""}goes on ${_ma.days.length} day${_ma.days.length===1?"":"s"} for ${_ma.empIds.length} ${_ma.empIds.length===1?"person":"people"}. Days with time away or an overlapping shift are skipped.`,
    confirmLabel:`Assign ${_ma.empIds.length*_ma.days.length} day${_ma.empIds.length*_ma.days.length===1?"":"s"}`
  })))return;
  let skipped=0;
  const newShift=awayPick?{tasks:[..._ma.tasks]}:{tasks:[..._ma.tasks],start:s,end:e};
  _ma.empIds.forEach(empId=>{
    if(!S.schedule[empId])S.schedule[empId]=defSched();
    _ma.days.forEach(day=>{
      const dayData=normDay(S.schedule[empId][day]);
      if(awayPick){S.schedule[empId][day]=normDay({...dayData,shifts:[{tasks:[...newShift.tasks]}]});return;}
      if(dayData.status==="away"||hasOverlap(dayData.shifts,newShift,-1)){skipped++;return;}
      S.schedule[empId][day]=normDay({...dayData,shifts:[...dayData.shifts,{...newShift,tasks:[...newShift.tasks]}]});
    });
    updBadge(empId);
  });
  // Use autoSave(null) which snapshots ALL employees at once right now
  autoSave(null);
  closeModal();
  refreshGrid();
  const tm=TM();
  const tLabel=_ma.tasks.map(id=>tm[id]?.label||id).join(" + ");
  const skipNote=skipped>0?` (${skipped} skipped — overlap)`:"";
  toast(`✓ "${tLabel}" assigned to ${_ma.empIds.length} employee${_ma.empIds.length!==1?"s":""} across ${_ma.days.length} day${_ma.days.length!==1?"s":""}${skipNote}`);
  _ma={tasks:[],days:[],empIds:[]};
}
// ── MULTI-CLEAR ──
let _mc={task:"__all__",days:[],empIds:[]};

function openMultiClear(){
  _mc={task:"__all__",days:[],empIds:[]};
  renderMultiClear();
}

function renderMultiClear(){
  // Task filter — "__all__" means clear every task on that day/person
  let taskHtml=`<div class="task-grid">`;
  const allTaskSel=_mc.task==="__all__";
  taskHtml+=`<button class="task-opt${allTaskSel?" sel":""}" style="background:rgba(239,68,68,0.08);color:#dc2626;border-color:${allTaskSel?"#dc2626":"transparent"}" onclick="JWG.mcPickTask('__all__')">
    <span style="width:7px;height:7px;border-radius:50%;background:#dc2626;flex-shrink:0;display:inline-block"></span>
    All Tasks
  </button>`;
  [...jobTypes(),...awayTypes()].forEach(t=>{
    const sel=_mc.task===t.id;
    taskHtml+=`<button class="task-opt${sel?" sel":""}" style="background:${t.bg};color:${t.text};border-color:${sel?t.dot:"transparent"}" onclick="JWG.mcPickTask('${t.id}')">
      ${schChip(t,24)}
      ${esc(t.label)}
    </button>`;
  });
  taskHtml+=`</div>`;

  let dayHtml=`<div class="ma-day-list">`;
  S.activeDays.forEach(d=>{
    const on=_mc.days.includes(d);
    dayHtml+=`<button class="ma-day-btn${on?" on":""}" onclick="JWG.mcToggleDay('${d}')">${d.slice(0,3)}</button>`;
  });
  const allDaysOn=S.activeDays.every(d=>_mc.days.includes(d));
  dayHtml+=`<button class="ma-day-btn${allDaysOn?" on":""}" onclick="JWG.mcToggleAllDays()" style="font-style:italic">All</button>`;
  dayHtml+=`</div>`;

  const mcEmps=visEmps();
  const allEmpOn=mcEmps.length>0&&mcEmps.every(e=>_mc.empIds.includes(e.id));
  let empHtml=`<button class="ma-everyone-btn${allEmpOn?" all-on":""}" onclick="JWG.mcToggleEveryone()">
    ${allEmpOn?"✓ Everyone selected":"👥 Select Everyone"}
  </button><div class="ma-emp-list">`;
  mcEmps.forEach(e=>{
    const checked=_mc.empIds.includes(e.id);
    const[abg,afg]=ac(e.name);
    empHtml+=`<div class="ma-emp-row${checked?" checked":""}" onclick="JWG.mcToggleEmp('${e.id}')">
      <span class="ma-chk">${checked?`<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="7" fill="var(--accent)"/><path d="M4 7l2 2 4-4" stroke="white" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`:`<span style="width:14px;height:14px;border-radius:50%;border:2px solid var(--border);display:inline-block;"></span>`}</span>
      <div class="avatar" style="background:${abg};color:${afg};width:26px;height:26px;font-size:11px;flex-shrink:0">${empInitials(e.name)}</div>
      <span class="ma-emp-name">${esc(e.name)}</span>
    </div>`;
  });
  empHtml+=`</div>`;

  const selCount=_mc.empIds.length;
  const ready=_mc.days.length>0&&selCount>0;
  const taskLabel=_mc.task==="__all__"?"all tasks":(TM()[_mc.task]?.label||_mc.task);

  const h=`
  <div class="modal-title">🗑 Clear shifts</div>
  <div class="modal-sub">Remove shifts from the people and days you pick — it asks before deleting anything.</div>
  <div class="sect-label"><span class="step-n">1</span> What to clear</div>
  ${taskHtml}
  <div class="modal-divider"></div>
  <div class="sect-label"><span class="step-n">2</span> Days</div>
  ${dayHtml}
  <div class="modal-divider"></div>
  <div class="sect-label"><span class="step-n">3</span> People <span style="font-weight:500;opacity:.6;text-transform:none;letter-spacing:0">${selCount>0?"("+selCount+" selected)":""}</span></div>
  ${mcEmps.length?empHtml:'<div style="font-size:12px;color:var(--fg-muted);padding:8px 0">No employees yet.</div>'}
  <div class="ma-actions">
    <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
    <button class="modal-done modal-done-danger" style="opacity:${ready?1:0.45};pointer-events:${ready?"auto":"none"}" onclick="JWG.applyMultiClear()">
      Clear${ready?" "+selCount+" × "+_mc.days.length+" day"+(_mc.days.length!==1?"s":""):""}
    </button>
  </div>`;
  updateModal(h,null,true);
}

function mcPickTask(id){_mc.task=id;renderMultiClear();}
function mcToggleDay(d){const i=_mc.days.indexOf(d);if(i>=0)_mc.days.splice(i,1);else _mc.days.push(d);renderMultiClear();}
function mcToggleAllDays(){const allOn=S.activeDays.every(d=>_mc.days.includes(d));_mc.days=allOn?[]:[...S.activeDays];renderMultiClear();}
function mcToggleEmp(id){const i=_mc.empIds.indexOf(id);if(i>=0)_mc.empIds.splice(i,1);else _mc.empIds.push(id);renderMultiClear();}
function mcToggleEveryone(){const emps=visEmps();const allOn=emps.every(e=>_mc.empIds.includes(e.id));_mc.empIds=allOn?[]:emps.map(e=>e.id);renderMultiClear();}

async function applyMultiClear(){
  // Was a silent return — the user pressed Clear and nothing at all happened.
  // Assign already says why it won't go; this now matches it.
  if(!_mc.empIds.length){toast("Select at least one employee","error");return;}
  if(!_mc.days.length){toast("Select at least one day","error");return;}
  const taskLabel=_mc.task==="__all__"?"all tasks":(TM()[_mc.task]?.label||_mc.task);
  const empN=_mc.empIds.length,dayN=_mc.days.length;

  // Count what would ACTUALLY go before asking. "16 people across 5 days" tells
  // you the size of the selection, not the size of the damage — those are very
  // different numbers when most of the selection is already empty.
  let willClear=0;
  _mc.empIds.forEach(empId=>{
    const sc=S.schedule[empId];if(!sc)return;
    _mc.days.forEach(day=>{
      const dd=sc[day];if(!dd)return;
      if(_mc.task==="__all__"){if(dayHasData(dd))willClear++;}
      else willClear+=(dd.shifts||[]).filter(sh=>getShiftTasks(sh).includes(_mc.task)).length;
    });
  });
  if(!willClear){
    toast(`Nothing to clear — no ${taskLabel} on those days for those people.`,"error");
    return;
  }
  // Name them. A bulk delete should say who it is about.
  const names=_mc.empIds.map(id=>(S.employees.find(e=>e.id===id)||{}).name).filter(Boolean);
  const whoStr=names.length<=4?names.join(", "):names.slice(0,3).join(", ")+` and ${names.length-3} more`;
  // Clearing a repeating person's day does not leave it blank — their usual week
  // shows again as a dashed plan. Without saying so, the clear looks like it failed.
  const repNames=_mc.empIds.map(id=>S.employees.find(e=>e.id===id)).filter(e=>e&&e.repeats_weekly&&usualDayAny(e)).map(e=>e.name);
  const repNote=repNames.length?` ${repNames.join(", ")} ${repNames.length===1?"works":"work"} the same week every week, so once cleared ${repNames.length===1?"their":"those"} day${repNames.length===1?"":"s"} can be put back with the Fill in this week button.`:"";
  if(!(await jwgConfirm({
    title:"Clear shifts",
    target:whoStr,
    message:`${willClear} ${_mc.task==="__all__"?(willClear===1?"day":"days"):(willClear===1?"shift":"shifts")} will be removed — ${taskLabel}, across ${dayN} ${dayN!==1?"days":"day"} for ${empN} ${empN!==1?"people":"person"}.${repNote}`,
    consequence:"This can't be undone.",
    confirmLabel:`Clear ${willClear}`
  })))return;
  let cleared=0;
  _mc.empIds.forEach(empId=>{
    if(!S.schedule[empId])return;
    _mc.days.forEach(day=>{
      const dayData=S.schedule[empId][day];
      if(!dayData)return;
      if(_mc.task==="__all__"){
        // Wipe entire day
        S.schedule[empId][day]={status:"off",shifts:[]};
        cleared++;
      } else {
        // Remove only shifts matching this task (handles both legacy {task} and new {tasks:[]} format)
        const before=dayData.shifts.length;
        dayData.shifts=dayData.shifts.filter(sh=>!getShiftTasks(sh).includes(_mc.task));
        S.schedule[empId][day]=normDay(dayData);
        cleared+=before-dayData.shifts.length;
      }
    });
    updBadge(empId);
  });
  autoSave(null);
  closeModal();
  refreshGrid();
  toast(`Cleared ${taskLabel} for ${_mc.empIds.length} employee${_mc.empIds.length!==1?"s":""} across ${_mc.days.length} day${_mc.days.length!==1?"s":""}`);
  _mc={task:"__all__",days:[],empIds:[]};
}

function updBadge(empId){
  const el=document.getElementById(`hbadge_${empId}`);
  if(!el)return;
  const h=countH(S.schedule[empId]||{});
  const pct=h/40;
  el.textContent=`${h}h`;
  el.className="emp-hrs "+(pct>0.6?"hrs-high":pct>0.3?"hrs-mid":"hrs-low");
}
function refreshGrid(){
  const gw=document.getElementById("gw");if(gw)gw.innerHTML=buildGrid();
  const ms=document.getElementById("msched");if(ms)ms.innerHTML=buildMobileSched();
}

// ── WORK HOURS ──
/* ===== schedule.js ===== */
// ── SCHEDULE.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

function render(){
  const app=document.getElementById("app");
  const labelMap={schedule:"Schedule",insights:"Insights",history:"History",analytics:"Analytics","tasks":"Tasks",summer:"Summer",winter:"Winter",inventory:"Inventory",clothing:"Clothing"};
  // tell the host which tab-group is active so the header shows the right sub-tabs
  const _tg={summer:"svc",winter:"svc",inventory:"inv",clothing:"cloth"}[S.tab]||"sched";
  const _v=document.getElementById("view-jwgscheduler");if(_v)_v.setAttribute("data-tabgroup",_tg);
  // Sync desktop nav
  document.querySelectorAll(".tab-btn").forEach(b=>{b.classList.toggle("active",b.textContent.trim()===labelMap[S.tab]);});
  // Sync mobile nav
  ["schedule","summer","winter","inventory","clothing"].forEach(t=>{
    const el=document.getElementById("mnav-"+t);
    if(el)el.classList.toggle("active",S.tab===t);
  });
  document.getElementById("empCount").textContent=`${S.employees.length} employee${S.employees.length!==1?"s":""}`;
  if(S.tab==="schedule")app.innerHTML=buildSched();
  else if(S.tab==="history")app.innerHTML=buildHistory();
  else if(S.tab==="analytics"){app.innerHTML=buildAnalytics();requestAnimationFrame(()=>animateCounters());}
  else if(S.tab==="insights"){app.innerHTML=buildInsights();requestAnimationFrame(()=>animateCounters());}
  else if(S.tab==="tasks"){app.innerHTML=buildTasksPage();initTasksPage();}
  else if(S.tab==="summer"){app.innerHTML=buildSummerPage();initSummerPage();}
  else if(S.tab==="winter"){app.innerHTML=buildWinterPage();initWinterPage();}
  else if(S.tab==="inventory"){
    // Inventory lives in app-jwg-inventory.js. Fail loudly if it is missing
    // rather than showing a silently blank tab.
    if(!window.JWGInv)throw new Error("app-jwg-inventory.js is not loaded");
    app.innerHTML=window.JWGInv.buildInventoryPage();window.JWGInv.initInventoryPage();
  }
  else if(S.tab==="clothing"){app.innerHTML=buildClothingPage();initClothingPage();}
  else{S.tab="schedule";app.innerHTML=buildSched();}  // people are managed on the main Team page
  updateFAB();
}

// ── SCHEDULE ──
// One bar: the week, which days show, and the tools. Assign / Clear / Job types / Hours live
// under More — they used to be five equal buttons plus a floating one that repeated Assign,
// and nobody could tell which mattered (2026-10-20 rebuild). The grid and the day editor sit
// side by side; under 900px the grid gives way to one card per person (see buildMobileSched).
function buildSched(){
  const ws=getWS(S.weekOffset);
  const dayBtns=DAYS.map(d=>`<button class="day-toggle${WEEKEND.includes(d)?" weekend":""}${S.activeDays.includes(d)?" on":""}" onclick="JWG.toggleDay('${d}')">${d.slice(0,3)}</button>`).join("");
  let h=`<div class="card sc-card">
  <div class="sc-top">
    <div class="sc-week">
      <button class="sc-nav" onclick="JWG.prevW()" aria-label="Last week"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
      <div class="sc-wk"><b>${wlbl(S.weekOffset)}</b><span>${fmtW(ws)}</span></div>
      <button class="sc-nav" onclick="JWG.nextW()" aria-label="Next week"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button>
      ${S.weekOffset!==0?`<button class="sc-today" onclick="JWG.goToday()">This week</button>`:""}
    </div>
    <div class="sc-days" title="Days shown">${dayBtns}</div>
    <div class="ctrl-bar"><div class="ctrl-actions">
      <span id="save-status"></span>
      <button class="ctrl-btn" onclick="JWG.openUsualWeeks()" title="For anyone who works the same week every week">🔁 Same every week</button>
      <details class="sc-more"><summary class="ctrl-btn">More</summary><div class="sc-more-menu">
        <button onclick="JWG.openMultiAssign()">➕ Assign shifts to several people</button>
        <button onclick="JWG.openMultiClear()">🗑 Clear shifts</button>
        <button onclick="JWG.openTaskMgr()">🏷️ Job types &amp; time away</button>
        <button onclick="JWG.openWHSettings()">⏰ Day hours ${fmtHour(WH.start,0)}–${fmtHour(WH.end,0)}</button>
      </div></details>
    </div></div>
  </div>
  <div class="sc-legend">${jobTypes().map(t=>`<span class="sc-lg">${typeTile(t,22)}${esc(t.label)}</span>`).join("")}<span class="sc-lg"><span class="sc-hatch"></span>Time away</span></div>`;
  if(!S.employees.length){
    h+=`<div class="empty" style="padding:52px 24px;display:flex;flex-direction:column;align-items:center;gap:16px">
      <div style="width:72px;height:72px;border-radius:50%;background:var(--accent-light);display:flex;align-items:center;justify-content:center;font-size:32px;">👥</div>
      <div style="text-align:center">
        <div style="font-size:16px;font-weight:700;color:var(--fg);margin-bottom:6px">No employees yet</div>
        <div style="font-size:13px;color:var(--fg-muted);max-width:260px;line-height:1.5">Add your staff on the <strong>Team</strong> page, then come back to start scheduling.</div>
      </div>
    </div>`;
  } else {
    if(S.employees.every(e=>!empHasWeekData(S.schedule[e.id]))){
      h+=`<div class="wk-hint">🗓️ <b>${wlbl(S.weekOffset)} is empty.</b>&nbsp;Click any day to fill it in, or use <b>🔁 Same every week</b>.</div>`;
    }
    // Anyone on "same every week" whose week is still empty. The bar only shows
    // while there is something to do, and says exactly who and how many days.
    const _pend=pendingUsual();
    if(_pend.length){
      const _names=_pend.map(x=>esc(x.emp.name)).join(", ");
      const _days=_pend.reduce((n,x)=>n+x.days.length,0);
      // Seasonal drift is the real risk, so call out anyone whose pattern is old
      // rather than quietly writing a summer week into a winter one.
      const _stale=_pend.filter(x=>{const m=usualAgeMonths(x.emp);return m!==null&&m>=USUAL_STALE_MONTHS;});
      const _staleNote=_stale.length?`<span class="wkf-stale">⚠ ${_stale.map(x=>esc(x.emp.name)+"'s").join(" and ")} usual week ${_stale.length===1?"was":"were"} set up a while ago — check ${_stale.length===1?"it":"they"} still fit${_stale.length===1?"s":""} the season before filling.</span>`:"";
      h+=`<div class="wk-fill">
        <span class="wkf-txt">🔁 <b>${_pend.length} ${_pend.length===1?"person works":"people work"} the same week every week</b>, and ${wlbl(S.weekOffset).toLowerCase()} is still empty for them.
          <span class="wkf-who">${_names} · ${_days} day${_days===1?"":"s"} to fill</span>${_staleNote}</span>
        <button class="wkf-btn" onclick="JWG.fillWeekFromUsual()">Fill in this week</button>
      </div>`;
    }
    const phone=isPhone();
    h+=`<div class="sc-main">
      <div class="grid-wrap" id="gw">${buildGrid()}</div>
      <aside class="day-panel" id="day-panel">${_ed&&!phone?editorHtml():panelIdleHtml()}</aside>
    </div>`;
    h+=`<div class="msched" id="msched">${buildMobileSched()}</div>`;
    h+=`<div id="day-sheet" class="day-sheet${_ed&&phone?" open":""}">${_ed&&phone?sheetHtml():""}</div>`;
  }
  const result=h+`</div>`;
  // After HTML is set, init grid drag and land the grid on today's column
  setTimeout(()=>{initGridDrag();scrollGridToToday();if(_ed)document.dispatchEvent(new CustomEvent("jwg:editor",{detail:{empId:_ed.empId,day:_ed.day}}));},0);
  return result;
}

// ── INSIGHTS (Analytics + History merged into one page) ──
function buildInsights(){
  if(!S.employees.length)return buildAnalytics()+buildHistory();
  const period=S.aPeriod||"4w";
  const empFilter=S.hFilter||"all";
  let bar=`<div class="card" style="padding-bottom:12px"><div class="period-selector">`;
  PERIODS.forEach(p=>{bar+=`<button class="period-btn${period===p.id?" on":""}" onclick="JWG.S.aPeriod='${p.id}';JWG.render()">${p.label}</button>`;});
  bar+=`</div><div class="h-filter-bar" style="margin-top:10px"><span class="h-filter-label">Show person</span><button class="h-emp-chip${empFilter==="all"?" on":""}" onclick="JWG.S.hFilter='all';JWG.render()">All</button>`;
  S.employees.forEach(e=>{bar+=`<button class="h-emp-chip${empFilter===e.id?" on":""}" onclick="JWG.S.hFilter='${e.id}';JWG.render()">${esc(e.name.split(" ")[0])}</button>`;});
  bar+=`</div></div>`;
  return bar+buildAnalytics()+buildHistory();
}

// ── GRID ──
// Rows cluster by crew so the people who work together read as a block (Jake, 2026-10-02:
// bins was two people four rows apart). A-Z sort is the explicit "one flat alphabetical list"
// escape hatch, so it skips the banding. Within a band people keep the hand-dragged emp_order,
// managers first. Shared by the grid and the phone cards.
function crewBands(list){
  if(S.sortAlpha)return[{name:"",emps:[...list].sort((a,b)=>a.name.localeCompare(b.name))}];
  const bands=[],seen=new Set(),order=crewGroupOrder();
  order.forEach(g=>{
    const inG=list.filter(e=>e.group===g);
    const ordered=inG.filter(e=>e.manager).concat(inG.filter(e=>!e.manager));
    ordered.forEach(e=>seen.add(e.id));
    if(ordered.length)bands.push({name:g,emps:ordered});
  });
  const rest=list.filter(e=>!seen.has(e.id));
  if(rest.length)bands.push({name:order.length?UNGROUPED:"",emps:rest});
  return bands;
}
// One entry inside a grid cell. Jobs are a tinted block with the type's icon and the hours;
// time away is grey and striped. The job's name stays in the markup (.shift-label) for screen
// readers and for the Jeff's Junk overlay, which matches bookings to shifts by it.
function cellEntry(sh){
  const ids=getShiftTasks(sh),t=taskOf(ids[0]),lbl=ids.map(taskLabel).join(" + ");
  const when=sh.start&&sh.end?rangeShort(sh.start,sh.end):"";
  if(shiftIsAway(sh))return`<div class="status-label ce-away" title="${esc(lbl)}${when?" "+when:""}">${typeIcon(t)}<span>${esc(lbl)}</span>${when?`<span class="ce-t">${when}</span>`:""}</div>`;
  return`<div class="shift-bar ce-job" style="--tb:${t?t.bg:"#f1f5f9"};--tt:${t?t.text:"#334155"}" title="${esc(lbl)}${when?" "+when:""}">${typeTile(t,24)}<span class="shift-txt"><span class="shift-label">${esc(lbl)}</span><span class="shift-times">${when}</span></span></div>`;
}
function buildGrid(){
  const ws=getWS(S.weekOffset);
  const todayName=mTodayName();
  const isCurrentWeek=S.weekOffset===0;

  let h=`<table class="sched-grid sc-grid"><thead><tr><th class="name-col"><div style="display:flex;align-items:center;justify-content:space-between;gap:4px">TEAM<button onclick="event.stopPropagation();JWG.toggleAlphaSort()" title="${S.sortAlpha?"Sorted A–Z (click for crews)":"Sort A–Z"}" class="az-btn${S.sortAlpha?" on":""}">A–Z</button></div></th>`;
  S.activeDays.forEach(d=>{
    const dt=new Date(ws);dt.setDate(dt.getDate()+DAYS.indexOf(d));
    const isToday=isCurrentWeek&&d===todayName;
    h+=`<th class="day-col${isToday?" is-today":""}${WEEKEND.includes(d)?" is-wknd":""}">
      <div class="th-day-wrap${isToday?" is-today":""}">
        <div class="th-day${isToday?" is-today":""}">${d.slice(0,3).toUpperCase()}</div>
        <div class="th-date${isToday?" is-today":""}">${dt.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
      </div>
    </th>`;
  });
  h+=`</tr></thead><tbody>`;

  // Soft-removed people only keep a row while this week still holds their shifts
  // (badged, so nothing vanishes silently) — otherwise they're gone from the grid.
  const gridEmps=S.employees.filter(e=>!e.hidden||empHasWeekData(S.schedule[e.id]));
  const bands=crewBands(gridEmps);
  const _nCols=S.activeDays.length+1;
  let empIdx=-1;
  bands.forEach(band=>{
    if(band.name){
      const onNow=band.emps.filter(e=>isCurrentWeek&&normDay((S.schedule[e.id]||{})[todayName]).status==="work").length;
      h+=`<tr class="crew-band"><td colspan="${_nCols}">
        <span class="cb-name">${esc(band.name)}</span>
        <span class="cb-count">${band.emps.length}</span>
        ${isCurrentWeek?`<span class="cb-today">${onNow} on today</span>`:""}
      </td></tr>`;
    }
    band.emps.forEach(emp=>{
      empIdx++;
      const sc=S.schedule[emp.id]||defSched();
      const hrs=countH(sc);
      const[abg,afg]=ac(emp.name);
      const tipText=hrs>0?`${hrs}h scheduled this week`:"No hours this week";
      h+=`<tr class="emp-row" draggable="${S.sortAlpha?"false":"true"}" data-empid="${emp.id}" data-empidx="${empIdx}">
        <td class="name-col">
          <div class="emp-cell-inner">
            ${S.sortAlpha?"":`<span class="drag-handle" data-tip="Drag to reorder" title="Drag to reorder">⠿</span>`}
            <div class="avatar" data-tip="${tipText}" style="background:${abg};color:${afg};width:34px;height:34px;font-size:12px;flex-shrink:0">${empInitials(emp.name)}</div>
            <div class="emp-who"><div class="emp-name">${esc(emp.name)}${emp.manager?` <span class="emp-mgr" title="Manager of this crew — a label, not a permission">MGR</span>`:""}${emp.hidden?` <span class="emp-removed" title="Removed on the Team page — row stays while this week still has their shifts">REMOVED</span>`:""}</div>
              <div class="emp-hbar"><i style="width:${Math.min(100,Math.round(hrs/45*100))}%"></i></div></div>
            <div class="emp-hrs" id="hbadge_${emp.id}">${hrs}h</div>
          </div>
        </td>`;
      S.activeDays.forEach(d=>{
        const dd=normDay(sc[d]);
        const content=dd.shifts.length?`<div class="shift-stack">${dd.shifts.map(cellEntry).join("")}</div>`:"";
        const isTodayCell=isCurrentWeek&&d===todayName;
        const sel=_ed&&_ed.empId===emp.id&&_ed.day===d;
        const noteIndicator=dd.note?`<span class="cell-note" title="${esc(dd.note)}" data-tip="${esc(dd.note)}"></span>`:"";
        h+=`<td class="day-cell${isTodayCell?" is-today":""}${WEEKEND.includes(d)?" is-wknd":""}${content?"":" empty-cell"}${sel?" is-sel":""}" onclick="JWG.openShiftModal('${emp.id}','${d}')">${content}${noteIndicator}</td>`;
      });
      h+=`</tr>`;
    });
  });
  let footCells="";
  S.activeDays.forEach(d=>{
    let cnt=0,hsum=0;
    gridEmps.forEach(emp=>{const dd=normDay((S.schedule[emp.id]||{})[d]);if(dd.status==="work"){cnt++;hsum+=dayHours(dd);}});
    footCells+=`<td class="foot-cell"><b>${cnt} on</b> · ${Math.round(hsum*10)/10}h</td>`;
  });
  h+=`</tbody><tfoot><tr class="sched-foot"><td class="name-col foot-name">On shift</td>${footCells}</tr></tfoot></table>`;
  return h;
}

// ── PHONE (≤900px): one card per person ──
// Barb liked the person cards for phones (2026-10-20). The grid hides below 900px and these
// take over: each card is one person's week, one square per day. Tapping a square opens the
// same day editor as the grid, as a sheet from the bottom.
function mTodayName(){return["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];}
function mSetCrew(i){S.mCrew=S._mCrews[i];render();}
function mDaySquare(emp,d,dd,isToday){
  const sel=_ed&&_ed.empId===emp.id&&_ed.day===d;
  const cls=`pc-day${isToday?" is-today":""}${sel?" is-sel":""}`;
  const attrs=`data-empid="${emp.id}" data-day="${d}" onclick="JWG.openShiftModal('${emp.id}','${d}')" aria-label="${esc(emp.name)}, ${d}"`;
  if(!dd.shifts.length)return`<button class="${cls} is-empty" ${attrs}>+</button>`;
  const sh=dd.shifts[0],t=taskOf(getShiftTasks(sh)[0]),more=dd.shifts.length>1?`<i class="pc-more">+${dd.shifts.length-1}</i>`:"";
  const when=sh.start&&sh.end?rangeShort(sh.start,sh.end):"";
  if(shiftIsAway(sh))return`<button class="${cls} is-away" ${attrs}>${typeIcon(t)}<span>${when||esc(taskLabel(t?t.id:""))}</span>${more}</button>`;
  return`<button class="${cls}" style="background:${t?t.dot:"#94a3b8"}" ${attrs}>${typeIcon(t)}<span>${when}</span>${more}</button>`;
}
function buildMobileSched(){
  const isCur=S.weekOffset===0,todayName=mTodayName();
  const list=S.employees.filter(e=>!e.hidden||empHasWeekData(S.schedule[e.id]));
  const bands=crewBands(list);
  const crew=S.mCrew&&bands.some(b=>b.name===S.mCrew)?S.mCrew:"All";
  const circ=2*Math.PI*19;
  // Crew names come from the Team page, so the buttons pass a position, never the name itself.
  S._mCrews=["All",...bands.map(b=>b.name).filter(Boolean)];
  let h=`<div class="pc-filters">${S._mCrews.map((n,i)=>`<button class="pc-f${crew===n?" on":""}" onclick="JWG.mSetCrew(${i})">${esc(n)}</button>`).join("")}</div>`;
  bands.forEach(band=>{
    if(crew!=="All"&&band.name!==crew)return;
    if(band.name)h+=`<div class="pc-crew">${esc(band.name)}</div>`;
    band.emps.forEach(emp=>{
      const sc=S.schedule[emp.id]||defSched(),hrs=countH(sc);
      const[abg,afg]=ac(emp.name);
      const ring=hrs>=40?"#16a34a":hrs>=24?"#ca8a04":"#cbd5e1";
      const dash=(Math.min(1,hrs/45)*circ).toFixed(1)+" "+circ.toFixed(1);
      h+=`<div class="pc-card">
        <div class="pc-head">
          <span class="pc-av" style="background:${abg};color:${afg}">${empInitials(emp.name)}</span>
          <div class="pc-name"><b>${esc(emp.name)}</b>${emp.manager?`<span class="emp-mgr">MGR</span>`:""}</div>
          <span class="pc-ring"><svg viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="19" fill="none" stroke="#eef1f0" stroke-width="5"/><circle cx="23" cy="23" r="19" fill="none" stroke="${ring}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${dash}" transform="rotate(-90 23 23)"/></svg><b>${hrs}h</b></span>
        </div>
        <div class="pc-week" style="grid-template-columns:repeat(${S.activeDays.length},minmax(0,1fr))">
          ${S.activeDays.map(d=>`<span class="pc-dl${isCur&&d===todayName?" is-today":""}">${d.slice(0,3)}</span>`).join("")}
          ${S.activeDays.map(d=>mDaySquare(emp,d,normDay(sc[d]),isCur&&d===todayName)).join("")}
        </div>
      </div>`;
    });
  });
  return h;
}

function scrollGridToToday(){
  if(S.weekOffset!==0||S._todayScrolled)return;
  const gw=document.getElementById("gw");if(!gw)return;
  const col=gw.querySelector("th.day-col.is-today");if(!col)return;
  if(gw.scrollWidth>gw.clientWidth+8)gw.scrollLeft=Math.max(0,col.offsetLeft-220);
  S._todayScrolled=true;
}

// A different week closes the day editor: the day it was showing is not on screen any more.
function prevW(){S.weekOffset--;_ed=null;loadWeekSched();render();}
function nextW(){S.weekOffset++;_ed=null;loadWeekSched();render();}
function goToday(){S.weekOffset=0;_ed=null;loadWeekSched();render();}
function toggleDay(d){
  const i=S.activeDays.indexOf(d);
  if(i>=0)S.activeDays.splice(i,1);
  else S.activeDays=[...DAYS.filter(x=>[...S.activeDays,d].includes(x))];
  render();
}
function toggleAlphaSort(){S.sortAlpha=!S.sortAlpha;render();}
// A week with no saved row starts EMPTY. It used to silently pre-fill from the
// person's "usual week" (and auto-write rows on boot) — schedules appeared that
// nobody had put there, which confused the office. Copy-last-week was removed
// the same day (Jake: dangerous). A saved week is now either applied EXPLICITLY
// from the Same every week modal, or — if that person is set to repeat — drawn as a
// written by the "Fill in this week" button, which is still someone pressing
// something. loadWeekSched stays honest: what it puts in S.schedule is only
// ever what the database holds.
function loadWeekSched(){const w=wkey(S.weekOffset);S.employees.forEach(e=>{const f=S.allSchedules.find(s=>s.employee_id===e.id&&s.week_start===w);S.schedule[e.id]=f?migrateSched(JSON.parse(JSON.stringify(f.schedule_data))):defSched();});}

// ── SAVED SCHEDULES ──
// A per-person template week (jwg_employees.usual_week). Save someone's typical
// week once, then apply it to any week with one tap — nothing happens on its own.
function openUsualWeeks(){renderUsualWeeks(true);}
function renderUsualWeeks(fresh){
  const tm=TM();
  let rows="";
  visEmps().forEach(e=>{
    const[abg,afg]=ac(e.name);
    const tpl=e.usual_week;
    // "Has a template" and "has anything IN it" are different questions, and the
    // list used to ask only the first — so an empty template still offered Apply.
    const tplHasData=!!tpl&&DAYS.some(d=>dayHasData(tpl[d]));
    let summary;
    if(tpl&&!tplHasData){
      summary=`<div style="font-size:11.5px;color:var(--warn-ink,#9a3412);background:#fff7ed;border:1px solid rgba(249,115,22,0.28);border-radius:7px;padding:6px 9px;margin-top:6px;display:inline-block;font-weight:650">⚠ This saved schedule is empty — it holds no shifts, so there is nothing to apply. Build their week on the grid, then save it again.</div>`;
    } else if(tpl){
      const chips=DAYS.filter(d=>normDay(tpl[d]).shifts.length).map(d=>{
        const day=normDay(tpl[d]);
        const sh=day.shifts[0];
        const tid=getShiftTasks(sh)[0];
        const t=taskOf(tid);
        const lbl=taskLabel(tid)+(sh.start&&sh.end?" "+fmtRange(sh.start,sh.end):"")+(day.shifts.length>1?" +"+(day.shifts.length-1):"");
        const style=shiftIsAway(sh)?"background:#eef1f0;color:#475569":`background:${t?t.bg:"var(--surface-sm)"};color:${t?t.text:"var(--fg-muted)"}`;
        return `<span style="${style};padding:3px 8px;border-radius:12px;font-size:10.5px;font-weight:700;display:inline-flex;gap:5px;align-items:center;white-space:nowrap"><b style="opacity:.55;font-weight:800">${d.slice(0,3).toUpperCase()}</b>${esc(lbl)}</span>`;
      });
      summary=chips.length?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:7px">${chips.join("")}</div>`:`<div style="font-size:11.5px;color:var(--fg-muted);margin-top:5px">Saved schedule is empty</div>`;
    } else {
      summary=`<div style="font-size:11.5px;color:var(--fg-muted);margin-top:5px">No schedule saved yet — set up their week on the grid, then hit "Save this week"</div>`;
    }
    rows+=`<div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div class="avatar" style="background:${abg};color:${afg};width:32px;height:32px;font-size:11px;flex-shrink:0">${empInitials(e.name)}</div>
        <div style="flex:1;min-width:0;font-weight:700;font-size:13.5px">${esc(e.name)}</div>
        ${tplHasData?`<div class="uw-rep" title="On: ${esc(e.name)} appears in the Fill in this week button whenever their week is still empty.">
          <button class="${e.repeats_weekly?"":"on"}" onclick="JWG.setRepeats('${e.id}',false)">Different each week</button>
          <button class="${e.repeats_weekly?"on":""}" onclick="JWG.setRepeats('${e.id}',true)">🔁 Same every week</button>
        </div>`:""}
        ${tplHasData?`<button class="ctrl-btn" onclick="JWG.applyUsualWeek('${e.id}')" title="Fill in ${esc(e.name)}'s week now, without waiting for the button on the schedule">▸ Fill in their week</button>`:""}
        <button class="ctrl-btn" onclick="JWG.saveUsualWeek('${e.id}')" title="Store the week you are looking at as ${esc(e.name)}'s normal week">💾 Save this week</button>
        ${tpl?`<button class="ctrl-btn ctrl-btn-danger" onclick="JWG.clearUsualWeek('${e.id}')">✕ Clear</button>`:""}
      </div>
      ${summary}
    </div>`;
  });
  const _repN=visEmps().filter(e=>e.repeats_weekly).length;
  const h=`<div class="modal-title">🔁 Same every week</div>
  <div class="modal-sub">Some people work the exact same week, every week. Set theirs up once here and you stop re-entering it.<br><br><b>1.</b> Build their week on the schedule, then press <b>Save this week</b> — that stores it as their normal week.<br><b>2.</b> Switch them to <b>Same every week</b>.<br><br>From then on, any week that is still empty for them shows a <b>Fill in this week</b> button at the top of the schedule. One press and their week is in — <b>real shifts, the same as any other</b>. It only ever fills <b>empty</b> days, so a shift, a day off or a sick day you have already set is never touched.${_repN?`<br><br><b>${_repN}</b> ${_repN===1?"person is":"people are"} set to the same week every week.`:""}</div>
  <div class="uw-list">${rows}</div>
  <div class="ma-actions"><button class="ctrl-btn" onclick="JWG.closeModal()">Done</button></div>`;
  if(fresh)openModal(h,null,true);else updateModal(h,null,true);
}
async function applyUsualWeek(empId){
  const emp=S.employees.find(e=>e.id===empId);
  if(!emp||!emp.usual_week)return;
  // A template can exist and still hold nothing — see saveUsualWeek. Applying one
  // of those replaced a real week with seven blank days, which is how a saved
  // schedule became a way to lose shifts. The button is hidden for these now; this
  // is the belt to that braces, because the cost of getting it wrong is deleted work.
  if(!DAYS.some(d=>dayHasData(emp.usual_week[d]))){
    toast(`${emp.name}'s saved schedule is empty — nothing to apply. Build their week, then save it again.`,"error");
    return;
  }
  const w=wlbl(S.weekOffset);
  if(empHasWeekData(S.schedule[empId])&&!(await jwgConfirm({title:"Apply saved schedule",target:emp.name,message:`${w} already has shifts for ${emp.name}. Replace them with the saved schedule?`,confirmLabel:"Replace"})))return;
  S.schedule[empId]=migrateSched(JSON.parse(JSON.stringify(emp.usual_week)));
  autoSave(empId);
  toast(`Applied ${emp.name}'s saved schedule to ${w}`);
  renderUsualWeeks(false);
}
async function saveUsualWeek(empId){
  const emp=S.employees.find(e=>e.id===empId);if(!emp)return;
  const sc=S.schedule[empId]||defSched();
  // This saves the week you happen to be LOOKING at. Open it on a week someone has
  // not been filled in on and the old code stored seven blank days — then said
  // "Saved — apply it to any week with one tap". Four people ended up with empty
  // templates that offered an Apply which did nothing visible, and applying one
  // OVER a real week cleared the row (Jake, 2026-10-02: "it didnt work for me").
  // Fail loudly instead of saving nothing and claiming success.
  if(!empHasWeekData(sc)){
    toast(`Nothing to save — ${emp.name} has no shifts in ${wlbl(S.weekOffset)}. Build their week on the grid first.`,"error");
    return;
  }
  const tpl=JSON.parse(JSON.stringify(sc));
  DAYS.forEach(d=>{if(tpl[d])delete tpl[d].note;});  // notes are week-specific
  try{
    const _now=new Date().toISOString();
    await sbF("PATCH",`jwg_employees?id=eq.${empId}`,{usual_week:tpl,usual_week_saved_at:_now});
    emp.usual_week=tpl;emp.usual_week_saved_at=_now;
    toast(`Saved ${emp.name}'s schedule — apply it to any week with one tap`);
    renderUsualWeeks(false);
  }catch(e){toast("Couldn't save the schedule: "+e.message,"error");}
}
async function setRepeats(empId,on){
  const emp=S.employees.find(e=>e.id===empId);if(!emp)return;
  // Only a week with something in it can repeat — otherwise the flag would be a
  // promise to show nothing, which is how the blank-template mess read.
  if(on&&!DAYS.some(d=>dayHasData((emp.usual_week||{})[d]))){
    toast(`${emp.name} has no normal week saved yet — build their week, then press Save this week.`,"error");
    return;
  }
  const prev=!!emp.repeats_weekly;
  emp.repeats_weekly=!!on;
  renderUsualWeeks(false);
  try{
    await sbF("PATCH",`jwg_employees?id=eq.${empId}`,{repeats_weekly:!!on});
    // Turning it OFF leaves every week already written exactly as it is — only
    // the ghosts stop appearing.
    toast(on?`${emp.name} is now set to the same week every week — an empty week offers a Fill in this week button`:`${emp.name} is back to a different week each time (weeks already filled in are untouched)`);
    refreshGrid();
  }catch(e){
    emp.repeats_weekly=prev;renderUsualWeeks(false);
    toast("Couldn't change that: "+e.message,"error");
  }
}
async function clearUsualWeek(empId){
  const emp=S.employees.find(e=>e.id===empId);if(!emp)return;
  if(!(await jwgConfirm({title:"Clear saved schedule",target:emp.name,message:"Their saved template is deleted. Weeks already scheduled are not touched.",confirmLabel:"Clear"})))return;
  try{
    await sbF("PATCH",`jwg_employees?id=eq.${empId}`,{usual_week:null});
    emp.usual_week=null;
    toast(`Cleared ${emp.name}'s saved schedule`);
    renderUsualWeeks(false);
  }catch(e){toast("Couldn't clear the schedule: "+e.message,"error");}
}

// ── AUTO-SAVE (debounced) ──
let _autoSaveTimer=null;
// Snapshot: {weekKey, ws, snapshot[]} captured at call time so navigation can't corrupt the save
let _pendingSave=null;
function autoSave(empId){
  const ws=getWS(S.weekOffset);
  const w=localDateStr(ws);
  // Set cooldown so realtime doesn't overwrite our local edits with stale echo
  const cooldownIds=empId?[empId]:S.employees.map(e=>e.id);
  cooldownIds.forEach(id=>{
    _schedSaveCooldown[id]=true;
    clearTimeout(_schedSaveCooldown["_t_"+id]);
    _schedSaveCooldown["_t_"+id]=setTimeout(()=>{delete _schedSaveCooldown[id];delete _schedSaveCooldown["_t_"+id];},3000);
  });
  // Snapshot the changed employee(s) RIGHT NOW
  // A blanket save must never touch someone who has been removed. Their rows were
  // deleted on the Team page, but a tab open at the time still holds the old grid
  // in memory — and upserting it would put every one of their shifts straight back.
  // The pickers that trigger a blanket save only offer visEmps() anyway, so nobody
  // loses an edit they could actually have made.
  const toSave=empId?S.employees.filter(e=>e.id===empId):S.employees.filter(e=>!e.hidden);
  const newEntries=toSave.map(e=>({emp:e,data:JSON.parse(JSON.stringify(S.schedule[e.id]||defSched()))}));
  if(_pendingSave&&_pendingSave.w===w){
    // Merge: update existing entries for same week, add any new ones
    newEntries.forEach(ne=>{const idx=_pendingSave.snapshot.findIndex(s=>s.emp.id===ne.emp.id);if(idx>=0)_pendingSave.snapshot[idx]=ne;else _pendingSave.snapshot.push(ne);});
  } else {
    _pendingSave={w,ws,snapshot:newEntries};
  }
  showSaveStatus("saving");
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer=setTimeout(()=>_doAutoSave(),800);
}
async function _doAutoSave(){
  if(!_pendingSave)return;
  const{w,ws,snapshot}=_pendingSave;
  _pendingSave=null;
  try{
    await Promise.all(snapshot.map(({emp,data})=>upsertSched(emp.id,ws,data)));
    snapshot.forEach(({emp,data})=>{const i=S.allSchedules.findIndex(s=>s.employee_id===emp.id&&s.week_start===w);const en={id:`${emp.id}_${w}`,employee_id:emp.id,week_start:w,schedule_data:data};if(i>=0)S.allSchedules[i]=en;else S.allSchedules.push(en);});
    showSaveStatus("saved");
  }catch(e){showSaveStatus("error");toast("Auto-save failed: "+e.message,"error");}
}
function showSaveStatus(state){setSaveStatus(state);}

// Analytics
function getPeriodWeeks(period){
  // Returns array of {key, label} for weeks in the selected period, most recent first
  const thisMonday=getWS(0);
  const weeks=[];
  const addW=(off,lbl)=>{
    const k=localDateStr(getWS(off));
    weeks.push({key:k,label:lbl||( off===0?"This Week":off===-1?"Last Week":`${-off} Weeks Ago`),offset:off});
  };
  if(period==="this_week"){addW(0,"This Week");}
  else if(period==="last_week"){addW(-1,"Last Week");}
  else if(period==="2w"){addW(0);addW(-1);}
  else if(period==="4w"){for(let i=0;i<4;i++)addW(-i);}
  else if(period==="this_month"){
    // Weeks whose Monday falls in current calendar month
    const m=thisMonday.getMonth(),y=thisMonday.getFullYear();
    for(let i=0;i<6;i++){const d=getWS(-i);if(d.getFullYear()===y&&d.getMonth()===m)addW(-i);}
  }
  else if(period==="last_month"){
    const ref=new Date(thisMonday);ref.setDate(1);ref.setMonth(ref.getMonth()-1);
    const lm=ref.getMonth(),ly=ref.getFullYear();
    for(let i=1;i<9;i++){const d=getWS(-i);if(d.getFullYear()===ly&&d.getMonth()===lm)addW(-i);}
  }
  else if(period==="3m"){for(let i=0;i<13;i++)addW(-i);}
  else if(period==="6m"){for(let i=0;i<26;i++)addW(-i);}
  else if(period==="year"){for(let i=0;i<52;i++)addW(-i);}
  else if(period==="all"){
    // Use all saved schedule weeks, sorted descending
    const allKeys=[...new Set(S.allSchedules.map(s=>s.week_start))].sort((a,b)=>b.localeCompare(a));
    allKeys.forEach((k,i)=>{const ws=new Date(k+"T12:00:00");weeks.push({key:k,label:i===0?"Most Recent":`${ws.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`,offset:null});});
  }
  return weeks;
}

const PERIODS=[
  {id:"this_week",label:"This Week"},
  {id:"last_week",label:"Last Week"},
  {id:"2w",label:"2 Weeks"},
  {id:"4w",label:"4 Weeks"},
  {id:"this_month",label:"This Month"},
  {id:"last_month",label:"Last Month"},
  {id:"3m",label:"3 Months"},
  {id:"6m",label:"6 Months"},
  {id:"year",label:"1 Year"},
  {id:"all",label:"All Time"},
];

/* ===== analytics.js ===== */
// ── ANALYTICS.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

function buildAnalytics(){
  const tm=TM();
  const period=S.aPeriod||"4w";
  const weeks=getPeriodWeeks(period);
  const allWks=weeks.map(w=>w.key);
  const periodLabel=PERIODS.find(p=>p.id===period)?.label||period;

  let h=`<div class="card"><div class="awrap">
  <div class="shdr">
    <div><div class="stitle">Hours &amp; coverage</div><div class="ssub">Totals for the selected period</div></div>
  </div>`;

  if(!S.employees.length){h+=`<div class="empty">No data yet.</div></div></div>`;return h;}

  // Aggregate stats across period
  const empFilter=S.hFilter||"all";
  const empData=(empFilter==="all"?S.employees:S.employees.filter(e=>e.id===empFilter)).map(emp=>{
    const ss=S.allSchedules.filter(s=>s.employee_id===emp.id&&allWks.includes(s.week_start));
    const totalH=ss.reduce((n,s)=>n+countH(migrateSched(s.schedule_data)),0);
    // Days per type, jobs and time away alike: a type counts once on a day however many
    // entries it has there.
    const tally={};
    ss.forEach(s=>{
      const sched=migrateSched(s.schedule_data);
      DAYS.forEach(d=>{new Set(sched[d].shifts.flatMap(getShiftTasks)).forEach(tid=>{tally[tid]=(tally[tid]||0)+1;});});
    });
    const daysSick=tally.sick||0,daysNonwork=tally.nowork||0;
    const daysOff=Object.keys(tally).filter(k=>isAwayTask(k)&&k!=="sick"&&k!=="nowork").reduce((n,k)=>n+tally[k],0);
    return{...emp,totalH:Math.round(totalH*10)/10,tally,daysOff,daysSick,daysNonwork};
  }).sort((a,b)=>a.name.localeCompare(b.name));

  const mxH=Math.max(...empData.map(d=>d.totalH),1);
  const totH=Math.round(empData.reduce((n,e)=>n+e.totalH,0)*10)/10;
  const totSick=empData.reduce((n,e)=>n+e.daysSick,0);
  const totOff=empData.reduce((n,e)=>n+e.daysOff,0);
  const totNonwork=empData.reduce((n,e)=>n+e.daysNonwork,0);

  // Summary stat tiles
  h+=`<div class="stat-grid-3" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:22px">
    <div class="stat-tile green">
      <div class="stat-num" data-count="${totH}" data-suffix="h">0h</div>
      <div class="stat-label">Total Hours</div>
    </div>
    <div class="stat-tile orange">
      <div class="stat-num" data-count="${totSick}">0</div>
      <div class="stat-label">Sick Days</div>
    </div>
    <div class="stat-tile grey">
      <div class="stat-num" data-count="${totOff}">0</div>
      <div class="stat-label">Days off &amp; vacation</div>
    </div>
    <div class="stat-tile grey">
      <div class="stat-num" data-count="${totNonwork}">0</div>
      <div class="stat-label">No work</div>
    </div>
  </div>`;

  // Employee totals
  h+=`<div class="sect-label" style="margin-bottom:10px">Employee Totals — ${periodLabel}</div>`;
  empData.forEach(emp=>{
    const[abg,afg]=ac(emp.name);
    const top=Object.entries(emp.tally).filter(([k])=>!isAwayTask(k)).sort((a,b)=>b[1]-a[1])[0];
    h+=`<div class="acard"><div style="display:flex;align-items:center;gap:12px">
      <div class="avatar" style="background:${abg};color:${afg}">${empInitials(emp.name)}</div>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-weight:600;font-size:14px;color:var(--fg)">${esc(emp.name)}</span>
          <div style="display:flex;gap:8px;align-items:center">
            ${top?`<span class="chip" style="background:${tm[top[0]]?.bg};color:${tm[top[0]]?.text}">${tm[top[0]]?.label}</span>`:""}
            <span style="font-weight:700;font-size:15px;color:var(--accent)">${emp.totalH}h</span>
          </div>
        </div>
      </div></div>
    <div class="ptrack"><div class="pbar" style="width:${(emp.totalH/mxH*100).toFixed(1)}%"></div></div>
    <div class="chips">`;
    jobTypes().filter(t=>emp.tally[t.id]>0).forEach(t=>{h+=`<span class="chip" style="background:${t.bg};color:${t.text}">${esc(t.label)}: ${emp.tally[t.id]}d</span>`;});
    awayTypes().filter(t=>emp.tally[t.id]>0).forEach(t=>{h+=`<span class="chip" style="background:#eef1f0;color:#475569;border:1px solid rgba(71,85,105,0.2);display:inline-flex;align-items:center;gap:5px">${typeIcon(t)}${esc(t.label)}: ${emp.tally[t.id]}d</span>`;});
    h+=`</div></div>`;
  });

  h+=`<div class="legbox" style="margin-top:18px"><div class="sect-label" style="margin-bottom:12px">Task Legend</div><div class="chips">`;
  jobTypes().forEach(t=>{h+=`<div style="display:flex;align-items:center;gap:6px;background:${t.bg};color:${t.text};padding:5px 11px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid ${t.dot}30"><span style="width:6px;height:6px;border-radius:50%;background:${t.dot};display:inline-block"></span>${esc(t.label)}</div>`;});
  h+=`</div></div></div></div>`;return h;
}

// History
function getHistoryWeekKeys(period){
  const thisMonday=getWS(0);
  const keys=[];
  const addK=(off)=>{const k=localDateStr(getWS(off));if(!keys.includes(k))keys.push(k);};
  if(period==="this_week"){addK(0);}
  else if(period==="last_week"){addK(-1);}
  else if(period==="2w"){addK(0);addK(-1);}
  else if(period==="4w"){for(let i=0;i<4;i++)addK(-i);}
  else if(period==="this_month"){const m=thisMonday.getMonth(),y=thisMonday.getFullYear();for(let i=0;i<6;i++){const d=getWS(-i);if(d.getFullYear()===y&&d.getMonth()===m)addK(-i);}}
  else if(period==="last_month"){const ref=new Date(thisMonday);ref.setDate(1);ref.setMonth(ref.getMonth()-1);const lm=ref.getMonth(),ly=ref.getFullYear();for(let i=1;i<9;i++){const d=getWS(-i);if(d.getFullYear()===ly&&d.getMonth()===lm)addK(-i);}}
  else if(period==="3m"){for(let i=0;i<13;i++)addK(-i);}
  else if(period==="6m"){for(let i=0;i<26;i++)addK(-i);}
  else if(period==="year"){for(let i=0;i<52;i++)addK(-i);}
  else if(period==="all"){[...new Set(S.allSchedules.map(s=>s.week_start))].sort((a,b)=>b.localeCompare(a)).forEach(k=>keys.push(k));}
  return keys;
}
function toggleHistoryWeek(wk){
  S.hOpen[wk]=!S.hOpen[wk];
  // just toggle DOM, no full re-render
  const grp=document.getElementById("wkg_"+wk);
  if(grp)grp.classList.toggle("open",!!S.hOpen[wk]);
}
/* ===== history.js ===== */
// ── HISTORY.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

function buildHistory(){
  const tm=TM();
  const period=S.aPeriod||"4w";
  const empFilter=S.hFilter||"all";
  const weekKeys=getHistoryWeekKeys(period);
  // Only weeks that have at least one saved schedule in that period
  const activeKeys=weekKeys.filter(k=>S.allSchedules.some(s=>s.week_start===k));

  let h=`<div class="card"><div class="hwrap">
  <div class="shdr"><div><div class="stitle">Past schedules</div><div class="ssub">Grouped by week — click any week to expand</div></div></div>`;

  if(!activeKeys.length){h+=`<div class="empty">No history for this period.</div></div></div>`;return h;}

  activeKeys.forEach(wk=>{
    const ws=new Date(wk+"T12:00:00"),we=new Date(ws);we.setDate(we.getDate()+6);
    const thisWk=wkey(0);
    const isCurrent=wk===thisWk;
    // label
    const wkOff=Math.round((new Date(thisWk+"T12:00:00")-ws)/(7*86400000));
    const wkLabel=isCurrent?"This Week":wkOff===1?"Last Week":wkOff===2?"2 Weeks Ago":wkOff===3?"3 Weeks Ago":`${ws.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;

    // Employees to show
    const empsToShow=empFilter==="all"?S.employees:S.employees.filter(e=>e.id===empFilter);
    const rows=empsToShow.filter(e=>S.allSchedules.some(s=>s.employee_id===e.id&&s.week_start===wk));
    if(!rows.length)return;

    // Stats
    let totalH=0,sickCount=0;
    rows.forEach(e=>{
      const s=S.allSchedules.find(sc=>sc.employee_id===e.id&&sc.week_start===wk);
      if(!s)return;
      const sched=migrateSched(s.schedule_data);
      totalH+=countH(sched);
      DAYS.forEach(d=>{if(sched[d].shifts.some(sh=>getShiftTasks(sh).includes("sick")))sickCount++;});
    });
    totalH=Math.round(totalH*10)/10;

    // Auto-open current week on first render
    if(isCurrent&&S.hOpen[wk]===undefined)S.hOpen[wk]=true;
    const isOpen=!!S.hOpen[wk];

    h+=`<div class="wk-group${isOpen?" open":""}" id="wkg_${wk}">
      <div class="wk-hdr${isCurrent?" is-current":""}" onclick="JWG.toggleHistoryWeek('${wk}')">
        <div class="wk-hdr-left">
          <span class="wk-badge ${isCurrent?"curr":"past"}">${wkLabel}</span>
          <span class="wk-date-str">${ws.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${we.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}<span>${rows.length} employee${rows.length!==1?"s":""} · ${totalH}h</span></span>
        </div>
        <div class="wk-hdr-right">
          <div class="wk-stat"><div class="wk-stat-v">${totalH}h</div><div class="wk-stat-l">scheduled</div></div>
          ${sickCount>0?`<div class="wk-stat"><div class="wk-stat-v" style="color:#c2410c">${sickCount}</div><div class="wk-stat-l">sick day${sickCount!==1?"s":""}</div></div>`:`<div class="wk-stat"><div class="wk-stat-v" style="color:var(--fg-muted)">—</div><div class="wk-stat-l">sick days</div></div>`}
          <div class="wk-chevron">▼</div>
        </div>
      </div>
      <div class="wk-body">`;

    // Collect tasks used this week for legend
    const usedTaskIds=new Set();

    rows.forEach(emp=>{
      const s=S.allSchedules.find(sc=>sc.employee_id===emp.id&&sc.week_start===wk);
      if(!s)return;
      const sched=migrateSched(s.schedule_data);
      const empH=countH(sched);
      const[abg,afg]=ac(emp.name);
      h+=`<div class="wk-emp-row">
        <div class="wk-name-col">
          <div class="avatar" style="background:${abg};color:${afg};width:28px;height:28px;font-size:11px;flex-shrink:0">${empInitials(emp.name)}</div>
          <div><div class="emp-name">${esc(emp.name)}</div><div class="emp-hrs">${empH}h</div></div>
        </div>
        <div class="wk-days-col">`;
      DAYS.forEach(d=>{
        const day=normDay(sched[d]);
        const note=day.note||"";
        if(day.shifts.length){
          const sh=day.shifts[0],firstTask=getShiftTasks(sh)[0],t=taskOf(firstTask),away=shiftIsAway(sh);
          if(t&&!away)usedTaskIds.add(firstTask);
          const multiLabel=day.shifts.length>1?`+${day.shifts.length-1}`:"";
          const look=away?"background:#eef1f0;color:#475569;border-color:rgba(71,85,105,0.15)":`background:${t?t.bg:"var(--surface-sm)"};color:${t?t.text:"var(--fg-subtle)"};border-color:${t?t.dot+"40":"var(--border)"}`;
          const full=day.shifts.map(x=>getShiftTasks(x).map(taskLabel).join(" + ")+(x.start?` ${fmtRange(x.start,x.end)}`:"")).join(", ");
          h+=`<div class="dc2" style="${look}" title="${d}: ${esc(full)}${note?" · "+esc(note):""}">
            <span class="dc-d">${d.slice(0,3).toUpperCase()}</span>
            <span class="dc-t">${esc(taskLabel(firstTask))}${multiLabel?`<span style="font-size:8px;opacity:.7"> ${multiLabel}</span>`:""}</span>
            ${sh.start?`<span class="dc-r">${fmtRange(sh.start,sh.end)}</span>`:""}
            ${note?`<span class="dc-n">${esc(note)}</span>`:""}
          </div>`;
        } else {
          h+=`<div class="dc2" style="background:transparent;color:rgba(0,0,0,0.18);border-color:transparent"><span class="dc-d">${d.slice(0,3).toUpperCase()}</span><span class="dc-t">—</span></div>`;
        }
      });
      h+=`</div>
        <div class="wk-total-col"><div class="wk-total-v">${empH}h</div><div class="wk-total-l">total</div></div>
      </div>`;
    });

    // Legend
    const legendTasks=tasks.filter(t=>usedTaskIds.has(t.id));
    if(legendTasks.length){
      h+=`<div class="wk-legend"><span class="wk-legend-lbl">Tasks</span>`;
      legendTasks.forEach(t=>{h+=`<div style="display:flex;align-items:center;gap:5px;background:${t.bg};color:${t.text};padding:3px 8px;border-radius:20px;font-size:10px;font-weight:600;border:1px solid ${t.dot}30"><span style="width:5px;height:5px;border-radius:50%;background:${t.dot};display:inline-block"></span>${esc(t.label)}</div>`;});
      h+=`</div>`;
    }
    h+=`</div></div>`;
  });

  h+=`</div></div>`;return h;
}

// Team
/* ===== drag helpers (the old Team tab was retired — people are managed on
   the main Team page, which mirrors into jwg_employees automatically) ===== */

// ── DRAG & DROP — shared helpers ──
function saveEmpOrder(){const ids=S.employees.map(e=>e.id);localStorage.setItem("ss_emp_order",JSON.stringify(ids));saveSetting("emp_order",ids);}
function applyStoredOrder(){
  const stored=localStorage.getItem("ss_emp_order");
  if(!stored)return;
  try{
    const ids=JSON.parse(stored);
    S.employees.sort((a,b)=>{const ai=ids.indexOf(a.id),bi=ids.indexOf(b.id);if(ai<0)return 1;if(bi<0)return-1;return ai-bi;});
  }catch(e){}
}

// ── DRAG — Schedule Grid rows ──
function initGridDrag(){
  if(S.sortAlpha)return;
  const rows=document.querySelectorAll(".emp-row[data-empid]");
  let dragId=null;
  rows.forEach(row=>{
    row.addEventListener("dragstart",e=>{
      dragId=row.dataset.empid;
      row.classList.add("is-dragging");
      e.dataTransfer.effectAllowed="move";
    });
    row.addEventListener("dragend",()=>{
      dragId=null;
      rows.forEach(r=>r.classList.remove("is-dragging","drag-over-above","drag-over-below"));
    });
    row.addEventListener("dragover",e=>{
      if(!dragId||dragId===row.dataset.empid)return;
      e.preventDefault();
      rows.forEach(r=>r.classList.remove("drag-over-above","drag-over-below"));
      const rect=row.getBoundingClientRect();
      const mid=rect.top+rect.height/2;
      row.classList.add(e.clientY<mid?"drag-over-above":"drag-over-below");
    });
    row.addEventListener("dragleave",()=>{
      row.classList.remove("drag-over-above","drag-over-below");
    });
    row.addEventListener("drop",e=>{
      e.preventDefault();
      if(!dragId||dragId===row.dataset.empid)return;
      const rect=row.getBoundingClientRect();
      const mid=rect.top+rect.height/2;
      const insertBefore=e.clientY<mid;
      const fromIdx=S.employees.findIndex(em=>em.id===dragId);
      let toIdx=S.employees.findIndex(em=>em.id===row.dataset.empid);
      if(fromIdx<0||toIdx<0)return;
      const [moved]=S.employees.splice(fromIdx,1);
      toIdx=S.employees.findIndex(em=>em.id===row.dataset.empid);
      S.employees.splice(insertBefore?toIdx:toIdx+1,0,moved);
      saveEmpOrder();
      render();
    });
  });
}

// ── AUTH (Supabase) ──
let _currentUser=null;

/* ===== tasks.js ===== */
// ── TASKS.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

let WT={tasks:[],filter:"all"};

// ─── SUMMER SERVICES ───────────────────────────────────────────────────────

async function saveWorkshopTask(data){return sbF("POST","jwg_workshop_tasks",data);}
async function updateWorkshopTask(id,data){return sbF("PATCH","jwg_workshop_tasks?id=eq."+id,data);}
async function deleteWorkshopTask(id){return sbF("DELETE","jwg_workshop_tasks?id=eq."+id);}

function buildTasksPage(){
  return`<div class="card"><div class="wt-wrap" id="wt-root"><div style="text-align:center;padding:40px;color:var(--fg-subtle)">Loading tasks…</div></div></div>`;
}

async function initTasksPage(){
  try{
    WT.tasks=await loadWorkshopTasks();
    renderTasksBoard();
  }catch(e){
    const root=document.getElementById("wt-root");
    if(root)root.innerHTML=`<div style="color:#dc2626;padding:20px">Failed to load: ${e.message}</div>`;
  }
}

function wtSetFilter(f){
  WT.filter=f;
  renderTasksBoard();
}

function renderTasksBoard(){
  const root=document.getElementById("wt-root");
  if(!root)return;

  // Sort: by priority then created_at
  const sorted=[...WT.tasks].sort((a,b)=>{
    const pd=(PRIO_ORDER[a.priority]??1)-(PRIO_ORDER[b.priority]??1);
    return pd||0;
  });

  // Apply filter
  const filtered=WT.filter==="all"?sorted:sorted.filter(t=>t.priority===WT.filter);

  const todo=filtered.filter(t=>t.status==="todo");
  const done=filtered.filter(t=>t.status==="done");

  function taskCard(t){
    const isDone=t.status==="done";
    const prio=t.priority||"medium";
    const people=(t.assigned_to_arr||[]);
    let chips="";
    people.forEach(p=>{chips+=`<span class="wt-chip person-chip">👤 ${esc(p)}</span>`;});
    if(t.started_at)chips+=`<span class="wt-chip date-chip">Started ${fmtWTDate(t.started_at)}</span>`;
    if(t.completed_at)chips+=`<span class="wt-chip done-chip">Done ${fmtWTDate(t.completed_at)}</span>`;

    const actions=isDone
      ?`<button class="wt-action-btn wt-btn-reopen" onclick="JWG.wtReopen('${t.id}')">↩ Reopen</button>
         <button class="wt-action-btn wt-btn-edit" onclick="JWG.wtOpenEdit('${t.id}')">✎ Edit</button>
         <button class="wt-action-btn wt-btn-del" onclick="JWG.wtDelete('${t.id}')">✕</button>`
      :`<button class="wt-action-btn wt-btn-done" onclick="JWG.wtMarkDone('${t.id}')">✓ Mark Done</button>
         <button class="wt-action-btn wt-btn-edit" onclick="JWG.wtOpenEdit('${t.id}')">✎ Edit</button>
         <button class="wt-action-btn wt-btn-del" onclick="JWG.wtDelete('${t.id}')">✕</button>`;

    return`<div class="wt-card p-${prio}${isDone?" done-card":""}">
      <div class="wt-card-inner">
        <div class="wt-card-top">
          <div class="wt-card-title">${esc(t.title)}</div>
          <span class="wt-priority-badge ${PRIO_CLASS[prio]}">${PRIO_LABEL[prio]}</span>
        </div>
        ${t.description?`<div class="wt-card-desc">${esc(t.description)}</div>`:""}
        ${chips?`<div class="wt-card-meta">${chips}</div>`:""}
      </div>
      <div class="wt-card-actions">${actions}</div>
    </div>`;
  }

  const f=WT.filter;
  const filterBtns=[
    {k:"all",label:"All"},
    {k:"high",label:"High"},
    {k:"medium",label:"Medium"},
    {k:"low",label:"Low"},
  ].map(({k,label})=>`<button class="wt-filter-btn f-${k}${f===k?" active":""}" onclick="JWG.wtSetFilter('${k}')">${label}</button>`).join("");

  root.innerHTML=`
    <div class="wt-header">
      <div class="wt-title">Workshop Tasks <span>Downtime to-do list</span></div>
      <button class="wt-add-btn" onclick="JWG.wtOpenAdd()">+ Add Task</button>
    </div>
    <div class="wt-filters">${filterBtns}</div>
    <div class="wt-board">
      <div class="wt-col">
        <div class="wt-col-hdr">
          <span class="wt-col-label">To Do</span>
          <span class="wt-col-count">${todo.length}</span>
        </div>
        ${todo.length?todo.map(taskCard).join(""):`<div class="wt-empty"><div class="wt-empty-icon">✓</div>Nothing pending${f!=="all"?" at this priority":""} — good work!</div>`}
      </div>
      <div class="wt-col">
        <div class="wt-col-hdr">
          <span class="wt-col-label">Done</span>
          <span class="wt-col-count done-count">${done.length}</span>
        </div>
        ${done.length?done.map(taskCard).join(""):`<div class="wt-empty"><div class="wt-empty-icon">📋</div>Completed tasks will appear here.</div>`}
      </div>
    </div>`;
}

function fmtWTDate(d){
  if(!d)return"";
  const[y,m,day]=d.split("-");
  return new Date(+y,+m-1,+day).toLocaleDateString("en-US",{month:"short",day:"numeric"});
}

function wtOpenAdd(){wtOpenForm(null);}
function wtOpenEdit(id){wtOpenForm(id);}

let _wtSelPeople=[];
let _wtSelPrio="medium";

function wtPickPrio(p){
  _wtSelPrio=p;
  ["high","medium","low"].forEach(v=>{
    const el=document.getElementById("wt_prio_"+v);
    if(el)el.className=`wt-prio-opt opt-${v}${_wtSelPrio===v?" sel-"+v:""}`;
  });
}

function wtTogglePerson(name){
  if(_wtSelPeople.includes(name)){
    _wtSelPeople=_wtSelPeople.filter(n=>n!==name);
  }else{
    _wtSelPeople=[..._wtSelPeople,name];
  }
  document.querySelectorAll(".wt-person-opt").forEach(el=>{
    el.classList.toggle("sel",_wtSelPeople.includes(el.dataset.name));
  });
}

function wtOpenForm(id){
  const t=id?WT.tasks.find(x=>x.id===id):null;
  _wtSelPrio=t?.priority||"medium";
  _wtSelPeople=t?.assigned_to_arr?[...t.assigned_to_arr]:[];

  const prioOpts=["high","medium","low"].map(v=>{
    const labels={high:"🔴 High",medium:"🟡 Medium",low:"🟢 Low"};
    return`<button type="button" id="wt_prio_${v}" class="wt-prio-opt opt-${v}${_wtSelPrio===v?" sel-"+v:""}" onclick="JWG.wtPickPrio('${v}')">${labels[v]}</button>`;
  }).join("");

  const personBtns=S.employees.map(e=>`<button type="button" class="wt-person-opt${_wtSelPeople.includes(e.name)?" sel":""}" data-name="${esc(e.name)}" onclick="JWG.wtTogglePerson('${esc(e.name)}')">${esc(e.name)}</button>`).join("");

  const h=`
    <div class="modal-title">${t?"Edit Task":"New Workshop Task"}</div>
    <div class="modal-sub">${t?"Update the task details below.":"Add a task to do during downtime."}</div>
    <div class="wt-form-row">
      <label class="wt-form-label">Task Name *</label>
      <input class="wt-input" id="wt_title" placeholder="e.g. Clean paint booth, Organize shelving…" value="${esc(t?.title||"")}">
    </div>
    <div class="wt-form-row">
      <label class="wt-form-label">Description <span style="opacity:.5;font-weight:400;text-transform:none">(optional)</span></label>
      <textarea class="wt-textarea" id="wt_desc" placeholder="Any extra details…">${esc(t?.description||"")}</textarea>
    </div>
    <div class="wt-form-row">
      <label class="wt-form-label">Priority</label>
      <div class="wt-priority-picker">${prioOpts}</div>
    </div>
    <div class="wt-form-row">
      <label class="wt-form-label">Assign To <span style="opacity:.5;font-weight:400;text-transform:none">(select one or more)</span></label>
      <div class="wt-person-grid">${personBtns}</div>
    </div>
    <div class="wt-form-row">
      <label class="wt-form-label">Start Date</label>
      <input class="wt-input" type="date" id="wt_start" value="${t?.started_at||""}">
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
      <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
      <button class="modal-done" onclick="JWG.wtSaveForm('${id||""}')">${t?"Save Changes":"Add Task"}</button>
    </div>`;
  openModal(h,"500px");
}

async function wtSaveForm(id){
  const title=document.getElementById("wt_title")?.value.trim();
  if(!title){toast("Task name is required","error");return;}
  const data={
    title,
    description:document.getElementById("wt_desc")?.value.trim()||null,
    priority:_wtSelPrio,
    assigned_to_arr:_wtSelPeople,
    started_at:document.getElementById("wt_start")?.value||null,
  };
  try{
    if(id){
      await updateWorkshopTask(id,data);
      const idx=WT.tasks.findIndex(t=>t.id===id);
      if(idx>=0)WT.tasks[idx]={...WT.tasks[idx],...data};
    }else{
      const[created]=await saveWorkshopTask({...data,status:"todo"});
      WT.tasks.unshift(created);
    }
    closeModal();renderTasksBoard();toast(id?"Task updated":"Task added");
  }catch(e){toast(e.message,"error");}
}

async function wtMarkDone(id){
  const today=localDateStr(new Date());
  try{
    await updateWorkshopTask(id,{status:"done",completed_at:today});
    const t=WT.tasks.find(x=>x.id===id);
    if(t){t.status="done";t.completed_at=today;}
    renderTasksBoard();toast("Task marked done ✓");
  }catch(e){toast(e.message,"error");}
}

async function wtReopen(id){
  try{
    await updateWorkshopTask(id,{status:"todo",completed_at:null});
    const t=WT.tasks.find(x=>x.id===id);
    if(t){t.status="todo";t.completed_at=null;}
    renderTasksBoard();toast("Task reopened");
  }catch(e){toast(e.message,"error");}
}

async function wtDelete(id){
  if(!(await jwgConfirm({title:"Delete task",consequence:"This can't be undone.",confirmLabel:"Delete"})))return;
  try{
    await deleteWorkshopTask(id);
    WT.tasks=WT.tasks.filter(t=>t.id!==id);
    renderTasksBoard();toast("Task deleted");
  }catch(e){toast(e.message,"error");}
}

// On load — check session then boot app
/* ===== summer.js ===== */
// ── SUMMER.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

let SUM={locations:[],serviceTypes:[],locationServices:[],filter:"",sortBy:"name",serviceFilter:"",view:"locations"};

async function loadSummerData(){
  try{
    const[locs,types,ls]=await Promise.all([
      sbF("GET","jwg_service_locations?has_summer_service=eq.true&is_archived=eq.false&order=client_name"),
      sbF("GET","jwg_service_types?season=eq.summer&is_active=eq.true&order=sort_order"),
      sbF("GET","jwg_location_services?select=*,jwg_service_types!inner(season)&jwg_service_types.season=eq.summer")
    ]);
    SUM.locations=locs||[];
    SUM.serviceTypes=types||[];
    SUM.locationServices=ls||[];
  }catch(e){console.error("Load summer data failed:",e);toast("Failed to load summer services","error");}
}

function buildSummerPage(){
  return`<div class="card" id="sum-page"><div style="padding:20px;text-align:center;color:var(--fg-muted)">Loading…</div></div>`;
}

async function initSummerPage(){
  await loadSummerData();
  renderSummerPage();
}

// The Summer page carries two views: the lawn & grounds location list and the
// Cut Times tracker (app-cuttimes.js). This is the JWG landscaping side — not
// to be confused with the junk-side Extra Jobs page.
function summerViewSwitch(){
  return`<div class="sum-view-switch">
    <button class="sum-view-btn ${SUM.view==="locations"?"active":""}" onclick="JWG.setSummerView('locations')">Lawn &amp; grounds locations</button>
    <button class="sum-view-btn ${SUM.view==="cuts"?"active":""}" onclick="JWG.setSummerView('cuts')">Cut Times</button>
  </div>`;
}

function setSummerView(v){SUM.view=v;renderSummerPage();}

function renderSummerPage(){
  const root=document.getElementById("sum-page");
  if(!root)return;
  if(SUM.view==="cuts"){
    root.innerHTML=summerViewSwitch()+`<div id="sum-cuts"></div>`;
    CutTimes.mount(document.getElementById("sum-cuts"));
    return;
  }
  const DAY_ORDER=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday",""];
  let h=summerViewSwitch()+`<div class="si-header">
    <div><div class="si-title">Lawn &amp; grounds locations</div></div>
    <div class="si-actions">
      <button class="si-action-btn" onclick="JWG.openAddSummerLocation()">Add location</button>
      <button class="si-action-btn secondary" onclick="JWG.SUM.filtersOpen=!JWG.SUM.filtersOpen;var b=document.getElementById('sum-filter-bar');if(b)b.style.display=JWG.SUM.filtersOpen?'':'none'">🔍 Filters</button>
      <button class="si-action-btn secondary" onclick="JWG.openManageSummerServiceTypes()">Edit service list</button>
      <button class="si-action-btn secondary" onclick="window.print()">🖨 Print</button>
    </div>
  </div>
  <div class="si-filter-bar" id="sum-filter-bar" style="${SUM.filtersOpen?"":"display:none"}">
    <input type="text" class="si-filter-input" placeholder="Search location…" id="sum-search" oninput="JWG.SUM.filter=this.value;JWG.filterAndSortSummer()">
    <select class="si-filter-select" id="sum-sort" onchange="JWG.SUM.sortBy=this.value;JWG.filterAndSortSummer()">
      <option value="name">Sort: A–Z</option>
      <option value="city">Sort: by City</option>
      <option value="day">Sort: by Day</option>
      <option value="services">Sort: by # Services</option>
    </select>
    <select class="si-filter-select" id="sum-svc" onchange="JWG.SUM.serviceFilter=this.value;JWG.filterAndSortSummer()">
      <option value="">All Services</option>
      ${SUM.serviceTypes.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join("")}
    </select>
    <select class="si-filter-select" id="sum-day-filter" onchange="JWG.SUM.dayFilter=this.value;JWG.filterAndSortSummer()">
      <option value="">All Days</option>
      <option value="Monday">Monday</option>
      <option value="Tuesday">Tuesday</option>
      <option value="Wednesday">Wednesday</option>
      <option value="Thursday">Thursday</option>
      <option value="Friday">Friday</option>
      <option value="Saturday">Saturday</option>
    </select>
  </div>
  <div style="padding:0 0 14px 0;overflow-x:auto;">`;

  let filtered=SUM.locations.filter(loc=>{
    if(SUM.filter&&!loc.client_name.toLowerCase().includes(SUM.filter.toLowerCase())&&!loc.address.toLowerCase().includes(SUM.filter.toLowerCase()))return false;
    if(SUM.serviceFilter){
      const hasService=SUM.locationServices.some(ls=>ls.location_id===loc.id&&ls.service_type_id===SUM.serviceFilter);
      if(!hasService)return false;
    }
    if(SUM.dayFilter&&(loc.service_day||"")!==SUM.dayFilter)return false;
    return true;
  });

  if(SUM.sortBy==="city")filtered.sort((a,b)=>a.city.localeCompare(b.city));
  else if(SUM.sortBy==="day")filtered.sort((a,b)=>DAY_ORDER.indexOf(a.service_day||"")-DAY_ORDER.indexOf(b.service_day||""));
  else if(SUM.sortBy==="services")filtered.sort((a,b)=>{
    const countA=SUM.locationServices.filter(ls=>ls.location_id===a.id).length;
    const countB=SUM.locationServices.filter(ls=>ls.location_id===b.id).length;
    return countB-countA;
  });

  // The weekly schedule sits above the site list (Jake, 2026-07-28), so the two
  // are built separately and joined in that order at the end.
  let tableHtml="";
  if(!filtered.length){
    tableHtml+=`<div style="padding:24px;"><div class="si-empty"><div class="si-empty-icon">🌱</div><div class="si-empty-text">No summer service locations</div><div class="si-empty-sub">Track lawn &amp; grounds clients and service schedules</div></div></div>`;
  }else{
    tableHtml+=`<div style="font-size:12px;color:var(--fg-muted);margin:0 0 10px;padding:0 2px">Showing ${filtered.length} of ${SUM.locations.length} location${SUM.locations.length!==1?"s":""}</div>`;
    tableHtml+=`<table class="sum-table">
      <thead><tr>
        <th class="sum-th">Day</th>
        <th class="sum-th">Client</th>
        <th class="sum-th">Address</th>
        <th class="sum-th">City</th>
        <th class="sum-th">Services</th>
        <th class="sum-th">Notes</th>
        <th class="sum-th sum-th-actions">Actions</th>
      </tr></thead><tbody>`;
    filtered.forEach(loc=>{
      const services=SUM.locationServices.filter(ls=>ls.location_id===loc.id);
      const dayShort=(loc.service_day||"—").substring(0,3);
      const dayFull=loc.service_day||"—";
      const dayClass=loc.service_day?`sum-day-${loc.service_day.toLowerCase()}`:"sum-day-none";
      tableHtml+=`<tr class="sum-row">
        <td class="sum-td" data-label="Day"><span class="sum-day-badge ${dayClass}">${esc(dayShort)}</span></td>
        <td class="sum-td sum-td-client">${esc(loc.client_name)}</td>
        <td class="sum-td" data-label="Address">${esc(loc.address)}</td>
        <td class="sum-td" data-label="City">${esc(loc.city)}</td>
        <td class="sum-td" data-label="Services"><div class="loc-services">${services.map(s=>{
          const type=SUM.serviceTypes.find(t=>t.id===s.service_type_id);
          const ci=SUM.serviceTypes.findIndex(t=>t.id===s.service_type_id)%8;
          const freq=s.frequency?` · ${esc(s.frequency)}`:"";
          return`<span class="service-badge svc-color-${ci}">${type?esc(type.name):"?"}${freq}</span>`;
        }).join("")}</div></td>
        <td class="sum-td sum-td-notes" data-label="Notes">${esc(loc.notes||"")}</td>
        <td class="sum-td card-actions">
          <button class="loc-action-btn" onclick="JWG.editSummerLocation('${loc.id}')">Edit</button>
          <button class="loc-action-btn delete" onclick="JWG.deleteSummerLocation('${loc.id}')">Delete</button>
        </td>
      </tr>`;
    });
    tableHtml+=`</tbody></table>`;
  }

  // Weekly calendar view
  const DAYS_WEEK=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  let calHtml=`<div class="sum-cal-wrap">
    <div class="sum-cal-header">
      <h3 class="sum-cal-title">Weekly Schedule</h3>
      <span class="sum-cal-sub">Locations grouped by service day</span>
    </div>
    <div class="sum-cal-grid">`;
  DAYS_WEEK.forEach(day=>{
    const dayLocs=filtered.filter(l=>l.service_day===day);
    const dayClass=`sum-cal-col sum-day-${day.toLowerCase()}`;
    calHtml+=`<div class="${dayClass}">
      <div class="sum-cal-day-header">${day}<span class="sum-cal-count">${dayLocs.length}</span></div>
      <div class="sum-cal-day-body">`;
    if(!dayLocs.length){
      calHtml+=`<div class="sum-cal-empty">No sites</div>`;
    }else{
      dayLocs.forEach(loc=>{
        const services=SUM.locationServices.filter(ls=>ls.location_id===loc.id);
        calHtml+=`<div class="sum-cal-item" onclick="JWG.editSummerLocation('${loc.id}')">
          <div class="sum-cal-item-name">${esc(loc.client_name)}</div>
          <div class="sum-cal-item-addr">${esc(loc.address)}</div>
          ${services.length?`<div class="sum-cal-item-svcs">${services.slice(0,3).map(s=>{
            const type=SUM.serviceTypes.find(t=>t.id===s.service_type_id);
            const ci=SUM.serviceTypes.findIndex(t=>t.id===s.service_type_id)%8;
            return`<span class="service-badge svc-color-${ci}" style="padding:2px 6px;font-size:10px;">${type?esc(type.name):"?"}</span>`;
          }).join("")}${services.length>3?`<span class="sum-cal-more">+${services.length-3}</span>`:""}</div>`:""}
        </div>`;
      });
    }
    calHtml+=`</div></div>`;
  });
  calHtml+=`</div></div>`;

  h+=calHtml+tableHtml;
  h+=`</div></div>`;
  root.innerHTML=h;
}

function filterAndSortSummer(){renderSummerPage();}

function openAddSummerLocation(){
  let svcToggles=SUM.serviceTypes.map(t=>{
    return`<div class="loc-svc-card">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;">
        <input type="checkbox" class="sum-svc-toggle-add" data-type="${t.id}" style="accent-color:var(--accent);width:16px;height:16px;">
        ${esc(t.name)}
      </label>
      <div class="svc-detail" style="margin-top:6px;display:none;gap:8px;flex-wrap:wrap;">
        <select class="si-form-input" data-freq-add="${t.id}" style="flex:1;min-width:120px;padding:5px 8px;font-size:12px;">
          <option value="">Frequency…</option>
          <option value="Weekly">Weekly</option>
          <option value="Bi-weekly">Bi-weekly</option>
          <option value="Monthly">Monthly</option>
          <option value="One-time">One-time</option>
          <option value="As needed">As needed</option>
        </select>
        <input type="text" class="si-form-input" data-snotes-add="${t.id}" placeholder="Notes for this service…" style="flex:2;min-width:140px;padding:5px 8px;font-size:12px;">
      </div>
    </div>`;
  }).join("");
  const html=`<div class="loc-form">
    <h3 class="loc-form-title">Add lawn &amp; grounds location</h3>
    <div class="loc-form-col">
    <div class="si-form-group">
      <label class="si-form-label">Client Name</label>
      <input type="text" class="si-form-input" id="sum-name" placeholder="Client name">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Address</label>
      <input type="text" class="si-form-input" id="sum-addr" placeholder="Street address">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">City</label>
      <input type="text" class="si-form-input" id="sum-city" placeholder="City">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Service Day</label>
      <select class="si-form-input" id="sum-day">
        <option value="">Select day…</option>
        <option value="Monday">Monday</option>
        <option value="Tuesday">Tuesday</option>
        <option value="Wednesday">Wednesday</option>
        <option value="Thursday">Thursday</option>
        <option value="Friday">Friday</option>
        <option value="Saturday">Saturday</option>
      </select>
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Notes</label>
      <textarea class="si-form-textarea" id="sum-notes" placeholder="Optional notes…"></textarea>
    </div>
    </div>
    ${SUM.serviceTypes.length?`<div class="loc-form-col">
      <label class="si-form-label">Services</label>
      <div class="loc-svc-grid" id="sum-svc-toggles-add">${svcToggles}</div>
    </div>`:""}
    <div class="si-modal-actions">
      <button class="modal-done" onclick="JWG.saveSummerLocation()">Save Location</button>
      <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
    </div>
  </div>`;
  openModal(html,null,true);
  setTimeout(()=>{
    document.querySelectorAll('.sum-svc-toggle-add').forEach(cb=>{
      cb.addEventListener('change',()=>{
        const detail=cb.closest('div').querySelector('.svc-detail');
        if(detail)detail.style.display=cb.checked?'flex':'none';
      });
    });
  },50);
}

async function saveSummerLocation(){
  const name=(document.getElementById("sum-name")?.value||"").trim();
  const addr=(document.getElementById("sum-addr")?.value||"").trim();
  const city=(document.getElementById("sum-city")?.value||"").trim();
  const day=(document.getElementById("sum-day")?.value||"");
  const notes=(document.getElementById("sum-notes")?.value||"").trim();
  if(!name||!addr||!city){toast("Please fill in required fields","error");return;}
  try{
    const result=await sbF("POST","jwg_service_locations",{client_name:name,address:addr,city,notes,service_day:day,has_summer_service:true,has_winter_service:false,is_archived:false});
    // Save service toggles if any were selected
    const checkboxes=document.querySelectorAll('.sum-svc-toggle-add');
    if(result&&result.length>0){
      const locId=result[0].id;
      for(const cb of checkboxes){
        if(!cb.checked)continue;
        const typeId=cb.dataset.type;
        const freqEl=document.querySelector(`[data-freq-add="${typeId}"]`);
        const notesEl=document.querySelector(`[data-snotes-add="${typeId}"]`);
        const freq=freqEl?.value||'';
        const svcNotes=notesEl?.value||'';
        await sbF("POST","jwg_location_services",{location_id:locId,service_type_id:typeId,frequency:freq,notes:svcNotes,is_active:true});
      }
    }
    toast("Location added");
    closeModal();
    await loadSummerData();
    renderSummerPage();
  }catch(e){toast("Failed to save location","error");console.error(e);}
}

function editSummerLocation(locId){
  const loc=SUM.locations.find(l=>l.id===locId);
  if(!loc)return;
  const locServices=SUM.locationServices.filter(ls=>ls.location_id===locId);
  let svcToggles=SUM.serviceTypes.map(t=>{
    const ls=locServices.find(s=>s.service_type_id===t.id);
    const checked=!!ls;
    const freq=ls?.frequency||'';
    const sNotes=ls?.notes||'';
    return`<div class="loc-svc-card">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;">
        <input type="checkbox" class="sum-svc-toggle" data-type="${t.id}" ${checked?"checked":""} style="accent-color:var(--accent);width:16px;height:16px;">
        ${esc(t.name)}
      </label>
      <div class="svc-detail" style="margin-top:6px;display:${checked?"flex":"none"};gap:8px;flex-wrap:wrap;">
        <select class="si-form-input" data-freq="${t.id}" style="flex:1;min-width:120px;padding:5px 8px;font-size:12px;">
          <option value=""${!freq?" selected":""}>Frequency…</option>
          <option value="Weekly"${freq==="Weekly"?" selected":""}>Weekly</option>
          <option value="Bi-weekly"${freq==="Bi-weekly"?" selected":""}>Bi-weekly</option>
          <option value="Monthly"${freq==="Monthly"?" selected":""}>Monthly</option>
          <option value="One-time"${freq==="One-time"?" selected":""}>One-time</option>
          <option value="As needed"${freq==="As needed"?" selected":""}>As needed</option>
        </select>
        <input type="text" class="si-form-input" data-snotes="${t.id}" value="${esc(sNotes)}" placeholder="Notes for this service…" style="flex:2;min-width:140px;padding:5px 8px;font-size:12px;">
      </div>
    </div>`;
  }).join("");
  const html=`<div class="loc-form">
    <h3 class="loc-form-title">Edit lawn &amp; grounds location</h3>
    <div class="loc-form-col">
    <div class="si-form-group">
      <label class="si-form-label">Client Name</label>
      <input type="text" class="si-form-input" id="sum-name" value="${esc(loc.client_name)}">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Address</label>
      <input type="text" class="si-form-input" id="sum-addr" value="${esc(loc.address)}">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">City</label>
      <input type="text" class="si-form-input" id="sum-city" value="${esc(loc.city)}">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Service Day</label>
      <select class="si-form-input" id="sum-day">
        <option value=""${!loc.service_day?" selected":""}>Select day…</option>
        <option value="Monday"${loc.service_day==="Monday"?" selected":""}>Monday</option>
        <option value="Tuesday"${loc.service_day==="Tuesday"?" selected":""}>Tuesday</option>
        <option value="Wednesday"${loc.service_day==="Wednesday"?" selected":""}>Wednesday</option>
        <option value="Thursday"${loc.service_day==="Thursday"?" selected":""}>Thursday</option>
        <option value="Friday"${loc.service_day==="Friday"?" selected":""}>Friday</option>
        <option value="Saturday"${loc.service_day==="Saturday"?" selected":""}>Saturday</option>
      </select>
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Notes</label>
      <textarea class="si-form-textarea" id="sum-notes">${esc(loc.notes||"")}</textarea>
    </div>
    </div>
    <div class="loc-form-col">
      <label class="si-form-label">Services</label>
      <div class="loc-svc-grid" id="sum-svc-toggles">${svcToggles}</div>
    </div>
    <div class="si-modal-actions">
      <button class="modal-done" onclick="JWG.updateSummerLocation('${locId}')">Update</button>
      <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
    </div>
  </div>`;
  openModal(html,null,true);
  // Wire up checkbox show/hide for detail rows
  setTimeout(()=>{
    document.querySelectorAll('.sum-svc-toggle').forEach(cb=>{
      cb.addEventListener('change',()=>{
        const detail=cb.closest('div').querySelector('.svc-detail');
        if(detail)detail.style.display=cb.checked?'flex':'none';
      });
    });
  },50);
}

async function updateSummerLocation(locId){
  const name=(document.getElementById("sum-name")?.value||"").trim();
  const addr=(document.getElementById("sum-addr")?.value||"").trim();
  const city=(document.getElementById("sum-city")?.value||"").trim();
  const day=(document.getElementById("sum-day")?.value||"");
  const notes=(document.getElementById("sum-notes")?.value||"").trim();
  if(!name||!addr||!city){toast("Please fill in required fields","error");return;}
  try{
    await sbF("PATCH",`jwg_service_locations?id=eq.${locId}`,{client_name:name,address:addr,city,notes,service_day:day,updated_at:new Date().toISOString()});
    // Save service toggles
    const checkboxes=document.querySelectorAll('.sum-svc-toggle');
    const existing=SUM.locationServices.filter(ls=>ls.location_id===locId);
    for(const cb of checkboxes){
      const typeId=cb.dataset.type;
      const wasActive=existing.some(ls=>ls.service_type_id===typeId);
      const freqEl=document.querySelector(`[data-freq="${typeId}"]`);
      const notesEl=document.querySelector(`[data-snotes="${typeId}"]`);
      const freq=freqEl?.value||'';
      const svcNotes=notesEl?.value||'';
      if(cb.checked&&!wasActive){
        await sbF("POST","jwg_location_services",{location_id:locId,service_type_id:typeId,frequency:freq,notes:svcNotes,is_active:true});
      }else if(cb.checked&&wasActive){
        await sbF("PATCH",`jwg_location_services?location_id=eq.${locId}&service_type_id=eq.${typeId}`,{frequency:freq,notes:svcNotes,updated_at:new Date().toISOString()});
      }else if(!cb.checked&&wasActive){
        await sbF("DELETE",`jwg_location_services?location_id=eq.${locId}&service_type_id=eq.${typeId}`);
      }
    }
    toast("Location updated");
    closeModal();
    await loadSummerData();
    renderSummerPage();
  }catch(e){toast("Failed to update location","error");console.error(e);}
}

async function deleteSummerLocation(locId){
  const loc=SUM.locations.find(l=>l.id===locId);
  if(!(await jwgConfirm({title:"Delete location",target:loc?loc.client_name:"",message:"This also removes its services.",consequence:"This can't be undone.",confirmLabel:"Delete"})))return;
  try{
    await sbF("DELETE",`jwg_service_locations?id=eq.${locId}`);
    toast("Location deleted");
    await loadSummerData();
    renderSummerPage();
  }catch(e){toast("Failed to delete location","error");console.error(e);}
}

function openManageSummerServiceTypes(){
  const html=`<div style="flex-direction:column;">
    <h3 style="margin-bottom:14px;">Summer Service Types</h3>
    <div id="sum-types-list" style="margin-bottom:14px;">
      ${SUM.serviceTypes.map(t=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:var(--bg-deep);border-radius:6px;margin-bottom:6px;">
        <span>${esc(t.name)}</span>
        <button class="loc-action-btn delete" onclick="JWG.deleteSummerServiceType('${t.id}')">Remove</button>
      </div>`).join("")}
    </div>
    <div style="border-top:1px solid var(--border);padding-top:14px;">
      <input type="text" class="si-form-input" id="new-sum-type" placeholder="New service type…" style="margin-bottom:8px;">
      <button class="si-action-btn" onclick="JWG.addSummerServiceType()" style="width:100%;">Add Type</button>
    </div>
    <button class="modal-cancel" onclick="JWG.closeModal()" style="margin-top:14px;width:100%;">Done</button>
  </div>`;
  openModal(html,"480px");
}

async function addSummerServiceType(){
  const input=document.getElementById("new-sum-type");
  const name=(input?.value||"").trim();
  if(!name){toast("Enter a service type name","error");return;}
  try{
    const maxSort=Math.max(...SUM.serviceTypes.map(t=>t.sort_order||0),0);
    await sbF("POST","jwg_service_types",{season:"summer",name,sort_order:maxSort+1,is_active:true});
    toast("Service type added");
    await loadSummerData();
    openManageSummerServiceTypes();
  }catch(e){toast("Failed to add type","error");console.error(e);}
}

async function deleteSummerServiceType(typeId){
  const t=SUM.serviceTypes.find(x=>x.id===typeId);
  if(!(await jwgConfirm({title:"Remove service type",target:t?t.name:"",confirmLabel:"Remove"})))return;
  try{
    await sbF("PATCH",`jwg_service_types?id=eq.${typeId}`,{is_active:false});
    toast("Service type removed");
    await loadSummerData();
    openManageSummerServiceTypes();
  }catch(e){toast("Failed to remove type","error");console.error(e);}
}

// ─── WINTER SERVICES ───────────────────────────────────────────────────────
/* ===== winter.js ===== */
// ── WINTER.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

// Route groups and the Route map live in app-winter-routes.js (window.WinterRoutes).
let WIN={locations:[],serviceTypes:[],locationServices:[],saltBins:[],groups:[],view:"list",filter:"",sortBy:"route",serviceFilter:"",lowOnly:false};
const DEFAULT_SALT_THRESHOLD=5;

async function loadWinterData(){
  try{
    const[locs,types,ls,salt,groups]=await Promise.all([
      sbF("GET","jwg_service_locations?has_winter_service=eq.true&is_archived=eq.false&order=client_name"),
      sbF("GET","jwg_service_types?season=eq.winter&is_active=eq.true&order=sort_order"),
      sbF("GET","jwg_location_services?select=*,jwg_service_types!inner(season)&jwg_service_types.season=eq.winter"),
      sbF("GET","jwg_salt_bins?select=*"),
      sbF("GET","jwg_winter_groups?order=sort_order")
    ]);
    WIN.locations=locs||[];
    WIN.serviceTypes=types||[];
    WIN.locationServices=ls||[];
    WIN.saltBins=salt||[];
    WIN.groups=groups||[];
  }catch(e){console.error("Load winter data failed:",e);toast("Failed to load winter services","error");}
}

function buildWinterPage(){
  return`<div class="card" id="win-page"><div style="padding:20px;text-align:center;color:var(--fg-muted)">Loading…</div></div>`;
}

async function initWinterPage(){
  await loadWinterData();
  renderWinterPage();
}

function renderWinterPage(){
  const root=document.getElementById("win-page");
  if(!root)return;
  const viewBtn=(v,label)=>`<button type="button" class="wr-view-btn" aria-pressed="${WIN.view===v}" onclick="JWG.setWinterView('${v}')">${label}</button>`;
  let h=`<div class="si-header">
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><div class="si-title">Snow &amp; salt locations</div><div class="wr-view">${viewBtn("list","List")}${viewBtn("map","Route map")}</div></div>
    <div class="si-actions">
      <button class="si-action-btn" onclick="JWG.openAddWinterLocation()">Add location</button>
      <button class="si-action-btn secondary" onclick="JWG.WIN.filtersOpen=!JWG.WIN.filtersOpen;var b=document.getElementById('win-filter-bar');if(b)b.style.display=JWG.WIN.filtersOpen?'':'none'">🔍 Filters</button>
      <button class="si-action-btn secondary" onclick="JWG.openManageWinterServiceTypes()">Edit service list</button>
      <button class="si-action-btn secondary" onclick="WinterBook.choose()">Print book</button>
      <button class="si-action-btn secondary" onclick="window.print()">🖨 Print list</button>
    </div>
  </div>`;
  if(WIN.view==="map"){
    root.innerHTML=h+`<div class="wr-layout"><div class="wr-map-host" id="wr-map-host"></div><div class="wr-side" id="wr-side"></div></div>`;
    WinterRoutes.render(document.getElementById("wr-map-host"),document.getElementById("wr-side"),WIN);
    return;
  }
  h+=`<div class="si-filter-bar" id="win-filter-bar" style="${WIN.filtersOpen?"":"display:none"}">
    <input type="text" class="si-filter-input" placeholder="Search location…" id="win-search" oninput="JWG.WIN.filter=this.value;JWG.filterAndSortWinter()">
    <select class="si-filter-select" id="win-sort" onchange="JWG.WIN.sortBy=this.value;JWG.filterAndSortWinter()">
      <option value="route"${WIN.sortBy==="route"?" selected":""}>Sort: Route order</option>
      <option value="name"${WIN.sortBy==="name"?" selected":""}>Sort: A–Z</option>
      <option value="city"${WIN.sortBy==="city"?" selected":""}>Sort: by City</option>
    </select>
    <select class="si-filter-select" id="win-svc" onchange="JWG.WIN.serviceFilter=this.value;JWG.filterAndSortWinter()">
      <option value="">All Services</option>
      ${WIN.serviceTypes.map(t=>`<option value="${t.id}"${WIN.serviceFilter===t.id?" selected":""}>${esc(t.name)}</option>`).join("")}
    </select>
    <button onclick="JWG.WIN.lowOnly=!JWG.WIN.lowOnly;JWG.filterAndSortWinter()" style="border:1.5px solid ${WIN.lowOnly?"#f97316":"var(--border)"};background:${WIN.lowOnly?"#f97316":"transparent"};color:${WIN.lowOnly?"#fff":"var(--fg-muted)"};border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Low on salt</button>
  </div>
  ${(function(){const wb=WIN.locations.filter(l=>WIN.saltBins.some(s=>s.location_id===l.id));const lc=wb.filter(l=>{const s=WIN.saltBins.find(x=>x.location_id===l.id);return s&&s.current_bags<=s.min_threshold;}).length;return wb.length?`<div style="padding:12px 2px 0;font-size:13px;font-weight:700;color:${lc?"#c2410c":"var(--fg-muted)"}">${lc} of ${wb.length} low on salt</div>`:"";})()}
  <div style="padding:0 0 14px 0;overflow-x:auto;">`;

  let filtered=WIN.locations.filter(loc=>{
    if(WIN.filter&&!loc.client_name.toLowerCase().includes(WIN.filter.toLowerCase())&&!loc.address.toLowerCase().includes(WIN.filter.toLowerCase()))return false;
    if(WIN.serviceFilter){
      const hasService=WIN.locationServices.some(ls=>ls.location_id===loc.id&&ls.service_type_id===WIN.serviceFilter);
      if(!hasService)return false;
    }
    if(WIN.lowOnly){
      const salt=WIN.saltBins.find(s=>s.location_id===loc.id);
      if(!salt||salt.current_bags>salt.min_threshold)return false;
    }
    return true;
  });

  if(WIN.sortBy==="city")filtered.sort((a,b)=>a.city.localeCompare(b.city));
  if(WIN.sortBy==="route"){
    // Group order from jwg_winter_groups, then stop; sites with no code yet go last.
    const gi=c=>{const i=WIN.groups.findIndex(g=>g.code===c);return i<0?999:i;};
    filtered.sort((a,b)=>gi(a.winter_group)-gi(b.winter_group)||(a.winter_stop||999)-(b.winter_stop||999));
  }
  if(WIN.lowOnly)filtered.sort((a,b)=>{
    const sa=WIN.saltBins.find(s=>s.location_id===a.id);
    const sb=WIN.saltBins.find(s=>s.location_id===b.id);
    return(sa?.current_bags||0)-(sb?.current_bags||0);
  });

  if(!filtered.length){
    h+=`<div style="padding:24px;"><div class="si-empty"><div class="si-empty-icon">❄️</div><div class="si-empty-text">No winter service locations</div><div class="si-empty-sub">Manage snow removal routes and salt bins</div></div></div>`;
  }else{
    h+=`<div style="font-size:12px;color:var(--fg-muted);margin:0 0 10px;padding:0 2px">Showing ${filtered.length} of ${WIN.locations.length} location${WIN.locations.length!==1?"s":""}</div>`;
    h+=`<table class="win-table">
      <thead><tr>
        <th class="win-th">Code</th>
        <th class="win-th">Client</th>
        <th class="win-th">Address</th>
        <th class="win-th">City</th>
        <th class="win-th">Services</th>
        <th class="win-th">Salt</th>
        <th class="win-th">Notes</th>
        <th class="win-th win-th-actions">Actions</th>
      </tr></thead><tbody>`;
    filtered.forEach(loc=>{
      const salt=WIN.saltBins.find(s=>s.location_id===loc.id);
      const isLow=salt&&salt.current_bags<=salt.min_threshold;
      const wServices=WIN.locationServices?WIN.locationServices.filter(ls=>ls.location_id===loc.id):[];
      const grp=WIN.groups.find(g=>g.code===loc.winter_group);
      const wcode=WinterRoutes.code(loc);
      h+=`<tr class="win-row">
        <td class="win-td" data-label="Code">${wcode?`<span class="wr-code" style="background:${grp.color}">${wcode}</span>`:`<span class="wr-code none" title="${WinterRoutes.located(loc)?"No group yet":"Not on the map yet"}">—</span>`}</td>
        <td class="win-td win-td-client">${esc(loc.client_name)}</td>
        <td class="win-td" data-label="Address">${esc(loc.address)}</td>
        <td class="win-td" data-label="City">${esc(loc.city)}</td>
        <td class="win-td" data-label="Services"><div class="loc-services">${wServices.map(s=>{
          const type=WIN.serviceTypes.find(t=>t.id===s.service_type_id);
          const ci=WIN.serviceTypes.findIndex(t=>t.id===s.service_type_id)%8;
          return`<span class="service-badge svc-color-${ci}">${type?esc(type.name):"?"}</span>`;
        }).join("")}</div></td>
        <td class="win-td" data-label="Salt">${salt?`<div class="salt-inline" style="flex-wrap:wrap;gap:4px">
          <button class="stock-btn" onclick="JWG.adjustWinterSalt('${loc.id}',-5)">−5</button>
          <button class="stock-btn" onclick="JWG.adjustWinterSalt('${loc.id}',-1)">−</button>
          <input type="number" min="0" value="${salt.current_bags}" onchange="JWG.setWinterSalt('${loc.id}',this.value)" style="width:54px;text-align:center;font-size:17px;font-weight:800;color:${isLow?"#c2410c":"var(--fg)"};border:1.5px solid ${isLow?"#f97316":"var(--border)"};border-radius:7px;padding:4px 2px;background:var(--card)">
          <button class="stock-btn" onclick="JWG.adjustWinterSalt('${loc.id}',1)">+</button>
          <button class="stock-btn" onclick="JWG.adjustWinterSalt('${loc.id}',5)">+5</button>
          <span class="salt-threshold">/ ${salt.min_threshold} min</span>
          ${isLow?`<span class="salt-indicator">LOW</span>`:""}
        </div>`:`<span style="color:var(--fg-muted)">—</span>`}</td>
        <td class="win-td win-td-notes" data-label="Notes">${esc(loc.notes||"")}</td>
        <td class="win-td card-actions">
          <button class="loc-action-btn" onclick="WinterSitePlan.open('${loc.id}')" title="Aerial photo and snow drop zones">${loc.photo_path?"Site plan":"Add photo"}</button>
          <button class="loc-action-btn" onclick="JWG.editWinterLocation('${loc.id}')">Edit</button>
          <button class="loc-action-btn delete" onclick="JWG.deleteWinterLocation('${loc.id}')">Delete</button>
        </td>
      </tr>`;
    });
    h+=`</tbody></table>`;
  }

  h+=`</div></div>`;
  root.innerHTML=h;
}

function filterAndSortWinter(){renderWinterPage();}

async function adjustWinterSalt(locId,delta){
  const salt=WIN.saltBins.find(s=>s.location_id===locId);
  if(!salt)return;
  await writeSalt(salt,Math.max(0,salt.current_bags+delta));
}
async function setWinterSalt(locId,val){
  const salt=WIN.saltBins.find(s=>s.location_id===locId);
  if(!salt)return;
  await writeSalt(salt,Math.max(0,parseInt(val,10)||0));
}
async function writeSalt(salt,newCount){
  try{
    await sbF("PATCH",`jwg_salt_bins?id=eq.${salt.id}`,{current_bags:newCount,updated_at:new Date().toISOString()});
    salt.current_bags=newCount;
    renderWinterPage();
  }catch(e){toast("Failed to update salt count","error");console.error(e);}
}

function setWinterView(v){WIN.view=v;renderWinterPage();}
async function reloadWinter(){await loadWinterData();renderWinterPage();}

// The route group picker in the Add and Edit forms. Blank lets the app choose the
// group whose sites are the shortest drive from this address.
function winterGroupField(current){
  return`<div class="si-form-group">
      <label class="si-form-label">Route group</label>
      <select class="si-form-input" id="win-group">
        <option value=""${current?"":" selected"}>Pick for me from the address</option>
        ${WIN.groups.map(g=>`<option value="${g.code}"${g.code===current?" selected":""}>${g.code} · ${esc(g.name)}</option>`).join("")}
      </select>
    </div>`;
}

// After a site is saved: put it on the map, settle its group, and renumber every
// group it left or joined so codes stay in driving order. pt is the address lookup
// (null = not found, undefined = address unchanged, keep the spot it has). A site
// that cannot be found waits under "Not on the map yet" on the Route map.
async function routeAfterSave(locId,pt,group,oldGroup){
  await loadWinterData();
  const loc=WIN.locations.find(l=>l.id===locId);
  if(pt!==undefined){loc.lat=pt?pt.lat:null;loc.lng=pt?pt.lng:null;}
  if(!group&&WinterRoutes.located(loc))group=await WinterRoutes.suggestGroup(loc,WIN.locations.filter(l=>l.id!==locId),WIN.groups);
  loc.winter_group=group||null;
  await sbF("PATCH",`jwg_service_locations?id=eq.${locId}`,{lat:loc.lat,lng:loc.lng,winter_group:loc.winter_group,updated_at:new Date().toISOString()});
  for(const g of new Set([oldGroup,loc.winter_group].filter(Boolean)))await WinterRoutes.renumberGroup(g,WIN.locations);
  if(!WinterRoutes.located(loc))toast("Saved, but the address wasn't found on the map. Place its pin on the Route map.","error");
}

function openAddWinterLocation(){
  let svcToggles=WIN.serviceTypes.map(t=>{
    return`<div style="background:var(--bg-deep);border-radius:8px;padding:10px 12px;margin-bottom:6px;">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;">
        <input type="checkbox" class="win-svc-toggle-add" data-type="${t.id}" style="accent-color:var(--accent);width:16px;height:16px;">
        ${esc(t.name)}
      </label>
      <div class="svc-detail" style="margin-top:6px;display:none;gap:8px;">
        <input type="text" class="si-form-input" data-wsnotes-add="${t.id}" placeholder="Notes for this service…" style="flex:1;padding:5px 8px;font-size:12px;">
      </div>
    </div>`;
  }).join("");
  const html=`<div style="flex-direction:column;">
    <h3 style="margin-bottom:14px;">Add Winter Service Location</h3>
    <div class="si-form-group">
      <label class="si-form-label">Client Name</label>
      <input type="text" class="si-form-input" id="win-name" placeholder="Client name">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Address</label>
      <input type="text" class="si-form-input" id="win-addr" placeholder="Street address">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">City</label>
      <input type="text" class="si-form-input" id="win-city" placeholder="City">
    </div>
    ${winterGroupField("")}
    <div class="si-form-group">
      <label class="si-form-label">Notes</label>
      <textarea class="si-form-textarea" id="win-notes" placeholder="Optional notes…"></textarea>
    </div>
    ${WIN.serviceTypes.length?`<div class="si-form-group">
      <button type="button" class="collapse-toggle" onclick="const el=document.getElementById('win-svc-toggles-add');const ic=document.getElementById('win-svc-caret');const hidden=el.style.display==='none';el.style.display=hidden?'block':'none';ic.textContent=hidden?'▾':'▸';">
        <span id="win-svc-caret">▸</span> Services <span class="collapse-hint">(click to expand)</span>
      </button>
      <div id="win-svc-toggles-add" style="display:none;margin-top:8px;">${svcToggles}</div>
    </div>`:""}
    <div class="si-modal-actions">
      <button class="modal-done" onclick="JWG.saveWinterLocation()">Save Location</button>
      <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
    </div>
  </div>`;
  openModal(html,null,true);
  setTimeout(()=>{
    document.querySelectorAll('.win-svc-toggle-add').forEach(cb=>{
      cb.addEventListener('change',()=>{
        const detail=cb.closest('div').querySelector('.svc-detail');
        if(detail)detail.style.display=cb.checked?'flex':'none';
      });
    });
  },50);
}

async function saveWinterLocation(){
  const name=(document.getElementById("win-name")?.value||"").trim();
  const addr=(document.getElementById("win-addr")?.value||"").trim();
  const city=(document.getElementById("win-city")?.value||"").trim();
  const notes=(document.getElementById("win-notes")?.value||"").trim();
  const group=document.getElementById("win-group")?.value||"";
  if(!name||!addr||!city){toast("Please fill in required fields","error");return;}
  try{
    const result=await sbF("POST","jwg_service_locations",{client_name:name,address:addr,city,notes,has_winter_service:true,has_summer_service:false,is_archived:false});
    const locId=result[0].id;
    await sbF("POST","jwg_salt_bins",{location_id:locId,current_bags:0,min_threshold:DEFAULT_SALT_THRESHOLD});
    // Save service toggles
    const checkboxes=document.querySelectorAll('.win-svc-toggle-add');
    for(const cb of checkboxes){
      if(!cb.checked)continue;
      const typeId=cb.dataset.type;
      const notesEl=document.querySelector(`[data-wsnotes-add="${typeId}"]`);
      const svcNotes=notesEl?.value||'';
      await sbF("POST","jwg_location_services",{location_id:locId,service_type_id:typeId,notes:svcNotes,is_active:true});
    }
    closeModal();
    toast("Location added");
    const pt=await WinterRoutes.findAddress(addr,city);
    try{await routeAfterSave(locId,pt,group,null);}
    catch(e){toast("Saved, but the run order couldn't be worked out: "+e.message,"error");console.error(e);}
    await reloadWinter();
  }catch(e){toast("Failed to save location","error");console.error(e);}
}

function editWinterLocation(locId){
  const loc=WIN.locations.find(l=>l.id===locId);
  if(!loc)return;
  const locServices=WIN.locationServices.filter(ls=>ls.location_id===locId);
  const salt=WIN.saltBins.find(s=>s.location_id===locId);
  let svcToggles=WIN.serviceTypes.map(t=>{
    const ls=locServices.find(s=>s.service_type_id===t.id);
    const checked=!!ls;
    const sNotes=ls?.notes||'';
    return`<div style="background:var(--bg-deep);border-radius:8px;padding:10px 12px;margin-bottom:6px;">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;">
        <input type="checkbox" class="win-svc-toggle" data-type="${t.id}" ${checked?"checked":""} style="accent-color:var(--accent);width:16px;height:16px;">
        ${esc(t.name)}
      </label>
      <div class="svc-detail" style="margin-top:6px;display:${checked?"flex":"none"};gap:8px;">
        <input type="text" class="si-form-input" data-wsnotes="${t.id}" value="${esc(sNotes)}" placeholder="Notes for this service…" style="flex:1;padding:5px 8px;font-size:12px;">
      </div>
    </div>`;
  }).join("");
  const html=`<div style="flex-direction:column;">
    <h3 style="margin-bottom:14px;">Edit Winter Service Location</h3>
    <div class="si-form-group">
      <label class="si-form-label">Client Name</label>
      <input type="text" class="si-form-input" id="win-name" value="${esc(loc.client_name)}">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Address</label>
      <input type="text" class="si-form-input" id="win-addr" value="${esc(loc.address)}">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">City</label>
      <input type="text" class="si-form-input" id="win-city" value="${esc(loc.city)}">
    </div>
    ${winterGroupField(loc.winter_group||"")}
    <div class="si-form-group">
      <label class="si-form-label">Notes</label>
      <textarea class="si-form-textarea" id="win-notes">${esc(loc.notes||"")}</textarea>
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Services</label>
      <div id="win-svc-toggles">${svcToggles}</div>
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Salt Bin</label>
      <div style="background:var(--bg-deep);border-radius:8px;padding:12px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <label style="font-size:13px;font-weight:600;">Min Threshold:</label>
          <input type="number" class="si-form-input" id="win-salt-min" value="${salt?.min_threshold||DEFAULT_SALT_THRESHOLD}" min="0" style="width:70px;padding:5px 8px;font-size:12px;">
        </div>
        <div style="font-size:11px;color:var(--fg-muted);">Current bags: ${salt?.current_bags||0} (use +/- buttons on the card to adjust)</div>
      </div>
    </div>
    <div class="si-modal-actions">
      <button class="modal-done" onclick="JWG.updateWinterLocation('${locId}')">Update</button>
      <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
    </div>
  </div>`;
  openModal(html,null,true);
  setTimeout(()=>{
    document.querySelectorAll('.win-svc-toggle').forEach(cb=>{
      cb.addEventListener('change',()=>{
        const detail=cb.closest('div').querySelector('.svc-detail');
        if(detail)detail.style.display=cb.checked?'flex':'none';
      });
    });
  },50);
}

async function updateWinterLocation(locId){
  const name=(document.getElementById("win-name")?.value||"").trim();
  const addr=(document.getElementById("win-addr")?.value||"").trim();
  const city=(document.getElementById("win-city")?.value||"").trim();
  const notes=(document.getElementById("win-notes")?.value||"").trim();
  const group=document.getElementById("win-group")?.value||"";
  if(!name||!addr||!city){toast("Please fill in required fields","error");return;}
  const before=WIN.locations.find(l=>l.id===locId);
  const moved=before.address!==addr||before.city!==city;
  const oldGroup=before.winter_group;
  try{
    await sbF("PATCH",`jwg_service_locations?id=eq.${locId}`,{client_name:name,address:addr,city,notes,updated_at:new Date().toISOString()});
    // Save service toggles
    const checkboxes=document.querySelectorAll('.win-svc-toggle');
    const existing=WIN.locationServices.filter(ls=>ls.location_id===locId);
    for(const cb of checkboxes){
      const typeId=cb.dataset.type;
      const wasActive=existing.some(ls=>ls.service_type_id===typeId);
      const notesEl=document.querySelector(`[data-wsnotes="${typeId}"]`);
      const svcNotes=notesEl?.value||'';
      if(cb.checked&&!wasActive){
        await sbF("POST","jwg_location_services",{location_id:locId,service_type_id:typeId,notes:svcNotes,is_active:true});
      }else if(cb.checked&&wasActive){
        await sbF("PATCH",`jwg_location_services?location_id=eq.${locId}&service_type_id=eq.${typeId}`,{notes:svcNotes,updated_at:new Date().toISOString()});
      }else if(!cb.checked&&wasActive){
        await sbF("DELETE",`jwg_location_services?location_id=eq.${locId}&service_type_id=eq.${typeId}`);
      }
    }
    // Update salt bin threshold
    const minEl=document.getElementById("win-salt-min");
    if(minEl){
      const newMin=parseInt(minEl.value)||DEFAULT_SALT_THRESHOLD;
      const salt=WIN.saltBins.find(s=>s.location_id===locId);
      if(salt)await sbF("PATCH",`jwg_salt_bins?id=eq.${salt.id}`,{min_threshold:newMin,updated_at:new Date().toISOString()});
    }
    closeModal();
    toast("Location updated");
    // Only a new address or a different group changes the run; anything else leaves
    // the map and the codes alone.
    if(moved||group!==(oldGroup||"")){
      const pt=moved?await WinterRoutes.findAddress(addr,city):undefined;
      try{await routeAfterSave(locId,pt,group,oldGroup);}
      catch(e){toast("Saved, but the run order couldn't be worked out: "+e.message,"error");console.error(e);}
    }
    await reloadWinter();
  }catch(e){toast("Failed to update location","error");console.error(e);}
}

async function deleteWinterLocation(locId){
  const loc=WIN.locations.find(l=>l.id===locId);
  if(!(await jwgConfirm({title:"Delete location",target:loc?loc.client_name:"",message:"This also removes its salt bin and services.",consequence:"This can't be undone.",confirmLabel:"Delete"})))return;
  try{
    await sbF("DELETE",`jwg_service_locations?id=eq.${locId}`);
    toast("Location deleted");
    await loadWinterData();
    // Close the gap it left in its group's run.
    if(loc&&loc.winter_group){
      try{await WinterRoutes.renumberGroup(loc.winter_group,WIN.locations);}
      catch(e){toast("Deleted, but the run order couldn't be worked out: "+e.message,"error");console.error(e);}
    }
    await reloadWinter();
  }catch(e){toast("Failed to delete location","error");console.error(e);}
}

function openManageWinterServiceTypes(){
  const html=`<div style="flex-direction:column;">
    <h3 style="margin-bottom:14px;">Winter Service Types</h3>
    <div id="win-types-list" style="margin-bottom:14px;">
      ${WIN.serviceTypes.map(t=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:var(--bg-deep);border-radius:6px;margin-bottom:6px;">
        <span>${esc(t.name)}</span>
        <button class="loc-action-btn delete" onclick="JWG.deleteWinterServiceType('${t.id}')">Remove</button>
      </div>`).join("")}
    </div>
    <div style="border-top:1px solid var(--border);padding-top:14px;">
      <input type="text" class="si-form-input" id="new-win-type" placeholder="New service type…" style="margin-bottom:8px;">
      <button class="si-action-btn" onclick="JWG.addWinterServiceType()" style="width:100%;">Add Type</button>
    </div>
    <button class="modal-cancel" onclick="JWG.closeModal()" style="margin-top:14px;width:100%;">Done</button>
  </div>`;
  openModal(html,"480px");
}

async function addWinterServiceType(){
  const input=document.getElementById("new-win-type");
  const name=(input?.value||"").trim();
  if(!name){toast("Enter a service type name","error");return;}
  try{
    const maxSort=Math.max(...WIN.serviceTypes.map(t=>t.sort_order||0),0);
    await sbF("POST","jwg_service_types",{season:"winter",name,sort_order:maxSort+1,is_active:true});
    toast("Service type added");
    await loadWinterData();
    openManageWinterServiceTypes();
  }catch(e){toast("Failed to add type","error");console.error(e);}
}

async function deleteWinterServiceType(typeId){
  const t=WIN.serviceTypes.find(x=>x.id===typeId);
  if(!(await jwgConfirm({title:"Remove service type",target:t?t.name:"",confirmLabel:"Remove"})))return;
  try{
    await sbF("PATCH",`jwg_service_types?id=eq.${typeId}`,{is_active:false});
    toast("Service type removed");
    await loadWinterData();
    openManageWinterServiceTypes();
  }catch(e){toast("Failed to remove type","error");console.error(e);}
}

// ─── INVENTORY ───────────────────────────────────────────────────────────────
/* ===== inventory.js -> app-jwg-inventory.js (v682) =====
   Moved out so Darrin's kiosk can load the inventory WITHOUT the scheduler
   (Jake, 2026-10-05). index.html loads both files; the Inventory tab below
   delegates to window.JWGInv. The workshop-task helpers stayed here, because
   the Tasks tab uses them and the kiosk does not.  ===== */

const PRIO_ORDER={high:0,medium:1,low:2};
const PRIO_LABEL={high:"High",medium:"Medium",low:"Low"};
const PRIO_CLASS={high:"ph",medium:"pm",low:"pl"};

async function loadWorkshopTasks(){return sbF("GET","jwg_workshop_tasks?order=created_at.desc");}
/* ===== clothing.js ===== */
// ── CLOTHING.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

const CLOTHING_TYPES=["T-Shirt","Long Sleeve","Crewneck Sweater","Hoodie","Coat","Toque","Cap","Windbreaker"];
const CLOTHING_SIZES=["XS","S","M","L","XL","2XL","3XL","One Size"];
const CLOTHING_COMPANIES=["Jeffs Junk","Jeff White Group"];
const BADGE_CLASS={"T-Shirt":"cl-badge-tshirt","Long Sleeve":"cl-badge-longsleeve","Crewneck Sweater":"cl-badge-crewneck","Hoodie":"cl-badge-hoodie","Coat":"cl-badge-coat","Toque":"cl-badge-toque","Cap":"cl-badge-cap","Windbreaker":"cl-badge-windbreaker"};
let CL={items:[],filter:"all",period:"all",company:"all",search:"",former:false};

// People no longer here (removed on the Team page) keep every clothing record, but out of
// sight unless asked for (Jake, 2026-10-06: "keep all the info ... hidden"). A record whose
// person is gone from the roster altogether counts as former too.
function clIsFormer(eid){const e=S.employees.find(x=>x.id===eid);return !e||e.hidden;}

async function loadClothingItems(){
  const rows=await sbF("GET","jwg_employee_clothing?select=*,jwg_employees(name)&order=date_given.desc")||[];
  // merged build embeds under the jwg_-prefixed key; normalise so the UI key (employees) works in both
  rows.forEach(r=>{var je=r["jwg_employees"];if(!r.employees&&je)r.employees=je;});
  return rows;
}
async function saveClothingItem(data){return sbF("POST","jwg_employee_clothing",data);}
async function updateClothingItem(id,data){return sbF("PATCH","jwg_employee_clothing?id=eq."+id,data);}
async function deleteClothingItem(id){return sbF("DELETE","jwg_employee_clothing?id=eq."+id);}

function buildClothingPage(){
  return`<div class="card"><div class="cl-wrap" id="cl-root"><div style="text-align:center;padding:40px;color:var(--fg-subtle)">Loading clothing records…</div></div></div>`;
}

async function initClothingPage(){
  try{
    CL.items=await loadClothingItems()||[];
    renderClothingBoard();
  }catch(e){
    const root=document.getElementById("cl-root");
    if(root)root.innerHTML=`<div style="color:#dc2626;padding:20px">Failed to load: ${e.message}</div>`;
  }
}

function clSetFilter(f){CL.filter=f;renderClothingBoard();}
function clToggleFormer(){CL.former=!CL.former;renderClothingBoard();}
function clSetPeriod(p){CL.period=p;renderClothingBoard();}
function clSetCompany(c){CL.company=c;renderClothingBoard();}
function clSetSearch(v){CL.search=v;renderClothingBoard();const el=document.getElementById("cl-search");if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}}

function clGetPeriodRange(period){
  const now=new Date();
  const y=now.getFullYear();
  const m=now.getMonth();
  if(period==="q1")return{start:`${y}-01-01`,end:`${y}-03-31`,label:"Q1 "+y};
  if(period==="q2")return{start:`${y}-04-01`,end:`${y}-06-30`,label:"Q2 "+y};
  if(period==="q3")return{start:`${y}-07-01`,end:`${y}-09-30`,label:"Q3 "+y};
  if(period==="q4")return{start:`${y}-10-01`,end:`${y}-12-31`,label:"Q4 "+y};
  if(period==="h1")return{start:`${y}-01-01`,end:`${y}-06-30`,label:"H1 "+y};
  if(period==="h2")return{start:`${y}-07-01`,end:`${y}-12-31`,label:"H2 "+y};
  if(period==="year")return{start:`${y}-01-01`,end:`${y}-12-31`,label:""+y};
  if(period==="last-year"){const ly=y-1;return{start:`${ly}-01-01`,end:`${ly}-12-31`,label:""+ly};}
  return null;
}

function renderClothingBoard(){
  const root=document.getElementById("cl-root");
  if(!root)return;

  let items=[...CL.items];

  // Former staff stay out of everything below (list and totals) until "Show former staff"
  const formerIds=new Set(CL.items.map(i=>i.employee_id).filter(clIsFormer));
  if(!CL.former)items=items.filter(i=>!formerIds.has(i.employee_id));

  // Filter by company
  if(CL.company!=="all")items=items.filter(i=>(i.company||"Jeffs Junk")===CL.company);

  // Filter by period
  const range=clGetPeriodRange(CL.period);
  if(range)items=items.filter(i=>i.date_given>=range.start&&i.date_given<=range.end);

  // Filter by item type
  if(CL.filter!=="all")items=items.filter(i=>i.item_type===CL.filter);

  // Filter by employee name search
  if(CL.search){const q=CL.search.toLowerCase();items=items.filter(i=>(i.employees?.name||"").toLowerCase().includes(q));}

  // Summary stats
  const totalItems=items.length;
  const totalEmployeePrice=items.reduce((s,i)=>s+(+i.price||0),0);
  const totalPurchaseCost=items.reduce((s,i)=>s+(+i.purchase_price||0),0);
  const uniqueEmps=new Set(items.map(i=>i.employee_id)).size;

  // Company stats
  const jjItems=items.filter(i=>(i.company||"Jeffs Junk")==="Jeffs Junk");
  const jwgItems=items.filter(i=>(i.company||"Jeffs Junk")==="Jeff White Group");
  const jjCost=jjItems.reduce((s,i)=>s+(+i.purchase_price||0),0);
  const jwgCost=jwgItems.reduce((s,i)=>s+(+i.purchase_price||0),0);

  const types=["all",...CLOTHING_TYPES];
  const periods=[
    {v:"all",l:"All Time"},{v:"q1",l:"Q1"},{v:"q2",l:"Q2"},{v:"q3",l:"Q3"},{v:"q4",l:"Q4"},
    {v:"h1",l:"H1"},{v:"h2",l:"H2"},{v:"year",l:"This Year"},{v:"last-year",l:"Last Year"}
  ];

  // Group items by employee
  const grouped={};
  items.forEach(i=>{
    const eid=i.employee_id;
    if(!grouped[eid])grouped[eid]={name:i.employees?.name||"Unknown",former:formerIds.has(eid),items:[]};
    grouped[eid].items.push(i);
  });
  const empList=Object.entries(grouped).sort((a,b)=>a[1].name.localeCompare(b[1].name));

  // Build employee cards
  let cards="";
  empList.forEach(([eid,emp],idx)=>{
    const grpClass=(idx%2===0?"cl-group-a":"cl-group-b")+(emp.former?" cl-former":"");
    const empTotal=emp.items.reduce((s,i)=>s+(+i.price||0),0);
    const empPurchase=emp.items.reduce((s,i)=>s+(+i.purchase_price||0),0);
    const empJJ=emp.items.filter(i=>(i.company||"Jeffs Junk")==="Jeffs Junk");
    const empJWG=emp.items.filter(i=>(i.company||"Jeffs Junk")==="Jeff White Group");
    const empJJCost=empJJ.reduce((s,i)=>s+(+i.purchase_price||0),0);
    const empJWGCost=empJWG.reduce((s,i)=>s+(+i.purchase_price||0),0);
    let itemRows="";
    emp.items.forEach(i=>{
      const d=i.date_given?new Date(i.date_given+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";
      const co=i.company||"Jeffs Junk";
      const coBadge=co==="Jeff White Group"?`<span class="cl-co-badge jwg">JWG</span>`:`<span class="cl-co-badge jj">JJ</span>`;
      itemRows+=`<tr class="${grpClass}">
        <td><span class="cl-item-badge ${BADGE_CLASS[i.item_type]||''}">${esc(i.item_type)}</span></td>
        <td><span class="cl-size">${esc(i.size||"—")}</span></td>
        <td><span class="cl-price">$${(+i.price||0).toFixed(2)}</span></td>
        <td><span class="cl-price" style="color:var(--fg-muted)">$${(+i.purchase_price||0).toFixed(2)}</span></td>
        <td>${coBadge}</td>
        <td>${d}</td>
        <td style="font-size:12px;color:var(--fg-muted)">${esc(i.notes||"")}</td>
        <td><div class="cl-actions">
          <button class="cl-act-btn" onclick="JWG.clOpenEdit('${i.id}')">Edit</button>
          <button class="cl-act-btn del" onclick="JWG.clDelete('${i.id}')">Remove</button>
        </div></td>
      </tr>`;
    });
    const coParts=[];
    if(empJJ.length)coParts.push(`<span class="cl-co-badge jj" style="font-size:10px;padding:1px 5px;vertical-align:middle">JJ</span> $${empJJCost.toFixed(2)}`);
    if(empJWG.length)coParts.push(`<span class="cl-co-badge jwg" style="font-size:10px;padding:1px 5px;vertical-align:middle">JWG</span> $${empJWGCost.toFixed(2)}`);
    cards+=`<tr class="cl-emp-header ${grpClass}">
      <td colspan="8">
        <span class="cl-emp-name">${esc(emp.name)}</span>${emp.former?`<span class="cl-former-tag">Former staff</span>`:""}
        <span class="cl-emp-count">${emp.items.length} item${emp.items.length!==1?"s":""} · Staff: $${empTotal.toFixed(2)} · Our cost: $${empPurchase.toFixed(2)}${coParts.length?" · "+coParts.join(" · "):""}</span>
      </td>
    </tr>${itemRows}`;
  });

  const periodLabel=range?range.label:"All Time";

  root.innerHTML=`
    <div class="cl-header">
      <div class="cl-title">Employee Clothing <span>Track what's been given out</span></div>
      <button class="cl-add-btn" onclick="JWG.clOpenAdd()">Give item</button>
    </div>
    <div class="cl-summary">
      <div class="cl-stat"><div class="cl-stat-val">${totalItems}</div><div class="cl-stat-lbl">Items (${periodLabel})</div></div>
      <div class="cl-stat"><div class="cl-stat-val">$${totalEmployeePrice.toFixed(2)}</div><div class="cl-stat-lbl">Staff value</div></div>
      <div class="cl-stat"><div class="cl-stat-val" style="color:#dc2626">$${totalPurchaseCost.toFixed(2)}</div><div class="cl-stat-lbl">Our cost</div></div>
      <div class="cl-stat"><div class="cl-stat-val">${uniqueEmps}</div><div class="cl-stat-lbl">Employees</div></div>
      <div class="cl-stat"><div class="cl-stat-val" style="font-size:16px">$${jjCost.toFixed(2)} <span style="font-size:11px;color:var(--fg-muted)">(${jjItems.length})</span></div><div class="cl-stat-lbl">Jeff's Junk cost</div></div>
      <div class="cl-stat"><div class="cl-stat-val" style="font-size:16px">$${jwgCost.toFixed(2)} <span style="font-size:11px;color:var(--fg-muted)">(${jwgItems.length})</span></div><div class="cl-stat-lbl">Jeff White Group cost</div></div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px">
      <input id="cl-search" class="si-filter-input" placeholder="Search by name…" value="${esc(CL.search||"")}" oninput="JWG.clSetSearch(this.value)" style="max-width:240px">
      <select class="si-filter-select" onchange="JWG.clSetPeriod(this.value)">${periods.map(p=>`<option value="${p.v}"${CL.period===p.v?" selected":""}>${p.l}</option>`).join("")}</select>
      <select class="si-filter-select" onchange="JWG.clSetFilter(this.value)">${types.map(t=>`<option value="${esc(t)}"${CL.filter===t?" selected":""}>${t==="all"?"All items":t}</option>`).join("")}</select>
      <select class="si-filter-select" onchange="JWG.clSetCompany(this.value)"><option value="all"${CL.company==="all"?" selected":""}>Both companies</option>${CLOTHING_COMPANIES.map(c=>`<option value="${esc(c)}"${CL.company===c?" selected":""}>${c}</option>`).join("")}</select>
      ${formerIds.size?`<button class="cl-act-btn" onclick="JWG.clToggleFormer()">${CL.former?"Hide":"Show"} former staff (${formerIds.size})</button>`:""}
    </div>
    ${empList.length?`<div style="font-size:12px;color:var(--fg-muted);margin:0 0 8px">Showing ${items.length} of ${CL.items.length} item${CL.items.length!==1?"s":""}</div><div class="cl-table-wrap"><table class="cl-table">
      <thead><tr>
        <th>Item</th>
        <th>Size</th>
        <th>Staff pays</th>
        <th>Our cost</th>
        <th>Company</th>
        <th>Date Given</th>
        <th>Notes</th>
        <th>Actions</th>
      </tr></thead>
      <tbody>${cards}</tbody>
    </table></div>`:`<div class="cl-empty"><div class="cl-empty-icon">👕</div>${CL.search||CL.filter!=="all"||CL.company!=="all"||CL.period!=="all"?"No matching clothing records.":`No clothing records yet. Click "Give item" to get started.`}</div>`}`;
}

function clOpenAdd(){clOpenForm(null);}
function clOpenEdit(id){clOpenForm(id);}

function clOpenForm(id){
  const item=id?CL.items.find(x=>x.id===id):null;
  // New items only go to people still here. Editing a former person's old record keeps them
  // in the list, marked, so the record does not silently move to someone else.
  const pick=visEmps().slice();
  if(item&&!pick.some(e=>e.id===item.employee_id)){const f=S.employees.find(e=>e.id===item.employee_id);if(f)pick.push(f);}
  const empOpts=pick.map(e=>`<option value="${e.id}"${item&&item.employee_id===e.id?" selected":""}>${esc(e.name)}${e.hidden?" (former)":""}</option>`).join("");
  const typeOpts=CLOTHING_TYPES.map(t=>`<option value="${t}"${item&&item.item_type===t?" selected":""}>${t}</option>`).join("");
  const sizeOpts=CLOTHING_SIZES.map(s=>`<option value="${s}"${item&&item.size===s?" selected":""}>${s}</option>`).join("");
  const companyOpts=CLOTHING_COMPANIES.map(c=>`<option value="${c}"${item&&item.company===c?" selected":""}>${c}</option>`).join("");
  const today=localDateStr(new Date());

  const h=`
    <div class="modal-title">${item?"Edit Clothing Item":"Add Clothing Item"}</div>
    <div class="modal-sub">${item?"Update the details below.":"Record a clothing item given to an employee."}</div>
    <div class="cl-form-row">
      <div class="cl-form-label">Employee *</div>
      <select class="cl-select" id="cl_emp">${empOpts}</select>
    </div>
    <div class="cl-form-row">
      <div class="cl-form-label">Company *</div>
      <select class="cl-select" id="cl_company">${companyOpts}</select>
    </div>
    <div class="cl-form-grid">
      <div class="cl-form-row">
        <div class="cl-form-label">Item Type *</div>
        <select class="cl-select" id="cl_type">${typeOpts}</select>
      </div>
      <div class="cl-form-row">
        <div class="cl-form-label">Size</div>
        <select class="cl-select" id="cl_size"><option value="">—</option>${sizeOpts}</select>
      </div>
    </div>
    ${item?"":`<div class="cl-form-row">
      <div class="cl-form-label">Quantity <span style="opacity:.5;font-weight:400;text-transform:none">add several of the same item at once</span></div>
      <input class="cl-input" type="number" min="1" max="50" step="1" id="cl_qty" value="1">
    </div>`}
    <div class="cl-form-grid">
      <div class="cl-form-row">
        <div class="cl-form-label">Employee Price ($) <span style="opacity:.5;font-weight:400;text-transform:none">what they "pay"</span></div>
        <input class="cl-input" type="number" step="0.01" min="0" id="cl_price" placeholder="0.00" value="${item?((+item.price)||""):""}">
      </div>
      <div class="cl-form-row">
        <div class="cl-form-label">Purchase Cost ($) <span style="opacity:.5;font-weight:400;text-transform:none">what we actually paid</span></div>
        <input class="cl-input" type="number" step="0.01" min="0" id="cl_purchase" placeholder="0.00" value="${item?((+item.purchase_price)||""):""}">
      </div>
    </div>
    <div class="cl-form-row">
      <div class="cl-form-label">Date Given</div>
      <input class="cl-input" type="date" id="cl_date" value="${item?.date_given||today}">
    </div>
    <div class="cl-form-row">
      <div class="cl-form-label">Notes <span style="opacity:.5;font-weight:400;text-transform:none">(optional)</span></div>
      <input class="cl-input" id="cl_notes" placeholder="Any extra details…" value="${esc(item?.notes||"")}">
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
      <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
      <button class="modal-done" onclick="JWG.clSaveForm('${id||""}')">${item?"Save changes":"Give item"}</button>
    </div>`;
  openModal(h,"480px");
}

async function clSaveForm(id){
  const emp=document.getElementById("cl_emp")?.value;
  const type=document.getElementById("cl_type")?.value;
  const company=document.getElementById("cl_company")?.value;
  if(!emp){toast("Select an employee","error");return;}
  if(!type){toast("Select an item type","error");return;}
  if(!company){toast("Select a company","error");return;}
  const data={
    employee_id:emp,
    item_type:type,
    size:document.getElementById("cl_size")?.value||"",
    price:parseFloat(document.getElementById("cl_price")?.value)||0,
    purchase_price:parseFloat(document.getElementById("cl_purchase")?.value)||0,
    company:company,
    date_given:document.getElementById("cl_date")?.value||localDateStr(new Date()),
    notes:document.getElementById("cl_notes")?.value.trim()||"",
  };
  try{
    const qty=id?1:Math.max(1,Math.min(50,parseInt(document.getElementById("cl_qty")?.value,10)||1));
    if(id){
      await updateClothingItem(id,data);
      const idx=CL.items.findIndex(x=>x.id===id);
      if(idx>=0){
        const empObj=S.employees.find(e=>e.id===data.employee_id);
        CL.items[idx]={...CL.items[idx],...data,employees:{name:empObj?.name||"Unknown"}};
      }
    }else{
      const body=qty>1?Array.from({length:qty},()=>({...data})):data;
      const created=await saveClothingItem(body);
      const empObj=S.employees.find(e=>e.id===data.employee_id);
      (Array.isArray(created)?created:[created]).forEach(c=>{c.employees={name:empObj?.name||"Unknown"};CL.items.unshift(c);});
    }
    closeModal();renderClothingBoard();toast(id?"Item updated":(qty>1?qty+" items added":"Item added"));
  }catch(e){toast(e.message,"error");}
}

async function clDelete(id){
  const rec=CL.items.find(x=>x.id===id);
  const tgt=[rec&&rec.employees?.name,rec&&rec.item_type].filter(Boolean).join(" — ");
  if(!(await jwgConfirm({title:"Remove clothing record",target:tgt,confirmLabel:"Remove"})))return;
  try{
    await deleteClothingItem(id);
    CL.items=CL.items.filter(x=>x.id!==id);
    renderClothingBoard();toast("Item removed");
  }catch(e){toast(e.message,"error");}
}

/* ===== realtime.js ===== */
// ── REALTIME.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

let _sbClient=null;
let _realtimeChannel=null;
// Cooldown: skip realtime overwrites for employees we just saved locally (prevents stale echo)
let _schedSaveCooldown={};

function isModalOpen(){return !!document.getElementById("moverlay");}

function initRealtime(){
  if(!db)return;
  try{
    _sbClient=db;
  }catch(e){console.warn("Realtime init failed:",e);return;}

  _realtimeChannel=_sbClient.channel("live-sync")

    // ── Workshop Tasks ──
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"jwg_workshop_tasks"},payload=>{
      const row=payload.new;
      if(!row||WT.tasks.some(t=>t.id===row.id))return;
      WT.tasks.unshift(row);
      if(S.tab==="tasks"&&!isModalOpen())renderTasksBoard();
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"jwg_workshop_tasks"},payload=>{
      const row=payload.new;
      if(!row)return;
      const idx=WT.tasks.findIndex(t=>t.id===row.id);
      if(idx>=0)WT.tasks[idx]={...WT.tasks[idx],...row};
      else WT.tasks.unshift(row);
      if(S.tab==="tasks"&&!isModalOpen())renderTasksBoard();
    })
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"jwg_workshop_tasks"},payload=>{
      const old=payload.old;
      if(!old)return;
      WT.tasks=WT.tasks.filter(t=>t.id!==old.id);
      if(S.tab==="tasks"&&!isModalOpen())renderTasksBoard();
    })

    // ── Schedules ──
    .on("postgres_changes",{event:"*",schema:"public",table:"jwg_schedules"},payload=>{
      const row=payload.eventType==="DELETE"?payload.old:payload.new;
      if(!row)return;
      if(payload.eventType==="DELETE"){
        S.allSchedules=S.allSchedules.filter(s=>!(s.employee_id===row.employee_id&&s.week_start===row.week_start));
      }else{
        const idx=S.allSchedules.findIndex(s=>s.employee_id===row.employee_id&&s.week_start===row.week_start);
        if(idx>=0)S.allSchedules[idx]=row;
        else S.allSchedules.push(row);
      }
      // Update current view if it's for the week we're looking at
      const currentWeek=wkey(S.weekOffset);
      if(row.week_start===currentWeek){
        const emp=S.employees.find(e=>e.id===row.employee_id);
        if(emp){
          // Skip overwrite if modal is open (user mid-edit) or employee was recently saved locally
          if(isModalOpen()||_schedSaveCooldown[row.employee_id]){
            return;
          }
          if(payload.eventType==="DELETE"){
            S.schedule[row.employee_id]=defSched();
          }else{
            S.schedule[row.employee_id]=migrateSched(JSON.parse(JSON.stringify(row.schedule_data)));
          }
          if(S.tab==="schedule")refreshGrid();
          else if(S.tab==="history"||S.tab==="analytics"||S.tab==="insights")render();
        }
      }
    })

    // ── Employees ──
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"jwg_employees"},payload=>{
      const row=payload.new;
      if(!row||S.employees.some(e=>e.id===row.id))return;
      S.employees.push(row);
      S.schedule[row.id]=defSched();
      if(!isModalOpen())render();
    })
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"jwg_employees"},payload=>{
      const old=payload.old;
      if(!old)return;
      S.employees=S.employees.filter(e=>e.id!==old.id);
      delete S.schedule[old.id];
      if(!isModalOpen())render();
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"jwg_employees"},payload=>{
      const row=payload.new;
      if(!row)return;
      const idx=S.employees.findIndex(e=>e.id===row.id);
      if(idx>=0)S.employees[idx]={...S.employees[idx],...row};
      if(!isModalOpen())render();
    })

    // ── Master roster (Team page) — hide/show people the moment they're
    //    soft-removed or re-activated there ──
    .on("postgres_changes",{event:"*",schema:"public",table:"crew_members"},payload=>{
      const row=payload.eventType==="DELETE"?payload.old:payload.new;
      if(!row||!row.jwg_id)return;
      const emp=S.employees.find(e=>e.id===row.jwg_id);
      if(!emp)return;
      const wasHidden=!!emp.hidden;
      emp.hidden=payload.eventType!=="DELETE"&&(row.active===false||row.on_jwg===false);
      // Regrouping someone on the Team page moves their row here immediately,
      // without a reload — same live path the hidden flag already rides.
      if(payload.eventType!=="DELETE"){emp.group=row.crew_group||"";emp.manager=!!row.is_manager;}
      // Someone just removed on the Team page has had their shifts deleted from
      // today on, so drop them here too — otherwise this tab keeps showing weeks
      // that no longer exist and a bulk save would write them all back. Only for
      // a removal: switching the Jeff White Group side off deletes nothing.
      if(!wasHidden&&emp.hidden&&row.active===false)rosterPruneLocal(emp.id);
      if(!isModalOpen())render();
    })

    // ── App Settings (tasks list, work hours, emp order) ──
    .on("postgres_changes",{event:"*",schema:"public",table:"jwg_app_settings"},payload=>{
      const row=payload.new;
      if(!row)return;
      if(row.key==="tasks"&&Array.isArray(row.value)){
        tasks=row.value;localStorage.setItem("ss_tasks",JSON.stringify(tasks));
        if(!isModalOpen()&&(S.tab==="schedule"))refreshGrid();
      }else if(row.key==="wh"){
        WH=row.value;localStorage.setItem("ss_wh",JSON.stringify(WH));
        if(!isModalOpen()&&S.tab==="schedule")refreshGrid();
      }else if(row.key==="crew_groups"){
        localStorage.setItem("ss_crew_groups",JSON.stringify(row.value));
        if(!isModalOpen())render();
      }else if(row.key==="emp_order"){
        localStorage.setItem("ss_emp_order",JSON.stringify(row.value));
        applyStoredOrder();
        if(!isModalOpen())render();
      }
    })

    // ── Service Locations ──
    .on("postgres_changes",{event:"*",schema:"public",table:"jwg_service_locations"},payload=>{
      const row=payload.eventType==="DELETE"?payload.old:payload.new;
      if(!row)return;
      if((S.tab==="summer"||S.tab==="winter")&&!isModalOpen()){
        if(S.tab==="summer")loadSummerData().then(()=>renderSummerPage());
        else if(S.tab==="winter")loadWinterData().then(()=>renderWinterPage());
      }
    })

    // ── Service Types ──
    .on("postgres_changes",{event:"*",schema:"public",table:"jwg_service_types"},payload=>{
      const row=payload.eventType==="DELETE"?payload.old:payload.new;
      if(!row)return;
      if((S.tab==="summer"||S.tab==="winter")&&!isModalOpen()){
        if(S.tab==="summer")loadSummerData().then(()=>renderSummerPage());
        else if(S.tab==="winter")loadWinterData().then(()=>renderWinterPage());
      }
    })

    // ── Location Services ──
    .on("postgres_changes",{event:"*",schema:"public",table:"jwg_location_services"},payload=>{
      const row=payload.eventType==="DELETE"?payload.old:payload.new;
      if(!row)return;
      if((S.tab==="summer"||S.tab==="winter")&&!isModalOpen()){
        if(S.tab==="summer")loadSummerData().then(()=>renderSummerPage());
        else if(S.tab==="winter")loadWinterData().then(()=>renderWinterPage());
      }
    })

    // ── Salt Bins ──
    .on("postgres_changes",{event:"*",schema:"public",table:"jwg_salt_bins"},payload=>{
      const row=payload.eventType==="DELETE"?payload.old:payload.new;
      if(!row)return;
      if(S.tab==="winter"&&!isModalOpen()){
        const idx=WIN.saltBins.findIndex(s=>s.id===row.id);
        if(payload.eventType==="DELETE"){if(idx>=0)WIN.saltBins.splice(idx,1);}
        else if(idx>=0)WIN.saltBins[idx]={...WIN.saltBins[idx],...row};
        else WIN.saltBins.push(row);
        renderWinterPage();
      }
    })

    // ── Inventory Items ──
    // (inventory live-sync moved to app-jwg-inventory.js, which keeps its own
    //  channel so the kiosk can subscribe without this file)

    .subscribe(status=>{
      if(status==="SUBSCRIBED")console.log("Realtime: connected");
      else if(status==="CHANNEL_ERROR")console.warn("Realtime: channel error, will retry");
    });
}

// Re-render after modal closes to catch any changes that arrived while editing
const _origCloseModal=closeModal;
closeModal=function(){
  _origCloseModal();
  // Small delay to let DOM settle, then refresh current view
  setTimeout(()=>{
    if(S.tab==="tasks")renderTasksBoard();
    else if(S.tab==="schedule")refreshGrid();
    else render();
  },50);
};
/* ===== app.js ===== */
// ── APP.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

async function bootApp(){
  showSkeleton();
  try{
    await loadSettings();
    const[emps,scheds,crew]=await Promise.all([loadEmps(),loadScheds(),loadCrewFlags()]);
    S.employees=emps||[];S.allSchedules=scheds||[];
    applyCrewFlags(crew);applyStoredOrder();
    loadWeekSched();
  }catch(e){toast("Load failed: "+e.message,"error");}
  render();
}

let _jwgBooted=false;
function renderJwgScheduler(){
  if(_jwgBooted){render();return;}
  _jwgBooted=true;
  bootApp();
  initRealtime();
}
// Lightweight entry for the standalone inventory kiosk (Darrin): loads ONLY the
// inventory module, not the whole scheduler. Mounts into the page's existing
// #view-jwgscheduler > #app > .card scaffold.



/* ===== JWG exports ===== */
window.renderJwgScheduler=renderJwgScheduler;
// The Team page (app-team.js) calls these when someone is removed there.
window.JWGRoster={forwardSummary:rosterForwardSummary,clearForward:rosterClearForward};
window.JWG={addSummerServiceType:addSummerServiceType,addWinterServiceType:addWinterServiceType,adjustWinterSalt:adjustWinterSalt,applyMultiAssign:applyMultiAssign,applyMultiClear:applyMultiClear,applyWH:applyWH,clDelete:clDelete,clOpenAdd:clOpenAdd,clOpenEdit:clOpenEdit,clSaveForm:clSaveForm,clSetCompany:clSetCompany,clSetFilter:clSetFilter,clSetPeriod:clSetPeriod,clSetSearch:clSetSearch,clToggleFormer:clToggleFormer,closeModal:closeModal,deleteSummerLocation:deleteSummerLocation,deleteSummerServiceType:deleteSummerServiceType,deleteWinterLocation:deleteWinterLocation,deleteWinterServiceType:deleteWinterServiceType,dismissToast:dismissToast,editSummerLocation:editSummerLocation,editWinterLocation:editWinterLocation,filterAndSortSummer:filterAndSortSummer,filterAndSortWinter:filterAndSortWinter,goToday:goToday,maPick:maPick,maToggleAllDays:maToggleAllDays,maToggleDay:maToggleDay,maToggleEmp:maToggleEmp,maToggleEveryone:maToggleEveryone,fillWeekFromUsual:fillWeekFromUsual,setRepeats:setRepeats,mcPickTask:mcPickTask,mcToggleAllDays:mcToggleAllDays,mcToggleDay:mcToggleDay,mcToggleEmp:mcToggleEmp,mcToggleEveryone:mcToggleEveryone,nextW:nextW,openAddSummerLocation:openAddSummerLocation,openAddWinterLocation:openAddWinterLocation,openManageSummerServiceTypes:openManageSummerServiceTypes,openManageWinterServiceTypes:openManageWinterServiceTypes,openMultiAssign:openMultiAssign,openMultiClear:openMultiClear,openShiftModal:openShiftModal,openTaskMgr:openTaskMgr,openUsualWeeks:openUsualWeeks,saveUsualWeek:saveUsualWeek,clearUsualWeek:clearUsualWeek,applyUsualWeek:applyUsualWeek,openWHSettings:openWHSettings,prevW:prevW,saveSummerLocation:saveSummerLocation,setSummerView:setSummerView,saveWinterLocation:saveWinterLocation,setWinterSalt:setWinterSalt,setWinterView:setWinterView,reloadWinter:reloadWinter,sbF:sbF,toast:toast,openModal:openModal,jwgConfirm:jwgConfirm,switchTab:switchTab,tmAdd:tmAdd,tmCC:tmCC,tmDel:tmDel,tmLC:tmLC,toggleAlphaSort:toggleAlphaSort,toggleDay:toggleDay,toggleHistoryWeek:toggleHistoryWeek,updateSummerLocation:updateSummerLocation,updateWinterLocation:updateWinterLocation,wtDelete:wtDelete,wtMarkDone:wtMarkDone,wtOpenAdd:wtOpenAdd,wtOpenEdit:wtOpenEdit,wtPickPrio:wtPickPrio,wtReopen:wtReopen,wtSaveForm:wtSaveForm,wtSetFilter:wtSetFilter,wtTogglePerson:wtTogglePerson,S:S,SUM:SUM,WIN:WIN,CL:CL,WT:WT,render:render,closeEditor:closeEditor,edJob:edJob,edAway:edAway,edHrs:edHrs,edAllDay:edAllDay,edCustom:edCustom,edCustomSet:edCustomSet,edSel:edSel,edAdd:edAdd,edRemove:edRemove,edClear:edClear,edNote:edNote,edApply:edApply,mSetCrew:mSetCrew};
})();
