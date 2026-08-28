/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE OVERHAUL — the small amount of behaviour the phone layout needs.

   Everything here is layout plumbing: collapse toggles, the filters sheet, and
   the one-line summaries that read their numbers back out of what the existing
   dashboard renderers already painted. No data is fetched here and nothing is
   written; if this file failed to load the dashboard would still be correct,
   just not folded up.

   Loaded after app.js, so newJob/setFormSvc/todayStr are already defined.
   ═══════════════════════════════════════════════════════════════════════════ */

// Several pages choose between their desktop and phone layout at render time,
// so crossing the breakpoint has to re-render the page that is showing. This
// fires on the crossing itself, not on every pixel of a resize.
window.matchMedia('(max-width:900px)').addEventListener('change', function(){
  if(typeof refresh === 'function') refresh();
});

// ─── Create sheet: the two bookings that were desktop-only ─────────────────
// Same booking modal the desktop "New Job" opens, with the service preselected.
function mCreateBinRental(){ mCloseCreate(); newJob(); setFormSvc('Bin Rental'); }
function mCreateJunkRemoval(){ mCloseCreate(); newJob(); setFormSvc('Junk Removal'); }

// ─── Collapsed dashboard cards ─────────────────────────────────────────────
function mToggleCollapse(id){
  var el = document.getElementById(id);
  if(!el) throw new Error('mToggleCollapse: no element #'+id);
  el.classList.toggle('m-open');
}

// ─── Phone jump chips ──────────────────────────────────────────────────────
function mJump(id, btn){
  var el = document.getElementById(id);
  if(!el) return;                      // that section has nothing on this day
  el.scrollIntoView({behavior:'smooth', block:'start'});
  document.querySelectorAll('.mseg').forEach(function(b){ b.classList.toggle('is-active', b===btn); });
}

// ─── Filters bottom sheet ──────────────────────────────────────────────────
// The pile is the same DOM the desktop uses — CSS moves it to the bottom of
// the screen, nothing is cloned or re-rendered, so every handler still works.
var _mOpenPile = null;
function mOpenFilters(pileId){
  var pile = document.getElementById(pileId);
  if(!pile) throw new Error('mOpenFilters: no pile #'+pileId);
  mCloseFilters();
  _mOpenPile = pile;
  pile.classList.add('open');
  document.getElementById('mfilter-backdrop').classList.add('open');
}
function mCloseFilters(){
  if(_mOpenPile){ _mOpenPile.classList.remove('open'); mSyncFilterCount(_mOpenPile); _mOpenPile = null; }
  document.getElementById('mfilter-backdrop').classList.remove('open');
}

// How many filters are away from their default, for the badge on the button.
// A group's default is its first tab; a select's default is its empty option.
function mSyncFilterCount(pile){
  var n = 0;
  pile.querySelectorAll('.atabs-track, #jobs-show-seg').forEach(function(track){
    var btns = track.children, first = true;
    for(var i=0;i<btns.length;i++){
      if(btns[i].classList.contains('active')){ if(!first) n++; break; }
      first = false;
    }
  });
  pile.querySelectorAll('select').forEach(function(s){ if(s.value) n++; });
  var badge = document.getElementById(pile.id+'-count');
  if(badge){ badge.textContent = n; badge.classList.toggle('on', n>0); }
}

// Anything tapped or changed inside a sheet re-counts it, so the badge on the
// button is right the moment the sheet closes.
document.addEventListener('click', _mFilterTouched);
document.addEventListener('change', _mFilterTouched);
function _mFilterTouched(e){
  var pile = e.target.closest && e.target.closest('.mfilter-pile');
  if(pile) setTimeout(function(){ mSyncFilterCount(pile); }, 0);
}

// ─── Dashboard one-line summaries ──────────────────────────────────────────
// Read back from what the renderers painted, so these can never disagree with
// the cards they fold up.
function mSyncBinSummary(){
  var host = document.getElementById('dash-bin-by-size');
  var out  = document.getElementById('mbins-summary');
  if(!host || !out) return;
  var sizes = ['4','7','14','20'];
  var parts = [];
  host.querySelectorAll('[data-bincount]').forEach(function(el, i){
    parts.push((sizes[i]||'?')+'yd '+el.getAttribute('data-bincount'));
  });
  var hdr = document.getElementById('dash-binavail-hdr');
  out.textContent = (hdr ? hdr.textContent : 'Bins available')
    + (parts.length ? ' — '+parts.join(' · ') : '');
}

