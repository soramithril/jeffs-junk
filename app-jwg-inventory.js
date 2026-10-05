/* app-jwg-inventory.js -- the back-shop inventory, on its own.

   Split out of app-jwg-scheduler.js (Jake, 2026-10-05: "darrins kiosk should
   only be the inventory not the schedule"). The kiosk used to load the whole
   4,300-line scheduler to reach this code, and its live feed subscribed to
   jwg_schedules, jwg_employees and crew_members - rows it never showed. It also
   rode the scheduler's ?v=, which is how it served an eleven-day-stale
   scheduler back in August.

   inventory.html now loads ONLY this file. index.html loads it alongside the
   scheduler, which delegates its Inventory tab here - one copy of the inventory
   code, two callers.

   The helpers below are deliberately duplicated from the scheduler rather than
   pulled into a third shared file: this has to stand alone on the kiosk, and a
   shared base would put script load-order between Darrin and his stock counts.
   `db` is the page's Supabase client, same as the scheduler uses.  */
(function(){
"use strict";
const SUPABASE_URL=window.SUPABASE_URL,SUPABASE_ANON_KEY=window.SUPABASE_KEY;

/* ===== helpers (copied from the scheduler - see header) ===== */
async function sbF(m,p,b){
  let token=SUPABASE_ANON_KEY;
  try{const _s=await db.auth.getSession();if(_s&&_s.data&&_s.data.session&&_s.data.session.access_token)token=_s.data.session.access_token;}catch(e){}
  const isUpsert=m==="POST"&&p.includes("on_conflict");
  const prefer=isUpsert?"return=representation,resolution=merge-duplicates":m==="POST"?"return=representation":"";
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${p}`,{method:m,headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(prefer?{Prefer:prefer}:{})},body:b?JSON.stringify(b):undefined});
  if(!r.ok)throw new Error(await r.text());
  return r.status===204?null:r.json();
}

function toast(msg,type="success"){
  const el=document.getElementById("jwg-toast");
  if(!el) return;
  el.className=type+" show";
  el.innerHTML=`<span class="t-icon">${TOAST_ICONS[type]||"✓"}</span><span class="t-msg">${msg}</span><span class="t-close" onclick="JWGInv.dismissToast()">✕</span>`;
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

function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML;}

function openModal(html,width,fullpage){
  closeModal();
  const ov=document.createElement("div");ov.className="moverlay open"+(fullpage?" fullpage":"");ov.id="moverlay";
  ov.onmousedown=e=>{if(e.target===ov)closeModal();};
  const m=document.createElement("div");m.className="modal";
  if(width&&!fullpage)m.style.width=width;
  m.innerHTML=(fullpage?FP_CLOSE:"")+html;ov.appendChild(m);(document.getElementById("view-jwgscheduler")||document.body).appendChild(ov);
  if(fullpage)document.body.classList.add("jwg-modal-open");
}

function closeModal(){const o=document.getElementById("moverlay");if(o)o.remove();document.body.classList.remove("jwg-modal-open");}

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

  const now=new Date();

/* ===== inventory ===== */
/* ===== inventory.js ===== */
// ── INVENTORY.JS ──────────────────────────────────────────
// Part of JWG Staff Scheduler

let INV={items:[],categories:[],filter:"all",statusFilter:"all",search:"",
  // kiosk-only state (inventory.html futuristic view)
  kioskFilter:"all",kioskRestocked:0,kioskBumpId:null,kioskCelebrateId:null,kioskToast:""};

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
  if(_invKioskMode){renderInventoryKioskPage();return;}
  const root=document.querySelector(".card");
  if(!root)return;
  let h=`<div class="si-header">
    <div><div class="si-title">Back Shop Inventory</div></div>
    <div class="si-actions">
      <button class="si-action-btn" onclick="JWGInv.openAddInventoryItem()">Add item</button>
      <button class="si-action-btn secondary" onclick="JWGInv.openManageCategories()">⚙ Manage Categories</button>
      <button class="si-action-btn secondary" onclick="JWGInv.printInventoryShoppingList()">🖨 Print list</button>
    </div>
  </div>
  <div class="si-filter-bar">
    <input type="text" class="si-filter-input" placeholder="Search item or part #…" id="inv-search" oninput="JWGInv.INV.search=this.value;JWGInv.filterInventory()">
    <select class="si-filter-select" onchange="JWGInv.INV.filter=this.value;JWGInv.filterInventory()">
      <option value="all">All Categories</option>
      ${INV.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}
    </select>
    <select class="si-filter-select" onchange="JWGInv.INV.statusFilter=this.value;JWGInv.filterInventory()">
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
              <span class="inv-card-stock-num" onclick="JWGInv.setInventoryCount('${item.id}')" title="Set exact count" style="cursor:pointer">${item.current_stock}</span>
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
              <button class="stock-btn" onclick="JWGInv.adjustInventory('${item.id}',-1)">−</button>
              <button class="stock-btn" onclick="JWGInv.adjustInventory('${item.id}',1)">+</button>
              <button class="stock-btn" onclick="JWGInv.setInventoryCount('${item.id}')">Set count</button>
              ${item.status==="ordered"?`<button class="stock-btn" onclick="JWGInv.restockItem('${item.id}')">Restocked</button>`:`<button class="stock-btn" onclick="JWGInv.markOrdered('${item.id}')">Mark Ordered</button>`}
            </div>
            <div class="inv-card-edit">
              <button class="loc-action-btn" onclick="JWGInv.editInventoryItem('${item.id}')">Edit</button>
              <button class="loc-action-btn delete" onclick="JWGInv.deleteInventoryItem('${item.id}')">Delete</button>
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

// ── Futuristic kiosk view (inventory.html only) ─────────────────────────────
// Jake's Claude Design "Back Shop Inventory - Futuristic" (2026-07-21).
// bootInventoryKiosk flips _invKioskMode, so every re-render path (adjust,
// realtime, filter) lands here instead of the dashboard UI above. The kg-
// classes are styled in inventory.html; the dashboard never loads them.
let _invKioskMode=false,_invKioskEntrance=true,_kgCelTimer=null,_kgToastTimer=null,_kgTickerKey=null;
let _kgBannerUntil=0,_kgBannerTimer=null;  // banner shows for 5 min after login / after fresh news

// restocked within the last 24h -> still worth flagging to Darrin
function _kgRecentRestock(i){return !!i.restocked_at&&(Date.now()-new Date(i.restocked_at).getTime()<86400000);}

// low -> back over minimum: restock counter, card burst, green toast
function _kgCelebrate(item){
  INV.kioskRestocked++;
  INV.kioskCelebrateId=item.id;
  INV.kioskToast=item.item_name;
  clearTimeout(_kgCelTimer);_kgCelTimer=setTimeout(()=>{INV.kioskCelebrateId=null;renderInventoryPage();},950);
  clearTimeout(_kgToastTimer);_kgToastTimer=setTimeout(()=>{INV.kioskToast="";renderInventoryPage();},2400);
}

// eased 0→to count-up for the KPI numbers on first paint
function _kgCountUp(el,to){
  const t0=performance.now(),dur=700;
  const step=t=>{const p=Math.min(1,(t-t0)/dur);el.textContent=Math.round((1-Math.pow(1-p,3))*to);if(p<1)requestAnimationFrame(step);};
  requestAnimationFrame(step);
}

function renderInventoryKioskPage(){
  const root=document.querySelector(".card");
  if(!root)return;
  if(!document.getElementById("kg-shell")){
    _invKioskEntrance=true;
    _kgTickerKey=null;
    root.innerHTML=`<div id="kg-shell">
      <div class="kg-tickerbar">
        <div class="kg-ticker"><div class="kg-ticker-track" id="kg-ticker-track"></div></div>
        <img src="assets/tv-truck.png" alt="" class="kg-drive-truck">
      </div>
      <div class="kg-kpis">
        <div class="kg-kpi"><span class="kg-kpi-top" style="background:#22c55e"></span><span class="kg-sheen"></span>${JWGIcons.embossTile("documents",{color:"green"})}<div><div class="kg-kpi-label">Items tracked</div><div class="kg-kpi-num" id="kg-k-total">0</div></div></div>
        <div class="kg-kpi"><span class="kg-kpi-top" style="background:#ef4444"></span>${JWGIcons.embossTile("bell",{color:"red"})}<div><div class="kg-kpi-label">Low or out</div><div class="kg-kpi-num low" id="kg-k-low">0</div></div></div>
        <div class="kg-kpi"><span class="kg-kpi-top" style="background:#16a34a"></span>${JWGIcons.embossTile("confirmed",{color:"green"})}<div><div class="kg-kpi-label">Restocked today</div><div class="kg-kpi-num" id="kg-k-restock">0</div></div></div>
      </div>
      <div class="kg-controls">
        <input type="text" id="kg-search" placeholder="Search parts…" oninput="JWGInv.INV.search=this.value;JWGInv.filterInventory()">
        <button type="button" class="kg-chip" id="kg-chip-all" onclick="JWGInv.INV.kioskFilter='all';JWGInv.filterInventory()">All items</button>
        <button type="button" class="kg-chip" id="kg-chip-low" onclick="JWGInv.INV.kioskFilter='low';JWGInv.filterInventory()">Low or out <span id="kg-chip-low-n">· 0</span></button>
        <button type="button" class="kg-chip add" onclick="JWGInv.kioskOpenAdd()">+ Add item</button>
      </div>
      <div class="kg-grid" id="kg-grid"></div>
      <div class="kg-empty" id="kg-empty" hidden>
        <div class="kg-empty-big">Nothing matches</div>
        <div class="kg-empty-sub">Try clearing the search or the “Low or out” filter.</div>
      </div>
    </div>
    <div class="kg-toast-wrap"><div class="kg-toast" id="kg-toast">${JWGIcons.svg("confirmed",{size:20,color:"#fff"})}<span>Restocked · <span id="kg-toast-name"></span></span></div></div>
    <div class="kg-modal" id="kg-add-modal" onclick="if(event.target===this)JWGInv.kioskCloseAdd()">
      <form class="kg-modal-card" onsubmit="JWGInv.kioskSaveAdd();return false;">
        <div class="kg-modal-title">Add an item</div>
        <label class="kg-modal-lb">Item name</label>
        <input type="text" id="kg-add-name" class="kg-modal-in" placeholder="e.g. Shop rags" autocomplete="off">
        <div class="kg-modal-row">
          <div style="flex:1"><label class="kg-modal-lb">Part #</label><input type="text" id="kg-add-prod" class="kg-modal-in" placeholder="optional" autocomplete="off"></div>
          <div style="flex:1"><label class="kg-modal-lb">Unit</label><input type="text" id="kg-add-unit" class="kg-modal-in" value="each" autocomplete="off"></div>
        </div>
        <label class="kg-modal-lb">Category</label>
        <select id="kg-add-cat" class="kg-modal-in" onchange="document.getElementById('kg-add-newcat-wrap').hidden=this.value!=='__new'"></select>
        <div id="kg-add-newcat-wrap" hidden><input type="text" id="kg-add-newcat" class="kg-modal-in" placeholder="New category name" autocomplete="off" style="margin-top:8px"></div>
        <div class="kg-modal-row">
          <div style="flex:1"><label class="kg-modal-lb">On the shelf</label><input type="number" min="0" id="kg-add-stock" class="kg-modal-in" value="0"></div>
          <div style="flex:1"><label class="kg-modal-lb">Backstock</label><input type="number" min="0" id="kg-add-back" class="kg-modal-in" value="0"></div>
          <div style="flex:1"><label class="kg-modal-lb">Reorder at</label><input type="number" min="0" id="kg-add-min" class="kg-modal-in" value="1"></div>
        </div>
        <div class="kg-modal-btns">
          <button type="button" class="kg-modal-cancel" onclick="JWGInv.kioskCloseAdd()">Cancel</button>
          <button type="submit" class="kg-modal-save" id="kg-add-save">Add item</button>
        </div>
      </form>
    </div>`;
  }

  const lowCount=INV.items.filter(i=>i.current_stock<=i.min_threshold).length;
  if(_invKioskEntrance){
    _kgCountUp(document.getElementById("kg-k-total"),INV.items.length);
    _kgCountUp(document.getElementById("kg-k-low"),lowCount);
    _kgCountUp(document.getElementById("kg-k-restock"),INV.kioskRestocked);
  }else{
    document.getElementById("kg-k-total").textContent=INV.items.length;
    document.getElementById("kg-k-low").textContent=lowCount;
    document.getElementById("kg-k-restock").textContent=INV.kioskRestocked;
  }
  document.getElementById("kg-chip-low-n").textContent="· "+lowCount;

  // Banner: ordered/restocked news only (lows are already flagged on the cards).
  // Visible for 5 min after login — or after fresh news arrives — then hides.
  const events=[
    ...INV.items.filter(i=>i.status==="ordered").map(i=>({id:i.id,s:"ORDERED",cls:"ord",n:i.item_name})),
    ...INV.items.filter(i=>i.status!=="ordered"&&_kgRecentRestock(i)).map(i=>({id:i.id,s:"RESTOCKED",cls:"res",n:i.item_name}))
  ];
  const track=document.getElementById("kg-ticker-track");
  const tickerKey=events.map(a=>a.s+a.id).join("|");
  if(tickerKey!==_kgTickerKey){
    _kgTickerKey=tickerKey;
    if(events.length)_kgBannerUntil=Math.max(_kgBannerUntil,Date.now()+300000);  // fresh news restarts the 5 min
    const dot=`<span class="kg-tk-dot">•</span>`;
    const base=events.map(a=>`<span class="kg-tk ${a.cls}"><b>${a.s}</b>${esc(a.n)}</span>`).join(dot)+dot;
    let half=""; for(let k=0;k<6;k++)half+=base;
    track.innerHTML=half+half;  // two identical halves -> seamless -50% loop
    track.style.animationDuration=Math.max(90,events.length*40)+"s";
  }
  const showBanner=events.length>0&&Date.now()<_kgBannerUntil;
  document.querySelector(".kg-tickerbar").style.display=showBanner?"":"none";
  clearTimeout(_kgBannerTimer);
  if(showBanner)_kgBannerTimer=setTimeout(()=>renderInventoryPage(),_kgBannerUntil-Date.now()+250);
  document.getElementById("kg-chip-all").classList.toggle("on",INV.kioskFilter!=="low");
  document.getElementById("kg-chip-low").classList.toggle("on",INV.kioskFilter==="low");

  const q=(INV.search||"").trim().toLowerCase();
  const list=INV.items.filter(i=>
    (INV.kioskFilter!=="low"||i.current_stock<=i.min_threshold)&&
    (!q||i.item_name.toLowerCase().includes(q)||(i.product_number||"").toLowerCase().includes(q)));
  const _rank=i=>i.current_stock===0?0:i.current_stock<=i.min_threshold?1:2;
  list.sort((a,b)=>_rank(a)-_rank(b)||a.item_name.localeCompare(b.item_name));

  // Don't rebuild the grid under a count box someone is typing in — the KPIs
  // and banner still update; the grid catches up on the next render after blur.
  const _ae=document.activeElement;
  const _typing=_ae&&_ae.classList&&(_ae.classList.contains("kg-num-input")||_ae.classList.contains("kg-back-input"));
  if(!_typing){
  document.getElementById("kg-grid").innerHTML=list.map((item,ix)=>{
    const low=item.current_stock<=item.min_threshold;
    const target=Math.max(item.min_threshold*2,item.min_threshold+6);
    const pct=Math.max(6,Math.min(100,Math.round(item.current_stock/Math.max(1,target)*100)));
    const barColor=low?"#ef4444":item.current_stock<=Math.ceil(item.min_threshold*1.4)?"#eab308":"#22c55e";
    return `<div class="kg-card${_invKioskEntrance?" enter":""}"${_invKioskEntrance?' style="animation-delay:'+Math.min(ix,12)*65+'ms"':""}>
      <div class="kg-inner">
        <div class="kg-img">
          ${item.image_url?`<img src="${esc(item.image_url)}" alt="${esc(item.item_name)}">`:`<span class="kg-imgph">${esc(item.item_name)}</span>`}
          ${low?`<span class="kg-lowbadge">LOW</span>`:""}
          ${item.status==="ordered"||_kgRecentRestock(item)?`<div class="kg-flags">${item.status==="ordered"?`<span class="kg-flag ord">ORDERED</span>`:""}${item.status!=="ordered"&&_kgRecentRestock(item)?`<span class="kg-flag res">RESTOCKED ✓</span>`:""}</div>`:""}
          ${INV.kioskCelebrateId===item.id?`<div class="kg-cel"><span class="kg-cel-ring"></span><span class="kg-cel-pill">${JWGIcons.svg("confirmed",{size:16,color:"#fff"})}Restocked!</span></div>`:""}
        </div>
        <div class="kg-body">
          <div class="kg-nrow"><span class="kg-name">${esc(item.item_name)}</span>${item.product_number?`<span class="kg-prod">#${esc(item.product_number)}</span>`:""}</div>
          <div class="kg-meta">Reorder at ${item.min_threshold} · per ${esc(item.unit||"each")}</div>
          <div class="kg-bar"><span class="kg-bar-fill" style="width:${pct}%;background:${barColor};box-shadow:0 0 8px ${barColor}66"></span></div>
          <div class="kg-foot">
            <div class="kg-count"><input class="kg-num-input${low?" islow":""}${INV.kioskBumpId===item.id?" kg-bump":""}" type="number" min="0" inputmode="numeric" value="${item.current_stock}" title="Click and type the count" onfocus="this.select()" onkeydown="if(event.key==='Enter')this.blur()" onchange="JWGInv.kioskSetCount('${item.id}',this.value)"><span class="kg-unit">${esc(item.unit||"")}</span></div>
            <div class="kg-btns">
              <button type="button" class="kg-dec" onclick="JWGInv.kioskAdjust('${item.id}',-1)">−</button>
              <button type="button" class="kg-inc" onclick="JWGInv.kioskAdjust('${item.id}',1)">+</button>
            </div>
          </div>
          <div class="kg-back">
            <span class="kg-back-label">Backstock</span>
            <input class="kg-back-input" type="number" min="0" inputmode="numeric" value="${item.backstock||0}" title="Click and type the count" onfocus="this.select()" onkeydown="if(event.key==='Enter')this.blur()" onchange="JWGInv.kioskSetBack('${item.id}',this.value)">
            <div class="kg-back-btns">
              <button type="button" onclick="JWGInv.kioskAdjustBack('${item.id}',-1)">−</button>
              <button type="button" onclick="JWGInv.kioskAdjustBack('${item.id}',1)">+</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
  document.getElementById("kg-empty").hidden=list.length>0;
  }

  if(INV.kioskToast)document.getElementById("kg-toast-name").textContent=INV.kioskToast;
  document.getElementById("kg-toast").classList.toggle("show",!!INV.kioskToast);

  _invKioskEntrance=false;
  INV.kioskBumpId=null;
}

// Kiosk "Add item" modal. Deliberately has NO image/link/price fields — the
// kiosk must never offer a way off the page (Jake); admins add those on the
// dashboard later. The category picker can create a new category inline.
function kioskOpenAddItem(){
  const sel=document.getElementById("kg-add-cat");
  sel.innerHTML=INV.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")+`<option value="__new">+ New category…</option>`;
  document.getElementById("kg-add-newcat-wrap").hidden=INV.categories.length>0;
  document.getElementById("kg-add-newcat").value="";
  document.getElementById("kg-add-name").value="";
  document.getElementById("kg-add-prod").value="";
  document.getElementById("kg-add-unit").value="each";
  document.getElementById("kg-add-stock").value="0";
  document.getElementById("kg-add-back").value="0";
  document.getElementById("kg-add-min").value="1";
  document.getElementById("kg-add-modal").classList.add("open");
  setTimeout(()=>document.getElementById("kg-add-name").focus(),80);
}
function kioskCloseAddItem(){document.getElementById("kg-add-modal").classList.remove("open");}
async function kioskSaveAddItem(){
  const name=document.getElementById("kg-add-name").value.trim();
  if(!name){toast("Enter the item name","error");return;}
  let catId=document.getElementById("kg-add-cat").value||null;
  const newCat=document.getElementById("kg-add-newcat").value.trim();
  const unit=document.getElementById("kg-add-unit").value.trim()||"each";
  const stock=Math.max(0,parseInt(document.getElementById("kg-add-stock").value,10)||0);
  const back=Math.max(0,parseInt(document.getElementById("kg-add-back").value,10)||0);
  const min=Math.max(0,parseInt(document.getElementById("kg-add-min").value,10)||0);
  const prod=document.getElementById("kg-add-prod").value.trim();
  const btn=document.getElementById("kg-add-save");
  btn.disabled=true;
  try{
    if(catId==="__new"){
      if(!newCat){toast("Name the new category","error");btn.disabled=false;return;}
      const maxSort=INV.categories.reduce((m,c)=>Math.max(m,c.sort_order||0),0);
      const rows=await sbF("POST","jwg_inventory_categories",{name:newCat,sort_order:maxSort+1,is_active:true});
      catId=rows&&rows[0]?rows[0].id:null;
    }
    await sbF("POST","jwg_inventory_items",{
      item_name:name,product_number:prod,category_id:catId,
      current_stock:stock,min_threshold:min,backstock:back,unit,
      status:stock===0?"out_of_stock":stock<=min?"low":"in_stock",notes:""
    });
    await loadInventoryData();
    kioskCloseAddItem();
    renderInventoryPage();
    toast("Added "+esc(name));
  }catch(e){toast("Couldn't save — try again","error");console.error(e);}
  btn.disabled=false;
}

// Backstock (stock kept in the other room) — plain count, no status/low logic:
// low is judged on the shelf (current_stock) only.
async function kioskAdjustBackstock(itemId,delta){
  const item=INV.items.find(i=>i.id===itemId);
  if(!item)return;
  const newVal=Math.max(0,(item.backstock||0)+delta);
  if(newVal===(item.backstock||0))return;
  try{
    await sbF("PATCH",`jwg_inventory_items?id=eq.${itemId}`,{backstock:newVal});
    item.backstock=newVal;
    renderInventoryPage();
  }catch(e){toast("Failed to update backstock","error");console.error(e);}
}

// Kiosk +/- wrapper: same PATCH as the dashboard via adjustInventory, plus the
// number-bump, and — when a + takes an item from low back over its minimum —
// the restock counter, card celebration, and green toast.
async function kioskAdjustInventory(itemId,delta){
  const item=INV.items.find(i=>i.id===itemId);
  if(!item)return;
  const before=item.current_stock,wasLow=before<=item.min_threshold;
  INV.kioskBumpId=itemId;
  await adjustInventory(itemId,delta);
  if(item.current_stock===before){INV.kioskBumpId=null;return;}
  if(delta>0&&wasLow&&item.current_stock>item.min_threshold){
    _kgCelebrate(item);
    renderInventoryPage();
  }
}

// Typed count boxes (the dashed inputs on each card) — commit on Enter/blur.
async function kioskSetCount(itemId,val){
  const item=INV.items.find(i=>i.id===itemId);
  if(!item)return;
  const n=Math.max(0,parseInt(val,10)||0);
  if(n===item.current_stock){renderInventoryPage();return;}
  const wasLow=item.current_stock<=item.min_threshold;
  const st=n===0?"out_of_stock":n<=item.min_threshold?"low":"in_stock";
  try{
    await sbF("PATCH",`jwg_inventory_items?id=eq.${itemId}`,{current_stock:n,status:st});
    item.current_stock=n;item.status=st;
    INV.kioskBumpId=itemId;
    if(wasLow&&n>item.min_threshold)_kgCelebrate(item);
    renderInventoryPage();
  }catch(e){toast("Failed to update stock","error");console.error(e);renderInventoryPage();}
}
async function kioskSetBackstock(itemId,val){
  const item=INV.items.find(i=>i.id===itemId);
  if(!item)return;
  const n=Math.max(0,parseInt(val,10)||0);
  if(n===(item.backstock||0)){renderInventoryPage();return;}
  try{
    await sbF("PATCH",`jwg_inventory_items?id=eq.${itemId}`,{backstock:n});
    item.backstock=n;
    renderInventoryPage();
  }catch(e){toast("Failed to update backstock","error");console.error(e);renderInventoryPage();}
}

// The natural way to count stock is click-click-click, but each click used to wait
// for its own round trip AND work out "current + 1" from the number as of that
// click — so two or three clicks inside one trip all computed the same answer and
// counting ten landed on four. Now the number moves immediately and a burst of
// clicks collapses into one save of the final total.
const _invSaveTimers={};
function adjustInventory(itemId,delta){
  const item=INV.items.find(i=>i.id===itemId);
  if(!item)return;
  const before=item.current_stock;
  const newCount=Math.max(0,item.current_stock+delta);
  item.current_stock=newCount;
  item.status=newCount===0?"out_of_stock":newCount<=item.min_threshold?"low":"in_stock";
  renderInventoryPage();                      // on screen at once, no waiting

  clearTimeout(_invSaveTimers[itemId]);
  _invSaveTimers[itemId]=setTimeout(async function(){
    delete _invSaveTimers[itemId];
    const total=item.current_stock, status=item.status;
    try{
      await sbF("PATCH",`jwg_inventory_items?id=eq.${itemId}`,{current_stock:total,status:status});
    }catch(e){
      // Put the number back rather than leave a count on screen the database
      // never received — the office orders off these.
      item.current_stock=before;
      item.status=before===0?"out_of_stock":before<=item.min_threshold?"low":"in_stock";
      renderInventoryPage();
      toast("Couldn't save that count — check the Wi-Fi and try again","error");
      console.error(e);
    }
  },450);
}

async function markOrdered(itemId){
  try{
    await sbF("PATCH",`jwg_inventory_items?id=eq.${itemId}`,{status:"ordered"});
    const item=INV.items.find(i=>i.id===itemId);
    if(item)item.status="ordered";
    renderInventoryPage();
  }catch(e){toast("Failed to mark as ordered","error");console.error(e);}
}

async function setInventoryCount(itemId,extra){
  const item=INV.items.find(i=>i.id===itemId);
  if(!item)return;
  const ans=prompt(`Set the on-hand count for "${item.item_name}"${item.unit?" ("+item.unit+")":""}:`,item.current_stock);
  if(ans===null)return;
  const n=Math.max(0,parseInt(ans,10)||0);
  const st=n===0?"out_of_stock":n<=item.min_threshold?"low":"in_stock";
  try{
    const patch={current_stock:n,status:st,...(extra||{})};
    await sbF("PATCH",`jwg_inventory_items?id=eq.${itemId}`,patch);
    Object.assign(item,patch);
    renderInventoryPage();
    toast("Stock updated");
  }catch(e){toast("Failed to update stock","error");console.error(e);}
}
// Admin "Restocked" button: same set-count flow, plus the restocked_at stamp the
// kiosk uses to show Darrin a RESTOCKED flag (and banner) until his next day.
async function restockItem(itemId){return setInventoryCount(itemId,{restocked_at:new Date().toISOString()});}
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
      <button class="modal-done" onclick="JWGInv.saveInventoryItem()">Save Item</button>
      <button class="modal-cancel" onclick="JWGInv.closeModal()">Cancel</button>
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
      <button class="modal-done" onclick="JWGInv.updateInventoryItem('${itemId}')">Update</button>
      <button class="modal-cancel" onclick="JWGInv.closeModal()">Cancel</button>
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
        <button class="loc-action-btn delete" onclick="JWGInv.deleteCategory('${c.id}')">Remove</button>
      </div>`).join("")}
    </div>
    <div style="border-top:1px solid var(--border);padding-top:14px;">
      <input type="text" class="si-form-input" id="new-cat" placeholder="New category…" style="margin-bottom:8px;">
      <button class="si-action-btn" onclick="JWGInv.addCategory()" style="width:100%;">Add Category</button>
    </div>
    <button class="modal-cancel" onclick="JWGInv.closeModal()" style="margin-top:14px;width:100%;">Done</button>
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

async function bootInventoryKiosk(){
  _invKioskMode=true;  // route all inventory renders to the futuristic kiosk view
  _kgBannerUntil=Date.now()+300000;  // news banner runs for 5 min after login
  try{
    await loadInventoryData();
    // (the scheduler set S.tab here; this module has no tabs - the kiosk is
    //  inventory and nothing else, which is the point of the split.)
    renderInventoryPage();
    initInventoryRealtime();  // live-sync: stock only - no schedule or staff feed on this screen
  }catch(e){toast("Couldn't load inventory: "+(e.message||e),"error");console.error(e);}
}

/* ===== live sync - inventory tables ONLY =====
   The scheduler subscribes to eleven tables. The kiosk needs exactly these two,
   so nothing about staff or schedules reaches that screen any more. */
let _invChannel=null;
function initInventoryRealtime(){
  if(_invChannel||!db)return;
  _invChannel=db.channel("jwg-inventory")
    .on("postgres_changes",{event:"*",schema:"public",table:"jwg_inventory_items"},payload=>{
      const row=payload.eventType==="DELETE"?payload.old:payload.new;if(!row)return;
      if(payload.eventType==="DELETE")INV.items=INV.items.filter(i=>i.id!==row.id);
      else{const idx=INV.items.findIndex(i=>i.id===row.id);
        if(idx>=0)INV.items[idx]={...INV.items[idx],...row};else INV.items.push(row);}
      renderInventoryPage();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"jwg_inventory_categories"},payload=>{
      const row=payload.eventType==="DELETE"?payload.old:payload.new;if(!row)return;
      if(payload.eventType==="DELETE")INV.categories=INV.categories.filter(c=>c.id!==row.id);
      else{const idx=INV.categories.findIndex(c=>c.id===row.id);
        if(idx>=0)INV.categories[idx]={...INV.categories[idx],...row};else INV.categories.push(row);}
      renderInventoryPage();
    })
    .subscribe();
}

/* ===== exports ===== */
window.JWGInv={INV:INV,adjustInventory:adjustInventory,setInventoryCount:setInventoryCount,restockItem:restockItem,markOrdered:markOrdered,filterInventory:filterInventory,openAddInventoryItem:openAddInventoryItem,saveInventoryItem:saveInventoryItem,editInventoryItem:editInventoryItem,updateInventoryItem:updateInventoryItem,deleteInventoryItem:deleteInventoryItem,openManageCategories:openManageCategories,addCategory:addCategory,deleteCategory:deleteCategory,printInventoryShoppingList:printInventoryShoppingList,closeModal:closeModal,dismissToast:dismissToast,kioskAdjustInventory:kioskAdjustInventory,kioskAdjust:kioskAdjustInventory,kioskAdjustBackstock:kioskAdjustBackstock,kioskAdjustBack:kioskAdjustBackstock,kioskSetCount:kioskSetCount,kioskSetBackstock:kioskSetBackstock,kioskSetBack:kioskSetBackstock,kioskOpenAddItem:kioskOpenAddItem,kioskOpenAdd:kioskOpenAddItem,kioskCloseAddItem:kioskCloseAddItem,kioskCloseAdd:kioskCloseAddItem,kioskSaveAddItem:kioskSaveAddItem,kioskSaveAdd:kioskSaveAddItem,buildInventoryPage:buildInventoryPage,initInventoryPage:initInventoryPage,renderInventoryPage:renderInventoryPage,loadInventoryData:loadInventoryData,boot:bootInventoryKiosk};
// What inventory.html calls once Darrin signs in.
window.renderJwgInventoryKiosk=bootInventoryKiosk;
})();
