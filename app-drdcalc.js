// ─── FURNITURE QUOTE CALCULATOR (standalone quote tool) ───
// Depends on app.js globals: DRD_ITEMS, DRD_ORDER, drdGroupedOrder, toast, newJob,
//   and for the Start-a-Job handoff: renderDrdModalGrid, drdModalAddOtherRow, drdModalRecalc
// Also uses JWGIcons (jwg-icons.js) for the truck-panel readout tiles.
// Called by render('drdcalc') in app.js.

// ── Truck load panel data ──
var DRDC_CAP = 800;               // usable ft³ in the 16 ft box truck
var DRDC_CIRC = 2 * Math.PI * 52; // gauge arc circumference (r=52 in the svg)
var drdcLastVol = 0;              // previous total ft³ — drives the "+N ft³" float chip
// Crate art lives at assets/furniture/mid/<slug>.png (truck visual) and
// assets/furniture/thumbs/<slug>.png (item list / chips), slug = drdcSlug(item.name).
// DRDC_BB is each image's content bounding box [left,top,width,height] as fractions
// of the square canvas, computed from the PNG alpha channel. Items with no entry
// render as the generic moving box on the truck and get an icon tile in the list.
var DRDC_BB = {
'air-conditioner':[0.2292,0.0938,0.5521,0.7917],
'air-fryer':[0.2292,0.1562,0.5417,0.6667],
'armchair':[0.1354,0.1667,0.7396,0.6354],
'armoire':[0.2604,0.0833,0.4896,0.8021],
'artificial-plant-christmas-tree':[0.2917,0.0625,0.4375,0.8646],
'bar-fridge':[0.2188,0.1146,0.5625,0.7604],
'bench':[0.1354,0.3333,0.7292,0.3438],
'blender':[0.3125,0.0833,0.4062,0.8125],
'box-assorted-home-goods':[0.1458,0.1771,0.7083,0.6562],
'box-cookware':[0.1146,0.1667,0.7708,0.6771],
'box-dishware':[0.1354,0.1458,0.7396,0.6875],
'boxspring-double':[0.0417,0.2812,0.9271,0.4062],
'boxspring-queen':[0.0417,0.3021,0.9271,0.3958],
'boxspring-twin':[0.0729,0.3021,0.8646,0.3958],
'buffet-and-hutch':[0.1979,0.0625,0.6146,0.8438],
'cd-stand':[0.3438,0.0521,0.3229,0.8958],
'chair-dining-kitchen-occasional':[0.2292,0.0833,0.5625,0.8021],
'chest':[0.0625,0.2292,0.875,0.5208],
'coat-rack':[0.3854,0.0625,0.2396,0.8646],
'coffee-maker':[0.2188,0.0833,0.5729,0.8125],
'complete-bed-frame-double':[0.0729,0.1979,0.875,0.5729],
'complete-bed-frame-queen':[0.0625,0.1875,0.8854,0.5729],
'complete-bed-frame-twin':[0.1042,0.1875,0.8021,0.6042],
'countertop-dishwasher':[0.1354,0.2083,0.75,0.5938],
'credenza':[0.0312,0.3125,0.9375,0.4167],
'desk':[0.0729,0.2292,0.8646,0.5312],
'dresser':[0.0938,0.1979,0.8229,0.5938],
'dvd-vcr-player':[0.0625,0.3125,0.875,0.3438],
'entertainment-unit-large':[0.0833,0.1458,0.8333,0.6979],
'fan':[0.3333,0.0417,0.3438,0.9167],
'filing-cabinet-small':[0.3021,0.2292,0.4688,0.5417],
'folding-chair':[0.25,0.25,0.5417,0.5312],
'folding-table':[0.1771,0.3229,0.7083,0.4583],
'freezer':[0.25,0.2812,0.5729,0.4479],
'futon-complete':[0.1562,0.3229,0.7083,0.4583],
'garment-rack':[0.1875,0.25,0.6458,0.5938],
'headboard':[0.25,0.2604,0.5104,0.5208],
'humidifier-dehumidifier':[0.3229,0.25,0.4271,0.5104],
'indoor-grill':[0.2708,0.2917,0.5208,0.3958],
'ironing-board':[0.1354,0.3438,0.7083,0.4479],
'juicer':[0.3333,0.1146,0.4896,0.5833],
'kitchen-cart-tea-cart-bar-cart':[0.2083,0.2083,0.5938,0.5833],
'lamp':[0.3438,0.125,0.3125,0.6667],
'large-cabinet':[0.2917,0.1562,0.4896,0.5938],
'laundry-hamper':[0.3229,0.2188,0.3542,0.5312],
'linens-per-bag':[0.3333,0.1458,0.3438,0.5833],
'loveseat':[0.1562,0.3229,0.6979,0.4479],
'mattress-double':[0.2188,0.3229,0.5833,0.3333],
'mattress-queen':[0.2083,0.3125,0.6042,0.3438],
'mattress-twin':[0.2396,0.3229,0.5417,0.3333],
'metal-bed-frame-double':[0.1979,0.2396,0.625,0.5312],
'metal-bed-frame-queen':[0.1979,0.2396,0.625,0.5312],
'metal-bed-frame-twin':[0.2812,0.2396,0.4583,0.5312],
'microwave':[0.25,0.2917,0.5417,0.375],
'microwave-stand':[0.2396,0.2604,0.5729,0.4896],
'mirror':[0.3438,0.1354,0.3229,0.6146],
'office-chair':[0.2083,0.25,0.5729,0.6042],
'ottoman':[0.2917,0.3542,0.4167,0.4062],
'patio-chair-side-table':[0.1771,0.2812,0.6771,0.4896],
'patio-table':[0.1771,0.2917,0.6458,0.5],
'picture-art':[0.3125,0.1771,0.375,0.5417],
'plastic-storage-unit':[0.3229,0.1771,0.3542,0.5833],
'recliner':[0.1562,0.2604,0.6875,0.5312],
'recliner-sofa':[0.0833,0.2917,0.8438,0.4167],
'rocking-chair':[0.2083,0.25,0.5833,0.5521],
'room-divider':[0.2083,0.1771,0.5938,0.5729],
'rug':[0.1458,0.4271,0.6979,0.2396],
'sewing-machine':[0.2396,0.2917,0.5312,0.4062],
'shelf-large':[0.2917,0.1458,0.4896,0.6042],
'shelf-small':[0.3542,0.2917,0.3542,0.4479]
};
function drdcSlug(name){ return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
// Returns the art slug for an item, or null when it has no image of its own.
function drdcArt(item){ var s=drdcSlug(item.name); return DRDC_BB[s]?s:null; }
function renderDrdCalc(){
  var g=document.getElementById('drdc-grid');
  if(!g) return;
  var html='';
  drdGroupedOrder().forEach(function(G){
    html+='<div class="drd-hdr" style="grid-column:1/-1;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--accent);margin-top:10px">'+G.grp+'</div>';
    G.subs.forEach(function(S){
      if(S.sub) html+='<div class="drd-hdr" style="grid-column:1/-1;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted)">'+S.sub+'</div>';
      S.idxs.forEach(function(i){
        var item=DRD_ITEMS[i];
        var art=drdcArt(item);
        var c=drdcQtyOf(i);   // quantities survive leaving and re-entering the page
        var thumb=art
          ?'<img src="assets/furniture/thumbs/'+art+'.png" alt="" draggable="false" style="width:40px;height:40px;flex:none;object-fit:contain">'
          :'<span style="width:40px;height:40px;flex:none;display:flex;align-items:center;justify-content:center;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--muted)">'+JWGIcons.svg('furniture',{size:20})+'</span>';
        html+='<div class="drdc-item" data-name="'+item.name.toLowerCase()+'" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;gap:10px">'
          +thumb
          +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+item.name+'">'+item.name+'</div>'
          +'<div style="font-size:11px;color:var(--muted)"><span style="color:var(--accent);font-weight:600">$'+item.fee+'</span> pays · $'+item.val+' receipt'+(item.vol?' · '+item.vol+' ft³':'')+'</div></div>'
          +'<div style="display:flex;align-items:center;gap:6px;flex:none">'
          +'<button type="button" class="drdc-step drdc-step-dec" onclick="drdcStep('+i+',-1)" aria-label="Remove one"'+(c?'':' disabled')+'>&minus;</button>'
          +'<span class="drdc-count'+(c?' on':'')+'" id="drdc-qty-'+i+'">'+c+'</span>'
          +'<button type="button" class="drdc-step drdc-step-inc" onclick="drdcStep('+i+',1)" aria-label="Add one">+</button>'
          +'</div>'
          +'</div>';
      });
    });
  });
  g.innerHTML=html;
  var otherRows=document.getElementById('drdc-other-rows');
  if(otherRows&&!otherRows.children.length) drdcAddOtherRow();
  drdcPaintTileIcons();
  drdcRecalc();
  drdcFilter();
  drdcTownList();
  drdcStaleNotice();
}

// If there's still a load on the truck from an earlier sitting, say so on arrival
// rather than letting the next customer's quote silently include it.
function drdcStaleNotice(){
  var box=document.getElementById('drdc-stale');
  if(!box) return;
  var n=0; Object.keys(drdcQty).forEach(function(k){ n+=drdcQty[k]||0; });
  var oldEnough = _drdcStartedAt && (Date.now()-_drdcStartedAt) > 30*60*1000;
  if(!n || !oldEnough){ box.style.display='none'; box.innerHTML=''; return; }
  var mins=Math.round((Date.now()-_drdcStartedAt)/60000);
  var whenTxt = mins>=120 ? Math.round(mins/60)+' hours ago' : mins+' minutes ago';
  box.innerHTML='<span>This quote was started '+whenTxt+' — <strong>'+n+' item'+(n===1?'':'s')+'</strong> still on the truck.</span>'
    +'<button type="button" class="btn btn-ghost btn-sm" onclick="drdcClear(true);drdcStaleNotice();toast(\'Started fresh.\')">Start fresh</button>';
  box.style.display='flex';
}
// Glyphs for the three truck-panel readout tiles. Cream on the dark spruce/clay
// tiles, dark ink on the gold one.
function drdcPaintTileIcons(){
  [['drdc-tl-ico-items','furniture','#fdf6e6'],
   ['drdc-tl-ico-load','schedule','#26311f'],
   ['drdc-tl-ico-runs','vehicles','#fdf6e6']].forEach(function(t){
    var el=document.getElementById(t[0]);
    if(el) el.innerHTML=JWGIcons.svg(t[1],{size:15,color:t[2]});
  });
}
// Quantities live here, keyed by DRD_ITEMS index — the +/- steppers are the only
// way to change them, so there is no input value to read back.
var drdcQty={};
// Quantities deliberately survive leaving the page, but nothing ever cleared them
// afterwards — so the next caller's quote started with the previous customer's
// sofa still on the truck, with nothing on screen saying so. This remembers when
// the current quote was started so a stale one can announce itself.
var _drdcStartedAt=null;
function drdcQtyOf(i){ return drdcQty[i]||0; }

// ── Zone minimum ──
// Customer Pays is the items lifted to the pickup town's zone minimum (see
// furnitureCustomerPays in app.js). The town box feeds it; the readout under the
// quote says whether the minimum kicked in.
function drdcTown(){ return (document.getElementById('drdc-town').value||'').trim(); }
// Every area and town on the price sheet, for the town box's suggestions.
function drdcTownList(){
  var dl=document.getElementById('drdc-town-list');
  if(!dl) return;
  var names={};
  Object.keys(ourPricesV2||{}).forEach(function(a){
    names[a]=1;
    String(ourPricesV2[a].towns||'').split(',').forEach(function(t){ t=t.trim(); if(t) names[t]=1; });
  });
  dl.innerHTML=Object.keys(names).sort().map(function(n){ return '<option value="'+n.replace(/"/g,'&quot;')+'">'; }).join('');
}
// One step on an item's stepper. Repaints just that row, then the totals.
function drdcStep(i,delta){
  var n=Math.max(0,drdcQtyOf(i)+delta);
  if(n===0) delete drdcQty[i]; else drdcQty[i]=n;
  if(!_drdcStartedAt && n>0) _drdcStartedAt=Date.now();
  var count=document.getElementById('drdc-qty-'+i);
  count.textContent=n;
  count.classList.toggle('on',n>0);
  count.parentElement.querySelector('.drdc-step-dec').disabled=(n===0);
  // Restart the pop animation even on a repeated click.
  count.classList.remove('bump');
  void count.offsetWidth;
  if(delta>0) count.classList.add('bump');
  drdcRecalc();
}
function drdcRecalc(){
  var totalItems=0,totalFee=0,totalVal=0;
  DRD_ITEMS.forEach(function(item,i){
    var qty=drdcQtyOf(i);
    totalItems+=qty; totalFee+=qty*item.fee; totalVal+=qty*item.val;
  });
  // Custom rows carry their own pays + receipt values, entered by the user
  var otherQtys=document.querySelectorAll('#drdc-other-rows .drdc-other-qty');
  var otherFees=document.querySelectorAll('#drdc-other-rows .drdc-other-fee');
  var otherVals=document.querySelectorAll('#drdc-other-rows .drdc-other-val');
  otherQtys.forEach(function(el,i){
    var qty=parseInt(el.value)||0;
    var fee=parseFloat(otherFees[i]?otherFees[i].value:0)||0;
    var val=parseFloat(otherVals[i]?otherVals[i].value:0)||0;
    totalItems+=qty; totalFee+=qty*fee; totalVal+=qty*val;
  });
  var floor=furnitureCustomerPays(totalFee, drdcTown());
  var ti=document.getElementById('drdc-total-items');
  var tf=document.getElementById('drdc-total-pay');
  var tv=document.getElementById('drdc-total-receipt');
  var tn=document.getElementById('drdc-trip');
  if(ti)ti.textContent=totalItems;
  if(tf)tf.textContent=floor.pay.toFixed(2);
  if(tn)tn.textContent=floor.note;
  if(tv)tv.textContent=totalVal.toFixed(2);
  drdcRenderTruck();
}
// Current quantities as [{item, qty}], catalogue order, quantity > 0 only.
function drdcPicked(){
  var out=[];
  DRD_ITEMS.forEach(function(item,i){
    var qty=drdcQtyOf(i);
    if(qty>0) out.push({item:item,qty:qty,idx:i});
  });
  return out;
}
// Take an item off the load entirely, from the "On the truck" list.
function drdcRemove(i){ drdcStep(i,-drdcQtyOf(i)); }
// Gauge maths, shared by the quote page and the job form: green under 70% full,
// amber to 100%, red over. Returns the arc offset ready for the SVG.
function drdcGaugeVals(vol){
  var raw=vol/DRDC_CAP*100;
  return {raw:raw,pct:Math.round(raw),
          color:raw<70?'var(--accent)':(raw<100?'#eab308':'#dc3545'),
          dash:(DRDC_CIRC*(1-Math.min(raw,100)/100)).toFixed(1)};
}
// The job form's truck. Same photo, crop and crate packing as the quote page, with a
// small gauge and no readout tiles — it sits inside a form, not on its own page.
// Quantities are read from the form's own inputs, which stay the single store.
function drdcRenderModalTruck(){
  var frame=document.getElementById('drd-m-crates');
  if(!frame) return;
  var picked=[],vol=0;
  DRD_ITEMS.forEach(function(item,i){
    var el=document.getElementById('drd-m-qty-'+i);
    var q=el?(parseInt(el.value)||0):0;
    if(q>0){ picked.push({item:item,qty:q,idx:i}); vol+=(item.vol||0)*q; }
  });
  var gv=drdcGaugeVals(vol);
  var arc=document.getElementById('drd-m-gauge-arc');
  arc.setAttribute('stroke',gv.color);
  arc.setAttribute('stroke-dashoffset',gv.dash);
  var num=document.getElementById('drd-m-gauge-pct');
  num.style.color=gv.color;
  document.getElementById('drd-m-gauge-num').textContent=gv.pct;
  document.getElementById('drd-m-vol').textContent=Math.round(vol);
  document.getElementById('drd-m-trips').textContent=(vol<=0?1:Math.max(1,Math.ceil(vol/DRDC_CAP)));
  document.getElementById('drd-m-truck-dip').style.transform='translateY('+Math.min(6,gv.raw/100*6).toFixed(1)+'px)';
  drdcRenderCrates(frame,picked);
}
// Redraws the whole truck panel: gauge, readout tiles, crate stack, item chips.
function drdcRenderTruck(){
  var frame=document.getElementById('drdc-crates');
  if(!frame) return;
  var picked=drdcPicked();
  var vol=0,items=0;
  picked.forEach(function(p){ vol+=(p.item.vol||0)*p.qty; items+=p.qty; });

  var gv=drdcGaugeVals(vol), pctRaw=gv.raw, color=gv.color;
  var arc=document.getElementById('drdc-gauge-arc');
  arc.setAttribute('stroke',color);
  arc.setAttribute('stroke-dashoffset',gv.dash);
  document.getElementById('drdc-gauge-pct').style.color=color;
  document.getElementById('drdc-gauge-pct-num').textContent=Math.round(pctRaw);
  document.getElementById('drdc-vol').textContent=Math.round(vol);

  var trucks=vol<=0?1:Math.max(1,Math.ceil(vol/DRDC_CAP));
  var many=trucks>1;
  document.getElementById('drdc-tl-items').textContent=items;
  document.getElementById('drdc-tl-load').textContent=Math.max(0,Math.round(items*2.5)+(trucks-1)*15);
  document.getElementById('drdc-tl-trucks').textContent=trucks;
  document.getElementById('drdc-tl-trucks').style.color=many?'#a8701a':'#17402a';
  var runsLabel=document.getElementById('drdc-tl-runslabel');
  runsLabel.textContent=many?'trips — ouch':'trip, one and done';
  runsLabel.style.color=many?'#a8701a':'#7a7c5f';
  document.getElementById('drdc-tl-ico-runs').style.background=many?'#d9532b':'#17402a';

  var over=document.getElementById('drdc-over');
  over.style.display=vol>DRDC_CAP?'flex':'none';
  if(vol>DRDC_CAP){
    document.getElementById('drdc-over-vol').textContent=Math.round(vol-DRDC_CAP);
    document.getElementById('drdc-over-trips').textContent=trucks;
  }
  // Loaded suspension dip — the box settles as weight goes on.
  document.getElementById('drdc-truck-dip').style.transform='translateY('+Math.min(6,pctRaw/100*6).toFixed(1)+'px)';

  drdcRenderCrates(frame,picked);
  drdcRenderChips(picked);
  if(vol>drdcLastVol) drdcFloatChip(vol-drdcLastVol);
  drdcLastVol=vol;
}
// Shelf-packs one crate per unit into the cargo box, largest-volume first so the
// big pieces land at the bottom. Sizes come from each item's ft³ against capacity.
// Crates are matched to existing nodes by key so only genuinely new ones play the
// drop animation — the rest slide to their new spot on the CSS transition.
function drdcRenderCrates(frame,picked){
  var units=[];
  picked.slice().sort(function(a,b){ return (b.item.vol||0)-(a.item.vol||0); })
    .forEach(function(p){
      var art=drdcArt(p.item);
      for(var k=0;k<p.qty;k++) units.push({key:drdcSlug(p.item.name)+'#'+k,art:art,vol:p.item.vol||0});
    });
  var keep={};
  var x=0,y=0,shelfH=0;
  units.forEach(function(u){
    var bb=u.art?DRDC_BB[u.art]:[0.1458,0.1771,0.7083,0.6562]; // generic box footprint
    var asp=Math.min(3.2,Math.max(.3,bb[2]/bb[3]));
    var h=Math.min(62,Math.sqrt(Math.max(24,u.vol/DRDC_CAP*1.12*10000)/asp));
    var w=Math.min(94,h*asp);
    if(x+w>100&&x>0){ y+=shelfH; x=0; shelfH=0; }
    keep[u.key]=1;
    var el=frame.querySelector('[data-crate="'+u.key+'"]');
    if(!el){
      el=document.createElement('div');
      el.setAttribute('data-crate',u.key);
      el.style.cssText='position:absolute;transition:left .42s cubic-bezier(.22,1,.36,1),bottom .42s cubic-bezier(.22,1,.36,1);animation:drdcCrateDrop .6s cubic-bezier(.34,1.56,.64,1)';
      el.innerHTML='<img src="assets/furniture/mid/'+(u.art||'box-assorted-home-goods')+'.png" alt="" draggable="false" '
        +'style="position:absolute;left:'+(-bb[0]/bb[2]*100)+'%;top:'+(-bb[1]/bb[3]*100)+'%;'
        +'width:'+(100/bb[2])+'%;height:'+(100/bb[3])+'%;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.22))">';
      frame.appendChild(el);
    }
    el.style.left=x+'%';
    el.style.bottom=Math.min(y,112)+'%';
    el.style.width=w+'%';
    el.style.height=h+'%';
    x+=w+0.8; if(h+1.2>shelfH) shelfH=h+1.2;
  });
  Array.prototype.slice.call(frame.children).forEach(function(el){
    if(!keep[el.getAttribute('data-crate')]) el.remove();
  });
}
// "On the truck" chip row under the panel.
function drdcRenderChips(picked){
  var wrap=document.getElementById('drdc-loaded-wrap');
  var list=document.getElementById('drdc-loaded');
  wrap.style.display=picked.length?'':'none';
  var html='';
  picked.forEach(function(p){
    var art=drdcArt(p.item);
    var thumb=art
      ?'<img src="assets/furniture/thumbs/'+art+'.png" alt="" draggable="false" style="width:32px;height:32px;flex:none;object-fit:contain">'
      :'<span style="width:32px;height:32px;flex:none;display:flex;align-items:center;justify-content:center;color:var(--muted)">'+JWGIcons.svg('furniture',{size:18})+'</span>';
    html+='<div style="display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--border);border-radius:99px;padding:5px 14px 5px 6px;box-shadow:0 1px 3px rgba(0,0,0,.05)">'
      +thumb
      +'<div style="line-height:1.25;min-width:0"><div style="font-size:12.5px;font-weight:600;color:var(--text);white-space:nowrap">'+p.item.name+'</div>'
      +'<div style="font-size:10.5px;color:var(--muted);white-space:nowrap">'+p.qty+' × '+(p.item.vol||0)+' ft³</div></div>'
      +'<span style="font-family:\'Bebas Neue\',sans-serif;font-size:17px;color:var(--accent);letter-spacing:.5px;margin-left:6px;white-space:nowrap">'+((p.item.vol||0)*p.qty)+'</span>'
      +'<button type="button" class="drdc-chip-x" onclick="drdcRemove('+p.idx+')" title="Take '+p.item.name.replace(/"/g,'&quot;')+' off the truck" aria-label="Remove '+p.item.name.replace(/"/g,'&quot;')+'">&times;</button></div>';
  });
  list.innerHTML=html;
}
// "+N ft³" bubble that floats up off the truck when volume goes on.
function drdcFloatChip(delta){
  var frame=document.getElementById('drdc-truck-frame');
  var chip=document.createElement('div');
  chip.textContent='+'+Math.round(delta)+' ft³';
  chip.style.cssText='position:absolute;top:10%;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;font-size:12px;'
    +'font-weight:700;padding:3px 11px;border-radius:99px;box-shadow:0 4px 12px rgba(22,163,74,.45);pointer-events:none;'
    +'animation:drdcFloatUp 1.15s cubic-bezier(.22,1,.36,1) forwards;white-space:nowrap';
  chip.addEventListener('animationend',function(){ chip.remove(); });
  frame.appendChild(chip);
}
function drdcAddOtherRow(){
  var wrap=document.getElementById('drdc-other-rows');if(!wrap)return;
  var row=document.createElement('div');
  row.style.cssText='display:flex;gap:8px;margin-bottom:6px;align-items:center';
  row.innerHTML='<input type="text" class="form-input drdc-other-name" placeholder="Item description" style="font-size:13px;padding:6px 10px;flex:1">'
    +'<input type="number" class="form-input drdc-other-qty" placeholder="Qty" min="0" style="font-size:13px;padding:6px 10px;width:60px;text-align:center" oninput="drdcRecalc()">'
    +'<input type="number" class="form-input drdc-other-fee" placeholder="$ pays" min="0" step="0.01" style="font-size:13px;padding:6px 10px;width:80px;text-align:center" oninput="drdcRecalc()">'
    +'<input type="number" class="form-input drdc-other-val" placeholder="$ receipt" min="0" step="0.01" style="font-size:13px;padding:6px 10px;width:90px;text-align:center" oninput="drdcRecalc()">'
    +'<button type="button" onclick="this.parentElement.remove();drdcRecalc()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;padding:0 4px">&times;</button>';
  wrap.appendChild(row);
}
// skipConfirm is used after a quote has been handed off to a booking — there's
// nothing to lose at that point, so asking is just a speed bump.
function drdcClear(skipConfirm){
  if(!skipConfirm && !confirm('Clear all items?'))return;
  drdcQty={};
  _drdcStartedAt=null;
  DRD_ITEMS.forEach(function(_,i){
    var count=document.getElementById('drdc-qty-'+i);
    if(!count) return;
    count.textContent='0';
    count.classList.remove('on','bump');
    count.parentElement.querySelector('.drdc-step-dec').disabled=true;
  });
  document.getElementById('drdc-other-rows').innerHTML='';
  drdcAddOtherRow();drdcRecalc();
  document.getElementById('drdc-town').value='';drdcRecalc();
  var s=document.getElementById('drdc-search');if(s)s.value='';
  drdcFilter();
  if(!skipConfirm) toast('Cleared.');
}
function drdcCopy(){
  var items=document.getElementById('drdc-total-items').textContent;
  var pay=document.getElementById('drdc-total-pay').textContent;
  var rec=document.getElementById('drdc-total-receipt').textContent;
  // Totals alone left a pasted quote saying "6 items" with no record of WHICH six,
  // so a note or email made from it couldn't be checked against later.
  var lines=[];
  DRD_ITEMS.forEach(function(it,i){
    var q=drdcQtyOf(i);
    if(q>0) lines.push('  ' + q + ' x ' + it.name);
  });
  drdcCustomRows().forEach(function(c){
    if(c.name) lines.push('  ' + (c.qty||1) + ' x ' + c.name);
  });
  var trip=document.getElementById('drdc-trip').textContent;   // the note already painted under the quote
  var text=items+' items · Customer pays $'+pay+' · Tax receipt $'+rec
    + (lines.length ? '\n' + lines.join('\n') : '')
    + (drdcTown() ? '\n' + trip : '');
  if(navigator.clipboard) navigator.clipboard.writeText(text);
  toast('Copied the quote and its item list.');
}
function drdcFilter(){
  var sEl=document.getElementById('drdc-search');
  var q=sEl?(sEl.value||'').toLowerCase().trim():'';
  document.querySelectorAll('#drdc-grid .drdc-item').forEach(function(el){
    var n=el.getAttribute('data-name')||'';
    el.style.display=(!q||n.indexOf(q)>=0)?'':'none';
  });
  // Category headers only make sense for the full list — hide while searching
  document.querySelectorAll('#drdc-grid .drd-hdr').forEach(function(el){
    el.style.display=q?'none':'';
  });
}
// Custom rows the user typed in, as {name,qty,fee,val} — only rows with a quantity.
function drdcCustomRows(){
  var out=[];
  var names=document.querySelectorAll('#drdc-other-rows .drdc-other-name');
  var qtys=document.querySelectorAll('#drdc-other-rows .drdc-other-qty');
  var fees=document.querySelectorAll('#drdc-other-rows .drdc-other-fee');
  var vals=document.querySelectorAll('#drdc-other-rows .drdc-other-val');
  qtys.forEach(function(el,i){
    var q=parseInt(el.value)||0;
    if(q<=0) return;
    out.push({
      name:(names[i]?names[i].value:'').trim()||'Custom item',
      qty:q,
      fee:parseFloat(fees[i]?fees[i].value:0)||0,
      val:parseFloat(vals[i]?vals[i].value:0)||0
    });
  });
  return out;
}
// Runs fn once the booking form's furniture grid actually exists. The form opens
// asynchronously, so waiting on the element beats guessing a delay — a slow open
// used to drop the quantities silently.
function drdcWhenFormReady(fn){
  var deadline=Date.now()+5000;
  (function poll(){
    if(document.getElementById('drd-m-items-grid')&&document.getElementById('drd-m-other-rows')){ fn(); return; }
    if(Date.now()>deadline){ toast('Could not open the job form — nothing was carried over.'); return; }
    requestAnimationFrame(poll);
  })();
}
function drdcStartJob(){
  // Capture everything the quote is made of BEFORE opening the form
  var qtys={};
  DRD_ITEMS.forEach(function(_,i){
    var q=drdcQtyOf(i);
    if(q>0) qtys[i]=q;
  });
  var custom=drdcCustomRows();
  var town=drdcTown();
  newJob();
  drdcWhenFormReady(function(){
    // #f-svc is a hidden input and nothing listens to it, so the old
    // value=...+dispatchEvent('change') pair never ran toggleBin — the form opened with
    // the furniture panel still display:none and no Pickup Date row, then this function
    // wrote the quote's quantities into fields nobody could see. setFormSvc is the
    // documented programmatic entry point and does call toggleBin.
    setFormSvc('Furniture Pickup');
    if(town) document.getElementById('f-city').value=town;
    renderDrdModalGrid();
    Object.keys(qtys).forEach(function(i){
      document.getElementById('drd-m-qty-'+i).value=qtys[i];
    });
    // Custom items carry across too — they count toward the quoted price, so a job
    // filed without them would be cheaper than what the customer was told.
    var wrap=document.getElementById('drd-m-other-rows');
    wrap.innerHTML='';
    custom.forEach(function(c){
      drdModalAddOtherRow();
      var rows=wrap.children, row=rows[rows.length-1];
      row.querySelector('.drd-m-other-name').value=c.name;
      row.querySelector('.drd-m-other-qty').value=c.qty;
      row.querySelector('.drd-m-other-fee').value=c.fee;
      row.querySelector('.drd-m-other-val').value=c.val;
    });
    if(!custom.length) drdModalAddOtherRow();
    drdModalRecalc();
    // The quote has been handed to the booking form, so the calculator is done
    // with it. Left loaded, the next caller's quote silently included this one's
    // sofa and mattress. Cleared only after the carry-across has succeeded.
    drdcClear(true);
    drdcStaleNotice();
  });
}