function mSyncCrewSummary(){
  var crew = document.getElementById('dash-crew-status');
  var out  = document.getElementById('mcrew-summary');
  if(!crew || !out) return;
  var total = 0, free = 0;
  crew.querySelectorAll('[title]').forEach(function(el){
    total++;
    if(el.getAttribute('title').indexOf('· Available ·') !== -1) free++;
  });
  var vehicles = document.getElementById('dash-vehicle-status');
  var vCount = vehicles ? vehicles.children.length : 0;
  out.textContent = total
    ? 'Crew — '+free+' of '+total+' available · '+vCount+' vehicle'+(vCount===1?'':'s')
    : 'Crew & vehicles';
}

// The green day card and the jump-chip badges. Called by refreshDashJobs with
// the counts it has just worked out, so nothing is counted twice.
function mSetDaySummary(c){
  var dateEl = document.getElementById('mday-date');
  if(dateEl){
    var lbl = document.getElementById('dash-date-label');
    var isToday = (function(){ var dp=document.getElementById('dash-bin-date'); return !dp||!dp.value||dp.value===todayStr(); })();
    dateEl.textContent = (isToday ? 'Today · ' : '') + (lbl ? lbl.textContent : '');
  }
  var junk = (c.junkRemovals||0) + (c.junkQuotes||0) + (c.landscaping||0);
  var total = (c.dropoffs||0)+(c.pickups||0)+junk+(c.furniture||0);
  var totalEl = document.getElementById('mday-total');
  if(totalEl) totalEl.textContent = total ? (total+' job'+(total===1?'':'s')) : 'Nothing booked';

  var chips = [];
  function chip(n, label){ if(n) chips.push('<span><b>'+n+'</b> '+label+'</span>'); }
  chip(c.dropoffs,'drop'+(c.dropoffs===1?'':'s'));
  chip(c.pickups,'pickup'+(c.pickups===1?'':'s'));
  chip(junk,'junk');
  chip(c.furniture,'furniture');
  chip(c.calls,'to call');
  chip(c.emails,'to email');
  var countsEl = document.getElementById('mday-counts');
  if(countsEl) countsEl.innerHTML = chips.join('');

  mSetJumpBadge('mjb-drops', c.dropoffs||0);
  mSetJumpBadge('mjb-pickups', c.pickups||0);
  mSetJumpBadge('mjb-junk', junk);
  var ny = document.getElementById('dash-needs-you');
  mSetJumpBadge('mjb-needs', ny ? (parseInt(ny.getAttribute('data-count'),10)||0) : 0);
  var booked = document.getElementById('jb-booked');
  mSetJumpBadge('mjb-entered', booked ? (parseInt(booked.textContent,10)||0) : 0);
}
function mSetJumpBadge(id, n){
  var el = document.getElementById(id);
  if(!el) return;
  el.textContent = n;
  if(el.parentElement) el.parentElement.classList.toggle('is-empty', n===0);
}

/* ─── Bin Pricing on a phone: town first ───────────────────────────────────
   The desktop sheet is a nine-column grid of every town against every size —
   on a phone that squeezes to nothing. Same sheet, same math, walked in the
   order the phone call actually goes: which town, then which bin, then the
   quote. The quote itself is the desktop's own Quote Builder (renderPricingRail
   off _pvSel), so the two surfaces can never read different numbers out to the
   same customer. The Margin Console stays desktop-only. */
var _pvmStage  = 'towns';
var _pvmSearch = '';

function pvmGo(stage){ _pvmStage = stage; renderPricingMobile(); }
function pvmSearch(v){ _pvmSearch = String(v||'').toLowerCase(); renderPricingMobile(); }

function pvmPickTown(area, town){
  _pvSel.area = area; _pvSel.town = town;
  pvmGo('prices');
}
function pvmPickSize(sz){
  _pvSel.size = sz;
  _pvmStage = 'quote';
  renderPricingRail();
  renderPricingMobile();
}

