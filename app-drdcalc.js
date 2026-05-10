// ─── FURNITURE QUOTE CALCULATOR (standalone DRD-driven quote tool) ───
// Depends on app.js globals: DRD_ITEMS, toast, newJob, drdRecalc
// Called by render('drdcalc') in app.js.
function renderDrdCalc(){
  var g=document.getElementById('drdc-grid');
  if(!g) return;
  g.innerHTML=DRD_ITEMS.map(function(item,i){
    var sid='drdc-qty-'+i;
    return '<div class="drdc-item" data-name="'+item.name.toLowerCase()+'" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;gap:10px">'
      +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+item.name+'">'+item.name+'</div>'
      +'<div style="font-size:11px;color:var(--muted)">$'+item.val+' ea</div></div>'
      +'<input type="number" id="'+sid+'" min="0" placeholder="0" style="width:56px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 8px;border-radius:6px;font-size:13px;font-weight:700;text-align:center;font-family:\'DM Sans\',sans-serif" oninput="drdcRecalc()">'
      +'</div>';
  }).join('');
  var otherRows=document.getElementById('drdc-other-rows');
  if(otherRows&&!otherRows.children.length) drdcAddOtherRow();
  drdcRecalc();
  drdcFilter();
}
function drdcRecalc(){
  var totalItems=0,totalVal=0;
  DRD_ITEMS.forEach(function(item,i){
    var el=document.getElementById('drdc-qty-'+i);
    var qty=el?(parseInt(el.value)||0):0;
    totalItems+=qty; totalVal+=qty*item.val;
  });
  var otherQtys=document.querySelectorAll('#drdc-other-rows .drdc-other-qty');
  var otherVals=document.querySelectorAll('#drdc-other-rows .drdc-other-val');
  otherQtys.forEach(function(el,i){
    var qty=parseInt(el.value)||0;
    var val=parseFloat(otherVals[i]?otherVals[i].value:0)||0;
    totalItems+=qty; totalVal+=qty*val;
  });
  var ti=document.getElementById('drdc-total-items');
  var tv=document.getElementById('drdc-total-value');
  if(ti)ti.textContent=totalItems;
  if(tv)tv.textContent=totalVal.toFixed(2);
}
function drdcAddOtherRow(){
  var wrap=document.getElementById('drdc-other-rows');if(!wrap)return;
  var row=document.createElement('div');
  row.style.cssText='display:flex;gap:8px;margin-bottom:6px;align-items:center';
  row.innerHTML='<input type="text" class="form-input drdc-other-name" placeholder="Item description" style="font-size:13px;padding:6px 10px;flex:1">'
    +'<input type="number" class="form-input drdc-other-qty" placeholder="Qty" min="0" style="font-size:13px;padding:6px 10px;width:60px;text-align:center" oninput="drdcRecalc()">'
    +'<input type="number" class="form-input drdc-other-val" placeholder="$ ea" min="0" step="0.01" style="font-size:13px;padding:6px 10px;width:75px;text-align:center" oninput="drdcRecalc()">'
    +'<button type="button" onclick="this.parentElement.remove();drdcRecalc()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;padding:0 4px">&times;</button>';
  wrap.appendChild(row);
}
function drdcClear(){
  if(!confirm('Clear all items?'))return;
  DRD_ITEMS.forEach(function(_,i){var el=document.getElementById('drdc-qty-'+i);if(el)el.value='';});
  document.getElementById('drdc-other-rows').innerHTML='';
  drdcAddOtherRow();drdcRecalc();
  var s=document.getElementById('drdc-search');if(s)s.value='';
  drdcFilter();
  toast('Cleared.');
}
function drdcCopy(){
  var items=document.getElementById('drdc-total-items').textContent;
  var val=document.getElementById('drdc-total-value').textContent;
  var text=items+' items = $'+val;
  if(navigator.clipboard) navigator.clipboard.writeText(text);
  toast('Copied: '+text);
}
function drdcFilter(){
  var sEl=document.getElementById('drdc-search');
  var q=sEl?(sEl.value||'').toLowerCase().trim():'';
  document.querySelectorAll('#drdc-grid .drdc-item').forEach(function(el){
    var n=el.getAttribute('data-name')||'';
    el.style.display=(!q||n.indexOf(q)>=0)?'':'none';
  });
}
function drdcStartJob(){
  // Capture current quantities from the calculator
  var qtys={};
  DRD_ITEMS.forEach(function(_,i){
    var el=document.getElementById('drdc-qty-'+i);
    var q=el?(parseInt(el.value)||0):0;
    if(q>0) qtys[i]=q;
  });
  newJob();
  setTimeout(function(){
    var svc=document.getElementById('f-svc');
    if(svc){ svc.value='Furniture Pickup'; svc.dispatchEvent(new Event('change')); }
    setTimeout(function(){
      Object.keys(qtys).forEach(function(i){
        var el=document.getElementById('drd-qty-'+i);
        if(el){el.value=qtys[i];}
      });
      if(typeof drdRecalc==='function') drdRecalc();
    },300);
  },100);
}
