/* app-jwg-scheduler.js -- generated bundle; rebuild via build_jwg_js.py */
(function(){
/* ===== config.js ===== */
// ── CONFIG.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

const SUPABASE_URL=window.SUPABASE_URL,SUPABASE_ANON_KEY=window.SUPABASE_KEY,USE_SUPABASE=true;
const DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const WEEKDAYS=["Monday","Tuesday","Wednesday","Thursday","Friday"];
const WEEKEND=["Saturday","Sunday"];

// Work hours – default 7am–5pm
let WH=JSON.parse(localStorage.getItem("ss_wh")||"null")||{start:7,end:17};

// ── APP SETTINGS (Supabase-backed) ──
async function saveSetting(key,value){
  localStorage.setItem("ss_"+key,JSON.stringify(value));
  if(!USE_SUPABASE)return;
  try{await sbF("POST","jwg_app_settings?on_conflict=key",{key,value,updated_at:new Date().toISOString()});}catch(e){console.warn("Setting save failed:",e);}
}
async function loadSettings(){
  if(!USE_SUPABASE)return;
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

// Tasks
const DEFAULT_TASKS=[
  {id:"off",label:"Off",bg:"rgba(0,0,0,0.04)",text:"rgba(0,0,0,0.28)",dot:"rgba(0,0,0,0.2)",builtIn:true},
  {id:"sick",label:"Sick",bg:"#fff7ed",text:"#c2410c",dot:"#f97316",builtIn:true},
  {id:"bins",label:"Bins",bg:"#dcfce7",text:"#15803d",dot:"#22c55e"},
  {id:"junk",label:"Junk Removals",bg:"#dbeafe",text:"#1d4ed8",dot:"#60a5fa"},
  {id:"furniture",label:"Furniture Bank",bg:"#ede9fe",text:"#7c3aed",dot:"#a78bfa"},
  {id:"garbage",label:"Garbage",bg:"#fee2e2",text:"#dc2626",dot:"#f87171"},
  {id:"shop",label:"Shop",bg:"#fef9c3",text:"#a16207",dot:"#eab308"},
];
let tasks=JSON.parse(localStorage.getItem("ss_tasks")||"null");
// Reset tasks if they contain old default task IDs (migration)
if(tasks&&tasks.some(t=>["open","floor","cash","kitchen","delivery","supervisor","training","close","break"].includes(t.id))){
  tasks=null;localStorage.removeItem("ss_tasks");
}
tasks=tasks||DEFAULT_TASKS;
const TM=()=>Object.fromEntries(tasks.map(t=>[t.id,t]));
function saveTasks(){localStorage.setItem("ss_tasks",JSON.stringify(tasks));saveSetting("tasks",tasks);}
function hex2rgb(h){try{return[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];}catch{return[94,106,210];}}
function darken(h){try{const[r,g,b]=hex2rgb(h);return`rgb(${Math.round(r*.55)},${Math.round(g*.55)},${Math.round(b*.55)})`;}catch{return h;}}

const AVC=[
  ["#15803d","#fff"],["#1d4ed8","#fff"],["#7c3aed","#fff"],
  ["#dc2626","#fff"],["#a16207","#fff"],["#0369a1","#fff"],
  ["#c2410c","#fff"],["#0f766e","#fff"]
];
const ac=n=>{const s=n||"?";const h=([...s]).reduce((a,c)=>a+c.charCodeAt(0),0);return AVC[h%AVC.length];};
function empInitials(name){const p=(name||"?").trim().split(/\s+/);if(p.length>=2)return(p[0][0]+p[1][0]).toUpperCase();if(name.length>=2)return(name[0]+name[1]).toUpperCase();return name[0].toUpperCase();}
function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML;}

/* ===== state.js ===== */
// ── STATE.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

function defSched(){const s={};DAYS.forEach(d=>{s[d]={status:"off",shifts:[]};});return s;}
// Migrate old format (single shift object) to new format (status+shifts array)
function migrateSched(s){
  if(!s)return defSched();
  const out={};
  DAYS.forEach(d=>{
    const v=s[d];
    if(!v){out[d]={status:"off",shifts:[]};return;}
    // Already new format
    if(v.status!==undefined){out[d]=v;return;}
    // Old format: {task, start, end}
    if(v.task==="off"||!v.task){out[d]={status:"off",shifts:[]};}
    else if(v.task==="sick"){out[d]={status:"sick",shifts:[]};}
    else{out[d]={status:"work",shifts:[{task:v.task,start:v.start,end:v.end}]};}
  });
  return out;
}
function countH(s){
  if(!s)return 0;let tot=0;
  DAYS.forEach(d=>{
    const day=s[d];
    if(!day||day.status==="off"||day.status==="sick")return;
    (day.shifts||[]).forEach(sh=>{
      if(sh.start&&sh.end){const[sh2,sm]=sh.start.split(":").map(Number),[eh,em]=sh.end.split(":").map(Number);tot+=(eh+em/60)-(sh2+sm/60);}
    });
  });
  return Math.round(tot*10)/10;
}
function dayHours(day){
  if(!day||day.status==="off"||day.status==="sick")return 0;
  let t=0;(day.shifts||[]).forEach(sh=>{if(sh.start&&sh.end){const[a,b]=sh.start.split(":").map(Number),[c,e]=sh.end.split(":").map(Number);t+=(c+e/60)-(a+b/60);}});
  return t;
}

// Default: weekdays only
let S={tab:"schedule",weekOffset:0,employees:[],allSchedules:[],schedule:{},activeDays:[...WEEKDAYS],saving:false,aPeriod:"4w",hFilter:"all",hOpen:{},mobileDayIdx:0,sortAlpha:false};

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
function lsG(k){try{return JSON.parse(localStorage.getItem(k))}catch{return null}}
function lsS(k,v){localStorage.setItem(k,JSON.stringify(v))}
async function loadEmps(){if(USE_SUPABASE)return sbF("GET","jwg_employees?select=*&order=name");return lsG("ss_emps")||[];}
async function saveEmp(name){if(USE_SUPABASE){const r=await sbF("POST","jwg_employees",{name});return r[0];}const l=lsG("ss_emps")||[],e={id:Date.now().toString(),name};lsS("ss_emps",[...l,e]);return e;}
async function delEmp(id){if(USE_SUPABASE)return sbF("DELETE",`jwg_employees?id=eq.${id}`);lsS("ss_emps",(lsG("ss_emps")||[]).filter(e=>e.id!==id));}
async function loadScheds(){if(USE_SUPABASE){const since=new Date();since.setFullYear(since.getFullYear()-1);return sbF("GET","jwg_schedules?select=*&week_start=gte."+localDateStr(since));}return lsG("ss_scheds")||[];}
async function upsertSched(eid,ws,data){const w=localDateStr(ws);if(USE_SUPABASE)return sbF("POST","jwg_schedules?on_conflict=employee_id,week_start",{employee_id:eid,week_start:w,schedule_data:data,updated_at:new Date().toISOString()});const l=lsG("ss_scheds")||[],i=l.findIndex(s=>s.employee_id===eid&&s.week_start===w);const e={id:`${eid}_${w}`,employee_id:eid,week_start:w,schedule_data:data};if(i>=0)l[i]=e;else l.push(e);lsS("ss_scheds",l);}

let toastT;
const TOAST_ICONS={success:"✓",error:"✕",info:"ℹ"};
function toast(msg,type="success"){
  const el=document.getElementById("jwg-toast");
  el.className=type+" show";
  el.innerHTML=`<span class="t-icon">${TOAST_ICONS[type]||"✓"}</span><span class="t-msg">${msg}</span><span class="t-close" onclick="JWG.dismissToast()">✕</span>`;
  clearTimeout(toastT);
  toastT=setTimeout(()=>dismissToast(),3200);
}
function dismissToast(){
  const el=document.getElementById("jwg-toast");
  el.classList.remove("show");el.classList.add("hide");
  setTimeout(()=>{el.className="";el.innerHTML="";},280);
}

function closeModal(){const o=document.getElementById("moverlay");if(o)o.remove();}
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
function updateModal(html,width){
  // Update existing modal content in-place (preserves scroll, no flicker)
  const m=document.querySelector("#moverlay .modal");
  if(m){
    const scrollTop=m.scrollTop;
    m.innerHTML=html;
    if(width)m.style.width=width;
    m.scrollTop=scrollTop;
  } else {
    openModal(html,width);
  }
}
function openModal(html,width){
  closeModal();
  const ov=document.createElement("div");ov.className="moverlay open";ov.id="moverlay";
  ov.onmousedown=e=>{if(e.target===ov)closeModal();};
  const m=document.createElement("div");m.className="modal";
  if(width)m.style.width=width;
  m.innerHTML=html;ov.appendChild(m);(document.getElementById("view-jwgscheduler")||document.body).appendChild(ov);
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

// ── FAB VISIBILITY (mobile only, schedule tab) ──
function updateFAB(){
  const fab=document.getElementById("fab");
  const stt=document.getElementById("scroll-top");
  if(!fab)return;
  const isMobile=window.innerWidth<=600;
  if(isMobile&&S.tab==="schedule"&&S.employees.length>0){
    fab.classList.add("fab-show");
  } else {
    fab.classList.remove("fab-show");
    fab.style.display="none";
  }
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
function openTaskMgr(){openModal(buildTMHtml(),"460px");}
function buildTMHtml(){
  let h=`<div class="modal-title">Customize Tasks</div>
  <div class="modal-sub">Rename, recolor, or create tasks specific to your team.</div>
  <div id="tmList">`;
  tasks.forEach((t,i)=>{
    h+=`<div class="titem">
      <div class="tswatch" style="background:${t.dot}"><input type="color" value="${t.dot}" oninput="JWG.tmCC(${i},this.value)"></div>
      <input class="tname" value="${esc(t.label)}" oninput="JWG.tmLC(${i},this.value)"${t.builtIn?' title="Built-in"':''}>
      ${!t.builtIn?`<button class="tdelbtn" onclick="JWG.tmDel(${i})">Remove</button>`:`<span style="font-size:10px;color:rgba(0,0,0,0.28);flex-shrink:0;font-style:italic">default</span>`}
    </div>`;
  });
  h+=`</div>
  <div class="modal-divider"></div>
  <div class="sect-label">Add New Task</div>
  <div class="add-task-row">
    <div class="new-color-wrap" id="ncw" style="background:#1a7a3c"><input type="color" id="ncol" value="#1a7a3c" oninput="document.getElementById('ncw').style.background=this.value"></div>
    <input class="new-tname" id="nname" placeholder="e.g. Showing, Admin, Open House…" onkeydown="if(event.key==='Enter')JWG.tmAdd()">
    <button class="add-tbtn" onclick="JWG.tmAdd()">Add</button>
  </div>
  <div style="display:flex;justify-content:flex-end;margin-top:20px"><button class="modal-done" onclick="JWG.closeModal()">Done</button></div>`;
  return h;
}
function reTMList(){const el=document.getElementById("tmList");if(!el)return;let h="";tasks.forEach((t,i)=>{h+=`<div class="titem"><div class="tswatch" style="background:${t.dot}"><input type="color" value="${t.dot}" oninput="JWG.tmCC(${i},this.value)"></div><input class="tname" value="${esc(t.label)}" oninput="JWG.tmLC(${i},this.value)"${t.builtIn?' title="Built-in"':''}>` + (!t.builtIn?`<button class="tdelbtn" onclick="JWG.tmDel(${i})">Remove</button>`:`<span style="font-size:10px;color:rgba(0,0,0,0.28);flex-shrink:0;font-style:italic">default</span>`) + `</div>`;});el.innerHTML=h;}
function tmLC(i,v){tasks[i].label=v;saveTasks();}
function tmCC(i,hex){
  const[r,g,b]=hex2rgb(hex);
  tasks[i].dot=hex;
  tasks[i].bg=`rgba(${r},${g},${b},0.12)`;
  tasks[i].text=darken(hex);
  const sw=document.querySelectorAll(".tswatch");if(sw[i])sw[i].style.background=hex;
  saveTasks();
}
function tmDel(i){if(tasks[i].builtIn){toast("Can't delete default tasks","error");return;}const id=tasks[i].id;tasks.splice(i,1);Object.values(S.schedule).forEach(emp=>DAYS.forEach(d=>{if(emp[d]?.shifts){emp[d].shifts=emp[d].shifts.map(sh=>{const t=getShiftTasks(sh).filter(t=>t!==id);return{...sh,tasks:t};}).filter(sh=>sh.tasks.length>0);}if(emp[d]?.shifts?.length===0&&emp[d]?.status==="work")emp[d].status="off";}));saveTasks();reTMList();toast("Task deleted");}
function tmAdd(){const n=document.getElementById("nname"),c=document.getElementById("ncol");const nm=(n?.value||"").trim();if(!nm){toast("Enter a task name","error");return;}const hex=c?.value||"#1a7a3c";const[r,g,b]=hex2rgb(hex);tasks.push({id:"c"+Date.now(),label:nm,bg:`rgba(${r},${g},${b},0.12)`,text:darken(hex),dot:hex});saveTasks();if(n)n.value="";reTMList();toast(`"${nm}" added`);}

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
let _selTasks=[];  // array of selected task IDs (supports multi-task)
let _editShiftIdx=null;
let _editEmpId=null;
let _editDay=null;
function openShiftModal(empId,day){
  const emp=S.employees.find(e=>e.id===empId);
  if(!S.schedule[empId])S.schedule[empId]=defSched();
  const dayData=S.schedule[empId][day]||{status:"off",shifts:[]};
  _selTasks=[];
  _editShiftIdx=null;
  renderShiftModal(empId,day,emp,dayData);
}
function renderShiftModal(empId,day,emp,dayData){
  const tm=TM();
  const defStart=`${WH.start}:00`,defEnd=`${WH.end}:00`;
  const shifts=dayData.shifts||[];
  const status=dayData.status||"off";

  const working=status!=="dayoff"&&status!=="sick";

  // Build existing shifts list — with edit support
  let shiftListHtml="";
  if(shifts.length>0){
    shifts.forEach((sh,i)=>{
      const taskIds=getShiftTasks(sh);
      const firstT=tm[taskIds[0]];
      const allLabels=taskIds.map(id=>tm[id]?.label||id).join(" + ");
      if(_editShiftIdx===i){
        // Editing this entry inline
        shiftListHtml+=`<div style="background:${firstT?.bg||"#f5f5f5"};border:2px solid ${firstT?.dot||"#ccc"};border-radius:8px;padding:10px 12px;margin-bottom:6px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${firstT?.dot||"#ccc"};display:inline-block;flex-shrink:0"></span>
            <span style="font-weight:700;font-size:12px;color:${firstT?.text||"#333"}">${esc(allLabels)}</span>
            <span style="font-size:10px;color:${firstT?.text||"#333"};opacity:.6;margin-left:auto">editing</span>
          </div>
          <div class="shift-form" style="margin-bottom:8px;">
            <div><div class="sf-label">Start</div><select class="sf-select" id="edit_s${i}">${buildTimeOpts(sh.start||defStart)}</select></div>
            <div><div class="sf-label">End</div><select class="sf-select" id="edit_e${i}">${buildTimeOpts(sh.end||defEnd)}</select></div>
          </div>
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button onclick="JWG.cancelEditShift()" style="background:transparent;border:1px solid rgba(0,0,0,0.15);border-radius:5px;padding:5px 12px;font-size:11px;font-weight:600;cursor:pointer;color:var(--fg-muted)">Cancel</button>
            <button onclick="JWG.saveEditShift('${empId}','${day}',${i})" style="background:var(--accent);color:white;border:none;border-radius:5px;padding:5px 12px;font-size:11px;font-weight:600;cursor:pointer;">Save</button>
          </div>
        </div>`;
      } else {
        shiftListHtml+=`<div style="background:${firstT?.bg||"#f5f5f5"};border:1.5px solid ${firstT?.dot||"#ccc"}40;border-radius:8px;padding:8px 10px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;gap:6px;">
          <div style="display:flex;align-items:center;gap:7px;min-width:0;">
            <span style="width:8px;height:8px;border-radius:50%;background:${firstT?.dot||"#ccc"};display:inline-block;flex-shrink:0"></span>
            <span style="font-weight:700;font-size:12px;color:${firstT?.text||"#333"}">${esc(allLabels)}</span>
            <span style="font-size:11px;color:${firstT?.text||"#333"};opacity:.7;white-space:nowrap">${fmtRange(sh.start,sh.end)}</span>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button onclick="JWG.startEditShift('${empId}','${day}',${i})" style="background:rgba(26,122,60,0.1);color:var(--accent);border:1px solid rgba(26,122,60,0.2);border-radius:5px;padding:3px 8px;font-size:11px;font-weight:600;cursor:pointer">✎</button>
            <button onclick="JWG.removeShiftEntry('${empId}','${day}',${i})" style="background:rgba(239,68,68,0.1);color:#dc2626;border:1px solid rgba(239,68,68,0.2);border-radius:5px;padding:3px 8px;font-size:11px;font-weight:600;cursor:pointer">✕</button>
          </div>
        </div>`;
      }
    });
  }

  const segBase="flex:1;border:none;border-radius:9px;padding:11px 0;font-size:13px;font-weight:700;cursor:pointer;";
  // Header: avatar + name + the actual date, with the status switch alongside
  const _ws=getWS(S.weekOffset),_dt=new Date(_ws);_dt.setDate(_dt.getDate()+DAYS.indexOf(day));
  const _dayDate=_dt.toLocaleDateString("en-US",{month:"short",day:"numeric"});
  const[_abg,_afg]=ac(emp?.name||"");
  let h=`<div class="sm-head">
    <div class="sm-id">
      <div class="sm-avatar" style="background:${_abg};color:${_afg}">${empInitials(emp?.name||"")}</div>
      <div><div class="sm-name">${esc(emp?.name||"")}</div><div class="sm-daylbl">${day} · ${_dayDate}</div></div>
    </div>
    <div class="sm-status">
      <button onclick="JWG.setDayWorking('${empId}','${day}')" style="${segBase}${working?"background:var(--accent);color:#fff":"background:transparent;color:var(--fg-muted)"}">Working</button>
      <button onclick="JWG.markDayOff('${empId}','${day}')" style="${segBase}${status==="dayoff"?"background:rgba(0,0,0,0.55);color:#fff":"background:transparent;color:var(--fg-muted)"}">Day off</button>
      <button onclick="JWG.markDaySick('${empId}','${day}')" style="${segBase}${status==="sick"?"background:#ea580c;color:#fff":"background:transparent;color:var(--fg-muted)"}">Off sick</button>
    </div>
  </div>`;
  if(!working){
    h+=`<div class="sm-offnote">${status==="sick"?"🤒 Marked off sick for this day.":"📅 Marked as a day off."}</div>`;
  } else {
    h+=`<div class="sm-cols">
    <div class="sm-col sm-left">
      <div class="sect-label">On the schedule</div>
      ${shifts.length?shiftListHtml:`<div class="sm-emptyday">Nothing scheduled yet — build a shift on the right.</div>`}
      <div class="day-note-wrap">
        <div class="sect-label">📝 Notes <span style="font-weight:400;opacity:.6;text-transform:none;letter-spacing:0">(optional)</span></div>
        <textarea class="day-note" id="day_note" rows="2" placeholder="e.g. Leaving early at 2pm, covering for Sarah, key with manager…" oninput="JWG.saveDayNote('${empId}','${day}',this.value)">${esc(dayData.note||"")}</textarea>
      </div>
    </div>
    <div class="sm-col sm-right">
      <div class="sect-label">Add a shift</div>
      <div class="shift-form">
        <div><div class="sf-label">Start</div><select class="sf-select" id="sm_start">${buildTimeOpts(defStart)}</select></div>
        <div><div class="sf-label">End</div><select class="sf-select" id="sm_end">${buildTimeOpts(defEnd)}</select></div>
      </div>
      <div class="sect-label">Role / Task</div>
      <div class="task-grid">`;
    tasks.filter(t=>t.id!=="off"&&t.id!=="sick").forEach(t=>{
      h+=`<button class="task-opt" id="topt_${t.id}"
        style="background:${t.bg};color:${t.text};border-color:transparent"
        onclick="JWG.pickTask('${t.id}')">
        <span style="width:7px;height:7px;border-radius:50%;background:${t.dot};flex-shrink:0;display:inline-block"></span>
        ${esc(t.label)}
      </button>`;
    });
    h+=`</div>
    </div>
  </div>`;
  }
  h+=`<div class="modal-footer-main">
    <button class="modal-cancel" onclick="JWG.closeSaveShift('${empId}','${day}')">Close</button>
    ${working?`<button class="modal-add-btn" onclick="JWG.addShiftEntry('${empId}','${day}')">Add shift</button>`:""}
  </div>`;
  openModal(h);
}

function startEditShift(empId,day,idx){
  _editShiftIdx=idx;
  _editEmpId=empId;
  _editDay=day;
  const emp=S.employees.find(e=>e.id===empId);
  const dayData=S.schedule[empId][day];
  renderShiftModal(empId,day,emp,dayData);
}
function cancelEditShift(){
  _editShiftIdx=null;
  if(_editEmpId&&_editDay){
    const emp=S.employees.find(e=>e.id===_editEmpId);
    const dayData=S.schedule[_editEmpId]?.[_editDay];
    if(emp&&dayData)renderShiftModal(_editEmpId,_editDay,emp,dayData);
  }
}

function saveEditShift(empId,day,idx){
  const s=document.getElementById(`edit_s${idx}`)?.value;
  const e=document.getElementById(`edit_e${idx}`)?.value;
  if(s&&e){
    const[sh,sm]=s.split(":").map(Number),[eh,em]=e.split(":").map(Number);
    if((eh+em/60)<=(sh+sm/60)){toast("End time must be after start","error");return;}
  }
  if(hasOverlap(S.schedule[empId][day].shifts||[],{start:s,end:e},idx)){toast("This shift overlaps with an existing one — adjust the times","error");return;}
  S.schedule[empId][day].shifts[idx].start=s;
  S.schedule[empId][day].shifts[idx].end=e;
  _editShiftIdx=null;
  const emp=S.employees.find(e=>e.id===empId);
  renderShiftModal(empId,day,emp,S.schedule[empId][day]);
  refreshGrid();updBadge(empId);
  autoSave(empId);
  toast("Time updated");
}

function pickTask(id){
  const i=_selTasks.indexOf(id);
  if(i>=0) _selTasks.splice(i,1); else _selTasks.push(id);
  const tm=TM();
  document.querySelectorAll(".task-opt[id^='topt_']").forEach(b=>{b.classList.remove("sel");b.style.borderColor="transparent";});
  _selTasks.forEach(tid=>{
    const el=document.getElementById("topt_"+tid);
    if(el){el.classList.add("sel");const t=tm[tid];if(t)el.style.borderColor=t.dot;}
  });
}

function addShiftEntry(empId,day){
  const s=document.getElementById("sm_start")?.value;
  const e=document.getElementById("sm_end")?.value;
  if(!_selTasks.length){toast("Select at least one task first","error");return;}
  if(s&&e){
    const[sh,sm]=s.split(":").map(Number),[eh,em]=e.split(":").map(Number);
    if((eh+em/60)<=(sh+sm/60)){toast("End time must be after start","error");return;}
  }
  if(!S.schedule[empId])S.schedule[empId]=defSched();
  const dayData=S.schedule[empId][day];
  const newShift={tasks:[..._selTasks],start:s,end:e};
  if(hasOverlap(dayData.shifts||[],newShift,-1)){toast("This shift overlaps with an existing one — adjust the times","error");return;}
  dayData.status="work";
  dayData.shifts=[...(dayData.shifts||[]),newShift];
  _selTasks=[];
  closeModal();
  refreshGrid();updBadge(empId);autoSave(empId);
  const tm=TM();
  const label=newShift.tasks.map(id=>tm[id]?.label||id).join(" + ");
  toast(`"${label}" added ✓`);
}

function removeShiftEntry(empId,day,idx){
  if(!S.schedule[empId])return;
  const dayData=S.schedule[empId][day];
  dayData.shifts.splice(idx,1);
  if(dayData.shifts.length===0)dayData.status="off";
  const emp=S.employees.find(e=>e.id===empId);
  renderShiftModal(empId,day,emp,dayData);
  refreshGrid();updBadge(empId);autoSave(empId);
}

function markDayOff(empId,day){
  if(!S.schedule[empId])S.schedule[empId]=defSched();
  S.schedule[empId][day]={status:"dayoff",shifts:[]};
  closeModal();refreshGrid();updBadge(empId);autoSave(empId);
}

function markDaySick(empId,day){
  if(!S.schedule[empId])S.schedule[empId]=defSched();
  S.schedule[empId][day]={status:"sick",shifts:[]};
  closeModal();refreshGrid();updBadge(empId);autoSave(empId);
}

function clearDayStatus(empId,day){
  if(!S.schedule[empId])S.schedule[empId]=defSched();
  S.schedule[empId][day]={status:"off",shifts:[]};
  const emp=S.employees.find(e=>e.id===empId);
  renderShiftModal(empId,day,emp,S.schedule[empId][day]);
  refreshGrid();updBadge(empId);autoSave(empId);
}

function setDayWorking(empId,day){
  const dd=S.schedule[empId]&&S.schedule[empId][day];
  if(dd&&(dd.status==="dayoff"||dd.status==="sick"))clearDayStatus(empId,day);
}
function closeSaveShift(empId,day){
  closeModal();refreshGrid();updBadge(empId);
}
function saveDayNote(empId,day,val){
  if(!S.schedule[empId])S.schedule[empId]=defSched();
  S.schedule[empId][day].note=val.trim();
  autoSave(empId);
}

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
  tasks.filter(t=>t.id!=="off"&&t.id!=="sick").forEach(t=>{
    const sel=_ma.tasks.includes(t.id);
    taskHtml+=`<button class="task-opt${sel?" sel":""}" id="matopt_${t.id}"
      style="background:${t.bg};color:${t.text};border-color:${sel?t.dot:"transparent"}"
      onclick="JWG.maPick('${t.id}')">
      <span style="width:7px;height:7px;border-radius:50%;background:${t.dot};flex-shrink:0;display:inline-block"></span>
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

  // Employee list
  const allOn=S.employees.length>0&&S.employees.every(e=>_ma.empIds.includes(e.id));
  let empHtml=`<button class="ma-everyone-btn${allOn?" all-on":""}" onclick="JWG.maToggleEveryone()">
    ${allOn?"✓ Everyone selected":"👥 Select Everyone"}
  </button>
  <div class="ma-emp-list">`;
  S.employees.forEach(e=>{
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
  <div class="modal-title">👥 Assign to Multiple</div>
  <div class="modal-sub">Pick a task, time, days, and employees — all get the same shift added.</div>

  <div class="sect-label">Task</div>
  ${taskHtml}

  <div class="modal-divider"></div>
  <div class="sect-label">Time</div>
  <div class="shift-form">
    <div><div class="sf-label">Start</div><select class="sf-select" id="ma_start">${buildTimeOpts(selStart)}</select></div>
    <div><div class="sf-label">End</div><select class="sf-select" id="ma_end">${buildTimeOpts(selEnd)}</select></div>
  </div>

  <div class="modal-divider"></div>
  <div class="sect-label">Days</div>
  ${dayHtml}

  <div class="modal-divider"></div>
  <div class="sect-label">Employees <span style="font-weight:500;opacity:.6;text-transform:none;letter-spacing:0">${selCount>0?`(${selCount} selected)`:""}</span></div>
  ${S.employees.length?empHtml:'<div style="font-size:12px;color:var(--fg-muted);padding:8px 0">No employees yet — add them in the Team tab.</div>'}

  <div class="modal-divider"></div>
  <div style="display:flex;justify-content:space-between;align-items:center">
    <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
    <button class="modal-done" onclick="JWG.applyMultiAssign()" ${readyToAssign?"":'disabled style="opacity:.45;cursor:not-allowed"'}>
      Assign${(selCount>0&&_ma.days.length>0)?" to "+selCount+" \xD7 "+_ma.days.length+" day"+(_ma.days.length!==1?"s":""):""}
    </button>
  </div>`;

  updateModal(h,"480px");
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
  const allOn=S.employees.every(e=>_ma.empIds.includes(e.id));
  _ma.empIds=allOn?[]:S.employees.map(e=>e.id);
  renderMultiAssign();
}

function applyMultiAssign(){
  const s=document.getElementById("ma_start")?.value||_ma.start;
  const e=document.getElementById("ma_end")?.value||_ma.end;
  if(!_ma.tasks.length){toast("Select at least one task first","error");return;}
  if(!_ma.days.length){toast("Select at least one day","error");return;}
  if(!_ma.empIds.length){toast("Select at least one employee","error");return;}
  if(s&&e){
    const[sh,sm]=s.split(":").map(Number),[eh,em]=e.split(":").map(Number);
    if((eh+em/60)<=(sh+sm/60)){toast("End time must be after start","error");return;}
  }
  let skipped=0;
  const newShift={tasks:[..._ma.tasks],start:s,end:e};
  _ma.empIds.forEach(empId=>{
    if(!S.schedule[empId])S.schedule[empId]=defSched();
    _ma.days.forEach(day=>{
      if(!S.schedule[empId][day])S.schedule[empId][day]={status:"off",shifts:[]};
      const dayData=S.schedule[empId][day];
      if(hasOverlap(dayData.shifts||[],newShift,-1)){skipped++;return;}
      dayData.status="work";
      dayData.shifts=[...(dayData.shifts||[]),{tasks:[...newShift.tasks],start:newShift.start,end:newShift.end}];
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
  tasks.filter(t=>t.id!=="off"&&t.id!=="sick").forEach(t=>{
    const sel=_mc.task===t.id;
    taskHtml+=`<button class="task-opt${sel?" sel":""}" style="background:${t.bg};color:${t.text};border-color:${sel?t.dot:"transparent"}" onclick="JWG.mcPickTask('${t.id}')">
      <span style="width:7px;height:7px;border-radius:50%;background:${t.dot};flex-shrink:0;display:inline-block"></span>
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

  const allEmpOn=S.employees.length>0&&S.employees.every(e=>_mc.empIds.includes(e.id));
  let empHtml=`<button class="ma-everyone-btn${allEmpOn?" all-on":""}" onclick="JWG.mcToggleEveryone()">
    ${allEmpOn?"✓ Everyone selected":"👥 Select Everyone"}
  </button><div class="ma-emp-list">`;
  S.employees.forEach(e=>{
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
  <div class="modal-title">🗑 Clear Multiple</div>
  <div class="modal-sub">Remove shifts from selected employees and days in one go.</div>
  <div class="sect-label">What to clear</div>
  ${taskHtml}
  <div class="modal-divider"></div>
  <div class="sect-label">Days</div>
  ${dayHtml}
  <div class="modal-divider"></div>
  <div class="sect-label">Employees <span style="font-weight:500;opacity:.6;text-transform:none;letter-spacing:0">${selCount>0?"("+selCount+" selected)":""}</span></div>
  ${S.employees.length?empHtml:'<div style="font-size:12px;color:var(--fg-muted);padding:8px 0">No employees yet.</div>'}
  <div class="modal-divider"></div>
  <div style="display:flex;justify-content:space-between;align-items:center">
    <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
    <button style="background:#dc2626;color:white;border:none;border-radius:var(--radius-sm);padding:10px 22px;font-size:13px;font-weight:600;cursor:pointer;opacity:${ready?1:0.45};pointer-events:${ready?"auto":"none"}" onclick="JWG.applyMultiClear()">
      Clear${ready?" "+selCount+" × "+_mc.days.length+" day"+(_mc.days.length!==1?"s":""):""}
    </button>
  </div>`;
  updateModal(h,"480px");
}

function mcPickTask(id){_mc.task=id;renderMultiClear();}
function mcToggleDay(d){const i=_mc.days.indexOf(d);if(i>=0)_mc.days.splice(i,1);else _mc.days.push(d);renderMultiClear();}
function mcToggleAllDays(){const allOn=S.activeDays.every(d=>_mc.days.includes(d));_mc.days=allOn?[]:[...S.activeDays];renderMultiClear();}
function mcToggleEmp(id){const i=_mc.empIds.indexOf(id);if(i>=0)_mc.empIds.splice(i,1);else _mc.empIds.push(id);renderMultiClear();}
function mcToggleEveryone(){const allOn=S.employees.every(e=>_mc.empIds.includes(e.id));_mc.empIds=allOn?[]:S.employees.map(e=>e.id);renderMultiClear();}

async function applyMultiClear(){
  if(!_mc.days.length||!_mc.empIds.length)return;
  const taskLabel=_mc.task==="__all__"?"all tasks":(TM()[_mc.task]?.label||_mc.task);
  const empN=_mc.empIds.length,dayN=_mc.days.length;
  if(!(await jwgConfirm({title:"Clear shifts",message:`Clear ${taskLabel} for ${empN} ${empN!==1?"people":"person"} across ${dayN} ${dayN!==1?"days":"day"}.`,consequence:"This can't be undone.",confirmLabel:"Clear"})))return;
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
        if(dayData.shifts.length===0)dayData.status="off";
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
  const mdv=document.getElementById("mdv");if(mdv)mdv.innerHTML=buildMobileDayView();
}

// ── WORK HOURS ──
/* ===== schedule.js ===== */
// ── SCHEDULE.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

function render(){
  const app=document.getElementById("app");
  const labelMap={schedule:"Schedule",insights:"Insights",history:"History",analytics:"Analytics",team:"Team","tasks":"Tasks",summer:"Summer",winter:"Winter",inventory:"Inventory",clothing:"Clothing"};
  // tell the host which tab-group is active so the header shows the right sub-tabs
  const _tg={summer:"svc",winter:"svc",inventory:"ops",clothing:"ops"}[S.tab]||"sched";
  const _v=document.getElementById("view-jwgscheduler");if(_v)_v.setAttribute("data-tabgroup",_tg);
  // Sync desktop nav
  document.querySelectorAll(".tab-btn").forEach(b=>{b.classList.toggle("active",b.textContent.trim()===labelMap[S.tab]);});
  // Sync mobile nav
  ["schedule","summer","winter","team","inventory","clothing"].forEach(t=>{
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
  else if(S.tab==="inventory"){app.innerHTML=buildInventoryPage();initInventoryPage();}
  else if(S.tab==="clothing"){app.innerHTML=buildClothingPage();initClothingPage();}
  else{app.innerHTML=buildTeam();initTeamDrag();}
  updateFAB();
}

// ── SCHEDULE ──
function buildSched(){
  const ws=getWS(S.weekOffset);
  let h=`<div class="card">
  <div class="week-nav">
    <button class="nav-btn" onclick="JWG.prevW()">← Prev</button>
    <div class="week-label"><strong>${wlbl(S.weekOffset)}</strong><span>${fmtW(ws)}</span></div>
    <div style="display:flex;gap:6px">${S.weekOffset!==0?`<button class="nav-btn" onclick="JWG.goToday()">Today</button>`:""}<button class="nav-btn" onclick="JWG.nextW()">Next →</button></div>
  </div>
  <div class="ctrl-bar">
    <span class="ctrl-label">Days</span>`;

  // Weekdays first (always shown prominently), weekends as toggleable
  WEEKDAYS.forEach(d=>{
    h+=`<button class="day-toggle${S.activeDays.includes(d)?" on":""}" onclick="JWG.toggleDay('${d}')">${d.slice(0,3)}</button>`;
  });
  h+=`<div class="ctrl-sep"></div>
    <span class="ctrl-label" style="font-size:9px;opacity:.7">Weekend</span>`;
  WEEKEND.forEach(d=>{
    h+=`<button class="day-toggle weekend${S.activeDays.includes(d)?" on":""}" onclick="JWG.toggleDay('${d}')">${d.slice(0,3)}</button>`;
  });

  h+=`<div class="ctrl-sep"></div>
    <div class="ctrl-actions">
      <button class="ctrl-btn ctrl-btn-accent" onclick="JWG.copyLastWeek()">📋 Copy last week</button>
      <button class="ctrl-btn" onclick="JWG.openTaskMgr()">⚙ Tasks</button>
      <button class="ctrl-btn" onclick="JWG.openMultiAssign()">👥 Assign</button>
      <button class="ctrl-btn ctrl-btn-danger" onclick="JWG.openMultiClear()">🗑 Clear</button>
      <button class="ctrl-btn" onclick="JWG.openWHSettings()" title="Change visible work hours">⏰ ${fmtHour(WH.start,0)}–${fmtHour(WH.end,0)}</button>
    </div>
    <button class="ctrl-btn ctrl-more-btn" onclick="this.closest('.ctrl-bar').classList.toggle('ctrl-expanded')"><span class="ctrl-more-btn-label">☰ More</span></button>
  </div>`;
  if(!S.employees.length){
    h+=`<div class="empty" style="padding:52px 24px;display:flex;flex-direction:column;align-items:center;gap:16px">
      <div style="width:72px;height:72px;border-radius:50%;background:var(--accent-light);display:flex;align-items:center;justify-content:center;font-size:32px;">👥</div>
      <div style="text-align:center">
        <div style="font-size:16px;font-weight:700;color:var(--fg);margin-bottom:6px">No employees yet</div>
        <div style="font-size:13px;color:var(--fg-muted);max-width:260px;line-height:1.5">Head to the <strong>Team</strong> tab to add your staff, then come back to start scheduling.</div>
      </div>
      <button class="modal-done" style="padding:10px 24px" onclick="JWG.switchTab('team')">Go to Team →</button>
    </div>`;
  } else {
    h+=`<div class="grid-wrap" id="gw">${buildGrid()}</div>`;
    h+=`<div class="mobile-day-view" id="mdv">${buildMobileDayView()}</div>`;
    h+=`<div class="save-bar" id="save-bar"><span id="save-status"></span><span style="font-size:10px;color:var(--fg-subtle)">Auto-saves as you edit</span></div>`;
  }
  const result=h+`</div>`;
  // After HTML is set, init grid drag
  setTimeout(initGridDrag,0);
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
function buildGrid(){
  const ws=getWS(S.weekOffset),tm=TM();
  const daySpan=WH.end-WH.start;
  const todayName=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
  const isCurrentWeek=S.weekOffset===0;


  let h=`<table class="sched-grid"><thead><tr><th class="name-col"><div style="display:flex;align-items:center;justify-content:space-between;gap:4px">EMPLOYEE<button onclick="event.stopPropagation();JWG.toggleAlphaSort()" title="${S.sortAlpha?"Sorted A–Z (click for custom order)":"Sort A–Z"}" style="background:${S.sortAlpha?"var(--accent)":"rgba(0,0,0,0.06)"};color:${S.sortAlpha?"white":"var(--fg-muted)"};border:none;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;cursor:pointer;letter-spacing:.3px;white-space:nowrap">A–Z</button></div></th>`;
  S.activeDays.forEach(d=>{
    const dt=new Date(ws);dt.setDate(dt.getDate()+DAYS.indexOf(d));
    const isWknd=WEEKEND.includes(d);
    const isToday=isCurrentWeek&&d===todayName;
    h+=`<th class="day-col${isToday?" is-today":""}"${isWknd&&!isToday?' style="background:#fafaf8;"':''}>
      <div class="th-day-wrap${isToday?" is-today":""}">
        <div class="th-day${isToday?" is-today":""}"${isWknd&&!isToday?' style="color:#888;"':''}>${d.slice(0,3).toUpperCase()}</div>
        <div class="th-date${isToday?" is-today":""}">${dt.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
        ${isToday?`<div class="today-dot"></div>`:""}
      </div>
    </th>`;
  });
  h+=`</tr></thead><tbody>`;

  const sortedEmps=S.sortAlpha?[...S.employees].sort((a,b)=>a.name.localeCompare(b.name)):S.employees;
  sortedEmps.forEach((emp,empIdx)=>{
    const sc=S.schedule[emp.id]||defSched();
    const hrs=countH(sc);
    const[abg,afg]=ac(emp.name);
    // Workload ring: filled relative to a ~40h target
    const pct=Math.min(hrs/40,1);
    const r=16,circ=2*Math.PI*r,dash=(pct*circ).toFixed(2),gap=(circ-pct*circ).toFixed(2);
    const ringColor=pct>0.7?"#1a7a3c":pct>0.35?"#f59e0b":"transparent";
    const hrsCls=pct>0.6?"hrs-high":pct>0.3?"hrs-mid":"hrs-low";
    const tipText=hrs>0?`${hrs}h scheduled this week`:"No hours this week";
    h+=`<tr class="emp-row" draggable="${S.sortAlpha?"false":"true"}" data-empid="${emp.id}" data-empidx="${empIdx}">
      <td class="name-col">
        <div class="emp-cell-inner">
          ${S.sortAlpha?"":`<span class="drag-handle" data-tip="Drag to reorder" title="Drag to reorder">⠿</span>`}
          <div class="avatar" data-tip="${tipText}" style="background:${abg};color:${afg};width:38px;height:38px;font-size:12px;flex-shrink:0">${empInitials(emp.name)}</div>
          <div><div class="emp-name">${esc(emp.name)}</div><div class="emp-hrs ${hrsCls}" id="hbadge_${emp.id}">${hrs}h</div></div>
        </div>
      </td>`;
    S.activeDays.forEach(d=>{
      const dayData=sc[d]||{status:"off",shifts:[]};
      const status=dayData.status||"off";
      const shifts=dayData.shifts||[];
      const isWknd=WEEKEND.includes(d);
      let cellContent="";

      if(status==="off"){
        cellContent=``;
      } else if(status==="dayoff"){
        cellContent=`<div class="status-label day-off-label">📅 Day Off</div>`;
      } else if(status==="sick"){
        cellContent=`<div class="status-label sick-label">🤒 Sick</div>`;
      } else if(shifts.length>0){
        cellContent=`<div class="shift-stack">`;
        shifts.forEach((sh,i)=>{
          const taskIds=getShiftTasks(sh);
          const firstT=tm[taskIds[0]]||{bg:"#dcfce7",text:"#15803d",dot:"#22c55e",label:taskIds[0]||"?"};
          const allLabels=taskIds.map(id=>tm[id]?.label||id).join(" + ");
          const timeStr=sh.start&&sh.end?fmtRange(sh.start,sh.end):"";
          cellContent+=`<div class="shift-bar shift-bar-flow" style="background:${firstT.bg};color:${firstT.text};border:1.5px solid ${firstT.dot}40;"
            onclick="event.stopPropagation();JWG.openShiftModal('${emp.id}','${d}')">
            <span class="shift-label">${esc(allLabels)}</span>
            ${timeStr?`<span class="shift-times">${timeStr}</span>`:""}
          </div>`;
        });
        cellContent+=`</div>`;
      } else {
        cellContent=``;
      }

      const cellStyle=isWknd?'background:#fafaf8;':'';
      const sickStyle=status==="sick"?'background:rgba(249,115,22,0.06);':'';
      const dayOffStyle=status==="dayoff"?'background:rgba(0,0,0,0.04);':'';
      const isTodayCell=isCurrentWeek&&d===todayName;
      const noteIndicator=dayData.note?`<span title="${esc(dayData.note)}" data-tip="${esc(dayData.note)}" style="position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 2px white,0 0 6px rgba(245,158,11,0.5);z-index:2;pointer-events:none;animation:notePulse 2s ease-in-out infinite"></span>`:'';
      h+=`<td class="day-cell${isTodayCell?" is-today":""}" style="${cellStyle}${sickStyle}${dayOffStyle}" onclick="JWG.openShiftModal('${emp.id}','${d}')">${cellContent}${noteIndicator}</td>`;
    });
    h+=`</tr>`;
  });
  let footCells="";
  S.activeDays.forEach(d=>{
    let cnt=0,hsum=0;
    sortedEmps.forEach(emp=>{const dd=(S.schedule[emp.id]||{})[d];if(dd&&dd.status==="work"&&dd.shifts&&dd.shifts.length){cnt++;hsum+=dayHours(dd);}});
    footCells+=`<td style="text-align:center;font-size:11px;font-weight:700;color:var(--fg-muted);padding:10px 4px"><span style="color:var(--accent)">${cnt} on</span> · ${Math.round(hsum*10)/10}h</td>`;
  });
  h+=`</tbody><tfoot><tr class="sched-foot"><td class="name-col" style="font-weight:700;color:var(--fg-muted);font-size:12px;padding:10px 12px">Daily total</td>${footCells}</tr></tfoot></table>`;
  return h;
}

// ── MOBILE DAY CARD VIEW ──
function setMobileDay(idx){S.mobileDayIdx=idx;render();}

function buildMobileDayView(){
  const ws=getWS(S.weekOffset),tm=TM();
  const todayName=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
  const isCurrentWeek=S.weekOffset===0;
  const days=S.activeDays;
  if(!days.length)return`<div class="empty" style="padding:24px;text-align:center;color:var(--fg-muted);">No days selected</div>`;
  if(S.mobileDayIdx>=days.length)S.mobileDayIdx=0;
  const selDay=days[S.mobileDayIdx];

  // Day tabs row
  let h=`<div class="mday-tabs">`;
  days.forEach((d,i)=>{
    const dt=new Date(ws);dt.setDate(dt.getDate()+DAYS.indexOf(d));
    const isToday=isCurrentWeek&&d===todayName;
    h+=`<button class="mday-tab${S.mobileDayIdx===i?" active":""}${isToday?" is-today":""}" onclick="JWG.setMobileDay(${i})">
      <span class="mdt-name">${d.slice(0,3).toUpperCase()}</span>
      <span class="mdt-date">${dt.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
      <span class="mdt-dot"></span>
    </button>`;
  });
  h+=`</div>`;

  // Employee cards for selected day
  h+=`<div class="mday-cards">`;
  if(!S.employees.length){
    h+=`<div class="empty" style="padding:32px 16px;text-align:center;color:var(--fg-muted);font-size:13px;">No employees yet — go to Team tab to add staff</div>`;
  } else {
    const sortedMobileEmps=S.sortAlpha?[...S.employees].sort((a,b)=>a.name.localeCompare(b.name)):S.employees;
    sortedMobileEmps.forEach(emp=>{
      const sc=S.schedule[emp.id]||defSched();
      const dayData=sc[selDay]||{status:"off",shifts:[]};
      const status=dayData.status||"off";
      const shifts=dayData.shifts||[];
      const[abg,afg]=ac(emp.name);

      let badgeCls="off",badgeTxt="Off",shiftInfo="Tap to schedule";
      if(status==="sick"){
        badgeCls="sick";badgeTxt="🤒 Sick";shiftInfo="Sick day";
      } else if(status==="dayoff"){
        badgeCls="dayoff";badgeTxt="📅 Day Off";shiftInfo="Day off";
      } else if(shifts.length>0){
        const taskLabels=shifts.map(sh=>shiftTaskLabel(sh,tm));
        const firstTime=shifts[0].start&&shifts[0].end?` · ${fmtRange(shifts[0].start,shifts[0].end)}`:"";
        shiftInfo=taskLabels.slice(0,2).join(", ")+(shifts.length>2?` +${shifts.length-2} more`:"")+firstTime;
        badgeCls="working";badgeTxt=`${shifts.length} task${shifts.length>1?"s":""}`;
      }
      const noteIcon=dayData.note?` <span title="${esc(dayData.note)}" style="color:#f59e0b;font-size:11px;">●</span>`:"";
      h+=`<div class="mday-emp-card" onclick="JWG.openShiftModal('${emp.id}','${selDay}')">
        <div class="mday-card-avatar" style="background:${abg};color:${afg};">${empInitials(emp.name)}</div>
        <div class="mday-card-info">
          <div class="mday-card-name">${esc(emp.name)}${noteIcon}</div>
          <div class="mday-card-shift">${esc(shiftInfo)}</div>
        </div>
        <span class="mday-card-badge ${badgeCls}">${badgeTxt}</span>
      </div>`;
    });
  }
  h+=`</div>`;
  return h;
}

function prevW(){S.weekOffset--;loadWeekSched();render();}
function nextW(){S.weekOffset++;loadWeekSched();render();}
function goToday(){S.weekOffset=0;loadWeekSched();render();}
function toggleDay(d){
  const i=S.activeDays.indexOf(d);
  if(i>=0)S.activeDays.splice(i,1);
  else S.activeDays=[...DAYS.filter(x=>[...S.activeDays,d].includes(x))];
  // Clamp mobileDayIdx if days were removed
  if(S.mobileDayIdx>=S.activeDays.length)S.mobileDayIdx=0;
  render();
}
function toggleAlphaSort(){S.sortAlpha=!S.sortAlpha;render();}
function loadWeekSched(){const w=wkey(S.weekOffset);S.employees.forEach(e=>{const f=S.allSchedules.find(s=>s.employee_id===e.id&&s.week_start===w);S.schedule[e.id]=f?migrateSched(JSON.parse(JSON.stringify(f.schedule_data))):defSched();});}

async function copyLastWeek(){
  const prevKey=wkey(S.weekOffset-1);
  const prevRows=S.allSchedules.filter(s=>s.week_start===prevKey);
  if(!prevRows.length){toast("Last week has no schedule to copy","info");return;}
  const hasData=S.employees.some(e=>{const d=S.schedule[e.id];return d&&DAYS.some(day=>d[day]&&((d[day].shifts&&d[day].shifts.length)||d[day].status==="dayoff"||d[day].status==="sick"));});
  if(hasData&&!(await jwgConfirm({title:"Copy last week",message:"This week already has shifts. Replace them with a copy of last week?",confirmLabel:"Replace"})))return;
  S.employees.forEach(e=>{const f=prevRows.find(s=>s.employee_id===e.id);S.schedule[e.id]=f?migrateSched(JSON.parse(JSON.stringify(f.schedule_data))):defSched();});
  autoSave(null);
  refreshGrid();
  toast("Copied last week's schedule");
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
  const toSave=empId?S.employees.filter(e=>e.id===empId):S.employees;
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
    const tally=Object.fromEntries(tasks.map(t=>[t.id,0]));
    let daysOff=0,daysSick=0;
    ss.forEach(s=>{
      const sched=migrateSched(s.schedule_data);
      DAYS.forEach(d=>{
        const day=sched?.[d];
        if(!day)return;
        if(day.status==="sick")daysSick++;
        else if(day.status==="dayoff")daysOff++;  // only explicit day-off
        else if(day.status==="work"&&day.shifts)day.shifts.forEach(sh=>{getShiftTasks(sh).forEach(tid=>{tally[tid]=(tally[tid]||0)+1;});});
      });
    });
    return{...emp,totalH:Math.round(totalH*10)/10,tally,daysOff,daysSick};
  }).sort((a,b)=>a.name.localeCompare(b.name));

  const mxH=Math.max(...empData.map(d=>d.totalH),1);
  const totH=Math.round(empData.reduce((n,e)=>n+e.totalH,0)*10)/10;
  const totSick=empData.reduce((n,e)=>n+e.daysSick,0);
  const totOff=empData.reduce((n,e)=>n+e.daysOff,0);

  // Summary stat tiles
  h+=`<div class="stat-grid-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:22px">
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
      <div class="stat-label">Days Off</div>
    </div>
  </div>`;

  // Employee totals
  h+=`<div class="sect-label" style="margin-bottom:10px">Employee Totals — ${periodLabel}</div>`;
  empData.forEach(emp=>{
    const[abg,afg]=ac(emp.name);
    const top=Object.entries(emp.tally).filter(([k])=>k!=="off"&&k!=="sick").sort((a,b)=>b[1]-a[1])[0];
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
    tasks.filter(t=>t.id!=="off"&&t.id!=="sick"&&emp.tally[t.id]>0).forEach(t=>{h+=`<span class="chip" style="background:${t.bg};color:${t.text}">${esc(t.label)}: ${emp.tally[t.id]}d</span>`;});
    if(emp.daysSick>0)h+=`<span class="chip" style="background:#fff7ed;color:#c2410c;border:1px solid rgba(249,115,22,0.25)">🤒 Sick: ${emp.daysSick}d</span>`;
    if(emp.daysOff>0)h+=`<span class="chip" style="background:rgba(0,0,0,0.06);color:rgba(0,0,0,0.5);border:1px solid rgba(0,0,0,0.15)">📅 Off: ${emp.daysOff}d</span>`;
    h+=`</div></div>`;
  });

  h+=`<div class="legbox" style="margin-top:18px"><div class="sect-label" style="margin-bottom:12px">Task Legend</div><div class="chips">`;
  tasks.filter(t=>t.id!=="off"&&t.id!=="sick").forEach(t=>{h+=`<div style="display:flex;align-items:center;gap:6px;background:${t.bg};color:${t.text};padding:5px 11px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid ${t.dot}30"><span style="width:6px;height:6px;border-radius:50%;background:${t.dot};display:inline-block"></span>${esc(t.label)}</div>`;});
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
      DAYS.forEach(d=>{if(sched[d]?.status==="sick")sickCount++;});
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
        const day=sched[d]||{status:"off",shifts:[]};
        const status=day.status||"off";
        const note=day.note||"";
        if(status==="sick"){
          h+=`<div class="dc2 chip-sick" title="${d}${note?" · "+esc(note):""}"><span class="dc-d">${d.slice(0,3).toUpperCase()}</span><span class="dc-t">🤒 Sick</span>${note?`<span class="dc-n">${esc(note)}</span>`:""}</div>`;
        } else if(status==="dayoff"){
          h+=`<div class="dc2" style="background:rgba(0,0,0,0.04);color:rgba(0,0,0,0.35);border-color:rgba(0,0,0,0.1)" title="${d}${note?" · "+esc(note):""}"><span class="dc-d">${d.slice(0,3).toUpperCase()}</span><span class="dc-t">📅 Off</span>${note?`<span class="dc-n">${esc(note)}</span>`:""}</div>`;
        } else if(status==="work"&&day.shifts?.length>0){
          const firstTask=getShiftTasks(day.shifts[0])[0];
          const t=tm[firstTask];
          if(t)usedTaskIds.add(firstTask);
          const multiLabel=day.shifts.length>1?`+${day.shifts.length-1}`:"";
          h+=`<div class="dc2" style="background:${t?t.bg:"var(--surface-sm)"};color:${t?t.text:"var(--fg-subtle)"};border-color:${t?t.dot+"40":"var(--border)"}" title="${d}: ${day.shifts.map(sh=>{const tid=getShiftTasks(sh)[0];return(tm[tid]?.label||tid)+(sh.start?` ${fmtRange(sh.start,sh.end)}`:"")+( day.note?" · "+day.note:"");}).join(", ")}">
            <span class="dc-d">${d.slice(0,3).toUpperCase()}</span>
            <span class="dc-t">${esc(t?.label||firstTask||"")}${multiLabel?`<span style="font-size:8px;opacity:.7"> ${multiLabel}</span>`:""}</span>
            ${day.shifts[0].start?`<span class="dc-r">${fmtRange(day.shifts[0].start,day.shifts[0].end)}</span>`:""}
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
/* ===== team.js ===== */
// ── TEAM.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

function buildTeam(){
  let h=`<div class="card"><div class="twrap"><div class="stitle" style="margin-bottom:5px">Team</div><div class="ssub" style="margin-bottom:22px">Manage your employees · search by name or drag ⠿ to reorder</div>
  <div class="addbox"><div class="sect-label" style="margin-bottom:11px">Add person</div>
  <div style="display:flex;gap:9px"><input class="addinput" id="nEmp" placeholder="Full name…" onkeydown="if(event.key==='Enter')JWG.addEmp()"><button class="addbtn" onclick="JWG.addEmp()">Add person</button></div></div>
  ${S.employees.length>1?`<input class="addinput" id="teamSearch" placeholder="Search by name…" style="margin-bottom:14px" oninput="JWG.teamSearch(this.value)">`:""}`;
  if(!S.employees.length)h+=`<div class="empty" style="height:100px">No employees yet.</div>`;
  else{
    h+=`<div id="team-list">`;
    S.employees.forEach((emp,i)=>{
      const tot=S.allSchedules.filter(s=>s.employee_id===emp.id).reduce((n,s)=>n+countH(s.schedule_data),0);
      const[abg,afg]=ac(emp.name);
      h+=`<div class="tcard" draggable="true" data-empid="${emp.id}" data-empidx="${i}">
        <span style="cursor:grab;color:rgba(0,0,0,0.18);font-size:18px;padding:0 10px 0 0;user-select:none;flex-shrink:0;display:flex;align-items:center;" title="Drag to reorder">⠿</span>
        <div style="display:flex;align-items:center;gap:11px;flex:1;min-width:0">
          <div class="avatar" style="background:${abg};color:${afg};width:38px;height:38px;font-size:12px;flex-shrink:0">${empInitials(emp.name)}</div>
          <div style="min-width:0"><div style="font-weight:600;font-size:14px;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(emp.name)}</div><div style="font-size:12px;color:var(--fg-muted)">${tot}h total scheduled</div></div>
        </div>
        <button class="rmbtn" onclick="JWG.removeEmp('${emp.id}')">Remove</button>
      </div>`;
    });
    h+=`</div>`;
  }
  if(!USE_SUPABASE)h+=`<div class="sbbox local" style="margin-top:26px"><div style="font-weight:600;font-size:13px;color:#a16207;margin-bottom:5px">⚡ Local Storage Mode</div><div style="font-size:12px;color:var(--fg-muted)">Data saves in your browser.</div></div>`;
  h+=`</div></div>`;return h;
}

function teamSearch(q){
  q=(q||"").toLowerCase().trim();
  document.querySelectorAll("#team-list .tcard").forEach(card=>{
    const id=card.getAttribute("data-empid");
    const emp=S.employees.find(e=>e.id===id);
    card.style.display=(!q||(emp&&emp.name.toLowerCase().includes(q)))?"":"none";
  });
}
async function addEmp(){const inp=document.getElementById("nEmp"),name=(inp?.value||"").trim();if(!name){toast("Enter a name","error");return;}if(S.employees.find(e=>e.name.toLowerCase()===name.toLowerCase())){toast("Already exists","error");return;}try{const emp=await saveEmp(name);S.employees.push(emp);S.schedule[emp.id]=defSched();if(inp)inp.value="";toast(`${name} added`);render();}catch(e){toast(e.message,"error");}}
async function removeEmp(id){const emp=S.employees.find(e=>e.id===id);const name=emp?emp.name:"this person";if(!(await jwgConfirm({title:"Remove staff member",target:name,message:"This permanently removes them and all their logged hours.",consequence:"This can't be undone.",confirmLabel:"Remove"})))return;try{await delEmp(id);S.employees=S.employees.filter(e=>e.id!==id);delete S.schedule[id];S.allSchedules=S.allSchedules.filter(s=>s.employee_id!==id);toast(`${name} removed`);render();}catch(e){toast(e.message,"error");}}

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

// ── DRAG — Team list cards ──
function initTeamDrag(){
  const cards=document.querySelectorAll("#team-list .tcard[data-empid]");
  let dragId=null;
  cards.forEach(card=>{
    card.addEventListener("dragstart",e=>{
      dragId=card.dataset.empid;
      card.classList.add("is-dragging");
      e.dataTransfer.effectAllowed="move";
    });
    card.addEventListener("dragend",()=>{
      dragId=null;
      cards.forEach(c=>c.classList.remove("is-dragging","drag-over-above","drag-over-below"));
    });
    card.addEventListener("dragover",e=>{
      if(!dragId||dragId===card.dataset.empid)return;
      e.preventDefault();
      cards.forEach(c=>c.classList.remove("drag-over-above","drag-over-below"));
      const rect=card.getBoundingClientRect();
      card.classList.add(e.clientY<rect.top+rect.height/2?"drag-over-above":"drag-over-below");
    });
    card.addEventListener("dragleave",()=>{
      card.classList.remove("drag-over-above","drag-over-below");
    });
    card.addEventListener("drop",e=>{
      e.preventDefault();
      if(!dragId||dragId===card.dataset.empid)return;
      const rect=card.getBoundingClientRect();
      const insertBefore=e.clientY<rect.top+rect.height/2;
      const fromIdx=S.employees.findIndex(em=>em.id===dragId);
      let toIdx=S.employees.findIndex(em=>em.id===card.dataset.empid);
      if(fromIdx<0||toIdx<0)return;
      const[moved]=S.employees.splice(fromIdx,1);
      toIdx=S.employees.findIndex(em=>em.id===card.dataset.empid);
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

let SUM={locations:[],serviceTypes:[],locationServices:[],filter:"",sortBy:"name",serviceFilter:""};

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

function renderSummerPage(){
  const root=document.getElementById("sum-page");
  if(!root)return;
  const DAY_ORDER=["Monday","Tuesday","Wednesday","Thursday","Friday",""];
  let h=`<div class="si-header">
    <div><div class="si-title">Landscaping locations</div></div>
    <div class="si-actions">
      <button class="si-action-btn" onclick="JWG.openAddSummerLocation()">Add location</button>
      <button class="si-action-btn secondary" onclick="JWG.openManageSummerServiceTypes()">Edit service list</button>
      <button class="si-action-btn secondary" onclick="window.print()">🖨 Print</button>
    </div>
  </div>
  <div class="si-filter-bar">
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

  if(!filtered.length){
    h+=`<div style="padding:24px;"><div class="si-empty"><div class="si-empty-icon">🌱</div><div class="si-empty-text">No summer service locations</div><div class="si-empty-sub">Track landscaping clients and service schedules</div></div></div>`;
  }else{
    h+=`<div style="font-size:12px;color:var(--fg-muted);margin:0 0 10px;padding:0 2px">Showing ${filtered.length} of ${SUM.locations.length} location${SUM.locations.length!==1?"s":""}</div>`;
    h+=`<table class="sum-table">
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
      h+=`<tr class="sum-row">
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
    h+=`</tbody></table>`;
  }

  // Weekly calendar view
  const DAYS_WEEK=["Monday","Tuesday","Wednesday","Thursday","Friday"];
  h+=`<div class="sum-cal-wrap">
    <div class="sum-cal-header">
      <h3 class="sum-cal-title">Weekly Schedule</h3>
      <span class="sum-cal-sub">Locations grouped by service day</span>
    </div>
    <div class="sum-cal-grid">`;
  DAYS_WEEK.forEach(day=>{
    const dayLocs=filtered.filter(l=>l.service_day===day);
    const dayClass=`sum-cal-col sum-day-${day.toLowerCase()}`;
    h+=`<div class="${dayClass}">
      <div class="sum-cal-day-header">${day}<span class="sum-cal-count">${dayLocs.length}</span></div>
      <div class="sum-cal-day-body">`;
    if(!dayLocs.length){
      h+=`<div class="sum-cal-empty">No sites</div>`;
    }else{
      dayLocs.forEach(loc=>{
        const services=SUM.locationServices.filter(ls=>ls.location_id===loc.id);
        h+=`<div class="sum-cal-item" onclick="JWG.editSummerLocation('${loc.id}')">
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
    h+=`</div></div>`;
  });
  h+=`</div></div>`;

  h+=`</div></div>`;
  root.innerHTML=h;
}

function filterAndSortSummer(){renderSummerPage();}

function openAddSummerLocation(){
  let svcToggles=SUM.serviceTypes.map(t=>{
    return`<div style="background:var(--bg-deep);border-radius:8px;padding:10px 12px;margin-bottom:6px;">
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
  const html=`<div style="flex-direction:column;margin-top:0;">
    <h3 style="margin-bottom:14px;">Add Summer Service Location</h3>
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
      </select>
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Notes</label>
      <textarea class="si-form-textarea" id="sum-notes" placeholder="Optional notes…"></textarea>
    </div>
    ${SUM.serviceTypes.length?`<div class="si-form-group">
      <button type="button" class="collapse-toggle" onclick="const el=document.getElementById('sum-svc-toggles-add');const ic=document.getElementById('sum-svc-caret');const hidden=el.style.display==='none';el.style.display=hidden?'block':'none';ic.textContent=hidden?'▾':'▸';">
        <span id="sum-svc-caret">▸</span> Services <span class="collapse-hint">(click to expand)</span>
      </button>
      <div id="sum-svc-toggles-add" style="display:none;margin-top:8px;">${svcToggles}</div>
    </div>`:""}
    <div class="si-modal-actions">
      <button class="modal-done" onclick="JWG.saveSummerLocation()">Save Location</button>
      <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
    </div>
  </div>`;
  openModal(html,"520px");
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
    return`<div style="background:var(--bg-deep);border-radius:8px;padding:10px 12px;margin-bottom:6px;">
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
  const html=`<div style="flex-direction:column;">
    <h3 style="margin-bottom:14px;">Edit Summer Service Location</h3>
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
      </select>
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Notes</label>
      <textarea class="si-form-textarea" id="sum-notes">${esc(loc.notes||"")}</textarea>
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Services</label>
      <div id="sum-svc-toggles">${svcToggles}</div>
    </div>
    <div class="si-modal-actions">
      <button class="modal-done" onclick="JWG.updateSummerLocation('${locId}')">Update</button>
      <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
    </div>
  </div>`;
  openModal(html,"520px");
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

let WIN={locations:[],serviceTypes:[],locationServices:[],saltBins:[],filter:"",sortBy:"name",serviceFilter:"",lowOnly:false};
const DEFAULT_SALT_THRESHOLD=5;

async function loadWinterData(){
  try{
    const[locs,types,ls,salt]=await Promise.all([
      sbF("GET","jwg_service_locations?has_winter_service=eq.true&is_archived=eq.false&order=client_name"),
      sbF("GET","jwg_service_types?season=eq.winter&is_active=eq.true&order=sort_order"),
      sbF("GET","jwg_location_services?select=*,jwg_service_types!inner(season)&jwg_service_types.season=eq.winter"),
      sbF("GET","jwg_salt_bins?select=*")
    ]);
    WIN.locations=locs||[];
    WIN.serviceTypes=types||[];
    WIN.locationServices=ls||[];
    WIN.saltBins=salt||[];
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
  let h=`<div class="si-header">
    <div><div class="si-title">Snow &amp; salt locations</div></div>
    <div class="si-actions">
      <button class="si-action-btn" onclick="JWG.openAddWinterLocation()">Add location</button>
      <button class="si-action-btn secondary" onclick="JWG.openManageWinterServiceTypes()">Edit service list</button>
      <button class="si-action-btn secondary" onclick="window.print()">🖨 Print</button>
    </div>
  </div>
  <div class="si-filter-bar">
    <input type="text" class="si-filter-input" placeholder="Search location…" id="win-search" oninput="JWG.WIN.filter=this.value;JWG.filterAndSortWinter()">
    <select class="si-filter-select" id="win-sort" onchange="JWG.WIN.sortBy=this.value;JWG.filterAndSortWinter()">
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
      h+=`<tr class="win-row">
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
  openModal(html,"520px");
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
    toast("Location added");
    closeModal();
    await loadWinterData();
    renderWinterPage();
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
  openModal(html,"520px");
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
  if(!name||!addr||!city){toast("Please fill in required fields","error");return;}
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
    toast("Location updated");
    closeModal();
    await loadWinterData();
    renderWinterPage();
  }catch(e){toast("Failed to update location","error");console.error(e);}
}

async function deleteWinterLocation(locId){
  const loc=WIN.locations.find(l=>l.id===locId);
  if(!(await jwgConfirm({title:"Delete location",target:loc?loc.client_name:"",message:"This also removes its salt bin and services.",consequence:"This can't be undone.",confirmLabel:"Delete"})))return;
  try{
    await sbF("DELETE",`jwg_service_locations?id=eq.${locId}`);
    toast("Location deleted");
    await loadWinterData();
    renderWinterPage();
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
/* ===== inventory.js ===== */
// ── INVENTORY.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

let INV={items:[],categories:[],filter:"all",statusFilter:"all",search:""};

async function loadInventoryData(){
  try{
    const[items,cats]=await Promise.all([
      sbF("GET","jwg_inventory_items?order=item_name"),
      sbF("GET","jwg_inventory_categories?is_active=eq.true&order=sort_order")
    ]);
    INV.items=items||[];
    INV.categories=cats||[];
  }catch(e){console.error("Load inventory failed:",e);toast("Failed to load inventory","error");}
}

function buildInventoryPage(){
  return`<div class="card"><div style="padding:20px;text-align:center;color:var(--fg-muted)">Loading…</div></div>`;
}

async function initInventoryPage(){
  await loadInventoryData();
  renderInventoryPage();
}

const INV_STATUS_LABEL={in_stock:"In stock",low:"Low",out_of_stock:"Out",ordered:"Ordered"};
function invStatusFor(item){
  if(item.status==="ordered"&&item.current_stock<=item.min_threshold)return "ordered";
  if(item.current_stock===0)return "out_of_stock";
  if(item.current_stock<=item.min_threshold)return "low";
  return "in_stock";
}
function renderInventoryPage(){
  const root=document.querySelector(".card");
  if(!root)return;
  let h=`<div class="si-header">
    <div><div class="si-title">Back Shop Inventory</div></div>
    <div class="si-actions">
      <button class="si-action-btn" onclick="JWG.openAddInventoryItem()">Add item</button>
      <button class="si-action-btn secondary" onclick="JWG.openManageCategories()">⚙ Manage Categories</button>
      <button class="si-action-btn secondary" onclick="JWG.printInventoryShoppingList()">🖨 Print list</button>
    </div>
  </div>
  <div class="si-filter-bar">
    <input type="text" class="si-filter-input" placeholder="Search item or part #…" id="inv-search" oninput="JWG.INV.search=this.value;JWG.filterInventory()">
    <select class="si-filter-select" onchange="JWG.INV.filter=this.value;JWG.filterInventory()">
      <option value="all">All Categories</option>
      ${INV.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}
    </select>
    <select class="si-filter-select" onchange="JWG.INV.statusFilter=this.value;JWG.filterInventory()">
      <option value="all">All Status</option>
      <option value="in_stock">In stock</option>
      <option value="low">Low</option>
      <option value="out_of_stock">Out</option>
      <option value="ordered">Ordered</option>
      <option value="needs_reorder">Low or out</option>
    </select>
  </div>
  <div style="padding:0 0 14px 0;overflow-x:auto;">`;

  let filtered=INV.items.filter(item=>{
    if(INV.search){const q=INV.search.toLowerCase();if(!item.item_name.toLowerCase().includes(q)&&!(item.product_number||"").toLowerCase().includes(q))return false;}
    if(INV.filter!=="all"&&item.category_id!==INV.filter)return false;
    if(INV.statusFilter!=="all"){
      if(INV.statusFilter==="needs_reorder"){if(item.current_stock>item.min_threshold)return false;}
      else if(INV.statusFilter!==item.status)return false;
    }
    return true;
  });

  const _rank=i=>i.current_stock===0?0:i.current_stock<=i.min_threshold?1:2;
  filtered.sort((a,b)=>_rank(a)-_rank(b)||a.item_name.localeCompare(b.item_name));

  if(!filtered.length){
    h+=`<div style="padding:24px;"><div class="si-empty"><div class="si-empty-icon">📦</div><div class="si-empty-text">No items found</div><div class="si-empty-sub">Track tools, parts, and supplies</div></div></div>`;
  }else{
    h+=`<div style="font-size:12px;color:var(--fg-muted);margin:0 0 10px;padding:0 2px">Showing ${filtered.length} of ${INV.items.length} item${INV.items.length!==1?"s":""}</div>`;
    h+=`<div class="inv-grid">`;
    filtered.forEach(item=>{
      const cat=INV.categories.find(c=>c.id===item.category_id);
      const st=invStatusFor(item);
      const statusClass=`status-badge ${st}`;
      const priceStr=item.price?`$${Number(item.price).toFixed(2)}`:"";
      h+=`<div class="inv-card-v2">
        <div class="inv-card-img">${item.image_url?`<img src="${esc(item.image_url)}" alt="${esc(item.item_name)}">`:`<span class="inv-card-img-ph">📦</span>`}</div>
        <div class="inv-card-body">
          <div class="inv-card-top">
            <div class="inv-card-name">${esc(item.item_name)}</div>
            ${item.product_number?`<div class="inv-card-prodnum">#${esc(item.product_number)}</div>`:""}
            <span class="service-badge svc-color-${INV.categories.findIndex(c=>c.id===item.category_id)%8}">${cat?esc(cat.name):"?"}</span>
          </div>
          <div class="inv-card-meta">
            <div class="inv-card-stock">
              <span class="inv-card-stock-num" onclick="JWG.setInventoryCount('${item.id}')" title="Set exact count" style="cursor:pointer">${item.current_stock}</span>
              <span class="inv-card-stock-unit">${esc(item.unit)}</span>
              <span style="color:var(--fg-muted);font-size:11px;">min ${item.min_threshold}</span>
            </div>
            <span class="${statusClass}">${INV_STATUS_LABEL[st]||st}</span>
          </div>
          ${priceStr||item.purchase_link?`<div class="inv-card-price-row">
            ${priceStr?`<span class="inv-card-price">${priceStr}</span>`:""}
            ${item.purchase_link?`<a href="${esc(item.purchase_link)}" target="_blank" rel="noopener" class="inv-card-buy-link">Buy Here →</a>`:""}
          </div>`:""}
          ${item.notes?`<div class="inv-card-notes">${esc(item.notes)}</div>`:""}
          <div class="inv-card-actions">
            <div class="inv-card-adjust">
              <button class="stock-btn" onclick="JWG.adjustInventory('${item.id}',-1)">−</button>
              <button class="stock-btn" onclick="JWG.adjustInventory('${item.id}',1)">+</button>
              <button class="stock-btn" onclick="JWG.setInventoryCount('${item.id}')">Set count</button>
              ${item.status==="ordered"?`<button class="stock-btn" onclick="JWG.restockItem('${item.id}')">Restocked</button>`:`<button class="stock-btn" onclick="JWG.markOrdered('${item.id}')">Mark Ordered</button>`}
            </div>
            <div class="inv-card-edit">
              <button class="loc-action-btn" onclick="JWG.editInventoryItem('${item.id}')">Edit</button>
              <button class="loc-action-btn delete" onclick="JWG.deleteInventoryItem('${item.id}')">Delete</button>
            </div>
          </div>
        </div>
      </div>`;
    });
    h+=`</div>`;
  }

  h+=`</div></div>`;
  root.innerHTML=h;
}

function filterInventory(){renderInventoryPage();}

async function adjustInventory(itemId,delta){
  const item=INV.items.find(i=>i.id===itemId);
  if(!item)return;
  const newCount=Math.max(0,item.current_stock+delta);
  const newStatus=newCount===0?"out_of_stock":newCount<=item.min_threshold?"low":"in_stock";
  try{
    await sbF("PATCH",`jwg_inventory_items?id=eq.${itemId}`,{current_stock:newCount,status:newStatus});
    item.current_stock=newCount;
    item.status=newStatus;
    renderInventoryPage();
  }catch(e){toast("Failed to update stock","error");console.error(e);}
}

async function markOrdered(itemId){
  try{
    await sbF("PATCH",`jwg_inventory_items?id=eq.${itemId}`,{status:"ordered"});
    const item=INV.items.find(i=>i.id===itemId);
    if(item)item.status="ordered";
    renderInventoryPage();
  }catch(e){toast("Failed to mark as ordered","error");console.error(e);}
}

async function setInventoryCount(itemId){
  const item=INV.items.find(i=>i.id===itemId);
  if(!item)return;
  const ans=prompt(`Set the on-hand count for "${item.item_name}"${item.unit?" ("+item.unit+")":""}:`,item.current_stock);
  if(ans===null)return;
  const n=Math.max(0,parseInt(ans,10)||0);
  const st=n===0?"out_of_stock":n<=item.min_threshold?"low":"in_stock";
  try{
    await sbF("PATCH",`jwg_inventory_items?id=eq.${itemId}`,{current_stock:n,status:st});
    item.current_stock=n;item.status=st;
    renderInventoryPage();
    toast("Stock updated");
  }catch(e){toast("Failed to update stock","error");console.error(e);}
}
async function restockItem(itemId){return setInventoryCount(itemId);}
function printInventoryShoppingList(){
  const low=INV.items.filter(i=>i.current_stock<=i.min_threshold).sort((a,b)=>(a.current_stock===0?0:1)-(b.current_stock===0?0:1)||a.item_name.localeCompare(b.item_name));
  const rows=low.map(i=>`<tr><td>${esc(i.item_name)}</td><td>${esc(i.product_number||"")}</td><td style="text-align:center">${i.current_stock}</td><td style="text-align:center">${i.min_threshold}</td><td>${esc(i.unit||"")}</td></tr>`).join("");
  const w=window.open("","_blank");
  if(!w){toast("Allow pop-ups to print the list","error");return;}
  w.document.write(`<!doctype html><html><head><title>Back Shop Shopping List</title><style>body{font-family:system-ui,Arial,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0 0 4px}.sub{color:#666;font-size:13px;margin-bottom:18px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:8px 10px;font-size:13px;text-align:left}th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#666}.empty{color:#666;font-size:14px;padding:20px 0}</style></head><body><h1>Back Shop — Shopping List</h1><div class="sub">Items at or below their minimum.</div>${low.length?`<table><thead><tr><th>Item</th><th>Part #</th><th>On hand</th><th>Min</th><th>Unit</th></tr></thead><tbody>${rows}</tbody></table>`:`<div class="empty">Nothing is low right now.</div>`}</body></html>`);
  w.document.close();w.focus();
  setTimeout(function(){try{w.print();}catch(e){}},250);
}

function openAddInventoryItem(){
  const html=`<div style="flex-direction:column;">
    <h3 style="margin-bottom:14px;">Add Inventory Item</h3>
    <div class="si-form-group">
      <label class="si-form-label">Item Name</label>
      <input type="text" class="si-form-input" id="inv-name" placeholder="e.g., Mothers Protectant">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Product # <span style="font-weight:400;color:var(--fg-muted)">(manufacturer part number)</span></label>
      <input type="text" class="si-form-input" id="inv-prodnum" placeholder="e.g., 05302">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Category</label>
      <select class="si-form-select" id="inv-cat">
        <option value="">Select category</option>
        ${INV.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}
      </select>
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Current Stock</label>
      <input type="number" class="si-form-input" id="inv-stock" placeholder="0" value="0">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Min Threshold</label>
      <input type="number" class="si-form-input" id="inv-min" placeholder="5" value="5">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Unit</label>
      <input type="text" class="si-form-input" id="inv-unit" placeholder="e.g., gallon, box" value="unit">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Price <span style="font-weight:400;color:var(--fg-muted)">(optional)</span></label>
      <input type="number" class="si-form-input" id="inv-price" placeholder="0.00" step="0.01" min="0">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Purchase Link <span style="font-weight:400;color:var(--fg-muted)">(where to buy)</span></label>
      <input type="text" class="si-form-input" id="inv-link" placeholder="https://…">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Image URL (optional)</label>
      <input type="text" class="si-form-input" id="inv-img" placeholder="https://…">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Notes</label>
      <textarea class="si-form-textarea" id="inv-notes" placeholder="Optional notes…"></textarea>
    </div>
    <div class="si-modal-actions">
      <button class="modal-done" onclick="JWG.saveInventoryItem()">Save Item</button>
      <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
    </div>
  </div>`;
  openModal(html,"480px");
}

async function saveInventoryItem(){
  const name=(document.getElementById("inv-name")?.value||"").trim();
  const prodNum=(document.getElementById("inv-prodnum")?.value||"").trim();
  const catId=document.getElementById("inv-cat")?.value||null;
  const stock=parseInt(document.getElementById("inv-stock")?.value||0);
  const min=parseInt(document.getElementById("inv-min")?.value||5);
  const unit=(document.getElementById("inv-unit")?.value||"unit").trim();
  const price=parseFloat(document.getElementById("inv-price")?.value)||null;
  const link=(document.getElementById("inv-link")?.value||"").trim();
  const img=(document.getElementById("inv-img")?.value||"").trim();
  const notes=(document.getElementById("inv-notes")?.value||"").trim();
  if(!name||!catId){toast("Please fill in required fields","error");return;}
  try{
    const status=stock===0?"out_of_stock":stock<=min?"low":"in_stock";
    await sbF("POST","jwg_inventory_items",{item_name:name,product_number:prodNum,category_id:catId,current_stock:stock,min_threshold:min,unit,image_url:img||null,status,notes,price,purchase_link:link});
    toast("Item added");
    closeModal();
    await loadInventoryData();
    renderInventoryPage();
  }catch(e){toast("Failed to save item","error");console.error(e);}
}

function editInventoryItem(itemId){
  const item=INV.items.find(i=>i.id===itemId);
  if(!item)return;
  const html=`<div style="flex-direction:column;">
    <h3 style="margin-bottom:14px;">Edit Inventory Item</h3>
    <div class="si-form-group">
      <label class="si-form-label">Item Name</label>
      <input type="text" class="si-form-input" id="inv-name" value="${esc(item.item_name)}">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Product # <span style="font-weight:400;color:var(--fg-muted)">(manufacturer part number)</span></label>
      <input type="text" class="si-form-input" id="inv-prodnum" value="${esc(item.product_number||"")}">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Category</label>
      <select class="si-form-select" id="inv-cat">
        <option value="">Select category</option>
        ${INV.categories.map(c=>`<option value="${c.id}" ${c.id===item.category_id?"selected":""}>${esc(c.name)}</option>`).join("")}
      </select>
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Current Stock</label>
      <input type="number" class="si-form-input" id="inv-stock" value="${item.current_stock}">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Min Threshold</label>
      <input type="number" class="si-form-input" id="inv-min" value="${item.min_threshold}">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Unit</label>
      <input type="text" class="si-form-input" id="inv-unit" value="${esc(item.unit)}">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Price</label>
      <input type="number" class="si-form-input" id="inv-price" value="${item.price||""}" step="0.01" min="0">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Purchase Link <span style="font-weight:400;color:var(--fg-muted)">(where to buy)</span></label>
      <input type="text" class="si-form-input" id="inv-link" value="${esc(item.purchase_link||"")}">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Image URL</label>
      <input type="text" class="si-form-input" id="inv-img" value="${item.image_url?esc(item.image_url):""}">
    </div>
    <div class="si-form-group">
      <label class="si-form-label">Notes</label>
      <textarea class="si-form-textarea" id="inv-notes">${esc(item.notes||"")}</textarea>
    </div>
    <div class="si-modal-actions">
      <button class="modal-done" onclick="JWG.updateInventoryItem('${itemId}')">Update</button>
      <button class="modal-cancel" onclick="JWG.closeModal()">Cancel</button>
    </div>
  </div>`;
  openModal(html,"480px");
}

async function updateInventoryItem(itemId){
  const name=(document.getElementById("inv-name")?.value||"").trim();
  const prodNum=(document.getElementById("inv-prodnum")?.value||"").trim();
  const catId=document.getElementById("inv-cat")?.value||null;
  const stock=parseInt(document.getElementById("inv-stock")?.value||0);
  const min=parseInt(document.getElementById("inv-min")?.value||5);
  const unit=(document.getElementById("inv-unit")?.value||"unit").trim();
  const price=parseFloat(document.getElementById("inv-price")?.value)||null;
  const link=(document.getElementById("inv-link")?.value||"").trim();
  const img=(document.getElementById("inv-img")?.value||"").trim();
  const notes=(document.getElementById("inv-notes")?.value||"").trim();
  if(!name||!catId){toast("Please fill in required fields","error");return;}
  try{
    const status=stock===0?"out_of_stock":stock<=min?"low":"in_stock";
    await sbF("PATCH",`jwg_inventory_items?id=eq.${itemId}`,{item_name:name,product_number:prodNum,category_id:catId,current_stock:stock,min_threshold:min,unit,image_url:img||null,notes,status,price,purchase_link:link});
    toast("Item updated");
    closeModal();
    await loadInventoryData();
    renderInventoryPage();
  }catch(e){toast("Failed to update item","error");console.error(e);}
}

async function deleteInventoryItem(itemId){
  const it=INV.items.find(i=>i.id===itemId);
  if(!(await jwgConfirm({title:"Delete item",target:it?it.item_name:"",consequence:"This permanently removes the item.",confirmLabel:"Delete"})))return;
  try{
    await sbF("DELETE",`jwg_inventory_items?id=eq.${itemId}`);
    toast("Item deleted");
    await loadInventoryData();
    renderInventoryPage();
  }catch(e){toast("Failed to delete item","error");console.error(e);}
}

function openManageCategories(){
  const html=`<div style="flex-direction:column;">
    <h3 style="margin-bottom:14px;">Inventory Categories</h3>
    <div id="cat-list" style="margin-bottom:14px;">
      ${INV.categories.map(c=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:var(--bg-deep);border-radius:6px;margin-bottom:6px;">
        <span>${esc(c.name)}</span>
        <button class="loc-action-btn delete" onclick="JWG.deleteCategory('${c.id}')">Remove</button>
      </div>`).join("")}
    </div>
    <div style="border-top:1px solid var(--border);padding-top:14px;">
      <input type="text" class="si-form-input" id="new-cat" placeholder="New category…" style="margin-bottom:8px;">
      <button class="si-action-btn" onclick="JWG.addCategory()" style="width:100%;">Add Category</button>
    </div>
    <button class="modal-cancel" onclick="JWG.closeModal()" style="margin-top:14px;width:100%;">Done</button>
  </div>`;
  openModal(html,"480px");
}

async function addCategory(){
  const input=document.getElementById("new-cat");
  const name=(input?.value||"").trim();
  if(!name){toast("Enter a category name","error");return;}
  try{
    const maxSort=Math.max(...INV.categories.map(c=>c.sort_order||0),0);
    await sbF("POST","jwg_inventory_categories",{name,sort_order:maxSort+1,is_active:true});
    toast("Category added");
    await loadInventoryData();
    openManageCategories();
  }catch(e){toast("Failed to add category","error");console.error(e);}
}

async function deleteCategory(catId){
  const c=INV.categories.find(x=>x.id===catId);
  if(!(await jwgConfirm({title:"Remove category",target:c?c.name:"",confirmLabel:"Remove"})))return;
  try{
    await sbF("PATCH",`jwg_inventory_categories?id=eq.${catId}`,{is_active:false});
    toast("Category removed");
    await loadInventoryData();
    openManageCategories();
  }catch(e){toast("Failed to remove category","error");console.error(e);}
}

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
let CL={items:[],filter:"all",period:"all",company:"all",search:""};

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
    if(!grouped[eid])grouped[eid]={name:i.employees?.name||"Unknown",items:[]};
    grouped[eid].items.push(i);
  });
  const empList=Object.entries(grouped).sort((a,b)=>a[1].name.localeCompare(b[1].name));

  // Build employee cards
  let cards="";
  empList.forEach(([eid,emp],idx)=>{
    const grpClass=idx%2===0?"cl-group-a":"cl-group-b";
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
        <span class="cl-emp-name">${esc(emp.name)}</span>
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
  const empOpts=S.employees.map(e=>`<option value="${e.id}"${item&&item.employee_id===e.id?" selected":""}>${esc(e.name)}</option>`).join("");
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
    .on("postgres_changes",{event:"*",schema:"public",table:"jwg_inventory_items"},payload=>{
      const row=payload.eventType==="DELETE"?payload.old:payload.new;
      if(!row)return;
      if(S.tab==="inventory"&&!isModalOpen()){
        if(payload.eventType==="DELETE")INV.items=INV.items.filter(i=>i.id!==row.id);
        else{
          const idx=INV.items.findIndex(i=>i.id===row.id);
          if(idx>=0)INV.items[idx]={...INV.items[idx],...row};
          else INV.items.push(row);
        }
        renderInventoryPage();
      }
    })

    // ── Inventory Categories ──
    .on("postgres_changes",{event:"*",schema:"public",table:"jwg_inventory_categories"},payload=>{
      const row=payload.eventType==="DELETE"?payload.old:payload.new;
      if(!row)return;
      if(S.tab==="inventory"&&!isModalOpen()){
        if(payload.eventType==="DELETE")INV.categories=INV.categories.filter(c=>c.id!==row.id);
        else{
          const idx=INV.categories.findIndex(c=>c.id===row.id);
          if(idx>=0)INV.categories[idx]={...INV.categories[idx],...row};
          else INV.categories.push(row);
        }
        renderInventoryPage();
      }
    })

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
    const[emps,scheds]=await Promise.all([loadEmps(),loadScheds()]);
    S.employees=emps||[];S.allSchedules=scheds||[];applyStoredOrder();
    const w=wkey(S.weekOffset);
    S.employees.forEach(e=>{const f=(scheds||[]).find(s=>s.employee_id===e.id&&s.week_start===w);S.schedule[e.id]=f?migrateSched(JSON.parse(JSON.stringify(f.schedule_data))):defSched();});
  }catch(e){toast("Load failed: "+e.message,"error");}
  // Auto-select today in mobile day view for current week
  const todayName=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
  const todayIdx=S.activeDays.indexOf(todayName);
  if(todayIdx>=0)S.mobileDayIdx=todayIdx;
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
async function bootInventoryKiosk(){
  try{
    await loadInventoryData();
    S.tab="inventory";
    renderInventoryPage();
    if(!_realtimeChannel)initRealtime();  // live-sync: kiosk auto-updates when stock changes elsewhere
  }catch(e){toast("Couldn't load inventory: "+(e.message||e),"error");console.error(e);}
}



/* ===== JWG exports ===== */
window.renderJwgScheduler=renderJwgScheduler;
window.renderJwgInventoryKiosk=bootInventoryKiosk;
window.JWG={addCategory:addCategory,addEmp:addEmp,addShiftEntry:addShiftEntry,addSummerServiceType:addSummerServiceType,addWinterServiceType:addWinterServiceType,adjustInventory:adjustInventory,adjustWinterSalt:adjustWinterSalt,applyMultiAssign:applyMultiAssign,applyMultiClear:applyMultiClear,applyWH:applyWH,cancelEditShift:cancelEditShift,clearDayStatus:clearDayStatus,clDelete:clDelete,clOpenAdd:clOpenAdd,clOpenEdit:clOpenEdit,clSaveForm:clSaveForm,clSetCompany:clSetCompany,clSetFilter:clSetFilter,clSetPeriod:clSetPeriod,clSetSearch:clSetSearch,closeModal:closeModal,closeSaveShift:closeSaveShift,copyLastWeek:copyLastWeek,deleteCategory:deleteCategory,deleteInventoryItem:deleteInventoryItem,deleteSummerLocation:deleteSummerLocation,deleteSummerServiceType:deleteSummerServiceType,deleteWinterLocation:deleteWinterLocation,deleteWinterServiceType:deleteWinterServiceType,dismissToast:dismissToast,editInventoryItem:editInventoryItem,editSummerLocation:editSummerLocation,editWinterLocation:editWinterLocation,filterAndSortSummer:filterAndSortSummer,filterAndSortWinter:filterAndSortWinter,filterInventory:filterInventory,goToday:goToday,maPick:maPick,maToggleAllDays:maToggleAllDays,maToggleDay:maToggleDay,maToggleEmp:maToggleEmp,maToggleEveryone:maToggleEveryone,markDayOff:markDayOff,markDaySick:markDaySick,markOrdered:markOrdered,mcPickTask:mcPickTask,mcToggleAllDays:mcToggleAllDays,mcToggleDay:mcToggleDay,mcToggleEmp:mcToggleEmp,mcToggleEveryone:mcToggleEveryone,nextW:nextW,openAddInventoryItem:openAddInventoryItem,openAddSummerLocation:openAddSummerLocation,openAddWinterLocation:openAddWinterLocation,openManageCategories:openManageCategories,openManageSummerServiceTypes:openManageSummerServiceTypes,openManageWinterServiceTypes:openManageWinterServiceTypes,openMultiAssign:openMultiAssign,openMultiClear:openMultiClear,openShiftModal:openShiftModal,openTaskMgr:openTaskMgr,openWHSettings:openWHSettings,pickTask:pickTask,prevW:prevW,removeEmp:removeEmp,removeShiftEntry:removeShiftEntry,restockItem:restockItem,setInventoryCount:setInventoryCount,printInventoryShoppingList:printInventoryShoppingList,saveDayNote:saveDayNote,saveEditShift:saveEditShift,saveInventoryItem:saveInventoryItem,saveSummerLocation:saveSummerLocation,saveWinterLocation:saveWinterLocation,setDayWorking:setDayWorking,setWinterSalt:setWinterSalt,setMobileDay:setMobileDay,startEditShift:startEditShift,switchTab:switchTab,teamSearch:teamSearch,tmAdd:tmAdd,tmCC:tmCC,tmDel:tmDel,tmLC:tmLC,toggleAlphaSort:toggleAlphaSort,toggleDay:toggleDay,toggleHistoryWeek:toggleHistoryWeek,updateInventoryItem:updateInventoryItem,updateSummerLocation:updateSummerLocation,updateWinterLocation:updateWinterLocation,wtDelete:wtDelete,wtMarkDone:wtMarkDone,wtOpenAdd:wtOpenAdd,wtOpenEdit:wtOpenEdit,wtPickPrio:wtPickPrio,wtReopen:wtReopen,wtSaveForm:wtSaveForm,wtSetFilter:wtSetFilter,wtTogglePerson:wtTogglePerson,S:S,SUM:SUM,WIN:WIN,INV:INV,CL:CL,WT:WT,render:render};
})();