function renderPricingMobile(){
  var host = document.getElementById('pv-mobile');
  if(!host) return;
  document.getElementById('view-pricing').classList.toggle('pvm-quote', _pvmStage==='quote');
  if(!isMobileView()){ host.innerHTML=''; return; }

  var rows = pvAllRows();
  if(!rows.length){
    host.innerHTML = '<div class="pvm-empty">No pricing areas yet — add one in Edit Our Prices.</div>';
    return;
  }

  if(_pvmStage==='towns'){
    var list = rows.filter(function(r){
      return !_pvmSearch || String(r.town).toLowerCase().indexOf(_pvmSearch)!==-1;
    }).sort(function(a,b){ return String(a.town).localeCompare(String(b.town)); });
    host.innerHTML = '<div class="pvm-head"><span>Pick the town</span></div>'
      + '<input class="pvm-search" type="text" placeholder="Search towns…" value="'+_pvEsc(_pvmSearch)+'" oninput="pvmSearch(this.value)">'
      + (list.length
          ? '<div class="pvm-list">'+list.map(_pvmTownRow).join('')+'</div>'
          : '<div class="pvm-empty">No town matches that.</div>');
    return;
  }

  var r = rows.find(function(x){ return x.area===_pvSel.area && x.town===_pvSel.town; });
  if(!r){ pvmGo('towns'); return; }

  if(_pvmStage==='prices'){
    var priced = PV_TABLE_SIZES.filter(function(s){ return parseFloat(r.bins[s])>0; });
    host.innerHTML = _pvmBack('towns', r.town, r.zone)
      + (priced.length
          ? '<div class="pvm-list">'+priced.map(function(sz){ return _pvmSizeRow(r, sz); }).join('')+'</div>'
          : '<div class="pvm-empty">No bin prices set for '+_pvEsc(r.town)+' yet — add them in Edit Our Prices.</div>');
    return;
  }

  // quote — the card itself is #pv-rail-host, which the phone CSS only shows here
  host.innerHTML = _pvmBack('prices', _pvSizeLabel(_pvSel.size)+' bin · '+r.town, r.zone);
}

function _pvmBack(stage, title, zone){
  return '<div class="pvm-head">'
    + '<button type="button" class="pvm-back" onclick="pvmGo(\''+stage+'\')">‹ Back</button>'
    + '<span class="pvm-head-t">'+_pvEsc(title)+'</span>'
    + (zone?'<span class="pvm-head-z">'+_pvEsc(_pvZoneLabel(zone))+'</span>':'')
    + '</div>';
}

function _pvmTownRow(r){
  var base  = parseFloat(r.bins['14 yard']);
  var allIn = base>0 ? pvCalcAllIn(base, '14 yard', r.tonne) : null;
  return '<button type="button" class="pvm-row" onclick="pvmPickTown(\''+_pvArg(r.area)+'\',\''+_pvArg(r.town)+'\')">'
    + '<span class="pvm-row-main">'
      + '<span class="pvm-row-t">'+_pvEsc(r.town)+'</span>'
      + (r.zone?'<span class="pvm-row-s">'+_pvEsc(_pvZoneLabel(r.zone))+'</span>':'')
    + '</span>'
    + '<span class="pvm-row-p">'+(allIn?pvFmtR(allIn):'—')+'<em>'+(allIn?'14yd all-in':'no 14yd price')+'</em></span>'
    + '</button>';
}

function _pvmSizeRow(r, sz){
  var base  = parseFloat(r.bins[sz]);
  var allIn = pvCalcAllIn(base, sz, r.tonne);
  var head  = PV_TABLE_HEADS[sz] || [sz,''];
  return '<button type="button" class="pvm-row pv-g-'+(PV_SIZE_GROUP[sz]||'week')+'" onclick="pvmPickSize(\''+_pvArg(sz)+'\')">'
    + '<span class="pvm-row-main">'
      + '<span class="pvm-row-t">'+_pvEsc(head[0])+'</span>'
      + '<span class="pvm-row-s">'+_pvEsc(head[1])+'</span>'
    + '</span>'
    + '<span class="pvm-row-p">'+pvFmtR(allIn)+'<em>$'+base+' before tax</em></span>'
    + '</button>';
}
