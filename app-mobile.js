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
