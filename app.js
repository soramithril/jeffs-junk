// ═══════════════════════════════════════
//  SUPABASE CONNECTION
// ═══════════════════════════════════════
var SUPABASE_URL = 'https://okoqzbdyfjfgcdgmcamq.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rb3F6YmR5ZmpmZ2NkZ21jYW1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NDYyNzEsImV4cCI6MjA4ODIyMjI3MX0.SQQD5HN2h179Lsqb-gxqnuTZcIXUyxrtmBP6VLOO57w';
var db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Phone number auto-formatting (705-555-5555) ──────────────────────────
function formatPhoneInput(e) {
  var input = e.target;
  var digits = input.value.replace(/\D/g, '');
  // Cap at 11 digits (1 + area + number)
  if (digits.length > 11) digits = digits.slice(0, 11);
  var formatted = '';
  if (digits.length <= 3) {
    formatted = digits;
  } else if (digits.length <= 6) {
    formatted = digits.slice(0, 3) + '-' + digits.slice(3);
  } else if (digits.length <= 10) {
    formatted = digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
  } else {
    // 11 digits: 1-705-555-5555
    formatted = digits.slice(0, 1) + '-' + digits.slice(1, 4) + '-' + digits.slice(4, 7) + '-' + digits.slice(7);
  }
  var pos = input.selectionStart;
  var oldLen = input.value.length;
  input.value = formatted;
  // Keep cursor in a reasonable spot
  var newLen = formatted.length;
  input.setSelectionRange(pos + (newLen - oldLen), pos + (newLen - oldLen));
}
// Attach to all current and future phone inputs via event delegation
document.addEventListener('input', function(e) {
  if (e.target.classList.contains('c-phone-inp') ||
      e.target.classList.contains('f-phone-inp') ||
      e.target.id === 'drd-phone') {
    formatPhoneInput(e);
  }
});

// ── Real-Time Updates ─────────────────────────────────────────────────────
// Auto-refresh dashboard when other users make changes, without disrupting
// a user who is mid-action (modal open, input focused, etc.)
var _rtDebounce = null;
function _isUserBusy(){
  // Don't refresh if a modal is open or an input/textarea/select is focused
  if(document.querySelector('.modal-overlay.open')) return true;
  var ae = document.activeElement;
  if(ae && (ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.tagName==='SELECT')) return true;
  return false;
}
function _scheduleRealtimeRefresh(){
  clearTimeout(_rtDebounce);
  _rtDebounce = setTimeout(async function(){
    if(_isUserBusy()){
      _scheduleRealtimeRefresh();
      return;
    }
    _clientStatsCacheTime = 0;
    // Reload binItems so deployed-bin counts stay in sync
    var rb = await db.from('bin_items').select('*');
    if(rb.data) binItems = rb.data;
    refresh();
  }, 1500);
}
db.channel('realtime-all')
  .on('postgres_changes', {event:'*', schema:'public', table:'jobs'}, _scheduleRealtimeRefresh)
  .on('postgres_changes', {event:'*', schema:'public', table:'clients'}, _scheduleRealtimeRefresh)
  .on('postgres_changes', {event:'*', schema:'public', table:'bin_items'}, _scheduleRealtimeRefresh)
  .subscribe();

// ── Bin Drop/Pickup Notification Banner ──
var _suppressBinNotify = false;
db.channel('bin-status-notify')
  .on('postgres_changes', {event:'UPDATE', schema:'public', table:'jobs', filter:'service=eq.Bin Rental'}, function(payload){
    if(_suppressBinNotify) return;
    var newRow=payload.new, oldRow=payload.old;
    if(!newRow||!oldRow) return;
    var newStatus=newRow.bin_instatus||'';
    var oldStatus=oldRow.bin_instatus||'';
    if(newStatus===oldStatus) return;
    if(newStatus!=='dropped'&&newStatus!=='pickedup') return;
    // Skip shop address — truck traffic there is constant and not real drops/pickups
    if((newRow.address||'').toLowerCase().indexOf('92 davidson')!==-1) return;
    showBinNotify(newStatus, newRow.name||'Unknown', newRow.bin_bid||'', newRow.address||'', newRow.city||'', newRow.job_id||'');
  })
  .subscribe();

var _binNotifyQueue=[];
var _binNotifyShowing=false;
function showBinNotify(status, name, binBid, addr, city, jobId){
  _binNotifyQueue.push({status:status,name:name,binBid:binBid,addr:addr,city:city,jobId:jobId});
  if(!_binNotifyShowing) _showNextBinNotify();
}
function _showNextBinNotify(){
  if(!_binNotifyQueue.length){_binNotifyShowing=false;return;}
  _binNotifyShowing=true;
  var n=_binNotifyQueue.shift();
  var overlay=document.getElementById('bin-notify-overlay');
  var modal=document.getElementById('bin-notify-modal');
  var icon=document.getElementById('bn-icon');
  var title=document.getElementById('bn-title');
  var sub=document.getElementById('bn-sub');
  if(!overlay)return;
  var isDropped=n.status==='dropped';
  modal.className='bin-notify-modal '+(isDropped?'dropped':'pickedup');
  icon.textContent=isDropped?'📦':'🚛';
  var binLabel=n.binBid||'Bin';
  var binObj=binItems.find(function(b){return b.bid===n.binBid;});
  if(binObj) binLabel=binObj.num+(binObj.size?' · '+binObj.size:'');
  title.textContent=isDropped?'Bin Dropped Off — '+binLabel:'Bin Picked Up — '+binLabel;
  var location=(n.addr||'').split(',')[0];
  if(n.city&&location) location+=' · '+n.city;
  sub.textContent=n.name+(location?' — '+location:'');
  overlay.dataset.jobId=n.jobId||'';
  // Show assign bin button on drop when no bin assigned
  var assignBtn=document.getElementById('bn-assign');
  if(assignBtn){
    if(isDropped&&!n.binBid&&n.jobId){assignBtn.style.display='';assignBtn.onclick=function(){dismissBinNotify(true);openAssignBinPicker(n.jobId);};}
    else{assignBtn.style.display='none';}
  }
  overlay.classList.add('show');
}
function dismissBinNotify(skipOpen){
  var overlay=document.getElementById('bin-notify-overlay');
  if(!overlay)return;
  var jobId=overlay.dataset.jobId;
  overlay.classList.remove('show');
  if(!skipOpen&&jobId)openDetail(jobId);
  setTimeout(function(){_showNextBinNotify();},300);
}

// ── Notification History Panel ──

var _notifItems = [];
var _notifLastSeen = localStorage.getItem('notif-last-seen') || '2000-01-01T00:00:00Z';

function toggleNotifPanel(){
  var panel = document.getElementById('notif-panel');
  panel.classList.toggle('open');
  if(panel.classList.contains('open')){
    // Mark all as seen
    _notifLastSeen = new Date().toISOString();
    localStorage.setItem('notif-last-seen', _notifLastSeen);
    updateNotifBadge();
  }
}

// Close panel when clicking outside
document.addEventListener('click', function(e){
  var wrap = document.getElementById('notif-wrap');
  var panel = document.getElementById('notif-panel');
  if(wrap && panel && !wrap.contains(e.target)){
    panel.classList.remove('open');
  }
});

function updateNotifBadge(){
  var badge = document.getElementById('notif-badge');
  if(!badge) return;
  var unseen = _notifItems.filter(function(n){ return n.created_at > _notifLastSeen; }).length;
  badge.textContent = unseen > 99 ? '99+' : String(unseen);
  badge.classList.toggle('has', unseen > 0);
}

function renderNotifList(){
  var list = document.getElementById('notif-list');
  if(!list) return;
  if(!_notifItems.length){
    list.innerHTML = '<div class="notif-empty">No recent notifications</div>';
    updateNotifBadge();
    return;
  }
  list.innerHTML = _notifItems.map(function(n){
    var isDropped = n.status === 'dropped';
    var icon = isDropped ? '📦' : '🚛';
    var label = isDropped ? 'Bin Dropped Off' : 'Bin Picked Up';
    var binLabel = n.bin_bid || '';
    var bi = binItems.find(function(b){ return b.bid === n.bin_bid; });
    if(bi) binLabel = bi.num + (bi.size ? ' · ' + bi.size : '');
    if(binLabel) label += ' — ' + binLabel;
    var loc = (n.address || '').split(',')[0];
    if(n.city && loc) loc += ' · ' + n.city;
    var sub = (n.customer_name || 'Unknown') + (loc ? ' — ' + loc : '');
    var ago = timeAgo(n.created_at);
    var unread = n.created_at > _notifLastSeen ? ' unread' : '';
    return '<div class="notif-item' + unread + '" onclick="openDetail(\'' + n.job_id + '\');document.getElementById(\'notif-panel\').classList.remove(\'open\');">'
      + '<span class="ni-icon">' + icon + '</span>'
      + '<div class="ni-body"><div class="ni-title">' + label + '</div><div class="ni-sub">' + sub + '</div></div>'
      + '<span class="ni-time">' + ago + '</span>'
      + '</div>';
  }).join('');
  updateNotifBadge();
}

function timeAgo(iso){
  var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if(diff < 60) return 'Just now';
  if(diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if(diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function clearNotifPanel(){
  _notifItems = [];
  renderNotifList();
}

// Load notification history on startup (last 48 hours)
(async function loadNotifHistory(){
  var cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  var { data } = await db.from('geofence_notifications').select('*').gte('created_at', cutoff).order('created_at', { ascending: false }).limit(50);
  if(data && data.length){
    _notifItems = data.filter(function(n){return (n.address||'').toLowerCase().indexOf('92 davidson')===-1;});
    renderNotifList();
  }
})();

// Subscribe to new notifications in realtime
db.channel('notif-history')
  .on('postgres_changes', {event:'INSERT', schema:'public', table:'geofence_notifications'}, function(payload){
    if((payload.new.address||'').toLowerCase().indexOf('92 davidson')!==-1) return;
    _notifItems.unshift(payload.new);
    if(_notifItems.length > 50) _notifItems.pop();
    renderNotifList();
  })
  .subscribe();

// ── Address Autocomplete (Nominatim / OpenStreetMap — free, no key needed) ──

var _acDebounceTimers = {};
var _acActiveIdx = {};
// Location bias for address autocomplete — Barrie, ON as fallback
var _acLat = 44.3894;
var _acLon = -79.6903;
(function() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      _acLat = pos.coords.latitude;
      _acLon = pos.coords.longitude;
    }, function(){}, { timeout: 5000 });
  }
})();

function attachAddressAutocomplete(inputEl, onPick) {
  if (!inputEl || inputEl._acAttached) return;
  inputEl._acAttached = true;
  inputEl.setAttribute('autocomplete', 'off');

  // Wrap in relative container so dropdown positions correctly
  var parent = inputEl.parentNode;
  var wrap = document.createElement('div');
  wrap.className = 'addr-ac-wrap';
  wrap.style.cssText = 'position:relative;width:100%';
  parent.insertBefore(wrap, inputEl);
  wrap.appendChild(inputEl);

  var dropdown = document.createElement('div');
  dropdown.className = 'addr-ac-dropdown';
  dropdown.style.display = 'none';
  wrap.appendChild(dropdown);

  var uid = 'ac_' + Math.random().toString(36).slice(2);
  _acActiveIdx[uid] = -1;

  function showLoading() {
    dropdown.innerHTML = '<div class="addr-ac-loading">Searching…</div>';
    dropdown.style.display = 'block';
  }
  function hideDropdown() {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
    _acActiveIdx[uid] = -1;
  }
  function renderResults(results) {
    if (!results || !results.length) { hideDropdown(); return; }
    dropdown.innerHTML = '';
    _acActiveIdx[uid] = -1;
    results.slice(0, 7).forEach(function(r, i) {
      var item = document.createElement('div');
      item.className = 'addr-ac-item';
      // Build a nice display: bold the street part, muted the rest
      var parts = (r.display_name || '').split(',');
      var main = (parts[0] || '').trim();
      var rest = parts.slice(1, 4).map(function(p){ return p.trim(); }).filter(Boolean).join(', ');
      item.innerHTML = '<strong>' + main + '</strong>' + (rest ? ' <span style="color:#94a3b8;font-size:12px">' + rest + '</span>' : '');
      item.addEventListener('mousedown', function(e) {
        e.preventDefault();
        var street = _extractStreet(r);
        var city   = _extractCity(r);
        inputEl.value = street;
        hideDropdown();
        if (onPick) onPick(street, city);
      });
      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
  }

  inputEl.addEventListener('input', function() {
    var q = inputEl.value.trim();
    clearTimeout(_acDebounceTimers[uid]);
    if (q.length < 4) { hideDropdown(); return; }
    _acDebounceTimers[uid] = setTimeout(function() {
      showLoading();
      // Viewbox biases results toward current location (±0.5 deg ≈ ~55km radius)
      var vb = (_acLon-0.5)+','+(_acLat+0.5)+','+(_acLon+0.5)+','+(_acLat-0.5);
      var url = 'https://nominatim.openstreetmap.org/search'
        + '?q=' + encodeURIComponent(q + ', Ontario, Canada')
        + '&format=json&addressdetails=1&limit=7&countrycodes=ca'
        + '&viewbox=' + vb + '&bounded=0';
      fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'JeffsJunkJobTracker/1.0' } })
        .then(function(res){ return res.json(); })
        .then(renderResults)
        .catch(function(){ hideDropdown(); });
    }, 350);
  });

  // Keyboard navigation
  inputEl.addEventListener('keydown', function(e) {
    var items = dropdown.querySelectorAll('.addr-ac-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _acActiveIdx[uid] = Math.min(_acActiveIdx[uid] + 1, items.length - 1);
      items.forEach(function(it, i){ it.classList.toggle('active', i === _acActiveIdx[uid]); });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _acActiveIdx[uid] = Math.max(_acActiveIdx[uid] - 1, 0);
      items.forEach(function(it, i){ it.classList.toggle('active', i === _acActiveIdx[uid]); });
    } else if (e.key === 'Enter' && _acActiveIdx[uid] >= 0) {
      e.preventDefault();
      items[_acActiveIdx[uid]].dispatchEvent(new MouseEvent('mousedown'));
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  });

  inputEl.addEventListener('blur', function() {
    setTimeout(hideDropdown, 180);
  });
}

function _extractStreet(r) {
  var a = r.address || {};
  var num  = a.house_number || '';
  var road = a.road || a.pedestrian || a.path || '';
  if (num && road) return num + ' ' + road;
  if (road) return road;
  // fallback: first part of display_name
  return (r.display_name || '').split(',')[0].trim();
}

function _extractCity(r) {
  var a = r.address || {};
  return a.city || a.town || a.village || a.municipality || a.county || '';
}

function _initStaticAddressAutocomplete() {
  // Job form: f-addr + f-city
  var fAddr = document.getElementById('f-addr');
  var fCity = document.getElementById('f-city');
  if (fAddr) {
    attachAddressAutocomplete(fAddr, function(street, city) {
      fAddr.value = street;
      if (fCity && city) { fCity.value = city; clearErr('f-city'); }
    });
  }
  // Donation receipt: drd-addr + drd-city
  var drdAddr = document.getElementById('drd-addr');
  var drdCity = document.getElementById('drd-city');
  if (drdAddr) {
    attachAddressAutocomplete(drdAddr, function(street, city) {
      drdAddr.value = street;
      if (drdCity && city) drdCity.value = city;
    });
  }
}
// ── Title Case helper ──────────────────────────────────────────────────────
// ── Background job phone backfill (runs once on startup) ──────────────────
async function backfillJobPhones() {
  try {
    // Fetch all unlinked jobs in one go
    var allUnlinked = [];
    var pg = 0;
    while (true) {
      var r = await db.from('jobs').select('job_id,name').is('client_cid',null).not('name','is',null).range(pg*1000, pg*1000+999);
      if (!r.data || !r.data.length) break;
      allUnlinked = allUnlinked.concat(r.data);
      if (r.data.length < 1000) break;
      pg++;
    }
    if (!allUnlinked.length) return;
    var fixed = 0;
    for (var i = 0; i < allUnlinked.length; i++) {
      var j = allUnlinked[i];
      if (!j.name) continue;
      var rc = await db.from('clients').select('cid,phone').ilike('name', j.name.trim()).limit(1);
      if (!rc.error && rc.data && rc.data[0]) {
        var upd = { client_cid: rc.data[0].cid };
        if (rc.data[0].phone) upd.phone = rc.data[0].phone;
        await db.from('jobs').update(upd).eq('job_id', j.job_id);
        fixed++;
      }
    }
    if (fixed > 0) console.log('[backfill] Fixed ' + fixed + ' jobs with missing phone/client_cid');
  } catch(e) { console.warn('[backfill] error:', e); }
}

function toTitleCase(str) {
  if (!str) return str;
  var small = /^(a|an|and|as|at|but|by|for|if|in|nor|of|on|or|so|the|to|up|yet)$/i;
  return str.replace(/\S+/g, function(word, offset) {
    if (offset === 0) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    if (small.test(word)) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

// ═══════════════════════════════════════
//  DATA
// ═══════════════════════════════════════
var jobs = [];
var vehicles = [];
var vehBlocks = {};
var binItems = [];
var clients = [];
var crewMembers = [];
var vehicleAssignments = {}; // { vid: [{id, crewMemberId, name}] } for today
var geoCache = {};
try { geoCache = JSON.parse(localStorage.getItem('jj-geo') || '{}'); } catch(e){}

var editId = null, editBinId = null;
var calDate = new Date();
var svcF = 'all', searchF = '', invF = 'all', jobStatusF = 'all', jobDateF = 'all', binDropF = 'all';
var jobSort = 'date', jobSortDir = -1; // -1 = newest first
var weekOffset = 0, tlOffset = 0;
var analyticsPeriod = 'week', analyticsCompare = 'none';
var clientSearchF = '';
var fleetF = 'all', fleetQ = '', fleetSort = 'num', fleetSortDir = 1;
var sizeOrder = {'4 yard':0,'7 yard':1,'14 yard':2,'20 yard':3};

// ── Map Supabase DB row → local job object ─────────────────
function dbToJob(r) {
  return {
    id:         r.job_id,
    service:    r.service,
    status:     r.status     || 'Pending',
    name:       r.name       || '',
    phone:      r.phone      || '',
    address:    r.address    || '',
    city:       r.city       || '',
    date:       r.date       || '',
    time:       r.time       || '',
    price:      r.price != null ? String(r.price) : '',
    paid:       r.paid       || 'Unpaid',
    notes:      r.notes      || '',
    referral:   r.referral   || '',
    confirmed:  r.confirmed  || false,
    emailSent:  r.email_sent || false,
    binSize:    r.bin_size   || '',
    binDuration:r.bin_duration || '',
    binDropoff: r.bin_dropoff || '',
    binPickup:  r.bin_pickup  || '',
    binInstatus:r.bin_instatus || '',
    binSide:    r.bin_side   || '',
    binBid:     r.bin_bid    || '',
    clientId:   r.client_cid || '',
    deposit:    r.deposit != null ? String(r.deposit) : '',
    depositPaid:r.deposit_paid || false,
    etransferRefundSent: r.etransfer_refund_sent || false,
    createdBy:      r.created_by       || '',
    editedBy:       r.edited_by        || '',
    createdByEmail: r.created_by_email || '',
    editedByEmail:  r.edited_by_email  || '',
    createdAt:      r.created_at       || '',
    updatedAt:      r.updated_at       || '',
    payMethod:      r.pay_method       || '',
    recurring:      r.recurring        || false,
    recurInterval:  r.recur_interval   || '',
    materialType: r.material_type || '',
    toolsNeeded: r.tools_needed || '',
    emailConfirmed: r.email_confirmed || false,
    swapCount: r.swap_count || 0,
  };
}

// ── Map Supabase DB row → local client object ──────────────
function dbToClient(r) {
  var street=(r.address||'').split(',')[0].trim();
  return {
    cid:      r.cid,
    name:     r.name    || '',
    names:    r.names   || [r.name || ''],
    phone:    r.phone   || '',
    phones:   r.phones  || [],
    email:    r.email   || '',
    emails:   r.emails  || [],
    address:  r.address || '',
    addresses:street?[{street:street,city:r.city||''}]:[],
    city:     r.city    || '',
    referral: r.referral || '',
    notes:    r.notes   || '',
    createdAt: r.created_at || '',
    blacklisted: r.blacklisted || false,
  };
}

// ── Map local job → Supabase DB row ───────────────────────
function jobToDb(j) {
  return {
    job_id:      j.id,
    service:     j.service     || 'Bin Rental',
    status:      j.status      || 'Pending',
    name:        j.name        || '',
    names:       j.names       || [],
    phone:       j.phone       || '',
    phones:      j.phones      || [],
    emails:      j.emails      || [],
    address:     j.address     || '',
    city:        j.city        || '',
    date:        j.date        || null,
    time:        j.time        || '',
    price:       j.price !== '' && j.price != null ? parseFloat(j.price) : null,
    paid:        j.paid        || 'Unpaid',
    notes:       j.notes       || '',
    referral:    j.referral    || '',
    confirmed:   j.confirmed   || false,
    email_sent:  j.emailSent   || false,
    bin_size:    j.binSize     || '',
    bin_duration:j.binDuration || '',
    bin_dropoff: j.binDropoff  || null,
    bin_pickup:  j.binPickup   || null,
    bin_instatus:j.binInstatus || '',
    bin_side:    j.binSide     || '',
    bin_bid:     j.binBid      || '',
    client_cid:  j.clientId    || '',
    deposit:     j.deposit !== '' && j.deposit != null ? parseFloat(j.deposit) : null,
    deposit_paid:j.depositPaid || false,
    etransfer_refund_sent: j.etransferRefundSent || false,
    created_by:       j.createdBy       || null,
    edited_by:        j.editedBy        || null,
    created_by_email: j.createdByEmail  || null,
    edited_by_email:  j.editedByEmail   || null,
    pay_method:       j.payMethod       || '',
    recurring:        j.recurring       || false,
    recur_interval:   j.recurInterval   || '',
    material_type: j.materialType || '',
    tools_needed: j.toolsNeeded || '',
    email_confirmed: j.emailConfirmed || false,
    swap_count: j.swapCount || 0,
  };
}

// ── Map local client → Supabase DB row ────────────────────
function clientToDb(c) {
  return {
    cid:      c.cid,
    name:     c.name    || '',
    names:    c.names   || [c.name || ''],
    phone:    c.phone   || '',
    phones:   c.phones  || [],
    email:    c.email   || '',
    emails:   c.emails  || [],
    address:  c.address || '',
    addresses: c.addresses || [],
    city:     c.city    || '',
    referral: c.referral || '',
    notes:    c.notes   || '',
    blacklisted: c.blacklisted || false,
  };
}

// ── Save functions (write to Supabase) ─────────────────────
function updateSidebarStats() {
  var active = jobs.filter(function(j){ return j.status !== 'Cancelled' && j.status !== 'Done'; }).length;
  var binsOut = jobs.filter(function(j){ return j.service === 'Bin Rental' && j.binInstatus === 'dropped'; }).length;
  var el = document.getElementById('m-active'); if(el) el.textContent = active;
  var el2 = document.getElementById('m-bins'); if(el2) el2.textContent = binsOut;
}
function save() {
  // DEPRECATED — kept as no-op so nothing breaks if called by accident
  console.warn('save() called — this is a no-op now. Use patchJob() instead.');
  updateSidebarStats();
}

// Surgical update: only writes the fields you pass for one job
function patchJob(jobId, fields) {
  _clientStatsCache = null;
  updateSidebarStats();
  // Map camelCase JS keys to snake_case DB columns
  var keyMap = {confirmed:'confirmed', emailSent:'email_sent', emailConfirmed:'email_confirmed',
    status:'status', binInstatus:'bin_instatus', date:'date', binPickup:'bin_pickup',
    binDropoff:'bin_dropoff', paid:'paid', etransferRefundSent:'etransfer_refund_sent',
    binBid:'bin_bid', binSide:'bin_side', price:'price', notes:'notes', phone:'phone',
    name:'name', address:'address', city:'city', service:'service', binSize:'bin_size',
    binDuration:'bin_duration', time:'time', referral:'referral', payMethod:'pay_method',
    recurring:'recurring', recurInterval:'recur_interval', materialType:'material_type',
    toolsNeeded:'tools_needed', swapCount:'swap_count', deposit:'deposit',
    depositPaid:'deposit_paid', editedBy:'edited_by', editedByEmail:'edited_by_email',
    clientId:'client_cid'};
  var dbFields = {};
  Object.keys(fields).forEach(function(k){
    var col = keyMap[k] || k;
    dbFields[col] = fields[k];
  });
  db.from('jobs').update(dbFields).eq('job_id', jobId).then(function(r){
    if(r.error) console.error('patchJob error ('+jobId+'):', r.error.message);
  });
}

function saveSingleJob(j) {
  _clientStatsCache = null; // invalidate client stats cache
  db.from('jobs').upsert(jobToDb(j), {onConflict:'job_id'}).then(function(r){
    if(r.error) console.error('Save job error:', r.error.message);
  });
}

function deleteJobFromDb(jobId) {
  db.from('jobs').delete().eq('job_id', jobId).then(function(r){
    if(r.error) console.error('Delete job error:', r.error.message);
  });
}

function saveClients() {
  if (!clients.length) return;
  var batch = clients.map(clientToDb);
  db.from('clients').upsert(batch, {onConflict:'cid'}).then(function(r){
    if(r.error) console.error('Save clients error:', r.error.message);
  });
}

function saveSingleClient(c) {
  db.from('clients').upsert(clientToDb(c), {onConflict:'cid'}).then(function(r){
    if(r.error) console.error('Save client error:', r.error.message);
  });
}

function deleteClientFromDb(cid) {
  db.from('clients').delete().eq('cid', cid).then(function(r){
    if(r.error) console.error('Delete client error:', r.error.message);
  });
}

function delClient(cid) {
  if(!confirm('Delete this client? This cannot be undone.')) return;
  clients = clients.filter(function(c){ return c.cid !== cid; });
  deleteClientFromDb(cid);
  _clientStatsCache = null;
  closeM('client-detail-modal');
  toast('Client deleted.');
  loadClientsPage();
}

function saveBins() {
  if (!binItems.length) {
    db.from('bin_items').delete().neq('bid','__none__')
      .then(function(r){ if(r.error) { console.error('Clear bins error:', r.error.message); toast('⚠ Error clearing bins: ' + r.error.message); } });
    return;
  }
  // Save each bin individually so one bad row can't block the rest
  var saved = 0, errors = 0;
  binItems.forEach(function(bin) {
    var row = {
      bid: bin.bid,
      num: bin.num,
      type: bin.type || 'regular',
      size: bin.size || '14 yard',
      color: bin.color || 'green',
      damage: bin.damage || 'good',
      status: bin.status || 'in',
      notes: bin.notes || ''
    };
    db.from('bin_items').upsert(row, {onConflict:'bid'}).then(function(r){
      if (r.error) {
        errors++;
        console.error('Save bin error ('+bin.bid+'):', r.error.message);
        if (errors === 1) toast('⚠ DB error saving bin: ' + r.error.message);
      } else {
        saved++;
      }
    });
  });
  // Clean up deleted bins
  var keepIds = binItems.map(function(b){ return b.bid; });
  db.from('bin_items').select('bid').then(function(r){
    if (r.error || !r.data) return;
    r.data.forEach(function(row){
      if (keepIds.indexOf(row.bid) === -1) {
        db.from('bin_items').delete().eq('bid', row.bid).then(function(){});
      }
    });
  });
}

function saveVehicles() {
  // Sync vehicles to Supabase
  try {
    var rows = vehicles.map(function(v){
      return {vid:v.vid, name:v.name, type:v.type, color:v.color||'#22c55e', notes:v.notes||'', sticker_month:v.stickerMonth||null, sticker_year:v.stickerYear||null, oil_date:v.oilDate||null, oil_km:v.oilKm?parseInt(v.oilKm):null, oil_interval:v.oilInterval?parseInt(v.oilInterval):null, vehicle_status:v.vehicleStatus||'Available'};
    });
    if(rows.length) {
      db.from('vehicles').upsert(rows, {onConflict:'vid'}).then(function(r){
        if(r.error) console.warn('Vehicle sync failed:', r.error.message);
      });
    }
  } catch(e){ console.warn('Vehicle sync error:',e); }
}

function saveVehBlocks(vid) {
  // Sync all blocks for a vehicle to Supabase vehicle_blocks
  try {
    var blocks = vehBlocks[vid] || {};
    var dates = Object.keys(blocks);
    db.from('vehicle_blocks').delete().eq('vid', vid).then(function(r){
      if(r.error){ console.warn('vehBlocks delete failed:', r.error.message); return; }
      if(!dates.length) return;
      var rows = dates.map(function(d){
        return {vid:vid, date:d, reason:blocks[d].reason||'', notes:blocks[d].notes||'', open_ended:!!blocks[d].openEnded, open_from:blocks[d].openFrom||null};
      });
      db.from('vehicle_blocks').insert(rows).then(function(r2){
        if(r2.error) console.warn('vehBlocks insert failed:', r2.error.message);
      });
    });
  } catch(e){ console.warn('vehBlocks sync error:',e); }
}

/** Extend open-ended vehicle blocks to include today. Called on data load. */
function extendOpenBlocks(){
  var today=todayStr();
  var changed=[];
  Object.keys(vehBlocks).forEach(function(vid){
    var blocks=vehBlocks[vid];
    // Find the latest open-ended block for this vehicle
    var openDates=Object.keys(blocks).filter(function(d){return blocks[d].openEnded;}).sort();
    if(!openDates.length)return;
    var openFrom=blocks[openDates[0]].openFrom||openDates[0];
    var reason=blocks[openDates[0]].reason;
    var notes=blocks[openDates[0]].notes;
    // Fill in any missing days from openFrom to today
    var cur=new Date(openFrom+'T12:00:00');
    var end=new Date(today+'T12:00:00');
    var added=false;
    while(cur<=end){
      var ds=cur.toISOString().split('T')[0];
      if(!blocks[ds]){
        blocks[ds]={reason:reason,notes:notes,openEnded:true,openFrom:openFrom};
        added=true;
      }
      cur.setDate(cur.getDate()+1);
    }
    if(added)changed.push(vid);
  });
  changed.forEach(function(vid){saveVehBlocks(vid);});
}

function saveGeo() {
  try { localStorage.setItem('jj-geo', JSON.stringify(geoCache)); } catch(e){}
}

// ── Show loading overlay ───────────────────────────────────
function showLoading(msg, pct) {
  var el = document.getElementById('sb-loading');
  if (el) { el.style.display='flex'; }
  var msgEl = document.getElementById('sb-loading-msg');
  if (msgEl) msgEl.textContent = msg || 'Loading...';
  if (pct !== undefined) setLoadProgress(pct);
}
function setLoadProgress(pct) {
  var bar = document.getElementById('load-progress-bar');
  if (bar) bar.style.width = pct + '%';
}
function hideLoading() {
  setLoadProgress(100);
  setTimeout(function(){
    var el = document.getElementById('sb-loading');
    if (el) el.style.display='none';
    var f1Vid=document.getElementById('f1-bg-video');if(f1Vid){f1Vid.pause();f1Vid.removeAttribute('src');f1Vid.load();}
    setLoadProgress(0);
  }, 350);
}

// ── Pagination state ───────────────────────────────────────
var jobsPage = 0;
var jobsPageSize = 50;
var jobsTotal = 0;
var jobsLoading = false;

// ── Load ALL data from Supabase on startup ─────────────────
async function loadAllFromSupabase() {
  showLoading('Connecting...', 5);
  try {
    // Only load what the dashboard actually needs upfront:
    // 1. Job counts by status (for stat cards)
    showLoading('Loading jobs...', 15);
    var rcount = await db.from('jobs').select('*', {count:'exact', head:true});
    jobsTotal = rcount.count || 0;

    // 2. Today's jobs only
    showLoading("Loading today's schedule...", 30);
    var today = todayStr();
    var rtoday = await db.from('jobs').select('*').eq('date', today).order('time');
    var todayJobs = (rtoday.data || []).map(dbToJob);

    // 3. Most recent 20 jobs for the dashboard table
    showLoading('Loading recent jobs...', 45);
    var rrecent = await db.from('jobs').select('*').order('date', {ascending:false}).range(0, 19);
    var recentJobs = (rrecent.data || []).map(dbToJob);

    // Merge today + recent without duplicates
    var seen = {};
    jobs = [];
    todayJobs.concat(recentJobs).forEach(function(j) {
      if (!seen[j.id]) { seen[j.id] = true; jobs.push(j); }
    });

    // 4. Bins (small table, load all)
    showLoading('Loading bin inventory...', 60);
    var rb = await db.from('bin_items').select('*');
    binItems = rb.data || [];

    // Load vehicles + vehicle blocks from Supabase
    showLoading('Loading vehicles...', 75);
    try {
      var rveh = await db.from('vehicles').select('*').order('created_at');
      var rvehBlocks = await db.from('vehicle_blocks').select('*');
      if(!rveh.error && rveh.data) {
        vehicles = rveh.data.map(function(r){
          return {vid:r.vid, name:r.name, type:r.type, color:r.color||'#22c55e', notes:r.notes||'', active:true,
                  stickerMonth:r.sticker_month||'', stickerYear:r.sticker_year||'',
                  oilDate:r.oil_date||'', oilKm:r.oil_km?String(r.oil_km):'', oilInterval:r.oil_interval?String(r.oil_interval):'',
                  vehicleStatus:r.vehicle_status||'Available'};
        });
        vehBlocks = {};
        (rvehBlocks.data||[]).forEach(function(r){
          if(!vehBlocks[r.vid]) vehBlocks[r.vid] = {};
          vehBlocks[r.vid][r.date] = {reason:r.reason||'', notes:r.notes||'', openEnded:!!r.open_ended, openFrom:r.open_from||null};
        });
      }
    } catch(e) {
      console.warn('Vehicles load error:', e);
    }
    extendOpenBlocks();

    // Load crew members + today's vehicle assignments
    showLoading('Loading crew...', 80);
    try {
      var rCrew = await db.from('crew_members').select('*').eq('active', true).order('name');
      crewMembers = (rCrew.data || []).map(function(r){ return {id:r.id, name:r.name}; });
      var todayISO = todayStr();
      var rAssign = await db.from('vehicle_assignments').select('*').eq('assignment_date', todayISO);
      vehicleAssignments = {};
      (rAssign.data || []).forEach(function(r){
        if(!vehicleAssignments[r.vid]) vehicleAssignments[r.vid] = [];
        var crew = crewMembers.find(function(c){ return c.id === r.crew_member_id; });
        vehicleAssignments[r.vid].push({id:r.id, crewMemberId:r.crew_member_id, name:crew?crew.name:'Unknown'});
      });
    } catch(e){ console.warn('Crew/assignments load error:', e); }

    // Background-load ALL clients (Supabase caps at 1000 per request, so paginate)
    clients = [];
    try {
      var pageSize = 1000, from = 0, keepGoing = true;
      while (keepGoing) {
        var rcAll = await db.from('clients').select('*').order('name').range(from, from + pageSize - 1);
        if (rcAll.data && rcAll.data.length) {
          rcAll.data.forEach(function(c){ clients.push(dbToClient(c)); });
          from += rcAll.data.length;
          if (rcAll.data.length < pageSize) keepGoing = false;
        } else { keepGoing = false; }
      }
    } catch(e){ console.warn('Clients background load error:', e); }

    // Load competitors and our_prices from Supabase (authoritative source)
    showLoading('Loading pricing data...', 88);
    try {
      var rComps = await db.from('competitors').select('*').order('name');
      if(!rComps.error && rComps.data && rComps.data.length) {
        competitors = rComps.data.map(function(r){
          return {id:r.comp_id, name:r.name, website:r.website||'', area:r.area||'Default',
                  bins:r.bins||{}, junk:r.junk||{}, binFuel:r.bin_fuel!=null?String(r.bin_fuel):'', notes:r.notes||''};
        });
      }
    } catch(e){ console.warn('Competitors load error:',e); }

    try {
      var rPrices = await db.from('our_prices').select('*');
      if(!rPrices.error && rPrices.data && rPrices.data.length) {
        ourPricesV2 = {};
        rPrices.data.forEach(function(r){
          ourPricesV2[r.area||'Default'] = {bins:r.bins||{}, junk:r.junk||{}, binFuel:r.bin_fuel!=null?String(r.bin_fuel):'', binTonne:(r.bins&&r.bins._tonne!=null)?String(r.bins._tonne):'', towns:r.towns||''};
        });
        // Derive pricingAreas entirely from Supabase data — authoritative
        pricingAreas = Object.keys(ourPricesV2);
      }
    } catch(e){ console.warn('Our prices load error:',e); }

    // Load email presets from Supabase
    try {
      var rPresets = await db.from('email_presets').select('*');
      if(!rPresets.error && rPresets.data && rPresets.data.length) {
        rPresets.data.forEach(function(r){
          emailPresets[r.preset_key] = {subject:r.subject||'', body:r.body||''};
        });
      }
    } catch(e){ console.warn('Email presets load error:',e); }

    hideLoading();
    // ── Auto-mark bins as dropped/pickedup when dates have passed ──
    _suppressBinNotify = true;
    try {
      var today2 = todayStr();
      var pastDropJobs = await db.from('jobs').select('job_id,bin_bid')
        .eq('service','Bin Rental')
        .or('bin_instatus.is.null,bin_instatus.eq.')
        .not('bin_dropoff','is',null)
        .lte('bin_dropoff', today2);
      if (pastDropJobs.data && pastDropJobs.data.length) {
        var dropIds = pastDropJobs.data.map(function(r){return r.job_id;});
        await db.from('jobs').update({bin_instatus:'dropped',status:'In Progress'}).in('job_id',dropIds);
        var dropBids = pastDropJobs.data.map(function(r){return r.bin_bid;}).filter(function(b){return b;});
        if(dropBids.length) await db.from('bin_items').update({status:'out'}).in('bid',dropBids);
        binItems.forEach(function(b){ if(dropBids.indexOf(b.bid)>=0) b.status='out'; });
        jobs.forEach(function(j){
          if(j.service==='Bin Rental'&&j.binDropoff&&j.binDropoff<=today2&&(!j.binInstatus||j.binInstatus===''))
            { j.binInstatus='dropped'; j.status='In Progress'; }
        });
      }
      var pastBinJobs = await db.from('jobs').select('job_id,bin_bid')
        .eq('service','Bin Rental')
        .neq('bin_instatus','pickedup')
        .not('bin_pickup','is',null)
        .lt('bin_pickup', today2);
      if (pastBinJobs.data && pastBinJobs.data.length) {
        var ids = pastBinJobs.data.map(function(r){return r.job_id;});
        await db.from('jobs').update({bin_instatus:'pickedup'}).in('job_id',ids);
        var pickBids = pastBinJobs.data.map(function(r){return r.bin_bid;}).filter(function(b){return b;});
        if(pickBids.length) await db.from('bin_items').update({status:'in'}).in('bid',pickBids);
        binItems.forEach(function(b){ if(pickBids.indexOf(b.bid)>=0) b.status='in'; });
        jobs.forEach(function(j){
          if(j.service==='Bin Rental'&&j.binPickup&&j.binPickup<today2&&j.binInstatus!=='pickedup')
            j.binInstatus='pickedup';
        });
      }
    } catch(e){ console.warn('Auto-mark error:',e); }
    setTimeout(function(){ _suppressBinNotify = false; }, 5000);
    renderDash();
    initDashPricingDropdown();
    toast('✓ Dashboard ready');
    // Background: fix any jobs still missing phone/client_cid
    backfillJobPhones();

  } catch(e) {
    hideLoading();
    console.error('Load error:', e);
    toast('⚠ Could not load data from Supabase');
  }
}

// Load clients in small chunks without blocking UI

// ── Load a page of jobs from Supabase ──────────────────────
async function loadJobsPage(page) {
  if (jobsLoading) return;
  jobsLoading = true;
  jobsPage = page;
  var from = page * jobsPageSize;

  // Build query with current filters
  var query = db.from('jobs').select('*', {count:'exact'}).order('date', {ascending: false});

  // Apply search filter server-side
  if (searchF && searchF.trim()) {
    query = query.or('name.ilike.%' + searchF + '%,address.ilike.%' + searchF + '%,job_id.ilike.%' + searchF + '%,phone.ilike.%' + searchF + '%,city.ilike.%' + searchF + '%');
  }
  // Apply service filter
  if (svcF && svcF !== 'all') {
    query = query.eq('service', svcF);
  }
  // Apply status filter
  if (jobStatusF && jobStatusF !== 'all') {
    query = query.eq('status', jobStatusF);
  }

  query = query.range(from, from + jobsPageSize - 1);
  var r = await query;

  if (!r.error) {
    jobs = (r.data || []).map(dbToJob);
    jobsTotal = r.count || jobsTotal;

    // Fill missing phones using ilike client name match, then backfill DB
    var noPhone = jobs.filter(function(j){ return !j.phone && j.name; });
    if (noPhone.length) {
      for (var i = 0; i < noPhone.length; i++) {
        var j = noPhone[i];
        var rc = await db.from('clients').select('cid,phone').ilike('name', j.name.trim()).limit(1);
        if (!rc.error && rc.data && rc.data[0] && rc.data[0].phone) {
          j.phone = rc.data[0].phone;
          // Backfill DB silently so next load is instant
          db.from('jobs').update({ phone: rc.data[0].phone, client_cid: rc.data[0].cid }).eq('job_id', j.id);
        }
      }
    }
  }
  jobsLoading = false;
  renderJobs();
  renderJobsPagination();
}

// ── Render pagination controls ─────────────────────────────
function renderJobsPagination() {
  var totalPages = Math.ceil(jobsTotal / jobsPageSize);
  var start = jobsPage * jobsPageSize + 1;
  var end = Math.min((jobsPage + 1) * jobsPageSize, jobsTotal);

  var html = '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;flex-wrap:wrap;gap:10px;">'
    + '<div style="font-size:13px;color:var(--muted)">Showing <strong style="color:var(--text)">' + start.toLocaleString() + '–' + end.toLocaleString() + '</strong> of <strong style="color:var(--text)">' + jobsTotal.toLocaleString() + '</strong> jobs</div>'
    + '<div style="display:flex;gap:6px;align-items:center;">'
    + '<button onclick="loadJobsPage(0)" ' + (jobsPage===0?'disabled':'') + ' style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px;' + (jobsPage===0?'opacity:.4;cursor:not-allowed':'') + '">«</button>'
    + '<button onclick="loadJobsPage(' + (jobsPage-1) + ')" ' + (jobsPage===0?'disabled':'') + ' style="padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px;' + (jobsPage===0?'opacity:.4;cursor:not-allowed':'') + '">‹ Prev</button>'
    + '<span style="font-size:13px;color:var(--muted);padding:0 8px">Page ' + (jobsPage+1) + ' of ' + totalPages + '</span>'
    + '<button onclick="loadJobsPage(' + (jobsPage+1) + ')" ' + (jobsPage>=totalPages-1?'disabled':'') + ' style="padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px;' + (jobsPage>=totalPages-1?'opacity:.4;cursor:not-allowed':'') + '">Next ›</button>'
    + '<button onclick="loadJobsPage(' + (totalPages-1) + ')" ' + (jobsPage>=totalPages-1?'disabled':'') + ' style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px;' + (jobsPage>=totalPages-1?'opacity:.4;cursor:not-allowed':'') + '">»</button>'
    + '</div></div>';

  // Inject pagination above and below jobs tables
  ['jobs-pagination-top','jobs-pagination-bottom'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

// ── Override search to use server-side ─────────────────────
function doJobSearch(q) {
  searchF = q;
  jobsPage = 0;
  loadJobsPage(0);
}

// ── Load jobs when switching to jobs view ──────────────────
var _origRender = render;
render = function(name) {
  if (name === 'jobs') {
    loadJobsPage(jobsPage);
    return;
  }
  if (name === 'clients') {
    clientsPage = 0;
    loadClientsPage();
    return;
  }
  if (name === 'bininventory') {
    loadBinJobsThenRender();
    return;
  }
  _origRender(name);
};

// Load active + upcoming bin rental jobs from Supabase, then render Bin Fleet
async function loadBinJobsThenRender() {
  try {
    var today = todayStr();
    // Fetch all bin jobs that are: active (In Progress/Pending) OR have a future/current pickup date
    var [rActive, rUpcoming] = await Promise.all([
      // Currently active: In Progress or Pending, not picked up
      db.from('jobs').select('*')
        .eq('service','Bin Rental')
        .in('status',['In Progress','Pending'])
        .neq('bin_instatus','pickedup'),
      // Has a bin_pickup date on or after today (bin still out or scheduled)
      db.from('jobs').select('*')
        .eq('service','Bin Rental')
        .neq('status','Cancelled')
        .neq('bin_instatus','pickedup')
        .gte('bin_pickup', today)
    ]);
    var seen = {};
    var binJobs = [];
    [(rActive.data||[]), (rUpcoming.data||[])].forEach(function(arr){
      arr.map(dbToJob).forEach(function(j){
        if(!seen[j.id]){ seen[j.id]=true; binJobs.push(j); }
      });
    });
    // Merge into local jobs array without duplicates
    binJobs.forEach(function(j) {
      var idx = jobs.findIndex(function(x){return x.id===j.id;});
      if(idx >= 0) jobs[idx] = j; // update with fresh data
      else jobs.push(j);
    });
  } catch(e) {
    console.error('Error loading bin jobs:', e);
  }
  renderBinInventory();
}

var _saveJobLock = false;
async function nextIdFromDb(svc) {
  try {
    // Fetch every job_id from Supabase with no limit, parse all as integers, take the max
    var r = await db.from('jobs').select('job_id').limit(100000);
    var maxNum = 0;
    if (!r.error && r.data) {
      r.data.forEach(function(row) {
        var n = parseInt((row.job_id || ''), 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      });
    }
    // Also check local cache
    jobs.forEach(function(j) {
      var n = parseInt(j.id, 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });
    var next = String(maxNum + 1);
    console.log('[nextIdFromDb] maxNum=' + maxNum + ' → ' + next);
    return next;
  } catch(ex) {
    console.warn('[nextIdFromDb] error:', ex);
    // Last resort: use local cache only
    var maxNum = 0;
    jobs.forEach(function(j) { var n = parseInt(j.id, 10); if (!isNaN(n) && n > maxNum) maxNum = n; });
    return String(maxNum + 1);
  }
}

function nextBinItemId(){var n=binItems.map(function(b){return parseInt((b.bid||'').replace('BI-',''))||0;});return 'BI-'+String((n.length?Math.max.apply(null,n):0)+1).padStart(4,'0');}
function nextClientId(){var n=clients.map(function(c){return parseInt((c.cid||'').replace('CL-',''))||0;});return 'CL-'+String((n.length?Math.max.apply(null,n):0)+1).padStart(4,'0');}

// ─── CLIENT MODAL HELPERS ───
var editClientId = null;

function _clientNameRow(val){
  return '<div style="display:flex;gap:8px;margin-bottom:8px"><input type="text" class="c-name-inp" placeholder="Full name" value="'+(val||'')+'" onblur="this.value=toTitleCase(this.value)" style="flex:1;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:10px 14px;border-radius:8px;font-family:\'DM Sans\',sans-serif;font-size:14px"><button type="button" onclick="this.parentNode.remove()" style="background:rgba(220,53,69,.12);border:1px solid rgba(220,53,69,.3);color:#dc3545;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:14px">✕</button></div>';
}
function _clientPhoneRow(num,ext,type){
  return '<div style="display:flex;gap:8px;margin-bottom:8px"><select class="c-phone-type-sel" style="flex:.8;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:10px 14px;border-radius:8px;font-family:\'DM Sans\',sans-serif;font-size:14px"><option value="cell"'+((!type||type==='cell')?'selected':'')+'">Cell</option><option value="home"'+(type==='home'?'selected':'')+'">Home</option><option value="office"'+(type==='office'?'selected':'')+'">Office</option></select><input type="tel" class="c-phone-inp" placeholder="(705) 555-0000" value="'+(num||'')+'" style="flex:2;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:10px 14px;border-radius:8px;font-family:\'DM Sans\',sans-serif;font-size:14px"><input type="text" class="c-ext-inp" placeholder="Ext" value="'+(ext||'')+'" style="flex:.6;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:10px 14px;border-radius:8px;font-family:\'DM Sans\',sans-serif;font-size:14px"><button type="button" onclick="this.parentNode.remove()" style="background:rgba(220,53,69,.12);border:1px solid rgba(220,53,69,.3);color:#dc3545;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:14px">✕</button></div>';
}
function _clientEmailRow(val){
  return '<div style="display:flex;gap:8px;margin-bottom:8px"><input type="email" class="c-email-inp" placeholder="email@example.com" value="'+(val||'')+'" style="flex:1;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:10px 14px;border-radius:8px;font-family:\'DM Sans\',sans-serif;font-size:14px"><button type="button" onclick="this.parentNode.remove()" style="background:rgba(220,53,69,.12);border:1px solid rgba(220,53,69,.3);color:#dc3545;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:14px">✕</button></div>';
}
function _clientAddressRow(street, city, removable){
  var rmBtn=removable?'<button type="button" onclick="this.closest(\'.c-addr-row\').remove()" style="background:rgba(220,53,69,.12);border:1px solid rgba(220,53,69,.3);color:#dc3545;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:14px;align-self:flex-start;margin-top:22px">✕</button>':'';
  return '<div class="c-addr-row" style="display:flex;gap:8px;margin-bottom:10px;align-items:flex-start">'
    +'<div style="flex:2"><label style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:4px">Street</label>'
    +'<input type="text" class="c-street-inp" data-places="1" placeholder="123 Main St" value="'+(street||'')+'" style="width:100%;box-sizing:border-box;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:10px 14px;border-radius:8px;font-family:\'DM Sans\',sans-serif;font-size:14px"></div>'
    +'<div style="flex:1"><label style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:4px">City</label>'
    +'<input type="text" class="c-city-inp" placeholder="Barrie" value="'+(city||'Barrie')+'" onblur="this.value=toTitleCase(this.value)" style="width:100%;box-sizing:border-box;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:10px 14px;border-radius:8px;font-family:\'DM Sans\',sans-serif;font-size:14px"></div>'
    +rmBtn+'</div>';
}
function _attachClientAddressAutocompletes() {
  var rows = document.querySelectorAll('#c-addresses-wrap .c-addr-row');
  rows.forEach(function(row) {
    var inp = row.querySelector('.c-street-inp[data-places="1"]');
    if (inp && !inp._acAttached) {
      inp._acAttached = true;
      var cityInp = row.querySelector('.c-city-inp');
      attachAddressAutocomplete(inp, function(street, city) {
        inp.value = street;
        if (cityInp && city) cityInp.value = city;
      });
    }
  });
}
function addClientName(){document.getElementById('c-names-wrap').insertAdjacentHTML('beforeend',_clientNameRow(''));}
function addClientPhone(){document.getElementById('c-phones-wrap').insertAdjacentHTML('beforeend',_clientPhoneRow('','','cell'));}
function addClientEmail(){document.getElementById('c-emails-wrap').insertAdjacentHTML('beforeend',_clientEmailRow(''));}
function addClientAddress(){
  document.getElementById('c-addresses-wrap').insertAdjacentHTML('beforeend',_clientAddressRow('','Barrie',true));
  _attachClientAddressAutocompletes();
}

// ─── JOB FORM HELPERS (reuse client helpers + job-specific ones) ───
function _jobNameRow(val){
  return '<div style="display:flex;gap:8px;margin-bottom:8px"><input type="text" class="f-name-inp" placeholder="Full name" value="'+(val||'')+'" onblur="this.value=toTitleCase(this.value)" style="flex:1;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:10px 14px;border-radius:8px;font-family:\'DM Sans\',sans-serif;font-size:14px"><button type="button" onclick="this.parentNode.remove()" style="background:rgba(220,53,69,.12);border:1px solid rgba(220,53,69,.3);color:#dc3545;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:14px">✕</button></div>';
}
function _jobPhoneRow(num,ext,type){
  return '<div style="display:flex;gap:8px;margin-bottom:8px"><select class="f-phone-type-sel" style="flex:.8;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:10px 14px;border-radius:8px;font-family:\'DM Sans\',sans-serif;font-size:14px"><option value="cell"'+((!type||type==='cell')?'selected':'')+'">Cell</option><option value="home"'+(type==='home'?'selected':'')+'">Home</option><option value="office"'+(type==='office'?'selected':'')+'">Office</option></select><input type="tel" class="f-phone-inp" placeholder="(705) 555-0000" value="'+(num||'')+'" style="flex:2;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:10px 14px;border-radius:8px;font-family:\'DM Sans\',sans-serif;font-size:14px"><input type="text" class="f-ext-inp" placeholder="Ext" value="'+(ext||'')+'" style="flex:.6;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:10px 14px;border-radius:8px;font-family:\'DM Sans\',sans-serif;font-size:14px"><button type="button" onclick="this.parentNode.remove()" style="background:rgba(220,53,69,.12);border:1px solid rgba(220,53,69,.3);color:#dc3545;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:14px">✕</button></div>';
}
function _jobEmailRow(val){
  return '<div style="display:flex;gap:8px;margin-bottom:8px"><input type="email" class="f-email-inp" placeholder="email@example.com" value="'+(val||'')+'" style="flex:1;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:10px 14px;border-radius:8px;font-family:\'DM Sans\',sans-serif;font-size:14px"><button type="button" onclick="this.parentNode.remove()" style="background:rgba(220,53,69,.12);border:1px solid rgba(220,53,69,.3);color:#dc3545;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:14px">✕</button></div>';
}
function addJobName(){document.getElementById('f-names-wrap').insertAdjacentHTML('beforeend',_jobNameRow(''));}
function addJobPhone(){document.getElementById('f-phones-wrap').insertAdjacentHTML('beforeend',_jobPhoneRow('','','cell'));}
function addJobEmail(){document.getElementById('f-emails-wrap').insertAdjacentHTML('beforeend',_jobEmailRow(''));}

function openAddClient(){
  try{
    editClientId=null;
    document.getElementById('client-modal-ttl').textContent='Add Client';
    document.getElementById('client-save-btn').textContent='Add Client';
    document.getElementById('c-names-wrap').innerHTML=_clientNameRow('');
    document.getElementById('c-phones-wrap').innerHTML=_clientPhoneRow('','','cell');
    document.getElementById('c-emails-wrap').innerHTML=_clientEmailRow('');
    document.getElementById('c-addresses-wrap').innerHTML=_clientAddressRow('','Barrie',false);
    document.getElementById('c-referral').value='';
    document.getElementById('c-notes').value='';
    var blEl=document.getElementById('c-blacklisted');if(blEl)blEl.checked=false;
    var errEl=document.getElementById('err-c-name');if(errEl)errEl.style.display='none';
    document.getElementById('client-modal').classList.add('open');
  }catch(ex){alert('openAddClient error: '+ex.message);console.error(ex);}
}

function editClient(cid){
  var cl=null;clients.forEach(function(c){if(c.cid===cid)cl=c;});
  if(!cl)return;
  editClientId=cid;
  document.getElementById('client-modal-ttl').textContent='Edit Client';
  document.getElementById('client-save-btn').textContent='Save Changes';
  // Names
  var names=cl.names&&cl.names.length?cl.names:[cl.name||''];
  document.getElementById('c-names-wrap').innerHTML=names.map(function(n){return _clientNameRow(n);}).join('');
  // Phones
  var phones=cl.phones&&cl.phones.length?cl.phones:(cl.phone?[{num:cl.phone,ext:''}]:[]);
  document.getElementById('c-phones-wrap').innerHTML=phones.length?phones.map(function(p){return _clientPhoneRow(p.num||p,p.ext||'',p.type||'cell');}).join(''):_clientPhoneRow('','','cell');
  // Emails
  var emails=cl.emails&&cl.emails.length?cl.emails:(cl.email?[cl.email]:[]);
  document.getElementById('c-emails-wrap').innerHTML=emails.length?emails.map(function(e){return _clientEmailRow(e);}).join(''):_clientEmailRow('');
  // Addresses
  var addrs=cl.addresses&&cl.addresses.length?cl.addresses:(cl.address?[{street:(cl.address.split(',')[0]||'').trim(),city:cl.city||'Barrie'}]:[{street:'',city:'Barrie'}]);
  var addrWrap=document.getElementById('c-addresses-wrap');
  addrWrap.innerHTML='';
  addrs.forEach(function(a,i){addrWrap.insertAdjacentHTML('beforeend',_clientAddressRow(a.street||'',a.city||'Barrie',i>0));});
  setTimeout(_attachClientAddressAutocompletes, 50);
  document.getElementById('c-referral').value=cl.referral||'';
  document.getElementById('c-notes').value=cl.notes||'';
  var blEl=document.getElementById('c-blacklisted');if(blEl)blEl.checked=cl.blacklisted||false;
  var errEl=document.getElementById('err-c-name');if(errEl)errEl.style.display='none';
  closeM('client-detail-modal');
  document.getElementById('client-modal').classList.add('open');
}

async function saveClient(e){
  try{
  if(e&&e.preventDefault)e.preventDefault();
  // Collect names — apply Title Case
  var nameEls=document.querySelectorAll('#c-names-wrap .c-name-inp');
  var names=[].slice.call(nameEls).map(function(el){
    var v=toTitleCase(el.value.trim()); el.value=v; return v;
  }).filter(Boolean);
  var errEl=document.getElementById('err-c-name');
  if(!names.length){if(errEl)errEl.style.display='block';return;}
  if(errEl)errEl.style.display='none';
  // Validate referral
  var refVal=document.getElementById('c-referral').value;
  var refErrEl=document.getElementById('err-c-referral');
  if(!refVal){if(refErrEl)refErrEl.style.display='block';return;}
  if(refErrEl)refErrEl.style.display='none';
  // Collect phones with types
  var phoneRows=document.querySelectorAll('#c-phones-wrap .c-phone-inp');
  var extRows=document.querySelectorAll('#c-phones-wrap .c-ext-inp');
  var typeRows=document.querySelectorAll('#c-phones-wrap .c-phone-type-sel');
  var phones=[];
  [].slice.call(phoneRows).forEach(function(el,i){var num=el.value.trim();if(num)phones.push({num:num,ext:extRows[i]?extRows[i].value.trim():'',type:typeRows[i]?typeRows[i].value:'cell'});});
  // Collect emails
  var emailEls=document.querySelectorAll('#c-emails-wrap .c-email-inp');
  var emails=[].slice.call(emailEls).map(function(el){return el.value.trim();}).filter(Boolean);
  // Collect addresses
  var streetEls=document.querySelectorAll('#c-addresses-wrap .c-street-inp');
  var cityEls=document.querySelectorAll('#c-addresses-wrap .c-city-inp');
  var addresses=[];
  [].slice.call(streetEls).forEach(function(el,i){
    var st=toTitleCase(el.value.trim());
    var cy=toTitleCase(cityEls[i]?cityEls[i].value.trim():'Barrie');
    el.value=st;if(cityEls[i])cityEls[i].value=cy;
    if(st||cy)addresses.push({street:st,city:cy||'Barrie'});
  });
  if(!addresses.length)addresses=[{street:'',city:'Barrie'}];
  // Primary address for backward compat
  var primaryAddr=addresses[0];
  var fullAddr=primaryAddr.street?(primaryAddr.street+', '+primaryAddr.city+', ON, Canada'):(primaryAddr.city+', ON, Canada');

  // Generate CID from DB max if adding new
  var cid=editClientId;
  if(!cid){
    var maxR=await db.from('clients').select('cid').order('cid',{ascending:false}).limit(1);
    var maxCid=maxR.data&&maxR.data.length?maxR.data[0].cid:'CL-0000';
    var maxNum=parseInt((maxCid||'').replace('CL-',''))||0;
    cid='CL-'+String(maxNum+1).padStart(4,'0');
  }

  var cl={
    cid:cid,
    name:names[0],names:names,
    phone:phones.length?phones[0].num:'',phones:phones,
    email:emails[0]||'',emails:emails,
    address:fullAddr,city:primaryAddr.city||'Barrie',addresses:addresses,
    referral:document.getElementById('c-referral').value,
    notes:document.getElementById('c-notes').value.trim(),
    blacklisted:document.getElementById('c-blacklisted')?document.getElementById('c-blacklisted').checked:false
  };
  var dbRow=clientToDb(cl);
  var saveR=await db.from('clients').upsert(dbRow,{onConflict:'cid'});
  if(saveR.error){alert('Save error: '+saveR.error.message);console.error(saveR.error);return;}
  if(editClientId){
    var idx=clients.findIndex(function(c){return c.cid===editClientId;});
    if(idx>=0)clients[idx]=cl;else clients.push(cl);
  } else {
    clients.push(cl);
  }
  _clientStatsCache = null;
  toast(editClientId?'Client updated!':'Client added!');
  closeM('client-modal');
  clientsPage = 0;
  loadClientsPage();
  }catch(ex){alert('saveClient error: '+ex.message);console.error(ex);}
}

function jobIdCls(id,svc){
  if(id&&id.startsWith('BIN-'))return 'job-id-bin';
  if(id&&id.startsWith('JUNK-'))return 'job-id-junk';
  if(id&&id.startsWith('QT-'))return 'job-id-quote';
  if(id&&id.startsWith('FB-'))return 'job-id-furn';
  // fallback by service type
  if(svc==='Bin Rental')return 'job-id-bin';
  if(svc==='Junk Removal')return 'job-id-junk';
  if(svc==='Junk Quote')return 'job-id-quote';
  if(svc==='Furniture Pickup'||svc==='Furniture Delivery')return 'job-id-furn';
  return 'job-id-bin';
}
function fd(d){if(!d)return '—';var p=d.split('-');return p.length===3?p[1]+'/'+p[2]+'/'+p[0]:d;}
function ft(t){if(!t)return '';var p=t.split(':'),h=parseInt(p[0]);return (h%12||12)+':'+(p[1]||'00')+' '+(h>=12?'PM':'AM');}
function fm(v){var n=parseFloat(v);return isNaN(n)?'—':'$'+n.toFixed(2);}
function todayStr(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function resolveAddr(j){
  var a=(j.address||'').trim();
  var c=(j.city||'').trim();
  var cityIsStreet=c&&/\d/.test(c);
  var addrIsCity=a&&!/\d/.test(a)&&a.split(' ').length<=3;
  var street,city;
  if(cityIsStreet){street=c;city=addrIsCity?a:'';}
  else{street=addrIsCity?'':a;city=c||(addrIsCity?a:'');}
  var display=street?(street+(city?' · '+city:'')):city;
  var geocodeStr=street?(street+(city?', '+city:'')+', ON, Canada'):(city?city+', ON, Canada':'');
  return {geocodeStr:geocodeStr,display:display,street:street,city:city};
}
function extractCity(addr,city){
  // Prefer the dedicated city field if set
  if(city&&city.trim()&&city.trim().length>1){
    var c=city.trim();
    // Strip province/postal/country suffixes
    c=c.replace(/,?\s*(ON|BC|AB|QC|MB|SK|NS|NB|PE|NL|NT|YT|NU|Canada|Ontario).*/i,'').trim();
    if(c.length>1) return c;
  }
  if(!addr) return 'Unknown';
  // Try to extract city from "Street, City, Province, Country" format
  var parts = addr.split(',').map(function(p){return p.trim();}).filter(function(p){return p.length>0;});
  // Common Canadian address: "123 Main St, Barrie, ON, Canada" → city is parts[1]
  if(parts.length >= 2) {
    var cityPart = parts[1].trim();
    var provinceCountryCodes = /^(ON|BC|AB|QC|MB|SK|NS|NB|PE|NL|NT|YT|NU|Canada|USA|United States|\d.*)$/i;
    if(!provinceCountryCodes.test(cityPart)) return cityPart;
    if(parts.length >= 3 && !provinceCountryCodes.test(parts[2])) return parts[2].trim();
  }
  // Single part - if it looks like a street address return Unknown
  if(parts[0]&&/^\d/.test(parts[0])) return 'Unknown';
  return parts[0] || 'Unknown';
}

// ─── MOBILE SIDEBAR ───
function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('mob-open');
  document.getElementById('sidebar-overlay').classList.toggle('mob-open');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('mob-open');
  document.getElementById('sidebar-overlay').classList.remove('mob-open');
}

// ── ANIMATED PILL TABS ──
// Call after any tab click to slide the highlight to the active tab
function atabsSync(groupId) {
  var wrap = document.getElementById('atabs-' + groupId);
  if (!wrap) return;
  var hl = document.getElementById('atabs-' + groupId + '-hl');
  if (!hl) return;
  var active = wrap.querySelector('.atab.active');
  if (!active) return;
  var wrapRect = wrap.getBoundingClientRect();
  var tabRect  = active.getBoundingClientRect();
  hl.style.left  = (tabRect.left - wrapRect.left) + 'px';
  hl.style.width = tabRect.width + 'px';
}

// Sync all groups at once
function atabsSyncAll() {
  ['svc','status','date','bin','csort','analytics'].forEach(atabsSync);
}

// Patch the existing filter setters to also sync tabs
var _origSetSvc = typeof setSvc === 'function' ? setSvc : null;
var _origSetJobStatus = typeof setJobStatus === 'function' ? setJobStatus : null;
var _origSetJobDateFilter = typeof setJobDateFilter === 'function' ? setJobDateFilter : null;
var _origSetBinDropFilter = typeof setBinDropFilter === 'function' ? setBinDropFilter : null;

function _patchAtabs() {
  // Jobs: service
  if (typeof setSvc === 'function') {
    var _s = setSvc;
    setSvc = function(v, el) {
      _s(v, el);
      if (el) {
        document.querySelectorAll('#atabs-svc .atab').forEach(function(b){ b.classList.remove('active'); });
        el.classList.add('active');
      }
      atabsSync('svc');
    };
  }
  // Jobs: status
  if (typeof setJobStatus === 'function') {
    var _js = setJobStatus;
    setJobStatus = function(v, el) {
      _js(v, el);
      if (el) {
        document.querySelectorAll('#atabs-status .atab').forEach(function(b){ b.classList.remove('active'); });
        el.classList.add('active');
      }
      atabsSync('status');
    };
  }
  // Jobs: date
  if (typeof setJobDateFilter === 'function') {
    var _jd = setJobDateFilter;
    setJobDateFilter = function(v, el) {
      _jd(v, el);
      if (el) {
        document.querySelectorAll('#atabs-date .atab').forEach(function(b){ b.classList.remove('active'); });
        el.classList.add('active');
      }
      atabsSync('date');
    };
  }
  // Jobs: bin drop
  if (typeof setBinDropFilter === 'function') {
    var _bd = setBinDropFilter;
    setBinDropFilter = function(v, el) {
      _bd(v, el);
      if (el) {
        document.querySelectorAll('#atabs-bin .atab').forEach(function(b){ b.classList.remove('active'); });
        el.classList.add('active');
      }
      atabsSync('bin');
    };
  }
  // Clients: sort
  if (typeof setClientSort === 'function') {
    var _cs = setClientSort;
    setClientSort = function(v, el) {
      _cs(v, el);
      if (el) {
        document.querySelectorAll('#atabs-csort .atab').forEach(function(b){ b.classList.remove('active'); });
        el.classList.add('active');
      }
      atabsSync('csort');
    };
  }
  // Analytics: period
  if (typeof setAnalyticsPeriod === 'function') {
    var _ap = setAnalyticsPeriod;
    setAnalyticsPeriod = function(v, el) {
      _ap(v, el);
      if (el) {
        document.querySelectorAll('#atabs-analytics .atab').forEach(function(b){ b.classList.remove('active'); });
        el.classList.add('active');
      }
      atabsSync('analytics');
    };
  }
}

// Run patch + initial sync once DOM is ready
(function() {
  function _initAtabs() {
    _patchAtabs();
    // Small delay so layout is settled before measuring
    setTimeout(atabsSyncAll, 80);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initAtabs);
  } else {
    _initAtabs();
  }
  // Re-sync when jobs view becomes active
  window.addEventListener('resize', atabsSyncAll);
})();


// ─── VIEWS ───
// ─── ANIMATION UTILITIES ───
function animCount(el, target, prefix, suffix, dur){
  if(!el) return;
  prefix = prefix||''; suffix = suffix||''; dur = dur||1420;
  var start=0, startTime=null;
  var isFloat = target !== Math.floor(target);
  function step(ts){
    if(!startTime) startTime=ts;
    var p=Math.min((ts-startTime)/dur,1);
    var ease=1-Math.pow(1-p,3);
    var val=isFloat?(start+(target-start)*ease).toFixed(0):(Math.round(start+(target-start)*ease));
    el.textContent=prefix+val+suffix;
    if(p<1) requestAnimationFrame(step);
    else el.textContent=prefix+(isFloat?target.toFixed(0):target)+suffix;
  }
  requestAnimationFrame(step);
}
function animateBars(container){
  requestAnimationFrame(function(){
    var bars=(container||document).querySelectorAll('.bar-fill.bar-anim');
    bars.forEach(function(b,i){
      var w=b.getAttribute('data-w')||'0%';
      setTimeout(function(){b.style.width=w;},i*40);
    });
  });
}
function animateView(viewEl){
  if(!viewEl) return;
  var children=viewEl.children;
  Array.prototype.forEach.call(children,function(c,i){
    c.style.opacity='0';
    c.style.transform='translateY(20px)';
    c.style.transition='none';
    setTimeout(function(){
      c.style.transition='opacity .28s ease, transform .28s ease';
      c.style.transitionDelay=(i*45)+'ms';
      c.style.opacity='1';
      c.style.transform='translateY(0)';
    },10);
  });
}

var allViews = ['dashboard','jobs','calendar','clients','bininventory','binmap','vehicles','furniturebank','analytics','utilization','pricing','advisor'];
function toggleNavSection(id){
  var sec=document.getElementById(id);if(!sec)return;
  var arrow=document.getElementById(id+'-arrow');
  var open=sec.style.display!=='none';
  sec.style.display=open?'none':'block';
  if(arrow)arrow.style.transform=open?'rotate(-90deg)':'rotate(90deg)';
}
function go(name){
  document.querySelectorAll('.view').forEach(function(v){v.classList.remove('active');});
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  var el=document.getElementById('view-'+name);
  if(el) el.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(n){
    if(n.getAttribute('onclick')==="go('"+name+"')"){n.classList.add('active');
      var parent=n.parentElement;if(parent&&parent.id&&parent.style.display==='none'){parent.style.display='block';var arrow=document.getElementById(parent.id+'-arrow');if(arrow)arrow.style.transform='rotate(90deg)';}
    }
  });
  render(name);
  if(el) animateView(el);
  closeSidebar();
}
function render(name){
  if(name==='dashboard'){ renderDash(); initDashPricingDropdown(); }
  else if(name==='jobs'){ renderJobs(); setTimeout(atabsSyncAll, 60); }
  else if(name==='calendar') renderCal();
  else if(name==='clients'){ renderClients(); setTimeout(function(){ atabsSync('csort'); }, 60); }
  else if(name==='analytics'){ initAnalytics(); setTimeout(function(){ atabsSync('analytics'); }, 60); }
  else if(name==='utilization') renderUtilization();
  else if(name==='pricing') renderPricing();
  else if(name==='binmap') renderMap();
  else if(name==='advisor') renderAdvisor();
  else if(name==='bininventory') renderBinInventory();
  else if(name==='vehicles'){renderVehicles();loadMaintenanceForVehicles().then(renderMaintSections);}
  else if(name==='furniturebank'){renderDRD();}
}
function refresh(){var a=document.querySelector('.view.active');if(a)render(a.id.replace('view-',''));}

// ─── BADGES ───
function stb(s){var cls={Pending:'badge-pending','In Progress':'badge-progress',Done:'badge-done',Cancelled:'badge-cancelled'};var dot={Pending:'🟡','In Progress':'🔵',Done:'🟢',Cancelled:'⚪'};return '<span class="badge '+(cls[s]||'badge-pending')+'">'+(dot[s]||'🟡')+' '+s+'</span>';}
function sb(s){var cls={'Bin Rental':'svc-bin','Junk Removal':'svc-junk','Junk Quote':'svc-quote','Furniture Pickup':'svc-furn','Furniture Delivery':'svc-furn'};return '<span class="service-badge '+(cls[s]||'')+'">'+s+'</span>';}
function jid(id,svc){return '<span class="'+jobIdCls(id,svc)+'">'+id+'</span>';}

// ─── DASHBOARD ───
function getWeekStart(offset){var d=new Date();d.setDate(d.getDate()-d.getDay()+(offset*7));d.setHours(0,0,0,0);return d;}
// Shift the dashboard bin date picker by n days and refresh
function shiftDashDate(n){
  var dp=document.getElementById('dash-bin-date');
  var base=dp&&dp.value?dp.value:todayStr();
  var d=new Date(base+'T12:00:00');
  d.setDate(d.getDate()+n);
  dp.value=d.toISOString().split('T')[0];
  refreshDashBinStats();
  refreshDashJobs();
}

// Dashboard bin stats — loads all bin jobs into jobs[] exactly like loadBinJobsThenRender,
// then uses the same binsOutOnDate() + per-size loop that renderUtilization uses.
async function refreshDashBinStats(){
  var dp=document.getElementById('dash-bin-date');
  var dateStr=dp&&dp.value?dp.value:todayStr();
  var today=todayStr();
  var totalBins=binItems.length;
  var sizes=['4 yard','7 yard','14 yard','20 yard'];
  var sizeColors={'4 yard':'#4ade80','7 yard':'#f0932b','14 yard':'#f0932b','20 yard':'#e76f7e'};

  // ── Load bin jobs exactly as loadBinJobsThenRender does ───────────────────
  try {
    var [rActive, rUpcoming] = await Promise.all([
      db.from('jobs').select('*')
        .eq('service','Bin Rental')
        .in('status',['In Progress','Pending'])
        .neq('bin_instatus','pickedup'),
      db.from('jobs').select('*')
        .eq('service','Bin Rental')
        .neq('status','Cancelled')
        .neq('bin_instatus','pickedup')
        .gte('bin_pickup', today)
    ]);
    var seen={};
    [(rActive.data||[]),(rUpcoming.data||[])].forEach(function(arr){
      arr.map(dbToJob).forEach(function(j){
        if(!seen[j.id]){
          seen[j.id]=true;
          var idx=jobs.findIndex(function(x){return x.id===j.id;});
          if(idx>=0) jobs[idx]=j; else jobs.push(j);
        }
      });
    });
  } catch(e){ console.error('refreshDashBinStats load error',e); }

  // ── Count bins out: every active dropped job = 1 bin deployed ──────────────
  // A job without a bin_bid assigned is still a bin physically out there.
  var binsOut=0, binsIn=0;
  var sizeTotal={};
  sizes.forEach(function(s){sizeTotal[s]=binItems.filter(function(b){return b.size===s;}).length;});
  var sizeOut={'4 yard':0,'7 yard':0,'14 yard':0,'20 yard':0};

  if(dateStr===today){
    // Count from loaded jobs: every dropped, non-cancelled bin rental = out
    var droppedJobs=jobs.filter(function(j){
      return j.service==='Bin Rental'&&j.binInstatus==='dropped'&&j.status!=='Done'&&j.status!=='Cancelled';
    });
    binsOut=droppedJobs.length;
    binsIn=Math.max(0,totalBins-binsOut);
    droppedJobs.forEach(function(j){ if(j.binSize&&sizeOut.hasOwnProperty(j.binSize))sizeOut[j.binSize]++; });
  } else {
    // Forecast for other dates using job date ranges
    jobs.forEach(function(j){
      if(j.service!=='Bin Rental')return;
      if(j.status==='Cancelled')return;
      if(j.binInstatus==='pickedup')return;
      var drop=j.binDropoff||j.date;
      var pick=j.binPickup;
      if(!drop)return;
      var active;
      if(pick){
        active=dateStr>=drop&&dateStr<=pick;
      } else {
        var dropD=new Date(drop+'T12:00:00');
        var maxPick=new Date(dropD);maxPick.setDate(maxPick.getDate()+30);
        active=dateStr>=drop&&dateStr<=maxPick.toISOString().split('T')[0];
      }
      if(active&&sizeOut.hasOwnProperty(j.binSize))sizeOut[j.binSize]++;
    });
    binsOut=sizes.reduce(function(sum,s){return sum+sizeOut[s];},0);
    binsIn=Math.max(0,totalBins-binsOut);
  }
  var outPct=totalBins?Math.round(binsOut/totalBins*100):0;

  // Update both the quick-stat pill AND the fleet card bin count
  animCount(document.getElementById('s-bins-out'),binsOut,'','',700);
  animCount(document.getElementById('s-bins-out-fleet'),binsOut,'','',700);
  animCount(document.getElementById('s-bins-in'),binsIn,'','',700);
  var totalEl=document.getElementById('s-bins-total');if(totalEl)animCount(totalEl,totalBins,'','',700);
  var mbEl=document.getElementById('m-bins');if(mbEl)mbEl.textContent=binsOut;
  setTimeout(function(){
    var ob=document.getElementById('s-bins-out-bar');if(ob)ob.style.width=outPct+'%';
    var pl=document.getElementById('s-bins-pct-lbl');if(pl)pl.textContent=outPct+'% deployed';
  },50);

  var sizeHtml=sizes.map(function(s){
    var out=Math.min(sizeOut[s],sizeTotal[s]);var tot=sizeTotal[s];var inY=Math.max(0,tot-out);
    var imgUrl='';
    if(s==='4 yard')imgUrl='https://jeffsjunk.ca/wp-content/uploads/4-yard-bin.png';
    else if(s==='14 yard')imgUrl='https://jeffsjunk.ca/wp-content/uploads/14-yard-bin.png';
    else if(s==='20 yard')imgUrl='https://jeffsjunk.ca/wp-content/uploads/20-yard-bin.png';
    var watermark=imgUrl?'<div style="position:absolute;top:calc(50% - 50px);left:50%;transform:translate(-50%,-50%);width:288px;height:288px;background-image:url('+imgUrl+');background-repeat:no-repeat;background-position:center;background-size:contain;opacity:0.30;pointer-events:none"></div>':'';
    return '<div class="bin-size-card" style="border-top:5px solid '+sizeColors[s]+';position:relative;overflow:hidden">'
      +watermark
      +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:18px;color:var(--text);letter-spacing:2px;margin-bottom:10px;font-weight:900;position:relative;z-index:1">'+s.toUpperCase()+'</div>'
      +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:88px;line-height:1;color:#22c55e;margin-bottom:2px;text-shadow:0 2px 8px rgba(34,197,94,.35),0 4px 20px rgba(34,197,94,.15);position:relative;z-index:1">'+inY+'</div>'
      +'<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:14px">IN YARD</div>'
      +'<div style="display:flex;justify-content:center;gap:0;border-top:1px solid var(--border);padding-top:10px">'
      +'<div style="flex:1;border-right:1px solid var(--border);padding:0 4px"><div style="font-family:\'Bebas Neue\',sans-serif;font-size:26px;color:#dc3545;font-weight:700">'+out+'</div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;font-weight:600">Out</div></div>'
      +'<div style="flex:1;padding:0 4px"><div style="font-family:\'Bebas Neue\',sans-serif;font-size:26px;color:var(--text);font-weight:700">'+tot+'</div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;font-weight:600">Total</div></div>'
      +'</div>'
      +'<button onclick="bookBin(\''+s+'\')" class="bin-book-btn">📅 Book</button>'
      +'<div style="display:flex;gap:4px;margin-top:6px">'
      +'<button onclick="bookBin(\''+s+'\',3)" class="bin-dur-btn">3 Days</button>'
      +'<button onclick="bookBin(\''+s+'\',7)" class="bin-dur-btn">7 Days</button>'
      +'<button onclick="bookBin(\''+s+'\',30)" class="bin-dur-btn">1 Mo</button>'
      +'</div>'
      +'</div>';
  }).join('');
  var sc=document.getElementById('dash-bin-by-size');if(sc)sc.innerHTML=sizeHtml;
}
// Legacy aliases — any old calls route to the new Supabase-powered function
function updateDashBinStats(){refreshDashBinStats();}
function updateDashBinStatsDirect(){refreshDashBinStats();}

function renderDashVehicleStatus(){
  var el=document.getElementById('dash-vehicle-status');if(!el)return;
  if(!vehicles.length){el.innerHTML='<span style="font-size:11px;color:var(--muted)">No vehicles</span>';return;}
  var todayS=todayStr();
  el.innerHTML=vehicles.map(function(v){
    var blocks=vehBlocks[v.vid]||{};
    var todayBlock=blocks[todayS];
    var status,statusCol,statusIcon,statusTip;
    if(todayBlock){
      status=todayBlock.reason||'Blocked';
      statusCol='#dc3545';statusIcon='🔧';statusTip=status+(todayBlock.notes?' — '+todayBlock.notes:'')+' · click to manage';
    } else {
      status='Available';statusCol='#22c55e';statusIcon='';statusTip='Available · click to manage';
    }
    var dotColor=statusCol;
    var menuId='veh-menu-'+v.vid;

    // Assigned crew for today
    var assigned=vehicleAssignments[v.vid]||[];
    var crewNames=assigned.map(function(a){return a.name;}).join(', ');

    // Build crew assignment options for the dropdown
    var crewOpts=crewMembers.map(function(c){
      var isAssigned=assigned.some(function(a){return a.crewMemberId===c.id;});
      return '<div style="padding:6px 14px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px;transition:background .15s" onmouseover="this.style.background=\'rgba(59,130,246,.08)\'" onmouseout="this.style.background=\'transparent\'" onclick="event.stopPropagation();toggleCrewAssignment(\''+v.vid+'\',\''+c.id+'\')">'
        +'<span style="width:16px;text-align:center">'+(isAssigned?'✓':'')+'</span>'
        +'<span>'+c.name+'</span>'
        +'</div>';
    }).join('');
    var crewSection=crewMembers.length
      ?'<div style="border-top:1px solid var(--border);padding:4px 14px 2px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Assign Crew</div>'+crewOpts
        +'<div style="padding:6px 14px;font-size:11px;cursor:pointer;border-top:1px solid var(--border);color:var(--accent);transition:background .15s" onmouseover="this.style.background=\'rgba(59,130,246,.08)\'" onmouseout="this.style.background=\'transparent\'" onclick="event.stopPropagation();closeVehMenus();openCrewManager()">+ Manage Crew</div>'
      :'<div style="padding:8px 14px;font-size:11px;cursor:pointer;border-top:1px solid var(--border);color:var(--accent);transition:background .15s" onmouseover="this.style.background=\'rgba(59,130,246,.08)\'" onmouseout="this.style.background=\'transparent\'" onclick="event.stopPropagation();closeVehMenus();openCrewManager()">+ Add Crew Members</div>';

    var menuHtml='<div id="'+menuId+'" style="display:none;position:absolute;top:100%;left:0;margin-top:4px;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);z-index:600;min-width:200px;overflow:hidden;max-height:320px;overflow-y:auto">'
      +(todayBlock
        ?'<div style="padding:8px 14px;font-size:12px;cursor:pointer;transition:background .15s" onmouseover="this.style.background=\'rgba(34,197,94,.07)\'" onmouseout="this.style.background=\'transparent\'" onclick="event.stopPropagation();markVehicleOperational(\''+v.vid+'\')">✅ Mark Operational</div>'
        :'<div style="padding:8px 14px;font-size:12px;cursor:pointer;transition:background .15s" onmouseover="this.style.background=\'rgba(220,53,69,.08)\'" onmouseout="this.style.background=\'transparent\'" onclick="event.stopPropagation();markVehicleNotOperational(\''+v.vid+'\')">🔧 Not Operational</div>')
      +crewSection
      +'<div style="padding:8px 14px;font-size:12px;cursor:pointer;border-top:1px solid var(--border);transition:background .15s" onmouseover="this.style.background=\'rgba(59,130,246,.08)\'" onmouseout="this.style.background=\'transparent\'" onclick="event.stopPropagation();closeVehMenus();go(\'vehicles\')">📋 Manage Vehicles</div>'
    +'</div>';
    return '<div style="position:relative;display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;background:'+dotColor+'14;border:1px solid '+dotColor+'33;cursor:pointer;white-space:nowrap;font-size:12px" title="'+statusTip+'" onclick="event.stopPropagation();toggleVehMenu(\''+menuId+'\')">'
      +'<span style="width:7px;height:7px;border-radius:50%;background:'+dotColor+';flex-shrink:0"></span>'
      +'<span style="font-weight:600;color:var(--text)">'+v.name+'</span>'
      +(crewNames?'<span style="font-size:10px;color:var(--muted);max-width:120px;overflow:hidden;text-overflow:ellipsis">'+crewNames+'</span>':'')
      +(statusIcon?'<span style="font-size:10px">'+statusIcon+'</span>':'')
      +menuHtml
      +'</div>';
  }).join('');
}

function markVehicleNotOperational(vid){
  closeVehMenus();
  var today=todayStr();
  if(!vehBlocks[vid])vehBlocks[vid]={};
  vehBlocks[vid][today]={reason:'Service / Repair',notes:'Marked not operational from dashboard',openEnded:true,openFrom:today};
  saveVehBlocks(vid);renderDashVehicleStatus();renderCal();
  toast('Vehicle marked not operational (ongoing until you mark it operational).');
}
function markVehicleOperational(vid){
  closeVehMenus();
  if(!vehBlocks[vid])return;
  // Remove ALL open-ended blocks (past + present + future) so extendOpenBlocks won't recreate them
  var toRemove=Object.keys(vehBlocks[vid]).filter(function(d){return vehBlocks[vid][d].openEnded;});
  toRemove.forEach(function(d){delete vehBlocks[vid][d];});
  // Also clear today even if not open-ended
  var today=todayStr();
  if(vehBlocks[vid][today])delete vehBlocks[vid][today];
  saveVehBlocks(vid);renderDashVehicleStatus();renderCal();
  toast('Vehicle marked operational.');
}
function toggleVehMenu(menuId){
  var m=document.getElementById(menuId);if(!m)return;
  var wasOpen=m.style.display!=='none';
  closeVehMenus();
  if(!wasOpen)m.style.display='block';
}
function closeVehMenus(){
  document.querySelectorAll('[id^="veh-menu-"]').forEach(function(el){el.style.display='none';});
}
document.addEventListener('click',function(e){
  if(!e.target.closest('[id^="veh-menu-"]')&&!e.target.closest('#dash-vehicle-status'))closeVehMenus();
});

// ── Crew Assignment (toggle a crew member on/off a vehicle for today) ──
function toggleCrewAssignment(vid, crewId){
  var todayISO=todayStr();
  if(!vehicleAssignments[vid]) vehicleAssignments[vid]=[];
  var idx=vehicleAssignments[vid].findIndex(function(a){return a.crewMemberId===crewId;});
  if(idx>=0){
    // Remove assignment
    var rec=vehicleAssignments[vid][idx];
    vehicleAssignments[vid].splice(idx,1);
    db.from('vehicle_assignments').delete().eq('vid',vid).eq('crew_member_id',crewId).eq('assignment_date',todayISO).then(function(r){
      if(r.error) console.warn('Remove assignment failed:',r.error.message);
    });
  } else {
    // Add assignment
    var crew=crewMembers.find(function(c){return c.id===crewId;});
    vehicleAssignments[vid].push({id:null, crewMemberId:crewId, name:crew?crew.name:'Unknown'});
    db.from('vehicle_assignments').insert({vid:vid, crew_member_id:crewId, assignment_date:todayISO}).then(function(r){
      if(r.error) console.warn('Add assignment failed:',r.error.message);
    });
  }
  renderDashVehicleStatus();
}

// ── Crew Manager Modal ──
function openCrewManager(){
  var html='<div class="modal-overlay open" id="crew-modal-overlay" onclick="if(event.target===this)closeCrewManager()">'
    +'<div style="background:var(--surface);border-radius:14px;padding:24px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
    +'<div style="font-size:16px;font-weight:700;margin-bottom:16px">Manage Crew Members</div>'
    +'<div id="crew-list" style="margin-bottom:12px"></div>'
    +'<div style="display:flex;gap:8px">'
    +'<input id="crew-new-name" type="text" placeholder="New crew member name" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13px" onkeydown="if(event.key===\'Enter\')addCrewMember()">'
    +'<button class="btn btn-primary" onclick="addCrewMember()" style="font-size:12px;padding:6px 14px">Add</button>'
    +'</div>'
    +'<div style="text-align:right;margin-top:16px"><button class="btn btn-ghost" onclick="closeCrewManager()">Done</button></div>'
    +'</div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
  renderCrewList();
}
function closeCrewManager(){
  var el=document.getElementById('crew-modal-overlay');
  if(el)el.remove();
  renderDashVehicleStatus();
}
function renderCrewList(){
  var el=document.getElementById('crew-list');if(!el)return;
  if(!crewMembers.length){el.innerHTML='<div style="font-size:12px;color:var(--muted);padding:8px 0">No crew members yet. Add one below.</div>';return;}
  el.innerHTML=crewMembers.map(function(c){
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">'
      +'<span style="font-size:13px">'+c.name+'</span>'
      +'<button style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:16px;padding:2px 6px" onclick="removeCrewMember(\''+c.id+'\')" title="Remove">×</button>'
      +'</div>';
  }).join('');
}
function addCrewMember(){
  var input=document.getElementById('crew-new-name');if(!input)return;
  var name=input.value.trim();if(!name)return;
  input.value='';
  db.from('crew_members').insert({name:name}).select().then(function(r){
    if(r.error){toast('Failed to add: '+r.error.message);return;}
    if(r.data&&r.data[0]) crewMembers.push({id:r.data[0].id, name:r.data[0].name});
    renderCrewList();
  });
}
function removeCrewMember(id){
  if(!confirm('Remove this crew member?'))return;
  crewMembers=crewMembers.filter(function(c){return c.id!==id;});
  // Remove from all today's assignments
  Object.keys(vehicleAssignments).forEach(function(vid){
    vehicleAssignments[vid]=vehicleAssignments[vid].filter(function(a){return a.crewMemberId!==id;});
  });
  db.from('crew_members').update({active:false}).eq('id',id).then(function(r){
    if(r.error) console.warn('Remove crew failed:',r.error.message);
  });
  renderCrewList();
}

function changeVehicleStatus(vid,newStatus){
  var v=vehicles.find(function(vv){return vv.vid===vid;});
  if(!v)return;
  v.vehicleStatus=newStatus;
  db.from('vehicles').update({vehicle_status:newStatus}).eq('vid',vid).then(function(r){
    if(r.error)console.warn('Update vehicle status failed:',r.error.message);
  });
  renderDashVehicleStatus();
  // Re-render calendar so blocks show/hide immediately
  renderCal();
}

async function renderDriverLeaderboard(){
  var el=document.getElementById('dash-leaderboard');if(!el)return;
  var periodEl=document.getElementById('leaderboard-period');
  var days=periodEl?parseInt(periodEl.value):7;
  var fromDate=new Date();fromDate.setDate(fromDate.getDate()-days);
  var fromStr=fromDate.toISOString().split('T')[0];

  // Show loading state
  el.innerHTML='<div style="color:var(--muted);font-size:12px;text-align:center;padding:16px">Loading...</div>';

  var res=await db.from('driver_scores').select('*').gte('period_date',fromStr).order('period_date',{ascending:false});
  var rows=res.data||[];

  // Only include vehicles that exist on the vehicles page
  var vidSet={};vehicles.forEach(function(v){vidSet[v.vid]=true;});
  rows=rows.filter(function(r){return vidSet[r.vid];});

  var periodLabel=days===1?'Yesterday':(days+' Days');

  if(!rows.length){
    el.innerHTML='<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px">No safety data for '+periodLabel+'. Scores are collected from Geotab every 6 hours.</div>';
    return;
  }

  // Aggregate by vid
  var byVid={};
  rows.forEach(function(r){
    if(!byVid[r.vid]) byVid[r.vid]={vid:r.vid,name:r.driver_name,days:0,safety:0,harshBrake:0,harshAccel:0,speeding:0,seatbelt:0,distance:0,driveMin:0,idleMin:0};
    var d=byVid[r.vid];
    d.days++;d.name=r.driver_name||d.name;
    d.safety+=Number(r.safety_score);
    d.harshBrake+=r.harsh_braking;d.harshAccel+=r.harsh_accel;d.speeding+=r.speeding_events;d.seatbelt+=r.seatbelt_off;
    d.distance+=Number(r.distance_km);d.driveMin+=r.drive_minutes;d.idleMin+=r.idle_minutes;
  });

  var drivers=Object.values(byVid).map(function(d){
    d.avgSafety=d.days?Math.round(d.safety/d.days*10)/10:0;
    d.totalEvents=d.harshBrake+d.harshAccel+d.speeding+d.seatbelt;
    return d;
  });
  drivers.sort(function(a,b){return b.avgSafety-a.avgSafety;});

  // Match vehicle colors
  var vehMap={};vehicles.forEach(function(v){vehMap[v.vid]={name:v.name,color:v.color};});

  var medals=['🥇','🥈','🥉'];
  el.innerHTML=drivers.map(function(d,i){
    var v=vehMap[d.vid]||{name:d.name,color:'#22c55e'};
    var medal=i<3?medals[i]:'<span style="font-size:14px;color:var(--muted);font-weight:700;width:22px;display:inline-block;text-align:center">'+(i+1)+'</span>';
    var safeColor=d.avgSafety>=90?'#22c55e':d.avgSafety>=70?'#e67e22':'#dc3545';

    // Build event bars — always show all 4 categories
    function evtRow(label,count,color,icon){
      var barW=count?Math.min(100,count*15):0;
      return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0">'
        +'<div style="width:14px;text-align:center;font-size:11px">'+icon+'</div>'
        +'<div style="width:100px;font-size:11px;color:var(--muted)">'+label+'</div>'
        +'<div style="flex:1;height:6px;background:rgba(0,0,0,.05);border-radius:3px;min-width:60px"><div style="height:100%;width:'+barW+'%;background:'+color+';border-radius:3px;transition:width .3s"></div></div>'
        +'<div style="width:28px;text-align:right;font-weight:700;font-size:12px;color:'+(count?color:'var(--muted)')+'">'+count+'</div>'
      +'</div>';
    }

    var evtHtml=evtRow('Hard Braking',d.harshBrake,'#dc3545','🛑')
      +evtRow('Hard Accel',d.harshAccel,'#f97316','⚡')
      +evtRow('Speeding',d.speeding,'#e67e22','🏎️')
      +evtRow('Seatbelt Off',d.seatbelt,'#dc2626','🔓');

    var cleanBadge=d.totalEvents===0?'<div style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:2px 10px;border-radius:20px;background:rgba(34,197,94,.08);color:#16a34a;font-size:10px;font-weight:700;letter-spacing:.3px">✓ CLEAN RECORD</div>':'<div style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:2px 10px;border-radius:20px;background:rgba(220,53,69,.08);color:#dc3545;font-size:10px;font-weight:700;letter-spacing:.3px">'+d.totalEvents+' event'+(d.totalEvents!==1?'s':'')+'</div>';

    return '<div style="border:1px solid var(--border);border-radius:12px;margin-bottom:10px;background:var(--surface2);overflow:hidden;transition:box-shadow .15s" onmouseover="this.style.boxShadow=\'0 2px 12px rgba(34,197,94,.08)\'" onmouseout="this.style.boxShadow=\'none\'">'
      // Top row: rank, name, score
      +'<div style="display:flex;align-items:center;gap:12px;padding:12px 16px">'
        +'<div style="font-size:22px;flex-shrink:0;width:30px;text-align:center">'+medal+'</div>'
        +'<div style="flex:1;min-width:0">'
          +'<div style="font-weight:700;font-size:15px;display:flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:50%;background:'+(v.color||'#22c55e')+'"></span>'+(v.name||d.name)+'</div>'
          +'<div style="font-size:11px;color:var(--muted);margin-top:1px">'+Math.round(d.distance)+' km · '+d.days+' day'+(d.days!==1?'s':'')+(d.driveMin?' · '+Math.round(d.driveMin)+' min driving':'')+'</div>'
        +'</div>'
        +'<div style="text-align:center;flex-shrink:0">'
          +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:38px;color:'+safeColor+';line-height:1">'+d.avgSafety+'</div>'
          +'<div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Safety Score</div>'
        +'</div>'
      +'</div>'
      // Bottom row: event breakdown
      +'<div style="padding:6px 16px 12px 58px;border-top:1px solid var(--border);background:rgba(0,0,0,.01)">'
        +evtHtml
        +cleanBadge
      +'</div>'
    +'</div>';
  }).join('');
}
// Ensure dropdown change fires even if inline onchange fails
document.addEventListener('DOMContentLoaded',function(){
  var sel=document.getElementById('leaderboard-period');
  if(sel)sel.addEventListener('change',function(){renderDriverLeaderboard();});
});

async function renderDashMaintAlert(){
  var el=document.getElementById('dash-maint-alert');if(!el)return;
  var res=await db.from('maintenance_schedules').select('*,vehicle_odometers(odometer_km)').in('status',['due','overdue']);
  // fallback: just query maintenance_schedules
  var mRes=await db.from('maintenance_schedules').select('*').in('status',['due','overdue']);
  var alerts=mRes.data||[];
  if(!alerts.length){el.style.display='none';return;}
  // match to vehicle names
  var vehMap={};vehicles.forEach(function(v){vehMap[v.vid]=v.name;});
  var html='<div style="font-weight:700;margin-bottom:6px">🔧 Maintenance Alerts</div>';
  html+=alerts.map(function(a){
    var icon=a.status==='overdue'?'🔴':'🟡';
    var vName=vehMap[a.vid]||a.vid;
    return '<div style="font-size:12px;margin-bottom:2px">'+icon+' <strong>'+vName+'</strong> — '+a.maintenance_type+' is '+(a.status==='overdue'?'<span style="color:#dc3545;font-weight:700">OVERDUE</span>':'<span style="color:#e67e22;font-weight:700">DUE SOON</span>')+(a.next_due_km?' (due at '+a.next_due_km.toLocaleString()+' km)':'')+'</div>';
  }).join('');
  el.innerHTML=html;
  el.style.display='block';
}

// Refresh just the Today's Jobs panel for whatever date the picker is on
async function refreshDashJobs(){
  var dp = document.getElementById('dash-bin-date');
  var dateS = dp && dp.value ? dp.value : todayStr();
  var realTodayS = todayStr();
  var isToday = dateS === realTodayS;

  // Update the section header label
  var wHdr = document.getElementById('workload-header');
  var dateLbl = isToday ? "TODAY'S JOBS" : "JOBS — " + new Date(dateS+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}).toUpperCase();
  if(wHdr) wHdr.textContent = '📍 ' + dateLbl;

  // Fetch jobs for the selected date
  var [rJobs, rPickups, rDropoffs] = await Promise.all([
    db.from('jobs').select('*').eq('date', dateS).neq('status','Cancelled').order('time'),
    db.from('jobs').select('*').eq('service','Bin Rental').eq('bin_pickup', dateS).neq('status','Cancelled').neq('bin_instatus','pickedup'),
    db.from('jobs').select('*').eq('service','Bin Rental').neq('status','Cancelled').or('bin_dropoff.eq.'+dateS+',and(bin_dropoff.is.null,date.eq.'+dateS+')')
  ]);

  var dayJobs      = (rJobs.data||[]).map(dbToJob);
  var dayPickups   = (rPickups.data||[]).map(dbToJob);
  var dayDropoffs  = (rDropoffs.data||[]).map(dbToJob);

  // Cache in local jobs array
  dayJobs.concat(dayPickups).concat(dayDropoffs).forEach(function(j){
    if(!jobs.find(function(x){return x.id===j.id;})) jobs.push(j);
  });

  function dedup(arr){ var seen={}; return arr.filter(function(j){ if(seen[j.id])return false; seen[j.id]=true; return true; }); }
  dayDropoffs = dedup(dayDropoffs);
  dayPickups  = dedup(dayPickups);

  var junkRemovals = dayJobs.filter(function(j){return j.service==='Junk Removal';});
  var junkQuotes   = dayJobs.filter(function(j){return j.service==='Junk Quote';});
  var furnPickups  = dayJobs.filter(function(j){return j.service==='Furniture Pickup';});
  var furnDelivs   = dayJobs.filter(function(j){return j.service==='Furniture Delivery';});

  var allDay = dedup(dayDropoffs.concat(dayPickups).concat(junkRemovals).concat(junkQuotes).concat(furnPickups).concat(furnDelivs));
  var total = allDay.length;
  var unconf = allDay.filter(function(j){return !j.confirmed;}).length;

  // Update count subheading
  var countEl = document.getElementById('dash-today-count');
  if(countEl){
    var parts=[];
    if(dayDropoffs.length) parts.push(dayDropoffs.length+' bin drop'+(dayDropoffs.length!==1?'s':''));
    if(dayPickups.length)  parts.push(dayPickups.length+' pickup'+(dayPickups.length!==1?'s':''));
    if(junkRemovals.length)parts.push(junkRemovals.length+' junk');
    if(furnPickups.length+furnDelivs.length) parts.push((furnPickups.length+furnDelivs.length)+' furniture');
    if(unconf>0) parts.push('<span style="color:#e67e22;font-weight:600">'+unconf+' unconfirmed 📞</span>');
    countEl.innerHTML = parts.join(' · ') || 'Nothing booked';
  }

  // Update stat pill
  var statToday = document.getElementById('dash-stat-today');
  if(statToday) statToday.textContent = total;

  // Urgency state
  var card = document.getElementById('card-today-jobs');
  if(card) card.className = 'chart-card ' + (total===0?'urgency-ok':total>=5?'urgency-warn':'urgency-neutral');

  // Render job rows (reuse same makeTodayCat pattern)
  function makeCat(title,color,list){
    if(!list.length)return '';
    return '<div style="margin-bottom:12px">'
      +'<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:'+color+';font-weight:700;margin-bottom:6px;">'+title+' ('+list.length+')</div>'
      +list.map(function(j){
        var cfm=j.confirmed;
        var legAssignedBin = j.binBid ? binItems.find(function(b){return b.bid===j.binBid;}) : null;
        var legBinDisplay = legAssignedBin
          ? '<span style="font-size:11px;background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.3);border-radius:5px;padding:1px 7px;font-weight:700">🗳 #'+legAssignedBin.num+(j.binSize?' · '+j.binSize:'')+'</span>'
          : (j.binSize?'<span style="font-size:11px;color:var(--muted)">'+j.binSize+'</span>':'');
        return '<div style="padding:9px 12px;border:1px solid var(--border);border-left:3px solid '+color+';border-radius:0 8px 8px 0;margin-bottom:6px;background:var(--surface2);display:flex;align-items:center;gap:10px;">'
          +'<div style="flex:1;cursor:pointer" onclick="openDetail(\'' +j.id+ '\')" >'
          +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><strong style="font-size:14px">'+j.name+'</strong>'
          +legBinDisplay
          +(j.service==='Bin Rental'&&!j.binBid?'<button class="btn btn-ghost btn-sm" onclick="openEdit(\''+j.id+'\');event.stopPropagation()" style="font-size:10px;color:#e67e22;border-color:rgba(230,126,34,.4)">📦 Assign Bin</button>':'')
          +'</div>'
          +'<div style="font-size:11px;color:var(--muted);margin-top:2px;">'
          +(j.time?ft(j.time)+' · ':'')+j.id
          +(j.address?'<span style="margin-left:6px">📍 '+j.address+'</span>':'')
          +((j.service==='Bin Rental'||j.service==='Furniture Pickup'||j.service==='Furniture Delivery')?(cfm?'<span style="margin-left:8px;color:#22c55e;font-weight:600">✅ '+(j.service==='Furniture Delivery'?'Drop-Off':'Pickup')+' Confirmed</span>':'<span style="margin-left:8px;color:#e67e22;font-weight:700">📞 Confirm '+(j.service==='Furniture Delivery'?'drop-off':'pickup')+'</span>'):'')
          +'</div></div>'
          +(j.service==='Bin Rental'&&j.binInstatus!=='pickedup'?'<button class="btn btn-ghost btn-sm" onclick="markPickedUp(\'' +j.id+ '\',event)" style="font-size:11px;white-space:nowrap">✅ Picked Up</button>':'')
          +((j.service==='Bin Rental'||j.service==='Furniture Pickup'||j.service==='Furniture Delivery')&&!cfm?'<button class="btn btn-ghost btn-sm" onclick="confirmJob(\'' +j.id+ '\',event)" style="font-size:11px;color:#22c55e;white-space:nowrap">✅ Confirm '+(j.service==='Furniture Delivery'?'Drop-Off':'Pickup')+'</button>':'')
          +'</div>';
      }).join('')+'</div>';
  }

  var html = makeCat('🚛 Bin Deliveries','#22c55e',dayDropoffs)
    +makeCat('🚚 Bin Pickups','#4ade80',dayPickups)
    +makeCat('Junk Removals','#e67e22',junkRemovals)
    +makeCat('📋 Junk Quotes','#0d6efd',junkQuotes)
    +makeCat('🛋️ Furniture Pickups','#dc3545',furnPickups)
    +makeCat('📦 Furniture Deliveries','#e76f7e',furnDelivs);

  document.getElementById('dash-today-jobs').innerHTML = html
    || '<div style="color:var(--muted);font-size:13px;padding:12px;text-align:center">No jobs on this date</div>';
}
async function renderWeekCal(){
  var ws=getWeekStart(weekOffset),we=new Date(ws);we.setDate(we.getDate()+6);
  var today=new Date();today.setHours(0,0,0,0);
  var wsS=ws.toISOString().split('T')[0];
  var weS=we.toISOString().split('T')[0];
  var opts={month:'short',day:'numeric'};
  document.getElementById('week-lbl').textContent=ws.toLocaleDateString('en-US',opts)+' – '+we.toLocaleDateString('en-US',opts);

  // Fetch this week's jobs: by job date, bin_dropoff, or bin_pickup falling in this week
  var rByDate = db.from('jobs').select('*').gte('date',wsS).lte('date',weS).neq('status','Cancelled').order('time');
  var rByDropoff = db.from('jobs').select('*').eq('service','Bin Rental').gte('bin_dropoff',wsS).lte('bin_dropoff',weS).neq('status','Cancelled');
  var rByPickup = db.from('jobs').select('*').eq('service','Bin Rental').gte('bin_pickup',wsS).lte('bin_pickup',weS).neq('status','Cancelled');
  var results = await Promise.all([rByDate, rByDropoff, rByPickup]);
  var seen = {};
  var weekJobs = [];
  (results[0].data||[]).concat(results[1].data||[]).concat(results[2].data||[]).forEach(function(row){
    if(!seen[row.id]){ seen[row.id]=true; weekJobs.push(dbToJob(row)); }
  });
  // Cache in local jobs array
  weekJobs.forEach(function(j){ if(!jobs.find(function(x){return x.id===j.id;})) jobs.push(j); });

  // Build event lookup: date -> [{j, type}] matching full calendar logic
  var weekEvents = {};
  weekJobs.forEach(function(j){
    if(j.service==='Bin Rental'){
      var dropDs = j.binDropoff || j.date;
      if(dropDs){ if(!weekEvents[dropDs]) weekEvents[dropDs]=[]; weekEvents[dropDs].push({j:j, type:'dropoff'}); }
      if(j.binPickup && j.binPickup !== dropDs){ if(!weekEvents[j.binPickup]) weekEvents[j.binPickup]=[]; weekEvents[j.binPickup].push({j:j, type:'pickup'}); }
    } else {
      if(j.date){ if(!weekEvents[j.date]) weekEvents[j.date]=[]; weekEvents[j.date].push({j:j, type:'job'}); }
    }
  });

  var dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var clsMap={'Bin Rental':'svc-bin','Junk Removal':'svc-junk','Junk Quote':'svc-quote','Furniture Pickup':'svc-furn','Furniture Delivery':'svc-furn'};
  var hours=[];for(var h=8;h<=17;h++)hours.push(h);

  function chipHtml(ev){
    var j=ev.j;var cfmCls=j.confirmed?' confirmed':' unconfirmed';
    var icon='', label=j.name;
    if(ev.type==='pickup'){ icon='🚚 '; }
    else if(ev.type==='dropoff'){ icon='🚛 '; }
    else { var iconMap={'Junk Removal':'🗑️ ','Junk Quote':'📋 ','Furniture Pickup':'🛋️ ','Furniture Delivery':'📦 '};icon=iconMap[j.service]||''; }
    var titleStr=(ev.type==='pickup'?'Bin Pickup':ev.type==='dropoff'?'Bin Drop-off':j.service)+' · '+j.name;
    return '<div class="week-job-chip '+(clsMap[j.service]||'')+cfmCls+'" draggable="true" data-jid="'+j.id+'" onclick="event.stopPropagation();openDetail(\''+j.id+'\')" title="'+(j.confirmed?'Confirmed':'Not confirmed')+' · '+titleStr+'">'+(j.time?ft(j.time)+' ':'')+icon+label+(j.confirmed?'':' 📞')+'</div>';
  }

  // Build header row
  var html='<div class="week-time-grid">';
  // Header: time label + day names
  html+='<div class="week-time-label" style="border-bottom:2px solid var(--border)"></div>';
  for(var i=0;i<7;i++){
    var d=new Date(ws);d.setDate(d.getDate()+i);
    var isToday=d.getTime()===today.getTime();
    html+='<div class="week-day-hdr-cell'+(isToday?' today':'')+'" data-date="'+d.toISOString().split('T')[0]+'"><div class="week-day-name">'+dayNames[d.getDay()]+'</div><div class="week-day-num">'+d.getDate()+'</div></div>';
  }
  // All-day row
  html+='<div class="week-time-label" style="font-size:10px;color:var(--muted)">All Day</div>';
  for(var i=0;i<7;i++){
    var d=new Date(ws);d.setDate(d.getDate()+i);
    var ds=d.toISOString().split('T')[0];
    var dayEvs=weekEvents[ds]||[];
    var allDayChips=dayEvs.filter(function(ev){
      if(ev.j.service==='Bin Rental'&&!ev.j.time)return true;
      if(!ev.j.time)return true;
      return false;
    }).map(chipHtml).join('');
    html+='<div class="week-time-cell allday" data-date="'+ds+'">'+allDayChips+'</div>';
  }
  // Hour rows
  for(var hi=0;hi<hours.length;hi++){
    var hr=hours[hi];
    var hrLabel=hr<=12?(hr===12?'12 PM':hr+' AM'):(hr-12)+' PM';
    html+='<div class="week-time-label">'+hrLabel+'</div>';
    for(var i=0;i<7;i++){
      var d=new Date(ws);d.setDate(d.getDate()+i);
      var ds=d.toISOString().split('T')[0];
      var dayEvs=weekEvents[ds]||[];
      var hourChips=dayEvs.filter(function(ev){
        if(!ev.j.time)return false;
        if(ev.j.service==='Bin Rental'&&!ev.j.time)return false;
        var parts=ev.j.time.split(':');
        var jobHr=parseInt(parts[0]);
        return jobHr===hr;
      }).map(chipHtml).join('');
      html+='<div class="week-time-cell" data-date="'+ds+'" data-hour="'+hr+'">'+hourChips+'</div>';
    }
  }
  html+='</div>';
  var wg=document.getElementById('week-grid');
  wg.innerHTML=html;
  wg.querySelectorAll('.week-job-chip[draggable]').forEach(function(chip){
    chip.addEventListener('dragstart',function(e){dragJobId=chip.getAttribute('data-jid');chip.style.opacity='0.4';e.dataTransfer.effectAllowed='move';});
    chip.addEventListener('dragend',function(){chip.style.opacity='';dragJobId=null;});
  });
  wg.querySelectorAll('.week-time-cell,.week-day-hdr-cell').forEach(function(col){
    col.addEventListener('dragover',function(e){if(dragJobId){e.preventDefault();col.style.background='rgba(34,197,94,.13)';}});
    col.addEventListener('dragleave',function(){col.style.background='';});
    col.addEventListener('drop',function(e){
      e.preventDefault();col.style.background='';
      var newDate=col.getAttribute('data-date');
      if(!dragJobId||!newDate)return;
      jobs.forEach(function(j){if(j.id===dragJobId)j.date=newDate;});
      patchJob(dragJobId,{date:newDate});toast('Job rescheduled to '+fd(newDate)+'!');renderWeekCal();renderCal();renderDash();
    });
  });
}
function shiftWeek(n){weekOffset+=n;renderWeekCal();}
function goToday(){weekOffset=0;renderWeekCal();}
function makeDashRows(list){
  if(!list.length) return '<tr><td colspan="3" style="text-align:center;padding:14px;color:var(--muted);font-size:13px">No upcoming jobs</td></tr>';
  return list.map(function(j){return '<tr onclick="openDetail(\''+j.id+'\')">'+'<td>'+jid(j.id,j.service)+'</td><td><strong>'+j.name+'</strong></td><td>'+fd(j.date)+'</td></tr>';}).join('');
}
function makeDashRowsFurn(list){
  if(!list.length) return '<tr><td colspan="4" style="text-align:center;padding:14px;color:var(--muted);font-size:13px">No upcoming jobs</td></tr>';
  return list.map(function(j){return '<tr onclick="openDetail(\''+j.id+'\')">'+'<td>'+jid(j.id,j.service)+'</td><td><strong>'+j.name+'</strong></td><td>'+sb(j.service)+'</td><td>'+fd(j.date)+'</td></tr>';}).join('');
}
async function renderDashLongBins(){
  var threshold=parseInt((document.getElementById('dash-days-threshold')||{}).value)||7;
  var cutoff=new Date();cutoff.setDate(cutoff.getDate()-threshold);
  var cutoffS=cutoff.toISOString().split('T')[0];
  // Fetch all dropped bins where dropoff/date is older than threshold
  var rLong=await db.from('jobs').select('*').eq('service','Bin Rental').eq('bin_instatus','dropped').lte('bin_dropoff',cutoffS);
  var longBins=(rLong.data||[]).map(dbToJob);
  // Also catch dropped bins with no bin_dropoff but old job date
  var rLong2=await db.from('jobs').select('*').eq('service','Bin Rental').eq('bin_instatus','dropped').is('bin_dropoff',null).lte('date',cutoffS);
  (rLong2.data||[]).forEach(function(row){var j=dbToJob(row);if(!longBins.find(function(x){return x.id===j.id;}))longBins.push(j);});
  // Merge into local jobs array
  longBins.forEach(function(j){if(!jobs.find(function(x){return x.id===j.id;}))jobs.push(j);});
  document.getElementById('dash-long-bins').innerHTML=longBins.length
    ?longBins.map(function(j){
      var drop=j.binDropoff||j.date;
      var days=Math.floor((Date.now()-new Date(drop).getTime())/86400000);
      var urgColor=days>=14?'#dc3545':'#e67e22';
      return'<div style="padding:8px 10px;border:1px solid rgba(230,126,34,.3);border-radius:8px;margin-bottom:8px;background:rgba(230,126,34,.04);display:flex;align-items:center;gap:8px;">'
        +'<div style="flex:1;cursor:pointer" onclick="openDetail(\''+j.id+'\')">'
        +'<div style="display:flex;align-items:center;gap:8px;">'
        +'<strong>'+j.name+'</strong>'
        +'<span style="color:'+urgColor+';font-size:12px;font-weight:700;margin-left:auto">'+days+' days out</span>'
        +'</div>'
        +'<div style="font-size:12px;color:var(--muted);margin-top:1px;">'+(j.binSize||'')+(j.binPickup?' · Pickup: '+fd(j.binPickup):' · No pickup date set')+(j.phone?'<span style="margin-left:8px;font-weight:600;color:var(--text)">'+j.phone+'</span>':'')+'</div>'
        +'</div>'
        +'<button class="btn btn-ghost btn-sm" onclick="markPickedUp(\''+j.id+'\',event)" style="font-size:11px;white-space:nowrap">✅ Picked Up</button>'
        +'</div>';
    }).join('')
    :'<div style="color:var(--muted);font-size:13px;padding:12px;text-align:center">✅ No bins out that long</div>';
}
async function renderDash(){
  // Re-trigger entrance animations
  document.querySelectorAll('#view-dashboard .dash-section').forEach(function(el){
    el.style.animation='none'; el.style.opacity='0';
    requestAnimationFrame(function(){ el.style.animation=''; });
  });

  var todayS = todayStr();
  var now = new Date();
  var tomorrowD = new Date(now); tomorrowD.setDate(tomorrowD.getDate()+1);
  var tomorrowS = tomorrowD.toISOString().split('T')[0];
  var weekStart = new Date(now); weekStart.setDate(now.getDate()-now.getDay());
  var weekStartS = weekStart.toISOString().split('T')[0];
  var cutoff14 = new Date(now); cutoff14.setDate(now.getDate()+14);
  var cutoff14S = cutoff14.toISOString().split('T')[0];
  var monthStart = new Date(now.getFullYear(),now.getMonth(),1).toISOString().split('T')[0];

  var datePicker = document.getElementById('dash-bin-date');
  datePicker.value = todayS;
  document.getElementById('today-lbl').textContent = now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  // Parallel Supabase fetches
  var [
    rTotal, rActive, rDone, rUnpaid, rMonthRev,
    rTodayJobs, rWeekJobs, rWeekRev,
    rBinCounts, rJunkCount, rFurnCount,
    rOutstanding, rOverdue, rBinPickupsToday, rBinDropoffsToday,
    rTomorrowJobs, rUnconfirmed14
  ] = await Promise.all([
    db.from('jobs').select('*',{count:'exact',head:true}),
    db.from('jobs').select('*',{count:'exact',head:true}).not('status','in','("Done","Cancelled")'),
    db.from('jobs').select('*',{count:'exact',head:true}).eq('status','Done'),
    db.from('jobs').select('*',{count:'exact',head:true}).neq('paid','Paid').neq('status','Cancelled'),
    db.from('jobs').select('price').gte('date',monthStart).neq('status','Cancelled'),
    db.from('jobs').select('*').eq('date',todayS).neq('status','Cancelled').order('time'),
    db.from('jobs').select('*',{count:'exact',head:true}).gte('date',weekStartS).neq('status','Cancelled'),
    db.from('jobs').select('price').gte('date',weekStartS).neq('status','Cancelled'),
    db.from('jobs').select('bin_instatus,bin_size').eq('service','Bin Rental').eq('bin_instatus','dropped'),
    db.from('jobs').select('*',{count:'exact',head:true}).eq('service','Junk Removal').gte('date',monthStart),
    db.from('jobs').select('*',{count:'exact',head:true}).in('service',['Furniture Pickup','Furniture Delivery']).gte('date',monthStart),
    db.from('jobs').select('price').neq('paid','Paid').neq('status','Cancelled'),
    db.from('jobs').select('*').eq('service','Bin Rental').eq('bin_instatus','dropped').lt('bin_pickup',todayS).not('bin_pickup','is',null),
    db.from('jobs').select('*').eq('service','Bin Rental').eq('bin_pickup',todayS).neq('status','Cancelled').neq('bin_instatus','pickedup'),
    db.from('jobs').select('*').eq('service','Bin Rental').neq('status','Cancelled').or('bin_dropoff.eq.'+todayS+',and(bin_dropoff.is.null,date.eq.'+todayS+')'),
    // Tomorrow's jobs
    db.from('jobs').select('*').eq('date',tomorrowS).neq('status','Cancelled').order('time'),
    // Bin Rentals with upcoming pickup + Furniture jobs with upcoming date — unconfirmed (for call-back list)
    db.from('jobs').select('*').in('service',['Bin Rental','Furniture Pickup','Furniture Delivery']).gte('date',todayS).lte('date',cutoff14S).neq('status','Cancelled').eq('confirmed',false).order('date').order('time')
  ]);

  // Write hidden stat IDs that other code may reference
  var total      = rTotal.count||0;
  var active     = rActive.count||0;
  var done       = rDone.count||0;
  var unpaidCount= rUnpaid.count||0;
  var monthRev   = (rMonthRev.data||[]).reduce(function(s,r){return s+(parseFloat(r.price)||0);},0);
  var weekJobs   = rWeekJobs.count||0;
  var weekRev    = (rWeekRev.data||[]).reduce(function(s,r){return s+(parseFloat(r.price)||0);},0);
  var outstanding= (rOutstanding.data||[]).reduce(function(s,r){return s+(parseFloat(r.price)||0);},0);
  animCount(document.getElementById('s-total'),total,'','',700);
  animCount(document.getElementById('s-active'),active,'','',700);
  animCount(document.getElementById('s-done'),done,'','',700);
  animCount(document.getElementById('s-unpaid'),unpaidCount,'','',700);
  animCount(document.getElementById('s-month-rev'),Math.round(monthRev),'$','',700);
  document.getElementById('m-active').textContent=active;
  var wjEl=document.getElementById('s-week-jobs');if(wjEl)animCount(wjEl,weekJobs);
  var wrEl=document.getElementById('s-week-rev');if(wrEl)animCount(wrEl,Math.round(weekRev),'$');
  var osEl=document.getElementById('s-outstanding');if(osEl)animCount(osEl,Math.round(outstanding),'$');

  // Bin stats (delegated)
  refreshDashBinStats();
  renderDashVehicleStatus();
  renderDashMaintAlert();
  renderDriverLeaderboard();

  // ── Today's jobs ──────────────────────────────────────────
  var todayJobs        = (rTodayJobs.data||[]).map(dbToJob);
  var todayBinPickups  = (rBinPickupsToday.data||[]).map(dbToJob);
  var todayBinDropoffs = (rBinDropoffsToday.data||[]).map(dbToJob);

  var allTodayJobs = todayJobs.concat(todayBinPickups).concat(todayBinDropoffs);
  allTodayJobs.forEach(function(j){ if(!jobs.find(function(x){return x.id===j.id;})) jobs.push(j); });

  function dedup(arr){ var seen={}; return arr.filter(function(j){ if(seen[j.id])return false; seen[j.id]=true; return true; }); }
  todayBinDropoffs = dedup(todayBinDropoffs);
  todayBinPickups  = dedup(todayBinPickups);

  var todayJunkRemovals = todayJobs.filter(function(j){return j.service==='Junk Removal';});
  var todayJunkQuotes   = todayJobs.filter(function(j){return j.service==='Junk Quote';});
  var todayFurnPickups  = todayJobs.filter(function(j){return j.service==='Furniture Pickup';});
  var todayFurnDelivs   = todayJobs.filter(function(j){return j.service==='Furniture Delivery';});

  var allToday = dedup(todayBinDropoffs.concat(todayBinPickups).concat(todayJunkRemovals).concat(todayJunkQuotes).concat(todayFurnPickups).concat(todayFurnDelivs));
  var totalTodayCount = allToday.length;
  var unconfirmedToday = allToday.filter(function(j){return (j.service==='Bin Rental'||j.service==='Furniture Pickup'||j.service==='Furniture Delivery')&&!j.confirmed;}).length;

  // ── QUICK STAT PILLS ──────────────────────────────────────
  var statToday = document.getElementById('dash-stat-today');
  if(statToday) statToday.textContent = totalTodayCount;

  var statUnconf = document.getElementById('dash-stat-unconf');
  if(statUnconf) statUnconf.textContent = unconfirmedToday;
  var statUnconfCard = document.getElementById('dash-stat-unconf-card');
  if(statUnconfCard) statUnconfCard.style.borderLeft = unconfirmedToday > 0 ? '4px solid #e67e22' : '';

  var overdueJobs = (rOverdue.data||[]).map(dbToJob);
  overdueJobs.forEach(function(j){ if(!jobs.find(function(x){return x.id===j.id;})) jobs.push(j); });
  var statOverdue = document.getElementById('dash-stat-overdue');
  if(statOverdue) statOverdue.textContent = overdueJobs.length;
  var statOverdueCard = document.getElementById('dash-stat-overdue-card');
  if(statOverdueCard) statOverdueCard.style.borderLeft = overdueJobs.length > 0 ? '4px solid #dc3545' : '';

  // ── TOMORROW PILL in header ───────────────────────────────
  var tomorrowJobs = (rTomorrowJobs.data||[]).map(dbToJob);
  var tomorrowUnconf = tomorrowJobs.filter(function(j){return (j.service==='Bin Rental'||j.service==='Furniture Pickup'||j.service==='Furniture Delivery')&&!j.confirmed;}).length;
  var tPill = document.getElementById('dash-tomorrow-pill');
  if(tPill && tomorrowJobs.length > 0){
    tPill.style.display = '';
    tPill.innerHTML = 'Tomorrow: <strong style="color:var(--text)">' + tomorrowJobs.length + ' job' + (tomorrowJobs.length!==1?'s':'') + '</strong>'
      + (tomorrowUnconf > 0 ? ' &nbsp;·&nbsp; <span style="color:#e67e22;font-weight:600">' + tomorrowUnconf + ' pickup unconfirmed</span>' : '');
  } else if(tPill){
    tPill.style.display = 'none';
  }

  // ── WORKLOAD HEADER ───────────────────────────────────────
  var workloadHdr = document.getElementById('workload-header');
  if(workloadHdr){
    var wLabel;
    if(!totalTodayCount){ wLabel='📍 FREE DAY'; }
    else if(totalTodayCount===1){ wLabel='📍 TODAY — 1 JOB'; }
    else if(totalTodayCount<=3){ wLabel='📍 LIGHT DAY — '+totalTodayCount+' JOBS'; }
    else if(totalTodayCount<=5){ wLabel='📍 BUSY — '+totalTodayCount+' JOBS'; }
    else { wLabel='📍 HEAVY DAY — '+totalTodayCount+' JOBS'; }
    workloadHdr.innerHTML = wLabel;
  }

  // Count line for sub-header
  var countEl = document.getElementById('dash-today-count');
  if(countEl){
    var parts = [];
    if(todayBinDropoffs.length) parts.push(todayBinDropoffs.length+' bin drop'+(todayBinDropoffs.length!==1?'s':''));
    if(todayBinPickups.length)  parts.push(todayBinPickups.length+' pickup'+(todayBinPickups.length!==1?'s':''));
    if(todayJunkRemovals.length)parts.push(todayJunkRemovals.length+' junk');
    if(todayFurnPickups.length+todayFurnDelivs.length) parts.push((todayFurnPickups.length+todayFurnDelivs.length)+' furniture');
    if(unconfirmedToday>0) parts.push('<span style="color:#e67e22;font-weight:600">'+unconfirmedToday+' pickup unconfirmed 📞</span>');
    countEl.innerHTML = parts.join(' · ') || 'Nothing booked';
  }

  // Today card urgency
  var todayCard = document.getElementById('card-today-jobs');
  if(todayCard) todayCard.className = 'chart-card ' + (totalTodayCount===0?'urgency-ok':totalTodayCount>=5?'urgency-warn':'urgency-neutral');

  // ── TODAY'S JOBS — full detail, actionable rows ───────────
  function makeTodayCat(title,color,list){
    if(!list.length)return '<div style="margin-bottom:12px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:'+color+';font-weight:700;margin-bottom:6px;">'+title+' (0)</div><div style="font-size:12px;color:var(--muted);padding:4px 0;font-style:italic">No jobs today</div></div>';
    return '<div style="margin-bottom:12px">'
      +'<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:'+color+';font-weight:700;margin-bottom:6px;">'+title+' ('+list.length+')</div>'
      +list.map(function(j){
        var cfm = j.confirmed;
        var confirmBadge = '';
        if(j.service==='Bin Rental'||j.service==='Furniture Pickup'||j.service==='Furniture Delivery'){
          confirmBadge = cfm
            ? '<span style="font-size:10px;color:#22c55e;font-weight:600;background:rgba(34,197,94,.1);border-radius:4px;padding:1px 6px;white-space:nowrap">✅ Confirmed</span>'
            : '<span style="font-size:10px;color:#e67e22;font-weight:600;background:rgba(230,126,34,.10);border-radius:4px;padding:1px 6px;white-space:nowrap">📞 Unconfirmed</span>';
        }
        var actionBtn = '';
        if(j.service==='Bin Rental'&&j.binInstatus!=='pickedup'){
          actionBtn = '<div class="jdd-wrap" onclick="event.stopPropagation()">'
            +'<button class="jdd-btn" style="border-color:rgba(34,197,94,.3);color:#22c55e;font-size:11px;padding:4px 9px;background:rgba(34,197,94,.07);flex-shrink:0" onclick="toggleJdd(this.parentElement)">Actions ▾</button>'
            +'<div class="jdd-menu">'
              +(!cfm?'<div class="jdd-item" onclick="confirmJob(\''+j.id+'\',event)">✅ Confirm Pickup</div>':'')
              +'<div class="jdd-item" onclick="markPickedUp(\''+j.id+'\',event)">✅ Mark Picked Up</div>'
              +'<div class="jdd-divider"></div>'
              +'<div class="jdd-item" onclick="openDetail(\''+j.id+'\')">📋 Open Details</div>'
              +(j.phone?'<div class="jdd-item" onclick="window.location=\'tel:\'+j.phone;event.stopPropagation()">📞 '+j.phone+'</div>':'')
            +'</div>'
          +'</div>';
        } else if((j.service==='Furniture Pickup'||j.service==='Furniture Delivery')&&!cfm){
          var cfmWord = j.service==='Furniture Delivery'?'Drop-Off':'Pickup';
          actionBtn = '<div class="jdd-wrap" onclick="event.stopPropagation()">'
            +'<button class="jdd-btn" style="border-color:rgba(34,197,94,.3);color:#22c55e;font-size:11px;padding:4px 9px;background:rgba(34,197,94,.07);flex-shrink:0" onclick="toggleJdd(this.parentElement)">Confirm '+cfmWord+' ▾</button>'
            +'<div class="jdd-menu">'
              +'<div class="jdd-item" onclick="confirmJob(\''+j.id+'\',event)">✅ Mark Confirmed</div>'
              +'<div class="jdd-divider"></div>'
              +'<div class="jdd-item" onclick="openDetail(\''+j.id+'\')">📋 Open Details</div>'
              +(j.phone?'<div class="jdd-item" onclick="window.location=\'tel:\'+j.phone;event.stopPropagation()">📞 '+j.phone+'</div>':'')
            +'</div>'
          +'</div>';
        }
        var todayAssignedBin = j.binBid ? binItems.find(function(b){return b.bid===j.binBid;}) : null;
        var binDisplay = todayAssignedBin
          ? '<span style="font-size:11px;background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.3);border-radius:5px;padding:1px 7px;font-weight:700">🗳 #'+todayAssignedBin.num+(j.binSize?' · '+j.binSize:'')+'</span>'
          : (j.binSize?'<span style="font-size:11px;color:var(--muted)">'+j.binSize+'</span>':'');
        var assignBinBtn = (j.service==='Bin Rental' && !j.binBid)
          ? '<button class="btn btn-ghost btn-sm" onclick="openAssignBinPicker(\''+j.id+'\');event.stopPropagation()" style="font-size:11px;color:#e67e22;border-color:rgba(230,126,34,.4);white-space:nowrap">📦 Assign Bin</button>'
          : '';
        return '<div style="padding:8px 12px;border:1px solid var(--border);border-left:3px solid '+color+';border-radius:0 8px 8px 0;margin-bottom:5px;background:var(--surface2);">'
          +'<div style="display:flex;align-items:center;gap:8px;">'
            +'<div style="flex:1;cursor:pointer;min-width:0;" onclick="openDetail(\''+j.id+'\')">'
              +'<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:2px;">'
                +'<strong style="font-size:13px">'+j.name+'</strong>'
                +binDisplay
                +confirmBadge
              +'</div>'
              +'<div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
                +(j.time?'<strong style="color:var(--text)">'+ft(j.time)+'</strong> · ':'')+j.id
                +(j.address?' · 📍 '+j.address.split(',')[0]:'')
              +'</div>'
            +'</div>'
            +assignBinBtn
            +actionBtn
          +'</div>'
        +'</div>';
      }).join('')+'</div>';
  }
  var todayHtml = makeTodayCat('🚛 Bin Deliveries','#22c55e',todayBinDropoffs)
    +makeTodayCat('🚚 Bin Pickups','#4ade80',todayBinPickups)
    +makeTodayCat('Junk Removals','#e67e22',todayJunkRemovals)
    +makeTodayCat('📋 Junk Quotes','#0d6efd',todayJunkQuotes)
    +makeTodayCat('🛋️ Furniture Pickups','#dc3545',todayFurnPickups)
    +makeTodayCat('📦 Furniture Deliveries','#e76f7e',todayFurnDelivs);
  document.getElementById('dash-today-jobs').innerHTML = todayHtml
    ||'<div style="color:var(--muted);font-size:13px;padding:12px;text-align:center">No jobs today 🎉</div>';

  // ── CALL-BACK LIST — unconfirmed upcoming jobs ────────────
  var callbackJobs = (rUnconfirmed14.data||[]).map(dbToJob);
  callbackJobs.forEach(function(j){ if(!jobs.find(function(x){return x.id===j.id;})) jobs.push(j); });
  var cbEl = document.getElementById('dash-callback-list');
  if(cbEl){
    if(!callbackJobs.length){
      cbEl.innerHTML='<div style="color:var(--muted);font-size:13px;padding:10px;text-align:center">✅ All pickups &amp; drop-offs confirmed</div>';
    } else {
      cbEl.innerHTML = callbackJobs.map(function(j){
        var isToday = j.date===todayS;
        var isTom   = j.date===tomorrowS;
        var dateLabel = isToday?'<span style="color:#dc3545;font-weight:700">TODAY</span>'
          : isTom?'<span style="color:#e67e22;font-weight:700">Tomorrow</span>'
          : fd(j.date);
        var isDelivery = j.service==='Furniture Delivery';
        var cfmLabel = isDelivery?'Drop-Off':'Pickup';
        return '<div style="padding:8px 10px;border:1px solid rgba(230,126,34,.3);border-left:3px solid #e67e22;border-radius:0 8px 8px 0;margin-bottom:6px;background:rgba(230,126,34,.04);">'
          +'<div style="display:flex;align-items:center;gap:8px;">'
            +'<div style="flex:1;min-width:0;cursor:pointer" onclick="openDetail(\''+j.id+'\')">'
              +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
                +'<strong style="font-size:13px">'+j.name+'</strong>'
                +dateLabel
                +(j.phone?'<span style="font-size:11px;font-weight:600;color:var(--text)">'+j.phone+'</span>':'')
              +'</div>'
              +'<div style="font-size:11px;color:var(--muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+j.id+(j.service?'<span style="margin-left:6px">'+j.service+'</span>':'')+'</div>'
            +'</div>'
            +'<div class="jdd-wrap" style="flex-shrink:0" onclick="event.stopPropagation()">'
              +'<button class="jdd-btn" style="border-color:rgba(34,197,94,.3);color:#22c55e;font-size:11px;padding:4px 9px;background:rgba(34,197,94,.07)" onclick="toggleJdd(this.parentElement)">Confirm '+cfmLabel+' ▾</button>'
              +'<div class="jdd-menu">'
                +'<div class="jdd-item" onclick="confirmJob(\''+j.id+'\',event)">✅ Mark Confirmed</div>'
                +'<div class="jdd-divider"></div>'
                +'<div class="jdd-item" onclick="openDetail(\''+j.id+'\')">📋 Open Details</div>'
                +(j.phone?'<div class="jdd-item" onclick="window.location=\'tel:\'+j.phone;event.stopPropagation()">📞 '+j.phone+'</div>':'')
              +'</div>'
            +'</div>'
          +'</div>'
        +'</div>';
      }).join('');
    }
  }

  // ── OVERDUE PICKUPS ───────────────────────────────────────
  document.getElementById('dash-overdue').innerHTML = overdueJobs.length
    ? overdueJobs.map(function(j){return'<div style="padding:8px 10px;border:1px solid rgba(220,53,69,.3);border-radius:8px;margin-bottom:8px;background:rgba(220,53,69,.04);display:flex;align-items:center;gap:8px;">'
      +'<div style="flex:1;cursor:pointer" onclick="openDetail(\''+j.id+'\')">'
      +'<strong style="color:#dc3545">'+j.name+'</strong>'
      +'<div style="font-size:12px;color:var(--muted);margin-top:1px;">Pickup was: '+fd(j.binPickup)+(j.binSize?' · '+j.binSize:'')+'</div>'
      +'</div>'
      +'<button class="btn btn-ghost btn-sm" onclick="markPickedUp(\''+j.id+'\',event)" style="font-size:11px;white-space:nowrap">✅ Picked Up</button>'
      +'</div>';}).join('')
    :'<div style="color:var(--muted);font-size:13px;padding:12px;text-align:center">✅ No overdue pickups</div>';

  var overdueCard=document.getElementById('card-overdue');
  if(overdueCard) overdueCard.className='chart-card '+(overdueJobs.length>0?'urgency-warn':'urgency-ok');

  renderDashLongBins();
  renderWeekCal();
  renderDashBinsOut();

  // Keep hidden stub IDs up to date so nothing else breaks
  var upcomingHdrEl=document.getElementById('upcoming-hdr-lbl');
  if(upcomingHdrEl) upcomingHdrEl.textContent='';
}

async function renderDashBinsOut(){
  var el=document.getElementById('dash-bins-out-list');if(!el)return;
  // Get all active dropped bin rental jobs — these are the bins currently out
  var droppedRes=await db.from('jobs').select('*').eq('service','Bin Rental').eq('bin_instatus','dropped').not('status','in','("Done","Cancelled")').order('bin_dropoff');
  var droppedJobs=(droppedRes.data||[]).map(dbToJob);
  // Also get binItems marked 'out' with no active dropped job (stale/unlinked)
  var outBins=binItems.filter(function(b){return b.status==='out';});
  var assignedBids={};
  droppedJobs.forEach(function(j){if(j.binBid)assignedBids[j.binBid]=true;});
  var unlinkedBins=outBins.filter(function(b){return !assignedBids[b.bid];});

  if(!droppedJobs.length&&!unlinkedBins.length){el.innerHTML='<div style="color:var(--muted);font-size:13px;padding:12px;text-align:center">All bins are in the yard</div>';return;}

  // Group by size
  var grouped={};
  droppedJobs.forEach(function(j){
    var sz=j.binSize||'Unknown';
    if(!grouped[sz])grouped[sz]=[];
    grouped[sz].push({type:'job',job:j});
  });
  unlinkedBins.forEach(function(b){
    var sz=b.size||'Unknown';
    if(!grouped[sz])grouped[sz]=[];
    grouped[sz].push({type:'bin',bin:b});
  });
  var sizeOrder=['4 yard','7 yard','14 yard','20 yard','Unknown'];
  var sizeKeys=Object.keys(grouped).sort(function(a,b){return (sizeOrder.indexOf(a)===-1?99:sizeOrder.indexOf(a))-(sizeOrder.indexOf(b)===-1?99:sizeOrder.indexOf(b));});

  function renderOutCard(item){
    if(item.type==='job'){
      var j=item.job;
      var binLabel=j.binBid?j.binBid:'No bin #';
      var binBg=j.binBid?'rgba(220,53,69,.12)':'rgba(230,126,34,.12)';
      var binClr=j.binBid?'#dc3545':'#e67e22';
      var binBorder=j.binBid?'rgba(220,53,69,.35)':'rgba(230,126,34,.35)';
      var borderLeft=j.binBid?'#dc3545':'#e67e22';
      var daysOut='';
      var dropDate=j.binDropoff||j.date;
      if(dropDate){var d0=new Date(dropDate+'T12:00:00'),now=new Date();daysOut=Math.max(0,Math.floor((now-d0)/(86400000)))+' days';}
      var pickupBtn='<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();dashMarkPickedUp(\''+j.id+'\',\''+(j.binBid||'')+'\')" style="font-size:11px;white-space:nowrap;padding:3px 10px;border:1px solid rgba(34,197,94,.3);color:#22c55e;border-radius:6px;margin-left:auto;flex-shrink:0">✅ Picked Up</button>';
      return '<div style="padding:8px 12px;border:1px solid var(--border);border-left:3px solid '+borderLeft+';border-radius:0 8px 8px 0;margin-bottom:5px;background:var(--surface2);cursor:pointer" onclick="openDetail(\''+j.id+'\')">'
        +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
          +'<span style="font-size:12px;background:'+binBg+';color:'+binClr+';border:1px solid '+binBorder+';border-radius:5px;padding:1px 7px;font-weight:700">'+binLabel+'</span>'
          +'<strong style="font-size:13px">'+j.name+'</strong>'
          +(j.phone?'<span style="font-size:11px;color:var(--muted)">'+j.phone+'</span>':'')
          +pickupBtn
        +'</div>'
        +'<div style="font-size:11px;color:var(--muted);margin-top:2px">📍 '+(j.address||'').split(',')[0]+(j.city?' · '+j.city:'')+(daysOut?' · '+daysOut:'')+(j.binPickup?' · Pickup: '+fd(j.binPickup):'')+'</div>'
      +'</div>';
    } else {
      var b=item.bin;
      return '<div style="padding:8px 12px;border:1px solid var(--border);border-left:3px solid var(--muted);border-radius:0 8px 8px 0;margin-bottom:5px;background:var(--surface2)">'
        +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
          +'<span style="font-size:12px;background:rgba(134,142,150,.12);color:var(--muted);border:1px solid rgba(134,142,150,.35);border-radius:5px;padding:1px 7px;font-weight:700">'+b.num+'</span>'
          +'<span style="font-size:12px;color:var(--muted);font-style:italic">Not linked to a job</span>'
          +'<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openLinkBinToJob(\''+b.bid+'\')" style="font-size:11px;padding:2px 8px">🔗 Link</button>'
        +'</div>'
      +'</div>';
    }
  }

  el.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">'
    +sizeKeys.map(function(sz){
      return '<div>'
        +'<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid var(--border)">'+sz+' <span style="font-size:11px;font-weight:600;color:var(--accent)">('+grouped[sz].length+')</span></div>'
        +grouped[sz].map(renderOutCard).join('')
      +'</div>';
    }).join('')
  +'</div>';
}

// ── CONFIRM JOB quick action ──────────────────────────────
async function confirmJob(id, e){
  if(e)e.stopPropagation();
  var j=jobs.find(function(x){return x.id===id;});
  if(!j)return;
  j.confirmed=true;
  // Immediately remove from callback list DOM — don't wait for DB round-trip
  var cbEl = document.getElementById('dash-callback-list');
  if(cbEl){
    // Find and remove the row containing this job's confirm button
    var rows = cbEl.querySelectorAll('div[style*="border-left"]');
    rows.forEach(function(row){
      if(row.innerHTML.indexOf("confirmJob('"+id+"'") >= 0 || row.innerHTML.indexOf('confirmJob(\''+id+'\'') >= 0){
        row.remove();
      }
    });
    // If no rows left, show the "all confirmed" message
    var remaining = cbEl.querySelectorAll('div[style*="border-left"]');
    if(!remaining.length){
      cbEl.innerHTML='<div style="color:var(--muted);font-size:13px;padding:10px;text-align:center">✅ All pickups &amp; drop-offs confirmed</div>';
    }
  }
  // Also update the today's jobs section — hide the confirm button for this job
  document.querySelectorAll('[onclick*="confirmJob(\''+id+'\'"]').forEach(function(btn){ btn.remove(); });
  toast('✅ '+j.name+' confirmed!');
  // Save to DB in background
  db.from('jobs').update({confirmed:true}).eq('id',id).then(function(){});
}

// ─── JOBS TABLE ───
function setSvc(v,el){
  svcF=v;
  document.querySelectorAll('#view-jobs .filter-chip').forEach(function(c){c.classList.remove('active');});
  if(el)el.classList.add('active');
  // Handle BinsOut special view
  var binsOutView=document.getElementById('jobs-bins-out-view');
  var catView=document.getElementById('jobs-cat-view');
  var singleView=document.getElementById('jobs-single-view');
  if(v==='BinsOut'){
    if(binsOutView)binsOutView.style.display='block';
    if(catView)catView.style.display='none';
    if(singleView)singleView.style.display='none';
    renderJobsBinsOut();
    return;
  }
  if(binsOutView)binsOutView.style.display='none';
  jobsPage=0;loadJobsPage(0);
}
function renderJobsBinsOut(){
  var el=document.getElementById('jobs-bins-out-list');if(!el)return;
  var outBins=binItems.filter(function(b){return b.status==='out';});
  if(!outBins.length){el.innerHTML='<div style="color:var(--muted);font-size:13px;padding:20px;text-align:center">All bins are currently in the yard</div>';return;}
  el.innerHTML='<div style="display:grid;gap:6px">'+outBins.map(function(b){
    var curJob=jobs.find(function(j){return j.binBid===b.bid&&j.status!=='Done'&&j.status!=='Cancelled';});
    var name=curJob?curJob.name:'Unknown';
    var addr=curJob?(curJob.address||'').split(',')[0]:'';
    var city=curJob?curJob.city:'';
    var phone=curJob?curJob.phone:'';
    var jobId=curJob?curJob.id:'';
    var dropDate=curJob?(curJob.binDropoff||curJob.date):'';
    var pickDate=curJob?curJob.binPickup:'';
    var daysOut='';
    if(dropDate){var d0=new Date(dropDate+'T12:00:00'),now=new Date();daysOut=Math.max(0,Math.floor((now-d0)/(86400000)))+' days out';}
    return '<div style="padding:10px 14px;border:1px solid var(--border);border-left:3px solid #dc3545;border-radius:0 8px 8px 0;background:var(--surface2);cursor:pointer" onclick="'+(curJob?'openDetail(\''+jobId+'\')':'')+'">'
      +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        +'<span style="font-size:12px;background:rgba(220,53,69,.12);color:#dc3545;border:1px solid rgba(220,53,69,.35);border-radius:5px;padding:2px 8px;font-weight:700">'+b.num+' · '+b.size+'</span>'
        +'<strong style="font-size:14px">'+name+'</strong>'
        +(phone?'<span style="font-size:12px;color:var(--muted)">'+phone+'</span>':'')
        +(daysOut?'<span style="font-size:11px;color:#e67e22;margin-left:auto;font-weight:600">'+daysOut+'</span>':'')
      +'</div>'
      +(addr?'<div style="font-size:12px;color:var(--muted);margin-top:3px">📍 '+addr+(city?' · '+city:'')+(pickDate?' · Pickup: '+fd(pickDate):'')+(jobId?' · '+jobId:'')+'</div>':'')
    +'</div>';
  }).join('')+'</div>';
}
function setJobStatus(v,el){jobStatusF=v;document.querySelectorAll('[id^="jstf-"]').forEach(function(c){c.classList.remove('active');});if(el)el.classList.add('active');jobsPage=0;loadJobsPage(0);}
function setJobDateFilter(v,el){jobDateF=v;document.querySelectorAll('[id^="jdtf-"]').forEach(function(c){c.classList.remove('active');});if(el)el.classList.add('active');renderJobs();}
function setBinDropFilter(v,el){binDropF=v;document.querySelectorAll('[id^="jbdf-"]').forEach(function(c){c.classList.remove('active');});if(el)el.classList.add('active');renderJobs();}
function setQ(v){searchF=v;renderJobs();}
function matchDateFilter(j){
  if(jobDateF==='all')return true;
  var today=todayStr();
  if(jobDateF==='today')return j.date===today;
  if(jobDateF==='week'){var ws=new Date();ws.setDate(ws.getDate()-ws.getDay());var we=new Date(ws);we.setDate(we.getDate()+6);return j.date>=ws.toISOString().split('T')[0]&&j.date<=we.toISOString().split('T')[0];}
  if(jobDateF==='month'){var now=new Date();var ms=new Date(now.getFullYear(),now.getMonth(),1).toISOString().split('T')[0];var me=new Date(now.getFullYear(),now.getMonth()+1,0).toISOString().split('T')[0];return j.date>=ms&&j.date<=me;}
  return true;
}
// ── JOB TABLE DROPDOWN MANAGER ──────────────────────────────
var _jddOpen = null;
var _jddMenuRef = null;
var _jddWrapRef = null;

function _closeJdd(){
  if(_jddMenuRef){
    _jddMenuRef.classList.remove('jdd-open');
    if(_jddMenuRef.parentNode === document.body){
      document.body.removeChild(_jddMenuRef);
    }
    if(_jddWrapRef) _jddWrapRef.appendChild(_jddMenuRef);
    _jddMenuRef = null;
    _jddWrapRef = null;
  }
  _jddOpen = null;
}

function _openJdd(wrap, triggerEl){
  if(_jddOpen === wrap){ _closeJdd(); return; }
  _closeJdd();
  var menu = wrap.querySelector('.jdd-menu');
  if(!menu) return;
  var trigger = triggerEl || wrap.querySelector('.jdd-btn') || wrap;
  var rect = trigger.getBoundingClientRect();
  var menuW = 210;
  var top  = rect.bottom + 4;
  var left = rect.left;
  if(left + menuW > window.innerWidth - 8) left = rect.right - menuW;
  if(top + 240 > window.innerHeight) top = rect.top - 240;
  // Move menu to body so it escapes any backdrop-filter stacking context
  _jddMenuRef = menu;
  _jddWrapRef = wrap;
  wrap.removeChild(menu);
  menu.style.position = 'fixed';
  menu.style.top  = top  + 'px';
  menu.style.left = left + 'px';
  menu.style.zIndex = '99999';
  menu.classList.add('jdd-open');
  document.body.appendChild(menu);
  _jddOpen = wrap;
}

function jddToggle(e, id, type){
  e.stopPropagation();
  var wrap = e.currentTarget ? e.currentTarget.closest('.jdd-wrap') : null;
  if(!wrap) return;
  _openJdd(wrap, e.currentTarget);
}

document.addEventListener('click', function(e){
  if(!_jddOpen) return;
  if(_jddMenuRef && _jddMenuRef.contains(e.target)) return;
  if(_jddWrapRef && _jddWrapRef.contains(e.target)) return;
  _closeJdd();
});

function toggleJdd(wrap){
  if(!wrap) return;
  var btn = wrap.querySelector('.jdd-btn') || wrap;
  _openJdd(wrap, btn);
}

function binDropBtn(j){
  if(j.service!=='Bin Rental') return '<td></td>';
  var st = j.binInstatus || '';
  // Current state label & color
  var label, color, dot;
  if(st==='pickedup'){  label='✔ Picked Up';   color='rgba(107,117,133,.8)'; dot='#94a3b8'; }
  else if(st==='dropped'){ label='🚛 Dropped';  color='#22c55e';              dot='#22c55e'; }
  else {                   label='⏳ Not Dropped'; color='#e67e22';            dot='#e67e22'; }

  var html = '<td class="jcell-drop" onclick="event.stopPropagation()" style="padding:8px 12px">'
    +'<div class="jdd-wrap">'
    +'<button class="jdd-btn" onclick="jddToggle(event,\''+j.id+'\',\'drop\')" '
    +' style="border-color:'+(st==='pickedup'?'rgba(107,117,133,.3)':st==='dropped'?'rgba(34,197,94,.3)':'rgba(230,126,34,.4)')+';color:'+color+';background:'+(st==='pickedup'?'rgba(107,117,133,.08)':st==='dropped'?'rgba(34,197,94,.07)':'rgba(230,126,34,.08)')+';">'
    +'<span style="width:7px;height:7px;border-radius:50%;background:'+dot+';flex-shrink:0;display:inline-block"></span>'
    +label+' <span class="jdd-caret">▼</span></button>'
    +'<div class="jdd-menu">'
    +'<button class="jdd-item'+(st===''?' active-item':'')+'" onclick="jddSetDrop(\''+j.id+'\',\'\',event)">'
    +'<span class="jdd-dot" style="background:#e67e22"></span>⏳ Not Dropped</button>'
    +'<button class="jdd-item'+(st==='dropped'?' active-item':'')+'" onclick="jddSetDrop(\''+j.id+'\',\'dropped\',event)">'
    +'<span class="jdd-dot" style="background:#22c55e"></span>🚛 Dropped</button>'
    +'<button class="jdd-item'+(st==='pickedup'?' active-item':'')+'" onclick="jddSetDrop(\''+j.id+'\',\'pickedup\',event)">'
    +'<span class="jdd-dot" style="background:#94a3b8"></span>✔ Picked Up</button>'
    +'</div></div></td>';
  return html;
}

function jddSetDrop(id, newStatus, e){
  if(e) e.stopPropagation();
  if(_jddOpen){_jddOpen.classList.remove('open');_jddOpen=null;}
  jobs.forEach(function(j){ if(j.id===id) j.binInstatus=newStatus; });
  patchJob(id,{binInstatus:newStatus});
  // Surgical DOM update — re-render just the drop status cell
  var row = document.querySelector('tr[data-jid="'+id+'"]');
  if(row){
    var j = jobs.find(function(x){return x.id===id;});
    var dropCell = row.querySelector('.jcell-drop');
    if(j && dropCell) dropCell.outerHTML = binDropBtn(j);
  }
  var label = newStatus===''?'Not Dropped yet':newStatus==='dropped'?'Dropped off!':'Picked up!';
  toast('🚛 '+label);
}

function confirmedHtml(id, confirmed, service, status, binInstatus){
  var needsConfirm = service==='Bin Rental'||service==='Furniture Pickup'||service==='Furniture Delivery';
  if(!needsConfirm) return '<td class="jcell-confirm"></td>';
  // Hide confirm button for Done/Cancelled jobs or already picked-up bins
  if(status==='Done'||status==='Cancelled'||binInstatus==='pickedup') return '<td class="jcell-confirm"></td>';
  var label = service==='Furniture Delivery' ? 'Drop-Off' : 'Pickup';
  var isConf = !!confirmed;

  var html = '<td class="jcell-confirm" onclick="event.stopPropagation()" style="padding:8px 12px">'
    +'<div class="jdd-wrap">'
    +'<button class="jdd-btn" onclick="jddToggle(event,\''+id+'\',\'confirm\')" '
    +' style="border-color:'+(isConf?'rgba(34,197,94,.3)':'rgba(230,126,34,.4)')+';color:'+(isConf?'#22c55e':'#e67e22')+';background:'+(isConf?'rgba(34,197,94,.07)':'rgba(230,126,34,.06)')+';">'
    +'<span style="width:7px;height:7px;border-radius:50%;background:'+(isConf?'#22c55e':'#e67e22')+';flex-shrink:0;display:inline-block"></span>'
    +(isConf?'✅ '+label+' Confirmed':'📞 Confirm '+label)+' <span class="jdd-caret">▼</span></button>'
    +'<div class="jdd-menu">'
    +'<button class="jdd-item'+(isConf?'':' active-item')+'" data-action="confirm" data-jid="'+id+'">'
    +'<span class="jdd-dot" style="background:#e67e22"></span>📞 Needs Confirming</button>'
    +'<button class="jdd-item'+(isConf?' active-item':'')+'" data-action="unconfirm" data-jid="'+id+'">'
    +'<span class="jdd-dot" style="background:#22c55e"></span>✅ '+label+' Confirmed</button>'
    +'</div></div></td>';
  return html;
}
function cycleStatus(id,e){
  if(e)e.stopPropagation();
  var order=['Pending','In Progress','Done'];
  var newStatus;
  jobs.forEach(function(j){if(j.id===id){var i=order.indexOf(j.status);j.status=order[(i+1)%order.length];newStatus=j.status;}});
  patchJob(id,{status:newStatus});toast('Status updated!');refresh();
}
function cycleBinDrop(id,e){
  if(e)e.stopPropagation();
  jobs.forEach(function(j){
    if(j.id!==id)return;
    if(!j.binInstatus||j.binInstatus==='')j.binInstatus='dropped';
    else if(j.binInstatus==='dropped')j.binInstatus='pickedup';
    else j.binInstatus='';
  });
  var j2=jobs.find(function(x){return x.id===id;});
  patchJob(id,{binInstatus:j2?j2.binInstatus:''});refresh();
}
function emailHtml(id, sent){
  if(sent)
    return '<button class="btn btn-sm" data-action="emailunsent" data-jid="'+id+'" style="font-size:13px;padding:8px 14px;background:rgba(13,110,253,.15);border:1px solid rgba(13,110,253,.4);color:#0d6efd;white-space:nowrap">📧 Sent</button>';
  return '<button class="btn btn-ghost btn-sm" data-action="emailsent" data-jid="'+id+'" style="font-size:13px;padding:8px 14px;border-color:rgba(13,110,253,.3);color:#0d6efd;white-space:nowrap">📧 Email</button>';
}
function jobEmail(j){var cl=j.clientId?clients.find(function(c){return c.cid===j.clientId;}):null;if(!cl)return '';return (cl.emails&&cl.emails[0])?cl.emails[0]:(cl.email||'');}
function makeJobRowNoSvc(j){
  var isCancelled = j.status === 'Cancelled';
  var rowStyle = isCancelled ? ' style="opacity:.6"' : '';
  return '<tr data-jid="'+j.id+'" class="job-row"'+rowStyle+'>'
    +'<td>'+jid(j.id,j.service)+'</td>'
    +'<td><strong style="font-size:15px">'+j.name+'</strong><br><span style="font-size:12px;color:var(--muted)">'+(j.phone||'')+(jobEmail(j)?' · '+jobEmail(j):'')+(j.referral?' · 📣 '+j.referral:'')+'</span></td>'
    +'<td style="font-size:15px">'+fd(j.date)+(j.time?'<br><span style="font-size:12px;color:var(--muted)">'+ft(j.time)+'</span>':'')+'</td>'
    +'<td style="font-size:14px;color:var(--muted);max-width:260px;white-space:normal;word-break:break-word">'+( resolveAddr(j).display||'—')+'</td>'
    +binDropBtn(j)
    +confirmedHtml(j.id,j.confirmed,j.service,j.status,j.binInstatus)
    +'<td class="jcell-email">'+emailHtml(j.id,j.emailSent)+'</td>'
    +'<td><div style="display:flex;gap:8px">'
    +(isCancelled?'<span style="font-size:11px;font-weight:700;color:#dc3545;padding:8px 4px">🚫 Cancelled</span>':'<button class="btn btn-ghost btn-sm" data-action="cancel" data-jid="'+j.id+'" style="font-size:11px;padding:6px 10px;color:#dc3545;border-color:rgba(220,53,69,.3)" title="Cancel job">🚫</button>')
    +'<button class="btn btn-ghost btn-sm" data-action="edit" data-jid="'+j.id+'" style="font-size:14px;padding:8px 13px">✏️</button><button class="btn btn-danger btn-sm" data-action="del" data-jid="'+j.id+'" style="font-size:14px;padding:8px 13px">🗑️</button></div></td></tr>';
}
function makeJobRowWithSvc(j){
  var isCancelled = j.status === 'Cancelled';
  var rowStyle = isCancelled ? ' style="opacity:.6"' : '';
  return '<tr data-jid="'+j.id+'" class="job-row"'+rowStyle+'>'
    +'<td>'+jid(j.id,j.service)+'</td>'
    +'<td><strong style="font-size:15px">'+j.name+'</strong><br><span style="font-size:12px;color:var(--muted)">'+(j.phone||'')+(jobEmail(j)?' · '+jobEmail(j):'')+(j.referral?' · 📣 '+j.referral:'')+'</span></td>'
    +'<td>'+sb(j.service)+'</td>'
    +'<td style="font-size:15px">'+fd(j.date)+(j.time?'<br><span style="font-size:12px;color:var(--muted)">'+ft(j.time)+'</span>':'')+'</td>'
    +'<td style="font-size:14px;color:var(--muted);max-width:260px;white-space:normal;word-break:break-word">'+( resolveAddr(j).display||'—')+'</td>'
    +binDropBtn(j)
    +confirmedHtml(j.id,j.confirmed,j.service,j.status,j.binInstatus)
    +'<td class="jcell-email">'+emailHtml(j.id,j.emailSent)+'</td>'
    +'<td><div style="display:flex;gap:8px">'
    +(isCancelled?'<span style="font-size:11px;font-weight:700;color:#dc3545;padding:8px 4px">🚫 Cancelled</span>':'<button class="btn btn-ghost btn-sm" data-action="cancel" data-jid="'+j.id+'" style="font-size:11px;padding:6px 10px;color:#dc3545;border-color:rgba(220,53,69,.3)" title="Cancel job">🚫</button>')
    +'<button class="btn btn-ghost btn-sm" data-action="edit" data-jid="'+j.id+'" style="font-size:14px;padding:8px 13px">✏️</button><button class="btn btn-danger btn-sm" data-action="del" data-jid="'+j.id+'" style="font-size:14px;padding:8px 13px">🗑️</button></div></td></tr>';
}
function emptyJobRow(cols){return '<tr><td colspan="'+cols+'"><div class="empty-state" style="padding:24px"><div class="ei" style="font-size:28px">📋</div><h3>No jobs</h3></div></td></tr>';}
function makeCancelledRow(j){
  return '<tr data-jid="'+j.id+'" class="job-row" style="opacity:.65">'
    +'<td>'+jid(j.id,j.service)+'</td>'
    +'<td><strong style="font-size:15px">'+j.name+'</strong><br><span style="font-size:12px;color:var(--muted)">'+(j.phone||'')+(jobEmail(j)?' · '+jobEmail(j):'')+'</span></td>'
    +'<td style="font-size:14px">'+fd(j.date)+'</td>'
    +'<td style="font-size:13px;color:var(--muted);max-width:260px;white-space:normal;word-break:break-word">'+(resolveAddr(j).display||'—')+'</td>'
    +'<td><div style="display:flex;gap:8px">'
    +'<button class="btn btn-ghost btn-sm" data-action="uncancel" data-jid="'+j.id+'" style="font-size:11px;padding:6px 10px;color:#22c55e;border-color:rgba(34,197,94,.25)" title="Restore job">↩ Restore</button>'
    +'<button class="btn btn-ghost btn-sm" data-action="edit" data-jid="'+j.id+'" style="font-size:13px;padding:7px 11px">✏️</button>'
    +'<button class="btn btn-danger btn-sm" data-action="del" data-jid="'+j.id+'" style="font-size:13px;padding:7px 11px">🗑️</button>'
    +'</div></td></tr>';
}
function makeCancelledRowWithSvc(j){
  return '<tr data-jid="'+j.id+'" class="job-row" style="opacity:.65">'
    +'<td>'+jid(j.id,j.service)+'</td>'
    +'<td><strong style="font-size:15px">'+j.name+'</strong><br><span style="font-size:12px;color:var(--muted)">'+(j.phone||'')+(jobEmail(j)?' · '+jobEmail(j):'')+'</span></td>'
    +'<td>'+sb(j.service)+'</td>'
    +'<td style="font-size:14px">'+fd(j.date)+'</td>'
    +'<td style="font-size:13px;color:var(--muted);max-width:260px;white-space:normal;word-break:break-word">'+(resolveAddr(j).display||'—')+'</td>'
    +'<td><div style="display:flex;gap:8px">'
    +'<button class="btn btn-ghost btn-sm" data-action="uncancel" data-jid="'+j.id+'" style="font-size:11px;padding:6px 10px;color:#22c55e;border-color:rgba(34,197,94,.25)" title="Restore job">↩ Restore</button>'
    +'<button class="btn btn-ghost btn-sm" data-action="edit" data-jid="'+j.id+'" style="font-size:13px;padding:7px 11px">✏️</button>'
    +'<button class="btn btn-danger btn-sm" data-action="del" data-jid="'+j.id+'" style="font-size:13px;padding:7px 11px">🗑️</button>'
    +'</div></td></tr>';
}
function toggleCatSection(el){
  el.classList.toggle('collapsed');
}
function toggleJobSort(field){
  if(jobSort===field){jobSortDir=jobSortDir*-1;}else{jobSort=field;jobSortDir=field==='date'?-1:1;}
  renderJobs();
}
function sortJobList(arr){
  var dir=jobSortDir;
  var field=jobSort;
  return arr.sort(function(a,b){
    var va,vb;
    if(field==='id'){va=a.id;vb=b.id;var na=parseInt(va.replace(/\D/g,'')),nb=parseInt(vb.replace(/\D/g,''));if(!isNaN(na)&&!isNaN(nb))return (na-nb)*dir;return va<vb?-dir:va>vb?dir:0;}
    if(field==='name'){va=(a.name||'').toLowerCase();vb=(b.name||'').toLowerCase();return va<vb?-dir:va>vb?dir:0;}
    if(field==='date'){return (new Date(a.date)-new Date(b.date))*dir;}
    if(field==='address'){va=(a.address||'').toLowerCase();vb=(b.address||'').toLowerCase();return va<vb?-dir:va>vb?dir:0;}
    if(field==='service'){va=(a.service||'');vb=(b.service||'');return va<vb?-dir:va>vb?dir:0;}
    return 0;
  });
}
function renderJobs(){
  var q=searchF.toLowerCase();
  function m(j){return !q||j.name.toLowerCase().indexOf(q)>=0||(j.address||'').toLowerCase().indexOf(q)>=0||(j.city||'').toLowerCase().indexOf(q)>=0||j.id.toLowerCase().indexOf(q)>=0;}
  function matchStatus(j){return jobStatusF==='all'||j.status===jobStatusF;}
  function matchBinDrop(j){
    if(binDropF==='all')return true;
    if(j.service!=='Bin Rental')return binDropF==='all';
    if(binDropF==='pending')return !j.binInstatus||j.binInstatus==='';
    if(binDropF==='dropped')return j.binInstatus==='dropped';
    if(binDropF==='pickedup')return j.binInstatus==='pickedup';
    return true;
  }
  var all=sortJobList([].concat(jobs));

  // Show/hide cancelled section
  var cancelledSection = document.getElementById('jobs-cancelled-section');
  var showingCancelled = svcF === 'Cancelled';

  if(svcF==='all'){
    document.getElementById('jobs-cat-view').style.display='block';document.getElementById('jobs-single-view').style.display='none';
    if(cancelledSection) cancelledSection.style.display='none';
    var br=all.filter(function(j){return j.service==='Bin Rental'&&j.status!=='Cancelled'&&m(j)&&matchStatus(j)&&matchDateFilter(j)&&matchBinDrop(j);});
    var jr=all.filter(function(j){return j.service==='Junk Removal'&&j.status!=='Cancelled'&&m(j)&&matchStatus(j)&&matchDateFilter(j);});
    var qr=all.filter(function(j){return j.service==='Junk Quote'&&j.status!=='Cancelled'&&m(j)&&matchStatus(j)&&matchDateFilter(j);});
    var fr=all.filter(function(j){return (j.service==='Furniture Pickup'||j.service==='Furniture Delivery')&&j.status!=='Cancelled'&&m(j)&&matchStatus(j)&&matchDateFilter(j);});
    document.getElementById('jobs-bin-count').textContent=br.length+' job'+(br.length!==1?'s':'');
    document.getElementById('jobs-junk-count').textContent=jr.length+' job'+(jr.length!==1?'s':'');
    document.getElementById('jobs-quote-count').textContent=qr.length+' quote'+(qr.length!==1?'s':'');
    document.getElementById('jobs-furn-count').textContent=fr.length+' job'+(fr.length!==1?'s':'');
    document.getElementById('jobs-bin-tbody').innerHTML=br.length?br.map(makeJobRowNoSvc).join(''):emptyJobRow(8);
    document.getElementById('jobs-junk-tbody').innerHTML=jr.length?jr.map(makeJobRowNoSvc).join(''):emptyJobRow(7);
    document.getElementById('jobs-quote-tbody').innerHTML=qr.length?qr.map(makeJobRowNoSvc).join(''):emptyJobRow(7);
    document.getElementById('jobs-furn-tbody').innerHTML=fr.length?fr.map(makeJobRowWithSvc).join(''):emptyJobRow(8);
  } else if(showingCancelled){
    document.getElementById('jobs-cat-view').style.display='block';document.getElementById('jobs-single-view').style.display='none';
    ['jobs-bin-count','jobs-junk-count','jobs-quote-count','jobs-furn-count'].forEach(function(id){var el=document.getElementById(id);if(el)el.closest('.cat-section').style.display='none';});
    if(cancelledSection) cancelledSection.style.display='block';
    var cr=all.filter(function(j){return j.status==='Cancelled'&&m(j)&&matchDateFilter(j);});
    var crBin  =cr.filter(function(j){return j.service==='Bin Rental';});
    var crJunk =cr.filter(function(j){return j.service==='Junk Removal';});
    var crQuote=cr.filter(function(j){return j.service==='Junk Quote';});
    var crFurn =cr.filter(function(j){return j.service==='Furniture Pickup'||j.service==='Furniture Delivery';});
    document.getElementById('jobs-cancelled-bin-count').textContent=crBin.length+' job'+(crBin.length!==1?'s':'');
    document.getElementById('jobs-cancelled-junk-count').textContent=crJunk.length+' job'+(crJunk.length!==1?'s':'');
    document.getElementById('jobs-cancelled-quote-count').textContent=crQuote.length+' quote'+(crQuote.length!==1?'s':'');
    document.getElementById('jobs-cancelled-furn-count').textContent=crFurn.length+' job'+(crFurn.length!==1?'s':'');
    document.getElementById('jobs-cancelled-bin-tbody').innerHTML=crBin.length?crBin.map(makeCancelledRow).join(''):emptyJobRow(5);
    document.getElementById('jobs-cancelled-junk-tbody').innerHTML=crJunk.length?crJunk.map(makeCancelledRow).join(''):emptyJobRow(5);
    document.getElementById('jobs-cancelled-quote-tbody').innerHTML=crQuote.length?crQuote.map(makeCancelledRow).join(''):emptyJobRow(5);
    document.getElementById('jobs-cancelled-furn-tbody').innerHTML=crFurn.length?crFurn.map(makeCancelledRowWithSvc).join(''):emptyJobRow(6);
  } else if(svcF==='Recurring'){
    if(cancelledSection) cancelledSection.style.display='none';
    ['jobs-bin-count','jobs-junk-count','jobs-quote-count','jobs-furn-count'].forEach(function(id){var el=document.getElementById(id);if(el)el.closest('.cat-section').style.display='block';});
    document.getElementById('jobs-cat-view').style.display='none';document.getElementById('jobs-single-view').style.display='block';
    var filt=all.filter(function(j){return j.recurring&&j.status!=='Cancelled'&&m(j)&&matchStatus(j)&&matchDateFilter(j);});
    document.getElementById('jobs-tbody').innerHTML=filt.length?filt.map(makeJobRowWithSvc).join(''):emptyJobRow(8);
  } else {
    if(cancelledSection) cancelledSection.style.display='none';
    ['jobs-bin-count','jobs-junk-count','jobs-quote-count','jobs-furn-count'].forEach(function(id){var el=document.getElementById(id);if(el)el.closest('.cat-section').style.display='block';});
    document.getElementById('jobs-cat-view').style.display='none';document.getElementById('jobs-single-view').style.display='block';
    var filt=all.filter(function(j){return j.service===svcF&&j.status!=='Cancelled'&&m(j)&&matchStatus(j)&&matchDateFilter(j)&&matchBinDrop(j);});
    document.getElementById('jobs-tbody').innerHTML=filt.length?filt.map(makeJobRowWithSvc).join(''):emptyJobRow(8);
  }
}

// Event delegation for job table rows - single click, no double-fire
(function(){
  function handleJobTableClick(e){
    var btn = e.target.closest('[data-action]');
    var row = e.target.closest('tr.job-row');
    if(!row) return;
    if(btn){
      e.stopPropagation();
      if(_jddOpen){_jddOpen.classList.remove('open');_jddOpen=null;}
      var id = btn.getAttribute('data-jid');
      var action = btn.getAttribute('data-action');
      if(action==='confirm'){
        jobs.forEach(function(j){if(j.id===id)j.confirmed=true;});
        patchJob(id,{confirmed:true}); toast('✅ Confirmed!');
        row.querySelector('.jcell-confirm').outerHTML = confirmedHtml(id,true, (jobs.find(function(j){return j.id===id;})||{}).service||'Bin Rental');
      } else if(action==='unconfirm'){
        jobs.forEach(function(j){if(j.id===id)j.confirmed=false;});
        patchJob(id,{confirmed:false}); toast('Confirmation removed.');
        row.querySelector('.jcell-confirm').outerHTML = confirmedHtml(id,false, (jobs.find(function(j){return j.id===id;})||{}).service||'Bin Rental');
      } else if(action==='emailsent'){
        jobs.forEach(function(j){if(j.id===id)j.emailSent=true;});
        patchJob(id,{emailSent:true}); toast('Email marked sent!');
        row.querySelector('.jcell-email').innerHTML = emailHtml(id,true);
      } else if(action==='emailunsent'){
        jobs.forEach(function(j){if(j.id===id)j.emailSent=false;});
        patchJob(id,{emailSent:false}); toast('Email cleared.');
        row.querySelector('.jcell-email').innerHTML = emailHtml(id,false);
      } else if(action==='edit'){
        openEdit(id);
      } else if(action==='del'){
        delJob(id);
      } else if(action==='cancel'){
        if(confirm('Mark this job as Cancelled?')){
          var jc=jobs.find(function(x){return x.id===id;});
          if(jc){
            jc.status='Cancelled';
            if(jc.binBid){binItems.forEach(function(b){if(b.bid===jc.binBid)b.status='in';});saveBins();}
            saveSingleJob(jc);
            toast('Job cancelled.');
            loadJobsPage(jobsPage);
          }
        }
      } else if(action==='uncancel'){
        var ju=jobs.find(function(x){return x.id===id;});
        if(ju){ju.status='Pending';saveSingleJob(ju);toast('Job restored to Pending.');loadJobsPage(jobsPage);}
      }
      return;
    }
    // Clicked on the row itself (not a button) — open detail
    var id = row.getAttribute('data-jid');
    if(id) openDetail(id);
  }
  document.addEventListener('click', function(e){
    var tbody = e.target.closest('tbody');
    if(tbody) handleJobTableClick(e);
  });
})();

// ─── CALENDAR ───
var dragJobId=null;
async function renderCal(){
  var y=calDate.getFullYear(),mo=calDate.getMonth();
  document.getElementById('cal-lbl').textContent=new Date(y,mo,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
  var first=new Date(y,mo,1).getDay(),days=new Date(y,mo+1,0).getDate();
  var today=new Date();
  var todayISO=today.toISOString().split('T')[0];
  var clsMap={'Bin Rental':'svc-bin','Junk Removal':'svc-junk','Junk Quote':'svc-quote','Furniture Pickup':'svc-furn','Furniture Delivery':'svc-furn'};
  var g=document.getElementById('cal-grid');
  var h=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(d){return'<div class="cal-day-header">'+d+'</div>';}).join('');
  var c=Array(first).fill('<div class="cal-day empty"></div>').join('');

  // Load jobs for this month from DB so calendar shows ALL jobs
  var monthStart=y+'-'+String(mo+1).padStart(2,'0')+'-01';
  var monthEnd=y+'-'+String(mo+1).padStart(2,'0')+'-'+String(days).padStart(2,'0');
  var calJobsList=[];
  try{
    // Get all jobs with date, bin_dropoff, or bin_pickup in this month
    var [rDate, rDrop, rPick] = await Promise.all([
      db.from('jobs').select('*').neq('status','Cancelled').gte('date',monthStart).lte('date',monthEnd),
      db.from('jobs').select('*').eq('service','Bin Rental').neq('status','Cancelled').gte('bin_dropoff',monthStart).lte('bin_dropoff',monthEnd),
      db.from('jobs').select('*').eq('service','Bin Rental').neq('status','Cancelled').gte('bin_pickup',monthStart).lte('bin_pickup',monthEnd)
    ]);
    var seen={};
    [(rDate.data||[]),(rDrop.data||[]),(rPick.data||[])].forEach(function(arr){
      arr.forEach(function(row){
        if(!seen[row.id||row.job_id]){seen[row.id||row.job_id]=true;calJobsList.push(dbToJob(row));}
      });
    });
  }catch(e){console.warn('Calendar load error:',e);calJobsList=jobs;}

  // Build a lookup: date string -> array of cal events
  // Each event has { job, type } where type = 'dropoff' | 'pickup' | 'job'
  var calEvents = {}; // ds -> [{j, type, label}]
  calJobsList.forEach(function(j){
    if(j.status==='Cancelled') return;
    if(j.service==='Bin Rental'){
      // Drop-off event: use binDropoff date, fall back to j.date
      var dropDs = j.binDropoff || j.date;
      if(dropDs){
        if(!calEvents[dropDs]) calEvents[dropDs]=[];
        calEvents[dropDs].push({j:j, type:'dropoff'});
      }
      // Pickup event: use binPickup date (separate from drop-off)
      if(j.binPickup && j.binPickup !== dropDs){
        if(!calEvents[j.binPickup]) calEvents[j.binPickup]=[];
        calEvents[j.binPickup].push({j:j, type:'pickup'});
      }
    } else {
      // Non-bin jobs just use j.date
      if(j.date){
        if(!calEvents[j.date]) calEvents[j.date]=[];
        calEvents[j.date].push({j:j, type:'job'});
      }
    }
  });

  for(var d=1;d<=days;d++){
    var ds=y+'-'+String(mo+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var evs=calEvents[ds]||[];
    var isT=today.getDate()===d&&today.getMonth()===mo&&today.getFullYear()===y;

    var dots=evs.map(function(ev){
      var j=ev.j;
      var cls=clsMap[j.service]||'svc-junk';
      var icon, label, titleStr;
      if(ev.type==='pickup'){
        icon='🚚'; label=j.name; titleStr='Bin Pickup · '+j.name+(j.binSize?' · '+j.binSize:'')+(j.materialType?' · '+j.materialType:'');
        cls='svc-bin';
      } else if(ev.type==='dropoff'){
        icon='🚛'; label=j.name; titleStr='Bin Drop-off · '+j.name+(j.binSize?' · '+j.binSize:'')+(j.materialType?' · '+j.materialType:'');
      } else {
        var iconMap={'Junk Removal':'🗑️','Junk Quote':'📋','Furniture Pickup':'🛋️','Furniture Delivery':'📦'};
        icon=iconMap[j.service]||''; label=j.name; titleStr=j.service+' · '+j.name+(j.toolsNeeded?' · 🔧 '+j.toolsNeeded:'');
      }
      var timeStr=j.time?ft(j.time)+' ':'';
      return '<div class="cal-dot '+cls+'" draggable="true" data-jid="'+j.id+'" data-evtype="'+ev.type+'" onclick="event.stopPropagation();openDetail(\''+j.id+'\')" title="Drag to reschedule · '+titleStr+'">'+icon+' '+timeStr+label+(j.address?' · '+(j.address||'').split(',')[0].substring(0,18):'')+'</div>';
    }).join('');

    // Vehicle blocks for this day (from blocking days system only)
    var vehDots='';
    vehicles.forEach(function(v){
      var b=(vehBlocks[v.vid]||{})[ds];
      if(b){vehDots+='<div style="font-size:9px;padding:1px 5px;border-radius:3px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:'+v.color+'22;color:'+v.color+';border:1px solid '+v.color+'33" title="'+v.name+': '+(b.reason||'Blocked')+(b.notes?' — '+b.notes:'')+'" onclick="event.stopPropagation()">🚫 '+v.name+'</div>';}
    });

    var countBadge=evs.length>0?'<span style="float:right;font-size:10px;font-weight:700;background:var(--accent);color:#fff;border-radius:99px;padding:0 5px;line-height:16px;margin-top:1px">'+evs.length+'</span>':'';
    c+='<div class="cal-day'+(isT?' today':'')+'" data-date="'+ds+'" onclick="openCalDayPreview(\''+ds+'\')">'
      +'<div class="cal-day-num">'+d+countBadge+'</div>'
      +dots+vehDots+'</div>';
  }
  g.innerHTML=h+c;
  // Attach drag events
  g.querySelectorAll('.cal-dot[draggable]').forEach(function(dot){
    dot.addEventListener('dragstart',function(e){dragJobId=dot.getAttribute('data-jid');dot.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
    dot.addEventListener('dragend',function(){dot.classList.remove('dragging');dragJobId=null;});
  });
  g.querySelectorAll('.cal-day:not(.empty)').forEach(function(cell){
    cell.addEventListener('dragover',function(e){if(dragJobId){e.preventDefault();cell.classList.add('drag-over');}});
    cell.addEventListener('dragleave',function(){cell.classList.remove('drag-over');});
    cell.addEventListener('drop',function(e){
      e.preventDefault();cell.classList.remove('drag-over');
      var newDate=cell.getAttribute('data-date');
      if(!dragJobId||!newDate)return;
      jobs.forEach(function(j){if(j.id===dragJobId)j.date=newDate;});
      patchJob(dragJobId,{date:newDate});toast('Job rescheduled to '+fd(newDate)+'!');renderCal();renderWeekCal();renderDash();
    });
  });
}
function shiftMonth(d){calDate.setMonth(calDate.getMonth()+d);renderCal();}

// ── Calendar day preview modal ──────────────────────────────
async function openCalDayPreview(ds){
  if(dragJobId) return; // don't open while dragging

  // Load jobs for this day from DB so we show ALL jobs
  var evs=[];
  try{
    var [rDate,rDrop,rPick]=await Promise.all([
      db.from('jobs').select('*').neq('status','Cancelled').eq('date',ds),
      db.from('jobs').select('*').eq('service','Bin Rental').neq('status','Cancelled').eq('bin_dropoff',ds),
      db.from('jobs').select('*').eq('service','Bin Rental').neq('status','Cancelled').eq('bin_pickup',ds)
    ]);
    var seen={};var dayJobs=[];
    [(rDate.data||[]),(rDrop.data||[]),(rPick.data||[])].forEach(function(arr){
      arr.forEach(function(row){if(!seen[row.id||row.job_id]){seen[row.id||row.job_id]=true;dayJobs.push(dbToJob(row));}});
    });
    dayJobs.forEach(function(j){
      if(j.status==='Cancelled')return;
      if(j.service==='Bin Rental'){
        var dropDs=j.binDropoff||j.date;
        if(dropDs===ds) evs.push({j:j,type:'dropoff'});
        if(j.binPickup===ds&&j.binPickup!==dropDs) evs.push({j:j,type:'pickup'});
      }else{
        if(j.date===ds) evs.push({j:j,type:'job'});
      }
    });
  }catch(e){console.warn('Day preview load error:',e);}

  var dateLabel=new Date(ds+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});

  var body;
  if(!evs.length){
    body='<div style="text-align:center;padding:32px 16px;color:var(--muted)">'
      +'<div style="font-size:36px;margin-bottom:10px">📅</div>'
      +'<div style="font-size:14px">No jobs on this day</div>'
      +'<button class="btn btn-primary" style="margin-top:16px" onclick="closeM(\'cal-day-modal\');newJob()">+ Book a Job</button>'
      +'</div>';
  } else {
    // Group into sections: Bin Drop-offs, Bin Pickups, then other services
    var sections=[
      {key:'dropoff', label:'🚛 Bin Drop-offs',  col:'#22c55e', evs:evs.filter(function(e){return e.type==='dropoff';})},
      {key:'pickup',  label:'🚚 Bin Pickups',    col:'#4ade80', evs:evs.filter(function(e){return e.type==='pickup';})},
      {key:'junk',    label:'🗑️ Junk Removal',   col:'#e67e22', evs:evs.filter(function(e){return e.type==='job'&&e.j.service==='Junk Removal';})},
      {key:'quote',   label:'📋 Junk Quotes',    col:'#0d6efd', evs:evs.filter(function(e){return e.type==='job'&&e.j.service==='Junk Quote';})},
      {key:'furnp',   label:'🛋️ Furniture Pickup',col:'#dc3545', evs:evs.filter(function(e){return e.type==='job'&&e.j.service==='Furniture Pickup';})},
      {key:'furnd',   label:'📦 Furniture Delivery',col:'#e76f7e',evs:evs.filter(function(e){return e.type==='job'&&e.j.service==='Furniture Delivery';})},
    ].filter(function(s){return s.evs.length>0;});

    body=sections.map(function(sec){
      var rows=sec.evs.map(function(ev){
        var j=ev.j;
        var binBadge=j.binSize?'<span style="font-size:11px;background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.25);border-radius:5px;padding:1px 7px;font-weight:600;margin-left:6px">'+j.binSize+'</span>':'';
        var timeBadge=j.time?'<span style="font-size:11px;color:var(--muted);margin-left:6px">'+ft(j.time)+'</span>':'';
        var priceBadge='';
        var cfmBadge=(ev.type==='pickup'||ev.type==='dropoff'||j.service==='Furniture Pickup'||j.service==='Furniture Delivery')
          ?(j.confirmed
            ?'<span style="font-size:10px;color:#22c55e;font-weight:600;background:rgba(34,197,94,.08);border-radius:4px;padding:1px 6px;margin-left:4px">✅ Confirmed</span>'
            :'<span style="font-size:10px;color:#e67e22;font-weight:600;background:rgba(230,126,34,.08);border-radius:4px;padding:1px 6px;margin-left:4px">📞 Unconfirmed</span>')
          :'';
        var extraInfo='';
        if(ev.type==='dropoff') extraInfo='<span style="font-size:11px;color:var(--muted);margin-left:6px">Drop-off'+(j.binPickup?' · Pickup: '+fd(j.binPickup):'')+'</span>';
        if(ev.type==='pickup')  extraInfo='<span style="font-size:11px;color:var(--muted);margin-left:6px">Pickup'+(j.binDropoff?' · Was dropped: '+fd(j.binDropoff):'')+'</span>';
        return '<div onclick="closeM(\'cal-day-modal\');openDetail(\''+j.id+'\')" '
          +'style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--border);border-left:3px solid '+sec.col+';border-radius:0 8px 8px 0;margin-bottom:6px;background:var(--surface2);cursor:pointer;transition:background .12s" '
          +'onmouseover="this.style.background=\'var(--surface)\'" onmouseout="this.style.background=\'var(--surface2)\'">'
          +'<div style="flex:1;min-width:0">'
            +'<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">'
              +'<strong style="font-size:14px">'+j.name+'</strong>'+binBadge+cfmBadge+timeBadge+priceBadge
            +'</div>'
            +'<div style="font-size:11px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
              +j.id+extraInfo+(j.address?' · '+j.address.split(',')[0]:'')+(j.phone?' · '+j.phone:'')
            +'</div>'
          +'</div>'
          +'</div>';
      }).join('');
      return '<div style="margin-bottom:14px">'
        +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:'+sec.col+';margin-bottom:6px">'+sec.label+' ('+sec.evs.length+')</div>'
        +rows+'</div>';
    }).join('');
    body+='<div style="padding-top:12px;border-top:1px solid var(--border)">'
      +'<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="closeM(\'cal-day-modal\');newJob()">+ New Job</button>'
      +'</div>';
  }

  // Inject modal into DOM once, reuse on subsequent clicks
  if(!document.getElementById('cal-day-modal')){
    var div=document.createElement('div');
    div.className='modal-overlay';
    div.id='cal-day-modal';
    div.innerHTML='<div class="modal" style="max-width:520px"><div class="modal-header"><div class="modal-title" id="cal-day-modal-title"></div><button class="modal-close" onclick="closeM(\'cal-day-modal\')">&#x2715;</button></div><div id="cal-day-modal-body" style="max-height:65vh;overflow-y:auto;padding-right:2px"></div></div>';
    div.addEventListener('click',function(e){if(e.target===div)closeM('cal-day-modal');});
    document.body.appendChild(div);
  }
  document.getElementById('cal-day-modal-title').textContent=dateLabel;
  document.getElementById('cal-day-modal-body').innerHTML=body;
  document.getElementById('cal-day-modal').classList.add('open');
}


function getLastName(name){var parts=(name||'').trim().split(/\s+/);return parts.length>1?parts[parts.length-1]:name;}
function getClientRevenue(cid,name){return jobs.filter(function(j){return cid?j.clientId===cid:(j.name&&j.name.toLowerCase()===name.toLowerCase());}).reduce(function(s,j){return s+(parseFloat(j.price)||0);},0);}
function getClientLastJobDate(cid,name){var cjobs=jobs.filter(function(j){return cid?j.clientId===cid:(j.name&&j.name.toLowerCase()===name.toLowerCase());});if(!cjobs.length)return null;return cjobs.map(function(j){return j.date;}).sort().pop();}

// ─── CLIENTS ───
var _clientSearchTimer=null;
var _selectedClientObj=null;

function clientSearchDebounce(q){
  clearTimeout(_clientSearchTimer);
  _clientSearchTimer=setTimeout(function(){clientSearchLive(q);},220);
}

async function clientSearchLive(q){
  var box=document.getElementById('f-client-results');
  if(!box)return;
  q=(q||'').trim();
  if(!q){box.style.display='none';return;}
  box.style.display='block';
  box.innerHTML='<div style="padding:10px 14px;color:var(--muted);font-size:13px">Searching...</div>';
  try{
    var r=await db.from('clients').select('*')
      .or('name.ilike.%'+q+'%,phone.ilike.%'+q+'%,city.ilike.%'+q+'%')
      .order('name').limit(12);
    if(r.error){box.innerHTML='<div style="padding:10px 14px;color:#dc3545;font-size:13px">Search error: '+r.error.message+'</div>';return;}
    if(!r.data||!r.data.length){box.innerHTML='<div style="padding:10px 14px;color:var(--muted);font-size:13px">No clients found for "'+q+'"</div>';return;}
    box.innerHTML=r.data.map(function(c){
      var ph=c.phone||(c.phones&&c.phones[0]?(c.phones[0].num||c.phones[0]):'');
      return '<div onclick="selectClientResult(\''+c.cid+'\')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">'
        +'<strong>'+c.name+'</strong>'+(ph?' <span style="color:var(--muted)">· '+ph+'</span>':'')
        +(c.city?' <span style="color:var(--muted);font-size:11px">· '+c.city+'</span>':'')+'</div>';
    }).join('');
    r.data.forEach(function(c){var cl=dbToClient(c);var idx=clients.findIndex(function(x){return x.cid===cl.cid;});if(idx>=0)clients[idx]=cl;else clients.push(cl);});
  }catch(ex){box.innerHTML='<div style="padding:10px 14px;color:#dc3545;font-size:13px">Error: '+ex.message+'</div>';}
}

function selectClientResult(cid){
  var cl=clients.find(function(c){return c.cid===cid;});
  if(!cl)return;
  _selectedClientObj=cl;
  document.getElementById('f-client-select').value=cid;
  document.getElementById('f-client-search').value='';
  document.getElementById('f-client-results').style.display='none';
  var badge=document.getElementById('f-client-selected-badge');
  var nm=document.getElementById('f-client-selected-name');
  if(badge){badge.style.display='flex';}
  if(nm){nm.textContent='✅ '+cl.name+(cl.phone?' · '+cl.phone:'');}
  fillClientFromSelect(cid);
}

function clearClientSelection(){
  _selectedClientObj=null;
  document.getElementById('f-client-select').value='';
  document.getElementById('f-client-search').value='';
  var badge=document.getElementById('f-client-selected-badge');
  if(badge)badge.style.display='none';
  document.getElementById('f-names-wrap').innerHTML=_jobNameRow('');
  document.getElementById('f-phones-wrap').innerHTML=_jobPhoneRow('','','cell');
  document.getElementById('f-emails-wrap').innerHTML=_jobEmailRow('');
  document.getElementById('f-addr').value='';
  document.getElementById('f-city').value='';
  var picker=document.getElementById('f-addr-picker');
  if(picker)picker.style.display='none';
}

function renderClientSelectOptions(){} // no-op, replaced by live search

function fillClientFromSelect(cid){
  if(!cid) return;
  var cl=clients.find(function(c){return c.cid===cid;});
  if(!cl) return;
  // Populate multi-name field
  var names=cl.names&&cl.names.length?cl.names:[cl.name||''];
  document.getElementById('f-names-wrap').innerHTML=names.map(function(n){return _jobNameRow(n);}).join('');
  // Populate multi-phone field
  var phones=cl.phones&&cl.phones.length?cl.phones:(cl.phone?[{num:cl.phone,ext:'',type:'cell'}]:[]);
  document.getElementById('f-phones-wrap').innerHTML=phones.length?phones.map(function(p){return _jobPhoneRow(p.num||p,p.ext||'',p.type||'cell');}).join(''):_jobPhoneRow('','','cell');
  // Populate multi-email field
  var emails=cl.emails&&cl.emails.length?cl.emails:(cl.email?[cl.email]:[]);
  document.getElementById('f-emails-wrap').innerHTML=emails.length?emails.map(function(e){return _jobEmailRow(e);}).join(''):_jobEmailRow('');
  if(cl.referral) document.getElementById('f-referral').value = cl.referral;

  // Build address list
  var addrs=[];
  if(cl.addresses&&cl.addresses.length) addrs=cl.addresses;
  else if(cl.address) addrs=[{street:(cl.address.split(',')[0]||'').trim(),city:cl.city||'Barrie'}];

  var picker=document.getElementById('f-addr-picker');
  var sel=document.getElementById('f-addr-select');

  if(addrs.length>1 && picker && sel){
    var opts=addrs.map(function(a,i){
      var label=a.street?(a.street+(a.city?', '+a.city:'')):(a.city||'');
      return '<option value="'+i+'">'+label+'</option>';
    }).join('');
    opts+='<option value="new">+ Use a new address for this job...</option>';
    sel.innerHTML=opts;
    picker.style.display='block';
    // Fill first address
    pickClientAddress('0');
  } else {
    if(picker) picker.style.display='none';
    var st=(addrs[0]&&addrs[0].street)||'';
    var cy=(addrs[0]&&addrs[0].city)||cl.city||'Barrie';
    document.getElementById('f-addr').value=st;
    document.getElementById('f-city').value=cy;
  }
}

function pickClientAddress(val){
  var cl=_selectedClientObj;
  if(!cl)return;
  var addrs=cl.addresses&&cl.addresses.length?cl.addresses:(cl.address?[{street:(cl.address.split(',')[0]||'').trim(),city:cl.city||'Barrie'}]:[]);
  if(val==='new'){
    document.getElementById('f-addr').value='';
    document.getElementById('f-city').value='Barrie';
    return;
  }
  var a=addrs[parseInt(val)]||{};
  document.getElementById('f-addr').value=a.street||'';
  document.getElementById('f-city').value=a.city||cl.city||'Barrie';
}
function getClientJobStats(cid, name){
  // match by cid or by name if no cid
  var clientJobs = jobs.filter(function(j){
    if(cid) return j.clientId === cid;
    return j.name && j.name.toLowerCase() === name.toLowerCase();
  });
  var bins = clientJobs.filter(function(j){return j.service==='Bin Rental';}).length;
  var junk = clientJobs.filter(function(j){return j.service==='Junk Removal';}).length;
  var furn = clientJobs.filter(function(j){return j.service==='Furniture Pickup'||j.service==='Furniture Delivery';}).length;
  return {bins:bins, junk:junk, furn:furn, total:clientJobs.length, jobs:clientJobs};
}
// ── Client pagination state ────────────────────────────────
var clientsPage = 0;
var clientsPageSize = 50;
var clientsTotal = 0;
var clientSort = 'alpha';
var clientSearchTimer = null;
var _allClientsFiltered = [];  // holds last full filtered+sorted list for export
var clientRangeFilter = { binMin:'', binMax:'', junkMin:'', junkMax:'', furnMin:'', furnMax:'', totalMin:'', totalMax:'' };

// Populate dropdowns with 0–N options once we know the max values
function populateRangeDropdowns(allClients) {
  var maxBin = 0, maxJunk = 0, maxFurn = 0, maxTotal = 0;
  allClients.forEach(function(c){
    if (c._bins  > maxBin)   maxBin   = c._bins;
    if (c._junk  > maxJunk)  maxJunk  = c._junk;
    if (c._furn  > maxFurn)  maxFurn  = c._furn;
    if (c._totalJobs > maxTotal) maxTotal = c._totalJobs;
  });
  function fillSelect(id, max, currentVal) {
    var el = document.getElementById(id); if (!el) return;
    var isMax = id.indexOf('-max') !== -1;
    var saved = el.value || currentVal || '';
    el.innerHTML = '<option value="">' + (isMax ? 'Max' : 'Min') + '</option>';
    for (var i = 0; i <= max; i++) {
      var opt = document.createElement('option');
      opt.value = i; opt.textContent = i;
      if (String(i) === String(saved)) opt.selected = true;
      el.appendChild(opt);
    }
  }
  fillSelect('crange-bin-min',   maxBin,   clientRangeFilter.binMin);
  fillSelect('crange-bin-max',   maxBin,   clientRangeFilter.binMax);
  fillSelect('crange-junk-min',  maxJunk,  clientRangeFilter.junkMin);
  fillSelect('crange-junk-max',  maxJunk,  clientRangeFilter.junkMax);
  fillSelect('crange-furn-min',  maxFurn,  clientRangeFilter.furnMin);
  fillSelect('crange-furn-max',  maxFurn,  clientRangeFilter.furnMax);
  fillSelect('crange-total-min', maxTotal, clientRangeFilter.totalMin);
  fillSelect('crange-total-max', maxTotal, clientRangeFilter.totalMax);
}

function _updateRangePanelUI() {
  var active = clientRangeActive();
  var badge = document.getElementById('client-range-active-badge');
  var clearBtn = document.getElementById('client-range-clear-btn');
  if (badge) badge.style.display = active ? 'inline-block' : 'none';
  if (clearBtn) { clearBtn.style.opacity = active ? '1' : '0'; clearBtn.style.pointerEvents = active ? 'auto' : 'none'; }
  // Highlight active cards
  var cardDefs = [
    { ids:['crange-bin-min','crange-bin-max'],   card:0 },
    { ids:['crange-junk-min','crange-junk-max'],  card:1 },
    { ids:['crange-furn-min','crange-furn-max'],  card:2 },
    { ids:['crange-total-min','crange-total-max'],card:3 },
  ];
  var cards = document.querySelectorAll('.crange-card');
  cardDefs.forEach(function(def, i) {
    var hasVal = def.ids.some(function(id){ var el=document.getElementById(id); return el&&el.value!==''; });
    if (cards[i]) {
      cards[i].classList.toggle('active-filter', hasVal);
      var color = cards[i].getAttribute('data-color');
      var dim   = cards[i].getAttribute('data-color-dim');
      cards[i].style.borderColor = hasVal ? color : '';
      cards[i].style.background  = hasVal ? dim   : '';
    }
  });
}

var _rangePanelOpen = false;
function toggleClientRangePanel() {
  _rangePanelOpen = !_rangePanelOpen;
  var body = document.getElementById('client-range-body');
  var chevron = document.getElementById('client-range-chevron');
  if (body) body.style.display = _rangePanelOpen ? 'block' : 'none';
  if (chevron) chevron.style.transform = _rangePanelOpen ? 'rotate(180deg)' : 'rotate(0deg)';
}

function applyClientRangeFilter() {
  clientRangeFilter.binMin   = document.getElementById('crange-bin-min')   ? document.getElementById('crange-bin-min').value   : '';
  clientRangeFilter.binMax   = document.getElementById('crange-bin-max')   ? document.getElementById('crange-bin-max').value   : '';
  clientRangeFilter.junkMin  = document.getElementById('crange-junk-min')  ? document.getElementById('crange-junk-min').value  : '';
  clientRangeFilter.junkMax  = document.getElementById('crange-junk-max')  ? document.getElementById('crange-junk-max').value  : '';
  clientRangeFilter.furnMin  = document.getElementById('crange-furn-min')  ? document.getElementById('crange-furn-min').value  : '';
  clientRangeFilter.furnMax  = document.getElementById('crange-furn-max')  ? document.getElementById('crange-furn-max').value  : '';
  clientRangeFilter.totalMin = document.getElementById('crange-total-min') ? document.getElementById('crange-total-min').value : '';
  clientRangeFilter.totalMax = document.getElementById('crange-total-max') ? document.getElementById('crange-total-max').value : '';
  _updateRangePanelUI();
  clientsPage = 0;
  renderClients();
}

function clearClientRangeFilters() {
  clientRangeFilter = { binMin:'', binMax:'', junkMin:'', junkMax:'', furnMin:'', furnMax:'', totalMin:'', totalMax:'' };
  ['crange-bin-min','crange-bin-max','crange-junk-min','crange-junk-max',
   'crange-furn-min','crange-furn-max','crange-total-min','crange-total-max'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = '';
  });
  _updateRangePanelUI();
  clientsPage = 0;
  renderClients();
}

function clientRangeActive() {
  var f = clientRangeFilter;
  return f.binMin||f.binMax||f.junkMin||f.junkMax||f.furnMin||f.furnMax||f.totalMin||f.totalMax;
}

function applyRangeToClients(allClients) {
  var f = clientRangeFilter;
  return allClients.filter(function(c) {
    if (f.binMin   !== '' && c._bins      < parseInt(f.binMin,10))   return false;
    if (f.binMax   !== '' && c._bins      > parseInt(f.binMax,10))   return false;
    if (f.junkMin  !== '' && c._junk      < parseInt(f.junkMin,10))  return false;
    if (f.junkMax  !== '' && c._junk      > parseInt(f.junkMax,10))  return false;
    if (f.furnMin  !== '' && c._furn      < parseInt(f.furnMin,10))  return false;
    if (f.furnMax  !== '' && c._furn      > parseInt(f.furnMax,10))  return false;
    if (f.totalMin !== '' && c._totalJobs < parseInt(f.totalMin,10)) return false;
    if (f.totalMax !== '' && c._totalJobs > parseInt(f.totalMax,10)) return false;
    return true;
  });
}

function exportClientList() {
  if (!_allClientsFiltered.length) { toast('No clients to export.'); return; }
  var rows = [['Name','Phone','City','Email','Total Jobs','Bins','Junk','Furniture','Lifetime Revenue','Last Job']];
  _allClientsFiltered.forEach(function(c) {
    rows.push([
      c.name || '',
      c.phone || '',
      c.city  || '',
      c.email || '',
      c._totalJobs || 0,
      c._bins  || 0,
      c._junk  || 0,
      c._furn  || 0,
      (c._totalRev || 0).toFixed(2),
      c._lastDate || ''
    ]);
  });
  var csv = rows.map(function(r){ return r.map(function(v){ return '"'+String(v).replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
  var blob = new Blob([csv], {type:'text/csv'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  var f = clientRangeFilter;
  var label = [];
  if (f.binMin||f.binMax)   label.push('bins'+(f.binMin||'0')+'-'+(f.binMax||'any'));
  if (f.junkMin||f.junkMax) label.push('junk'+(f.junkMin||'0')+'-'+(f.junkMax||'any'));
  if (f.furnMin||f.furnMax) label.push('furn'+(f.furnMin||'0')+'-'+(f.furnMax||'any'));
  if (clientSearchF.trim()) label.push(clientSearchF.trim());
  a.download = 'clients' + (label.length ? '-' + label.join('-') : '') + '.csv';
  a.click();
  toast('Exported ' + _allClientsFiltered.length + ' clients.');
}

function setClientSort(v,el){
  clientSort=v;
  document.querySelectorAll('[id^="csort-"]').forEach(function(b){b.classList.remove('active');});
  if(el) el.classList.add('active');
  clientsPage=0;
  renderClients();
}

function renderClients(){
  clearTimeout(clientSearchTimer);
  clientSearchTimer = setTimeout(loadClientsPage, clientSearchF.trim() ? 200 : 0);
}

// Cache so repeat visits to the clients page are instant
var _clientStatsCache = null;   // { statsMap, nameToCid, allClientRows }
var _clientStatsCacheTime = 0;
var CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadClientsPage() {
  var el = document.getElementById('clients-list');
  el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted);font-size:13px">Loading...</div>';
  var q = clientSearchF.trim();
  var BATCH = 1000;
  var now = Date.now();

  var allClientRows, statsMap, nameToCid;

  // ── Use cache if fresh and no active search filter ─────────────────────────
  if(!q && _clientStatsCache && (now - _clientStatsCacheTime) < CLIENT_CACHE_TTL){
    allClientRows = _clientStatsCache.allClientRows;
    statsMap      = _clientStatsCache.statsMap;
    nameToCid     = _clientStatsCache.nameToCid;
  } else {

    // ── 1. Get total job count for batching ──────────────────────────────────
    var rjCount = await db.from('jobs').select('*', {count:'exact', head:true}).neq('status','Cancelled');
    var totalJobs = rjCount.count || 0;

    // ── 2a. Fetch clients — single query if searching, batched if loading all ─
    if(q) {
      // Search: single query, no batching (avoids running the same search N times)
      var cqSearch = db.from('clients').select('*').order('name',{ascending:true})
        .or('name.ilike.%'+q+'%,phone.ilike.%'+q+'%,city.ilike.%'+q+'%,email.ilike.%'+q+'%,address.ilike.%'+q+'%');
      var rSearch = await cqSearch;
      allClientRows = rSearch.data || [];
    } else {
      // No search: batch-fetch all clients
      var rcCount = await db.from('clients').select('*', {count:'exact', head:true});
      var totalClients = rcCount.count || 0;
      var clientBatches = [];
      for(var i=0; i<Math.max(Math.ceil(totalClients/BATCH),1); i++) clientBatches.push(i);
      var clientResults = await Promise.all(clientBatches.map(function(i){
        return db.from('clients').select('*').order('name',{ascending:true}).range(i*BATCH,(i+1)*BATCH-1);
      }));
      allClientRows = [];
      clientResults.forEach(function(r){ if(r.data) allClientRows = allClientRows.concat(r.data); });
    }

    // ── 2b. Fetch all jobs in parallel batches ────────────────────────────────
    var jobBatches = [];
    for(var j=0; j<Math.max(Math.ceil(totalJobs/BATCH),1); j++) jobBatches.push(j);
    var jobResults = await Promise.all(jobBatches.map(function(i){
      return db.from('jobs').select('*')
        .neq('status','Cancelled').range(i*BATCH, Math.min((i+1)*BATCH-1, totalJobs-1));
    }));
    var allJobRows = [];
    jobResults.forEach(function(r){ if(r.data) allJobRows = allJobRows.concat(r.data); });

    // ── 3. Build name→cid lookup ───────────────────────────────────────────────
    nameToCid = {};
    allClientRows.forEach(function(row){
      if(row.name) nameToCid[row.name.trim().toLowerCase()] = row.cid;
    });

    // ── 4. Build stats map ─────────────────────────────────────────────────────
    statsMap = {};
    allJobRows.forEach(function(row){
      var cid = row.client_cid || (row.name ? nameToCid[row.name.trim().toLowerCase()] : null);
      if(!cid) return;
      if(!statsMap[cid]) statsMap[cid]={total:0,revenue:0,lastDate:null,bins:0,junk:0,furn:0};
      var s = statsMap[cid];
      s.total++;
      s.revenue += parseFloat(row.price)||0;
      if(!s.lastDate||row.date>s.lastDate) s.lastDate=row.date;
      if(row.service==='Bin Rental') s.bins++;
      else if(row.service==='Junk Removal') s.junk++;
      else if(row.service==='Furniture Pickup'||row.service==='Furniture Delivery') s.furn++;
    });

    // Cache for subsequent visits
    if(!q){
      _clientStatsCache = { allClientRows:allClientRows, statsMap:statsMap, nameToCid:nameToCid };
      _clientStatsCacheTime = now;
    }
  }

  // ── 5. Merge stats into client objects ─────────────────────────────────────
  var allClients = allClientRows.map(function(row){
    var c = dbToClient(row);
    var s = statsMap[c.cid]||{total:0,revenue:0,lastDate:null,bins:0,junk:0,furn:0};
    c._totalJobs = s.total;
    c._totalRev  = s.revenue;
    c._lastDate  = s.lastDate;
    c._bins = s.bins; c._junk = s.junk; c._furn = s.furn;
    return c;
  });

  // Cache locally — upsert by cid, then deduplicate to prevent search duplicates
  allClients.forEach(function(c){
    var idx=clients.findIndex(function(x){return x.cid===c.cid;});
    if(idx>=0) clients[idx]=c; else clients.push(c);
  });
  var _seen={}; clients=clients.filter(function(c){ if(!c.cid||_seen[c.cid]) return false; _seen[c.cid]=true; return true; });

  // ── 6. Populate range dropdowns (uses full unfiltered list for accurate maxes)
  populateRangeDropdowns(allClients);
  _updateRangePanelUI();

  // ── 6b. Apply range filters ────────────────────────────────────────────────
  if (clientRangeActive()) {
    allClients = applyRangeToClients(allClients);
  }

  // ── 7. Sort ────────────────────────────────────────────────────────────────
  allClients.sort(function(a,b){
    if(clientSort==='jobs')    return b._totalJobs - a._totalJobs;
    if(clientSort==='revenue') return b._totalRev  - a._totalRev;
    if(clientSort==='recent'){
      // Use last job date; fall back to client created_at for new clients with no jobs
      var aDate = a._lastDate || a.createdAt || '';
      var bDate = b._lastDate || b.createdAt || '';
      if(!aDate&&!bDate) return 0;
      if(!aDate) return 1; if(!bDate) return -1;
      return bDate.localeCompare(aDate);
    }
    if(clientSort==='dormant'){
      if(!a._lastDate&&!b._lastDate) return 0;
      if(!a._lastDate) return -1; if(!b._lastDate) return 1;
      return a._lastDate.localeCompare(b._lastDate);
    }
    return (a.name||'').localeCompare(b.name||'');
  });

  // ── 7b. Blacklist filter ──────────────────────────────────────────────────
  if(clientSort==='blacklist'){
    allClients = allClients.filter(function(c){ return c.blacklisted; });
  }

  // ── 8. Store filtered list for export, then paginate ──────────────────────
  _allClientsFiltered = allClients;
  clientsTotal = allClients.length;
  var pageFrom = clientsPage * clientsPageSize;
  var pageClients = allClients.slice(pageFrom, pageFrom + clientsPageSize);

  renderClientsList(pageClients);
  renderClientsPagination();
  var sub = document.getElementById('clients-sub');
  var filterNote = [];
  var f = clientRangeFilter;
  if (f.binMin||f.binMax)   filterNote.push('bins '+(f.binMin||'0')+'–'+(f.binMax||'any'));
  if (f.junkMin||f.junkMax) filterNote.push('junk '+(f.junkMin||'0')+'–'+(f.junkMax||'any'));
  if (f.furnMin||f.furnMax) filterNote.push('furn '+(f.furnMin||'0')+'–'+(f.furnMax||'any'));
  if (f.totalMin||f.totalMax) filterNote.push('total '+(f.totalMin||'0')+'–'+(f.totalMax||'any'));
  if(sub) sub.textContent = clientsTotal.toLocaleString() + ' clients' + (filterNote.length ? ' · ' + filterNote.join(', ') : ' total');
}

function renderClientsList(list) {
  var el = document.getElementById('clients-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="ei">👥</div><h3>'+(clientSearchF?'No clients found':'No clients yet')+'</h3></div>';
    return;
  }
  var today6mo = new Date(Date.now()-180*86400000).toISOString().split('T')[0];
  el.innerHTML = list.map(function(row){
    var totalJobs = row._totalJobs !== undefined ? row._totalJobs : (row.total_jobs||0);
    var totalRev  = row._totalRev  !== undefined ? row._totalRev  : (row.total_revenue||0);
    var lastDate  = row._lastDate  !== undefined ? row._lastDate  : (row.last_job_date||null);
    var bins      = row._bins      !== undefined ? row._bins      : (row.bin_count||0);
    var junk      = row._junk      !== undefined ? row._junk      : (row.junk_count||0);
    var furn      = row._furn      !== undefined ? row._furn      : (row.furn_count||0);
    var cid = row.cid; var name = row.name||'';
    var isDormant = lastDate && lastDate < today6mo;
    var initials = name.split(' ').map(function(w){return w[0]||'';}).join('').toUpperCase().substring(0,2)||'?';
    var loyalty = totalJobs===0?'':totalJobs===1?'🆕 New':totalJobs<=3?'🔁 Repeat':'⭐ Frequent';
    var dormantBadge = isDormant?'<span style="font-size:11px;padding:2px 8px;border-radius:12px;background:rgba(220,53,69,.12);color:#dc3545;font-weight:600">😴 Dormant 6mo+</span>':'';
    var blacklistBadge = row.blacklisted?'<span style="font-size:11px;padding:2px 8px;border-radius:12px;background:rgba(220,53,69,.18);color:#dc3545;font-weight:700;margin-left:4px">🚫 Blacklisted</span>':'';
    return '<div class="client-card" onclick="openClientDetailSafe(event,\''+cid+'\')" style="'+(row.blacklisted?'border-left:3px solid #dc3545;opacity:.85;':'')+'">'
      +'<div class="client-avatar">'+initials+'</div>'
      +'<div class="client-info">'
      +'<div class="client-name">'+name+'</div>'
      +'<div class="client-meta">'+(function(){
        var phones=(row.phones||[]).filter(function(p){return p&&p.num;});
        if(!phones.length&&row.phone) phones=[{num:row.phone,ext:'',type:'cell'}];
        var phonesDisplay=phones.map(function(p){
          var icon=p.type==='home'?'🏠':p.type==='office'?'🏢':'📱';
          return icon+' '+p.num;
        }).join(' · ');
        return phonesDisplay;
      })()+
      (row.city?' · '+row.city:'')+
      ((row.emails&&row.emails[0])||row.email?' · '+(row.emails&&row.emails[0]?row.emails[0]:(row.email||'')):'')+
      (row.referral?' · '+row.referral:'')+
      '</div>'
      +'<div class="client-stats">'
      +(bins?'<span class="client-stat cs-bin">🚛 '+bins+' bin'+(bins!==1?'s':'')+'</span>':'')
      +(junk?'<span class="client-stat cs-junk">🧹 '+junk+' junk</span>':'')
      +(furn?'<span class="client-stat cs-furn">🛋️ '+furn+' furn</span>':'')
      +(totalJobs===0?'<span class="client-stat" style="background:rgba(255,255,255,.05);color:var(--muted)">No jobs yet</span>':'<span class="client-stat cs-total" style="font-size:17px;padding:4px 12px">'+totalJobs+' jobs</span>')
      +(loyalty?'<span style="font-size:13px;color:var(--muted);margin-left:2px">'+loyalty+'</span>':'')
      +dormantBadge+blacklistBadge+'</div>'
      +(totalRev>0?'<div style="font-size:12px;color:var(--accent);margin-top:4px;font-weight:600">💰 $'+Math.round(totalRev).toLocaleString()+' lifetime'+(lastDate?' · Last: '+fd(lastDate):'')+'</div>':'')
      +'</div>'
      +'<div class="client-actions"><button class="btn btn-ghost btn-sm" onclick="event.preventDefault();event.stopPropagation();editClient(\''+cid+'\')">✏️</button>'
      +'<button class="btn btn-danger btn-sm" onclick="event.preventDefault();event.stopPropagation();delClient(\''+cid+'\')">🗑️</button></div>'
      +'</div>';
  }).join('');
}

function renderClientsPagination() {
  var totalPages = Math.ceil(clientsTotal / clientsPageSize);
  if (totalPages <= 1) { ['clients-pagination-top','clients-pagination-bottom'].forEach(function(id){var el=document.getElementById(id);if(el)el.innerHTML='';}); return; }
  var start = clientsPage*clientsPageSize+1, end = Math.min((clientsPage+1)*clientsPageSize,clientsTotal);
  var html = '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;flex-wrap:wrap;gap:10px;">'
    +'<div style="font-size:13px;color:var(--muted)">Showing <strong style="color:var(--text)">'+start.toLocaleString()+'–'+end.toLocaleString()+'</strong> of <strong style="color:var(--text)">'+clientsTotal.toLocaleString()+'</strong> clients</div>'
    +'<div style="display:flex;gap:6px;align-items:center;">'
    +'<button onclick="clientsPage=0;renderClients()" '+(clientsPage===0?'disabled':'')+' style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px;'+(clientsPage===0?'opacity:.4':'')+'">«</button>'
    +'<button onclick="clientsPage='+(clientsPage-1)+';renderClients()" '+(clientsPage===0?'disabled':'')+' style="padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px;'+(clientsPage===0?'opacity:.4':'')+'">‹ Prev</button>'
    +'<span style="font-size:13px;color:var(--muted);padding:0 8px">Page '+(clientsPage+1)+' of '+totalPages+'</span>'
    +'<button onclick="clientsPage='+(clientsPage+1)+';renderClients()" '+(clientsPage>=totalPages-1?'disabled':'')+' style="padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px;'+(clientsPage>=totalPages-1?'opacity:.4':'')+'">Next ›</button>'
    +'<button onclick="clientsPage='+(totalPages-1)+';renderClients()" '+(clientsPage>=totalPages-1?'disabled':'')+' style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:13px;'+(clientsPage>=totalPages-1?'opacity:.4':'')+'">»</button>'
    +'</div></div>';
  ['clients-pagination-top','clients-pagination-bottom'].forEach(function(id){var el=document.getElementById(id);if(el)el.innerHTML=html;});
}

function openClientDetailSafe(e, cid){ e.preventDefault(); e.stopPropagation(); openClientDetail(cid); }
async function openClientDetail(cid){
  var cl = clients.find(function(c){return c.cid===cid;});
  if (!cl) {
    var r = await db.from('clients').select('*').eq('cid',cid).single();
    if (r.error||!r.data) return;
    cl = dbToClient(r.data); clients.push(cl);
  }
  // Fetch jobs for this client — by client_cid first, then also by name match for old records
  var [rjCid, rjName] = await Promise.all([
    db.from('jobs').select('*').eq('client_cid', cid).order('date',{ascending:false}),
    db.from('jobs').select('*').ilike('name', cl.name).order('date',{ascending:false})
  ]);
  var seenIds = {};
  var clientJobs = [];
  [(rjCid.data||[]), (rjName.data||[])].forEach(function(arr){
    arr.map(dbToJob).forEach(function(j){
      if(!seenIds[j.id]){ seenIds[j.id]=true; clientJobs.push(j); }
    });
  });
  clientJobs.sort(function(a,b){return b.date.localeCompare(a.date);});
  clientJobs.forEach(function(j){ if(!jobs.find(function(x){return x.id===j.id;})) jobs.push(j); });

  var totalRev = clientJobs.reduce(function(s,j){return s+(parseFloat(j.price)||0);},0);
  var bins = clientJobs.filter(function(j){return j.service==='Bin Rental';}).length;
  var junk = clientJobs.filter(function(j){return j.service==='Junk Removal';}).length;
  var furn = clientJobs.filter(function(j){return j.service==='Furniture Pickup'||j.service==='Furniture Delivery';}).length;
  var loyalty = clientJobs.length===0?'New Client':clientJobs.length===1?'🆕 New':clientJobs.length<=3?'🔁 Repeat Customer':'⭐ Frequent Customer';
  document.getElementById('cdet-ttl').textContent = cl.name;
  var jobRows = clientJobs.map(function(j){
    var binInfo=j.service==='Bin Rental'&&j.binSize?' <span style="font-size:11px;color:var(--muted)">'+j.binSize+'</span>':'';
    var dropInfo='';
    if(j.service==='Bin Rental'){
      dropInfo=j.binInstatus==='pickedup'?'<span style="font-size:11px;color:var(--muted)">✔ Picked Up</span>':j.binInstatus==='dropped'?'<span style="font-size:11px;color:#22c55e">🚛 Dropped</span>':'<span style="font-size:11px;color:var(--muted)">⏳ Pending</span>';
    }
    return '<tr onclick="closeM(\'client-detail-modal\');openDetail(\''+j.id+'\')" style="cursor:pointer">'
      +'<td>'+jid(j.id,j.service)+'</td>'
      +'<td>'+sb(j.service)+binInfo+'</td>'
      +'<td>'+fd(j.date)+'</td>'
      
      +'<td>'+dropInfo+'</td>'
      +'</tr>';
  }).join('');
  var names=(cl.names||[cl.name]).filter(Boolean);
  var phones=(cl.phones||[]).filter(function(p){return p&&p.num;});
  if(!phones.length&&cl.phone) phones=[{num:cl.phone,ext:''}];
  var emails=(cl.emails||[]).filter(Boolean);
  if(!emails.length&&cl.email) emails=[cl.email];
  var namesHtml=names.length>1?'<div style="font-size:11px;color:var(--muted);margin-bottom:4px">All Names</div>'+names.map(function(n){return'<div>'+n+'</div>';}).join(''):'';
  var phonesHtml=phones.map(function(p){
    var icon=p.type==='home'?'🏠':p.type==='office'?'🏢':'📱';
    return'<div>'+icon+' '+p.num+(p.ext?' <span style="color:var(--accent)">x'+p.ext+'</span>':'')+'</div>';
  }).join('')||'—';
  var emailsHtml=emails.map(function(e){return'<div><a href="mailto:'+e+'" style="color:var(--accent)">'+e+'</a></div>';}).join('')||'—';
  document.getElementById('cdet-body').innerHTML =
    (cl.blacklisted?'<div style="background:rgba(220,53,69,.12);border:1px solid rgba(220,53,69,.3);border-radius:10px;padding:10px 16px;margin-bottom:12px;font-size:13px;color:#dc3545;font-weight:600">🚫 This client is blacklisted — do not contact for promotions</div>':'')
    +'<div class="detail-section"><div class="detail-grid">'
    +(namesHtml?'<div class="detail-item" style="grid-column:1/-1"><label>Contact Names</label><span>'+namesHtml+'</span></div>':'')
    +'<div class="detail-item"><label>Phone(s)</label><span>'+phonesHtml+'</span></div>'
    +'<div class="detail-item"><label>Email(s)</label><span>'+emailsHtml+'</span></div>'
    +'<div class="detail-item" style="grid-column:1/-1"><label>Address</label><span>'+(cl.address||'—')+'</span></div>'
    +'<div class="detail-item"><label>City</label><span>'+(cl.city||'—')+'</span></div>'
    +'<div class="detail-item"><label>Referral</label><span>'+(cl.referral||'—')+'</span></div>'
    +'</div></div>'
    +'<div class="detail-section"><div class="detail-section-title">📊 Job History</div>'
    +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
    +'<span class="badge badge-progress">'+clientJobs.length+' Jobs</span>'
    +(bins?'<span class="client-stat cs-bin">🚛 '+bins+' Bins</span>':'')
    +(junk?'<span class="client-stat cs-junk">🧹 '+junk+' Junk</span>':'')
    +(furn?'<span class="client-stat cs-furn">🛋️ '+furn+' Furn</span>':'')
    +(totalRev>0?'<span style="font-size:13px;color:var(--accent);font-weight:700">💰 $'+Math.round(totalRev).toLocaleString()+' lifetime</span>':'')
    +'<span style="font-size:12px;color:var(--muted)">'+loyalty+'</span>'
    +'</div>'
    +(jobRows?'<div class="table-wrap" style="overflow-x:auto"><table><thead><tr><th>ID</th><th>Service</th><th>Date</th><th>Bin Status</th></tr></thead><tbody>'+jobRows+'</tbody></table></div>':'<p style="font-size:13px;color:var(--muted)">No jobs recorded for this client yet.</p>')
    +'</div>'
    +(cl.notes?'<div class="detail-section"><div class="detail-section-title">📝 Notes</div><p style="font-size:14px;line-height:1.6">'+cl.notes+'</p></div>':'')
    +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">'
    +'<button class="btn btn-primary" onclick="closeM(\'client-detail-modal\');newJobForClient(\''+cl.cid+'\')">+ New Job</button>'
    +'<button class="btn btn-ghost" onclick="closeM(\'client-detail-modal\');editClient(\''+cl.cid+'\')">✏️ Edit</button>'
    +'<button class="btn btn-danger" onclick="delClient(\''+cl.cid+'\')">🗑️ Delete</button>'
    +'</div>';
  document.getElementById('client-detail-modal').classList.add('open');
}


// ─── BAR CHART BUILDER ───
function makeBarChart(data, colorFn, displayFn){
  if(!data||!data.length) return '<div style="color:var(--muted);font-size:13px;padding:12px 0">No data for this period</div>';
  var max = Math.max.apply(null, data.map(function(d){return d.val||0;})) || 1;
  return data.map(function(d){
    var pct = Math.round((d.val||0)/max*100);
    var display = displayFn ? displayFn(d.val) : (d.display!==undefined ? d.display : d.val);
    var color = colorFn ? colorFn(d.key, data.indexOf(d)) : '#22c55e';
    return '<div class="bar-row">'
      +'<div class="bar-label" title="'+d.key+'">'+d.key+'</div>'
      +'<div class="bar-track"><div class="bar-fill bar-anim" data-w="'+pct+'%" style="background:'+color+'"></div></div>'
      +'<div class="bar-value">'+display+'</div>'
      +'</div>';
  }).join('');
}

// ─── COMPETITION PRICING ───
// All data loaded from Supabase on startup in loadAllFromSupabase()
var competitors = [];
var ourPricesV2 = {};
var pricingAreas = [];
var pricingCat = 'bin';
var editingCompId = null;
var activeOurArea = 'Default';

function saveCompetitors(){
  // Sync to Supabase
  try {
    var rows = competitors.map(function(c){
      return {comp_id:c.id, name:c.name, website:c.website||'', area:c.area||'Default',
              bins:c.bins||{}, junk:c.junk||{}, bin_fuel:c.binFuel?parseFloat(c.binFuel):null, notes:c.notes||''};
    });
    if(rows.length){
      db.from('competitors').upsert(rows,{onConflict:'comp_id'}).then(function(r){
        if(r.error) console.warn('Competitors sync failed:',r.error.message);
      });
    }
  } catch(e){ console.warn('Competitors sync error:',e); }
}
function saveOurPricesData(){
  // Sync to Supabase — one row per area
  // Build core row with guaranteed columns, then add optional columns only if the data exists
  // This prevents the whole upsert failing when optional columns (bins3day, bins7day) don't exist in the schema
  try {
    var rows = Object.keys(ourPricesV2).map(function(area){
      var ap = ourPricesV2[area];
      // Store tonne inside bins JSONB as _tonne — no extra column needed
      var binsToSave = Object.assign({}, ap.bins||{});
      if(ap.binTonne) binsToSave._tonne = parseFloat(ap.binTonne);
      else delete binsToSave._tonne;
      var row = {
        area:     area,
        bins:     binsToSave,
        junk:     ap.junk || {},
        bin_fuel: ap.binFuel ? parseFloat(ap.binFuel) : null,
        towns:    ap.towns || ''
      };
      return row;
    });
    if(rows.length){
      db.from('our_prices').upsert(rows,{onConflict:'area'}).then(function(r){
        if(r.error){
          console.warn('Our prices sync failed:',r.error.message);
          toast('⚠ Prices saved locally but Supabase sync failed: '+r.error.message);
        }
      });
    }
  } catch(e){
    console.warn('Our prices sync error:',e);
    toast('⚠ Prices sync error: '+e.message);
  }
}
function savePricingAreas(){ /* pricingAreas derived from Supabase our_prices — no separate save needed */ }
function nextCompId(){ return 'c'+(Date.now()%100000); }
function getAreaPrices(area){ return ourPricesV2[area] || {bins:{},junk:{},binFuel:'',binTonne:'',towns:''}; }

function setPricingCat(cat,el){
  pricingCat=cat;
  document.querySelectorAll('.filter-chip[id^="pcat-"]').forEach(function(c){c.classList.remove('active');});
  if(el)el.classList.add('active');
  document.getElementById('pricing-bin-view').style.display=cat==='bin'?'block':'none';
  document.getElementById('pricing-junk-view').style.display=cat==='junk'?'block':'none';
  renderPricingGrids();
}

function renderPricing(){
  var allBinKeys = ['4 yard dirt','4 yard concrete','7 yard dirt','7 yard concrete','14 yard','20 yard','monthly 14 yard','monthly 20 yard'];
  var shortLabels = {'4 yard dirt':'4yd Dirt','4 yard concrete':'4yd Conc','7 yard dirt':'7yd Dirt','7 yard concrete':'7yd Conc','14 yard':'14yd','20 yard':'20yd','monthly 14 yard':'Mo 14yd','monthly 20 yard':'Mo 20yd'};
  var html = pricingAreas.map(function(area){
    var ap = getAreaPrices(area);
    var activeBins = allBinKeys.filter(function(k){ return ap.bins&&ap.bins[k]; });
    var binCells = activeBins.map(function(s){
      var v = '$'+ap.bins[s];
      var isMonthly = s.indexOf('monthly')===0;
      var border = isMonthly ? 'rgba(139,92,246,.3)' : 'rgba(34,197,94,.2)';
      var color = isMonthly ? '#8b5cf6' : 'var(--accent)';
      return '<div style="display:flex;flex-direction:column;align-items:center;background:var(--surface2);border:1px solid '+border+';border-radius:8px;padding:10px 14px;min-width:76px">'
        +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;color:'+color+';line-height:1">'+v+'</div>'
        +'<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-top:4px">'+(shortLabels[s]||s)+'</div></div>';
    }).join('');
    var fuelBadge = ap.binFuel ? '<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(230,126,34,.1);border:1px solid rgba(230,126,34,.3);border-radius:6px;padding:3px 10px;font-size:12px;color:#e67e22;margin-left:8px">⛽ +'+ap.binFuel+'% fuel</span>' : '';
    var tonneBadge = ap.binTonne ? '<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(13,110,253,.1);border:1px solid rgba(13,110,253,.3);border-radius:6px;padding:3px 10px;font-size:12px;color:#0d6efd;margin-left:4px">+$'+ap.binTonne+'/tonne (14&amp;20yd)</span>' : '';
    var townsLine = ap.towns ? '<div style="font-size:11px;color:var(--muted);margin-bottom:8px;font-style:italic">'+ap.towns+'</div>' : '';
    var junkCells = [{k:'min',l:'Min'},{k:'quarter',l:'¼'},{k:'half',l:'½'},{k:'full',l:'Full'}].map(function(t){
      var v = ap.junk&&ap.junk[t.k] ? '$'+ap.junk[t.k] : '<span style="color:var(--muted)">—</span>';
      return '<div style="display:flex;flex-direction:column;align-items:center;background:var(--surface2);border:1px solid rgba(230,126,34,.25);border-radius:8px;padding:10px 14px;min-width:64px">'
        +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;color:#e67e22;line-height:1">'+v+'</div>'
        +'<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-top:4px">'+t.l+'</div></div>';
    }).join('');
    return '<div style="margin-bottom:4px">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
      +'<span style="display:inline-block;width:3px;height:14px;background:var(--accent);border-radius:2px"></span>'
      +'<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted)">📍 '+area+'</span>'
      +fuelBadge+tonneBadge
      +'<button onclick="deleteOurArea(\''+area+'\')" style="margin-left:auto;background:none;border:1px solid rgba(220,53,69,.3);color:#dc3545;border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer;opacity:.7" title="Delete area">🗑️ Delete</button>'
      +'</div>'
      +townsLine
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">'+binCells+'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap">'+junkCells+'</div>'
      +'</div>';
  });
  document.getElementById('our-prices-display').innerHTML = html.length
    ? html.join('<div style="height:1px;background:var(--border);margin:16px 0"></div>')
    : '<div style="text-align:center;padding:32px 16px;color:var(--muted)"><div style="font-size:28px;margin-bottom:10px;opacity:.5">💰</div><div style="font-size:14px;font-weight:600;margin-bottom:6px;color:var(--text)">No pricing areas set up yet</div><div style="font-size:13px">Click "Edit Our Prices" to add your first area and pricing.</div></div>';
  renderPricingGrids();
}

function renderDashPricing(){
  var TAX = 1.13;
  if(!_pricingDDArea && pricingAreas.length) initDashPricingDropdown();
  var area = _pricingDDArea || pricingAreas[0] || '';
  if(!area){
    document.getElementById('dash-pricing-display').innerHTML='<div style="color:var(--muted);font-size:13px">No pricing areas set up. <button class="btn btn-ghost btn-sm" onclick="go(\'pricing\')">Set up pricing &#x2192;</button></div>';
    return;
  }
  var ap    = getAreaPrices(area);
  var bins  = ap.bins  || {};
  var fuel  = parseFloat(ap.binFuel)  || 0;
  var tonne = parseFloat(ap.binTonne) || 0;
  var allBinKeys = ['4 yard dirt','4 yard concrete','7 yard dirt','7 yard concrete','14 yard','20 yard','monthly 14 yard','monthly 20 yard'];
  var shortLabels = {'4 yard dirt':'4yd Dirt','4 yard concrete':'4yd Conc','7 yard dirt':'7yd Dirt','7 yard concrete':'7yd Conc','14 yard':'14yd','20 yard':'20yd','monthly 14 yard':'Mo 14yd','monthly 20 yard':'Mo 20yd'};
  var tonneOn  = {'14 yard':true,'20 yard':true};

  function calcTotal(raw, sz){
    var v = parseFloat(raw)||0;
    if(!v) return null;
    if(fuel) v = v*(1+fuel/100);
    if(tonne && tonneOn[sz]) v = v+tonne;
    return v*TAX;
  }
  function fmD(v){ return '$'+v.toFixed(2); }
  function fmR(v){ return '$'+Math.round(v); }

  var activeBins = allBinKeys.filter(function(sz){ return parseFloat(bins[sz])||0; });
  if(!activeBins.length){
    document.getElementById('dash-pricing-display').innerHTML='<div style="color:var(--muted);font-size:13px">No bin prices set for this area.</div>';
    return;
  }

  var pills = '';
  if(fuel)  pills += '<span style="background:rgba(230,126,34,.12);border:1px solid rgba(230,126,34,.3);border-radius:20px;padding:1px 8px;font-size:11px;color:#e67e22;font-weight:600">⛽ +'+fuel+'% fuel</span> ';
  if(tonne) pills += '<span style="background:rgba(13,110,253,.12);border:1px solid rgba(13,110,253,.3);border-radius:20px;padding:1px 8px;font-size:11px;color:#0d6efd;font-weight:600">🚛 $'+tonne+'/tonne (14&amp;20yd)</span> ';
  pills += '<span style="background:rgba(107,114,128,.1);border:1px solid rgba(107,114,128,.2);border-radius:20px;padding:1px 8px;font-size:11px;color:var(--muted);font-weight:500">+HST 13%</span>';
  var out = '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">'+pills+'</div>';

  out += '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">';
  activeBins.forEach(function(sz, i){
    var tot = calcTotal(bins[sz], sz);
    if(!tot) return;
    var base = parseFloat(bins[sz]);
    var isLast = i === activeBins.length-1;
    var bg = i%2===0 ? 'transparent' : 'rgba(0,0,0,.025)';
    var border = isLast ? '' : 'border-bottom:1px solid var(--border);';
    var isMonthly = sz.indexOf('monthly')===0;
    var labelColor = isMonthly ? '#8b5cf6' : 'var(--text)';

    var bd = '<span style="font-size:12px;color:var(--muted)">'+fmR(base)+'</span>';
    if(fuel){
      bd += '<span style="font-size:11px;color:var(--muted);margin:0 3px">&rarr;</span>';
      bd += '<span style="font-size:12px;color:#e67e22;font-weight:600">+'+fuel+'%</span>';
    }
    if(tonne && tonneOn[sz]){
      bd += '<span style="font-size:11px;color:var(--muted);margin:0 3px">&rarr;</span>';
      bd += '<span style="font-size:12px;color:#0d6efd;font-weight:600">+'+fmR(tonne)+' tonne</span>';
    }
    bd += '<span style="font-size:11px;color:var(--muted);margin:0 3px">&rarr;</span>';
    bd += '<span style="font-size:12px;color:var(--muted)">+HST</span>';
    bd += '<span style="font-size:12px;color:var(--muted);margin:0 5px">=</span>';

    out += '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:'+bg+';'+border+'">';
    out += '<div style="width:72px;flex-shrink:0;font-size:13px;font-weight:700;color:'+labelColor+'">'+(shortLabels[sz]||sz)+'</div>';
    out += '<div style="flex:1;display:flex;align-items:center;flex-wrap:wrap;gap:2px">'+bd
      +'<span style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;color:#22c55e;line-height:1;letter-spacing:.3px">'+fmD(tot)+'</span>'
      +'</div>';
    out += '</div>';
  });
  out += '</div>';

  document.getElementById('dash-pricing-display').innerHTML = out;
}
var _pricingDDArea = '';
var _areaColors = {};
var _AREA_PALETTE = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];
function _buildPricingItems(){
  var items = [];
  pricingAreas.forEach(function(area, ai){
    _areaColors[area] = _AREA_PALETTE[ai % _AREA_PALETTE.length];
    var ap = getAreaPrices(area);
    var towns = ap.towns ? ap.towns.split(',').map(function(t){return t.trim();}).filter(Boolean) : [];
    if(towns.length > 1){
      towns.forEach(function(t){ items.push({label:t, area:area}); });
    } else {
      items.push({label:area, area:area});
    }
  });
  items.sort(function(a,b){ return a.label.toLowerCase() < b.label.toLowerCase() ? -1 : 1; });
  return items;
}
function initDashPricingDropdown(){
  var list = document.getElementById('dash-pricing-list');
  if(!list) return;
  var items = _buildPricingItems();
  list.innerHTML = items.map(function(it){
    var c = _areaColors[it.area];
    return '<div class="pricing-dd-item" data-area="'+it.area+'" data-label="'+it.label.toLowerCase()+'" onclick="pickPricingArea(\''+it.area+'\',\''+it.label.replace(/'/g,"\\'")+'\')" style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-size:12px;transition:background .1s">'
      +'<span style="width:8px;height:8px;border-radius:50%;background:'+c+';flex-shrink:0"></span>'
      +'<span style="flex:1;color:var(--text)">'+it.label+'</span>'
      +'<span style="font-size:10px;color:var(--muted)">'+it.area+'</span>'
      +'</div>';
  }).join('');
  if(items.length) pickPricingArea(items[0].area, items[0].label);
}
function togglePricingDD(){
  var menu = document.getElementById('dash-pricing-menu');
  var open = menu.style.display === 'none';
  menu.style.display = open ? 'block' : 'none';
  if(open){
    var si = document.getElementById('dash-pricing-search');
    if(si){ si.value=''; filterPricingDD(''); si.focus(); }
  }
}
function filterPricingDD(q){
  q = q.toLowerCase();
  document.querySelectorAll('.pricing-dd-item').forEach(function(el){
    var match = !q || el.getAttribute('data-label').indexOf(q) >= 0 || el.getAttribute('data-area').toLowerCase().indexOf(q) >= 0;
    el.style.display = match ? 'flex' : 'none';
  });
}
function pickPricingArea(area, label){
  _pricingDDArea = area;
  var btn = document.getElementById('dash-pricing-label');
  var dot = document.getElementById('dash-pricing-dot');
  if(btn) btn.textContent = label || area;
  if(dot) dot.style.background = _areaColors[area] || 'var(--muted)';
  document.getElementById('dash-pricing-menu').style.display = 'none';
  renderDashPricing();
}
// Close dropdown when clicking outside
document.addEventListener('click', function(e){
  var dd = document.getElementById('dash-pricing-dd');
  if(dd && !dd.contains(e.target)){
    document.getElementById('dash-pricing-menu').style.display = 'none';
  }
});


function renderPricingGrids(){
  var TAX_RATE = 1.13; // Ontario HST 13%
  var binSizes = ['4 yard dirt','4 yard concrete','7 yard dirt','7 yard concrete','14 yard','20 yard','monthly 14 yard','monthly 20 yard'];
  var shortLabels = {'4 yard dirt':'4yd Dirt','4 yard concrete':'4yd Conc','7 yard dirt':'7yd Dirt','7 yard concrete':'7yd Conc','14 yard':'14yd','20 yard':'20yd','monthly 14 yard':'Mo 14yd','monthly 20 yard':'Mo 20yd'};
  var junkTiers = [{k:'min',l:'Min/Small'},{k:'quarter',l:'¼ Truck'},{k:'half',l:'½ Truck'},{k:'full',l:'Full Truck'}];

  function fmtWithTax(v){ return v ? '$'+(parseFloat(v)*TAX_RATE).toFixed(2) : '—'; }

  function priceCell(val, ourVal){
    if(!val) return '<td style="padding:10px 14px;text-align:center;color:var(--muted)">—<br><span style="font-size:10px;color:var(--muted)">—</span></td>';
    var pretax = '$'+val;
    var withtax = '$'+(parseFloat(val)*TAX_RATE).toFixed(2);
    if(!ourVal) return '<td style="padding:10px 14px;text-align:center"><div style="font-weight:700">'+pretax+'</div><div style="font-size:11px;color:var(--muted)">'+withtax+' w/tax</div></td>';
    var diff = parseFloat(val)-parseFloat(ourVal);
    var pct = parseFloat(ourVal) ? Math.round(diff/parseFloat(ourVal)*100) : 0;
    var color = diff>0?'#22c55e':diff<0?'#dc3545':'var(--muted)';
    var arrow = diff>0?'▲':diff<0?'▼':'=';
    return '<td style="padding:10px 14px;text-align:center">'
      +'<div style="font-weight:700">'+pretax+'</div>'
      +'<div style="font-size:11px;color:var(--muted)">'+withtax+' w/tax</div>'
      +'<div style="font-size:11px;color:'+color+'">'+arrow+' '+(diff>=0?'+':'')+pct+'%</div>'
      +'</td>';
  }

  function thStyle(){ return 'padding:10px 14px;text-align:center;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);background:var(--surface2)'; }
  function thLeft(){ return 'padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);background:var(--surface2)'; }

  var binOut = '', junkOut = '';

  pricingAreas.forEach(function(area){
    var ap = getAreaPrices(area);
    var areaComps = competitors.filter(function(x){ return (x.area||'Default') === area; });
    var areaHeader = '<div style="display:flex;align-items:center;gap:8px;margin:20px 0 10px">'
      +'<span style="display:inline-block;width:3px;height:14px;background:var(--accent);border-radius:2px"></span>'
      +'<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted)">📍 '+area+'</span></div>';

    // BIN TABLE for this area — shows pre-tax + with-tax
    var binHtml = '<div style="overflow-x:auto;margin-bottom:8px"><table style="width:100%;border-collapse:collapse">'
      +'<thead><tr>'
      +'<th style="'+thLeft()+'">Company</th>'
      +binSizes.map(function(s){return'<th style="'+thStyle()+'">'+(shortLabels[s]||s)+'<br><span style="font-size:9px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--muted)">pre-tax / w/tax</span></th>';}).join('')
      +'<th style="'+thStyle()+'">⛽ Fuel</th>'
      +'<th style="padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2)"></th>'
      +'</tr></thead><tbody>';
    // Our row — show pre-tax and with-tax
    binHtml += '<tr style="background:rgba(34,197,94,.05);border-bottom:1px solid var(--border)">'
      +'<td style="padding:10px 14px;font-weight:700;color:var(--accent)">🏠 Jeff\'s Junk</td>'
      +binSizes.map(function(s){
        var v = ap.bins&&ap.bins[s] ? parseFloat(ap.bins[s]) : null;
        var pre = v ? '$'+v.toFixed(0) : '—';
        var tax = v ? '$'+(v*TAX_RATE).toFixed(2) : '—';
        return '<td style="padding:10px 14px;text-align:center"><div style="font-weight:700;color:var(--accent)">'+pre+'</div><div style="font-size:11px;color:#4ade80">'+tax+' w/tax</div></td>';
      }).join('')
      +'<td style="padding:10px 14px;text-align:center;font-weight:700;color:var(--accent)">'+(ap.binFuel?ap.binFuel+'%':'—')+'</td>'
      +'<td></td></tr>';
    areaComps.forEach(function(comp){
      binHtml += '<tr style="border-bottom:1px solid var(--border)">'
        +'<td style="padding:10px 14px"><div style="font-weight:600">'+comp.name+'</div>'+(comp.website?'<div style="font-size:11px;color:var(--muted)">'+comp.website+'</div>':'')+'</td>'
        +binSizes.map(function(s){ return priceCell(comp.bins&&comp.bins[s], ap.bins&&ap.bins[s]); }).join('')
        +'<td style="padding:10px 14px;text-align:center;color:var(--muted)">'+(comp.binFuel?'<span style="color:#e67e22">'+comp.binFuel+'%</span>':'—')+'</td>'
        +'<td style="padding:10px 14px"><div style="display:flex;gap:6px">'
        +'<button class="btn btn-ghost btn-sm" onclick="openEditCompetitor(\''+comp.id+'\')">✏️</button>'
        +'<button class="btn btn-danger btn-sm" onclick="deleteCompetitor(\''+comp.id+'\')">🗑️</button>'
        +'</div></td></tr>';
    });
    if(!areaComps.length) binHtml += '<tr><td colspan="'+(binSizes.length+3)+'" style="padding:16px 14px;color:var(--muted);font-size:13px">No competitors added for this area yet.</td></tr>';
    binHtml += '</tbody></table></div>';
    binOut += areaHeader + binHtml;

    // JUNK TABLE for this area — shows pre-tax + with-tax
    var junkHtml = '<div style="overflow-x:auto;margin-bottom:8px"><table style="width:100%;border-collapse:collapse">'
      +'<thead><tr>'
      +'<th style="'+thLeft()+'">Company</th>'
      +junkTiers.map(function(t){return'<th style="'+thStyle()+'">'+t.l+'<br><span style="font-size:9px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--muted)">pre-tax / w/tax</span></th>';}).join('')
      +'<th style="padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2)"></th>'
      +'</tr></thead><tbody>';
    junkHtml += '<tr style="background:rgba(230,126,34,.06);border-bottom:1px solid var(--border)">'
      +'<td style="padding:10px 14px;font-weight:700;color:#e67e22">🏠 Jeff\'s Junk</td>'
      +junkTiers.map(function(t){
        var v = ap.junk&&ap.junk[t.k] ? parseFloat(ap.junk[t.k]) : null;
        var pre = v ? '$'+v.toFixed(0) : '—';
        var tax = v ? '$'+(v*TAX_RATE).toFixed(2) : '—';
        return '<td style="padding:10px 14px;text-align:center"><div style="font-weight:700;color:#e67e22">'+pre+'</div><div style="font-size:11px;color:#e67e22">'+tax+' w/tax</div></td>';
      }).join('')
      +'<td></td></tr>';
    areaComps.forEach(function(comp){
      junkHtml += '<tr style="border-bottom:1px solid var(--border)">'
        +'<td style="padding:10px 14px"><div style="font-weight:600">'+comp.name+'</div>'+(comp.website?'<div style="font-size:11px;color:var(--muted)">'+comp.website+'</div>':'')+'</td>'
        +junkTiers.map(function(t){ return priceCell(comp.junk&&comp.junk[t.k], ap.junk&&ap.junk[t.k]); }).join('')
        +'<td style="padding:10px 14px"><div style="display:flex;gap:6px">'
        +'<button class="btn btn-ghost btn-sm" onclick="openEditCompetitor(\''+comp.id+'\')">✏️</button>'
        +'<button class="btn btn-danger btn-sm" onclick="deleteCompetitor(\''+comp.id+'\')">🗑️</button>'
        +'</div></td></tr>';
    });
    if(!areaComps.length) junkHtml += '<tr><td colspan="'+(junkTiers.length+2)+'" style="padding:16px 14px;color:var(--muted);font-size:13px">No competitors added for this area yet.</td></tr>';
    junkHtml += '</tbody></table></div>';
    junkOut += areaHeader + junkHtml;
  });

  var emptyMsg = '<div style="text-align:center;padding:32px;color:var(--muted);font-size:13px">Add pricing areas using "Edit Our Prices" to see comparisons here.</div>';
  document.getElementById('pricing-bin-grid').innerHTML = binOut || emptyMsg;
  document.getElementById('pricing-junk-grid').innerHTML = junkOut || emptyMsg;
}

// ── Area tabs in "Edit Our Prices" modal ──
function renderOurAreaTabs(){
  var wrap = document.getElementById('our-area-tabs');
  if(!wrap) return;
  wrap.innerHTML = pricingAreas.map(function(area){
    var active = area === activeOurArea;
    return '<div onclick="selectOurArea(\''+area+'\')" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;border:1px solid '+(active?'var(--accent)':'var(--border)')+';background:'+(active?'rgba(34,197,94,.1)':'transparent')+';color:'+(active?'var(--accent)':'var(--text)')+';cursor:pointer;font-size:13px;font-weight:'+(active?'700':'400')+';transition:all .15s">'
      +'<span>'+area+'</span>'
      +'<span onclick="event.stopPropagation();renameOurArea(\''+area+'\')" style="font-size:11px;color:var(--muted);padding:0 2px;line-height:1" title="Rename">✏️</span>'
      +'<span onclick="event.stopPropagation();deleteOurArea(\''+area+'\')" style="font-size:11px;color:var(--muted);padding:0 2px;line-height:1" title="Delete">✕</span>'
      +'</div>';
  }).join('');
}

function selectOurArea(area){
  activeOurArea = area;
  document.getElementById('our-area-label').textContent = area;
  var ap = getAreaPrices(area);
  document.getElementById('our-b4dirt').value = ap.bins&&ap.bins['4 yard dirt']  || '';
  document.getElementById('our-b4conc').value = ap.bins&&ap.bins['4 yard concrete']  || '';
  document.getElementById('our-b7dirt').value = ap.bins&&ap.bins['7 yard dirt']  || '';
  document.getElementById('our-b7conc').value = ap.bins&&ap.bins['7 yard concrete']  || '';
  document.getElementById('our-b14').value   = ap.bins&&ap.bins['14 yard'] || '';
  document.getElementById('our-b20').value   = ap.bins&&ap.bins['20 yard'] || '';
  document.getElementById('our-bm14').value  = ap.bins&&ap.bins['monthly 14 yard'] || '';
  document.getElementById('our-bm20').value  = ap.bins&&ap.bins['monthly 20 yard'] || '';
  document.getElementById('our-b-fuel').value= ap.binFuel || '';
  document.getElementById('our-b-tonne').value= ap.binTonne || '';
  document.getElementById('our-j-min').value    = ap.junk&&ap.junk.min     || '';
  document.getElementById('our-j-quarter').value= ap.junk&&ap.junk.quarter || '';
  document.getElementById('our-j-half').value   = ap.junk&&ap.junk.half    || '';
  document.getElementById('our-j-full').value   = ap.junk&&ap.junk.full    || '';
  var townsEl = document.getElementById('our-towns-display');
  if(townsEl) townsEl.textContent = ap.towns ? 'Towns: '+ap.towns : '';
  renderOurAreaTabs();
}


function addOurPricingArea(){
  var name = prompt('New area name (e.g. "Barrie", "Innisfil", "Orillia"):');
  if(!name || !name.trim()) return;
  name = name.trim();
  if(pricingAreas.indexOf(name) >= 0){ toast('That area already exists.'); return; }
  pricingAreas.push(name);
  savePricingAreas();
  selectOurArea(name);
  toast('Area "'+name+'" added!');
}

function deleteOurArea(area){
  if(!confirm('Delete area "'+area+'" and its prices?')) return;
  pricingAreas = pricingAreas.filter(function(a){return a!==area;});
  delete ourPricesV2[area];
  savePricingAreas();
  saveOurPricesData();
  // Delete from Supabase our_prices
  db.from('our_prices').delete().eq('area',area).then(function(r){
    if(r.error) console.warn('Our prices delete failed:',r.error.message);
  });
  // Move competitors in this area to unassigned
  competitors.forEach(function(c){ if(c.area===area) c.area = pricingAreas[0] || 'Default'; });
  saveCompetitors();
  var nextArea = pricingAreas[0] || null;
  activeOurArea = nextArea || '';
  renderPricing();
  toast('Area "'+area+'" deleted.');
}

function renameOurArea(oldName){
  var newName = prompt('Rename "'+oldName+'" to:', oldName);
  if(!newName || !newName.trim() || newName.trim() === oldName) return;
  newName = newName.trim();
  if(pricingAreas.indexOf(newName) >= 0){ toast('An area with that name already exists.'); return; }
  // Rename in areas list
  var idx = pricingAreas.indexOf(oldName);
  if(idx >= 0) pricingAreas[idx] = newName;
  // Migrate prices
  if(ourPricesV2[oldName]){ ourPricesV2[newName] = ourPricesV2[oldName]; delete ourPricesV2[oldName]; }
  // Migrate competitors
  competitors.forEach(function(c){ if(c.area === oldName) c.area = newName; });
  if(activeOurArea === oldName) activeOurArea = newName;
  savePricingAreas();
  saveOurPricesData();
  saveCompetitors();
  // Delete the old area row from Supabase (new name will be upserted by saveOurPricesData)
  db.from('our_prices').delete().eq('area',oldName).then(function(r){
    if(r.error) console.warn('Our prices rename/delete failed:',r.error.message);
  });
  renderOurAreaTabs();
  selectOurArea(newName);
  renderPricing();
  toast('"'+oldName+'" renamed to "'+newName+'".');
}

function openEditOurPrices(){
  renderOurAreaTabs();
  selectOurArea(activeOurArea);
  document.getElementById('our-prices-modal').classList.add('open');
}

function saveOurPrices(){
  var prev = ourPricesV2[activeOurArea] || {};
  var entry = {
    bins: {
      '4 yard dirt':       document.getElementById('our-b4dirt').value,
      '4 yard concrete':   document.getElementById('our-b4conc').value,
      '7 yard dirt':       document.getElementById('our-b7dirt').value,
      '7 yard concrete':   document.getElementById('our-b7conc').value,
      '14 yard':           document.getElementById('our-b14').value,
      '20 yard':           document.getElementById('our-b20').value,
      'monthly 14 yard':   document.getElementById('our-bm14').value,
      'monthly 20 yard':   document.getElementById('our-bm20').value
    },
    binFuel: document.getElementById('our-b-fuel').value,
    binTonne: document.getElementById('our-b-tonne').value,
    junk: {
      min:     document.getElementById('our-j-min').value,
      quarter: document.getElementById('our-j-quarter').value,
      half:    document.getElementById('our-j-half').value,
      full:    document.getElementById('our-j-full').value
    },
    towns: prev.towns || ''
  };
  ourPricesV2[activeOurArea] = entry;
  saveOurPricesData();
  closeM('our-prices-modal');
  renderPricing();
  renderDashPricing();
  toast('Prices saved for '+activeOurArea+'!');
}

// ── Competitor area dropdown ──
function populateCompAreaSelect(){
  var sel = document.getElementById('comp-area');
  if(!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="Default">All Areas / Default</option>'
    + pricingAreas.filter(function(a){return a!=='Default';}).map(function(a){
        return '<option value="'+a+'">'+a+'</option>';
      }).join('');
  if(cur) sel.value = cur;
}

function openAddCompetitor(){
  editingCompId = null;
  document.getElementById('comp-modal-ttl').textContent = 'Add Competitor';
  ['comp-name','comp-website','comp-b4','comp-b7','comp-b14','comp-b20','comp-b-fuel','comp-j-min','comp-j-quarter','comp-j-half','comp-j-full','comp-notes'].forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});
  populateCompAreaSelect();
  clearErr('comp-name');
  document.getElementById('competitor-modal').classList.add('open');
}

function openEditCompetitor(id){
  var comp = competitors.find(function(x){return x.id===id;});
  if(!comp) return;
  editingCompId = id;
  document.getElementById('comp-modal-ttl').textContent = 'Edit Competitor';
  document.getElementById('comp-name').value    = comp.name    || '';
  document.getElementById('comp-website').value = comp.website || '';
  document.getElementById('comp-b4').value    = comp.bins&&comp.bins['4 yard']  || '';
  document.getElementById('comp-b7').value    = comp.bins&&comp.bins['7 yard']  || '';
  document.getElementById('comp-b14').value   = comp.bins&&comp.bins['14 yard'] || '';
  document.getElementById('comp-b20').value   = comp.bins&&comp.bins['20 yard'] || '';
  document.getElementById('comp-b-fuel').value   = comp.binFuel || '';
  document.getElementById('comp-j-min').value    = comp.junk&&comp.junk.min     || '';
  document.getElementById('comp-j-quarter').value= comp.junk&&comp.junk.quarter || '';
  document.getElementById('comp-j-half').value   = comp.junk&&comp.junk.half    || '';
  document.getElementById('comp-j-full').value   = comp.junk&&comp.junk.full    || '';
  document.getElementById('comp-notes').value = comp.notes || '';
  populateCompAreaSelect();
  document.getElementById('comp-area').value = comp.area || 'Default';
  clearErr('comp-name');
  document.getElementById('competitor-modal').classList.add('open');
}

function saveCompetitor(){
  var name = document.getElementById('comp-name').value.trim();
  if(!name){ showErr('comp-name'); return; }
  var obj = {
    id:      editingCompId || nextCompId(),
    name:    name,
    website: document.getElementById('comp-website').value.trim(),
    area:    document.getElementById('comp-area').value || 'Default',
    bins: {
      '4 yard':  document.getElementById('comp-b4').value,
      '7 yard':  document.getElementById('comp-b7').value,
      '14 yard': document.getElementById('comp-b14').value,
      '20 yard': document.getElementById('comp-b20').value
    },
    binFuel: document.getElementById('comp-b-fuel').value,
    junk: {
      min:     document.getElementById('comp-j-min').value,
      quarter: document.getElementById('comp-j-quarter').value,
      half:    document.getElementById('comp-j-half').value,
      full:    document.getElementById('comp-j-full').value
    },
    notes: document.getElementById('comp-notes').value
  };
  if(editingCompId){
    var idx = competitors.findIndex(function(c){return c.id===editingCompId;});
    if(idx>=0) competitors[idx] = obj;
  } else {
    competitors.push(obj);
  }
  saveCompetitors();
  closeM('competitor-modal');
  renderPricing();
  toast(editingCompId ? 'Competitor updated!' : 'Competitor added!');
}

function deleteCompetitor(id){
  if(!confirm('Delete this competitor?')) return;
  competitors = competitors.filter(function(c){return c.id!==id;});
  saveCompetitors();
  // Also delete from Supabase
  db.from('competitors').delete().eq('comp_id',id).then(function(r){
    if(r.error) console.warn('Competitor delete sync failed:',r.error.message);
  });
  renderPricing();
  toast('Deleted.');
}


// ─── ANALYTICS ───
function setAnalyticsPeriod(p, el){
  analyticsPeriod = p;
  document.querySelectorAll('.chart-filter[id^="af-"]').forEach(function(c){c.classList.remove('active');});
  if(el) el.classList.add('active');
  var wk=document.getElementById('an-week-pickers'),mo=document.getElementById('an-month-pickers'),yr=document.getElementById('an-year-pickers');
  if(wk) wk.style.display=p==='week'?'flex':'none';
  if(mo) mo.style.display=p==='month'?'flex':'none';
  if(yr) yr.style.display=p==='year'?'flex':'none';
  var now=new Date();
  if(p==='week'){
    var wa=document.getElementById('an-week-a'); if(wa&&!wa.value) wa.value=toWeekValue(now);
    var wb=document.getElementById('an-week-b'); if(wb&&!wb.value){var pv=new Date(now);pv.setDate(pv.getDate()-7);wb.value=toWeekValue(pv);}
  }
  if(p==='month'){
    var ma=document.getElementById('an-month-a'); if(ma&&!ma.value) ma.value=now.getFullYear()+'-'+(now.getMonth()<9?'0':'')+(now.getMonth()+1);
    var mb=document.getElementById('an-month-b'); if(mb&&!mb.value){var pm=new Date(now.getFullYear(),now.getMonth()-1,1);mb.value=pm.getFullYear()+'-'+(pm.getMonth()<9?'0':'')+(pm.getMonth()+1);}
  }
  if(p==='year'){populateYearSelects();var ya=document.getElementById('an-year-a');if(ya&&!ya.value)ya.value=now.getFullYear();var yb=document.getElementById('an-year-b');if(yb&&!yb.value)yb.value=now.getFullYear()-1;}
  renderAnalytics();
}
function toWeekValue(d){
  var jan4=new Date(d.getFullYear(),0,4);
  var sow=new Date(jan4);sow.setDate(jan4.getDate()-((jan4.getDay()||7)-1));
  var wn=Math.max(1,Math.min(52,Math.floor(1+(d-sow)/(7*86400000))));
  return d.getFullYear()+'-W'+(wn<10?'0':'')+wn;
}
function weekValueToDates(wv){
  if(!wv)return null;
  var p=wv.split('-W'),y=parseInt(p[0]),w=parseInt(p[1]);
  var jan4=new Date(y,0,4),d1=new Date(jan4);
  d1.setDate(jan4.getDate()-((jan4.getDay()||7)-1)+(w-1)*7);d1.setHours(0,0,0,0);
  var d7=new Date(d1);d7.setDate(d1.getDate()+6);d7.setHours(23,59,59,999);
  return{start:d1,end:d7};
}
function monthValueToDates(mv){
  if(!mv)return null;
  var p=mv.split('-'),y=parseInt(p[0]),m=parseInt(p[1])-1;
  return{start:new Date(y,m,1,0,0,0,0),end:new Date(y,m+1,0,23,59,59,999)};
}
function populateYearSelects(){
  var years=[],now=new Date().getFullYear();
  jobs.forEach(function(j){var y=new Date(j.date).getFullYear();if(years.indexOf(y)<0)years.push(y);});
  for(var y=now;y>=now-5;y--){if(years.indexOf(y)<0)years.push(y);}
  years.sort(function(a,b){return b-a;});
  ['an-year-a','an-year-b'].forEach(function(id){
    var sel=document.getElementById(id);if(!sel)return;
    var cur=sel.value;
    sel.innerHTML=(id==='an-year-b'?'<option value="">— None —</option>':'')+years.map(function(y){return'<option value="'+y+'">'+y+'</option>';}).join('');
    if(cur)sel.value=cur;
  });
}
function clearCompareB(){
  if(analyticsPeriod==='week'){var e=document.getElementById('an-week-b');if(e)e.value='';}
  if(analyticsPeriod==='month'){var e=document.getElementById('an-month-b');if(e)e.value='';}
  if(analyticsPeriod==='year'){var e=document.getElementById('an-year-b');if(e)e.value='';}
  renderAnalytics();
}
function getAnalyticsDates(){
  var now=new Date();
  if(analyticsPeriod==='all')return{a:{start:new Date(0),end:now,label:'All Time'},b:null};
  if(analyticsPeriod==='week'){
    var wa=document.getElementById('an-week-a'),wb=document.getElementById('an-week-b');
    var da=wa&&wa.value?weekValueToDates(wa.value):{start:new Date(now.getFullYear(),now.getMonth(),now.getDate()-now.getDay(),0,0,0),end:new Date(now.getFullYear(),now.getMonth(),now.getDate()-now.getDay()+6,23,59,59)};
    var db=wb&&wb.value?weekValueToDates(wb.value):null;
    var fmt=function(d){return'Week of '+d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});};
    return{a:{start:da.start,end:da.end,label:fmt(da.start)},b:db?{start:db.start,end:db.end,label:fmt(db.start)}:null};
  }
  if(analyticsPeriod==='month'){
    var ma=document.getElementById('an-month-a'),mb=document.getElementById('an-month-b');
    var dma=ma&&ma.value?monthValueToDates(ma.value):{start:new Date(now.getFullYear(),now.getMonth(),1),end:new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59)};
    var dmb=mb&&mb.value?monthValueToDates(mb.value):null;
    var fmtM=function(d){return d.toLocaleDateString('en-US',{month:'long',year:'numeric'});};
    return{a:{start:dma.start,end:dma.end,label:fmtM(dma.start)},b:dmb?{start:dmb.start,end:dmb.end,label:fmtM(dmb.start)}:null};
  }
  if(analyticsPeriod==='year'){
    var ya=document.getElementById('an-year-a'),yb=document.getElementById('an-year-b');
    var yav=ya&&ya.value?parseInt(ya.value):now.getFullYear();
    var ybv=yb&&yb.value?parseInt(yb.value):0;
    return{a:{start:new Date(yav,0,1),end:new Date(yav,11,31,23,59,59),label:yav.toString()},b:ybv?{start:new Date(ybv,0,1),end:new Date(ybv,11,31,23,59,59),label:ybv.toString()}:null};
  }
  return{a:{start:new Date(0),end:now,label:'All Time'},b:null};
}
function getFilteredJobs(start,end){
  return jobs.filter(function(j){
    if(!start)return true;
    if(!j.date)return false;
    var parts=j.date.split('-');
    var d=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
    return d>=start&&d<=end;
  });
}
function delta(curr,prev){
  if(prev===null||prev===undefined)return'';
  if(prev===0)return curr===0?'':'<span style="font-size:12px;font-weight:700;color:#22c55e;margin-left:6px">▲ NEW</span>';
  var pct=Math.round((curr-prev)/prev*100),up=pct>=0;
  return'<span style="font-size:12px;font-weight:700;color:'+(up?'#22c55e':'#dc3545')+';margin-left:6px">'+(up?'▲':'▼')+' '+(up?'+':'')+pct+'%</span>';
}
async function renderAnalytics(){
  var dates=getAnalyticsDates();
  var pageSize=1000;

  async function fetchJobsInRange(start,end){
    var results=[];
    var from=0;
    var startS=start?start.toISOString().split('T')[0]:null;
    var endS=end?end.toISOString().split('T')[0]:null;
    while(true){
      var q=db.from('jobs').select('*')
        .order('date',{ascending:false}).range(from,from+pageSize-1);
      if(startS)q=q.gte('date',startS);
      if(endS)q=q.lte('date',endS);
      var r=await q;
      if(r.error||!r.data||r.data.length===0)break;
      r.data.forEach(function(row){
        results.push({id:row.job_id,service:row.service||'',status:row.status||'',
          name:row.name||'',address:row.address||'',city:row.city||'',
          date:row.date||'',price:row.price||'',referral:row.referral||'',
          binSize:row.bin_size||''});
      });
      if(r.data.length<pageSize)break;
      from+=pageSize;
    }
    return results;
  }

  var aJobs=await fetchJobsInRange(dates.a.start,dates.a.end);
  var bJobs=dates.b?await fetchJobsInRange(dates.b.start,dates.b.end):[];
  var hasB=dates.b!==null;
  _renderAnalyticsWithJobs(dates,aJobs,bJobs,hasB);
}

function _renderAnalyticsWithJobs(dates,aJobs,bJobs,hasB){
  var lbl=document.getElementById('analytics-compare-lbl');
  if(lbl)lbl.innerHTML='<strong style="color:var(--accent)">A: '+dates.a.label+'</strong>'+(hasB?' <span style="color:var(--muted)">vs</span> <strong style="color:#e67e22">B: '+dates.b.label+'</strong>':'');

  var aBin=aJobs.filter(function(j){return j.service==='Bin Rental';}).length;
  var bBin=bJobs.filter(function(j){return j.service==='Bin Rental';}).length;
  var aJunk=aJobs.filter(function(j){return j.service==='Junk Removal';}).length;
  var bJunk=bJobs.filter(function(j){return j.service==='Junk Removal';}).length;
  var aFP=aJobs.filter(function(j){return j.service==='Furniture Pickup';}).length;
  var bFP=bJobs.filter(function(j){return j.service==='Furniture Pickup';}).length;
  var aFD=aJobs.filter(function(j){return j.service==='Furniture Delivery';}).length;
  var bFD=bJobs.filter(function(j){return j.service==='Furniture Delivery';}).length;

  function mbox(idA,val,prev,color,label){
    return'<div class="metric-box"><div style="display:flex;align-items:baseline;flex-wrap:wrap">'
      +'<div class="metric-val" id="'+idA+'" style="color:'+color+'">0</div>'+(hasB?delta(val,prev):'')+'</div>'
      +'<div class="metric-lbl">'+label+'</div>'+(hasB?'<div style="font-size:10px;color:var(--muted);margin-top:2px">B: '+prev+'</div>':'')+'</div>';
  }
  document.getElementById('analytics-metrics').innerHTML=
    mbox('am-jobs',aJobs.length,bJobs.length,'var(--accent)','Total Jobs')
    +mbox('am-bins',aBin,bBin,'#e67e22','Bin Rentals')
    +mbox('am-junk',aJunk,bJunk,'#4ade80','Junk Removal')
    +mbox('am-furnp',aFP,bFP,'#dc3545','Furniture Pickup')
    +mbox('am-furnd',aFD,bFD,'#e76f7e','Furniture Delivery');

  // ── Month-over-Month summary ─────────────────────────────────
  (function(){
    var momEl  = document.getElementById('analytics-mom-summary');
    var momGrid = document.getElementById('analytics-mom-grid');
    if(!momEl || !momGrid) return;
    // Only show when comparing two periods (month vs previous month)
    if(!hasB){ momEl.style.display='none'; return; }
    momEl.style.display='block';

    function pct(a,b){ if(!b) return null; return Math.round((a-b)/b*100); }
    function arrow(p){ return p>0?'▲':'▼'; }
    function arrowColor(p,higherIsBetter){
      if(p===0) return 'var(--muted)';
      var positive = higherIsBetter ? p>0 : p<0;
      return positive ? '#22c55e' : '#dc3545';
    }

    function momCard(label, aVal, bVal, fmt, higherIsBetter){
      var p = pct(aVal, bVal);
      var pStr = p!==null ? (p>=0?'+':'')+p+'%' : '—';
      var col  = p!==null ? arrowColor(p, higherIsBetter!==false) : 'var(--muted)';
      var arw  = p!==null ? arrow(p) : '';
      return '<div style="background:var(--surface2);border-radius:10px;padding:12px 14px">'
        +'<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">'+label+'</div>'
        +'<div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">'
          +'<span style="font-family:Bebas Neue,sans-serif;font-size:24px;color:var(--text);letter-spacing:.5px;line-height:1">'+fmt(aVal)+'</span>'
          +(p!==null?'<span style="font-size:12px;font-weight:700;color:'+col+'">'+arw+' '+pStr+'</span>':'')
        +'</div>'
        +'<div style="font-size:11px;color:var(--muted);margin-top:3px">Last: '+fmt(bVal)+'</div>'
        +'</div>';
    }

    var aActive = aJobs.filter(function(j){ return j.status!=='Cancelled'; }).length;
    var bActive = bJobs.filter(function(j){ return j.status!=='Cancelled'; }).length;
    var aBinCount  = aJobs.filter(function(j){ return j.service==='Bin Rental'; }).length;
    var bBinCount  = bJobs.filter(function(j){ return j.service==='Bin Rental'; }).length;
    var aJunkCount = aJobs.filter(function(j){ return j.service==='Junk Removal'; }).length;
    var bJunkCount = bJobs.filter(function(j){ return j.service==='Junk Removal'; }).length;
    var aCancelled = aJobs.filter(function(j){ return j.status==='Cancelled'; }).length;
    var bCancelled = bJobs.filter(function(j){ return j.status==='Cancelled'; }).length;

    momGrid.innerHTML =
      momCard('Total Jobs',    aActive,    bActive,    String,           true)
      +momCard('Bin Rentals',  aBinCount,  bBinCount,  String,           true)
      +momCard('Junk Removal', aJunkCount, bJunkCount, String,           true)
      +momCard('Cancellations',aCancelled, bCancelled, String,           false);
  })();

  requestAnimationFrame(function(){
    animCount(document.getElementById('am-jobs'),aJobs.length);
    animCount(document.getElementById('am-bins'),aBin);
    animCount(document.getElementById('am-junk'),aJunk);
    animCount(document.getElementById('am-furnp'),aFP);
    animCount(document.getElementById('am-furnd'),aFD);
  });

  // Busiest days side-by-side
  var dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var dayShort=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function buildDayChart(jobSet,color){
    var counts=[0,0,0,0,0,0,0];
    jobSet.forEach(function(j){
      // Parse YYYY-MM-DD directly to avoid UTC→local timezone day shift
      var parts=j.date?j.date.split('-'):null;
      if(!parts||parts.length<3)return;
      var d=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
      counts[d.getDay()]++;
    });
    var bIdx=counts.indexOf(Math.max.apply(null,counts));
    var data=dayShort.map(function(n,i){return{key:n,val:counts[i]};});
    return{html:makeBarChart(data,function(k,i){return i===bIdx?color:'rgba(34,197,94,.2)';}),busiestDay:dayNames[bIdx],busiestCount:counts[bIdx]};
  }
  var cA=buildDayChart(aJobs,'#22c55e');
  document.getElementById('busiest-a-lbl').innerHTML='<span style="color:var(--accent)">● A: '+dates.a.label+'</span>';
  document.getElementById('chart-busiest-a').innerHTML=cA.html;
  document.getElementById('busiest-insight-a').innerHTML='🏆 Busiest: <strong>'+cA.busiestDay+'</strong> ('+cA.busiestCount+' jobs)';
  var bCol=document.getElementById('busiest-b-col');
  var bGrid=document.getElementById('busiest-grid');
  if(hasB&&bJobs.length>0){
    var cB=buildDayChart(bJobs,'#e67e22');
    bCol.style.display='block';
    bGrid.style.gridTemplateColumns='1fr 1fr';
    document.getElementById('busiest-b-lbl').innerHTML='<span style="color:#e67e22">● B: '+dates.b.label+'</span>';
    document.getElementById('chart-busiest-b').innerHTML=cB.html;
    document.getElementById('busiest-insight-b').innerHTML='🏆 Busiest: <strong>'+cB.busiestDay+'</strong> ('+cB.busiestCount+' jobs)'+(cA.busiestDay!==cB.busiestDay?'<br><span style="color:#e67e22">Shift: '+cB.busiestDay+' → '+cA.busiestDay+'</span>':' · same day');
    requestAnimationFrame(function(){animateBars(document.getElementById('chart-busiest-b'));});
  } else {
    bCol.style.display='none';
    bGrid.style.gridTemplateColumns='1fr';
  }

  // Bins by size
  var sizes={'4 yard':0,'7 yard':0,'14 yard':0,'20 yard':0};
  aJobs.filter(function(j){return j.service==='Bin Rental'&&j.binSize;}).forEach(function(j){sizes[j.binSize]=(sizes[j.binSize]||0)+1;});
  var sizeColors={'4 yard':'#4ade80','7 yard':'#f0932b','14 yard':'#f0932b','20 yard':'#e76f7e'};
  var sizeData=Object.keys(sizes).filter(function(k){return sizes[k]>0;}).map(function(k){return{key:k,val:sizes[k]};});
  document.getElementById('chart-bin-size').innerHTML=makeBarChart(sizeData,function(k){return sizeColors[k]||'#22c55e';});

  // By city
  var cityMap={};
  aJobs.forEach(function(j){var c=extractCity(j.address,j.city);cityMap[c]=(cityMap[c]||0)+1;});
  var cityData=Object.keys(cityMap).sort(function(a,b){return cityMap[b]-cityMap[a];}).map(function(k){return{key:k,val:cityMap[k]};});
  var cityColors=['#22c55e','#4ade80','#7cc9a0','#c8e6d5','#e6f4ed','#a7f3d0','#6ee7b7','#34d399'];
  document.getElementById('chart-city').innerHTML=makeBarChart(cityData,function(k,i){return cityColors[cityData.findIndex(function(d){return d.key===k;})]||'#22c55e';});

  // Referral
  var refMap={};
  aJobs.forEach(function(j){var r=j.referral||'Unknown';refMap[r]=(refMap[r]||0)+1;});
  var refColors={Google:'#4285f4','Word of Mouth':'#22c55e',Facebook:'#1877f2',Instagram:'#e1306c',Kijiji:'#ff6b00','Repeat Customer':'#a78bfa',Other:'#888888',Unknown:'#555555'};
  var refData=Object.keys(refMap).sort(function(a,b){return refMap[b]-refMap[a];}).map(function(k){return{key:k,val:refMap[k]};});
  document.getElementById('chart-referral').innerHTML=makeBarChart(refData,function(k){return refColors[k]||'#888';});

  requestAnimationFrame(function(){['chart-busiest-a','chart-bin-size','chart-city','chart-referral'].forEach(function(id){animateBars(document.getElementById(id));});});

  // Loyalty
  var custJobCount={};
  aJobs.forEach(function(j){if(j.name){var n=j.name.toLowerCase();custJobCount[n]=(custJobCount[n]||0)+1;}});
  var newC=0,repeatC=0,frequentC=0;
  Object.values(custJobCount).forEach(function(cnt){if(cnt===1)newC++;else if(cnt<=3)repeatC++;else frequentC++;});
  var lt=newC+repeatC+frequentC||1;
  document.getElementById('chart-loyalty').innerHTML=
    '<div class="pie-legend">'
    +'<div class="pie-legend-item"><div class="pie-dot" style="background:#4ade80"></div><span class="pie-legend-label">🆕 New (1 job)</span><span class="pie-legend-val">'+newC+' <span style="color:var(--muted);font-size:11px">('+Math.round(newC/lt*100)+'%)</span></span></div>'
    +'<div class="pie-legend-item"><div class="pie-dot" style="background:#f0932b"></div><span class="pie-legend-label">🔁 Repeat (2–3)</span><span class="pie-legend-val">'+repeatC+' <span style="color:var(--muted);font-size:11px">('+Math.round(repeatC/lt*100)+'%)</span></span></div>'
    +'<div class="pie-legend-item"><div class="pie-dot" style="background:#22c55e"></div><span class="pie-legend-label">⭐ Frequent (4+)</span><span class="pie-legend-val">'+frequentC+' <span style="color:var(--muted);font-size:11px">('+Math.round(frequentC/lt*100)+'%)</span></span></div>'
    +'</div>'
    +'<div style="display:flex;gap:4px;margin-top:16px;height:28px;border-radius:8px;overflow:hidden">'
    +'<div style="width:'+Math.round(newC/lt*100)+'%;background:#4ade80" title="New: '+newC+'"></div>'
    +'<div style="width:'+Math.round(repeatC/lt*100)+'%;background:#f0932b" title="Repeat: '+repeatC+'"></div>'
    +'<div style="width:'+Math.round(frequentC/lt*100)+'%;background:#22c55e" title="Frequent: '+frequentC+'"></div>'
    +'</div><div style="display:flex;gap:16px;font-size:10px;color:var(--muted);margin-top:6px"><span style="color:#4ade80">■ New</span><span style="color:#f0932b">■ Repeat</span><span style="color:#22c55e">■ Frequent</span></div>';

  // Jobs over time
  var now2=new Date(),months=[];
  for(var i=11;i>=0;i--){var d=new Date(now2.getFullYear(),now2.getMonth()-i,1);months.push({label:d.toLocaleDateString('en-US',{month:'short'}),year:d.getFullYear(),month:d.getMonth(),bins:0,junk:0,furn:0});}
  aJobs.forEach(function(j){var d=new Date(j.date);months.forEach(function(m){if(d.getFullYear()===m.year&&d.getMonth()===m.month){if(j.service==='Bin Rental')m.bins++;else if(j.service==='Junk Removal')m.junk++;else m.furn++;}});});
  var maxM=Math.max.apply(null,months.map(function(m){return m.bins+m.junk+m.furn;}))||1;
  var chartEl=document.getElementById('chart-time'),labelsEl=document.getElementById('chart-time-labels');
  chartEl.innerHTML=months.map(function(m,mi){
    var tot=m.bins+m.junk+m.furn,bH=Math.round(m.bins/maxM*110),jH=Math.round(m.junk/maxM*110),fH=Math.round(m.furn/maxM*110);
    function seg(h,col,cnt,r){if(!cnt)return'';return'<div class="vbar-seg" data-h="'+h+'" style="width:100%;height:0;background:'+col+';border-radius:'+r+';overflow:hidden;display:flex;align-items:center;justify-content:center;transition:height 2.45s cubic-bezier(.22,.68,0,1.2);transition-delay:'+(mi*30)+'ms"><span style="font-size:9px;font-weight:700;color:#fff;user-select:none">'+cnt+'</span></div>';}
    return'<div style="flex:1;display:flex;flex-direction:column;align-items:center">'
      +'<div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:3px;min-height:16px">'+(tot>0?tot:'')+'</div>'
      +'<div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;height:110px;gap:1px">'+seg(fH,'#dc3545',m.furn,'2px 2px 0 0')+seg(jH,'#e67e22',m.junk,'0')+seg(bH,'#22c55e',m.bins,'0')+(tot===0?'<div style="width:100%;height:2px;background:var(--border)"></div>':'')+'</div></div>';
  }).join('');
  labelsEl.innerHTML=months.map(function(m){return'<div style="flex:1;text-align:center;font-size:10px;color:var(--muted)">'+m.label+'</div>';}).join('');
  requestAnimationFrame(function(){document.querySelectorAll('#chart-time .vbar-seg').forEach(function(seg){var h=seg.getAttribute('data-h');setTimeout(function(){seg.style.height=h+'px';},10);});});

  // Service Mix Trend
  var mixEl=document.getElementById('chart-service-mix');
  if(mixEl){
    var yearMix={};
    aJobs.forEach(function(j){
      if(!j.date)return;
      var yr=j.date.slice(0,4);
      if(!yearMix[yr])yearMix[yr]={bin:0,junk:0,other:0,total:0};
      yearMix[yr].total++;
      if(j.service==='Bin Rental')yearMix[yr].bin++;
      else if(j.service==='Junk Removal')yearMix[yr].junk++;
      else yearMix[yr].other++;
    });
    var years=Object.keys(yearMix).sort();
    if(years.length<2){
      mixEl.innerHTML='<div style="color:var(--muted);font-size:12px;padding:12px 0;">Switch to <strong>Year</strong> or <strong>All Time</strong> to see the multi-year trend.</div>';
    }else{
      mixEl.innerHTML=years.map(function(yr){
        var d=yearMix[yr];if(!d.total)return'';
        var binPct=Math.round(d.bin/d.total*100),junkPct=Math.round(d.junk/d.total*100),otherPct=100-binPct-junkPct;
        return'<div style="margin-bottom:14px;">'
          +'<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;">'
          +'<span style="font-size:13px;font-weight:700;color:var(--text);">'+yr+'</span>'
          +'<span style="font-size:11px;color:var(--muted);">'+d.total.toLocaleString()+' jobs</span></div>'
          +'<div style="height:22px;border-radius:6px;overflow:hidden;display:flex;gap:1px;">'
          +(binPct?'<div style="width:'+binPct+'%;background:#22c55e;display:flex;align-items:center;justify-content:center;"><span style="font-size:10px;font-weight:700;color:#fff;">'+binPct+'%</span></div>':'')
          +(junkPct?'<div style="width:'+junkPct+'%;background:#e67e22;display:flex;align-items:center;justify-content:center;"><span style="font-size:10px;font-weight:700;color:#fff;">'+junkPct+'%</span></div>':'')
          +(otherPct>2?'<div style="width:'+otherPct+'%;background:#94a3b8;display:flex;align-items:center;justify-content:center;"><span style="font-size:10px;font-weight:700;color:#fff;">'+otherPct+'%</span></div>':'')
          +'</div></div>';
      }).join('')
      +'<div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap;">'
      +'<div style="display:flex;align-items:center;gap:5px;"><div style="width:10px;height:10px;border-radius:2px;background:#22c55e;flex-shrink:0;"></div><span style="font-size:11px;color:var(--muted);">Bin Rental</span></div>'
      +'<div style="display:flex;align-items:center;gap:5px;"><div style="width:10px;height:10px;border-radius:2px;background:#e67e22;flex-shrink:0;"></div><span style="font-size:11px;color:var(--muted);">Junk Removal</span></div>'
      +'<div style="display:flex;align-items:center;gap:5px;"><div style="width:10px;height:10px;border-radius:2px;background:#94a3b8;flex-shrink:0;"></div><span style="font-size:11px;color:var(--muted);">Other</span></div>'
      +'</div>';
    }
  }

  // Bin Turnover Rate — always all-time
  var turnoverEl=document.getElementById('chart-bin-turnover');
  var turnoverNote=document.getElementById('chart-bin-turnover-note');
  if(turnoverEl){
    var fleetCounts={'14 yard':54,'20 yard':20,'4 yard':8,'7 yard':4};
    var sizeColors2={'14 yard':'#22c55e','20 yard':'#3b82f6','4 yard':'#e67e22','7 yard':'#f97316'};
    db.from('jobs').select('bin_size').eq('service','Bin Rental').neq('status','cancelled').not('bin_size','is',null)
      .then(function(res){
        if(res.error||!res.data)return;
        var binBySize={};
        res.data.forEach(function(j){binBySize[j.bin_size]=(binBySize[j.bin_size]||0)+1;});
        var totalMonths=Math.max(1,Math.round((new Date()-new Date(2023,2,1))/(30*24*60*60*1000)));
        var sizes=['14 yard','20 yard','4 yard','7 yard'];
        var maxRate=0;
        var rates=sizes.map(function(sz){
          var rentals=binBySize[sz]||0,fleet=fleetCounts[sz];
          var rate=fleet>0?rentals/fleet/totalMonths:0;
          if(rate>maxRate)maxRate=rate;
          return{sz:sz,rentals:rentals,fleet:fleet,rate:rate};
        });
        turnoverEl.innerHTML=rates.map(function(r){
          var pct=maxRate>0?Math.round(r.rate/maxRate*100):0,rateStr=r.rate.toFixed(1);
          return'<div style="margin-bottom:14px;">'
            +'<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;">'
            +'<span style="font-size:13px;font-weight:700;color:var(--text);">'+r.sz+'</span>'
            +'<span style="font-size:11px;color:var(--muted);">'+rateStr+' rentals/bin/mo &nbsp;·&nbsp; '+r.rentals.toLocaleString()+' total &nbsp;·&nbsp; '+r.fleet+' bins</span></div>'
            +'<div style="height:18px;background:var(--surface2);border-radius:6px;overflow:hidden;">'
            +'<div style="height:100%;width:'+pct+'%;background:'+sizeColors2[r.sz]+';border-radius:6px;transition:width .6s ease;display:flex;align-items:center;padding-left:8px;">'
            +(pct>18?'<span style="font-size:10px;font-weight:700;color:#fff;">'+rateStr+'x</span>':'')
            +'</div></div></div>';
        }).join('');
        if(turnoverNote)turnoverNote.textContent='All-time average since March 2023. Higher = each bin rented more often per month.';
      });
  }
}
function initAnalytics(){
  setAnalyticsPeriod('week',document.getElementById('af-week'));
}
// ─── BIN MAP ───
var leafMap=null,mapPins=[];
function geocode(addr,cb){
  if(!addr){cb(null);return;}
  if(geoCache[addr]){cb(geoCache[addr]);return;}
  fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(addr),{
    headers:{'User-Agent':'JeffsJunkJobTracker/1.0 (jeffsjunk.ca)','Accept-Language':'en'}
  })
    .then(function(r){return r.json();})
    .then(function(data){if(data&&data[0]){var r={lat:parseFloat(data[0].lat),lng:parseFloat(data[0].lon)};geoCache[addr]=r;saveGeo();cb(r);}else{cb(null);}})
    .catch(function(){cb(null);});
}
function pinIcon(status){
  var c={Pending:'#22c55e','In Progress':'#4ade80',Done:'#7cc9a0',Cancelled:'#666666'}[status]||'#22c55e';
  var html='<div style="position:relative;width:30px;height:40px"><svg viewBox="0 0 30 40" width="30" height="40" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.55))"><path d="M15 0C6.7 0 0 6.7 0 15 0 25.5 15 40 15 40S30 25.5 30 15C30 6.7 23.3 0 15 0z" fill="'+c+'"/><circle cx="15" cy="15" r="7" fill="rgba(0,0,0,.2)"/></svg><div style="position:absolute;top:7px;left:7px;font-size:13px">🚛</div></div>';
  return L.divIcon({html:html,iconSize:[30,40],iconAnchor:[15,40],popupAnchor:[0,-42],className:''});
}
async function renderMap(){
  if(typeof L==='undefined'){document.getElementById('map-spinner').style.display='flex';setTimeout(renderMap,250);return;}
  document.getElementById('map-spinner').style.display='flex';

  // Always fetch fresh active bin jobs from Supabase for the map
  // Fetch ALL bin rentals where the bin is physically out (dropped but not picked up)
  try {
    var rMap = await db.from('jobs').select('*')
      .eq('service','Bin Rental')
      .neq('status','Cancelled')
      .neq('bin_instatus','pickedup');
    var mapBinRows = (rMap.data || []).map(dbToJob);
    mapBinRows.forEach(function(j){
      var idx=jobs.findIndex(function(x){return x.id===j.id;});
      if(idx>=0) jobs[idx]=j; else jobs.push(j);
    });
  } catch(e){ console.warn('Map bin load error:',e); }

  // Show all bins that are physically out — not cancelled, not picked up
  var today = todayStr();
  var binJobs = jobs.filter(function(j){
    if(j.service!=='Bin Rental') return false;
    if(j.status==='Cancelled') return false;
    if(j.binInstatus==='pickedup') return false;
    return true;
  });
  document.getElementById('bin-cnt').textContent=binJobs.length;
  var rowsEl=document.getElementById('bin-rows');
  rowsEl.innerHTML=binJobs.length?binJobs.map(function(j){
    var ra=resolveAddr(j);
    return '<div class="bin-row" id="br-'+j.id+'" onclick="flyTo(\''+j.id+'\')">'
    +'<div class="bin-row-name">'+j.name+'</div>'
    +'<div class="bin-row-addr">'+(ra.display||'<span style="color:var(--red);font-size:11px">⚠ No address</span>')+'</div>'
    +'<div class="bin-row-meta">'+(j.binSize?'<span style="font-size:11px;color:var(--muted)">'+j.binSize+'</span>':'')+(j.binPickup?'<span style="font-size:11px;color:var(--muted)">Pickup: '+fd(j.binPickup)+'</span>':'')+'</div>'
    +'</div>';}).join('')
    :'<div class="empty-state" style="padding:28px 16px"><div class="ei">🚛</div><h3>No active bins</h3><p>All bins are currently in the yard</p></div>';
  if(!leafMap){
    leafMap=L.map('the-map',{center:[44.39,-79.69],zoom:10});
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',maxZoom:19}).addTo(leafMap);
  }
  document.getElementById('map-spinner').style.display='none';
  mapPins.forEach(function(p){try{p.marker.remove();}catch(e){}});mapPins=[];
  if(!binJobs.length){setTimeout(function(){try{leafMap.invalidateSize();}catch(e){}},300);return;}
  var bounds=[];
  function addPin(j, geo) {
    var ra=resolveAddr(j);
    var popup='<div class="p-id">'+j.id+'</div><div class="p-name">'+j.name+'</div><div class="p-addr">'+ra.display+'</div>'
      +'<div style="display:flex;gap:5px;flex-wrap:wrap;margin:5px 0">'+sb(j.service)+'</div>'
      +'<div class="p-meta">📅 '+fd(j.date)+(j.time?' · '+ft(j.time):'')+(j.binSize?'<br>📦 '+j.binSize:'')+(j.binDropoff?'<br>⬇ Drop-off: '+fd(j.binDropoff):'')+(j.binPickup?'<br>⬆ Pickup: '+fd(j.binPickup):'')+'</div>'
      +'<button class="p-btn" onclick="openDetail(\''+j.id+'\')">View Details →</button>';
    var marker=L.marker([geo.lat,geo.lng],{icon:pinIcon(j.status)}).bindPopup(popup,{maxWidth:260}).addTo(leafMap);
    marker.on('click',function(){highlightRow(j.id);});
    mapPins.push({id:j.id,marker:marker,lat:geo.lat,lng:geo.lng});bounds.push([geo.lat,geo.lng]);
  }
  function fitMap() {
    if(bounds.length===1)leafMap.setView(bounds[0],14);
    else if(bounds.length>1)leafMap.fitBounds(bounds,{padding:[50,50],maxZoom:14});
    else leafMap.setView([44.39,-79.69],10);
    setTimeout(function(){try{leafMap.invalidateSize();}catch(e){}},300);
  }
  // Process cached addresses instantly, queue uncached for rate-limited geocoding
  var uncached = [];
  binJobs.forEach(function(j) {
    var ra = resolveAddr(j);
    if (!ra.geocodeStr) return;
    if (geoCache[ra.geocodeStr]) { addPin(j, geoCache[ra.geocodeStr]); }
    else { uncached.push(j); }
  });
  if (!uncached.length) { fitMap(); }
  else {
    var idx = 0;
    function next() {
      if (idx >= uncached.length) { fitMap(); return; }
      var j = uncached[idx++];
      var ra = resolveAddr(j);
      geocode(ra.geocodeStr, function(geo) {
        if (geo) addPin(j, geo);
        setTimeout(next, 300);
      });
    }
    next();
  }
}
function highlightRow(id){document.querySelectorAll('.bin-row').forEach(function(r){r.classList.remove('on');});var r=document.getElementById('br-'+id);if(r){r.classList.add('on');r.scrollIntoView({behavior:'smooth',block:'nearest'});}}
function flyTo(id){var pin=null;mapPins.forEach(function(p){if(p.id===id)pin=p;});if(pin){leafMap.setView([pin.lat,pin.lng],15,{animate:true});pin.marker.openPopup();}highlightRow(id);}

// ─── BIN INVENTORY ───
function setFleetF(v,el){fleetF=v;document.querySelectorAll('.fleet-nav-btn').forEach(function(b){b.classList.remove('active');});if(el)el.classList.add('active');renderBinInventory();}
function setFleetSort(field,el){
  if(fleetSort===field)fleetSortDir*=-1;else{fleetSort=field;fleetSortDir=1;}
  document.querySelectorAll('.sort-chip').forEach(function(c){c.classList.remove('on');});
  if(el)el.classList.add('on');
  var arr=el?el.querySelector('.sort-arr'):null;if(arr)arr.textContent=fleetSortDir===1?' ↑':' ↓';
  renderFleetTable();
}
function sizePill(s){var cls=s==='4 yard'?'sp-4':s==='7 yard'?'sp-7':s==='14 yard'?'sp-14':'sp-20';return '<span class="sp '+cls+'">'+s+'</span>';}
function typePill(t){var cls=t==='wide'||t==='low'?'tc-low':'tc-reg';var lbl=t==='wide'||t==='low'?'Low-Wide':'Regular';return '<span class="tc '+cls+'">'+lbl+'</span>';}
function binsOutOnDate(dateStr){
  var count=0;
  jobs.forEach(function(j){
    if(j.service!=='Bin Rental')return;
    if(j.status==='Cancelled')return;
    if(j.binInstatus==='pickedup')return;
    var drop=j.binDropoff||j.date;
    var pick=j.binPickup;
    if(!drop)return;
    if(pick){
      // Has a scheduled pickup — count only in the dropoff→pickup window
      if(dateStr>=drop&&dateStr<=pick) count++;
    } else {
      // No pickup date set — count from dropoff up to 30 days
      var dropD=new Date(drop+'T12:00:00');
      var maxPick=new Date(dropD);maxPick.setDate(maxPick.getDate()+30);
      var maxPickStr=maxPick.toISOString().split('T')[0];
      if(dateStr>=drop&&dateStr<=maxPickStr) count++;
    }
  });
  return Math.min(count, binItems.length);
}
function renderBinInventory(){
  var total=binItems.length,inYard=0,outJob=0,damaged=0,green=0,black=0,s4=0,s7=0,s14=0,s20=0;
  binItems.forEach(function(b){
    if(b.status==='in')inYard++;else outJob++;
    if(b.damage==='damage')damaged++;
    if(b.color==='green')green++;else black++;
    if(b.size==='4 yard')s4++;else if(b.size==='7 yard')s7++;else if(b.size==='14 yard')s14++;else s20++;
  });
  var cn={'all':total,'in':inYard,'out':outJob,'damage':damaged,'green':green,'black':black,'4':s4,'7':s7,'14':s14,'20':s20};
  Object.keys(cn).forEach(function(k){var el=document.getElementById('fn-'+k);if(el)el.textContent=cn[k];});
  var inPct=total?Math.round(inYard/total*100):0,outPct=total?Math.round(outJob/total*100):0,dmgPct=total?Math.round(damaged/total*100):0;
  var stats=[
    {val:total,lbl:'Total Bins',color:'#22c55e',pct:100},
    {val:inYard,lbl:'In Yard',color:'#22c55e',pct:inPct},
    {val:outJob,lbl:'Out on Job',color:'#dc3545',pct:outPct},
    {val:damaged,lbl:'Damaged',color:'#e76f7e',pct:dmgPct},
    {val:green,lbl:'Green Bins',color:'#4ade80',pct:total?Math.round(green/total*100):0},
    {val:black,lbl:'Black Bins',color:'#aaa',pct:total?Math.round(black/total*100):0},
  ];
  document.getElementById('fleet-stats').innerHTML=stats.map(function(s){return'<div class="fstat" style="--fcolor:'+s.color+'"><div class="fstat-val">'+s.val+'</div><div class="fstat-lbl">'+s.lbl+'</div><div class="fstat-bar"><div class="fstat-fill" style="width:'+s.pct+'%"></div></div></div>';}).join('');
  document.getElementById('fleet-sub').textContent=total+' bins · '+inYard+' in yard · '+outJob+' out';
  renderFleetTable();renderTimeline();
}
function renderFleetTable(){
  var q=fleetQ.toLowerCase();
  var list=binItems.filter(function(b){
    if(fleetF==='in')return b.status==='in';if(fleetF==='out')return b.status==='out';
    if(fleetF==='damage')return b.damage==='damage';if(fleetF==='green')return b.color==='green';
    if(fleetF==='black')return b.color==='black';if(fleetF==='4 yard')return b.size==='4 yard';
    if(fleetF==='7 yard')return b.size==='7 yard';if(fleetF==='14 yard')return b.size==='14 yard';
    if(fleetF==='20 yard')return b.size==='20 yard';return true;
  });
  if(q)list=list.filter(function(b){return (b.num||'').toLowerCase().indexOf(q)>=0||(b.notes||'').toLowerCase().indexOf(q)>=0||(b.size||'').toLowerCase().indexOf(q)>=0||(b.type||'').toLowerCase().indexOf(q)>=0||(b.color||'').toLowerCase().indexOf(q)>=0;});
  list=[].concat(list).sort(function(a,b){var av,bv;if(fleetSort==='size'){av=sizeOrder[a.size]||0;bv=sizeOrder[b.size]||0;}else if(fleetSort==='status'){av=a.status==='out'?0:1;bv=b.status==='out'?0:1;}else{av=(a.num||'').toLowerCase();bv=(b.num||'').toLowerCase();}return av<bv?-fleetSortDir:av>bv?fleetSortDir:0;});
  document.getElementById('fleet-count-lbl').textContent=list.length+' of '+binItems.length+' bins';
  var tbody=document.getElementById('fleet-tbody');
  if(!list.length){tbody.innerHTML='<tr><td colspan="9" class="fleet-empty">No bins match your filter</td></tr>';return;}
  var grouped=(fleetF==='all'||fleetF==='green'||fleetF==='black')&&!q;
  var html='';
  if(grouped){
    ['4 yard','7 yard','14 yard','20 yard'].forEach(function(sz){
      var group=list.filter(function(b){return b.size===sz;});if(!group.length)return;
      var inG=group.filter(function(b){return b.status==='in';}).length;
      html+='<tr class="grp-hdr"><td colspan="9">'+sizePill(sz)+' &nbsp;'+group.length+' bins — <span style="color:#22c55e">'+inG+' in</span> / <span style="color:#dc3545">'+(group.length-inG)+' out</span></td></tr>';
      group.forEach(function(b){html+=makeBinRow(b);});
    });
  } else {list.forEach(function(b){html+=makeBinRow(b);});}
  tbody.innerHTML=html;
}
function makeBinRow(b){
  var numCls=b.color==='green'?'gc':'bc';
  var colorDot=b.color==='green'?'<span class="cdot cdot-g"></span>Green':'<span class="cdot cdot-b"></span>Black';
  var togCls=b.status==='in'?'stog stog-in':'stog stog-out';
  var togLbl=b.status==='in'?'<span class="sdot"></span>In Yard':'<span class="sdot"></span>Out';
  var dmg=b.damage==='damage'?'<span class="dmg-flag">⚠ Dmg</span>':'<span class="dmg-ok">—</span>';
  var rowCls=b.damage==='damage'?' class="row-damaged"':'';
  // Show current job/location for bins marked 'out'
  var locationCell='<td style="font-size:11px;max-width:150px"></td>';
  if(b.status==='out'){
    var curJob=jobs.find(function(j){return j.binBid===b.bid&&j.status!=='Done'&&j.status!=='Cancelled';});
    if(curJob){
      locationCell='<td style="font-size:11px;max-width:150px"><span style="color:#22c55e;cursor:pointer;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block" onclick="openDetail(\''+curJob.id+'\')" title="'+curJob.name+' · '+curJob.address+'">📍 '+curJob.name+'</span><div style="color:var(--muted);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(curJob.address?curJob.address.split(',')[0]:'')+'</div></td>';
    } else {
      locationCell='<td style="font-size:11px"><span style="color:#e67e22">⚠ Not linked</span> <button class="ra-btn" style="font-size:10px;padding:2px 6px;color:#0d6efd;border-color:rgba(13,110,253,.4)" onclick="event.stopPropagation();openLinkBinToJob(\''+b.bid+'\')">🔗 Link</button></td>';
    }
  }
  return '<tr'+rowCls+'><td><span class="bnum '+numCls+'" style="cursor:pointer" onclick="event.stopPropagation();openBinHistory(\''+b.bid+'\')">'+b.num+'</span></td><td style="font-size:12px;white-space:nowrap">'+colorDot+'</td><td>'+sizePill(b.size)+'</td><td>'+typePill(b.type)+'</td>'
    +'<td><button class="'+togCls+'" onclick="quickToggleStatus(\''+b.bid+'\')">'+togLbl+'</button></td>'
    +locationCell
    +'<td>'+dmg+'</td><td style="font-size:11px;color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(b.notes||'')+'</td>'
    +'<td><div class="ra"><button class="ra-btn" style="color:#0d6efd;border-color:rgba(13,110,253,.4)" onclick="openBinHistory(\''+b.bid+'\')">📜 History</button><button class="ra-btn" style="color:#22c55e;border-color:rgba(34,197,94,.3)" onclick="bookBin(\''+b.size+'\')">📅 Book</button><button class="ra-btn" onclick="editBinItem(\''+b.bid+'\')">✏ Edit</button><button class="ra-btn del" onclick="delBinItem(\''+b.bid+'\')">✕</button></div></td></tr>';
}
function quickToggleStatus(bid){
  binItems.forEach(function(b){if(b.bid===bid)b.status=b.status==='in'?'out':'in';});
  saveBins();
  renderBinInventory();
  refreshDashBinStats();
  // Also refresh utilization page if currently visible
  var activeView=document.querySelector('.view.active');
  if(activeView&&activeView.id==='view-utilization') renderUtilization();
}
function shiftTimeline(n){tlOffset+=n;renderTimeline();}
function renderTimeline(){
  var numDays=14;
  var start=new Date();start.setDate(start.getDate()+tlOffset);start.setHours(0,0,0,0);
  var totalBins=binItems.length;
  var todayISO=new Date().toISOString().split('T')[0];
  var sizes=['4 yard','7 yard','14 yard','20 yard'];
  var sizeColors={'4 yard':'#4ade80','7 yard':'#f0932b','14 yard':'#f0932b','20 yard':'#e76f7e'};
  var sizeLabels={'4 yard':'4 YD','7 yard':'7 YD','14 yard':'14 YD','20 yard':'20 YD'};

  // Build date columns
  var cols=[];
  for(var i=0;i<numDays;i++){
    var d=new Date(start);d.setDate(d.getDate()+i);
    cols.push(d.toISOString().split('T')[0]);
  }

  // Active bin rental jobs only (not cancelled, not picked up)
  var binJobs=jobs.filter(function(j){
    return j.service==='Bin Rental'&&j.status!=='Cancelled'&&j.binInstatus!=='pickedup';
  });

  // For each date, count how many jobs of each size are active
  // Pre-compute fleet count per size once
  var fleetBySize={};
  sizes.forEach(function(s){
    fleetBySize[s]=binItems.filter(function(b){return b.size===s;}).length;
  });

  function outBySize(ds){
    var out={'4 yard':0,'7 yard':0,'14 yard':0,'20 yard':0};
    binJobs.forEach(function(j){
      var drop=j.binDropoff||j.date;
      var pick=j.binPickup;
      if(!drop)return;
      var active;
      if(pick){
        active=ds>=drop&&ds<=pick;
      } else {
        var dropD=new Date(drop+'T12:00:00');
        var maxPick=new Date(dropD);maxPick.setDate(maxPick.getDate()+30);
        active=ds>=drop&&ds<=maxPick.toISOString().split('T')[0];
      }
      if(active&&out.hasOwnProperty(j.binSize))out[j.binSize]++;
    });
    sizes.forEach(function(s){ out[s]=Math.min(out[s],fleetBySize[s]||0); });
    return out;
  }

  // Header row
  var headCols=cols.map(function(ds){
    var d=new Date(ds+'T00:00:00');
    var isT=ds===todayISO;
    return '<th'+(isT?' class="tl-today-col"':'')+' style="min-width:64px;text-align:center">'
      +(isT?'<span style="color:var(--accent);font-size:9px;display:block;font-weight:700">TODAY</span>':'')
      +'<span style="font-size:9px;color:var(--muted)">'+d.toLocaleDateString('en-US',{weekday:'short'})+'</span>'
      +'<br><span style="font-weight:600;font-size:12px">'+d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+'</span>'
      +'</th>';
  }).join('');

  // Summary row: total out / in
  // For today use binItems.status (physical truth); for other dates use job records
  var sumCells=cols.map(function(ds){
    var out,inY;
    if(ds===todayISO){
      out=binItems.filter(function(b){return b.status==='out';}).length;
      inY=binItems.filter(function(b){return b.status==='in';}).length;
    } else {
      out=binsOutOnDate(ds);
      inY=Math.max(0,totalBins-out);
    }
    var isT=ds===todayISO;
    return '<td'+(isT?' class="tl-today-col"':'')+' style="padding:5px 8px;text-align:center">'
      +'<span class="tl-seg tl-seg-out" title="Out">'+out+'</span>'
      +' <span class="tl-seg tl-seg-in" title="Available">'+inY+'</span>'
      +'</td>';
  }).join('');
  var sumRow='<tr class="tl-sum-row"><td style="padding-left:14px;white-space:nowrap"><strong>📊 All Sizes</strong><br><span style="font-size:10px;color:var(--muted)">Out / Avail</span></td>'+sumCells+'</tr>';

  // One row per size showing available count
  var sizeRows=sizes.map(function(sz){
    var fleetCount=binItems.filter(function(b){return b.size===sz;}).length;
    if(!fleetCount)return '';
    var cells=cols.map(function(ds){
      var out,avail;
      if(ds===todayISO){
        out=binItems.filter(function(b){return b.size===sz&&b.status==='out';}).length;
        avail=binItems.filter(function(b){return b.size===sz&&b.status==='in';}).length;
      } else {
        var ob=outBySize(ds);
        out=ob[sz];
        avail=Math.max(0,fleetCount-out);
      }
      var isT=ds===todayISO;
      var pct=fleetCount?out/fleetCount:0;
      var bg=pct>=1?'rgba(220,53,69,.18)':pct>=0.5?'rgba(230,126,34,.12)':'rgba(34,197,94,.07)';
      return '<td'+(isT?' class="tl-today-col"':'')+' style="text-align:center;padding:4px 2px">'
        +'<div style="background:'+bg+';border-radius:6px;padding:4px 2px;margin:1px">'
        +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:20px;line-height:1;color:'+(avail===0?'#dc3545':sizeColors[sz])+'">'+avail+'</div>'
        +'<div style="font-size:9px;color:var(--muted)">avail</div>'
        +'</div>'
        +'</td>';
    }).join('');
    return '<tr>'
      +'<td style="padding-left:14px;white-space:nowrap">'
      +'<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:'+sizeColors[sz]+';margin-right:6px;vertical-align:middle"></span>'
      +'<strong style="font-size:13px">'+sizeLabels[sz]+'</strong>'
      +'<br><span style="font-size:10px;color:var(--muted)">'+fleetCount+' in fleet</span>'
      +'</td>'+cells+'</tr>';
  }).filter(Boolean).join('');

  var legend='<div style="display:flex;gap:20px;align-items:center;padding:10px 14px;border-top:1px solid var(--border);font-size:11px;color:var(--muted);flex-wrap:wrap">'
    +'<span style="font-weight:600;color:var(--text)">Availability key:</span>'
    +'<span><span style="display:inline-block;width:12px;height:12px;background:rgba(34,197,94,.15);border-radius:3px;margin-right:4px;vertical-align:middle"></span>Most available</span>'
    +'<span><span style="display:inline-block;width:12px;height:12px;background:rgba(230,126,34,.2);border-radius:3px;margin-right:4px;vertical-align:middle"></span>Half out</span>'
    +'<span><span style="display:inline-block;width:12px;height:12px;background:rgba(220,53,69,.2);border-radius:3px;margin-right:4px;vertical-align:middle"></span>Fully booked</span>'
    +'<span style="margin-left:auto">Big number = bins available that day</span>'
    +'</div>';

  document.getElementById('timeline-table').innerHTML=
    '<table class="tl-table"><thead><tr><th style="min-width:110px">Size</th>'+headCols+'</tr></thead>'
    +'<tbody>'+sumRow+sizeRows+'</tbody></table>'+legend;
}
var _linkBinBid='';
var _linkBinJobs=[];
async function openLinkBinToJob(bid){
  _linkBinBid=bid;
  var b=binItems.find(function(bi){return bi.bid===bid;});if(!b)return;
  document.getElementById('link-bin-ttl').textContent='🔗 Link Bin #'+b.num+' to a Job';
  document.getElementById('link-bin-search').value='';
  var el=document.getElementById('link-bin-jobs-list');
  el.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted)">Loading active bin jobs...</div>';
  document.getElementById('link-bin-modal').classList.add('open');
  // Fetch active bin rental jobs that don't have a bin assigned yet, or match size
  var res=await db.from('jobs').select('*').eq('service','Bin Rental').in('status',['In Progress','Pending']).neq('bin_instatus','pickedup').order('date',{ascending:false});
  _linkBinJobs=(res.data||[]).map(dbToJob);
  renderLinkBinJobs(_linkBinJobs);
}
function filterLinkBinJobs(q){
  var lq=q.toLowerCase();
  var filtered=_linkBinJobs.filter(function(j){return (j.name||'').toLowerCase().indexOf(lq)>=0||(j.address||'').toLowerCase().indexOf(lq)>=0||(j.id||'').toLowerCase().indexOf(lq)>=0;});
  renderLinkBinJobs(filtered);
}
function renderLinkBinJobs(list){
  var el=document.getElementById('link-bin-jobs-list');
  if(!list.length){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted)">No matching active bin rental jobs found</div>';return;}
  el.innerHTML=list.map(function(j){
    var hasOtherBin=j.binBid&&j.binBid!==_linkBinBid;
    return '<div style="padding:10px 14px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--surface2);display:flex;align-items:center;gap:10px;cursor:pointer" onclick="linkBinToJob(\''+_linkBinBid+'\',\''+j.id+'\')">'
      +'<div style="flex:1">'
        +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
          +'<span style="font-size:11px;color:#22c55e;font-weight:700">'+j.id+'</span>'
          +'<strong style="font-size:13px">'+j.name+'</strong>'
          +'<span style="font-size:11px;color:var(--muted)">'+fd(j.date)+'</span>'
          +(j.binSize?'<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(34,197,94,.08);color:#22c55e">'+j.binSize+'</span>':'')
          +(hasOtherBin?'<span style="font-size:10px;color:#e67e22">Already has bin</span>':'')
        +'</div>'
        +(j.address?'<div style="font-size:11px;color:var(--muted);margin-top:2px">📍 '+(j.address||'').split(',')[0]+(j.city?' · '+j.city:'')+'</div>':'')
      +'</div>'
      +'<button class="btn btn-primary btn-sm" style="font-size:11px;white-space:nowrap" onclick="event.stopPropagation();linkBinToJob(\''+_linkBinBid+'\',\''+j.id+'\')">Link</button>'
    +'</div>';
  }).join('');
}
async function linkBinToJob(bid,jobId){
  // Update job to reference this bin
  var b=binItems.find(function(bi){return bi.bid===bid;});
  var j=jobs.find(function(jj){return jj.id===jobId;});
  if(j){j.binBid=bid;if(b)j.binSize=b.size;}
  var res=await db.from('jobs').update({bin_bid:bid,bin_size:b?b.size:''}).eq('job_id',jobId);
  if(res.error){toast('Error linking bin: '+res.error.message,'error');return;}
  closeM('link-bin-modal');
  toast('Bin #'+(b?b.num:bid)+' linked to '+jobId+'!');
  loadBinJobsThenRender();
}

async function openBinHistory(bid){
  var b=binItems.find(function(bi){return bi.bid===bid;});if(!b)return;
  document.getElementById('bin-history-ttl').textContent='📜 History — Bin #'+b.num+' ('+b.size+')';
  var body=document.getElementById('bin-history-body');
  body.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted)">Loading history...</div>';
  document.getElementById('bin-history-modal').classList.add('open');
  // Query jobs + bin_history table in parallel
  var jobRes=db.from('jobs').select('*').eq('bin_bid',bid).order('date',{ascending:false});
  var histRes=db.from('bin_history').select('*').eq('bin_num',bid).order('dropoff_date',{ascending:false});
  var results=await Promise.all([jobRes,histRes]);
  var histJobs=(results[0].data||[]).map(dbToJob);
  var histRecords=results[1].data||[];
  // Deduplicate: bin_history records that share a job_id with a job are skipped
  var jobIds=new Set(histJobs.map(function(j){return j.id;}));
  var extraRecords=histRecords.filter(function(h){return !h.job_id||!jobIds.has(h.job_id);});
  var totalCount=histJobs.length+extraRecords.length;
  if(!totalCount){body.innerHTML='<div style="text-align:center;padding:30px;color:var(--muted)"><div style="font-size:32px;margin-bottom:8px">📭</div>No history found for this bin</div>';return;}
  var html='<div style="font-size:12px;color:var(--muted);margin-bottom:12px">'+totalCount+' record'+(totalCount!==1?'s':'')+' found</div>';
  html+=histJobs.map(function(j){
    var statusCol=j.status==='Done'?'#22c55e':j.status==='Cancelled'?'#dc3545':'#e67e22';
    return '<div style="padding:10px 14px;border:1px solid var(--border);border-left:3px solid '+statusCol+';border-radius:0 8px 8px 0;margin-bottom:6px;background:var(--surface2);cursor:pointer" onclick="closeM(\'bin-history-modal\');openDetail(\''+j.id+'\')">'
      +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        +'<span style="font-size:11px;background:rgba(34,197,94,.08);color:#22c55e;border-radius:4px;padding:1px 7px;font-weight:700">'+j.id+'</span>'
        +'<strong style="font-size:13px">'+j.name+'</strong>'
        +'<span style="font-size:11px;color:var(--muted)">'+fd(j.date)+'</span>'
        +'<span style="font-size:10px;padding:1px 6px;border-radius:4px;font-weight:600;background:'+statusCol+'22;color:'+statusCol+'">'+j.status+'</span>'
      +'</div>'
      +'<div style="font-size:11px;color:var(--muted);margin-top:3px">'
        +(j.address?'📍 '+j.address.split(',')[0]:'')
        +(j.city?' · '+j.city:'')
        +(j.phone?' · '+j.phone:'')
        +(j.binDropoff?' · Drop: '+fd(j.binDropoff):'')
        +(j.binPickup?' · Pick: '+fd(j.binPickup):'')
      +'</div>'
    +'</div>';
  }).join('');
  if(extraRecords.length){
    html+='<div style="font-size:11px;color:var(--muted);margin:12px 0 8px;border-top:1px solid var(--border);padding-top:10px">Archived History</div>';
    html+=extraRecords.map(function(h){
      return '<div style="padding:10px 14px;border:1px solid var(--border);border-left:3px solid #6b7280;border-radius:0 8px 8px 0;margin-bottom:6px;background:var(--surface2)">'
        +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
          +(h.job_id?'<span style="font-size:11px;background:rgba(107,114,128,.1);color:#6b7280;border-radius:4px;padding:1px 7px;font-weight:700">'+h.job_id+'</span>':'')
          +'<strong style="font-size:13px">'+(h.customer_name||'Unknown')+'</strong>'
          +(h.dropoff_date?'<span style="font-size:11px;color:var(--muted)">'+fd(h.dropoff_date)+'</span>':'')
        +'</div>'
        +'<div style="font-size:11px;color:var(--muted);margin-top:3px">'
          +(h.job_address?'📍 '+h.job_address.split(',')[0]:'')
          +(h.city?' · '+h.city:'')
          +(h.dropoff_date?' · Drop: '+fd(h.dropoff_date):'')
          +(h.pickup_date?' · Pick: '+fd(h.pickup_date):'')
          +(h.material_type?' · '+h.material_type:'')
        +'</div>'
      +'</div>';
    }).join('');
  }
  body.innerHTML=html;
}

async function openAssignBinPicker(jobId){
  var j=jobs.find(function(jj){return jj.id===jobId;});if(!j)return;
  closeM('detail-modal');
  var size=j.binSize;
  var availBins=binItems.filter(function(b){return b.status==='in'&&(!size||b.size===size);});
  var html='<div style="font-size:13px;color:var(--muted);margin-bottom:12px">Showing '+availBins.length+' available'+(size?' '+size:'')+' bins</div>';
  if(!availBins.length){html+='<div style="text-align:center;padding:20px;color:var(--muted)">No available bins of this size</div>';}
  else{
    html+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px">';
    availBins.forEach(function(b){
      html+='<div style="padding:10px;border:1px solid var(--border);border-radius:8px;text-align:center;cursor:pointer;background:var(--surface2);transition:all .15s" onmouseover="this.style.borderColor=\'#22c55e\'" onmouseout="this.style.borderColor=\'var(--border)\'" onclick="doAssignBin(\''+jobId+'\',\''+b.bid+'\')">'
        +'<div style="font-weight:700;font-size:14px">#'+b.num+'</div>'
        +'<div style="font-size:11px;color:var(--muted)">'+b.size+'</div>'
        +'<div style="font-size:10px;color:'+(b.color==='green'?'#22c55e':'#888')+'">'+b.color+'</div>'
        +'</div>';
    });
    html+='</div>';
  }
  document.getElementById('assign-bin-body').innerHTML=html;
  document.getElementById('assign-bin-modal').classList.add('open');
  window._assignBinJobId=jobId;
}

async function doAssignBin(jobId,bid){
  var b=binItems.find(function(bi){return bi.bid===bid;});
  var j=jobs.find(function(jj){return jj.id===jobId;});
  if(!j||!b)return;
  j.binBid=bid;
  j.binSize=b.size;
  b.status='out';
  saveBins();
  saveSingleJob(j);
  closeM('assign-bin-modal');
  toast('Bin #'+b.num+' assigned to '+jobId+'!');
  openDetail(jobId);
}

function openAddBin(){
  editBinId=null;document.getElementById('bin-modal-ttl').textContent='Add Bin';document.getElementById('bin-save-btn').textContent='Add Bin';
  document.getElementById('bi-num').value='';document.getElementById('bi-type').value='regular';document.getElementById('bi-size').value='14 yard';
  document.getElementById('bi-color').value='green';document.getElementById('bi-dmg').value='good';document.getElementById('bi-status').value='in';document.getElementById('bi-notes').value='';
  document.getElementById('err-bi-num').textContent='Bin number or name is required.';
  clearErr('bi-num');
  document.getElementById('bin-modal').classList.add('open');
}
function editBinItem(bid){
  var b=null;binItems.forEach(function(bi){if(bi.bid===bid)b=bi;});if(!b)return;
  editBinId=bid;document.getElementById('bin-modal-ttl').textContent='Edit Bin';document.getElementById('bin-save-btn').textContent='Save Changes';
  document.getElementById('bi-num').value=b.num||'';document.getElementById('bi-type').value=b.type||'regular';document.getElementById('bi-size').value=b.size||'14 yard';
  document.getElementById('bi-color').value=b.color||'green';document.getElementById('bi-dmg').value=b.damage||'good';document.getElementById('bi-status').value=b.status||'in';document.getElementById('bi-notes').value=b.notes||'';
  document.getElementById('bin-modal').classList.add('open');
}
function saveBinItem(e){
  e.preventDefault();
  var num=document.getElementById('bi-num').value.trim();
  if(!num){showErr('bi-num');return;}
  // Check for duplicate bin number
  var isDupe=binItems.some(function(b){return b.num.toLowerCase()===num.toLowerCase()&&b.bid!==editBinId;});
  if(isDupe){showErr('bi-num');document.getElementById('err-bi-num').textContent='A bin with this number already exists. Use a unique number.';return;}
  var bin={bid:editBinId||nextBinItemId(),num:num,type:document.getElementById('bi-type').value,size:document.getElementById('bi-size').value,color:document.getElementById('bi-color').value,damage:document.getElementById('bi-dmg').value,status:document.getElementById('bi-status').value,notes:document.getElementById('bi-notes').value.trim()};
  if(editBinId){var i=binItems.findIndex(function(b){return b.bid===editBinId;});if(i>=0)binItems[i]=bin;else binItems.push(bin);toast('Bin updated!');}else{binItems.push(bin);toast('Bin added!');}
  editBinId=null;saveBins();closeM('bin-modal');renderBinInventory();renderDash();
}
function delBinItem(bid){if(!confirm('Delete this bin?'))return;binItems=binItems.filter(function(b){return b.bid!==bid;});saveBins();toast('Bin deleted.');renderBinInventory();}

// ─── BIN CSV IMPORT ───
function openBinImport(){
  document.getElementById('bin-csv-text').value='';
  document.getElementById('bin-import-preview').textContent='';
  var fi=document.getElementById('bin-csv-file');if(fi)fi.value='';
  document.getElementById('bin-import-modal').classList.add('open');
}
function loadBinCsvFile(input){
  var file=input.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    document.getElementById('bin-csv-text').value=e.target.result;
    previewBinCsv();
  };
  reader.readAsText(file);
}
document.addEventListener('input',function(e){if(e.target&&e.target.id==='bin-csv-text')previewBinCsv();});
function parseBinCsv(raw){
  var lines=raw.trim().split(/\r?\n/).filter(function(l){return l.trim();});
  if(lines.length<2)return[];
  var headers=lines[0].split(',').map(function(h){return h.trim().toLowerCase();});
  var numIdx=headers.indexOf('num');
  if(numIdx===-1)return null; // no num column
  var rows=[];
  for(var i=1;i<lines.length;i++){
    var cols=lines[i].split(',').map(function(c){return c.trim();});
    var num=cols[numIdx]||'';
    if(!num)continue;
    var get=function(key){var idx=headers.indexOf(key);return idx>=0?(cols[idx]||''):'';};
    var type=get('type')||'regular';
    var size=get('size')||'14 yard';
    var color=get('color')||'green';
    var damage=get('damage')||'good';
    var status=get('status')||'in';
    var notes=get('notes')||'';
    rows.push({num:num,type:type,size:size,color:color,damage:damage,status:status,notes:notes});
  }
  return rows;
}
function previewBinCsv(){
  var raw=document.getElementById('bin-csv-text').value;
  var el=document.getElementById('bin-import-preview');
  if(!raw.trim()){el.textContent='';return;}
  var rows=parseBinCsv(raw);
  if(rows===null){el.style.color='var(--red)';el.textContent='⚠ Missing "num" column header.';return;}
  if(!rows.length){el.style.color='var(--muted)';el.textContent='No valid rows found.';return;}
  el.style.color='var(--accent)';el.textContent='✓ '+rows.length+' bin'+(rows.length!==1?'s':'')+' ready to import.';
}
function openBinHistoryImport(){
  document.getElementById('bin-history-csv-text').value='';
  document.getElementById('bin-history-import-preview').textContent='';
  document.getElementById('bin-history-import-modal').classList.add('open');
}

async function doBinHistoryImport(){
  var csv=document.getElementById('bin-history-csv-text').value.trim();
  if(!csv){toast('Paste CSV data first','warn');return;}
  var lines=csv.split('\n').map(function(l){return l.trim();}).filter(Boolean);
  if(lines.length<2){toast('Need header row + at least one data row','warn');return;}
  var headers=lines[0].split(',').map(function(h){return h.trim().toLowerCase().replace(/\s+/g,'_');});
  var rows=[];
  for(var i=1;i<lines.length;i++){
    var vals=lines[i].split(',').map(function(v){return v.trim();});
    var row={};
    headers.forEach(function(h,idx){row[h]=vals[idx]||'';});
    if(!row.bin_num)continue;
    rows.push({
      bin_num:row.bin_num||'',
      bin_size:row.bin_size||'',
      customer_name:row.customer_name||'',
      customer_phone:row.customer_phone||'',
      job_address:row.job_address||'',
      city:row.city||'',
      dropoff_date:row.dropoff_date||null,
      pickup_date:row.pickup_date||null,
      material_type:row.material_type||'',
      notes:row.notes||'',
      source:'legacy'
    });
  }
  if(!rows.length){toast('No valid rows found','warn');return;}
  var res=await db.from('bin_history').insert(rows);
  if(res.error){toast('Import error: '+res.error.message,'error');return;}
  toast(rows.length+' history records imported!');
  closeM('bin-history-import-modal');
}

function doBinCsvImport(){
  var raw=document.getElementById('bin-csv-text').value;
  var rows=parseBinCsv(raw);
  if(rows===null){toast('⚠ CSV must have a "num" column.');return;}
  if(!rows||!rows.length){toast('⚠ No valid rows to import.');return;}
  var added=0,skipped=0;
  rows.forEach(function(r){
    var isDupe=binItems.some(function(b){return b.num.toLowerCase()===r.num.toLowerCase();});
    if(isDupe){skipped++;return;}
    binItems.push({bid:nextBinItemId(),num:r.num,type:r.type,size:r.size,color:r.color,damage:r.damage,status:r.status,notes:r.notes});
    added++;
  });
  saveBins();renderBinInventory();renderDash();
  closeM('bin-import-modal');
  toast('✅ Imported '+added+' bin'+(added!==1?'s':'')+(skipped?' ('+skipped+' duplicates skipped)':'')+'.');
}

// ─── VALIDATION HELPERS ───
function showErr(fieldId){
  var el  = document.getElementById(fieldId);
  var msg = document.getElementById('err-'+fieldId);
  if(el && el.tagName !== 'DIV') { el.classList.add('field-error'); }
  if(msg) { msg.classList.add('show'); }
}
function clearErr(fieldId){
  var el  = document.getElementById(fieldId);
  var msg = document.getElementById('err-'+fieldId);
  if(el)  { el.classList.remove('field-error'); }
  if(msg) { msg.classList.remove('show'); }
}
function validateJob(){
  // Clear all errors first
  ['f-svc','f-name','f-date','f-city'].forEach(clearErr);
  var ok = true;
  var svc  = document.getElementById('f-svc').value;
  var name = document.getElementById('f-name').value.trim();
  var date = document.getElementById('f-date').value;
  var city = document.getElementById('f-city').value.trim();
  if(!svc){
    document.getElementById('err-f-svc').textContent = 'Please choose a service type (Bin Rental, Junk Removal, etc.)';
    showErr('f-svc'); ok = false;
  }
  if(!name){
    document.getElementById('err-f-name').textContent = 'Customer name is required.';
    showErr('f-name'); ok = false;
  }
  if(!date){
    document.getElementById('err-f-date').textContent = 'Please pick a date for this job.';
    showErr('f-date'); ok = false;
  }
  if(!city){
    document.getElementById('err-f-city').textContent = 'City is required (e.g. Barrie).';
    showErr('f-city'); ok = false;
  }
  return ok;
}
function validateClient(){
  return true; // Validation handled inline in saveClient
}

// ─── JOB MODALS ───
function closeM(id){document.getElementById(id).classList.remove('open');document.body.classList.remove('modal-open');}
function openM(id){document.getElementById(id).classList.add('open');document.body.classList.add('modal-open');}
function toggleBin(){
  var svc=document.getElementById('f-svc').value;
  var isBin=svc==='Bin Rental';
  var isJunk=svc==='Junk Removal';
  document.getElementById('bin-extra').style.display=isBin?'block':'none';
  var junkRecEl=document.getElementById('junk-recurring-extra');
  if(junkRecEl)junkRecEl.style.display=isJunk?'block':'none';
  document.getElementById('tools-needed-wrap').style.display=(isJunk)?'block':'none';
  if(isBin){
    // Auto-fill drop-off date to today if empty
    var bdrop=document.getElementById('f-bdrop');
    if(bdrop&&!bdrop.value) bdrop.value=new Date().toISOString().split('T')[0];
    setTimeout(function(){initBinPicker('','');},50);
  }
}
function newJob(){
  editId=null;
  _selectedClientObj=null;
  window._binPresetDays=null;
  document.getElementById('modal-ttl').textContent='New Job';document.getElementById('save-btn').textContent='Save Job';
  document.getElementById('f-svc').value='';document.getElementById('f-status').value='Pending';
  document.getElementById('f-names-wrap').innerHTML=_jobNameRow('');
  document.getElementById('f-phones-wrap').innerHTML=_jobPhoneRow('','','cell');
  document.getElementById('f-emails-wrap').innerHTML=_jobEmailRow('');
  document.getElementById('f-addr').value='';document.getElementById('f-city').value='';
  document.getElementById('f-date').value=new Date().toISOString().split('T')[0];document.getElementById('f-time').value='';
  document.getElementById('f-price').value='';document.getElementById('f-paid').value='Unpaid';document.getElementById('f-paymethod').value='';document.getElementById('f-referral').value='';
  document.getElementById('f-notes').value='';document.getElementById('bin-extra').style.display='none';document.getElementById('tools-needed-wrap').style.display='none';
  document.getElementById('f-tools').value='';
  document.getElementById('f-material-type').value='';
  document.querySelectorAll('.mat-btn').forEach(function(b){b.classList.remove('active');b.style.background='';b.style.color='';});
  document.getElementById('f-client-select').value='';
  document.getElementById('f-client-search').value='';
  var badge=document.getElementById('f-client-selected-badge');if(badge)badge.style.display='none';
  var res=document.getElementById('f-client-results');if(res)res.style.display='none';
  var picker=document.getElementById('f-addr-picker');if(picker)picker.style.display='none';
  ['f-svc','f-names','f-date','f-city'].forEach(clearErr);
  var recChk=document.getElementById('f-recurring');if(recChk)recChk.checked=false;
  var recOpts=document.getElementById('recurring-opts');if(recOpts)recOpts.style.display='none';
  var recInt=document.getElementById('f-recur-interval');if(recInt)recInt.value='biweekly';
  var junkRecChk=document.getElementById('f-junk-recurring');if(junkRecChk)junkRecChk.checked=false;
  var junkRecOpts=document.getElementById('junk-recurring-opts');if(junkRecOpts)junkRecOpts.style.display='none';
  var junkRecInt=document.getElementById('f-junk-recur-interval');if(junkRecInt)junkRecInt.value='biweekly';
  var junkRecExtra=document.getElementById('junk-recurring-extra');if(junkRecExtra)junkRecExtra.style.display='none';
  window._binPresetDays=0;
  document.querySelectorAll('.bin-quick-dur').forEach(function(b){b.classList.remove('active');});
  document.querySelectorAll('.bsz-btn').forEach(function(b){b.classList.remove('active');b.style.background='';b.style.color='';});
  document.getElementById('f-bsize').value='';
  binPickerSzFilter='all';
  var bps=document.getElementById('bin-picker-selected');if(bps){bps.style.display='none';bps.innerHTML='';delete bps.dataset.bid;}
  var bpc=document.getElementById('bin-picker-collapse');if(bpc)bpc.style.display='none';
  var bpa=document.getElementById('bin-picker-arrow');if(bpa)bpa.style.transform='rotate(0deg)';
  document.getElementById('job-modal').classList.add('open');
}

// ─── BIN PICKER ───────────────────────────────────────────────────────────
var binPickerSzFilter = 'all';

function renderBinPicker(selectedBid){
  var grid = document.getElementById('bin-picker-grid');
  if(!grid) return;
  var sizeColors = {'4 yard':'#4ade80','7 yard':'#f0932b','14 yard':'#f0932b','20 yard':'#e76f7e'};
  // Show all bins; in-yard bins are selectable, out bins shown but disabled
  var filtered = binPickerSzFilter==='all' ? binItems : binItems.filter(function(b){return b.size===binPickerSzFilter;});
  if(!filtered.length){
    grid.innerHTML='<div style="grid-column:1/-1;color:var(--muted);font-size:13px;padding:12px;text-align:center">No bins in fleet for this size</div>';
    return;
  }
  // Sort: in-yard first, then by bin number
  filtered = [].concat(filtered).sort(function(a,b){
    if(a.status==='in'&&b.status!=='in') return -1;
    if(a.status!=='in'&&b.status==='in') return 1;
    return (a.num||'').localeCompare(b.num||'');
  });
  grid.innerHTML = filtered.map(function(b){
    var isOut = b.status==='out';
    var isSel = b.bid === selectedBid;
    var col = sizeColors[b.size]||'#22c55e';
    var baseStyle = 'border-radius:10px;padding:10px 6px;text-align:center;cursor:'+(isOut?'not-allowed':'pointer')+';'
      +'border:2px solid '+(isSel?col:(isOut?'rgba(100,100,100,.3)':'rgba(255,255,255,.1)'))+';'
      +'background:'+(isSel?'rgba(34,197,94,.12)':(isOut?'rgba(60,60,60,.3)':'var(--surface)'))+'';
    return '<div style="'+baseStyle+'" '+(isOut?'title="Already out on a job"':'onclick="selectBinFromPicker(\''+b.bid+'\')"')+'>'
      +'<div style="font-size:18px;margin-bottom:4px">'+(b.color==='green'?'🟢':'⚫')+'</div>'
      +'<div style="font-size:13px;font-weight:700;color:'+(isOut?'var(--muted)':'var(--text)')+'">'+b.num+'</div>'
      +'<div style="font-size:10px;color:'+(isOut?'var(--muted)':col)+';margin-top:2px">'+b.size+'</div>'
      +'<div style="font-size:10px;color:'+(isOut?'#dc3545':'#22c55e')+';margin-top:2px">'+(isOut?'Out':'In Yard')+'</div>'
      +'</div>';
  }).join('');
}

function selectBinFromPicker(bid){
  var b = binItems.find(function(x){return x.bid===bid;});
  if(!b) return;
  document.getElementById('f-bsize').value = b.size;
  // Highlight selected
  renderBinPicker(bid);
  // Show selected label
  var sel = document.getElementById('bin-picker-selected');
  if(sel){
    sel.style.display='block';
    sel.innerHTML = '✅ Selected: <strong>'+b.num+'</strong> · '+b.size+(b.color?' · '+(b.color==='green'?'🟢 Green':'⚫ Black'):'');
    sel.dataset.bid = bid;
  }
  showMaterialType();
}

function selectBinSize(sz, el){
  // Set bin size on the hidden field — this is enough to save the job
  document.getElementById('f-bsize').value = sz;
  // Highlight the selected size button
  document.querySelectorAll('.bsz-btn').forEach(function(b){b.classList.remove('active');b.style.background='';b.style.color='';});
  if(el){el.classList.add('active');el.style.background='rgba(34,197,94,.12)';el.style.color='#22c55e';}
  // Filter the bin grid to this size
  binPickerSzFilter = sz;
  var currentBid = (document.getElementById('bin-picker-selected')||{}).dataset && document.getElementById('bin-picker-selected').dataset.bid;
  renderBinPicker(currentBid||'');
  // Show material type if applicable
  showMaterialType();
  // Auto-save the job — yard size button is the confirm action
  saveJob(new Event('submit'));
}

function filterBinPicker(sz, el){
  binPickerSzFilter = sz;
  document.querySelectorAll('.bsz-btn').forEach(function(b){b.classList.remove('active');b.style.background='';b.style.color='';});
  if(el){el.classList.add('active');el.style.background='rgba(34,197,94,.12)';el.style.color='#22c55e';}
  var currentBid = (document.getElementById('bin-picker-selected')||{}).dataset && document.getElementById('bin-picker-selected').dataset.bid;
  renderBinPicker(currentBid||'');
}

function getPickedBinBid(){
  var sel = document.getElementById('bin-picker-selected');
  return sel&&sel.style.display!=='none'&&sel.dataset.bid ? sel.dataset.bid : '';
}

function selectMaterial(val, btn){
  document.querySelectorAll('.mat-btn').forEach(function(b){b.classList.remove('active');b.style.background='';b.style.color='';});
  btn.classList.add('active');
  btn.style.background='rgba(34,197,94,.12)';
  btn.style.color='#22c55e';
  document.getElementById('f-material-type').value=val;
}
function showMaterialType(){
  var sz=document.getElementById('f-bsize').value;
  var wrap=document.getElementById('material-type-wrap');
  if(!wrap)return;
  var pickedBid=getPickedBinBid?getPickedBinBid():'';
  var pickedBin=pickedBid?binItems.find(function(b){return b.bid===pickedBid;}):null;
  var effectiveSize=pickedBin?pickedBin.size:sz;
  wrap.style.display=(effectiveSize==='4 yard'||effectiveSize==='7 yard')?'block':'none';
}

function setBinDuration(days){
  // Toggle off if same duration clicked again
  if(window._binPresetDays===days){
    window._binPresetDays=null;
    document.getElementById('f-bdur').value='';
    document.getElementById('f-bpick').value='';
    document.querySelectorAll('.bin-quick-dur').forEach(function(b){b.classList.remove('active');});
    return;
  }
  var bdrop=document.getElementById('f-bdrop');
  if(!bdrop.value) bdrop.value=new Date().toISOString().split('T')[0];
  var drop=bdrop.value;
  var d=new Date(drop+'T12:00:00');
  d.setDate(d.getDate()+days);
  document.getElementById('f-bpick').value=d.toISOString().split('T')[0];
  var label=days===30?'1 month':days+' days';
  document.getElementById('f-bdur').value=label;
  window._binPresetDays=days;
  // Highlight active duration button with animation
  document.querySelectorAll('.bin-quick-dur').forEach(function(b){
    var btnDays=b.textContent.trim()==='1 Month'?30:parseInt(b.textContent);
    var isActive=btnDays===days;
    b.classList.toggle('active',isActive);
    if(isActive){b.style.animation='durPop .3s ease';setTimeout(function(){b.style.animation='';},300);}
  });
}
function applyBinPresetDuration(){
  var days=window._binPresetDays;if(!days)return;
  var drop=document.getElementById('f-bdrop').value;if(!drop)return;
  var d=new Date(drop+'T12:00:00');
  d.setDate(d.getDate()+days);
  document.getElementById('f-bpick').value=d.toISOString().split('T')[0];
}

function initBinPicker(existingBid, existingSize){
  // Set size filter if we have a size
  if(existingSize){
    binPickerSzFilter = existingSize;
  } else {
    binPickerSzFilter = 'all';
  }
  // Always update button highlight based on current filter
  document.querySelectorAll('.bsz-btn').forEach(function(b){
    var match = b.dataset.sz === binPickerSzFilter;
    b.classList.toggle('active', match);
    b.style.background = match ? 'rgba(34,197,94,.12)' : '';
    b.style.color = match ? '#22c55e' : '';
  });
  // Set f-bsize so the job can save with just a size selected
  if(existingSize) document.getElementById('f-bsize').value = existingSize;
  renderBinPicker(existingBid||'');
  var sel = document.getElementById('bin-picker-selected');
  if(sel){
    if(existingBid){
      var b = binItems.find(function(x){return x.bid===existingBid;});
      if(b){
        sel.style.display='block';
        sel.innerHTML='✅ Selected: <strong>'+b.num+'</strong> · '+b.size+(b.color?' · '+(b.color==='green'?'🟢 Green':'⚫ Black'):'');
        sel.dataset.bid=existingBid;
      } else if(existingSize){
        // Old job: no bid stored, just show size info
        sel.style.display='block';
        sel.innerHTML='ℹ️ Previously: <strong>'+existingSize+'</strong> — pick a bin to link it';
        sel.dataset.bid='';
      }
    } else if(existingSize){
      sel.style.display='block';
      sel.innerHTML='ℹ️ Previously: <strong>'+existingSize+'</strong> — pick a bin to link it';
      sel.dataset.bid='';
    } else {
      sel.style.display='none';
      sel.dataset.bid='';
    }
  }
}

function bookBin(size, presetDays){
  go('jobs');
  newJob();
  document.getElementById('f-svc').value='Bin Rental';
  document.getElementById('f-svc').dispatchEvent(new Event('change'));
  setTimeout(function(){
    initBinPicker('', size);
    if(presetDays){
      window._binPresetDays=null; // Reset so setBinDuration doesn't toggle off
      setBinDuration(presetDays);
    }
  },200);
}
function openEdit(id){
  var j=null;jobs.forEach(function(jj){if(jj.id===id)j=jj;});if(!j)return;
  editId=id;closeM('detail-modal');renderClientSelectOptions();
  setTimeout(function(){
    document.getElementById('modal-ttl').textContent='Edit Job';document.getElementById('save-btn').textContent='Update Job';
    document.getElementById('f-svc').value=j.service||'';document.getElementById('f-status').value=j.status||'Pending';
    document.getElementById('f-names-wrap').innerHTML=_jobNameRow(j.name||'');
    document.getElementById('f-phones-wrap').innerHTML=_jobPhoneRow(j.phone||'','','cell');
    document.getElementById('f-emails-wrap').innerHTML=_jobEmailRow('');
    // Extract just the street number+name from the full stored address string.
    // Stored format is "123 Main St, City, Province, Country" — split on first comma.
    // The dedicated j.city field is the authoritative city value.
    var fullAddr = j.address || '';
    var streetOnly = fullAddr.split(',')[0].trim();
    // If the first segment has no digits it's probably just a city/province leftover — clear it
    if(streetOnly && !/\d/.test(streetOnly) && streetOnly.split(' ').length <= 3){
      streetOnly = '';
    }
    document.getElementById('f-addr').value = streetOnly;
    document.getElementById('f-city').value = j.city || '';
    document.getElementById('f-date').value=j.date||'';document.getElementById('f-time').value=j.time||'';
    document.getElementById('f-price').value=j.price||'';document.getElementById('f-paid').value=j.paid||'Unpaid';
    document.getElementById('f-paymethod').value=j.payMethod||'';
    document.getElementById('f-referral').value=j.referral||'';document.getElementById('f-notes').value=j.notes||'';
    document.getElementById('bin-extra').style.display=j.service==='Bin Rental'?'block':'none';
    document.getElementById('tools-needed-wrap').style.display=(j.service==='Junk Removal')?'block':'none';
    if(j.service==='Bin Rental') setTimeout(function(){initBinPicker(j.binBid||'',j.binSize||'');},50);
    if(j.service==='Bin Rental'){
      document.getElementById('f-bdur').value=j.binDuration||'';
      document.getElementById('f-bdrop').value=j.binDropoff||'';
      document.getElementById('f-bpick').value=j.binPickup||'';
      document.getElementById('f-bside').value=j.binSide||'';
      document.getElementById('f-binstatus').value=j.binInstatus||'';
      // Expand bin picker when editing
      var bpc=document.getElementById('bin-picker-collapse');if(bpc)bpc.style.display='block';
      var bpa=document.getElementById('bin-picker-arrow');if(bpa)bpa.style.transform='rotate(90deg)';
      initBinPicker(j.binBid||'', j.binSize||'');
      var matEl=document.getElementById('f-material-type');
      if(matEl)matEl.value=j.materialType||'';
      document.querySelectorAll('.mat-btn').forEach(function(b){b.classList.remove('active');b.style.background='';b.style.color='';if(b.getAttribute('data-mat')===j.materialType){b.classList.add('active');b.style.background='rgba(34,197,94,.12)';b.style.color='#22c55e';}});
      showMaterialType();
    }
    document.getElementById('f-tools').value=j.toolsNeeded||'';
    document.getElementById('f-client-select').value=j.clientId||'';
    // Recurring fields
    var recChk=document.getElementById('f-recurring');
    var recOpts=document.getElementById('recurring-opts');
    if(recChk){recChk.checked=j.recurring||false;}
    if(recOpts){recOpts.style.display=(j.recurring?'block':'none');}
    var recInt=document.getElementById('f-recur-interval');
    if(recInt&&j.recurInterval){recInt.value=j.recurInterval;}
    document.getElementById('job-modal').classList.add('open');
  },150);
}
async function saveJob(e){
  if(e && e.preventDefault) e.preventDefault();
  if(_saveJobLock){ console.warn("saveJob already running"); return; }
  _saveJobLock = true;

  // Clear error banner
  var banner = document.getElementById('job-form-errors');
  if(banner) { banner.style.display='none'; banner.textContent=''; }

  // Collect contact names, phones, emails
  var nameEls=document.querySelectorAll('#f-names-wrap .f-name-inp');
  var names=[].slice.call(nameEls).map(function(el){var v=toTitleCase(el.value.trim());el.value=v;return v;}).filter(Boolean);
  var phoneInps=document.querySelectorAll('#f-phones-wrap .f-phone-inp');
  var phoneTypeEls=document.querySelectorAll('#f-phones-wrap .f-phone-type-sel');
  var phoneExtEls=document.querySelectorAll('#f-phones-wrap .f-ext-inp');
  var phones=[];
  [].slice.call(phoneInps).forEach(function(el,i){var num=el.value.trim();if(num)phones.push({num:num,ext:phoneExtEls[i]?phoneExtEls[i].value.trim():'',type:phoneTypeEls[i]?phoneTypeEls[i].value:'cell'});});
  var emailEls=document.querySelectorAll('#f-emails-wrap .f-email-inp');
  var emails=[].slice.call(emailEls).map(function(el){return el.value.trim();}).filter(Boolean);

  // Primary name for backward compat and UI display
  var name=names.length?names[0]:'';
  var svc      = document.getElementById('f-svc').value;
  var date     = document.getElementById('f-date').value;
  var city     = toTitleCase(document.getElementById('f-city').value.trim());
  var referral = document.getElementById('f-referral').value;

  // Write Title Case back to city field
  document.getElementById('f-city').value = city;

  // Clear previous field errors
  ['f-svc','f-names','f-date','f-city','f-referral'].forEach(clearErr);

  // Validate and collect errors
  var errs = [];
  if(!svc)      { showErr('f-svc');      errs.push('Service type is required — choose Bin Rental, Junk Removal, etc.'); }
  if(!names.length)  { showErr('f-names');     errs.push('At least one contact name is required.'); }
  if(!date)     { showErr('f-date');     errs.push('Date is required.'); }
  if(!city)     { showErr('f-city');     errs.push('City is required (e.g. Barrie).'); }
  if(!referral) { showErr('f-referral'); errs.push('Referral source is required.'); }
  if(svc==='Bin Rental' && !document.getElementById('f-bsize').value) { errs.push('Bin size is required for Bin Rental jobs — please select a bin.'); }

  if(errs.length) {
    if(banner) {
      banner.innerHTML = '⚠️ Please fix the following:<ul style="margin:6px 0 0 16px">' + errs.map(function(e){return '<li>'+e+'</li>';}).join('') + '</ul>';
      banner.style.display = 'block';
    }
    _saveJobLock = false; return;
  }

  // Vehicle availability warning
  if(!editId){
    var avail=checkVehicleAvailability(svc,date);
    if(!avail.ok&&!confirm(avail.msg)){_saveJobLock=false;return;}
  }

  var cid    = document.getElementById('f-client-select').value;
  var street = document.getElementById('f-addr').value.trim();
  var fullAddr = street || '';

  // If client selected and user entered a new address via the picker, save it to the client
  if(cid&&_selectedClientObj&&street){
    var addrSel=document.getElementById('f-addr-select');
    if(addrSel&&addrSel.value==='new'){
      var cl=clients.find(function(c){return c.cid===cid;});
      if(cl){
        if(!cl.addresses)cl.addresses=[];
        var newEntry={street:street,city:city};
        var exists=cl.addresses.some(function(a){return a.street===street&&a.city===city;});
        if(!exists){cl.addresses.push(newEntry);saveSingleClient(cl);}
      }
    }
  }
  var userEmail = currentUser ? currentUser.email : 'Unknown';
  var userName  = userEmail.split('@')[0];

  // Use first cell phone, or first phone if no cell phone
  var primaryPhone='';
  var cellPhone=phones.find(function(p){return p.type==='cell'||!p.type;});
  primaryPhone=cellPhone?cellPhone.num:(phones.length?phones[0].num:'');

  var job = {
    id:        editId || await nextIdFromDb(svc),
    service:   svc,
    status:    document.getElementById('f-status').value,
    name:      name,
    names:     names,
    phones:    phones,
    emails:    emails,
    phone:     primaryPhone,
    address:   fullAddr,
    city:      city,
    date:      date,
    time:      document.getElementById('f-time').value,
    price:     document.getElementById('f-price').value,
    paid:      document.getElementById('f-paid').value || 'Unpaid',
    payMethod: document.getElementById('f-paymethod').value,
    referral:  referral,
    notes:     document.getElementById('f-notes').value.trim(),
    clientId:  cid || '',
    toolsNeeded: document.getElementById('f-tools') ? document.getElementById('f-tools').value.trim() : '',
    recurring: (svc==='Bin Rental' && document.getElementById('f-recurring') ? document.getElementById('f-recurring').checked : false) || (svc==='Junk Removal' && document.getElementById('f-junk-recurring') ? document.getElementById('f-junk-recurring').checked : false),
    recurInterval: svc==='Bin Rental' ? (document.getElementById('f-recur-interval') ? document.getElementById('f-recur-interval').value : '') : (svc==='Junk Removal' ? (document.getElementById('f-junk-recur-interval') ? document.getElementById('f-junk-recur-interval').value : '') : ''),
    // Preserve existing tracking if editing, set new if creating
    createdBy:      editId ? (jobs.find(function(j){return j.id===editId;})||{}).createdBy      || userName : userName,
    createdByEmail: editId ? (jobs.find(function(j){return j.id===editId;})||{}).createdByEmail || userEmail : userEmail,
    editedBy:       editId ? userName  : '',
    editedByEmail:  editId ? userEmail : '',
  };

  if(svc==='Bin Rental'){
    var pickedBid = getPickedBinBid();
    var pickedBin = pickedBid ? binItems.find(function(b){return b.bid===pickedBid;}) : null;
    job.binBid      = pickedBid || '';
    job.binSize     = pickedBin ? pickedBin.size : (document.getElementById('f-bsize').value||'');
    job.binDuration = document.getElementById('f-bdur').value;
    job.binDropoff  = document.getElementById('f-bdrop').value;
    job.binPickup   = document.getElementById('f-bpick').value;
    job.binSide     = document.getElementById('f-bside').value;
    job.binInstatus = document.getElementById('f-binstatus').value;
    job.materialType = document.getElementById('f-material-type').value;
    // Sync binItems: if a bin was previously assigned to this job, release it first
    if(editId){
      var oldJob = jobs.find(function(x){return x.id===editId;});
      if(oldJob && oldJob.binBid && oldJob.binBid !== pickedBid){
        binItems.forEach(function(b){if(b.bid===oldJob.binBid) b.status='in';});
      }
    }
    // Mark the newly picked bin as out
    if(pickedBin && job.binInstatus !== 'pickedup'){
      pickedBin.status = 'out';
      saveBins();
    }
    // If status is picked up, mark bin back in
    if(job.binInstatus === 'pickedup' && pickedBin){
      pickedBin.status = 'in';
      saveBins();
    }
  }

  // Auto-create client record if none selected
  if(!cid && job.name){
    var exists = clients.some(function(c){return c.name.toLowerCase()===job.name.toLowerCase();});
    if(!exists){
      // Generate new client ID
      var maxR=await db.from('clients').select('cid').order('cid',{ascending:false}).limit(1);
      var maxCid=maxR.data&&maxR.data.length?maxR.data[0].cid:'CL-0000';
      var maxNum=parseInt((maxCid||'').replace('CL-',''))||0;
      var newCid='CL-'+String(maxNum+1).padStart(4,'0');
      // Create full client with all the job data
      var newClient={
        cid:newCid,
        name:names[0]||'',names:names,
        phone:primaryPhone,phones:phones,
        email:emails[0]||'',emails:emails,
        address:street?street+', '+city+', ON, Canada':city+', ON, Canada',
        city:city,addresses:[{street:street,city:city}],
        referral:job.referral||'',
        notes:''
      };
      clients.push(newClient);
      saveSingleClient(newClient);
      renderClientSelectOptions();
      // Update job to link to the new client
      cid=newCid;
      job.clientId=cid;
    }
  }

  // If client selected, update with any new names/phones/emails entered
  if(cid && names.length){
    var cl=clients.find(function(c){return c.cid===cid;});
    if(cl){
      // Update names if new ones added
      if(!cl.names||!cl.names.length) cl.names=[cl.name||''];
      names.forEach(function(n){if(!cl.names.find(function(x){return x.toLowerCase()===n.toLowerCase();})){cl.names.push(n);}});
      cl.name=cl.names[0]||'';
      // Update phones if new ones added
      if(!cl.phones||!cl.phones.length) cl.phones=cl.phone?[{num:cl.phone,ext:'',type:'cell'}]:[];
      phones.forEach(function(p){if(!cl.phones.find(function(x){return x.num===p.num;})){cl.phones.push(p);}});
      cl.phone=primaryPhone;
      // Update emails if new ones added
      if(!cl.emails||!cl.emails.length) cl.emails=cl.email?[cl.email]:[];
      emails.forEach(function(e){if(!cl.emails.find(function(x){return x===e;})){cl.emails.push(e);}});
      cl.email=cl.emails[0]||'';
      // Save back to DB
      saveSingleClient(cl);
    }
  }

  if(editId){
    var idx = jobs.findIndex(function(j){return j.id===editId;});
    if(idx >= 0) jobs[idx] = job; else jobs.push(job);
    toast('Job updated!');
  } else {
    jobs.push(job);
    toast('Job created!');
  }

  editId = null;
  try {
    var dbRow = jobToDb(job);
    console.log('Saving job:', dbRow.job_id, dbRow);
    var dbRes = await db.from('jobs').upsert(dbRow, {onConflict:'job_id'});
    if(dbRes.error){
      alert('\u274c Error saving job: ' + dbRes.error.message);
      console.error('saveJob error:', dbRes.error);
      _saveJobLock = false; return;
    }
    _clientStatsCache = null;
    toast('\u2705 ' + job.id + ' saved!');
  } catch(ex){
    alert('\u274c Exception: ' + ex.message);
    console.error(ex);
    _saveJobLock = false; return;
  }
  _saveJobLock = false;
  closeM('job-modal');
  loadJobsPage(jobsPage);
  // Flash the new/updated row
  setTimeout(function(){
    var row=document.querySelector('tr.job-row[data-jid="'+job.id+'"]');
    if(row){row.classList.add('row-flash');row.addEventListener('animationend',function(){row.classList.remove('row-flash');},{once:true});}
  },120);
}
function delJob(id){
  if(!confirm('Delete this job?'))return;
  jobs=jobs.filter(function(j){return j.id!==id;});
  deleteJobFromDb(id);
  toast('Deleted.');closeM('detail-modal');refresh();
}
function cancelJob(id){
  if(!confirm('Mark this job as Cancelled?'))return;
  var j=jobs.find(function(x){return x.id===id;});
  if(!j)return;
  j.status='Cancelled';
  // Release bin back to yard if one was assigned
  if(j.binBid){
    binItems.forEach(function(b){if(b.bid===j.binBid)b.status='in';});
    saveBins();
  }
  saveSingleJob(j);
  toast('Job cancelled.');
  closeM('detail-modal');
  refresh();
}
function openDetail(id){
  var j=null;jobs.forEach(function(jj){if(jj.id===id)j=jj;});if(!j)return;
  document.getElementById('det-ttl').textContent=j.id;
  var bin='';
  if(j.service==='Bin Rental'){
    var sideLabel=j.binSide?(' · 🚗 '+j.binSide.charAt(0).toUpperCase()+j.binSide.slice(1)+' side'):'';
    var bsStatus=j.binInstatus==='dropped'?'<span style="color:#22c55e;font-weight:700">✅ Dropped Off</span>':j.binInstatus==='pickedup'?'<span style="color:#22c55e;font-weight:700">✅ Picked Up</span>':'<span style="color:var(--muted)">Pending</span>';
    var assignedBin = j.binBid ? binItems.find(function(b){return b.bid===j.binBid;}) : null;
    var binLabel = assignedBin ? (assignedBin.num+' · '+assignedBin.size+(assignedBin.color?' · '+(assignedBin.color==='green'?'🟢 Green':'⚫ Black'):'')) : (j.binSize||'—');
    var recurLabel={'weekly':'Every Week','biweekly':'Every 2 Weeks','3weeks':'Every 3 Weeks','monthly':'Every Month'}[j.recurInterval]||j.recurInterval||'';
    bin='<div class="detail-section"><div class="detail-section-title">🚛 Bin Details'+(j.recurring?'&nbsp;<span style="font-size:11px;background:rgba(13,110,253,.15);color:#0d6efd;border:1px solid rgba(13,110,253,.3);border-radius:5px;padding:1px 8px">♻️ Recurring · '+recurLabel+'</span>':'')+'</div><div class="detail-grid">'
      +'<div class="detail-item"><label>Bin</label><span>'+binLabel+'</span></div>'
      +'<div class="detail-item"><label>Duration</label><span>'+(j.binDuration||'—')+'</span></div>'
      +'<div class="detail-item"><label>Drop-off</label><span>'+fd(j.binDropoff)+'</span></div>'
      +'<div class="detail-item"><label>Pickup Date</label><span>'+fd(j.binPickup)+'</span></div>'
      +'<div class="detail-item"><label>Driveway Side</label><span>'+(j.binSide?j.binSide.charAt(0).toUpperCase()+j.binSide.slice(1)+' Side':'—')+'</span></div>'
      +'<div class="detail-item"><label>Bin Status</label><span>'+bsStatus+'</span></div>'
      +(j.materialType?'<div class="detail-item"><label>Material</label><span>'+j.materialType+'</span></div>':'')
      +(j.swapCount?'<div class="detail-item"><label>Swap Outs</label><span>'+j.swapCount+'</span></div>':'')
      +'</div>'+(j.binBid?'':'<div style="margin-top:8px"><button class="btn btn-ghost" onclick="openAssignBinPicker(\''+j.id+'\')" style="border-color:rgba(34,197,94,.3);color:#22c55e;width:100%">📦 Assign Bin</button></div>')+'</div>';
  }
  // Show recurring badge for non-bin services
  if(j.recurring&&j.service!=='Bin Rental'){
    var recurLabel2={'weekly':'Every Week','biweekly':'Every 2 Weeks','3weeks':'Every 3 Weeks','monthly':'Every Month'}[j.recurInterval]||j.recurInterval||'';
    bin+='<div class="detail-section"><div class="detail-section-title">♻️ Recurring Schedule&nbsp;<span style="font-size:11px;background:rgba(13,110,253,.15);color:#0d6efd;border:1px solid rgba(13,110,253,.3);border-radius:5px;padding:1px 8px">'+recurLabel2+'</span></div><div style="font-size:13px;color:var(--muted)">This job is set to repeat automatically. Use the "Schedule Next Visit" button to book the next one.</div></div>';
  }
  var paymentInfo='';
  if(j.payMethod){paymentInfo='<div class="detail-item"><label>Method</label><span>'+j.payMethod+'</span></div>';}
  var etransferNote='';
  if(j.payMethod==='E-Transfer'&&j.status==='Done'){
    etransferNote='<div style="margin-top:8px;padding:8px 12px;border-radius:8px;background:rgba(230,126,34,.07);border:1px solid rgba(230,126,34,.3);font-size:13px">'
      +(j.etransferRefundSent?'<span style="color:#22c55e">✅ E-Transfer refund sent to customer</span>':'<span style="color:#e67e22">⏳ E-Transfer refund not yet sent</span> <button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="markEtransferSent(\''+j.id+'\')">✅ Mark Refund Sent</button>')
      +'</div>';
  }
  var confirmedBadge=j.confirmed?'<span class="badge" style="background:rgba(34,197,94,.12);color:#22c55e">✅ '+(j.service==='Furniture Delivery'?'Drop-Off':'Pickup')+' Confirmed</span>':'';
  var emailConfBadge=j.emailConfirmed?'<span class="badge" style="background:rgba(13,110,253,.15);color:#0d6efd">📧 Email Confirmed</span>':'';
  document.getElementById('det-body').innerHTML=
    '<div class="detail-section"><div style="display:flex;gap:8px;flex-wrap:wrap">'+sb(j.service)+(j.referral?'<span class="badge" style="background:rgba(168,85,247,.15);color:#9b59b6">📣 '+j.referral+'</span>':'')+(j.confirmed?confirmedBadge:'')+(j.emailConfirmed?emailConfBadge:'')+'</div></div>'
    +'<div class="detail-section"><div class="detail-section-title">👤 Customer</div><div class="detail-grid"><div class="detail-item"><label>Name</label><span>'+j.name+'</span></div><div class="detail-item"><label>Phone</label><span>'+(j.phone||'—')+'</span></div><div class="detail-item" style="grid-column:1/-1"><label>Address</label><span>'+((j.address||'')+(j.city?', '+j.city:'') || '—')+'</span></div></div></div>'
    +'<div class="detail-section"><div class="detail-section-title">📅 Schedule</div><div class="detail-grid"><div class="detail-item"><label>Date</label><span>'+fd(j.date)+'</span></div><div class="detail-item"><label>Time</label><span>'+(j.time?ft(j.time):'—')+'</span></div></div></div>'
    +bin
    +(j.payMethod?'<div class="detail-section"><div class="detail-section-title">💳 Payment</div><div class="detail-grid"><div class="detail-item"><label>Payment Method</label><span>'+j.payMethod+'</span></div></div>'+etransferNote+'</div>':'')
    +(j.notes?'<div class="detail-section"><div class="detail-section-title">📝 Notes</div><p style="font-size:14px;line-height:1.6">'+j.notes+'</p></div>':'')
    +(j.toolsNeeded?'<div class="detail-section"><div class="detail-section-title">🔧 Tools Needed</div><p style="font-size:14px;line-height:1.6;font-weight:600;color:#e67e22">'+j.toolsNeeded+'</p></div>':'')
    +(j.createdBy||j.editedBy?'<div class="detail-section"><div class="detail-section-title">🕵️ Activity</div><div class="detail-grid">'
      +(j.createdBy?'<div class="detail-item"><label>Created by</label><span style="color:var(--accent);font-weight:600">'+j.createdBy+'</span>'+(j.createdAt?'<div style="font-size:11px;color:var(--muted);margin-top:2px">'+new Date(j.createdAt).toLocaleString('en-CA',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})+'</div>':'')+'</div>':'')
      +(j.editedBy?'<div class="detail-item"><label>Last edited by</label><span style="color:#e67e22;font-weight:600">'+j.editedBy+'</span>'+(j.updatedAt?'<div style="font-size:11px;color:var(--muted);margin-top:2px">'+new Date(j.updatedAt).toLocaleString('en-CA',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})+'</div>':'')+'</div>':'')
      +'</div></div>':'')
    +'<div style="border-top:1px solid var(--border);margin-top:20px;padding-top:18px;display:flex;flex-direction:column;gap:10px">'

    // ── Row 1: Primary Actions ──
    +'<div style="display:flex;gap:10px">'
    +'<button class="btn btn-primary" onclick="openEdit(\''+j.id+'\')" style="flex:1;justify-content:center">✏️ Edit Job</button>'
    +'<button class="btn btn-ghost" onclick="openEmailModal(\''+j.id+'\')" style="flex:1;justify-content:center;border-color:rgba(13,110,253,.4);color:#0d6efd">📧 Send Email</button>'
    +(j.service==='Bin Rental'?'<button class="btn btn-ghost" onclick="printBinRental(\''+j.id+'\')" style="flex:1;justify-content:center;border-color:rgba(34,197,94,.3);color:#22c55e">🖨️ Print Form</button>':'')
    +'</div>'

    // ── Row 2: Customer Confirmation ──
    +(function(){
      var cbtns=[];
      if((j.service==='Bin Rental'||j.service==='Furniture Pickup'||j.service==='Furniture Delivery')&&!j.confirmed){
        var confirmLabel=j.service==='Furniture Delivery'?'Confirm Drop-Off':'Confirm Pickup';
        cbtns.push('<button class="btn btn-ghost" onclick="markConfirmed(\''+j.id+'\')" style="flex:1;justify-content:center;border-color:rgba(34,197,94,.3);color:#22c55e">📞 '+confirmLabel+'</button>');
      }
      if(!j.emailConfirmed){
        cbtns.push('<button class="btn btn-ghost" onclick="markEmailConfirmed(\''+j.id+'\')" style="flex:1;justify-content:center;border-color:rgba(13,110,253,.4);color:#0d6efd">📧 Email Sent</button>');
      }
      return cbtns.length ? '<div style="margin-top:2px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:6px">Customer Confirmation</div><div style="display:flex;gap:10px">'+cbtns.join('')+'</div></div>' : '';
    }())

    // ── Row 3: Bin / Job Actions ──
    +(function(){
      var btns=[];
      if(j.service==='Junk Quote') btns.push('<button class="btn btn-ghost" onclick="convertQuoteToJob(\''+j.id+'\')" style="flex:1;justify-content:center;border-color:rgba(34,197,94,.3);color:#22c55e;font-weight:700">⚡ Convert to Job</button>');
      if(j.service==='Bin Rental') btns.push('<button class="btn btn-ghost" onclick="swapOutBin(\''+j.id+'\')" style="flex:1;justify-content:center;border-color:rgba(168,85,247,.4);color:#9b59b6">🔄 Swap Out</button>');
      if(j.service==='Bin Rental') btns.push('<button class="btn btn-ghost" onclick="openExtendPopup(\''+j.id+'\',event)" style="flex:1;justify-content:center;border-color:rgba(230,126,34,.4);color:#e67e22;position:relative">📅 Extend Pickup</button>');
      if(j.service==='Bin Rental'&&j.binInstatus!=='dropped'&&j.binInstatus!=='pickedup') btns.push('<button class="btn btn-ghost" onclick="markDropped(\''+j.id+'\')" style="flex:1;justify-content:center;border-color:rgba(34,197,94,.3);color:#22c55e">🚛 Mark Dropped</button>');
      if(j.service==='Bin Rental'&&j.binInstatus==='dropped') btns.push('<button class="btn btn-ghost" onclick="markNotDropped(\''+j.id+'\')" style="flex:1;justify-content:center;border-color:rgba(230,126,34,.4);color:#e67e22">↩ Not Dropped Yet</button>');
      if(j.service==='Bin Rental'&&j.binInstatus==='dropped') btns.push('<button class="btn btn-ghost" onclick="markBinPickedUp2(\''+j.id+'\')" style="flex:1;justify-content:center;border-color:rgba(34,197,94,.3);color:#22c55e">🚚 Mark Picked Up</button>');
      if(j.recurring){
        if(j.service==='Bin Rental') btns.push('<button class="btn btn-ghost" onclick="scheduleNextSwap(\''+j.id+'\')" style="flex:1;justify-content:center;border-color:rgba(13,110,253,.4);color:#0d6efd">♻️ Next Swap</button>');
        else if(j.service==='Junk Removal') btns.push('<button class="btn btn-ghost" onclick="scheduleNextRecurringJob(\''+j.id+'\')" style="flex:1;justify-content:center;border-color:rgba(13,110,253,.4);color:#0d6efd">♻️ Next Visit</button>');
      }
      if(j.service!=='Bin Rental'&&j.status!=='Done') btns.push('<button class="btn btn-ghost" onclick="markDone(\''+j.id+'\')" style="flex:1;justify-content:center;border-color:rgba(34,197,94,.3);color:#22c55e">✔ Mark Done</button>');
      var sectionLabel=j.service==='Bin Rental'?'Bin Actions':'Job Actions';
      return btns.length ? '<div style="margin-top:2px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:6px">'+sectionLabel+'</div><div style="display:flex;gap:10px;flex-wrap:wrap">'+btns.join('')+'</div></div>' : '';
    }())

    // ── Row 4: Danger Zone ──
    +'<div style="margin-top:2px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:6px">Danger Zone</div>'
    +'<div style="display:flex;gap:10px;padding-top:4px;border-top:1px solid var(--border)">'
    +(j.status!=='Cancelled'?'<button class="btn btn-ghost" onclick="cancelJob(\''+j.id+'\')" style="flex:1;justify-content:center;border-color:rgba(220,53,69,.3);color:#dc3545">🚫 Cancel Job</button>':'')
    +'<button class="btn btn-danger" onclick="delJob(\''+j.id+'\')" style="flex:1;justify-content:center">🗑️ Delete</button>'
    +'</div></div>'

    +'</div>';
  document.getElementById('detail-modal').classList.add('open');
}

async function swapOutBin(id){
  var j=null;jobs.forEach(function(jj){if(jj.id===id)j=jj;});if(!j)return;
  if(!confirm('Create a new Swap Out job with the same details?'))return;
  // Increment swap count on original
  j.swapCount=(j.swapCount||0)+1;
  saveSingleJob(j);
  // Create new job with same details
  var newId=await nextIdFromDb('Bin Rental');
  var today=todayStr();
  var newJob={
    id:newId, service:'Bin Rental', status:'Pending',
    name:j.name, phone:j.phone, address:j.address, city:j.city,
    date:today, time:j.time, price:j.price, paid:'Unpaid',
    notes:'Swap out from job '+j.id+(j.notes?' — '+j.notes:''),
    referral:j.referral, confirmed:false, emailSent:false,
    binSize:j.binSize, binDuration:j.binDuration,
    binDropoff:today, binPickup:'', binInstatus:'',
    binSide:j.binSide, binBid:'', clientId:j.clientId,
    deposit:'', depositPaid:false, payMethod:j.payMethod,
    recurring:j.recurring, recurInterval:j.recurInterval,
    materialType:j.materialType, toolsNeeded:j.toolsNeeded,
    emailConfirmed:false, swapCount:0
  };
  jobs.push(newJob);
  await saveSingleJob(newJob);
  toast('Swap out job '+newId+' created!');
  closeM('detail-modal');
  refresh();
}

function markConfirmed(id){jobs.forEach(function(j){if(j.id===id)j.confirmed=true;});patchJob(id,{confirmed:true});toast('Customer marked as confirmed!');refresh();}

function openExtendPopup(jobId, e){
  if(e)e.stopPropagation();
  var existing=document.querySelector('.extend-popup.open');
  if(existing){existing.classList.remove('open');if(existing.dataset.jid===jobId)return;}
  var j=jobs.find(function(x){return x.id===jobId;});if(!j)return;
  var curPickup=j.binPickup||todayStr();
  var pop=document.createElement('div');
  pop.className='extend-popup open';
  pop.dataset.jid=jobId;
  pop.onclick=function(ev){ev.stopPropagation();};
  pop.innerHTML='<div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Extend Pickup</div>'
    +'<div class="extend-quick-btns">'
    +'<button onclick="extendBin(\''+jobId+'\',1)">+1 Day</button>'
    +'<button onclick="extendBin(\''+jobId+'\',2)">+2 Days</button>'
    +'<button onclick="extendBin(\''+jobId+'\',3)">+3 Days</button>'
    +'</div>'
    +'<div class="extend-date-row">'
    +'<input type="date" id="extend-date-'+jobId+'" value="'+curPickup+'" min="'+todayStr()+'">'
    +'<button onclick="extendBinToDate(\''+jobId+'\')">Set</button>'
    +'</div>';
  var btn=e?e.currentTarget:null;
  if(btn){btn.style.position='relative';btn.appendChild(pop);}
  setTimeout(function(){document.addEventListener('click',function closeExtend(){pop.classList.remove('open');setTimeout(function(){if(pop.parentNode)pop.parentNode.removeChild(pop);},200);document.removeEventListener('click',closeExtend);});},10);
}
function extendBin(jobId, days){
  var j=jobs.find(function(x){return x.id===jobId;});if(!j)return;
  var cur=j.binPickup?new Date(j.binPickup+'T12:00:00'):new Date();
  cur.setDate(cur.getDate()+days);
  j.binPickup=cur.toISOString().split('T')[0];
  patchJob(jobId,{binPickup:j.binPickup});toast('Pickup extended to '+fd(j.binPickup));
  var pop=document.querySelector('.extend-popup.open');if(pop)pop.classList.remove('open');
  refresh();
}
function extendBinToDate(jobId){
  var inp=document.getElementById('extend-date-'+jobId);if(!inp||!inp.value)return;
  var j=jobs.find(function(x){return x.id===jobId;});if(!j)return;
  j.binPickup=inp.value;
  patchJob(jobId,{binPickup:j.binPickup});toast('Pickup extended to '+fd(j.binPickup));
  var pop=document.querySelector('.extend-popup.open');if(pop)pop.classList.remove('open');
  refresh();
}

function markEmailConfirmed(id){
  jobs.forEach(function(j){if(j.id===id)j.emailConfirmed=true;});
  patchJob(id,{emailConfirmed:true});toast('Email confirmation sent!');openDetail(id);refresh();
}
function markEmailUnconfirmed(id){
  jobs.forEach(function(j){if(j.id===id)j.emailConfirmed=false;});
  patchJob(id,{emailConfirmed:false});toast('Email confirmation removed.');openDetail(id);refresh();
}

function newJobForClient(cid){
  var cl=clients.find(function(c){return c.cid===cid;});
  newJob();
  if(!cl)return;
  setTimeout(function(){
    _selectedClientObj=cl;
    document.getElementById('f-client-select').value=cid;
    var badge=document.getElementById('f-client-selected-badge');
    var nm=document.getElementById('f-client-selected-name');
    if(badge)badge.style.display='flex';
    if(nm)nm.textContent='✅ '+cl.name+(cl.phone?' · '+cl.phone:'');
    fillClientFromSelect(cid);
  },50);
}

function convertQuoteToJob(quoteId){
  var q=null;jobs.forEach(function(j){if(j.id===quoteId)q=j;});
  if(!q)return;
  closeM('detail-modal');
  // Pre-fill new job form from quote data
  editId=null;
  _selectedClientObj=null;
  document.getElementById('modal-ttl').textContent='Convert Quote → New Job';
  document.getElementById('save-btn').textContent='Create Job';
  document.getElementById('f-svc').value='Junk Removal';
  document.getElementById('f-status').value='Pending';
  document.getElementById('f-name').value=q.name||'';
  document.getElementById('f-phone').value=q.phone||'';
  var addrParts=(q.address||'').split(',').map(function(p){return p.trim();});
  document.getElementById('f-addr').value=addrParts[0]||'';
  document.getElementById('f-city').value=q.city||(addrParts[1]||'');
  document.getElementById('f-date').value=q.date||new Date().toISOString().split('T')[0];
  document.getElementById('f-time').value=q.time||'';
  document.getElementById('f-price').value=q.price||'';
  document.getElementById('f-paid').value=q.paid||'Unpaid';
  document.getElementById('f-paymethod').value=q.payMethod||'';
  document.getElementById('f-referral').value=q.referral||'';
  document.getElementById('f-notes').value=(q.notes?'Converted from quote '+quoteId+'.\n'+q.notes:'Converted from quote '+quoteId+'.');
  document.getElementById('f-client-select').value=q.clientId||'';
  document.getElementById('f-client-search').value='';
  var badge=document.getElementById('f-client-selected-badge');if(badge)badge.style.display='none';
  var res=document.getElementById('f-client-results');if(res)res.style.display='none';
  var picker=document.getElementById('f-addr-picker');if(picker)picker.style.display='none';
  document.getElementById('bin-extra').style.display='none';
  toggleBin();
  ['f-svc','f-name','f-date','f-city'].forEach(clearErr);
  document.getElementById('job-modal').classList.add('open');
}
function markUnconfirmed(id){jobs.forEach(function(j){if(j.id===id)j.confirmed=false;});patchJob(id,{confirmed:false});toast('Confirmation removed.');refresh();}
function markEmailSent(id){jobs.forEach(function(j){if(j.id===id)j.emailSent=true;});patchJob(id,{emailSent:true});toast('Email marked as sent!');refresh();}
function markEmailUnsent(id){jobs.forEach(function(j){if(j.id===id)j.emailSent=false;});patchJob(id,{emailSent:false});toast('Email status cleared.');refresh();}
function writeBinHistory(j){
  if(!j||j.service!=='Bin Rental'||!j.binBid)return;
  db.from('bin_history').insert({
    bin_num:j.binBid,bin_size:j.binSize||'',customer_name:j.name||'',
    customer_phone:j.phone||'',job_address:j.address||'',city:j.city||'',
    dropoff_date:j.binDropoff||null,pickup_date:j.binPickup||new Date().toISOString().split('T')[0],
    material_type:j.materialType||'',notes:j.notes||'',job_id:j.id,source:'dashboard'
  }).then(function(r){if(r.error)console.error('bin_history write failed:',r.error.message);});
}
function markDropped(id){jobs.forEach(function(j){if(j.id===id){j.binInstatus='dropped';if(j.status==='Pending')j.status='In Progress';}});var j2=jobs.find(function(x){return x.id===id;});patchJob(id,{binInstatus:'dropped',status:j2?j2.status:'In Progress'});toast('Bin marked as dropped off!');openDetail(id);refresh();}
function markNotDropped(id){jobs.forEach(function(j){if(j.id===id){j.binInstatus='';if(j.status==='In Progress')j.status='Pending';}});var j2=jobs.find(function(x){return x.id===id;});patchJob(id,{binInstatus:'',status:j2?j2.status:'Pending'});toast('Bin marked as not dropped yet.');openDetail(id);refresh();}
function markBinPickedUp2(id){
  var j=jobs.find(function(jj){return jj.id===id;});if(!j)return;
  j.binInstatus='pickedup';j.status='Done';
  if(j.binBid){binItems.forEach(function(b){if(b.bid===j.binBid)b.status='in';});saveBins();}
  writeBinHistory(j);
  patchJob(id,{binInstatus:'pickedup',status:'Done'});toast('Bin marked as picked up!');openDetail(id);refresh();
}
async function scheduleNextSwap(id){
  var j=jobs.find(function(jj){return jj.id===id;});if(!j)return;
  var intervalDays={'weekly':7,'biweekly':14,'3weeks':21,'monthly':30}[j.recurInterval]||14;
  var baseDate=j.binPickup||j.date;
  var nextDate=new Date(baseDate);nextDate.setDate(nextDate.getDate()+intervalDays);
  var nextDateStr=nextDate.toISOString().split('T')[0];
  var intervalLabel={'weekly':'1 week','biweekly':'2 weeks','3weeks':'3 weeks','monthly':'1 month'}[j.recurInterval]||'2 weeks';
  if(!confirm('Schedule next swap for '+fd(nextDateStr)+' ('+intervalLabel+' from current pickup date)?\n\nThis will create a new Bin Rental job for '+j.name+' at the same address.'))return;
  var newId=await nextIdFromDb('Bin Rental');
  var swapJob={
    id:newId,service:'Bin Rental',status:'Pending',name:j.name,phone:j.phone||'',
    address:j.address||'',city:j.city||'',date:nextDateStr,time:j.time||'',
    price:'',paid:'Unpaid',payMethod:'',referral:j.referral||'',
    notes:'Recurring swap ('+intervalLabel+') — from job '+j.id+(j.notes?'\n'+j.notes:''),
    clientId:j.clientId||'',binSize:j.binSize||'',binBid:'',binDuration:j.binDuration||'',
    binDropoff:nextDateStr,binPickup:'',binInstatus:'',binSide:j.binSide||'',
    recurring:true,recurInterval:j.recurInterval||'biweekly',
    createdBy:'system',createdByEmail:'system',editedBy:'',editedByEmail:''
  };
  jobs.push(swapJob);
  try{
    var dbRow=jobToDb(swapJob);
    var res=await db.from('jobs').upsert(dbRow,{onConflict:'job_id'});
    if(res.error){alert('Error creating swap job: '+res.error.message);return;}
  }catch(ex){alert('Error: '+ex.message);return;}
  toast('✅ Next swap booked for '+fd(nextDateStr)+'!');
  closeM('detail-modal');refresh();
}
async function scheduleNextRecurringJob(id){
  var j=jobs.find(function(jj){return jj.id===id;});if(!j)return;
  var intervalDays={'weekly':7,'biweekly':14,'3weeks':21,'monthly':30}[j.recurInterval]||14;
  var baseDate=j.date;
  var nextDate=new Date(baseDate);nextDate.setDate(nextDate.getDate()+intervalDays);
  var nextDateStr=nextDate.toISOString().split('T')[0];
  var intervalLabel={'weekly':'1 week','biweekly':'2 weeks','3weeks':'3 weeks','monthly':'1 month'}[j.recurInterval]||'2 weeks';
  if(!confirm('Schedule next '+j.service+' for '+fd(nextDateStr)+' ('+intervalLabel+' from last job)?\n\nThis will create a new job for '+j.name+' at the same address.'))return;
  var newId=await nextIdFromDb(j.service);
  var newJob={
    id:newId,service:j.service,status:'Pending',name:j.name,phone:j.phone||'',
    address:j.address||'',city:j.city||'',date:nextDateStr,time:j.time||'',
    price:j.price||'',paid:'Unpaid',payMethod:'',referral:j.referral||'',
    notes:'Recurring ('+intervalLabel+') — from job '+j.id+(j.notes?'\n'+j.notes:''),
    clientId:j.clientId||'',
    recurring:true,recurInterval:j.recurInterval||'biweekly',
    createdBy:'system',createdByEmail:'system',editedBy:'',editedByEmail:''
  };
  jobs.push(newJob);
  try{
    var dbRow=jobToDb(newJob);
    var res=await db.from('jobs').upsert(dbRow,{onConflict:'job_id'});
    if(res.error){alert('Error creating recurring job: '+res.error.message);return;}
  }catch(ex){alert('Error: '+ex.message);return;}
  toast('Next '+j.service+' booked for '+fd(nextDateStr)+'!');
  closeM('detail-modal');refresh();
}
function markEtransferSent(id){jobs.forEach(function(j){if(j.id===id)j.etransferRefundSent=true;});patchJob(id,{etransferRefundSent:true});toast('E-Transfer refund marked as sent!');openDetail(id);refresh();}
function markPaid(id){jobs.forEach(function(j){if(j.id===id)j.paid='Paid';});patchJob(id,{paid:'Paid'});toast('Marked as paid!');openDetail(id);refresh();}
function markDone(id){jobs.forEach(function(j){if(j.id===id)j.status='Done';});patchJob(id,{status:'Done'});toast('Marked complete!');openDetail(id);refresh();}
function markPickedUp(id,e){if(e)e.stopPropagation();jobs.forEach(function(j){if(j.id===id){j.status='Done';j.binInstatus='pickedup';}});patchJob(id,{status:'Done',binInstatus:'pickedup'});toast('Bin marked picked up!');refresh();}
function dashMarkPickedUp(jobId,bid){
  var j=jobs.find(function(jj){return jj.id===jobId;});
  if(j){j.status='Done';j.binInstatus='pickedup';writeBinHistory(j);}
  binItems.forEach(function(b){if(b.bid===bid)b.status='in';});
  patchJob(jobId,{status:'Done',binInstatus:'pickedup'});saveBins();toast('Bin marked picked up and returned to yard!');refresh();renderDashBinsOut();refreshDashBinStats();
}
function toast(msg, type) {
  var t = document.getElementById('toast');
  var isErr  = type === 'error'  || msg.indexOf('⚠') === 0 || msg.indexOf('⚠️') === 0 || msg.indexOf('Error') >= 0;
  var isWarn = type === 'warn';
  t.className = 'toast' + (isErr ? ' toast-error' : isWarn ? ' toast-warn' : '');
  t.textContent = (isErr ? '✕ ' : isWarn ? '⚠ ' : '✓ ') + msg.replace(/^[⚠️✅✓⚠]\s*/,'');
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(function(){ t.classList.remove('show'); }, 3000);
}
// Overlay click-to-close intentionally disabled — use Cancel/Submit buttons or ✕ to close modals.
document.addEventListener('click',function(e){
  var res=document.getElementById('f-client-results');
  var inp=document.getElementById('f-client-search');
  if(res&&inp&&!res.contains(e.target)&&e.target!==inp)res.style.display='none';
});


// ─── TODAY VIEW ───
function renderToday(){
  var todayS=todayStr();
  document.getElementById('today-view-lbl').textContent=new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  var todayJobs=jobs.filter(function(j){return j.date===todayS&&j.status!=='Cancelled'&&j.status!=='Done';});
  var overdueJobs=jobs.filter(function(j){return j.service==='Bin Rental'&&j.binInstatus==='dropped'&&j.binPickup&&j.binPickup<todayS;});
  var threshold=parseInt(document.getElementById('today-days-threshold')&&document.getElementById('today-days-threshold').value)||7;
  var longBins=jobs.filter(function(j){
    if(j.service!=='Bin Rental'||j.status==='Done'||j.status==='Cancelled')return false;
    var drop=j.binDropoff||j.date;if(!drop)return false;
    var days=Math.floor((Date.now()-new Date(drop).getTime())/86400000);
    return days>=threshold;
  });
  var statsHtml='<div class="stat-card c-green"><div class="stat-icon">📋</div><div class="stat-value">'+todayJobs.length+'</div><div class="stat-label">Scheduled Today</div></div>'
    +'<div class="stat-card c-red"><div class="stat-icon">⚠️</div><div class="stat-value">'+overdueJobs.length+'</div><div class="stat-label">Overdue Pickups</div></div>';
  document.getElementById('today-stats').innerHTML=statsHtml;
  // Today's jobs
  var el=document.getElementById('today-jobs-list');
  el.innerHTML=todayJobs.length?todayJobs.map(function(j){return'<div style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer" onclick="openDetail(\''+j.id+'\')">'
    +'<div style="display:flex;justify-content:space-between;align-items:center"><strong>'+j.name+'</strong></div>'
    +'<div style="font-size:12px;color:var(--muted);margin-top:2px">'+sb(j.service)+(j.time?' · '+ft(j.time):'')+'</div>'
    +'</div>';}).join(''):'<div style="color:var(--muted);font-size:13px;padding:16px;text-align:center">✅ No jobs scheduled today</div>';
  // Overdue
  var od=document.getElementById('today-overdue-list');
  od.innerHTML=overdueJobs.length?overdueJobs.map(function(j){return'<div style="padding:8px 12px;border:1px solid rgba(220,53,69,.3);border-radius:8px;margin-bottom:8px;background:rgba(220,53,69,.05)">'
    +'<div style="display:flex;justify-content:space-between;align-items:center">'
    +'<strong style="color:#dc3545;cursor:pointer" onclick="openDetail(\''+j.id+'\')">'+j.name+'</strong>'
    +'<button class="btn btn-ghost btn-sm" onclick="markPickedUp(\''+j.id+'\',event)" style="font-size:11px">✅ Picked Up</button>'
    +'</div>'
    +'<div style="font-size:12px;color:var(--muted)">Pickup was: '+fd(j.binPickup)+'</div>'
    +'<div style="font-size:12px;color:var(--muted)">'+(j.address||'')+'</div>'
    +'</div>';}).join(''):'<div style="color:var(--muted);font-size:13px;padding:16px;text-align:center">✅ No overdue pickups</div>';
  // Long bins
  var lb=document.getElementById('today-long-bins');
  lb.innerHTML=longBins.length?longBins.map(function(j){
    var drop=j.binDropoff||j.date;var days=Math.floor((Date.now()-new Date(drop).getTime())/86400000);
    return'<div style="padding:8px 12px;border:1px solid rgba(230,126,34,.3);border-radius:8px;margin-bottom:8px;background:rgba(230,126,34,.04);cursor:pointer" onclick="openDetail(\''+j.id+'\')">'
    +'<strong>'+j.name+'</strong><span style="margin-left:8px;color:#e67e22;font-size:12px;font-weight:700">'+days+' days out</span>'
    +'<div style="font-size:12px;color:var(--muted)">'+(j.binSize||'')+(j.binPickup?' · Pickup: '+fd(j.binPickup):'')+'</div>'
    +'</div>';}).join(''):'<div style="color:var(--muted);font-size:13px;padding:16px;text-align:center">✅ No bins out that long</div>';
  // Crew workload
  var cr=document.getElementById('today-crew');
  var svcCount={'Bin Rental':0,'Junk Removal':0,'Furniture Pickup':0,'Furniture Delivery':0};
  todayJobs.forEach(function(j){if(svcCount.hasOwnProperty(j.service))svcCount[j.service]++;});
  var svcIcons={'Bin Rental':'🚛','Junk Removal':'🧹','Furniture Pickup':'🛋️','Furniture Delivery':'📦'};
  var svcColors={'Bin Rental':'#22c55e','Junk Removal':'#e67e22','Furniture Pickup':'#dc3545','Furniture Delivery':'#dc3545'};
  cr.innerHTML=Object.keys(svcCount).map(function(k){var v=svcCount[k];return'<div class="bar-row"><div class="bar-label">'+svcIcons[k]+' '+k.split(' ')[0]+'</div><div class="bar-track"><div class="bar-fill" style="width:'+Math.max(v/Math.max.apply(null,Object.values(svcCount))||0,v>0?0.1:0)*100+'%;background:'+svcColors[k]+'"><span class="bar-fill-label">'+v+'</span></div></div></div>';}).join('');
}

// ─── REVENUE INTELLIGENCE ───
function renderRevenue(){
  var revByType={};var avgTicket={};var revBySize={};var revByCity={};
  jobs.forEach(function(j){
    var v=parseFloat(j.price)||0;
    var t=j.service||'Unknown';
    revByType[t]=(revByType[t]||0)+v;
    if(!avgTicket[t])avgTicket[t]={sum:0,cnt:0};avgTicket[t].sum+=v;avgTicket[t].cnt++;
    if(j.service==='Bin Rental'&&j.binSize){revBySize[j.binSize]=(revBySize[j.binSize]||0)+v;}
    var city=extractCity(j.address,j.city);revByCity[city]=(revByCity[city]||0)+v;
  });
  var totalRev=Object.values(revByType).reduce(function(s,v){return s+v;},0);
  var totalJobs=jobs.length;
  var avgVal=totalJobs?totalRev/totalJobs:0;
  // Metrics
  document.getElementById('rev-metrics').innerHTML=
    '<div class="metric-box"><div class="metric-val" id="rvm-rev" style="color:var(--accent)">$0</div><div class="metric-lbl">Total Revenue</div></div>'
    +'<div class="metric-box"><div class="metric-val" id="rvm-avg">$0</div><div class="metric-lbl">Avg Ticket Size</div></div>'
    +'<div class="metric-box"><div class="metric-val" id="rvm-jobs">0</div><div class="metric-lbl">Total Jobs</div></div>'
    +'<div class="metric-box"><div class="metric-val" id="rvm-clients">0</div><div class="metric-lbl">Total Clients</div></div>';
  requestAnimationFrame(function(){
    animCount(document.getElementById('rvm-rev'),Math.round(totalRev),'$');
    animCount(document.getElementById('rvm-avg'),Math.round(avgVal),'$');
    animCount(document.getElementById('rvm-jobs'),totalJobs);
    animCount(document.getElementById('rvm-clients'),clients.length);
  });
  // Alerts
  var alerts=[];
  var oneMonthAgo=new Date(Date.now()-30*86400000).toISOString().split('T')[0];
  var twoMonthsAgo=new Date(Date.now()-60*86400000).toISOString().split('T')[0];
  var thisMonth=jobs.filter(function(j){return j.date>=oneMonthAgo;});
  var lastMonth=jobs.filter(function(j){return j.date>=twoMonthsAgo&&j.date<oneMonthAgo;});
  var furnThis=thisMonth.filter(function(j){return j.service==='Furniture Pickup'||j.service==='Furniture Delivery';}).length;
  var furnLast=lastMonth.filter(function(j){return j.service==='Furniture Pickup'||j.service==='Furniture Delivery';}).length;
  if(furnLast>0){var furnPct=Math.round((furnThis-furnLast)/furnLast*100);alerts.push({color:furnPct<0?'#dc3545':'#22c55e',icon:furnPct<0?'🔻':'📈',msg:'Furniture jobs '+(furnPct>=0?'+':'')+furnPct+'% this month vs last month'});}
  var repeatClients=clients.filter(function(c){return getClientJobStats(c.cid,c.name).total>1;}).length;
  var repeatPct=clients.length?Math.round(repeatClients/clients.length*100):0;
  alerts.push({color:'#22c55e',icon:'🔁',msg:repeatPct+'% of clients are repeat customers ('+repeatClients+'/'+clients.length+')'});
  var binJobs=jobs.filter(function(j){return j.service==='Bin Rental'&&j.binDropoff&&j.binPickup;});
  if(binJobs.length){var avgDur=binJobs.reduce(function(s,j){return s+Math.max(0,Math.floor((new Date(j.binPickup)-new Date(j.binDropoff))/86400000));},0)/binJobs.length;alerts.push({color:'#e67e22',icon:'⏱️',msg:'Average bin rental duration: '+avgDur.toFixed(1)+' days'});}
  document.getElementById('rev-alerts').innerHTML=alerts.map(function(a){return'<div style="padding:10px 16px;border-radius:8px;border-left:4px solid '+a.color+';background:var(--surface);margin-bottom:8px;font-size:13px">'+a.icon+' <strong>'+a.msg+'</strong></div>';}).join('');
  // Bar charts
  var svcColors={'Bin Rental':'#22c55e','Junk Removal':'#e67e22','Furniture Pickup':'#dc3545','Furniture Delivery':'#e76f7e'};
  var svcData=Object.keys(revByType).sort(function(a,b){return revByType[b]-revByType[a];}).map(function(k){return{key:k,val:Math.round(revByType[k]),display:'$'+Math.round(revByType[k])};});
  document.getElementById('rev-by-svc').innerHTML=makeBarChart(svcData,function(k){return svcColors[k]||'#22c55e';});
  var sizeColors={'4 yard':'#4ade80','7 yard':'#f0932b','14 yard':'#f0932b','20 yard':'#e76f7e'};
  var sizeData=Object.keys(revBySize).sort(function(a,b){return revBySize[b]-revBySize[a];}).map(function(k){return{key:k,val:Math.round(revBySize[k])};});
  document.getElementById('rev-by-size').innerHTML=sizeData.length?makeBarChart(sizeData,function(k){return sizeColors[k]||'#22c55e';}):'<div style="color:var(--muted);font-size:13px;padding:16px;text-align:center">No bin rental data</div>';
  var cityData=Object.keys(revByCity).sort(function(a,b){return revByCity[b]-revByCity[a];}).slice(0,8).map(function(k){return{key:k,val:Math.round(revByCity[k])};});
  document.getElementById('rev-by-city').innerHTML=makeBarChart(cityData,function(){return '#22c55e';});
  var ticketData=Object.keys(avgTicket).sort(function(a,b){return (avgTicket[b].sum/avgTicket[b].cnt)-(avgTicket[a].sum/avgTicket[a].cnt);}).map(function(k){return{key:k,val:Math.round(avgTicket[k].sum/avgTicket[k].cnt)};});
  document.getElementById('rev-avg-ticket').innerHTML=makeBarChart(ticketData,function(k){return svcColors[k]||'#22c55e';});
  requestAnimationFrame(function(){['rev-by-svc','rev-by-size','rev-by-city','rev-avg-ticket'].forEach(function(id){animateBars(document.getElementById(id));});});
  // Revenue over time
  var now2=new Date();var months=[];
  for(var i=11;i>=0;i--){var d=new Date(now2.getFullYear(),now2.getMonth()-i,1);months.push({label:d.toLocaleDateString('en-US',{month:'short'}),year:d.getFullYear(),month:d.getMonth(),rev:0});}
  jobs.forEach(function(j){var d=new Date(j.date);months.forEach(function(m){if(d.getFullYear()===m.year&&d.getMonth()===m.month)m.rev+=parseFloat(j.price)||0;});});
  var maxR=Math.max.apply(null,months.map(function(m){return m.rev;}))||1;
  document.getElementById('rev-over-time').innerHTML=months.map(function(m){var h=Math.round(m.rev/maxR*120);return'<div style="flex:1;display:flex;flex-direction:column;align-items:center"><div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;height:120px"><div style="width:100%;height:'+h+'px;background:#22c55e;border-radius:2px 2px 0 0;min-height:'+(m.rev?2:0)+'px"></div></div><div style="font-size:10px;color:var(--muted);text-align:center;margin-top:2px">$'+Math.round(m.rev)+'</div></div>';}).join('');
  document.getElementById('rev-time-labels').innerHTML=months.map(function(m){return'<div style="flex:1;text-align:center;font-size:10px;color:var(--muted)">'+m.label+'</div>';}).join('');
  // Top clients CLV
  var clvList=clients.map(function(c){var stats=getClientJobStats(c.cid,c.name);var rev=getClientRevenue(c.cid,c.name);return{c:c,stats:stats,rev:rev,avgVal:stats.total?rev/stats.total:0,lastDate:getClientLastJobDate(c.cid,c.name)};}).filter(function(x){return x.stats.total>0;}).sort(function(a,b){return b.rev-a.rev;});
  var today6mo=new Date(Date.now()-180*86400000).toISOString().split('T')[0];
  document.getElementById('rev-top-clients').innerHTML='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>'
    +'<th style="text-align:left;padding:8px 12px;font-size:11px;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border)">#</th>'
    +'<th style="text-align:left;padding:8px 12px;font-size:11px;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border)">Client</th>'
    +'<th style="text-align:right;padding:8px 12px;font-size:11px;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border)">Total Rev</th>'
    +'<th style="text-align:right;padding:8px 12px;font-size:11px;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border)">Jobs</th>'
    +'<th style="text-align:right;padding:8px 12px;font-size:11px;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border)">Avg Job</th>'
    +'<th style="text-align:right;padding:8px 12px;font-size:11px;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border)">Last Job</th>'
    +'<th style="text-align:center;padding:8px 12px;font-size:11px;letter-spacing:1px;color:var(--muted);border-bottom:1px solid var(--border)">Activity</th>'
    +'</tr></thead><tbody>'
    +clvList.slice(0,10).map(function(x,i){var dormant=x.lastDate&&x.lastDate<today6mo;return'<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="openClientDetail(\''+x.c.cid+'\')">'
    +'<td style="padding:8px 12px;font-family:\'Bebas Neue\',sans-serif;font-size:18px;color:var(--muted)">'+(i+1)+'</td>'
    +'<td style="padding:8px 12px"><strong>'+x.c.name+'</strong><div style="font-size:11px;color:var(--muted)">'+(x.c.city||'')+'</div></td>'
    +'<td style="padding:8px 12px;text-align:right;font-family:\'Bebas Neue\',sans-serif;font-size:20px;color:var(--accent)">$'+x.rev.toFixed(0)+'</td>'
    +'<td style="padding:8px 12px;text-align:right">'+x.stats.total+'</td>'
    +'<td style="padding:8px 12px;text-align:right">$'+x.avgVal.toFixed(0)+'</td>'
    +'<td style="padding:8px 12px;text-align:right;font-size:12px;color:var(--muted)">'+(x.lastDate?fd(x.lastDate):'—')+'</td>'
    +'<td style="padding:8px 12px;text-align:center">'+(dormant?'<span style="font-size:11px;padding:2px 8px;border-radius:12px;background:rgba(220,53,69,.12);color:#dc3545">😴 Dormant</span>':'<span style="font-size:11px;padding:2px 8px;border-radius:12px;background:rgba(34,197,94,.1);color:#22c55e">✅ Active</span>')+'</td>'
    +'</tr>';}).join('')+'</tbody></table></div>';
}

// ─── BIN UTILIZATION ───
function renderUtilization(){
  var today2=todayStr();
  var windowDays=90;
  var window30=30;
  var winStart=new Date(Date.now()-windowDays*86400000).toISOString().split('T')[0];
  var win30Start=new Date(Date.now()-window30*86400000).toISOString().split('T')[0];
  var totalBinCount=binItems.length;
  var totalPossibleDays=totalBinCount*windowDays;
  var sizeColors={'4 yard':'#4ade80','7 yard':'#f0932b','14 yard':'#f0932b','20 yard':'#e76f7e'};

  // Per-size bin counts
  var sizePossible={'4 yard':0,'7 yard':0,'14 yard':0,'20 yard':0};
  binItems.forEach(function(b){if(sizePossible.hasOwnProperty(b.size))sizePossible[b.size]+=windowDays;});

  // Aggregate metrics
  var rentedDays=0;
  var rentedBySize={'4 yard':0,'7 yard':0,'14 yard':0,'20 yard':0};
  var rentedByCity={};
  var durationBySize={'4 yard':[],  '7 yard':[], '14 yard':[], '20 yard':[]};
  var revBySize={'4 yard':0,'7 yard':0,'14 yard':0,'20 yard':0};
  var turnoverBySize={'4 yard':0,'7 yard':0,'14 yard':0,'20 yard':0};
  var binsUsed30={}; // bid or address used in last 30 days

  jobs.forEach(function(j){
    if(j.service!=='Bin Rental')return;
    var drop=j.binDropoff||j.date;var pick=j.binPickup||today2;
    if(!drop)return;
    var sz=j.binSize||'unknown';
    // Revenue by size
    if(revBySize.hasOwnProperty(sz))revBySize[sz]+=(parseFloat(j.price)||0);
    // Turnover (jobs in 90-day window)
    if(drop>=winStart||pick>=winStart){
      if(turnoverBySize.hasOwnProperty(sz))turnoverBySize[sz]++;
    }
    // Idle detection: any rental in 30-day window?
    if(drop>=win30Start||pick>=win30Start){
      binsUsed30[j.name+(j.address||'')]=true;
    }
    // Duration per size
    var dur=j.binPickup&&j.binDropoff?Math.max(0,Math.floor((new Date(j.binPickup)-new Date(j.binDropoff))/86400000)+1):0;
    if(dur>0&&durationBySize.hasOwnProperty(sz))durationBySize[sz].push(dur);
    // Utilization days
    var effectiveDrop=drop<winStart?winStart:drop;
    var effectivePick=pick>today2?today2:pick;
    if(effectiveDrop>effectivePick)return;
    var days=Math.max(0,Math.floor((new Date(effectivePick)-new Date(effectiveDrop))/86400000)+1);
    rentedDays+=days;
    if(rentedBySize.hasOwnProperty(sz))rentedBySize[sz]+=days;
    var city=extractCity(j.address,j.city);rentedByCity[city]=(rentedByCity[city]||0)+days;
  });

  var utilPct=totalPossibleDays?Math.round(rentedDays/totalPossibleDays*100):0;
  var totalRev=Object.values(revBySize).reduce(function(s,v){return s+v;},0);
  var avgDurAll=Object.values(durationBySize).reduce(function(a,arr){return a.concat(arr);}, []);
  var avgDur=avgDurAll.length?Math.round(avgDurAll.reduce(function(s,v){return s+v;},0)/avgDurAll.length*10)/10:0;

  // Idle bins: bins in fleet that had zero rentals in 30 days
  var idleBins=binItems.filter(function(b){
    var wasUsed=jobs.some(function(j){
      if(j.service!=='Bin Rental')return false;
      var drop=j.binDropoff||j.date;var pick=j.binPickup||today2;
      return (drop>=win30Start||pick>=win30Start)&&(j.binSize===b.size);
    });
    return !wasUsed;
  });

  // Use binItems.status as the single source of truth for current in/out
  // (same as renderBinInventory does — so all three pages always agree)
  var currentOut=binItems.filter(function(b){return b.status==='out';}).length;
  var currentIn=binItems.filter(function(b){return b.status==='in';}).length;
  document.getElementById('util-metrics').innerHTML=
    '<div class="metric-box"><div class="metric-val" id="utm-util" style="color:var(--accent)">0%</div><div class="metric-lbl">Overall Utilization (90d)</div></div>'
    +'<div class="metric-box"><div class="metric-val" id="utm-days">0</div><div class="metric-lbl">Bin-Days Rented (90d)</div></div>'
    +'<div class="metric-box"><div class="metric-val" id="utm-dur">0d</div><div class="metric-lbl">Avg Rental Duration</div></div>'
    +'<div class="metric-box"><div class="metric-val" id="utm-idle" style="color:'+(idleBins.length>0?'#dc3545':'#22c55e')+'">0</div><div class="metric-lbl">Idle Bins (30d)</div></div>'
    +'<div class="metric-box" style="grid-column:1/-1"><div style="display:flex;justify-content:center;gap:32px"><div style="text-align:center"><div class="metric-val" style="color:#dc3545">'+currentOut+'</div><div class="metric-lbl">Currently Out</div></div><div style="text-align:center"><div class="metric-val" style="color:#22c55e">'+currentIn+'</div><div class="metric-lbl">Currently In Yard</div></div><div style="text-align:center"><div class="metric-val" style="color:var(--text)">'+totalBinCount+'</div><div class="metric-lbl">Total Fleet</div></div></div><div style="height:8px;background:var(--surface2);border-radius:4px;margin:12px 0"><div style="height:100%;background:#dc3545;border-radius:4px;width:'+Math.round(totalBinCount?currentOut/totalBinCount*100:0)+'%"></div></div><div style="font-size:12px;color:var(--muted);text-align:center">'+Math.round(totalBinCount?currentOut/totalBinCount*100:0)+'% of fleet currently deployed</div></div>';
  requestAnimationFrame(function(){
    animCount(document.getElementById('utm-util'),utilPct,'','%');
    animCount(document.getElementById('utm-days'),rentedDays);
    animCount(document.getElementById('utm-idle'),idleBins.length);
    var durEl=document.getElementById('utm-dur');if(durEl)durEl.textContent=avgDur+'d';
  });

  // Utilization by size %
  var sizeData=Object.keys(rentedBySize).filter(function(k){return sizePossible[k]>0;}).map(function(k){return{key:k,val:Math.round(rentedBySize[k]/sizePossible[k]*100)};}).sort(function(a,b){return b.val-a.val;});
  document.getElementById('util-by-size').innerHTML=makeBarChart(sizeData,function(k){return sizeColors[k]||'#22c55e';},function(v){return v+'%';});

  // By city
  var cityData=Object.keys(rentedByCity).sort(function(a,b){return rentedByCity[b]-rentedByCity[a];}).slice(0,8).map(function(k){return{key:k,val:rentedByCity[k]};});
  document.getElementById('util-by-city').innerHTML=makeBarChart(cityData,function(){return '#22c55e';},function(v){return v+' days';});

  // Average duration by size
  var durData=Object.keys(durationBySize).filter(function(k){return durationBySize[k].length>0;}).map(function(k){var avg=Math.round(durationBySize[k].reduce(function(s,v){return s+v;},0)/durationBySize[k].length*10)/10;return{key:k,val:avg};}).sort(function(a,b){return b.val-a.val;});
  document.getElementById('util-avg-duration').innerHTML=makeBarChart(durData,function(k){return sizeColors[k]||'#22c55e';},function(v){return v+'d';});

  // Revenue by size
  var revData=Object.keys(revBySize).filter(function(k){return revBySize[k]>0;}).map(function(k){return{key:k,val:Math.round(revBySize[k])};}).sort(function(a,b){return b.val-a.val;});
  document.getElementById('util-rev-size').innerHTML=makeBarChart(revData,function(k){return sizeColors[k]||'#22c55e';},function(v){return '$'+v;});

  // Turnover (# rentals per size in 90d)
  var turnData=Object.keys(turnoverBySize).filter(function(k){return turnoverBySize[k]>0;}).map(function(k){return{key:k,val:turnoverBySize[k]};}).sort(function(a,b){return b.val-a.val;});
  document.getElementById('util-turnover').innerHTML=makeBarChart(turnData,function(k){return sizeColors[k]||'#22c55e';},function(v){return v+' rentals';});
  requestAnimationFrame(function(){['util-by-size','util-by-city','util-avg-duration','util-rev-size','util-turnover'].forEach(function(id){animateBars(document.getElementById(id));});});

  // Idle bins panel
  var idleEl=document.getElementById('util-idle');
  if(!idleBins.length){
    idleEl.innerHTML='<div style="color:var(--accent);font-size:13px;padding:12px;text-align:center">✅ All bin sizes had at least one rental in the last 30 days</div>';
  } else {
    var idleBySize={};
    idleBins.forEach(function(b){idleBySize[b.size]=(idleBySize[b.size]||0)+1;});
    idleEl.innerHTML='<div style="font-size:13px;color:var(--muted);margin-bottom:10px">These bin sizes had no rentals in the last 30 days. Consider promotions or price adjustments.</div>'
      +Object.keys(idleBySize).map(function(sz){return'<div style="padding:8px 12px;border:1px solid rgba(220,53,69,.3);border-radius:8px;margin-bottom:6px;background:rgba(220,53,69,.05);display:flex;justify-content:space-between"><strong>'+sz+'</strong><span style="color:#dc3545;font-weight:700">'+idleBySize[sz]+' idle bins</span></div>';}).join('');
  }

  // Summary & planning
  var recommendation=utilPct>85?'🚨 Very high utilization — consider buying more bins'
    :utilPct>65?'✅ Healthy utilization — fleet is performing well'
    :utilPct>40?'⚠️ Moderate utilization — review pricing or run promotions'
    :'📉 Low utilization — consider promotions or reducing fleet size';

  // Best performing size
  var bestSize=sizeData.length?sizeData[0].key:'N/A';
  var bestSizePct=sizeData.length?sizeData[0].val:0;
  var mostRevSize=revData.length?revData[0].key:'N/A';

  document.getElementById('util-summary').innerHTML=
    '<div style="padding:16px;border-radius:10px;background:var(--surface2);margin-bottom:16px">'
    +'<div style="font-size:15px;font-weight:600;margin-bottom:8px">'+recommendation+'</div>'
    +'<div style="font-size:13px;color:var(--muted)">Last 90 days: <strong style="color:var(--text)">'+totalBinCount+' bins × '+windowDays+' days = '+totalPossibleDays+' possible bin-days</strong>. '
    +'<strong style="color:var(--accent)">'+rentedDays+' bin-days were rented = '+utilPct+'% utilization.</strong></div>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">'
    +['4 yard','7 yard','14 yard','20 yard'].map(function(sz){
      var poss=sizePossible[sz]||0;var pct=poss?Math.round(rentedBySize[sz]/poss*100):0;
      var cnt=binItems.filter(function(b){return b.size===sz;}).length;
      var inYard=binItems.filter(function(b){return b.size===sz&&b.status==='in';}).length;
      return'<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">'
        +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:32px;color:'+(sizeColors[sz]||'#22c55e')+'">'+pct+'%</div>'
        +'<div style="font-size:12px;color:var(--text);font-weight:600;margin-bottom:4px">'+sz+'</div>'
        +'<div style="font-size:11px;color:var(--muted)">'+cnt+' bins · '+inYard+' in yard</div>'
        +'<div style="font-size:11px;color:var(--muted)">'+turnoverBySize[sz]+' rentals · $'+(Math.round(revBySize[sz]||0))+'</div>'
        +'</div>';
    }).join('')
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">'
    +'<div style="background:var(--surface2);border-radius:8px;padding:12px"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">🏆 HIGHEST UTILIZATION</div><div style="font-size:15px;font-weight:600">'+bestSize+'</div><div style="font-size:13px;color:var(--accent)">'+bestSizePct+'% utilized</div></div>'
    +'<div style="background:var(--surface2);border-radius:8px;padding:12px"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">💰 MOST REVENUE</div><div style="font-size:15px;font-weight:600">'+mostRevSize+'</div><div style="font-size:13px;color:var(--accent)">$'+Math.round(revBySize[mostRevSize]||0)+'</div></div>'
    +'<div style="background:var(--surface2);border-radius:8px;padding:12px"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">⏱️ AVG RENTAL LENGTH</div><div style="font-size:15px;font-weight:600">'+avgDur+' days</div><div style="font-size:13px;color:var(--muted)">across all sizes</div></div>'
    +'</div>';
}

// ── Startup: auth check happens in the login script below ──
renderClientSelectOptions();
// Pre-seed analytics pickers with default values on load
(function(){
  var now=new Date();
  var wa=document.getElementById('an-week-a'); if(wa){var pv=new Date(now);pv.setDate(pv.getDate()-7); wa.value=toWeekValue(now); document.getElementById('an-week-b').value=toWeekValue(pv);}
  var ma=document.getElementById('an-month-a'); if(ma){ma.value=now.getFullYear()+'-'+(now.getMonth()<9?'0':'')+(now.getMonth()+1);var pm=new Date(now.getFullYear(),now.getMonth()-1,1);document.getElementById('an-month-b').value=pm.getFullYear()+'-'+(pm.getMonth()<9?'0':'')+(pm.getMonth()+1);}
})();

// ═══════════════════════════════════════
//  AUTH SYSTEM — Supabase Login
// ═══════════════════════════════════════
var currentUser = null;
var adminUnlocked = false;
var appLoaded = false;

// Check if already logged in on page load
db.auth.getSession().then(function(r) {
  if (r.data && r.data.session) {
    currentUser = r.data.session.user;
    onLoginSuccess();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    setTimeout(function(){ document.getElementById('login-email').focus(); }, 100);
  }
});

// Listen for auth changes (e.g. session expiry)
db.auth.onAuthStateChange(function(event, session) {
  if (event === 'SIGNED_IN' && appLoaded) {
    // Already handled by doLogin() or getSession() — ignore duplicate
    return;
  }
  if (event === 'SIGNED_IN' && !appLoaded && session) {
    currentUser = session.user;
    onLoginSuccess();
    return;
  }
  if (event === 'SIGNED_OUT') {
    currentUser = null;
    adminUnlocked = false;
    appLoaded = false;
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-email').focus();
  }
});

async function doLogin() {
  var email = document.getElementById('login-email').value.trim();
  var pass  = document.getElementById('login-password').value;
  var errEl = document.getElementById('login-error');
  var btn   = document.getElementById('login-btn');
  if (!email || !pass) { errEl.textContent = 'Please enter your email and password.'; return; }
  errEl.textContent = '';
  btn.textContent = 'Signing in...';
  btn.style.background = '#16a34a';
  btn.disabled = true;

  function loginFail(msg) {
    errEl.textContent = msg;
    errEl.style.fontWeight = '600';
    errEl.style.fontSize = '14px';
    btn.textContent = 'Sign In';
    btn.style.background = '#22c55e';
    btn.disabled = false;
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();
  }

  // Check Supabase client exists
  if (!db || !db.auth) {
    loginFail('⚠ App failed to initialise — please hard-refresh (Ctrl+Shift+R).');
    return;
  }

  // 12 second timeout
  var timedOut = false;
  var timer = setTimeout(function() {
    timedOut = true;
    loginFail('⚠ Connection timed out. Check your internet and try again.');
  }, 12000);

  var r;
  try {
    r = await db.auth.signInWithPassword({ email: email, password: pass });
  } catch(ex) {
    clearTimeout(timer);
    loginFail('⚠ Network error: ' + ex.message);
    return;
  }

  clearTimeout(timer);
  if (timedOut) return;

  console.log('Auth result:', r);

  if (r.error) {
    var msg = r.error.message || 'Unknown error';
    // Make common errors human-readable
    if (msg.toLowerCase().includes('invalid login')) msg = 'Invalid email or password.';
    else if (msg.toLowerCase().includes('email not confirmed')) msg = 'Please confirm your email address first.';
    else if (msg.toLowerCase().includes('too many requests')) msg = 'Too many attempts — wait a minute and try again.';
    loginFail('⚠ ' + msg);
    return;
  }

  if (!r.data || !r.data.user) {
    loginFail('⚠ Sign-in returned no user — please try again.');
    return;
  }

  currentUser = r.data.user;
  onLoginSuccess();
}

function onLoginSuccess() {
  if (appLoaded) return; // prevent double-load
  appLoaded = true;
  // Check if owner/admin role for revenue access
  db.from('user_profiles').select('role,can_see_revenue').eq('id', currentUser.id).single().then(function(r) {
    if (r.data && r.data.can_see_revenue) {
      adminUnlocked = true;
    }
    applyAdminVisibility();
  });
  document.getElementById('login-screen').style.display = 'none';
  var lbl = document.getElementById('admin-btn-label');
  var icon = document.getElementById('admin-btn-icon');
  if (lbl) lbl.textContent = 'Sign Out';
  if (icon) icon.textContent = '👤';
  loadAllFromSupabase();
}

function applyAdminVisibility() {
  document.querySelectorAll('.admin-only').forEach(function(el) {
    el.style.display = adminUnlocked ? '' : 'none';
  });
  var btn = document.getElementById('admin-btn');
  var icon = document.getElementById('admin-btn-icon');
  var lbl  = document.getElementById('admin-btn-label');
  if (!btn) return;
  if (adminUnlocked) {
    btn.style.borderColor = 'var(--accent)';
    btn.style.color = 'var(--accent)';
  } else {
    btn.style.borderColor = 'var(--border)';
    btn.style.color = 'var(--muted)';
  }
  if (!adminUnlocked && document.getElementById('view-revenue') && document.getElementById('view-revenue').classList.contains('active')) {
    go('dashboard');
  }
}

function handleAdminBtn() {
  // This button is now Sign Out
  if (!currentUser) return;
  if (confirm('Sign out of Jeff\'s Junk?')) {
    db.auth.signOut();
  }
}

// Revenue page guard
var _origGo = go;
go = function(name) {
  if (name === 'revenue' && !adminUnlocked) {
    toast('⚠ You need owner access to view revenue.');
    return;
  }
  _origGo(name);
};

applyAdminVisibility();

// ═══════════════════════════════════════
// EMAIL SYSTEM
// ═══════════════════════════════════════
var emailJobId = null;
var emailPresets = {};

var defaultPresets = {
  bin_dropoff: {
    subject: 'Your Bin Rental – Drop-off Confirmation',
    body: 'Hi {name},\n\nThis is a confirmation that your {binSize} bin will be dropped off on {date}{time}.\n\nPlease ensure there is adequate space in your driveway{side}.\n\nIf you have any questions, please don\'t hesitate to call us!\n\nThank you for choosing Jeff\'s Junk!\n\nBest regards,\nJeff\'s Junk'
  },
  bin_pickup: {
    subject: 'Your Bin Rental – Pick-up Scheduled',
    body: 'Hi {name},\n\nThis is a reminder that we will be picking up your bin on {date}{time}.\n\nPlease ensure the bin is accessible and nothing is blocking it.\n\nThank you for using Jeff\'s Junk!\n\nBest regards,\nJeff\'s Junk'
  },
  junk_removal: {
    subject: 'Your Junk Removal – Appointment Confirmation',
    body: 'Hi {name},\n\nThis is a confirmation of your junk removal appointment on {date}{time}.\n\nAddress: {address}\n\nPlease have the items accessible for our crew.\n\nThank you for choosing Jeff\'s Junk!\n\nBest regards,\nJeff\'s Junk'
  },
  furniture_bank: {
    subject: 'Furniture Bank Appointment Confirmation',
    body: 'Hi {name},\n\nThis is a confirmation of your furniture bank appointment on {date}{time}.\n\nAddress: {address}\n\nPlease ensure the furniture is ready and accessible.\n\nThank you for choosing Jeff\'s Junk!\n\nBest regards,\nJeff\'s Junk'
  },
  junk_quote: {
    subject: 'Your Junk Removal Quote',
    body: 'Hi {name},\n\nThank you for requesting a junk removal quote.\n\nWe have scheduled a quote visit for {date}{time}.\n\nAddress: {address}\n\nOur team will assess the items and provide you with a detailed quote on site.\n\nThank you for choosing Jeff\'s Junk!\n\nBest regards,\nJeff\'s Junk'
  }
};

function getPreset(key) {
  return emailPresets[key] || defaultPresets[key] || {subject:'',body:''};
}

function fillEmailTemplate(template, j) {
  var side = j.binSide ? ' (' + j.binSide + ' side)' : '';
  var time = j.time ? ' at ' + ft(j.time) : '';
  return template
    .replace(/{name}/g, j.name || '')
    .replace(/{binSize}/g, j.binSize || 'bin')
    .replace(/{date}/g, fd(j.date) || '')
    .replace(/{time}/g, time)
    .replace(/{address}/g, ((j.address||'')+(j.city?', '+j.city:'')) || '')
    .replace(/{price}/g, fm(j.price) || '')
    .replace(/{side}/g, side);
}

function guessPresetKey(j) {
  if (j.service === 'Bin Rental') {
    if (j.binInstatus === 'dropped') return 'bin_pickup';
    return 'bin_dropoff';
  }
  if (j.service === 'Junk Removal') return 'junk_removal';
  if (j.service === 'Junk Quote') return 'junk_quote';
  return 'furniture_bank';
}

function openEmailModal(id) {
  var j = null; jobs.forEach(function(jj){if(jj.id===id)j=jj;});
  if (!j) return;
  emailJobId = id;
  closeM('detail-modal');
  var cl = null; if (j.clientId) clients.forEach(function(c){if(c.cid===j.clientId)cl=c;});
  var email = (cl && cl.email) || '';
  document.getElementById('email-to').value = email;
  var key = guessPresetKey(j);
  var preset = getPreset(key);
  document.getElementById('email-subject').value = fillEmailTemplate(preset.subject, j);
  document.getElementById('email-body').value = fillEmailTemplate(preset.body, j);
  var sentNote = document.getElementById('email-sent-note');
  sentNote.style.display = j.emailSent ? 'block' : 'none';
  setTimeout(function(){document.getElementById('email-modal').classList.add('open');}, 150);
}

function loadEmailPreset(key) {
  var j = null; if (emailJobId) jobs.forEach(function(jj){if(jj.id===emailJobId)j=jj;});
  var preset = getPreset(key);
  document.getElementById('email-subject').value = j ? fillEmailTemplate(preset.subject, j) : preset.subject;
  document.getElementById('email-body').value = j ? fillEmailTemplate(preset.body, j) : preset.body;
}

function sendEmail() {
  var to = document.getElementById('email-to').value.trim();
  var subject = document.getElementById('email-subject').value.trim();
  var body = document.getElementById('email-body').value.trim();
  if (!to) { showErr('email-to'); document.getElementById('err-email-to').textContent='Please enter an email address to send to.'; return; }
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) { showErr('email-to'); document.getElementById('err-email-to').textContent='That doesn\'t look like a valid email address (e.g. name@example.com).'; return; }
  var mailto = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  window.open(mailto, '_blank');
  if (emailJobId) {
    jobs.forEach(function(j){if(j.id===emailJobId)j.emailSent=true;});
    patchJob(emailJobId,{emailSent:true});
    document.getElementById('email-sent-note').style.display = 'block';
    toast('Email client opened!');
  }
}

function openEditPresets() {
  var keys = ['bin_dropoff','bin_pickup','junk_removal','furniture_bank','junk_quote'];
  var labels = {bin_dropoff:'🚛 Bin Drop-off',bin_pickup:'🚚 Bin Pick-up',junk_removal:'Junk Removal',furniture_bank:'🛋️ Furniture Bank',junk_quote:'📋 Junk Quote'};
  var html = '';
  keys.forEach(function(k) {
    var p = getPreset(k);
    html += '<div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid var(--border)">'
      + '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px">' + labels[k] + '</div>'
      + '<div class="form-group" style="margin-bottom:8px"><label>Subject</label><input id="preset-subj-' + k + '" type="text" value="' + (p.subject||'').replace(/"/g,'&quot;') + '"></div>'
      + '<div class="form-group"><label>Body (use {name}, {date}, {time}, {address}, {binSize}, {side}, {price})</label><textarea id="preset-body-' + k + '" rows="5">' + (p.body||'') + '</textarea></div>'
      + '</div>';
  });
  document.getElementById('presets-editor').innerHTML = html;
  closeM('email-modal');
  setTimeout(function(){document.getElementById('presets-modal').classList.add('open');}, 150);
}

function savePresets() {
  var keys = ['bin_dropoff','bin_pickup','junk_removal','furniture_bank','junk_quote'];
  keys.forEach(function(k) {
    var s = document.getElementById('preset-subj-' + k);
    var b = document.getElementById('preset-body-' + k);
    if (s && b) emailPresets[k] = {subject: s.value, body: b.value};
  });
  // Sync to Supabase
  var rows = keys.map(function(k){
    return {preset_key:k, subject:emailPresets[k]?emailPresets[k].subject:'', body:emailPresets[k]?emailPresets[k].body:''};
  });
  db.from('email_presets').upsert(rows, {onConflict:'preset_key'}).then(function(r){
    if(r.error) console.warn('Email presets sync failed:', r.error.message);
  });
  closeM('presets-modal');
  toast('Email presets saved!');
}

// ═══════════════════════════════════════
// MERGE CLIENTS
// ═══════════════════════════════════════
async function openMergeClients() {
  document.getElementById('merge-primary-search').value = '';
  document.getElementById('merge-secondary-search').value = '';
  document.getElementById('merge-primary').value = '';
  document.getElementById('merge-secondary').value = '';
  hideMergeDropdown('primary');
  hideMergeDropdown('secondary');
  document.getElementById('merge-preview-empty').style.display = 'block';
  document.getElementById('merge-preview-empty').innerHTML = 'Search and select both clients to preview the merge';
  document.getElementById('merge-preview-diff').style.display = 'none';
  var btn = document.getElementById('merge-confirm-btn');
  btn.disabled = true; btn.style.opacity = '0.45'; btn.style.cursor = 'not-allowed';
  document.getElementById('merge-modal').classList.add('open');

  // If clients haven't been loaded yet, fetch them now
  if (!clients.length) {
    document.getElementById('merge-preview-empty').innerHTML = 'Loading clients…';
    await loadClientsPage();
    document.getElementById('merge-preview-empty').innerHTML = 'Search and select both clients to preview the merge';
  }
}

function countClientJobs(cid, name) {
  // Use the stats cache built from ALL jobs (Supabase) — much more accurate than local jobs array
  if (_clientStatsCache && _clientStatsCache.statsMap) {
    var s = _clientStatsCache.statsMap[cid];
    return s ? s.total : 0;
  }
  // Fallback: check client object directly (also populated from Supabase)
  var c = clients.find(function(x){ return x.cid === cid; });
  if (c && typeof c._totalJobs === 'number') return c._totalJobs;
  // Last resort: local jobs array (may be incomplete)
  var nameLower = name ? name.toLowerCase() : '';
  return jobs.filter(function(j){
    if (cid) return j.clientId === cid;
    return j.name && j.name.toLowerCase() === nameLower;
  }).length;
}

// Body-level dropdowns that escape the modal's overflow:auto clipping
function getMergeDropdown(which) {
  var id = 'merge-' + which + '-dropdown';
  var drop = document.getElementById(id);
  if (!drop) {
    drop = document.createElement('div');
    drop.id = id;
    drop.style.cssText = 'display:none;position:fixed;z-index:9999;max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;background:var(--surface-solid);box-shadow:0 8px 24px rgba(0,0,0,.35);';
    document.body.appendChild(drop);
  }
  return drop;
}

function positionMergeDropdown(which) {
  var inp = document.getElementById('merge-' + which + '-search');
  var drop = getMergeDropdown(which);
  var r = inp.getBoundingClientRect();
  drop.style.left  = r.left + 'px';
  drop.style.top   = (r.bottom + 2) + 'px';
  drop.style.width = r.width + 'px';
}

function hideMergeDropdown(which) {
  var drop = document.getElementById('merge-' + which + '-dropdown');
  if (drop) drop.style.display = 'none';
}

async function filterMergeList(which) {
  var q = document.getElementById('merge-' + which + '-search').value.trim();
  var drop = getMergeDropdown(which);

  if (!q) { drop.style.display = 'none'; return; }

  positionMergeDropdown(which);
  drop.style.display = 'block';
  drop.innerHTML = '<div style="padding:10px 14px;color:var(--muted);font-size:13px">Searching...</div>';

  try {
    var r = await db.from('clients').select('*')
      .or('name.ilike.%' + q + '%,phone.ilike.%' + q + '%')
      .order('name').limit(15);

    if (!r.data || !r.data.length) {
      drop.innerHTML = '<div style="padding:10px 14px;color:var(--muted);font-size:13px">No clients found</div>';
      return;
    }

    r.data.forEach(function(c) {
      var cl = dbToClient(c);
      var idx = clients.findIndex(function(x) { return x.cid === cl.cid; });
      if (idx >= 0) clients[idx] = cl; else clients.push(cl);
    });

    drop.innerHTML = r.data.map(function(c) {
      var cnt = countClientJobs(c.cid, c.name);
      return '<div onclick="selectMergeClient(\'' + which + '\',\'' + c.cid + '\')" '
        + 'style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;display:flex;justify-content:space-between;align-items:center;" '
        + 'onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">'
        + '<span><strong>' + c.name + '</strong>' + (c.city ? ' <span style="color:var(--muted);font-size:11px">· ' + c.city + '</span>' : '') + '</span>'
        + '<span style="color:var(--muted);font-size:11px;flex-shrink:0;margin-left:8px;">' + cnt + ' job' + (cnt !== 1 ? 's' : '') + '</span>'
        + '</div>';
    }).join('');

  } catch(ex) {
    drop.innerHTML = '<div style="padding:10px 14px;color:#dc3545;font-size:13px">Error: ' + ex.message + '</div>';
  }
}

function selectMergeClient(which, cid) {
  var c = clients.find(function(x) { return x.cid === cid; });
  if (!c) return;
  document.getElementById('merge-' + which + '-search').value = c.name;
  document.getElementById('merge-' + which).value = cid;
  hideMergeDropdown(which);
  updateMergePreview();
}

// Hide merge dropdowns when clicking outside
document.addEventListener('click', function(e){
  ['primary','secondary'].forEach(function(w){
    var inp  = document.getElementById('merge-' + w + '-search');
    var drop = document.getElementById('merge-' + w + '-dropdown');
    if (drop && inp && !inp.contains(e.target) && !drop.contains(e.target)) {
      drop.style.display = 'none';
    }
  });
});

function updateMergePreview() {
  var pid = document.getElementById('merge-primary').value;
  var sid = document.getElementById('merge-secondary').value;
  var empty = document.getElementById('merge-preview-empty');
  var diff  = document.getElementById('merge-preview-diff');
  var btn   = document.getElementById('merge-confirm-btn');

  function hideDiff(msg) {
    empty.style.display = 'block';
    empty.innerHTML = msg || 'Search and select both clients to preview the merge';
    diff.style.display = 'none';
    btn.disabled = true; btn.style.opacity = '0.45'; btn.style.cursor = 'not-allowed';
  }

  if (!pid || !sid) { hideDiff(); return; }
  if (pid === sid) { hideDiff('<span style="color:#dc3545">⚠ Please select two different clients</span>'); return; }

  var pc = clients.find(function(c){return c.cid===pid;});
  var sc = clients.find(function(c){return c.cid===sid;});
  if (!pc || !sc) { hideDiff(); return; }

  var pjobs = countClientJobs(pid, pc.name);
  var sjobs = countClientJobs(sid, sc.name);

  // Field definitions
  var FIELDS = [
    {key:'name',     label:'👤 Name'},
    {key:'phone',    label:'📞 Phone'},
    {key:'email',    label:'✉️ Email'},
    {key:'address',  label:'📍 Address'},
    {key:'city',     label:'🏙 City'},
    {key:'notes',    label:'📝 Notes'},
    {key:'referral', label:'📣 Referral'}
  ];

  // For each field, classify: existing / added / duplicate / removed
  // Primary card rows
  var primaryRows = [];
  // Secondary card rows
  var secondaryRows = [];

  FIELDS.forEach(function(f){
    var pVal = (pc[f.key]||'').trim();
    var sVal = (sc[f.key]||'').trim();
    var willAdd = sVal && pVal.toLowerCase().indexOf(sVal.toLowerCase()) === -1;

    // Primary side
    if (pVal) {
      primaryRows.push('<div style="display:flex;gap:6px;"><span style="color:var(--muted);min-width:90px;flex-shrink:0;">'+f.label+'</span><span style="color:var(--text);">'+escHtml(pVal)+'</span></div>');
    }
    if (willAdd) {
      // New info coming from secondary — show in green
      primaryRows.push('<div style="display:flex;gap:6px;"><span style="color:var(--muted);min-width:90px;flex-shrink:0;">'+f.label+'</span><span style="color:#15803d;font-weight:500;">+ '+escHtml(sVal)+'</span></div>');
    }
    if (!pVal && !sVal) return; // nothing to show

    // Secondary side
    if (sVal) {
      if (willAdd) {
        // Will be merged into primary — show as moving
        secondaryRows.push('<div style="display:flex;gap:6px;"><span style="color:var(--muted);min-width:90px;flex-shrink:0;">'+f.label+'</span><span style="color:#b91c1c;text-decoration:line-through;opacity:.7;">'+escHtml(sVal)+'</span></div>');
      } else {
        // Duplicate — already on primary, will be dropped
        secondaryRows.push('<div style="display:flex;gap:6px;"><span style="color:var(--muted);min-width:90px;flex-shrink:0;">'+f.label+'</span><span style="color:var(--muted);font-style:italic;">'+escHtml(sVal)+' <span style="font-size:10px;">(duplicate)</span></span></div>');
      }
    }
  });

  if (!primaryRows.length)   primaryRows.push('<div style="color:var(--muted);font-style:italic;">No contact info</div>');
  if (!secondaryRows.length) secondaryRows.push('<div style="color:var(--muted);font-style:italic;">No contact info</div>');

  // Jobs banner
  document.getElementById('merge-jobs-banner').innerHTML =
    '<span style="font-size:16px;">📋</span>'
    + '<strong style="color:var(--text);">'+pc.name+'</strong>'
    + '<span style="color:var(--muted);">'+pjobs+' jobs</span>'
    + '<span style="font-size:18px;color:var(--accent);">+</span>'
    + '<strong style="color:var(--text);">'+sc.name+'</strong>'
    + '<span style="color:var(--muted);">'+sjobs+' jobs</span>'
    + '<span style="font-size:18px;color:var(--muted);">=</span>'
    + '<strong style="color:#15803d;font-size:15px;">'+(pjobs+sjobs)+' total jobs</strong>';

  document.getElementById('merge-primary-jobs-badge').textContent   = pjobs + ' → ' + (pjobs+sjobs) + ' jobs';
  document.getElementById('merge-secondary-jobs-badge').textContent = sjobs + ' jobs moved';
  document.getElementById('merge-primary-body').innerHTML   = primaryRows.join('');
  document.getElementById('merge-secondary-body').innerHTML = secondaryRows.join('');

  empty.style.display = 'none';
  diff.style.display  = 'block';
  btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function doMergeClients() {
  var btn = document.getElementById('merge-confirm-btn');
  if (btn && btn.style.cursor === 'not-allowed') return;
  var pid = document.getElementById('merge-primary').value;
  var sid = document.getElementById('merge-secondary').value;
  if (!pid || !sid || pid === sid) { alert('Please select two different clients.'); return; }
  var pc = clients.find(function(c){return c.cid===pid;});
  var sc = clients.find(function(c){return c.cid===sid;});
  if (!pc || !sc) return;

  // ── Merge scalar fields (phone, email, address, city, notes, referral) ──
  var scalarFields = ['phone','email','address','city','notes','referral'];
  scalarFields.forEach(function(f){
    var pVal = (pc[f]||'').trim();
    var sVal = (sc[f]||'').trim();
    if (sVal && pVal.toLowerCase().indexOf(sVal.toLowerCase()) === -1) {
      pc[f] = pVal ? pVal + '\n' + sVal : sVal;
    }
  });

  // ── Merge names[] — all unique contact names ──
  var pNames = pc.names || [pc.name];
  var sNames = sc.names || [sc.name];
  sNames.forEach(function(n){
    if (n && !pNames.some(function(p){ return p.toLowerCase() === n.toLowerCase(); })) {
      pNames.push(n);
    }
  });
  pc.names = pNames;

  // ── Merge phones[] — dedupe by number ──
  var pPhones = pc.phones || (pc.phone ? [{num:pc.phone,label:''}] : []);
  var sPhones = sc.phones || (sc.phone ? [{num:sc.phone,label:''}] : []);
  sPhones.forEach(function(sp){
    var spNum = (sp.num||sp||'').toString().replace(/\D/g,'');
    if (spNum && !pPhones.some(function(pp){
      return ((pp.num||pp||'').toString().replace(/\D/g,'')) === spNum;
    })) { pPhones.push(sp); }
  });
  pc.phones = pPhones;

  // ── Merge emails[] — dedupe by address ──
  var pEmails = pc.emails || (pc.email ? [pc.email] : []);
  var sEmails = sc.emails || (sc.email ? [sc.email] : []);
  sEmails.forEach(function(se){
    var seAddr = (se.email||se||'').toLowerCase();
    if (seAddr && !pEmails.some(function(pe){
      return (pe.email||pe||'').toLowerCase() === seAddr;
    })) { pEmails.push(se); }
  });
  pc.emails = pEmails;

  // ── Merge addresses[] — dedupe by street ──
  var pAddrs = pc.addresses || (pc.address ? [{street:pc.address,city:pc.city||''}] : []);
  var sAddrs = sc.addresses || (sc.address ? [{street:sc.address,city:sc.city||''}] : []);
  sAddrs.forEach(function(sa){
    var saStreet = (sa.street||'').toLowerCase().trim();
    if (saStreet && !pAddrs.some(function(pa){
      return (pa.street||'').toLowerCase().trim() === saStreet;
    })) { pAddrs.push(sa); }
  });
  pc.addresses = pAddrs;

  // ── Update local jobs (partial array — keep consistent) ──
  jobs.forEach(function(j){ if (j.clientId === sid) j.clientId = pid; });

  // ── Update ALL jobs in Supabase (local array is incomplete) ──
  db.from('jobs').update({ client_cid: pid }).eq('client_cid', sid).then(function(r){
    if (r.error) console.warn('Merge jobs update error:', r.error.message);
  });

  // ── Remove secondary client ──
  clients = clients.filter(function(c){return c.cid !== sid;});

  _clientStatsCache = null;
  _clientStatsCacheTime = 0;

  updateSidebarStats(); saveClients(); renderClients(); renderClientSelectOptions();
  closeM('merge-modal');
  toast('✓ Merged ' + sc.name + ' → ' + pc.name);
}

// ─── FURNITURE BANK DRD ───
var DRD_ITEMS = [
  {name:'Air Conditioner',val:100},{name:'Armchair',val:100},{name:'Armoire',val:200},
  {name:'Artificial Plant',val:50},{name:'Bag of Linens',val:25},{name:'Bar Fridge',val:100},
  {name:'Bed Frame - Double/Twin',val:75},{name:'Bed Frame - Queen',val:100},{name:'Bench',val:50},
  {name:'Box - Assorted Home Goods',val:25},{name:'Box - Cookware',val:25},{name:'Box - Dishware',val:25},
  {name:'Boxspring - Double',val:150},{name:'Boxspring - Queen',val:150},{name:'Boxspring - Twin',val:100},
  {name:'Buffet Hutch',val:150},{name:'Cabinet',val:150},{name:'CD Stand',val:25},
  {name:'Chair (dining/kitchen/occas)',val:50},{name:'Chest',val:100},{name:'Coat Rack',val:25},
  {name:'Credenza',val:150},{name:'Desk',val:100},{name:'Dresser',val:100},
  {name:'DVD Player',val:25},{name:'Entertainment Unit',val:150},{name:'Filing Cabinet',val:50},
  {name:'Folding Chair',val:25},{name:'Folding Table',val:50},{name:'Futon - Complete',val:150},
  {name:'Ironing Board',val:25},{name:'Lamp',val:25},{name:'Laundry Hamper',val:25},
  {name:'Loveseat',val:150},{name:'Mattress - Double',val:150},{name:'Mattress - Queen',val:150},
  {name:'Mattress - Twin',val:100},{name:'Microwave',val:50},{name:'Microwave Stand',val:50},
  {name:'Mirror',val:50},{name:'Office Chair',val:50},{name:'Ottoman',val:50},
  {name:'Picture - Artwork',val:25},{name:'Recliner',val:100},{name:'Rocking Chair',val:75},
  {name:'Room Divider',val:25},{name:'Rug',val:75},{name:'Sectional',val:350},
  {name:'Shelf - Large',val:100},{name:'Shelf - Small',val:75},{name:'Shoe Rack',val:25},
  {name:'Sideboard',val:150},{name:'Small Appliance',val:25},{name:'Sofa',val:250},
  {name:'Sofabed',val:300},{name:'Space Heater',val:25},{name:'Stereo',val:25},
  {name:'Stool (dining/kitchen)',val:25},{name:'Table - Coffee',val:100},{name:'Table - Dining/Kitchen',val:150},
  {name:'Table - Night',val:50},{name:'Table - Side',val:50},{name:'Television - Tube',val:50},
  {name:'Television Stand',val:75},{name:'TV - Flat Screen Under 32"',val:100},
  {name:'TV - Flat Screen Over 32"',val:150},{name:'Trunk',val:75},{name:'TV Tray',val:25},
  {name:'Vacuum',val:75},{name:'Vanity',val:150},{name:'Wall Unit',val:100},
  {name:'Wardrobe',val:200},{name:'Waste Basket',val:25}
];
function renderDRD(){
  var dateEl=document.getElementById('drd-date');
  if(dateEl&&!dateEl.value) dateEl.value=todayStr();
  var g=document.getElementById('drd-items-grid');
  if(!g) return;
  g.innerHTML=DRD_ITEMS.map(function(item,i){
    var sid='drd-qty-'+i;
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--surface2);border:1px solid var(--border);gap:8px">'
      +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+item.name+'">'+item.name+'</div>'
      +'<div style="font-size:10px;color:var(--muted)">$'+item.val+' ea</div></div>'
      +'<input type="number" id="'+sid+'" min="0" placeholder="0" style="width:52px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:4px 6px;border-radius:6px;font-size:13px;font-weight:700;text-align:center;font-family:\'DM Sans\',sans-serif" oninput="drdRecalc()">'
      +'</div>';
  }).join('');
  var otherRows=document.getElementById('drd-other-rows');
  if(otherRows&&!otherRows.children.length) drdAddOtherRow();
  drdRecalc();
}
function drdAddOtherRow(){
  var wrap=document.getElementById('drd-other-rows');if(!wrap)return;
  var row=document.createElement('div');
  row.style.cssText='display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:6px;align-items:center';
  row.innerHTML='<input type="text" class="form-input drd-other-name" placeholder="Item description" style="font-size:13px;padding:6px 10px">'
    +'<input type="number" class="form-input drd-other-qty" placeholder="0" min="0" style="font-size:13px;padding:6px 10px;width:70px;text-align:center" oninput="drdRecalc()">';
  wrap.appendChild(row);
}
function drdRecalc(){
  var totalItems=0,totalVal=0;
  DRD_ITEMS.forEach(function(item,i){
    var el=document.getElementById('drd-qty-'+i);
    var qty=el?(parseInt(el.value)||0):0;
    totalItems+=qty; totalVal+=qty*item.val;
  });
  document.querySelectorAll('.drd-other-qty').forEach(function(el){totalItems+=parseInt(el.value)||0;});
  var ti=document.getElementById('drd-total-items');
  var tv=document.getElementById('drd-total-value');
  if(ti)ti.textContent=totalItems;
  if(tv)tv.textContent='$'+totalVal.toFixed(2);
}
function drdClear(){
  if(!confirm('Clear all form fields?'))return;
  ['drd-src-fb','drd-src-jj','drd-src-rp'].forEach(function(id){var el=document.getElementById(id);if(el)el.checked=false;});
  ['drd-opp','drd-date','drd-name','drd-addr','drd-city','drd-postal','drd-email','drd-phone','drd-contact','drd-contact-info','drd-emailed-date'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('drd-tax').value='YES';
  DRD_ITEMS.forEach(function(_,i){var el=document.getElementById('drd-qty-'+i);if(el)el.value='';});
  document.getElementById('drd-other-rows').innerHTML='';
  drdAddOtherRow();drdRecalc();toast('Form cleared.');
}
function drdSend(){
  var email=document.getElementById('drd-email').value.trim();
  var name=document.getElementById('drd-name').value.trim();
  if(!email){toast('⚠ Please enter the donor\'s email address.');document.getElementById('drd-email').focus();return;}
  if(!name){toast('⚠ Please enter the donor\'s name.');document.getElementById('drd-name').focus();return;}
  var sources=[];
  if(document.getElementById('drd-src-fb').checked)sources.push('Furniture Bank');
  if(document.getElementById('drd-src-jj').checked)sources.push("Jeff's Junk");
  if(document.getElementById('drd-src-rp').checked)sources.push('Redwood Park');
  var opp=document.getElementById('drd-opp').value.trim();
  var tax=document.getElementById('drd-tax').value;
  var date=document.getElementById('drd-date').value;
  var addr=document.getElementById('drd-addr').value.trim();
  var city=document.getElementById('drd-city').value.trim();
  var postal=document.getElementById('drd-postal').value.trim();
  var phone=document.getElementById('drd-phone').value.trim();
  var contact=document.getElementById('drd-contact').value.trim();
  var contactInfo=document.getElementById('drd-contact-info').value.trim();
  var itemLines=[];
  DRD_ITEMS.forEach(function(item,i){
    var el=document.getElementById('drd-qty-'+i);
    var qty=el?(parseInt(el.value)||0):0;
    if(qty>0)itemLines.push('  '+item.name+' x'+qty+' = $'+(qty*item.val).toFixed(2)+' receipt value');
  });
  document.querySelectorAll('#drd-other-rows .drd-other-name').forEach(function(el,idx){
    var qtyEl=document.querySelectorAll('#drd-other-rows .drd-other-qty')[idx];
    var qty=qtyEl?(parseInt(qtyEl.value)||0):0;
    var n=el.value.trim();
    if(qty>0&&n)itemLines.push('  '+n+' x'+qty);
  });
  var totalItems=document.getElementById('drd-total-items').textContent;
  var totalVal=document.getElementById('drd-total-value').textContent;
  var subject='Donation Receiving Document — Jeff\'s Junk / Furniture Bank'+(date?' ('+fd(date)+')':'');
  var body='Dear '+name+',\n\nThank you for your generous donation! Please find your Donation Receiving Document below.\n\n'
    +'══════════════════════════════\n'+'DONATION RECEIVING DOCUMENT\n'+'══════════════════════════════\n\n'
    +(sources.length?'Donation Source: '+sources.join(', ')+'\n':'')
    +(opp?'FB Opportunity #: '+opp+'\n':'')
    +'Tax Receipt Requested: '+tax+'\n'
    +'Donation Date: '+(date?fd(date):'—')+'\n\n'
    +'DONOR INFORMATION\n'+'──────────────────────\n'
    +'Name:     '+name+'\n'
    +'Address:  '+addr+'\n'
    +'          '+city+(postal?' '+postal:'')+'\n'
    +'Email:    '+email+'\n'
    +'Phone:    '+phone+'\n'
    +(contact?'Contact:  '+contact+(contactInfo?' — '+contactInfo:'')+'\n':'')
    +'\nDONATED ITEMS\n'+'──────────────────────\n'
    +(itemLines.length?itemLines.join('\n'):'  (No items entered)')+'\n\n'
    +'──────────────────────\n'
    +'Number of Items:      '+totalItems+'\n'
    +'In-Kind Gift Amount:  '+totalVal+'\n\n'
    +'══════════════════════════════\n\n'
    +'A charitable tax receipt will be issued to the email/mailing address provided by the end of the following month.\n\n'
    +'Thank you again for your generous donation!\n\nJeff\'s Junk\nwww.jeffsjunk.ca';
  window.open('mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body),'_blank');
  var ed=document.getElementById('drd-emailed-date');if(ed&&!ed.value)ed.value=todayStr();
  toast('Email client opened with DRD for '+name+'!');
}


// ─── DRD PDF GENERATION (fills official DRD_FORM.pdf with real AcroForm fields) ───
var DRD_FORM_B64 = "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ZG9iag0xNiAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDEzLjUgMTMuNV0vUmVzb3VyY2VzPDwvRm9udDw8L1phRGIgNCAwIFI+Pj4+L0ZpbHRlci9GbGF0ZURlY29kZS9MZW5ndGggMTEzPj5zdHJlYW0NCnic0zM3NbI0UUjnMlAwUDA01jOFEEWpXGlc+iEVCk6+zlyFmJLhCnlcTiFA8ZBkEFHOZWgApKqAbJBJIUVc+lGJLkkKFnrmCiFpXIYKYAMUjPUMzIGEhaFCSC5XtIaJZmyIF5drCFcglyvQGgD0+B1MCmVuZHN0cmVhbQ0KZW5kb2JqDTE3IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTMuNSAxMy41XS9GaWx0ZXIvRmxhdGVEZWNvZGUvTGVuZ3RoIDQwPj5zdHJlYW0NCnic0zM3NbI0UUjnMlAwUDA01jOFEEWpXGlchZiC4Qp5XIFcABkyCp4KZW5kc3RyZWFtDQplbmRvYmoNMTkgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxNTIuNSAxNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjEgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAzOC41IDE4LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0yMyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDEzOS41IDEyXS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjUgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAyNjggMTRdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0yNyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDI1Ny41IDEyXS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjkgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAyNTggMTEuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTMxIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjY2LjUgMTRdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0zMyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDI2Ni41IDE0XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMzUgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAyNjYuNSAxNF0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTM3IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjY2LjUgMTRdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0zOSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExMCA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag00MSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDE3MyA4LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag00MyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDEzMS41IDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTQ1IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNNDcgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag00OSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTUxIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNNTMgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag01NSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTU3IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNNTkgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag02MSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTYzIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNNjUgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag02NyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTY5IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNNzEgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag03MyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTc1IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNNzcgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag03OSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTgxIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNODMgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag04NSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTg3IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNODkgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag05MSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDIwMSAxMi41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNOTMgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCA1NiAxMV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTk1IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgNjcuNSAxNC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNOTcgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag05OSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEwMSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEwMyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEwNSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEwNyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEwOSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTExMSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTExMyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTExNSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTExNyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTExOSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEyMSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEyMyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEyNSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEyNyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEyOSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEzMSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEzMyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEzNSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEzNyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTEzOSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE0MSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE0MyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE0NSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE0NyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE0OSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE1MSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE1MyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE1NSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE1NyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE1OSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE2MSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE2MyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE2NSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE2NyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE2OSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE3MSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTE3MyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDExIDhdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0xNzUgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA4LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0xNzcgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA4LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0xNzkgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA4LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0xODEgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA4LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0xODMgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA4LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0xODUgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA4LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0xODcgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA4LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0xODkgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMSA4XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMTkxIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMTkzIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMTk1IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMTk3IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMTk5IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjAxIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjAzIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjA1IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjA3IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjA5IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjExIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjEzIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjE1IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTEuNSA4LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0yMTcgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMiA4LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0yMTkgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCAxMi41IDguNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTIyMSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDEzIDguNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTIyMyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDEzLjUgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjI1IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTQgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjI3IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTQgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjI5IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMTQgOC41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjMxIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjMzIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjM1IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjM3IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjM5IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjQxIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjQzIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjQ1IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjQ3IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjQ5IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjUxIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjUzIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjU1IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjU3IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjU5IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjYxIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjYzIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgMjMgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjY1IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgNzAuNSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0yNjcgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCA3MC41IDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTI2OSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDcwLjUgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjcxIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgNzAuNSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0yNzMgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCA3MC41IDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTI3NSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDcwLjUgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjc3IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgNzAuNSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0yNzkgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCA3MC41IDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTI4MSAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDcwLjUgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjgzIDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgNzAuNSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0yODUgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCA3MC41IDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTI4NyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDcwLjUgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjg5IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgNzAuNSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0yOTEgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCA3MC41IDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTI5MyAwIG9iag08PC9UeXBlL1hPYmplY3QvU3VidHlwZS9Gb3JtL0JCb3hbMCAwIDcwLjUgNy41XS9MZW5ndGggMD4+c3RyZWFtDQoKZW5kc3RyZWFtDQplbmRvYmoNMjk1IDAgb2JqDTw8L1R5cGUvWE9iamVjdC9TdWJ0eXBlL0Zvcm0vQkJveFswIDAgNzAuNSA3LjVdL0xlbmd0aCAwPj5zdHJlYW0NCgplbmRzdHJlYW0NCmVuZG9iag0yOTcgMCBvYmoNPDwvVHlwZS9YT2JqZWN0L1N1YnR5cGUvRm9ybS9CQm94WzAgMCA3MC41IDcuNV0vTGVuZ3RoIDA+PnN0cmVhbQ0KCmVuZHN0cmVhbQ0KZW5kb2JqDTMwNSAwIG9iag08PC9MZW5ndGgxIDMzMzU4L0ZpbHRl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IgogICB4bXA6TWV0YWRhdGFEYXRlPSIyMDIxLTA1LTIwVDA4OjI5OjI5LTA0OjAwIgogICBkYzpmb3JtYXQ9ImltYWdlL3RpZmYiCiAgIHBob3Rvc2hvcDpDb2xvck1vZGU9IjQiCiAgIHBob3Rvc2hvcDpJQ0NQcm9maWxlPSJVLlMuIFdlYiBDb2F0ZWQgKFNXT1ApIHYyIgogICB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOmYxZDE5ZGVlLWI1ZTAtNDVlOS04Yzc5LTY1NWUxZTg4YzVmOSIKICAgeG1wTU06RG9jdW1lbnRJRD0iYWRvYmU6ZG9jaWQ6cGhvdG9zaG9wOjg3ZWQyN2ExLWZhNWQtMTA0Zi05YmY0LTM1YzcwMjg5ZGE0MiIKICAgeG1wTU06T3JpZ2luYWxEb2N1bWVudElEPSJ4bXAuZGlkOjBlYTU5MGM1LWFiYTUtNGVhMy05MDM2LTI3MzY1OGYxYjYzNSI+CiAgIDx4bXBNTTpIaXN0b3J5PgogICAgPHJkZjpTZXE+CiAgICAgPHJkZjpsaQogICAgICBzdEV2dDphY3Rpb249ImNyZWF0ZWQiCiAgICAgIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6MGVhNTkwYzUtYWJhNS00ZWEzLTkwMzYtMjczNjU4ZjFiNjM1IgogICAgICBzdEV2dDp3aGVuPSIyMDIxLTA1LTE5VDE0OjE1OjI4LTA0OjAwIgogICAgICBzdEV2dDpzb2Z0d2FyZUFnZW50PSJBZG9iZSBQaG90b3Nob3AgMjIuMyAoTWFjaW50b3NoKSIvPgogICAgIDxyZGY6bGkKICAgICAgc3RFdnQ6YWN0aW9uPSJjb252ZXJ0ZWQiCiAgICAgIHN0RXZ0OnBhcmFtZXRlcnM9ImZyb20gaW1hZ2UvcG5nIHRvIGltYWdlL3RpZmYiLz4KICAgICA8cmRmOmxpCiAgICAgIHN0RXZ0OmFjdGlvbj0ic2F2ZWQiCiAgICAgIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6ZjFkMTlkZWUtYjVlMC00NWU5LThjNzktNjU1ZTFlODhjNWY5IgogICAgICBzdEV2dDp3aGVuPSIyMDIxLTA1LTIwVDA4OjI5OjI5LTA0OjAwIgogICAgICBzdEV2dDpz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9aHTt/8BsNbmWgplbmRzdHJlYW0NCmVuZG9iag03OTYgMCBvYmoNPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDc5NSAwIFIvQWNyb0Zvcm0gMzIzIDAgUi9MYW5nKGVuLVVTKS9NZXRhZGF0YSA3OTggMCBSL01hcmtJbmZvPDwvTWFya2VkIHRydWU+Pi9TdHJ1Y3RUcmVlUm9vdCAzMjYgMCBSPj4NZW5kb2JqDTc5OCAwIG9iag08PC9UeXBlL01ldGFkYXRhL1N1YnR5cGUvWE1ML0xlbmd0aCA4OTM+PnN0cmVhbQ0KPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iRHluYVBERiA1LjAuMC43Ij4KPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKCXhtbG5zOnBkZj0iaHR0cDovL25zLmFkb2JlLmNvbS9wZGYvMS4zLyIKCXhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIKCXhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIj4KPHBkZjpQcm9kdWNlcj5SQUQgUERGIDUuNC4wLjAgLSBodHRwczovL3d3dy5yYWRwZGYuY29tPC9wZGY6UHJvZHVjZXI+CjxwZGY6VHJhcHBlZD5GYWxzZTwvcGRmOlRyYXBwZWQ+Cjx4bXA6Q3JlYXRlRGF0ZT4yMDIyLTA0LTEzVDExOjIwOjI2LTA0OjAwPC94bXA6Q3JlYXRlRGF0ZT4KPHhtcDpDcmVhdG9yVG9vbD5SQUQgUERGPC94bXA6Q3JlYXRvclRvb2w+Cjx4bXA6TWV0YWRhdGFEYXRlPjIwMjYtMDMtMzFUMDU6NTE6MDZaPC94bXA6TWV0YWRhdGFEYXRlPgo8eG1wOk1vZGlmeURhdGU+MjAyNi0wMy0zMVQwNTo1MTowNlo8L3htcDpNb2RpZnlEYXRlPgo8eG1wTU06RG9jdW1lbnRJRD51dWlkOmViYjI0OTMzLTJlNzMtMzUyZi1hNWQxLTg0ODY3ZmFiNjJjYTwveG1wTU06RG9jdW1lbnRJRD4KPHhtcE1NOlZlcnNpb25JRD4xPC94bXBNTTpWZXJzaW9uSUQ+Cjx4bXBNTTpSZW5kaXRpb25DbGFzcz5kZWZhdWx0PC94bXBNTTpSZW5kaXRpb25DbGFzcz4KPC9yZGY6RGVzY3JpcHRpb24+CjwvcmRmOlJERj4KPC94OnhtcG1ldGE+Cjw/eHBhY2tldCBlbmQ9InciPz4KZW5kc3RyZWFtDQplbmRvYmoNODAyIDAgb2JqDTw8L0ZpcnN0IDIwMzkvTiAyMjYvVHlwZS9PYmpTdG0vRmlsdGVyL0ZsYXRlRGVjb2RlL0xlbmd0aCAzMTcwPj5zdHJlYW0NCnicnVtbjx5FDn3fX9FvkAcydfGlCqFIiIiX0aKI8LSjPIzILCABE00GIf79HrvtrITE91W3tGx5Ztynq33squrTDmvdysba8B/+17da7UfaKleMvLVCGGVrxBh1a3NgHFvvE+Pc+sSlo2zUO8a6CdnPbZMJ/9E37TbSpgPXDd5Gs1G2AV8eus1m49gm7sljbrVUGLPAEMxoVpuRGQ2GYG4Tc2zFDEyyMe6KO9U2zZCtdhIYCmOYMbZKNtMJZMJ0BVdW7phfAbI9txQgS2MYQBYxA8haBwwgK5sB5FHxdJhKHWwGkCccpQB5EgwErk7cWeDXSjejwcCjSO1bq90MgoGoSEVkWzMDoW2Ir1TEtlczBgzBVOtE1AEvrcAQTBWxalzMADIzpgqIZgGQBmQhTBVP0mSYAWQlTLUBWY0ahL5Nm08Db4Vwd8ypF7AjvW692pwRml7Br4DPjgnBIBgWKDDZuwWqCwzBVHFBJ0xTOhKCwI4g1p3xuEJAZgYyZtAtbJYY3WeIG3ctlipAVvxakFtd7SlAXh+AFwLyQDrYBX1a6MhyzULHSLaCxxXQQAUpKdw2qsYXsoHAHAzaqCH8ghhRM05ZkKKgUZDn1BnI4JUI6SD4gQiXCh6ACGklAmTGFARBJ8tOESDbo4gAWSy/AUqW3IJAkBqDyFcaCK0IkIcCGSzSNJbxA01cKpgcF1AtVnHFUgs1x9VSywqg4lEEVcdd7DfIYKp2FQqALJgghtmCiVRmnyFKjy2pxerJom6TY0E5CIKFijbDShjlIMNqsZkhVnyY6vAaM2NY2eDuFvRiobNEKRY61CCS24xmiYs5G3qdZpAlXPVqR1aZYWlh5WCV0C21plOOn6bRiUdRDzo49SRgNcMCikBpMRrEDA+WwGCLiBk2b5SD2vMPMsNmgEvVimQikRQ1iNswjGpYZtif8XCKpMQPZmAxQjHj//Dn1swAOkoFBibX97/DAJ+K0CiSDH/HLC3D1S7gYgaQme1PQLbqVySlWlYqikTtCRSxViW7D/wUkVCbwUCVKBJFByKqFojZbaWs26j2FKjBUe0p8NuBtQAG2cI5fTUd3a7Ab0f39VW3QXZn1ODw8AIdS9SwicNAxtkqMGw1smIblrmKGhwWUQVVQ9meEsij+FPCQDko0gslCGTUIEYgI+hjWjBRg1j8LBIVxrBItG1WCziunBWZq8jX2ewpUYOzGctgcXaLFqI2sRZstrZOsqhjBhOVhvgBmY09FMBkoCpqcNpKrEiLaSuE4spp2YRg274BZNTgRBBhAHl04wHIA9mtqME5LeqYwZzGOyJSSzH6kO+w1NjqtvNUp8ssXKX4fS3NiMXjwLK0RHxr6UYtShGWkaO2a3Ujd9i2ZfuNLbew8LMOuwdb8Ifdgy36w+5hm4oOu4ctn1afsFBCOuwelgS2Z8KyQPnOOCxSvjUOC5XtjWVMSx+7xwSnFgNYtt/a9oiHM8v2R8sltX0Rm83411df3dze2e5Xtu99u99HiXHY+O7mzWapBvPm7c3b58env169woXf3Ly5bze3flqwv73Z2A8R5vXd49Nv97++uX+6/+np/sPPb5//+vUhLvqacU1Vcv+2X/nTlhe+/XD/+9/Q+QQ6uz8toOsJdHF/WUCfJ9DV/cc/ooOwUXeCRo+RY9QY5z7O8JvhN8Nvht/c/ewMtI89Ro5RYwy/Gn41/Gr41fCr4dfCr4Vf46VEGi3DNcpiuMijtcfjMheDjoMPd+8L4HIcfLo7L4CPw+Bc3F2vg89yHLy6+1wAP04oN3OfC4TO44Ryd/AFQudxQtmXtLlA6DxBqK9o8zqhdgY8DO4L2rxOqL0jHQa3Co0V5gr4CUKHg18n1DbZw+DTwa8Tai+BR8GlOPgCofU4oVIdfIHQepxQsQqNreAK+HFCpTv4AqH1OKFCDr5AaD1BKDv4AqHtBKHi4AuEthOEeoW2BULbCUK9QtsCoe0EoV6h7Z8Jvb0zscPPIPvBw4WNfaQYJcbwo/Cj8KPwo/Cj8OPw4/Dj8OPw4/CT8JPwk/CT8JPw0/Dbz8TXzkom3ezRMllnLVrVN+4IyGUuej2B7utCzPkyej+B7gtDv/7CYPLUcXRfGfr1FwaTuo6j+9LQr78wmGx2HN3Xhr7AKp1h1RcHWmCVzrDqqwMtsEpnWPXlgRZYpROs7js4LbBKJ1jdt3BaYJVPsLrv4bzAKp9gdd/EeYFVPsHqvovzAqt8hlWvVV5glc+w6rXKC6zKGVa9VmWBVTnDqteqLLAqZ1j1WpUFVuUEq+q1KgusyglW1WtVFljVE6yq16ousKonWFWv1QtCHI5QGjKPhsyjIfOEDCUhQ0nIUBIylIQMJSFDSchQEjKUhAwlIUNpyFAaMpSGDKUhQ2nIUBoylIYMpSFDachQup+Trx6hUsHzTy5r4XLZUnThDSIFvCPgvvSkInkJfJTj4L7y6MIbxCcV7gC4LzwLKpx8UuEOgPu6s6DCyThBqC87CyqcjOOEDl91FlQ4mccJHb7oLKhwMo8TOnzNWVDhZB4ndPiSs6DCyTxO6PAKXVDhZJ4g1Ct0QYXTcoJQr9AFFU7LCUKtQnVBhdNygtDh4NcJ1XKC0Ong1wnVcpzQWRx8gdB6nNBZHXyB0Hqc0GkVqgsqnNbjhM7u4AuE1uOETnLwBULrCULZwRcIbScIFQf/Z0Jv73TX37wHYB8lxqVvqZpCmfcXLB7hfLHWdv1grqmUHUL3XGjXD+ba9AS6J0O7fjDXT4LXEXTPhguCFwjrcZjscZjscZjscZjsceik8KPwo/Cj8KPw4/Dj8OPw4/Dj8JPwk/CT8JPwk/DT8NPw06VvqZpKmfeVrIbL87svrCmplB1C9y2oLywqqZQdQvc9qC+sKqmUHUL3TagvLCuplB1B33ehvrBR0AlW922IFlilE6zu+xAtsEonWN03IlpglU6wuu9EtMAqn2HVFx9aYJXPsOq1ygus8hlWvVZ5gVU+w6rXKi+wymdY9VrlBVblOKuteK3yAqtynNVWvFZlgVU5zmorXquywKocZ7UVr1VZYFWOs9qK16ossKpnWPValQVW9QyrXqu6wKqeYdVrVRdY1TOseq1eULxuvQVyx71wIrnTUA11F6/eOeyqTNmKF/WFrrh0rOWK4623Yl6dr7dpRrTG6oGzVa/fcUFN9VbPlbt/4mqsvJ6Q390r8IKYdeutpJfv3t3r02F7rFC0390rdFyMfCpKl+/+SbDSuZKn+929gi8oVt/98dvHu+L9sJZ+r17d9WgB6PEK0OPo3ePo3eOTfI8jeI8+2R56eA89vO/ZtvXQw3vo4X0EfujifecUY+CHLt5n4IY+3mf4zcANfZx2UQljj5FjlBhjPj3HuD5eXXq8qvRoaejRwtDjlaVHy0Ln/HvMWzI++zypxjxCf6ca94+2T4p3X9pfCO3fW8SY7arRbxzxie7JbHTMnsRsH8xOv2zKy/65bHXLrrRsIMter2zLyg6qbHbKvqRsIcpun2zMyR6abHfJzpSNoi+a4pWQolWEstUj/h7af8r0qain+J06dUrKqf6mUJuaasqfqVSmqJj6X0p1qaqlAJZaVcpKqQClWJO6SkogG8fzcbTKcPDF0SrDUSccrTIcecXx/BytMhx5xdEqw9Eqw5FnHK0yHPnF0SrDET+OVhmOPONoleFoleFoleGoS4p6pchfCnyK6yh2HIq6pKhLinqk+E5FUY8U9UhRhxTfqSi+U1HUIcd3Ko465KhDjvrj+E7F8Z2Ko044vlNxfKfiaJfmqBuOdmnK54t6pYgjRR1G70926WQ/TXa+ZI9KdpNk30d2aGQvRXY9ZH9CdhLkN//8Op/f0fOLd36bzq/I+b03v8zmN9T82pnfJfMfCmRLfzbfZ5u8/TOqeN4cg8eUUCI+IWOl4JTSUGoeqU6kjpBv/Plunm/R+b6bb6b5Dplve/lelm9Q+a6TbyX5/pAn/TyT5+k5z7l5Is2zY57y8jy2/e1klCcPrDPx95Fj+O3rxDtsaj/89eEBu+ZPDx9vvnn84/fnrd7c/vL+450H/t2+QT493D//8vj76/vnh89ff4mXAJyla68VlnxR6LNSPntx8+bp8f0fPz48ff7916+3N6+/3fglvSwvy/bF9vPz84ePX97c/Pnnny+f7t9/eP/flz8+/vZiB378dMWLmx+wM394eH/z7f2vHx9u/v34/v+3lIJNtjDXIv958erV/wC4mgmLCmVuZHN0cmVhbQ0KZW5kb2JqDTc5OSAwIG9iag08PC9UeXBlL1hSZWYvU2l6ZSA4MDMvUm9vdCA3OTYgMCBSL0luZm8gNzk3IDAgUi9JRFs8RjgzRkM5RTY5OTdBRjI0RTk1RDExQTA3ODA1RUFCODQ+PEY4M0ZDOUU2OTk3QUYyNEU5NUQxMUEwNzgwNUVBQjg0Pl0vV1sxIDMgMV0vRmlsdGVyL0ZsYXRlRGVjb2RlL0xlbmd0aCAxNzg3Pj5zdHJlYW0NCnicJdZllJVVGIbhvekaBhi6z0MM3UMM0iAgkkqHiqB0I4J0p9iCAahgoiiIil2glIWFCoKBCTZKLt/7/ebHtZ4TP+Y759v3OiHYX46Qs7ITYwhFfOWw9VeIIXY3cvT053LaOmEPc+4zcmUauev4C7ls7bGHeZ4y8qYZ+Yr7C7ltbfOVJ4b86b7y2prgK5+tA77yx1Cghq8Ctpb6KmjrO1+FYijY3learU2+Ctu66Cs9hkJDfBWxtctX0RjSSvoqZmu6rwxbH/oqHkPhur5K2Frhq6St732ViiG9na/Stu73VcbWGV9lYyjS11c5W8/4Kh9D0TRfFWyN9lXR1m5flWIolvJV2dYcXylbh30phowsX1Vs3eqrqq2TvqrFULyrr+q2tvjKjMH+bVYNW0N91bSVXHmtGEqW8lXb1hRfdWwlV143hlLJldezlVx5fVsnfDWIoXQHXw1tJZ9zI1sXfDWOocwgX01sPe8rK4ayyTfd1NZkX81sveereQzlavtqYWu5r2xbyefcMobyybd6ia2NvlrZOu+rdQwVBvpqY+s5X21jqJjhq52tSb7a2zroq0MMlWr56mhrma9OtpJ76NIYKiffamdbG3x1sXXOV9cYUgN8XWZrp69uMaiYr8ttTfTV3VZyx/aIoUpNXz1tJXdsL1vf+uodQ9W2vvrYSu6hK2z95+vKGKol91BfW9t99YuhenI++tsa52uArb2+BsaQWd3XIFuLfA22ddTXkBhqtPQ11NY6X8Ns/ePrqhhq9vF1ta3kNF4TQ61CvobbSu7Ya23t8TUihtpVfI20Nd/XdbaO+Lo+hjrZvkbZWu9rtK3TvsbEUDe5trG2kmsbF0O9or7G20rO/gRb+31NjKF+cvYn2Vria7Ktb3xNiaFBG19Tbd3na5qt5DROj6FhP1832Nrha0YMjZKG3WhrvK+Ztvb5mhVD40xfN9la7Gu2reO+5sTQpLWvubbu9TXPVvK9zY8hK7m2Bbae9bUwhqbJPbnIVnLeFttKztuSGJo18LXU1lpfy2yd8rU8hubdfa2wtdXXyhhaFPS1ytYYX6ttJffBmhiyk8/qZlvJPb7WVnJ+b4mhZSdft8JtcDvcAXfCXXC3vW+zRXqCB9TblLLyr8+y5x7o7A9zQE6wtj+4w17Y7ucolRss5js7hBgzzholoE8XY2BTf0teyAf5oQAUhEKQBoUhHYpAUSgGGVAcSkBJKAWloQyUhXJQHipARagElSEFgipQFapBdciEGlATakFtqAN1oR7UhwbQEBpBY2gCWdAUmkFzaAHZ0BIugVbQGtpAW2gH7aEDdIROcCl0hi7QFS6DbnA5dIce0BN6QW/oA1fAldAX+kF/GAADYRAMhiEwFIbBVXA1XAPD4VoYASPhOrgeRsFoGANjYRyMhwkwESbBZJgCU2EaTIcbYAbcCDNhFtwEs2EOzIV5MB8WwEJYBIthCSyFZbAcVsBKWAWrYQ3cDGvhFuC4pDguKY5LiuOS4rikOC6pu2EdrId74F64D+6HDbARNsED8CA8BJthCzwMj8Cj8Bg8Dk/AVngSnoJt8DQ8A9thBzwLO+E5eB5egF3wIrwEL8Mr8Cq8Bq/DG/AmvAVvw27YA+/Au7AX9sF+OAAH4T14Hz6AD+EjOAQfwyfwKXwGn8Nh+AK+hK/gCByFr+EYHIdv4Fv4Dr6HE/AD/Ag/wc/wC/wKJ+EU/Aa/wx/wJ/wFf8M/cBr+hf/gDJyFc3AeLsBFQ8RNEaijqKNyAU1UHiB9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9In0ifSJ9OhbjmxU8MsdtbbUfVIda2w+vydm2nuTn1p4Z4X+dtd5FCmVuZHN0cmVhbQ0KZW5kb2JqDXN0YXJ0eHJlZg0xMTk2MTQNJSVFT0YN";

async function drdDownloadPDF() {
  var btn = document.getElementById('drd-pdf-btn');
  if(btn){ btn.textContent='⏳ Generating...'; btn.disabled=true; }
  try {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;

    // Load the fillable DRD form
    var pdfBytes = Uint8Array.from(atob(DRD_FORM_B64), function(c){ return c.charCodeAt(0); });
    var pdfDoc = await PDFDocument.load(pdfBytes);
    var form = pdfDoc.getForm();

    // ── Helper: safely set a form text field ──
    function setField(name, value) {
      try {
        if(!value && value !== 0) return;
        var field = form.getTextField(name);
        field.setText(String(value));
      } catch(e) { /* field not found, skip */ }
    }

    // ── Helper: safely check a checkbox ──
    function checkBox(name) {
      try { form.getCheckBox(name).check(); } catch(e) { /* skip */ }
    }

    // ── Donation Source checkboxes ──
    if(document.getElementById('drd-src-fb').checked) checkBox('Untitled1');
    if(document.getElementById('drd-src-jj').checked) checkBox('Untitled2');
    if(document.getElementById('drd-src-rp').checked) checkBox('Untitled3');

    // ── Header fields ──
    setField('Untitled4', document.getElementById('drd-opp').value.trim());
    setField('Untitled5', document.getElementById('drd-tax').value);
    setField('Untitled6', document.getElementById('drd-date').value);

    // ── Donor information ──
    // Untitled7=Name, Untitled9=Addr line1, Untitled8=Addr line2 (skip),
    // Untitled11=City, Untitled10=Postal, Untitled12=Email, Untitled13=Phone
    setField('Untitled7',  document.getElementById('drd-name').value.trim());
    setField('Untitled9',  document.getElementById('drd-addr').value.trim());
    setField('Untitled11', document.getElementById('drd-city').value.trim());
    setField('Untitled10', document.getElementById('drd-postal').value.trim());
    setField('Untitled12', document.getElementById('drd-email').value.trim());
    setField('Untitled13', document.getElementById('drd-phone').value.trim());
    setField('Untitled16', document.getElementById('drd-contact').value.trim());
    setField('Untitled15', document.getElementById('drd-contact-info').value.trim());

    // ── Item quantities — mapped to PDF field names by column ──
    // Column 1 (items 0-22): Untitled18-Untitled40
    // Column 2 (items 23-45): Untitled90,89,88,...,69,45
    // Column 3 (items 46-68): Untitled68,67,66,...,47,46
    // Column 4 (items 69-72): Untitled91-94
    var QTY_FIELDS = [
      // Column 1: items 0-22
      'Untitled18','Untitled19','Untitled20','Untitled21','Untitled22',
      'Untitled23','Untitled24','Untitled25','Untitled26','Untitled27',
      'Untitled28','Untitled29','Untitled30','Untitled31','Untitled32',
      'Untitled33','Untitled34','Untitled35','Untitled36','Untitled37',
      'Untitled38','Untitled39','Untitled40',
      // Column 2: items 23-45
      'Untitled90','Untitled89','Untitled88','Untitled87','Untitled86',
      'Untitled85','Untitled84','Untitled83','Untitled82','Untitled81',
      'Untitled80','Untitled79','Untitled78','Untitled77','Untitled76',
      'Untitled75','Untitled74','Untitled73','Untitled72','Untitled71',
      'Untitled70','Untitled69','Untitled45',
      // Column 3: items 46-68
      'Untitled68','Untitled67','Untitled66','Untitled65','Untitled64',
      'Untitled63','Untitled62','Untitled61','Untitled60','Untitled59',
      'Untitled58','Untitled57','Untitled56','Untitled55','Untitled54',
      'Untitled53','Untitled52','Untitled51','Untitled50','Untitled49',
      'Untitled48','Untitled47','Untitled46',
      // Column 4: items 69-72
      'Untitled91','Untitled92','Untitled93','Untitled94'
    ];

    for(var i = 0; i < DRD_ITEMS.length && i < QTY_FIELDS.length; i++) {
      var el = document.getElementById('drd-qty-' + i);
      var qty = el ? (parseInt(el.value) || 0) : 0;
      if(qty > 0) setField(QTY_FIELDS[i], String(qty));
    }

    // ── Other Items (custom rows) ──
    // Other Items name fields: Untitled130-146, qty fields: Untitled95+
    var OTHER_NAME_FIELDS = [
      'Untitled130','Untitled131','Untitled132','Untitled133','Untitled134',
      'Untitled135','Untitled136','Untitled137','Untitled138','Untitled139',
      'Untitled140','Untitled141','Untitled142','Untitled143','Untitled144',
      'Untitled145','Untitled146'
    ];
    var OTHER_QTY_FIELDS = [
      'Untitled95','Untitled96','Untitled97','Untitled98','Untitled99',
      'Untitled100','Untitled101','Untitled102','Untitled103','Untitled104',
      'Untitled105','Untitled106','Untitled107','Untitled108','Untitled109',
      'Untitled110','Untitled111'
    ];
    var otherNames = document.querySelectorAll('#drd-other-rows .drd-other-name');
    var otherQtys  = document.querySelectorAll('#drd-other-rows .drd-other-qty');
    var oi = 0;
    for(var j = 0; j < otherNames.length && oi < OTHER_NAME_FIELDS.length; j++) {
      var oName = otherNames[j].value.trim();
      var oQty  = otherQtys[j] ? (parseInt(otherQtys[j].value) || 0) : 0;
      if(oName || oQty > 0) {
        setField(OTHER_NAME_FIELDS[oi], oName);
        if(oQty > 0) setField(OTHER_QTY_FIELDS[oi], String(oQty));
        oi++;
      }
    }

    // ── Footer ──
    var emailedDate = document.getElementById('drd-emailed-date').value;
    var numItems    = document.getElementById('drd-total-items').textContent;
    var giftAmt     = document.getElementById('drd-total-value').textContent.replace('$','');
    setField('Untitled41', emailedDate);
    setField('Untitled42', numItems);
    setField('Untitled43', giftAmt);

    // ── Flatten so it prints cleanly ──
    form.flatten();

    // ── Open in new tab ──
    var outBytes = await pdfDoc.save();
    var blob = new Blob([outBytes], {type:'application/pdf'});
    var url  = URL.createObjectURL(blob);
    window.open(url, '_blank');

    var ed = document.getElementById('drd-emailed-date');
    if(ed && !ed.value) ed.value = todayStr();
    toast('✅ DRD PDF generated!');

  } catch(err) {
    toast('⚠ PDF error: ' + err.message);
    console.error(err);
  } finally {
    if(btn){ btn.textContent='⬇️ Download Filled PDF'; btn.disabled=false; }
  }
}


// ─── VEHICLES ───
var editVehicleId=null;
function nextVid(){return 'VEH-'+String(Math.floor(Math.random()*90000)+10000);}

function openAddVehicle(){
  editVehicleId=null;
  document.getElementById('vehicle-modal-ttl').textContent='Add Vehicle';
  document.getElementById('vehicle-save-btn').textContent='Add Vehicle';
  document.getElementById('v-name').value='';
  document.getElementById('v-type').value='Bin Truck';
  document.getElementById('v-notes').value='';
  document.getElementById('v-sticker-month').value='';
  document.getElementById('v-sticker-year').value='';
  document.getElementById('v-oil-date').value='';
  document.getElementById('v-oil-km').value='';
  document.getElementById('v-oil-interval').value='';
  document.getElementById('v-color').value='#dc3545';
  document.querySelectorAll('.veh-color-opt').forEach(function(o){o.classList.remove('selected');if(o.getAttribute('data-color')==='#dc3545')o.classList.add('selected');});
  clearErr('v-name');
  document.getElementById('vehicle-modal').style.display='flex';
}
function openEditVehicle(vid){
  var v=vehicles.find(function(x){return x.vid===vid;});if(!v)return;
  editVehicleId=vid;
  document.getElementById('vehicle-modal-ttl').textContent='Edit Vehicle';
  document.getElementById('vehicle-save-btn').textContent='Save Changes';
  document.getElementById('v-name').value=v.name||'';
  document.getElementById('v-type').value=v.type||'Bin Truck';
  document.getElementById('v-notes').value=v.notes||'';
  document.getElementById('v-sticker-month').value=v.stickerMonth||'';
  document.getElementById('v-sticker-year').value=v.stickerYear||'';
  document.getElementById('v-oil-date').value=v.oilDate||'';
  document.getElementById('v-oil-km').value=v.oilKm||'';
  document.getElementById('v-oil-interval').value=v.oilInterval||'';
  document.getElementById('v-color').value=v.color||'#dc3545';
  document.querySelectorAll('.veh-color-opt').forEach(function(o){o.classList.remove('selected');if(o.getAttribute('data-color')===(v.color||'#dc3545'))o.classList.add('selected');});
  document.getElementById('vehicle-modal').style.display='flex';
}
function selectVehColor(c,el){
  document.getElementById('v-color').value=c;
  document.querySelectorAll('.veh-color-opt').forEach(function(o){o.classList.remove('selected');});
  el.classList.add('selected');
}
function saveVehicle(){
  var name=document.getElementById('v-name').value.trim();
  if(!name){showErr('v-name');return;}
  var v={vid:editVehicleId||nextVid(),name:name,type:document.getElementById('v-type').value,notes:document.getElementById('v-notes').value.trim(),color:document.getElementById('v-color').value,stickerMonth:document.getElementById('v-sticker-month').value,stickerYear:document.getElementById('v-sticker-year').value.trim(),oilDate:document.getElementById('v-oil-date').value||'',oilKm:document.getElementById('v-oil-km').value.trim()||'',oilInterval:document.getElementById('v-oil-interval').value.trim()||'',active:true};
  if(editVehicleId){vehicles=vehicles.map(function(x){return x.vid===editVehicleId?v:x;});}
  else{vehicles.push(v);if(!vehBlocks[v.vid])vehBlocks[v.vid]={};}
  saveVehicles();renderVehicles();
  document.getElementById('vehicle-modal').style.display='none';
  toast(editVehicleId?'Vehicle updated!':'Vehicle added!');
}
function delVehicle(vid){
  if(!confirm('Delete this vehicle? All blocked dates will be removed.'))return;
  vehicles=vehicles.filter(function(v){return v.vid!==vid;});
  delete vehBlocks[vid];
  saveVehicles();renderVehicles();
  // Remove from Supabase
  try { db.from('vehicles').delete().eq('vid',vid).then(function(r){ if(r.error) console.warn('Vehicle delete sync failed:',r.error.message); }); } catch(e){}
  try { db.from('vehicle_blocks').delete().eq('vid',vid).then(function(r){ if(r.error) console.warn('Vehicle blocks delete failed:',r.error.message); }); } catch(e){}
  toast('Vehicle removed.');
}

// Add a range of blocked dates to a vehicle
function addVehDateRange(vid){
  var fromEl=document.getElementById('veh-from-'+vid);
  var toEl=document.getElementById('veh-to-'+vid);
  var reasonEl=document.getElementById('veh-reason-'+vid);
  var notesEl=document.getElementById('veh-notes-'+vid);
  var from=fromEl?fromEl.value:'';
  var to=toEl?toEl.value:'';
  if(!from){
    if(fromEl){fromEl.style.borderColor='#dc3545';fromEl.focus();}
    toast('⚠ Please select a start date first.');return;
  }
  if(fromEl)fromEl.style.borderColor='';
  if(to&&to<from){
    if(toEl){toEl.style.borderColor='#dc3545';toEl.focus();}
    toast('⚠ End date can\'t be before the start date.');return;
  }
  if(toEl)toEl.style.borderColor='';
  if(!vehBlocks[vid])vehBlocks[vid]={};
  var reason=reasonEl?reasonEl.value:'Service / Repair';
  var notes=notesEl?notesEl.value.trim():'';
  var openEnded=!to;
  if(!to)to=todayStr();
  var cur=new Date(from+'T12:00:00');
  var end=new Date(to+'T12:00:00');
  var count=0;
  while(cur<=end){
    var ds=cur.toISOString().split('T')[0];
    vehBlocks[vid][ds]={reason:reason,notes:notes,openEnded:openEnded,openFrom:openEnded?from:undefined};
    cur.setDate(cur.getDate()+1);count++;
  }
  saveVehBlocks(vid);renderVehicles();
  toast(count+' day'+(count!==1?'s':'')+' blocked'+(openEnded?' (ongoing until manually ended)':'')+' for vehicle.');
}
function removeVehBlock(vid,date){
  if(!vehBlocks[vid])return;
  delete vehBlocks[vid][date];
  saveVehBlocks(vid);renderVehicles();
}

function renderVehicles(){
  var el=document.getElementById('vehicles-list');
  if(!el)return;
  var sub=document.getElementById('vehicles-sub');
  if(!vehicles.length){
    el.innerHTML='<div class="empty-state" style="grid-column:1/-1"><div class="ei">🚛</div><h3>No vehicles yet</h3><p>Add your trucks and vans to track availability</p></div>';
    if(sub)sub.textContent='No vehicles added yet';
    return;
  }
  if(sub)sub.textContent=vehicles.length+' vehicle'+(vehicles.length!==1?'s':'')+' · blocked days show on the main Calendar tab';
  var today=todayStr();
  el.innerHTML=vehicles.map(function(v){
    var blocks=vehBlocks[v.vid]||{};
    var allDates=Object.keys(blocks).sort();
    var upcoming=allDates.filter(function(d){return d>=today;});
    var past=allDates.filter(function(d){return d<today;});
    var upcomingRows=upcoming.map(function(d){
      var b=blocks[d];
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-radius:6px;background:rgba(220,53,69,.07);margin-bottom:3px">'
        +'<div><span style="font-weight:600;font-size:13px">'+fd(d)+'</span><span style="font-size:11px;color:var(--muted);margin-left:8px">'+b.reason+(b.notes?' — '+b.notes:'')+'</span></div>'
        +'<button onclick="removeVehBlock(\''+v.vid+'\',\''+d+'\')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 4px;line-height:1" title="Remove">✕</button>'
        +'</div>';
    }).join('');
    return '<div class="veh-card" style="--vcolor:'+v.color+'">'
      // Header
      +'<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">'
      +'<div>'
      +'<div class="veh-card-name" style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+v.color+'"></span>'+v.name+'</div>'
      +'<div class="veh-card-type">'+v.type+(v.notes?' · '+v.notes:'')+'</div>'
      +(v.stickerMonth&&v.stickerYear?'<div style="font-size:11px;color:var(--muted);margin-bottom:4px">🟡 Sticker expires: '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(v.stickerMonth,10)-1]+' '+v.stickerYear+'</div>':'')
      +(function(){
          if(!v.oilDate) return '';
          var oilD = new Date(v.oilDate+'T12:00:00');
          var today2 = new Date();
          var daysSince = Math.floor((today2-oilD)/(1000*60*60*24));
          var kmInfo = v.oilKm ? ' · at '+parseInt(v.oilKm).toLocaleString()+' km' : '';
          var intInfo = v.oilInterval ? ' · next at '+(parseInt(v.oilKm||0)+parseInt(v.oilInterval)).toLocaleString()+' km' : '';
          var urgency = daysSince > 180 ? '#dc3545' : daysSince > 90 ? '#e67e22' : '#22c55e';
          var icon = daysSince > 180 ? '🔴' : daysSince > 90 ? '🟡' : '🟢';
          return '<div style="font-size:11px;color:'+urgency+';margin-bottom:4px;font-weight:600">'+icon+' Oil changed: '+fd(v.oilDate)+' ('+daysSince+'d ago'+kmInfo+')'+intInfo+'</div>';
        })()
      +'</div>'
      +'<div style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" onclick="openEditVehicle(\''+v.vid+'\')">✏️</button><button class="btn btn-danger btn-sm" onclick="delVehicle(\''+v.vid+'\')">🗑️</button></div>'
      +'</div>'
      // Maintenance schedules section
      +'<div id="maint-section-'+v.vid+'" style="margin-bottom:12px"></div>'
      // Stats
      +'<div style="display:flex;gap:20px;margin-bottom:14px">'
      +'<div><div style="font-family:\'Bebas Neue\',sans-serif;font-size:26px;color:'+v.color+'">'+upcoming.length+'</div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px">Upcoming</div></div>'
      +'<div><div style="font-family:\'Bebas Neue\',sans-serif;font-size:26px;color:var(--muted)">'+past.length+'</div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px">Past Blocks</div></div>'
      +'</div>'
      // Upcoming blocked days list
      +(upcoming.length
        ?'<div style="margin-bottom:12px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:6px">🚫 Blocked Days</div>'+upcomingRows+'</div>'
        :'<div style="font-size:12px;color:var(--muted);margin-bottom:12px">No upcoming blocked days.</div>'
      )
      // Add dates form
      +'<div style="border-top:1px solid var(--border);padding-top:12px">'
      +'<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:8px">Add Days Off</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">'
      +'<div><div style="font-size:10px;color:var(--muted);margin-bottom:2px">From</div><input type="date" id="veh-from-'+v.vid+'" class="bin-date-picker" style="width:100%"></div>'
      +'<div><div style="font-size:10px;color:var(--muted);margin-bottom:2px">To</div><input type="date" id="veh-to-'+v.vid+'" class="bin-date-picker" style="width:100%"></div>'
      +'</div>'
      +'<select id="veh-reason-'+v.vid+'" class="form-input" style="margin-bottom:6px;font-size:12px;padding:6px 10px">'
      +'<option>Service / Repair</option><option>Personal Use</option><option>Out of Area</option><option>Other</option>'
      +'</select>'
      +'<input type="text" id="veh-notes-'+v.vid+'" placeholder="Notes (optional)" class="form-input" style="font-size:12px;padding:6px 10px;margin-bottom:8px">'
      +'<button class="btn btn-primary" style="width:100%;font-size:13px" onclick="addVehDateRange(\''+v.vid+'\')">+ Block These Days</button>'
      +'</div>'
      +'</div>';
  }).join('');
}

// ── Maintenance Schedules ──
var _maintCache={};
async function loadMaintenanceForVehicles(){
  var res=await db.from('maintenance_schedules').select('*');
  _maintCache={};
  (res.data||[]).forEach(function(r){
    if(!_maintCache[r.vid])_maintCache[r.vid]=[];
    _maintCache[r.vid].push(r);
  });
  // Also load odometer readings
  var oRes=await db.from('vehicle_odometers').select('*');
  window._odometerCache={};
  (oRes.data||[]).forEach(function(r){window._odometerCache[r.vid]=r;});
}

function renderMaintSections(){
  vehicles.forEach(function(v){
    var el=document.getElementById('maint-section-'+v.vid);
    if(!el)return;
    var scheds=_maintCache[v.vid]||[];
    var odo=window._odometerCache&&window._odometerCache[v.vid];
    var odoKm=odo?odo.odometer_km:null;

    var html='<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:8px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
      +'<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--muted)">🔧 Maintenance</div>'
      +(odoKm!==null?'<div style="font-size:11px;color:var(--muted)">Odometer: <strong style="color:var(--text)">'+odoKm.toLocaleString()+' km</strong></div>':'')
      +'</div>';

    if(scheds.length){
      html+=scheds.map(function(s){
        var statusColor=s.status==='overdue'?'#dc3545':s.status==='due'?'#e67e22':'#22c55e';
        var statusIcon=s.status==='overdue'?'🔴':s.status==='due'?'🟡':'🟢';
        var kmLeft=s.next_due_km&&odoKm!==null?(s.next_due_km-odoKm):null;
        var kmText=kmLeft!==null?(kmLeft>0?kmLeft.toLocaleString()+' km remaining':'OVERDUE by '+Math.abs(kmLeft).toLocaleString()+' km'):'';
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-radius:6px;background:'+statusColor+'0d;border-left:3px solid '+statusColor+';margin-bottom:4px">'
          +'<div>'
          +'<span style="font-size:12px;font-weight:600">'+statusIcon+' '+s.maintenance_type+'</span>'
          +'<span style="font-size:11px;color:var(--muted);margin-left:8px">every '+s.interval_km.toLocaleString()+' km</span>'
          +(kmText?'<div style="font-size:11px;color:'+statusColor+';font-weight:600;margin-top:1px">'+kmText+'</div>':'')
          +(s.last_service_date?'<div style="font-size:10px;color:var(--muted)">Last: '+fd(s.last_service_date)+' at '+(s.last_service_km||0).toLocaleString()+' km</div>':'')
          +'</div>'
          +'<div style="display:flex;gap:4px">'
          +'<button class="btn btn-ghost btn-sm" onclick="markMaintDone(\''+s.id+'\',\''+v.vid+'\')" style="font-size:10px;padding:2px 8px;color:#22c55e" title="Mark as serviced">✅ Done</button>'
          +'<button onclick="delMaintSchedule(\''+s.id+'\',\''+v.vid+'\')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0 4px" title="Remove">✕</button>'
          +'</div></div>';
      }).join('');
    } else {
      html+='<div style="font-size:12px;color:var(--muted);margin-bottom:6px">No maintenance schedules set up.</div>';
    }

    // Add maintenance form
    html+='<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:flex-end">'
      +'<select id="maint-type-'+v.vid+'" style="flex:1;min-width:120px;font-size:12px;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-family:\'DM Sans\',sans-serif">'
      +'<option>Oil Change</option><option>Tire Rotation</option><option>Brake Inspection</option><option>Transmission Fluid</option><option>Air Filter</option><option>Custom</option>'
      +'</select>'
      +'<input type="number" id="maint-km-'+v.vid+'" placeholder="Interval (km)" style="width:110px;font-size:12px;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-family:\'DM Sans\',sans-serif">'
      +'<button class="btn btn-primary" style="font-size:12px;padding:5px 12px" onclick="addMaintSchedule(\''+v.vid+'\')">+ Add</button>'
      +'</div></div>';

    el.innerHTML=html;
  });
}

async function addMaintSchedule(vid){
  var typeEl=document.getElementById('maint-type-'+vid);
  var kmEl=document.getElementById('maint-km-'+vid);
  var type=typeEl?typeEl.value:'';
  var km=kmEl?parseInt(kmEl.value):0;
  if(!km||km<100){toast('⚠ Enter a valid km interval (at least 100 km)','warn');return;}
  if(type==='Custom'){type=prompt('Enter maintenance type name:');if(!type)return;}
  var odo=window._odometerCache&&window._odometerCache[vid];
  var currentKm=odo?odo.odometer_km:0;
  var row={vid:vid,maintenance_type:type,interval_km:km,last_service_km:currentKm,last_service_date:todayStr(),next_due_km:currentKm+km,status:'ok'};
  var res=await db.from('maintenance_schedules').insert(row).select();
  if(res.error){toast('⚠ Error: '+res.error.message,'error');return;}
  if(!_maintCache[vid])_maintCache[vid]=[];
  _maintCache[vid].push(res.data[0]);
  renderMaintSections();
  toast('Maintenance schedule added!');
}

async function markMaintDone(schedId,vid){
  var odo=window._odometerCache&&window._odometerCache[vid];
  var currentKm=odo?odo.odometer_km:0;
  if(!currentKm){var input=prompt('Enter current odometer reading (km):');if(!input)return;currentKm=parseInt(input)||0;}
  var today=todayStr();
  await db.from('maintenance_schedules').update({last_service_km:currentKm,last_service_date:today,next_due_km:currentKm+(_maintCache[vid]||[]).find(function(s){return s.id===schedId;}).interval_km,status:'ok',updated_at:new Date().toISOString()}).eq('id',schedId);
  // Update local cache
  (_maintCache[vid]||[]).forEach(function(s){if(s.id===schedId){s.last_service_km=currentKm;s.last_service_date=today;s.status='ok';s.next_due_km=currentKm+s.interval_km;}});
  renderMaintSections();
  toast('Service marked complete!');
}

async function delMaintSchedule(schedId,vid){
  if(!confirm('Remove this maintenance schedule?'))return;
  await db.from('maintenance_schedules').delete().eq('id',schedId);
  _maintCache[vid]=(_maintCache[vid]||[]).filter(function(s){return s.id!==schedId;});
  renderMaintSections();
  toast('Maintenance schedule removed.');
}

// Check if a vehicle type is available on a given date
function checkVehicleAvailability(serviceType, dateStr){
  var required=null;
  if(serviceType==='Furniture Pickup'||serviceType==='Furniture Delivery')required='Furniture Truck';
  else if(serviceType==='Bin Rental')required='Bin Truck';
  else if(serviceType==='Junk Removal')required='Junk Truck';
  if(!required)return {ok:true};
  var matching=vehicles.filter(function(v){return v.type===required;});
  if(!matching.length)return {ok:true};
  var allBlocked=matching.every(function(v){
    if(vehBlocks[v.vid]&&vehBlocks[v.vid][dateStr])return true;
    return false;
  });
  if(allBlocked){
    var reasons=matching.map(function(v){
      var b=vehBlocks[v.vid]&&vehBlocks[v.vid][dateStr];
      if(b)return v.name+(b.reason?' ('+b.reason+')':'');
      return v.name;
    }).join(', ');
    return {ok:false,msg:'⚠️ No '+required+' available on '+fd(dateStr)+'!\n'+reasons+'\n\nProceed anyway?'};
  }
  return {ok:true};
}

document.addEventListener('DOMContentLoaded', function() {
  _initStaticAddressAutocomplete();
});

// ─── AI ADVISOR ───────────────────────────────────────────────────
var _advisorHasRun = false;
function renderAdvisor(){
  if(!_advisorHasRun){ _advisorHasRun=true; runAdvisor(); }
}
function advisorShowState(state){
  ['idle','loading','results','error'].forEach(function(s){
    var el=document.getElementById('advisor-'+s);
    if(el) el.style.display=(s===state)?'block':'none';
  });
}
function advisorProgress(pct,msg){
  var bar=document.getElementById('advisor-progress-bar');
  var lbl=document.getElementById('advisor-loading-msg');
  if(bar) bar.style.width=pct+'%';
  if(lbl&&msg) lbl.textContent=msg;
}
async function runAdvisor(){
  advisorShowState('loading');
  advisorProgress(10,'Connecting to database...');
  try{
    advisorProgress(30,'Pulling business data...');
    var rpcRes = await db.rpc('get_advisor_data');
    if(rpcRes.error) throw new Error('DB error: '+rpcRes.error.message);
    var d = rpcRes.data;

    advisorProgress(60,'Crunching numbers...');

    var monthly = d.monthly || [];
    var yoy = d.yoy || [];
    var cities = d.cities || [];
    var binDemand = d.bin_demand || [];
    var binDuration = d.bin_duration || [];
    var fleet = d.fleet || [];
    var repeat = d.repeat || {};
    var totalJobs = d.total_jobs || 0;
    var yoyGrowth = d.yoy_growth || {};
    var thisMonth = d.this_month || {};

    var yoyPct = yoyGrowth.prev12 ? Math.round((yoyGrowth.last12 - yoyGrowth.prev12) / yoyGrowth.prev12 * 100) : 0;
    var repeatRate = repeat.total_clients ? Math.round(repeat.repeat_clients / repeat.total_clients * 100) : 0;
    var avgGap = repeat.avg_gap_days || 0;

    var totalDemand = binDemand.reduce(function(a,b){return a+b.rentals;},0) || 1;
    var demandMap = {};
    binDemand.forEach(function(b){ demandMap[b.bin_size] = b.rentals; });

    var durMap = {};
    binDuration.forEach(function(b){ durMap[b.bin_size] = b.avg_days; });

    var fleetMap = {};
    fleet.forEach(function(f){ fleetMap[f.size] = f; });

    var mNames = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var avgByMo = {};
    yoy.forEach(function(row){
      avgByMo[row.mo] = Math.round(((row.y2023||0)+(row.y2024||0)+(row.y2025||0))/3);
    });
    var curMo = new Date().getMonth()+1;
    var nextMo = curMo===12?1:curMo+1;
    var nextMonthAvg = avgByMo[nextMo]||0;
    var curMonthAvg = avgByMo[curMo]||0;
    var slowMonths = Object.keys(avgByMo).map(Number).filter(function(m){return avgByMo[m]<110;}).sort(function(a,b){return avgByMo[a]-avgByMo[b];});
    var peakMonths = Object.keys(avgByMo).map(Number).filter(function(m){return avgByMo[m]>230;}).sort(function(a,b){return avgByMo[b]-avgByMo[a];});

    var curCount = thisMonth.current || 0;
    var lastYearCount = thisMonth.last_year || 0;
    var monthVsLY = lastYearCount ? Math.round((curCount - lastYearCount) / lastYearCount * 100) : 0;

    var junkOpCities = cities.filter(function(c){
      return c.total >= 30 && c.bin > 20 && c.city !== 'Barrie' && (c.junk/c.total) < 0.10;
    }).slice(0,4);
    var growthCities = cities.filter(function(c){
      return c.total >= 50 && c.city !== 'Barrie' && c.city !== 'Innisfil';
    }).slice(0,5);

    var f14 = fleetMap['14 yard'] || {};
    var f20 = fleetMap['20 yard'] || {};
    var demand14pct = Math.round((demandMap['14 yard']||0)/totalDemand*100);
    var demand20pct = Math.round((demandMap['20 yard']||0)/totalDemand*100);
    var dur20 = durMap['20 yard'] || 0;
    var dur14 = durMap['14 yard'] || 0;

    advisorProgress(80,'Building recommendations...');

    var recs = [];

    // YoY growth/decline
    if(yoyPct >= 10){
      recs.push({category:'OPERATIONS',priority:'LOW',status:'positive',
        title:'Business Growing '+yoyPct+'% Year Over Year',
        detail:'Job volume is up '+yoyPct+'% compared to the prior 12 months ('+yoyGrowth.last12+' vs '+yoyGrowth.prev12+' jobs). Growth is being driven primarily by bin rentals. The business is in a healthy expansion phase.',
        action:'Document what\'s working — referral sources, pricing, service areas — so you can double down on the highest-ROI growth drivers.'
      });
    } else if(yoyPct <= -10){
      recs.push({category:'MARKETING',priority:'HIGH',status:'urgent',
        title:'Volume Down '+Math.abs(yoyPct)+'% — Action Needed',
        detail:'Job volume has declined '+Math.abs(yoyPct)+'% year over year ('+yoyGrowth.last12+' vs '+yoyGrowth.prev12+' jobs). This warrants reviewing pricing, marketing spend, and competitor activity in core markets.',
        action:'Survey recent customers on how they found you and whether they considered competitors — identify where leads are being lost.'
      });
    }

    // This month vs last year
    if(curCount > 0 && lastYearCount > 0){
      if(monthVsLY <= -20){
        recs.push({category:'MARKETING',priority:'HIGH',status:'urgent',
          title:mNames[curMo]+' Tracking Behind Last Year',
          detail:'This '+mNames[curMo]+' has '+curCount+' jobs so far vs '+lastYearCount+' in '+mNames[curMo]+' last year — running '+Math.abs(monthVsLY)+'% behind. Seasonal average for '+mNames[curMo]+' is '+curMonthAvg+' jobs.',
          action:'Push a promotional offer or targeted social media post this week to accelerate bookings for the rest of the month.'
        });
      } else if(monthVsLY >= 20){
        recs.push({category:'OPERATIONS',priority:'MEDIUM',status:'positive',
          title:mNames[curMo]+' Running '+monthVsLY+'% Ahead of Last Year',
          detail:'This '+mNames[curMo]+' has '+curCount+' jobs vs '+lastYearCount+' same time last year. Make sure you have enough bin inventory and crew capacity to handle the higher demand.',
          action:'Confirm all crew schedules and verify bin inventory levels are adequate for the rest of the month.'
        });
      }
    }

    // Upcoming slow/peak month
    if(nextMonthAvg < 110){
      recs.push({category:'SEASONAL',priority:'MEDIUM',status:'urgent',
        title:'Slow Month Ahead — Plan Now',
        detail:mNames[nextMo]+' historically averages only '+nextMonthAvg+' jobs/month based on 3 years of data. Slowest months: '+slowMonths.slice(0,3).map(function(m){return mNames[m]+' (avg '+avgByMo[m]+'/mo)';}).join(', ')+'.',
        action:'Prepare a targeted email to past customers and consider a limited-time discount to fill the calendar for '+mNames[nextMo]+'.'
      });
    } else if(nextMonthAvg > 230){
      recs.push({category:'SEASONAL',priority:'HIGH',status:'opportunity',
        title:'Peak Season Approaching — Staff Up',
        detail:mNames[nextMo]+' historically averages '+nextMonthAvg+' jobs/month — one of your busiest periods. Peak months: '+peakMonths.slice(0,3).map(function(m){return mNames[m]+' (avg '+avgByMo[m]+'/mo)';}).join(', ')+'. Demand spikes 3x vs slow months.',
        action:'Confirm bin inventory is fully serviced and crewed — book any part-time help now before peak demand hits.'
      });
    }

    // 20yd duration — longer is GOOD because customers pay $20/day overage
    if(dur20 >= 8){
      var extraRevPer20 = Math.max(0,dur20-7)*20;
      recs.push({category:'FLEET',priority:'LOW',status:'positive',
        title:'20 Yard Bins Averaging '+dur20+' Day Rentals — Extra Revenue',
        detail:'20 yard bins average '+dur20+' days per rental vs '+dur14+' days for 14 yard bins. With your $20/day overage fee, each 20yd rental generates roughly $'+extraRevPer20+' in extra-day charges. Longer rentals = consistent recurring revenue from overage fees.',
        action:'Keep marketing the overage policy clearly at booking so customers understand the fee. Consider whether adding more 20yd bins to the fleet would capture unmet demand and generate more overage revenue.'
      });
    } else if(dur20 > 0 && dur20 < 5){
      recs.push({category:'FLEET',priority:'MEDIUM',status:'opportunity',
        title:'20 Yard Bins Returning Quickly ('+dur20+' days avg)',
        detail:'20 yard bins average only '+dur20+' days — customers are returning them before the standard rental period. You\'re missing potential overage revenue at $20/day.',
        action:'Consider whether your messaging about rental duration is making customers rush returns. Longer rentals benefit you financially.'
      });
    }

    // 14yd dominance
    if(demand14pct >= 75){
      recs.push({category:'FLEET',priority:'MEDIUM',status:'opportunity',
        title:'14 Yard Bins Drive '+demand14pct+'% of Rentals',
        detail:'14 yard bins account for '+demand14pct+'% of all bin demand with '+(demandMap['14 yard']||0).toLocaleString()+' total rentals. Your fleet of '+(f14.total||54)+' bins in this size is your most critical asset.',
        action:'Prioritize maintenance and fast turnaround on 14yd bins — any bin sitting unrepaired in the yard is directly costing you bookings.'
      });
    }

    // Junk removal cross-sell
    if(junkOpCities.length >= 2){
      var cityNames = junkOpCities.map(function(c){return c.city+' ('+c.junk+' junk / '+c.total+' total)';}).join(', ');
      recs.push({category:'SERVICE MIX',priority:'MEDIUM',status:'opportunity',
        title:'Junk Removal Untapped in Bin Cities',
        detail:'Several top bin rental markets have very low junk removal penetration: '+cityNames+'. These customers already trust you for bins — they\'re the easiest upsell.',
        action:'When booking bin rentals in these cities, mention junk removal and add it as an add-on option in your booking confirmation.'
      });
    }

    // Repeat rate
    if(repeatRate < 25){
      recs.push({category:'CUSTOMER RETENTION',priority:'HIGH',status:'urgent',
        title:'Only '+repeatRate+'% of Customers Return',
        detail:'Just '+repeatRate+'% of your '+repeat.total_clients.toLocaleString()+' clients have booked more than once. Average time between first and second booking is '+avgGap+' days. Most customers are one-time visits.',
        action:'Set up a follow-up message at '+Math.round(avgGap*0.8)+' days after a job to remind past customers and prompt a second booking.'
      });
    } else if(repeatRate >= 35){
      recs.push({category:'CUSTOMER RETENTION',priority:'LOW',status:'positive',
        title:repeatRate+'% Repeat Rate — Strong Loyalty',
        detail:repeatRate+'% of your '+repeat.total_clients.toLocaleString()+' clients have returned, averaging '+avgGap+' days between visits. This is a strong indicator of satisfaction and word-of-mouth referrals.',
        action:'Ask your highest-frequency customers for a Google review — loyal customers are your best source of new business.'
      });
    } else {
      recs.push({category:'CUSTOMER RETENTION',priority:'MEDIUM',status:'opportunity',
        title:'Grow Your '+repeatRate+'% Repeat Rate',
        detail:repeatRate+'% of clients have returned, averaging '+avgGap+' days between bookings. Each percentage point of repeat rate represents roughly '+(Math.round(repeat.total_clients*0.01))+' additional jobs per year.',
        action:'Add a post-job follow-up at '+Math.round(avgGap*0.75)+' days asking if they need the bin picked up or have more junk to remove.'
      });
    }

    // Geographic concentration
    var barrieData = cities.find(function(c){return c.city==='Barrie';});
    if(barrieData){
      var barriePct = Math.round(barrieData.total / totalJobs * 100);
      if(barriePct >= 50){
        recs.push({category:'CITY TARGETING',priority:'MEDIUM',status:'opportunity',
          title:'Barrie Is '+barriePct+'% of All Jobs',
          detail:'Barrie accounts for '+barrieData.total.toLocaleString()+' of '+totalJobs.toLocaleString()+' total jobs. Heavy concentration means any local downturn impacts the whole business. Markets like '+growthCities.slice(0,3).map(function(c){return c.city+' ('+c.total+' jobs)';}).join(', ')+' show real growth potential.',
          action:'Allocate a small marketing budget specifically to Innisfil, Wasaga Beach, and Angus to grow these secondary markets.'
        });
      }
    }

    // ── Additional deeper insights ──────────────────────────────

    // Revenue per bin size insight
    var sizes=['4 yard','7 yard','14 yard','20 yard'];
    var revBySz={};
    sizes.forEach(function(s){
      var sJobs=jobs.filter(function(j){return j.service==='Bin Rental'&&j.binSize===s&&j.status!=='Cancelled';});
      revBySz[s]=sJobs.reduce(function(sum,j){return sum+(parseFloat(j.price)||0);},0);
    });
    var topRevSize=sizes.reduce(function(a,b){return (revBySz[a]||0)>(revBySz[b]||0)?a:b;});
    if(revBySz[topRevSize]>1000){
      recs.push({category:'REVENUE',priority:'LOW',status:'positive',
        title:topRevSize.replace(' yard',' Yard')+' Bins Generate Most Revenue — $'+Math.round(revBySz[topRevSize]).toLocaleString(),
        detail:'Revenue by bin size: '+sizes.map(function(s){return s.replace(' yard','yd')+': $'+Math.round(revBySz[s]||0).toLocaleString();}).join(', ')+'. Focus fleet investment and marketing on your highest-revenue sizes.',
        action:'Ensure your top revenue size always has availability. Track lost bookings where customers wanted a '+topRevSize+' but none were available.'
      });
    }

    // Busiest day of week insight
    var dayCount=[0,0,0,0,0,0,0];
    var dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    jobs.forEach(function(j){if(j.date&&j.status!=='Cancelled'){var d=new Date(j.date+'T12:00:00').getDay();dayCount[d]++;}});
    var busiestDay=dayCount.indexOf(Math.max.apply(null,dayCount));
    var slowestDay=dayCount.indexOf(Math.min.apply(null,dayCount));
    if(dayCount[busiestDay]>50){
      recs.push({category:'OPERATIONS',priority:'LOW',status:'positive',
        title:dayNames[busiestDay]+' Is Your Busiest Day ('+dayCount[busiestDay]+' jobs total)',
        detail:'Job distribution by day: '+dayNames.map(function(d,i){return d.substring(0,3)+': '+dayCount[i];}).join(', ')+'. '+dayNames[slowestDay]+' is the slowest with '+dayCount[slowestDay]+' jobs.',
        action:'Run promotions specifically for '+dayNames[slowestDay]+' bookings to even out your workload. Offer a small discount for '+dayNames[slowestDay]+' drop-offs/pickups.'
      });
    }

    // Referral source insight
    var refCounts={};
    jobs.forEach(function(j){if(j.referral&&j.status!=='Cancelled'){refCounts[j.referral]=(refCounts[j.referral]||0)+1;}});
    var refEntries=Object.keys(refCounts).map(function(k){return{src:k,count:refCounts[k]};}).sort(function(a,b){return b.count-a.count;});
    if(refEntries.length>=2){
      recs.push({category:'MARKETING',priority:'MEDIUM',status:'opportunity',
        title:'Top Lead Source: '+refEntries[0].src+' ('+refEntries[0].count+' jobs)',
        detail:'Lead sources ranked: '+refEntries.slice(0,5).map(function(e){return e.src+' ('+e.count+')';}).join(', ')+'. Understanding which channels drive bookings helps you allocate marketing spend effectively.',
        action:'Double down on '+refEntries[0].src+' — it\'s your #1 lead source. If '+refEntries[0].src+' is organic (Word of Mouth), consider a referral incentive program to amplify it.'
      });
    }

    // Sort: HIGH > MEDIUM > LOW, urgent > opportunity > positive
    var priOrder = {HIGH:0,MEDIUM:1,LOW:2};
    var statOrder = {urgent:0,opportunity:1,positive:2};
    recs.sort(function(a,b){
      var p = priOrder[a.priority] - priOrder[b.priority];
      return p !== 0 ? p : statOrder[a.status] - statOrder[b.status];
    });

    advisorProgress(90,'Rendering...');

    // Snapshot bar
    var snap = document.getElementById('advisor-snapshot');
    if(snap){
      var snapItems = [
        {label:'Total Jobs',val:totalJobs.toLocaleString()},
        {label:'YoY Growth',val:(yoyPct>=0?'+':'')+yoyPct+'%'},
        {label:'Repeat Rate',val:repeatRate+'%'},
        {label:'Avg Days to Return',val:avgGap+' days'},
        {label:'Fleet (14yd)',val:(f14.total||54)+' bins'},
        {label:'14yd Demand',val:demand14pct+'%'}
      ];
      snap.innerHTML = snapItems.map(function(s){
        return '<div style="flex:1;min-width:110px;text-align:center;">'
          +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;letter-spacing:1px;color:var(--text);">'+s.val+'</div>'
          +'<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;">'+s.label+'</div>'
          +'</div>';
      }).join('');
    }

    // Recommendation cards
    var cards = document.getElementById('advisor-cards');
    if(cards){
      var statusColors = {urgent:'#dc3545',opportunity:'#e67e22',positive:'#22c55e'};
      var priorityBg = {HIGH:'rgba(220,53,69,.06)',MEDIUM:'rgba(230,126,34,.05)',LOW:'rgba(34,197,94,.05)'};
      var priorityBorder = {HIGH:'rgba(220,53,69,.22)',MEDIUM:'rgba(230,126,34,.18)',LOW:'rgba(34,197,94,.14)'};
      var catIcons = {FLEET:'🚛',MARKETING:'📣',SEASONAL:'📅','CITY TARGETING':'📍','SERVICE MIX':'⚖️','CUSTOMER RETENTION':'🔁',OPERATIONS:'⚙️'};
      cards.innerHTML = recs.map(function(r){
        var col = statusColors[r.status]||'#22c55e';
        var bg = priorityBg[r.priority]||'var(--surface)';
        var bord = priorityBorder[r.priority]||'var(--border)';
        var icon = catIcons[r.category]||'💡';
        return '<div style="background:'+bg+';border:1px solid '+bord+';border-left:4px solid '+col+';border-radius:12px;padding:18px 20px;">'
          +'<div style="display:flex;align-items:flex-start;gap:12px;">'
          +'<div style="font-size:24px;flex-shrink:0;margin-top:2px;">'+icon+'</div>'
          +'<div style="flex:1;">'
          +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">'
          +'<span style="font-family:\'Bebas Neue\',sans-serif;font-size:18px;letter-spacing:1px;color:var(--text);">'+r.title+'</span>'
          +'<span style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:'+col+';background:'+col+'22;padding:2px 8px;border-radius:10px;">'+r.priority+'</span>'
          +'<span style="font-size:10px;color:var(--muted);letter-spacing:.5px;text-transform:uppercase;">'+r.category+'</span>'
          +'</div>'
          +'<p style="font-size:13px;color:var(--text);line-height:1.6;margin:0 0 10px;">'+r.detail+'</p>'
          +'<div style="display:flex;align-items:flex-start;gap:8px;background:rgba(0,0,0,.04);border-radius:8px;padding:10px 12px;">'
          +'<span style="font-size:13px;flex-shrink:0;">&#8594;</span>'
          +'<span style="font-size:12px;color:var(--muted);line-height:1.5;"><strong style="color:var(--text);">Next step:</strong> '+r.action+'</span>'
          +'</div>'
          +'</div>'
          +'</div>'
          +'</div>';
      }).join('');
    }

    var ts = document.getElementById('advisor-timestamp');
    if(ts) ts.textContent = 'Generated '+new Date().toLocaleString('en-CA',{dateStyle:'medium',timeStyle:'short'});
    advisorProgress(100,'');
    advisorShowState('results');

  }catch(err){
    console.error('Advisor error:',err);
    var errEl = document.getElementById('advisor-error-msg');
    if(errEl) errEl.textContent = err.message||'Unknown error';
    advisorShowState('error');
  }
}

// ── Bin Rental PDF Print ──
var BIN_RENTAL_PDF_B64 = 'JVBERi0xLjYKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvUGFnZXMKL0NvdW50IDEKL0tpZHMgWyA0IDAgUiBdCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9Qcm9kdWNlciAocHlwZGYpCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9DYXRhbG9nCi9QYWdlcyAxIDAgUgo+PgplbmRvYmoKNCAwIG9iago8PAovQXJ0Qm94IFsgMC4wIDAuMCA2MTIgNzkyIF0KL0JsZWVkQm94IFsgMC4wIDAuMCA2MTIgNzkyIF0KL0NvbnRlbnRzIDUgMCBSCi9Dcm9wQm94IFsgMC4wIDAuMCA2MTIgNzkyIF0KL0xhc3RNb2RpZmllZCAoRFwwNzIyMDI2MDMyMzE0MjIzMlwwNTUwNFwwNDcwMFwwNDcpCi9NZWRpYUJveCBbIDAuMCAwLjAgNjEyIDc5MiBdCi9QaWVjZUluZm8gPDwKL0luRGVzaWduIDw8Ci9Eb2N1bWVudElEICh4bXBcMDU2ZGlkXDA3MmY0MTg0Mzc1XDA1NTQ0NzlcMDU1NDBhNFwwNTU5OWZmXDA1NTZiZjU2ZTM1NjU4ZSkKL0xhc3RNb2RpZmllZCAoRFwwNzIyMDIxMDUyMTE4MDEwNlopCi9OdW1iZXJPZlBhZ2VJdGVtc0luUGFnZSAxMTIKL051bWJlcm9mUGFnZXMgMQovT3JpZ2luYWxEb2N1bWVudElEICh4bXBcMDU2ZGlkXDA3MmY0MTg0Mzc1XDA1NTQ0NzlcMDU1NDBhNFwwNTU5OWZmXDA1NTZiZjU2ZTM1NjU4ZSkKL1BhZ2VJdGVtVUlEVG9Mb2NhdGlvbkRhdGFNYXAgPDwKLzAgWyAyNjEgMyA0IC0yMzMuMzY1IC0zNzcuMTA3IC0xMzMuNzkxIC0zNDUuMSAxIDAuMCAwLjAgMSAtMjUzLjEwOSAtODA3Ljc4NyBdCi8xIFsgMjYzIDQgNCAtMjM0LjI4IC0zNzggLTEzMi44NzUgLTM0NC4yMDYgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovMTAgWyAyNzQgMTMgNCAtMTY5LjI2MiAtMzY5LjI5OCAtMTU5LjE0IC0zNTcuMjYxIDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzEwMCBbIDkxOSA5NyA0IC0yMDUuNTYgMjgzLjY4IDgyLjQ0IDI4My45MyAxIDAuMCAwLjAgMSAtMTgwLjcyIDYwNy4wODUgXQovMTAxIFsgOTIwIDk4IDQgMjg3LjI4IDI0OS40OCAyODcuNTMgMzUyLjA4IDAuMCAxIC0xIDAuMCAtMzUuODc1IDE3Ni40IF0KLzEwMiBbIDkyMSA5OSA0IC0yODcuNjQgMzE3LjE2IDgxLjk3NzQgMzE3LjQxIDEgMC4wIDAuMCAxIC0xODEuMDggNjQwLjU2NSBdCi8xMDMgWyA5MjIgMTAwIDQgLTI4Ny42NCAzNTAuNzUgODEuOTc3NCAzNTEgMSAwLjAgMC4wIDEgLTE4MS4wOCA2NzQuMTU1IF0KLzEwNCBbIDkyMyAxMDEgMiAtNDcwLjE2IC04Ny44NCAtMzc1Ljg0IC03OC40OCAxIDAuMCAwLjAgMSAtMzAyLjc2IC01OS40IF0KLzEwNSBbIDk0OCAxMDIgMiAtNDcwLjg4IC01NS40NCAtMzc2LjU2IC00Ni4wOCAxIDAuMCAwLjAgMSAtMzAzLjQ4IC0yNyBdCi8xMDYgWyA5NzMgMTAzIDIgLTQ3MC4xNiAtMjEuNiAtMzc1Ljg0IC0xMi4yNCAxIDAuMCAwLjAgMSAtMzAyLjc2IDYuODQgXQovMTA3IFsgOTk4IDEwNCAyIC00NjkuNDQgMTQuMDQgLTM3NS4xMiAyMy40IDEgMC4wIDAuMCAxIC0zMDIuMDQgNDIuNDggXQovMTA4IFsgMTAyOSAxMDUgMiAtNDY5LjQ0IDQ2LjA4IC0zNzUuMTIgNTUuNDQgMSAwLjAgMC4wIDEgLTMwMi4wNCA3NC41MiBdCi8xMDkgWyAxMDU0IDEwNiAyIC00NzAuODggODEuMzYgLTM3Ni41NiA5MC43MiAxIDAuMCAwLjAgMSAtMzAzLjQ4IDEwOS44IF0KLzExIFsgMjc1IDE0IDQgLTE1OS4zNjYgLTM3MC41MjggLTE0OC4xMTggLTM1OC41OTMgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovMTEwIFsgMjYxMiAxMDcgNCAzNzAuOCAtMTU0LjggNDY1LjM0IC0xMjEuOTYgMSAwLjAgMC4wIDEgMTc3Ljg0IC0wLjUgXQovMTExIFsgMjYxNSAxMDggMiAzNDkuMiAtMjA3LjM2IDQ0My41MiAtMTk4IDEgMC4wIDAuMCAxIDUxNi42IC0xNzguOTIgXQovMTIgWyAyNzYgMTUgNCAtMTQ3LjYxOCAtMzYyLjYwMiAtMTQ1LjQ0NCAtMzU5Ljg4NSAxIDAuMCAwLjAgMSAtMjUzLjEwOSAtODA3Ljc4NyBdCi8xMyBbIDI3NyAxNiA0IC0xNDUuMjU0IC0zNjYuMDIxIC0xNDEuMjc4IC0zNjAuMzk5IDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzE0IFsgMjc4IDE3IDQgLTE0MS4wNTUgLTM2Ni41NzUgLTEzNi44MjggLTM2MC45NTkgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovMTUgWyAyNzkgMTggNCAtMjM0Ljk2NyAtMzQ4LjgyIC0xODguNDc0IC0zNDguMDYzIDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzE2IFsgMjgwIDE5IDQgLTI3NC44NDUgLTMzMC40OTQgLTI1Mi43MTIgLTMwOC44OTIgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovMTcgWyAyODIgMjAgNCAtMjY5Ljk3IC0zMjUuNzM3IC0yNTcuNTg3IC0zMTMuNjUxIDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzE4IFsgMjgzIDIxIDQgLTI3MC4wODUgLTMyNS44NDggLTI1Ny40NzIgLTMxMy41MzkgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovMTkgWyAyODQgMjIgNCAtMjY2LjA5IC0zMjEuOTUxIC0yNjEuNDY1IC0zMTcuNDM3IDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzIgWyAyNjYgNSA0IC0yMjguMjU3IC0zNjEuMTE1IC0yMjIuMjMxIC0zNDkuNTc0IDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzIwIFsgMjg1IDIzIDQgLTI2Ni4yNjIgLTMyMi4xMiAtMjYxLjI5NCAtMzE3LjI2OSAxIDAuMCAwLjAgMSAtMjUzLjEwOSAtODA3Ljc4NyBdCi8yMSBbIDI4NiAyNCA0IC0yMjIuNTM1IC0zMzAuNjY2IC0yMDAuNDA0IC0zMDkuMDY1IDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzIyIFsgMjg3IDI1IDQgLTIxNy42NjEgLTMyNS45MDkgLTIwNS4yNzUgLTMxMy44MjMgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovMjMgWyAyODggMjYgNCAtMjE3Ljc3NSAtMzI2LjAxOSAtMjA1LjE2IC0zMTMuNzA5IDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzI0IFsgMjg5IDI3IDQgLTIxMy43ODEgLTMyMi4xMjIgLTIwOS4xNTUgLTMxNy42MDkgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovMjUgWyAyOTAgMjggNCAtMjEzLjk1MiAtMzIyLjI5IC0yMDguOTg0IC0zMTcuNDQgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovMjYgWyAyOTIgMjkgNCAtMTkxLjQ4MiAtMzM1LjY3NCAtMTg2LjUyMSAtMzMwLjgzMiAxIDAuMCAwLjAgMSAtMjUzLjEwOSAtODA3Ljc4NyBdCi8yNyBbIDI5MyAzMCA0IC0yODUuMjU2IC0zNjcuNjI1IC0xODcuODQzIC0zMTcuMzM1IDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzI4IFsgMjk0IDMxIDQgLTI4NS40MjcgLTM2Ny43OTMgLTE4Ny42NzEgLTMxNy4xNjYgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovMjkgWyAyOTUgMzIgNCAtMjg1Ljc3MSAtMzM1LjU0IC0yODMuNjA3IC0zMjYuNTI1IDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzMgWyAyNjcgNiA0IC0yMjIuMjE5IC0zNjIuMjU2IC0yMTMuODA2IC0zNTAuMjI5IDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzMwIFsgMjk2IDMzIDQgLTI4NS45NDMgLTMzNS43MDcgLTI4My40MzUgLTMyNi4zNTcgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovMzEgWyAyOTcgMzQgNCAtMjg0LjcyNiAtMzM1LjcxNSAtMjgyLjA5MyAtMzM1LjM3MyAxIDAuMCAwLjAgMSAtMjUzLjEwOSAtODA3Ljc4NyBdCi8zMiBbIDI5OCAzNSA0IC0yMjYuNjQgLTMzNi42NjEgLTE5My45NjggLTMyMC4yMzMgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovMzMgWyAyOTkgMzYgNCAtMjg0LjU3NyAtMzI2LjcwMSAtMjgxLjk0NCAtMzI2LjM1NyAxIDAuMCAwLjAgMSAtMjUzLjEwOSAtODA3Ljc4NyBdCi8zNCBbIDMwMCAzNyA0IC0yODcuODI4IC0zMjMuODE2IC0yODMuMzc0IC0zMTYuODE4IDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzM1IFsgMzAxIDM4IDQgLTI4OCAtMzIzLjk4NCAtMjgzLjIwMyAtMzE2LjY1IDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzM2IFsgMzAyIDM5IDQgLTE5MS41NzUgLTMyNi40MDcgLTE4Ni42MzkgLTMyMC4zMTYgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovMzcgWyAzMDMgNDAgNCAtMTkxLjc0NyAtMzI2LjU3NSAtMTg2LjQ2NyAtMzIwLjE0OCAxIDAuMCAwLjAgMSAtMjUzLjEwOSAtODA3Ljc4NyBdCi8zOCBbIDMwNCA0MSA0IC0yODIuNzc3IC0zMzcuNzE0IC0yNDcuMzg2IC0zMTcuMzIyIDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzM5IFsgMzA1IDQyIDQgLTI2Ny44NzkgLTM2NC4wNDggLTI2MS41NDkgLTM0OS43NzEgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovNCBbIDI2OCA3IDQgLTIxNC4zMzUgLTM2My40NDMgLTIwNy4wODMgLTM1MS40MTMgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovNDAgWyAzMDYgNDMgNCAtMjM1LjAwMiAtMzQ4LjE2MSAtMjM0LjQ2MyAtMzIyLjY3MSAxIDAuMCAwLjAgMSAtMjUzLjEwOSAtODA3Ljc4NyBdCi80MSBbIDMwNyA0NCA0IC0yNjAuNzc4IC0zNjQuNTYgLTIzNS43ODkgLTMyNC4xMjUgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovNDIgWyAzMDggNDUgNCAtMjQ3LjU5NCAtMzIyLjg2NyAtMjI2LjI0NiAtMzIyLjQ2MyAxIDAuMCAwLjAgMSAtMjUzLjEwOSAtODA3Ljc4NyBdCi80MyBbIDMwOSA0NiA0IC0yNjAuNTA0IC0zNDkuMDI2IC0yMzYuMTQ5IC0zNDguNjEgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovNDQgWyAzMTAgNDcgNCAtMjYwLjQ5OSAtMzQ4LjMyNCAtMjM2LjE0MyAtMzQ3LjkwOSAxIDAuMCAwLjAgMSAtMjUzLjEwOSAtODA3Ljc4NyBdCi80NSBbIDMxMSA0OCA0IC0yMzQuOTY5IC0zNDkuMTg1IC0xODcuNDc4IC0zNDguMTQ3IDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzQ2IFsgMzEyIDQ5IDQgLTI2My44MjYgLTM1My40NDcgLTI2MS43NTIgLTM0Ny42NzcgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovNDcgWyAzMTMgNTAgNCAtMjYzLjk5OCAtMzUzLjc4NiAtMjYxLjU3OCAtMzQ3LjM2NyAxIDAuMCAwLjAgMSAtMjUzLjEwOSAtODA3Ljc4NyBdCi80OCBbIDMzNyA1MSAyIDI1LjIgLTM3OCAyODggLTM1NS42OCAxIDAuMCAwLjAgMSAxMjIuMDQgLTMzOC43NiBdCi80OSBbIDM2OCA1MiAyIC0xODAgLTM0My40NCAyMC44OCAtMzIxLjEyIDEgMC4wIDAuMCAxIC0xMi42IC0zMTUgXQovNSBbIDI2OSA4IDQgLTIwNi45MzQgLTM2NC40MDggLTE5OS42ODIgLTM1Mi4zNzcgMSAwLjAgMC4wIDEgLTI1My4xMDkgLTgwNy43ODcgXQovNTAgWyAzNzUgMC4wIDIgLTI4Ny42MjUgLTIxMC45NiAyODcuNjI1IDI0OS44NCAxIDAuMCAwLjAgMSAwLjAgMC4wIF0KLzUxIFsgMzc2IDEwOSA0IDAuMCAtMzk2IDAuMCAzOTYgMSAwLjAgMC4wIDEgMC4wIDAuMCBdCi81MiBbIDM3NyA1MyAyIC0yODggLTI4OC43MiAtMjQxLjIgLTIyMC4zMiAxIDAuMCAwLjAgMSAtMTIwLjYgLTI2MC4yOCBdCi81MyBbIDQwNCA1NCAyIDU0IC0zMzAuNDggMTg0LjMyIC0yMjAuMzIgMSAwLjAgMC4wIDEgMjIxLjQgLTMwMi4wNCBdCi81NCBbIDQyOSAxMTAgNCAtMzA2IC0zNDQuMTYgMzA2IC0zNDQuMTYgMSAwLjAgMC4wIDEgMC4wIC0zNDQuMTYgXQovNTUgWyA0MzIgNTUgNCA4NC4yNCAtMzIyLjU2IDI4OCAtMzIyLjMxIDEgMC4wIDAuMCAxIDAuMCAwLjg0NTAwMSBdCi81NiBbIDQzMyA1NiA0IDg0LjI0IC0zMDMuMTIgMjg4IC0zMDIuODcgMSAwLjAgMC4wIDEgMC4wIDIwLjI4NSBdCi81NyBbIDQzNCA1NyA0IDc1Ljk2IC0yODIuOTYgMjg4IC0yODIuNzEgMSAwLjAgMC4wIDEgMi44OCA0MC40NDUgXQovNTggWyA0MzUgNTggNCAxMjQuNTYgLTI2My4xNiAyODggLTI2Mi45MSAxIDAuMCAwLjAgMSAwLjAgNjAuMjQ1IF0KLzU5IFsgNDM2IDU5IDQgMTE4LjQ0IC0yNDMgMjg4IC0yNDIuNzUgMSAwLjAgMC4wIDEgMC4wIDgwLjQwNSBdCi82IFsgMjcwIDkgNCAtMTk5LjU5MSAtMzY1LjIzOCAtMTk2LjU5NCAtMzU4LjgxIDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzYwIFsgNDM3IDYwIDQgMTI4Ljg4IC0yMjIuODQgMjg4IC0yMjIuNTkgMSAwLjAgMC4wIDEgMC4wIDEwMC41NjUgXQovNjEgWyA0MzggNjEgNCAtMjU2LjUgLTI4MS4xNiAwLjAgLTI4MC45MSAxIDAuMCAwLjAgMSAtMzI5LjU4IDQyLjI0NSBdCi82MiBbIDQzOSA2MiA0IC0yNDYuNiAtMjYxLjI1IDAuMCAtMjYxIDEgMC4wIDAuMCAxIC0zMTkuNjggNjIuMTU1IF0KLzYzIFsgNDQwIDYzIDQgLTI3MS44IC0yNDEuMiAwLjAgLTI0MC45NSAxIDAuMCAwLjAgMSAtMzQ0Ljg4IDgyLjIwNSBdCi82NCBbIDQ0MSA2NCA0IC0yNTQuODggLTIyMS4wNCAtMS40NCAtMjIwLjc5IDEgMC4wIDAuMCAxIC0zMjcuOTYgMTAyLjM2NSBdCi82NSBbIDQ0MiAxIDQgLTI4Ny4yOCAtMjEwLjY3MiAyODcuMjggLTE4OS4xNCAxIDAuMCAwLjAgMSAwLjAgMC4wIF0KLzY2IFsgNDQ0IDY1IDQgLTE5My42OCAtMjEwLjk2IC0xOTMuNDMgMjE2LjcyIDAuMCAxIC0xIDAuMCAtNTE2LjgzNSAtMjg0LjA0IF0KLzY3IFsgNDQ1IDY2IDIgLTI4OCAtMjA0LjQ4IC0xOTMuNjggLTE5NS4xMiAxIDAuMCAwLjAgMSAtMTIwLjYgLTE3Ni4wNCBdCi82OCBbIDUyMyA2NyAyIC0yODggLTE4MS40NCAtMTkzLjY4IC0xNjEuMjggMSAwLjAgMC4wIDEgLTEyMC42IC0xNTMgXQovNjkgWyA1NTAgNjggMiAtMTkzLjUgLTIwNS4wMiA5OSAtMTkyLjk2IDEgMC4wIDAuMCAxIC0yNi4xIC0xNzYuNTggXQovNyBbIDI3MSAxMCA0IC0xOTYuMSAtMzY1LjMxNSAtMTg4Ljc0NSAtMzUzLjkxIDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzcwIFsgNTc1IDY5IDIgMTkzLjY4IC0yMDUuMDIgMjg4IC0xOTUuNjYgMSAwLjAgMC4wIDEgMzYxLjA4IC0xNzYuNTggXQovNzEgWyA2MjggNzAgNCAxOTMuMjUgLTIxMC44MTYgMTkzLjUgMzUyLjIyNCAwLjAgMSAtMSAwLjAgLTEyOS45MDUgLTI4My42OCBdCi83MiBbIDYzMSA3MSAyIC0xODUuMDQgLTE2OS4yIC05MC43MiAtMTYwLjU2IDEgMC4wIDAuMCAxIC0xNy42NCAtMTQwLjc2IF0KLzczIFsgNjU3IDcyIDIgLTE4NS4wNCAtMTQyLjU2IDk3LjkyIC0xMzMuMiAxIDAuMCAwLjAgMSAtMTcuNjQgLTExNC4xMiBdCi83NCBbIDY4NCA3MyA0IC0yODcuNDI0IC0xNTQuOCAyODcuNDI0IC0xNTQuNTUgMSAwLjAgMC4wIDEgLTM2MS4wOCAxNjguNjA1IF0KLzc1IFsgNjg2IDExMSA0IC0xODUuMDQgLTM5NiAtMTg1LjA0IDM5NiAxIDAuMCAwLjAgMSAtMTg1LjA0IDAuMCBdCi83NiBbIDY4NyA3NCA0IC0yNjIuMDggNDI2LjE2IC0yMjkuMjQgNDU5IDEgMC4wIDAuMCAxIC0zMDEuNDYgNjE0LjMgXQovNzcgWyA2ODggNzUgNCAtMjg4IC0xMjAuOTYgMjg3LjQyNCAtMTIwLjcxIDEgMC4wIDAuMCAxIC0zNjEuMDggMjAyLjQ0NSBdCi83OCBbIDY4OSA3NiA0IC0yODggLTg4LjU2IDI4Ny40MjQgLTg4LjMxIDEgMC4wIDAuMCAxIC0zNjEuMDggMjM0Ljg0NSBdCi83OSBbIDY5MCA3NyA0IC0yODcuNDI0IC01NS40NCAyODcuNDI0IC01NS4xOSAxIDAuMCAwLjAgMSAtMzYxLjA4IDI2Ny45NjUgXQovOCBbIDI3MiAxMSA0IC0xODQuNDEzIC0zNjYuODM2IC0xNzguMzg2IC0zNTUuMjk1IDEgMC4wIDAuMCAxIC0yNTMuMTA5IC04MDcuNzg3IF0KLzgwIFsgNjkxIDc4IDQgLTI4Ny40MjQgLTIyLjMyIDI4Ny41NjggLTIyLjA3IDEgMC4wIDAuMCAxIC0zNjEuMDggMzAxLjA4NSBdCi84MSBbIDY5MiA3OSA0IC0yODcuMjggMTEuNTIgMjg3LjQyNCAxMS43NyAxIDAuMCAwLjAgMSAtMzYxLjA4IDMzNC45MjUgXQovODIgWyA2OTMgODAgNCAtMjg3LjU2OCA0NSAyODcuNDI0IDQ1LjI1IDEgMC4wIDAuMCAxIC0zNjEuMDggMzY4LjQwNSBdCi84MyBbIDY5NCA4MSA0IC0yODcuNDI0IDc5LjIgMjg3LjU2OCA3OS40NSAxIDAuMCAwLjAgMSAtMzYxLjA4IDQwMi42MDUgXQovODQgWyA2OTUgODIgNCAtMjg3LjI4IDExMy43NiAyODcuNDI0IDExNC4wMSAxIDAuMCAwLjAgMSAtMzYxLjA4IDQzNy4xNjUgXQovODUgWyA2OTYgODMgNCAtMjg3LjQyNCAxNDcuNiAyODggMTQ3Ljg1IDEgMC4wIDAuMCAxIC0zNjEuMDggNDcxLjAwNSBdCi84NiBbIDY5NyA4NCA0IC0yODcuMjggMTgyLjE2IDI4Ny40MjQgMTgyLjQxIDEgMC4wIDAuMCAxIC0zNjEuMDggNTA1LjU2NSBdCi84NyBbIDY5OCA4NSA0IC0yODcuNDI0IDIxNi43MiAyODcuMjggMjE2Ljk3IDEgMC4wIDAuMCAxIC0zNjEuMDggNTQwLjEyNSBdCi84OCBbIDY5OSA4NiAyIC0xODUuMDQgLTEwOCAwLjAgLTk5LjM2IDEgMC4wIDAuMCAxIC0xNy42NCAtNzkuNTYgXQovODkgWyA3MjUgODcgMiAtMjg4IDE5MC4wOCAtMTkzLjY4IDIxMC4yNCAxIDAuMCAwLjAgMSAtMTIwLjYgMjE4LjUyIF0KLzkgWyAyNzMgMTIgNCAtMTc4Ljc4MSAtMzY4LjA5OCAtMTY5LjQwMyAtMzU2LjUyMiAxIDAuMCAwLjAgMSAtMjUzLjEwOSAtODA3Ljc4NyBdCi85MCBbIDc1MSA4OCAyIC0yODggMjc1Ljg1IC0xOTMuNjggMjkwLjI1IDEgMC4wIDAuMCAxIC0xMjAuNiAzMDQuMjkgXQovOTEgWyA3NzggODkgMiAtMjc5LjM2IDIyOC42IC0xODUuMDQgMjQzIDEgMC4wIDAuMCAxIC0xMTEuOTYgMjU3LjA0IF0KLzkyIFsgODAzIDkwIDIgLTE0NS40NCAyMjguMjQgLTUxLjEyIDI0Mi42NCAxIDAuMCAwLjAgMSAyMS45NiAyNTYuNjggXQovOTMgWyA4MzQgOTEgMiA5MCAyNjIuOCAxODQuMzIgMjc3LjIgMSAwLjAgMC4wIDEgMjU3LjQgMjkxLjI0IF0KLzk0IFsgODU5IDExMiA0IDE4NC4zMiAtMzk2IDE4NC4zMiAzOTYgMSAwLjAgMC4wIDEgMTg0LjMyIDAuMCBdCi85NSBbIDg2MCA5MiAyIDkwIDMzMC40OCAxODQuMzIgMzQ0Ljg4IDEgMC4wIDAuMCAxIDI1Ny40IDM1OC45MiBdCi85NiBbIDg4NSA5MyAyIDkwIDI5Ny4zNiAxODQuMzIgMzExLjc2IDEgMC4wIDAuMCAxIDI1Ny40IDMyNS44IF0KLzk3IFsgOTEwIDk0IDQgMTkzLjUgMjgzLjY4IDI4Ny4yOCAyODMuOTMgMSAwLjAgMC4wIDEgMC4wIDYwNy4wODUgXQovOTggWyA5MTcgOTUgNCAxOTMuNSAzMTguMjQgMjg3LjI4IDMxOC40OSAxIDAuMCAwLjAgMSAwLjAgNjQxLjY0NSBdCi85OSBbIDkxOCA5NiA0IDE5My4yNDggMzUyLjA4IDI4Ny41NjggMzUyLjMzIDEgMC4wIDAuMCAxIDAuMCA2NzUuNDg1IF0KPj4KL1BhZ2VUcmFuc2Zvcm1hdGlvbk1hdHJpeExpc3QgPDwKLzAgWyAxIDAuMCAwLjAgMSAtMzA2IC0zOTYgXQo+PgovUGFnZVVJRExpc3QgPDwKLzAgMjExCj4+Ci9QYWdlV2lkdGhMaXN0IDw8Ci8wIDYxMgo+Pgo+Pgo+PgovUmVzb3VyY2VzIDw8Ci9FeHRHU3RhdGUgPDwKL0dTMCA2IDAgUgovR1MxIDcgMCBSCj4+Ci9Gb250IDw8Ci9DMF8wIDggMCBSCi9DMF8xIDE2IDAgUgovQzBfMiAxOSAwIFIKL0YxIDIyIDAgUgovVDFfMCAyMyAwIFIKL1QxXzEgMjcgMCBSCj4+Ci9Db2xvclNwYWNlIDw8Ci9DUzAgMzIgMCBSCj4+Ci9Qcm9jU2V0IFsgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgL1BERiAvVGV4dCBdCj4+Ci9Sb3RhdGUgMAovVHJpbUJveCBbIDAuMCAwLjAgNjEyIDc5MiBdCi9UeXBlIC9QYWdlCi9Bbm5vdHMgWyBdCi9QYXJlbnQgMSAwIFIKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL0xlbmd0aCA0NTY1OAo+PgpzdHJlYW0KcQowIDAgMCAxIEsKMC4yNSB3IDQgTSAKL0dTMCBncwpxCjEgMCAwIDAuODU5ODE3NSAwIDIwLjQ4MTQzMDEgY20KMTguNSAxNDYuMjg1IDU3NSA0NjAuNTUgcmUKUwpRCi9BcnRpZmFjdCA8PC9CQm94IFsxOC40NyA1ODQuODkgNTkzLjUzIDYwNi45MjIgXS9PIC9MYXlvdXQgPj5CREMgCi9DUzAgY3MgMSAgc2NuCi9HUzEgZ3MKcQowLjk5OTM1OTEgMCAwIDEuMDM5ODg2NSAwLjE5MzY0OTMgLTg5LjE2NjM1MTMgY20KMTguNzIgNTg1LjE0IDU3NC41NiAyMS41MzIgcmUKZgpRCkVNQyAKL0FydGlmYWN0IDw8L0JCb3ggWzE3Ljc0MDMgNzA0LjYyNDMgMTczLjM4MjMgNzc0LjI1MzMgXS9PIC9MYXlvdXQgPj5CREMgCnEKMCAwIDYxMiA3OTIgcmUKVyBuCjAgMCAwIDAgawpxCjEgMCAwIDEgMTcyLjE4NzEgNzU2LjA1NzEgY20KMCAwIG0KMC4xOTIgLTEuMzcyIC0wLjkyIC0yLjY1MSAtMi40OTIgLTIuODU1IGMKLTk0LjIzMSAtMTQuOTMgbAotOTUuODAzIC0xNS4xMzUgLTk3LjIzMiAtMTQuMTg5IC05Ny40MjUgLTEyLjgxNyBjCi05OS41MzEgMi4wOTEgbAotOTkuNzI0IDMuNDY0IC05OC42MDggNC43NDMgLTk3LjAzOCA0Ljk0NyBjCi01LjMgMTcuMDIyIGwKLTMuNzI4IDE3LjIyNyAtMi4yOTkgMTYuMjgxIC0yLjEwNCAxNC45MDggYwpoCmYKUQovQ1MwIGNzIDEgIHNjbgpxCjEgMCAwIDEgMTcyLjE4NzEgNzU2LjA1NzEgY20KMCAwIG0KLTAuOTA2IC0wLjExNyBsCi0wLjg5NyAtMC4xNzcgLTAuODk1IC0wLjIzNiAtMC44OTUgLTAuMjk2IGMKLTAuODkxIC0wLjY3MiAtMS4wNDggLTEuMDQ2IC0xLjM0OSAtMS4zNTcgYwotMS42NTEgLTEuNjY4IC0yLjA5MyAtMS45MDIgLTIuNjE3IC0xLjk2OSBjCi05NC4zNTcgLTE0LjA0NCBsCi05NC4zNTYgLTE0LjA0NCBsCi05NC40NTcgLTE0LjA1OCAtOTQuNTU3IC0xNC4wNjUgLTk0LjY1NiAtMTQuMDY1IGMKLTk1LjE1NCAtMTQuMDY4IC05NS42MDUgLTEzLjkwNyAtOTUuOTMzIC0xMy42NTQgYwotOTYuMjYyIC0xMy40MDEgLTk2LjQ2NSAtMTMuMDc1IC05Ni41MiAtMTIuNjk4IGMKLTk4LjYyNCAyLjIwOSBsCi05OC42MzIgMi4yNyAtOTguNjM2IDIuMzI4IC05OC42MzcgMi4zODYgYwotOTguNjQgMi43NjQgLTk4LjQ4MiAzLjEzNyAtOTguMTggMy40NDkgYwotOTcuODc4IDMuNzYgLTk3LjQzNyAzLjk5NCAtOTYuOTEzIDQuMDYyIGMKLTUuMTcgMTYuMTM4IGwKLTUuMTcyIDE2LjEzNyBsCi01LjA3IDE2LjE1IC00Ljk3MiAxNi4xNTcgLTQuODc0IDE2LjE1NyBjCi00LjM4IDE2LjE1OSAtMy45MjcgMTUuOTk4IC0zLjU5NyAxNS43NDYgYwotMy4yNjggMTUuNDkzIC0zLjA2NSAxNS4xNjYgLTMuMDEyIDE0Ljc4OSBjCi0wLjkwNiAtMC4xMTcgbAowIDAgbAowLjkwNiAwLjExOCBsCi0xLjE5OCAxNS4wMjYgbAotMS4zMTkgMTUuODk4IC0xLjgwNiAxNi42NDYgLTIuNDc0IDE3LjE1MSBjCi0zLjEzOSAxNy42NiAtMy45OSAxNy45NDYgLTQuODg5IDE3Ljk0MyBjCi01LjA2NSAxNy45NDEgLTUuMjQ0IDE3LjkzMSAtNS40MjMgMTcuOTA3IGMKLTUuNDMgMTcuOTA1IGwKLTk3LjE2MyA1LjgzMiBsCi05Ny4xNjIgNS44MzIgbAotOTguMDk2IDUuNzExIC05OC45MTYgNS4yOTEgLTk5LjUxIDQuNjgzIGMKLTEwMC4xMDMgNC4wNzYgLTEwMC40NzQgMy4yNjIgLTEwMC40NjcgMi4zODEgYwotMTAwLjQ2NyAyLjI0NSAtMTAwLjQ1NiAyLjEwOSAtMTAwLjQzNyAxLjk3MyBjCi05OC4zMzIgLTEyLjkzNCBsCi05OC4yMTEgLTEzLjgwNyAtOTcuNzIzIC0xNC41NTQgLTk3LjA1NyAtMTUuMDU5IGMKLTk2LjM5MSAtMTUuNTY3IC05NS41NDMgLTE1Ljg1MyAtOTQuNjQzIC0xNS44NTEgYwotOTQuNDY2IC0xNS44NTIgLTk0LjI4NyAtMTUuODM4IC05NC4xMDcgLTE1LjgxNSBjCi05NC4xMDEgLTE1LjgxNCBsCi0yLjM2MSAtMy43NCBsCi0yLjM2NyAtMy43NCBsCi0xLjQzNCAtMy42MTggLTAuNjE0IC0zLjE5OSAtMC4wMiAtMi41OSBjCjAuNTcyIC0xLjk4MiAwLjk0NSAtMS4xNyAwLjkzOCAtMC4yOSBjCjAuOTM1IC0wLjE1NCAwLjkyNCAtMC4wMTcgMC45MDYgMC4xMTggYwpoCmYKUQpxCjEgMCAwIDEgODAuNDA1MyA3NTMuMjU5MiBjbQowIDAgbQotMC4xNDggMC45OTMgLTAuMzUxIDEuNTc4IC0wLjYwNyAxLjc1MyBjCi0wLjY5MSAxLjc5MyAtMC44MTEgMS44NTIgLTAuOTYzIDEuOTMxIGMKLTEuMDc4IDIuMDM1IC0xLjE0OCAyLjE5NCAtMS4xNzkgMi40MDkgYwotMS4yMzUgMi44MTEgLTEuMDUgMy4xMzcgLTAuNjI1IDMuMzkyIGMKLTAuMjgzIDMuNjA0IDAuMTY5IDMuNzQzIDAuNzI4IDMuODA2IGMKMS40OTYgMy44OTYgMi4wNTYgMy44NjUgMi40MDYgMy43MSBjCjIuNjkgMy41ODkgMi44NTQgMy4zNjcgMi45MDEgMy4wNDUgYwoyLjkyNyAyLjg1MSAyLjkwNyAyLjcwMyAyLjgzNCAyLjYwNCBjCjIuNzY2IDIuNTA2IDIuNjk0IDIuNDEyIDIuNjIzIDIuMzI1IGMKMi41NSAyLjIzNSAyLjQ5OCAyLjExOSAyLjQ2NSAxLjk3NSBjCjIuMzY5IDEuNTI2IDIuMzgzIDAuODYxIDIuNTA2IC0wLjAxNiBjCjIuNTAxIDAuMDEzIGwKMi41NzMgLTAuMzY1IDIuNzE1IC0xLjAxOCAyLjkyNSAtMS45NDUgYwozLjExMyAtMi43NzUgMy4yNDEgLTMuNDIzIDMuMzA3IC0zLjg5MSBjCjMuNDU2IC00Ljk0NSAzLjMxIC01LjgwNCAyLjg3MSAtNi40NjcgYwoyLjQzMyAtNy4xMzIgMS43NDYgLTcuNTIyIDAuODEzIC03LjY0NSBjCi0wLjExOSAtNy43NjcgLTAuODgyIC03LjYxMiAtMS40NzUgLTcuMTgzIGMKLTIuMTA5IC02LjczMSAtMi40OTYgLTUuOTkgLTIuNjQyIC00Ljk2NSBjCi0yLjY4MSAtNC42ODMgLTIuNjY1IC00LjM1NCAtMi41OTUgLTMuOTc2IGMKLTIuNTExIC0zLjUwOCAtMi4zNjIgLTMuMjM2IC0yLjE1IC0zLjE1OCBjCi0yLjA0OSAtMy4xMTUgLTEuOTYxIC0zLjA4OSAtMS44ODMgLTMuMDc3IGMKLTEuNjM5IC0zLjA0NiAtMS40MDEgLTMuMjA0IC0xLjE3IC0zLjU1MSBjCi0wLjkzOCAtMy44OTggLTAuNjgzIC00LjA1NSAtMC40MDUgLTQuMDE4IGMKMC4yODQgLTMuOTI4IDAuNTIzIC0zLjEzMyAwLjMxMSAtMS42MjkgYwowLjI3OSAtMS4zOTUgMC4xODYgLTAuODgxIDAuMDM5IC0wLjA4NiBjCjAuMDE3IC0wLjA1OCAwLjAwNSAtMC4wMjkgMCAwIGMKZgpRCnEKMSAwIDAgMSA4NC44MjU3IDc1NC42ODg0IGNtCjAgMCBtCi0wLjEyNSAwLjUgLTAuMjc1IDAuODA4IC0wLjQ1MSAwLjkyMyBjCi0wLjUzNyAwLjk2MiAtMC42NTUgMS4wMjMgLTAuODA5IDEuMSBjCi0wLjkzMSAxLjIwNSAtMS4wMDUgMS4zNjIgLTEuMDM1IDEuNTc2IGMKLTEuMDkxIDEuOTc3IC0wLjkwNyAyLjMwNCAtMC40ODIgMi41NTcgYwotMC4xMyAyLjc3MSAwLjMyMiAyLjkxIDAuODcxIDIuOTcxIGMKMC45NzYgMi45ODYgMS4xMzYgMi45OTcgMS4zNTIgMy4wMDUgYwoxLjU2OSAzLjAxMiAxLjczNCAzLjAyNiAxLjg0NyAzLjA0IGMKMi4xNDMgMy4wNzggMi42MjMgMy4xNjYgMy4yODggMy4zMDMgYwozLjk1NCAzLjQzOSA0LjQyNCAzLjUyNiA0LjcwNSAzLjU2IGMKNS4wNzkgMy42MSA1LjQwNiAzLjM4NSA1LjY5IDIuODg1IGMKNS45MDUgMi40OTYgNi4wNDkgMi4wNjMgNi4xMTQgMS41ODQgYwo2LjE1NSAxLjI4MSA2LjE0IDEuMDIxIDYuMDY2IDAuODAzIGMKNS45NjIgMC41MzEgNS43ODggMC4zNzkgNS41NDMgMC4zNDcgYwo1LjMwNyAwLjMxNiA1LjA5IDAuNDEzIDQuODg4IDAuNjM0IGMKNC41OTUgMC45NjQgNC4zNzUgMS4xNjkgNC4yMyAxLjI1IGMKMy44NzEgMS40NiAzLjM4IDEuNTI2IDIuNzUxIDEuNDQzIGMKMi41NyAxLjQxOSAyLjQ3MiAxLjQwOCAyLjQ2NSAxLjQwNiBjCjIuMzgzIDEuMzU2IDIuMzM5IDEuMjMyIDIuMzMgMS4wMzEgYwoyLjMyMiAwLjk2IDIuMzI0IDAuODkxIDIuMzM0IDAuODIzIGMKMi4zNzkgMC41MDEgMi41NiAwLjI1NyAyLjg3NSAwLjA4OSBjCjMuMTU0IC0wLjA1NCAzLjQ2NyAtMC4xMDIgMy44MTQgLTAuMDU3IGMKMy44ODcgLTAuMDQ4IDMuOTYyIDAuMDE2IDQuMDQ3IDAuMTM3IGMKNC4xMzUgMC4yNTggNC4yMTIgMC4zMjIgNC4yOCAwLjMzMiBjCjQuNDEyIDAuMzQ5IDQuNDkyIDAuMjQ5IDQuNTIyIDAuMDM1IGMKNC41NzEgLTAuMzA3IDQuNTc2IC0wLjYzOCA0LjU0NCAtMC45NiBjCjQuNDkyIC0xLjQxNCA0LjM1OCAtMS42NTcgNC4xMzkgLTEuNjg0IGMKMy45OTkgLTEuNzAzIDMuODUgLTEuNTk5IDMuNjg4IC0xLjM3MSBjCjMuNTI3IC0xLjE0NCAzLjMyNiAtMS4wNDYgMy4wOCAtMS4wNzcgYwoyLjgwMiAtMS4xMTMgMi42OTkgLTEuMzkxIDIuNzczIC0xLjkwOCBjCjIuOTQzIC0zLjEyNyAzLjY2MiAtMy42NTMgNC45MjcgLTMuNDg4IGMKNC45NzkgLTMuNDgyIDUuMDU5IC0zLjQ1OCA1LjE2OSAtMy40MTMgYwo1LjI3NiAtMy4zNyA1LjM2NSAtMy4zNTQgNS40MjggLTMuMzY0IGMKNS40OSAtMy4zNjUgNS41NDMgLTMuMzY0IDUuNTg3IC0zLjM1OCBjCjUuODA1IC0zLjMzIDUuOTcgLTMuMTg5IDYuMDgxIC0yLjkzNiBjCjYuMTkyIC0yLjY4NCA2LjI4OSAtMi41NTEgNi4zNzcgLTIuNTQxIGMKNi41MDcgLTIuNTIzIDYuNjM1IC0yLjYwNiA2Ljc1OSAtMi43ODggYwo2Ljg4MiAtMi45NzEgNi45NTcgLTMuMTQ1IDYuOTc5IC0zLjMxMSBjCjYuOTkzIC0zLjQwOSA3LjA0IC0zLjY1OCA3LjExOSAtNC4wNiBjCjcuMTk3IC00LjQ2MyA3LjI1NSAtNC43OTYgNy4yOTQgLTUuMDU5IGMKNy40NiAtNi4yNDkgNy4zNSAtNy4wNDcgNi45NjQgLTcuNDU2IGMKNi44MTYgLTcuNjA0IDYuMjcyIC03Ljc0IDUuMzMgLTcuODYyIGMKNS4wNyAtNy44OTggNC43MTIgLTcuOTQzIDQuMjU5IC04LjAwMyBjCjMuODg0IC04LjA2MSAzLjUxOSAtOC4xMDkgMy4xNiAtOC4xNDYgYwowLjcgLTguNDUyIGwKMC4yNTUgLTguNTAxIC0wLjAwMSAtOC4yOTEgLTAuMDY3IC03LjgyNCBjCi0wLjA5NSAtNy42MzcgLTAuMDUyIC03LjQ2NCAwLjA1NyAtNy4zMDEgYwowLjI0MSAtNy4wMjkgMC4zNDEgLTYuODYyIDAuMzYgLTYuOCBjCjAuNTQ2IC02LjMyOSBsCjAuNjM2IC02LjA4OSAwLjYzMiAtNS41MjQgMC41MzMgLTQuNjM0IGMKMC4xMDYgLTAuODQ5IGwKMC4wNzggLTAuNTI2IDAuMDQxIC0wLjI0MyAwIDAgYwpmClEKcQoxIDAgMCAxIDkyLjg1MDkgNzU0Ljg5MzIgY20KMCAwIG0KMCAwLjAxMyBsCi0wLjE0OCAwLjk5NyAtMC4zNDcgMS41NzQgLTAuNTk5IDEuNzQ5IGMKLTAuNjgyIDEuNzg4IC0wLjggMS44NDYgLTAuOTUxIDEuOTI2IGMKLTEuMDcyIDIuMDMgLTEuMTQ2IDIuMTg4IC0xLjE3NiAyLjQwMiBjCi0xLjIzMyAyLjgwMSAtMS4wNDggMy4xMjcgLTAuNjIyIDMuMzgzIGMKLTAuMjcgMy41OTcgMC4xODEgMy43MzYgMC43MzIgMy43OTcgYwowLjc3MiAzLjgwMSAwLjg0IDMuODEgMC45MjggMy44MjIgYwoxLjAwNiAzLjgzMyAxLjA2NSAzLjgzOSAxLjEwOSAzLjg0NiBjCjEuMDQ5IDMuODM3IDEuMzUxIDMuODc3IDIuMDE0IDMuOTY0IGMKMi4zMTkgNC4wMDMgMi43NiA0LjEgMy4zNDIgNC4yNTYgYwozLjkyNSA0LjQxMSA0LjM1NSA0LjUwNiA0LjYzNCA0LjU0MyBjCjUgNC41OTEgNS4zMjYgNC4zNjUgNS42MDggMy44NjcgYwo1LjgzMiAzLjQ3NyA1Ljk3NyAzLjA0NSA2LjA0NSAyLjU2NyBjCjYuMDg2IDIuMjY0IDYuMDY4IDIuMDAzIDUuOTgyIDEuNzgzIGMKNS44ODcgMS41MTIgNS43MTcgMS4zNjEgNS40NzEgMS4zMjkgYwo1LjI2MyAxLjMwMiA1LjA2NSAxLjQxIDQuODc4IDEuNjUzIGMKNC42MDIgMi4wMjYgNC40MTIgMi4yNDkgNC4zIDIuMzI0IGMKIAo0LjAwMiAyLjU1NCAzLjYwOCAyLjYzMSAzLjEyIDIuNTU5IGMKMi41MTggMi40NiAyLjI0MyAyLjIzNCAyLjI5MSAxLjg4MyBjCjIuMzQ0IDEuNTIyIDIuNTEgMS4yNjEgMi43OTIgMS4wOTkgYwozLjA0NCAwLjk2MyAzLjMzOSAwLjkxNiAzLjY4MiAwLjk2MiBjCjMuNzUzIDAuOTcxIDMuODM5IDEuMDI4IDMuOTM5IDEuMTM2IGMKNC4wNDEgMS4yNDUgNC4xMzIgMS4zMDMgNC4yMSAxLjMxMyBjCjQuMzUgMS4zMzEgNC41MDMgMC43NjEgNC42NjYgLTAuNDAxIGMKNC42ODcgLTAuNTQ4IDQuNjY1IC0wLjY4MiA0LjYwNSAtMC44MTEgYwo0LjU0MyAtMC45MzggNC40NDYgLTEuMDEgNC4zMTQgLTEuMDI2IGMKNC4yMTggLTEuMDQgNC4wNDggLTAuOTI5IDMuODAyIC0wLjY5MiBjCjMuNTU1IC0wLjQ1NiAzLjMwNiAtMC4zNTYgMy4wNTMgLTAuMzg3IGMKMi44NTEgLTAuNDE1IDIuNzM3IC0wLjUwNCAyLjcwNSAtMC42NTcgYwoyLjY4OSAtMC43MzggMi42OTggLTAuOTI1IDIuNzMgLTEuMjIgYwoyLjg2NyAtMi40MzQgMy4xMTcgLTMuNTM5IDMuNDggLTQuNTM2IGMKMy41NTMgLTQuNzU1IDMuODQyIC01LjA2NCA0LjM0MyAtNS40NjcgYwo0Ljc5NCAtNS44MzUgNS4wMyAtNi4xNzIgNS4wNDYgLTYuNDc3IGMKNS4wNjQgLTYuODAyIDQuODA4IC03IDQuMjc3IC03LjA2OSBjCjQuMTM4IC03LjA4NyAzLjkyOSAtNy4xMDIgMy42NTYgLTcuMTEyIGMKMy4zODIgLTcuMTI0IDMuMTkgLTcuMTM3IDMuMDc1IC03LjE1MiBjCjAuNjE3IC03LjQ3MiBsCjAuMTcyIC03LjUyOSAtMC4wODQgLTcuMzE1IC0wLjE1NCAtNi44MjkgYwotMC4xNzkgLTYuNjM2IC0wLjExIC02LjM4OCAwLjA2MSAtNi4wODcgYwowLjE5OSAtNS44NjIgMC4zMzQgLTUuNjM3IDAuNDcyIC01LjQwOSBjCjAuNjY5IC01LjA0OCAwLjczMyAtNC42NDYgMC42NjMgLTQuMjEgYwpoCmYKUQpxCjEgMCAwIDEgMTAwLjI1NTMgNzU1Ljg1NzcgY20KMCAwIG0KLTAuMDAzIDAuMDE1IGwKLTAuMTUxIDAuOTk3IC0wLjM0OSAxLjU3NSAtMC42MDEgMS43NSBjCi0wLjY4NSAxLjc4OCAtMC44MDQgMS44NDkgLTAuOTU1IDEuOTI3IGMKLTEuMDc2IDIuMDMxIC0xLjE0OSAyLjE5IC0xLjE4IDIuNDA0IGMKLTEuMjM1IDIuODAzIC0xLjA1MiAzLjEzIC0wLjYyNiAzLjM4NCBjCi0wLjI3NiAzLjU5OCAwLjE3OCAzLjczNiAwLjcyNiAzLjc5NiBjCjAuNzcxIDMuODAyIDAuODM4IDMuODExIDAuOTI0IDMuODIzIGMKMS4wMDMgMy44MzMgMS4wNjMgMy44NCAxLjEwOSAzLjg0NiBjCjEuMDQ2IDMuODM5IDEuMzQ2IDMuODc4IDIuMDA5IDMuOTY1IGMKMi4zMTQgNC4wMDQgMi43NTcgNC4xMDIgMy4zNCA0LjI1NyBjCjMuOTIyIDQuNDEzIDQuMzUzIDQuNTA5IDQuNjMxIDQuNTQ0IGMKNC45OTkgNC41OTMgNS4zMjEgNC4zNjggNS42MDUgMy44NjcgYwo1LjgyOSAzLjQ3OSA1Ljk3NiAzLjA0NSA2LjA0IDIuNTY3IGMKNi4wODUgMi4yNjUgNi4wNjQgMi4wMDUgNS45NzggMS43ODQgYwo1Ljg4NCAxLjUxNCA1LjcxMyAxLjM2MSA1LjQ2OSAxLjMyOSBjCjUuMjU3IDEuMzAzIDUuMDYgMS40MTIgNC44NzUgMS42NTUgYwo0LjU5OSAyLjAyNiA0LjQwNiAyLjI0OSA0LjI5OCAyLjMyNiBjCjMuOTk5IDIuNTU1IDMuNjA1IDIuNjMzIDMuMTE3IDIuNTU4IGMKMi41MTYgMi40NiAyLjIzOSAyLjIzNiAyLjI4OSAxLjg4NCBjCjIuMzQyIDEuNTIzIDIuNTA4IDEuMjYyIDIuNzg5IDEuMDk5IGMKMy4wNDIgMC45NjQgMy4zMzUgMC45MTggMy42OCAwLjk2MyBjCjMuNzUxIDAuOTcyIDMuODMzIDEuMDMgMy45MzcgMS4xMzcgYwo0LjAzOCAxLjI0NiA0LjEyOCAxLjMwNSA0LjIwOCAxLjMxNSBjCjQuMzQ4IDEuMzMzIDQuNDk4IDAuNzYxIDQuNjYyIC0wLjM5OSBjCjQuNjg0IC0wLjU0NSA0LjY2MSAtMC42ODMgNC42MDIgLTAuODEgYwo0LjUzNyAtMC45MzcgNC40NDIgLTEuMDEgNC4zMTMgLTEuMDI2IGMKNC4yMTUgLTEuMDM4IDQuMDQ1IC0wLjkyNyAzLjc5OSAtMC42OSBjCjMuNTUyIC0wLjQ1NSAzLjMwMSAtMC4zNTMgMy4wNDkgLTAuMzg2IGMKMi44NDggLTAuNDExIDIuNzM0IC0wLjUwMyAyLjcwMSAtMC42NTYgYwoyLjY4NiAtMC43MzcgMi42OTQgLTAuOTI1IDIuNzI4IC0xLjIxOSBjCjIuODYyIC0yLjQzMiAzLjExMyAtMy41MzcgMy40NzYgLTQuNTMyIGMKMy41NSAtNC43NTMgMy44MzggLTUuMDYzIDQuMzM5IC01LjQ2NCBjCjQuNzkgLTUuODMzIDUuMDI0IC02LjE3IDUuMDQyIC02LjQ3NiBjCjUuMDYgLTYuOCA0LjgwMyAtNi45OTggNC4yNzMgLTcuMDY4IGMKNC4xMzUgLTcuMDg3IDMuOTI1IC03LjEwMSAzLjY1NCAtNy4xMSBjCjMuMzc4IC03LjEyMyAzLjE4NCAtNy4xMzUgMy4wNzMgLTcuMTUxIGMKMC42MTQgLTcuNDcxIGwKMC4xNyAtNy41MyAtMC4wODcgLTcuMzE1IC0wLjE1NiAtNi44MjggYwotMC4xODYgLTYuNjM0IC0wLjExMyAtNi4zODYgMC4wNiAtNi4wODYgYwowLjE5NSAtNS44NjEgMC4zMzQgLTUuNjM0IDAuNDY3IC01LjQwOSBjCjAuNjY3IC01LjA0NCAwLjcyOCAtNC42NDUgMC42NTggLTQuMjEgYwpoCmYKUQpxCjEgMCAwIDEgMTA5LjM2NTggNzU5LjMzMjYgY20KMCAwIG0KMC4xMDUgLTAuNzUyIDAuMDA1IC0xLjYzNCAtMC4zMDUgLTIuNjQ4IGMKLTAuNjQ2IC0zLjgxNiAtMS4xMTMgLTQuNDM4IC0xLjcwNyAtNC41MTYgYwotMi4wMDMgLTQuNTUzIC0yLjE3IC00LjQzMiAtMi4yMTIgLTQuMTQ4IGMKLTIuMjI0IC00LjA3MSAtMi4xMjggLTMuODI1IC0xLjkyOSAtMy40MTIgYwotMS43MzEgLTIuOTk4IC0xLjY1MSAtMi42NDYgLTEuNjk0IC0yLjM1MSBjCi0xLjcxMSAtMi4yMjYgLTEuOTA4IC0xLjk1MSAtMi4yODggLTEuNTI4IGMKLTIuNjY3IC0xLjEwNiAtMi44ODEgLTAuNzEzIC0yLjkzNCAtMC4zNTIgYwotMyAwLjExNiAtMi45MiAwLjU4MyAtMi42OTMgMS4wNSBjCi0yLjQ0NSAxLjU1OSAtMi4xMTYgMS44NCAtMS43MDYgMS44OTQgYwotMS4yNDQgMS45NTQgLTAuODUxIDEuNzcyIC0wLjUyNiAxLjM0NyBjCi0wLjI1IDAuOTg1IC0wLjA3NiAwLjUzNyAwIDAgYwpmClEKcQoxIDAgMCAxIDExMi4wMTM3IDc1My43OTE3IGNtCjAgMCBtCjAuNiAwLjA3NyAwLjg1NSAwLjQ0IDAuNzYyIDEuMDg1IGMKMC43MzIgMS4zMDEgMC40OSAxLjU3NSAwLjAzNCAxLjkwNSBjCi0wLjY0OCAyLjQxMyAtMS4wNjQgMi43MzkgLTEuMjA4IDIuODggYwotMS42NzcgMy4zMjcgLTEuOTUgMy44MDEgLTIuMDIxIDQuMyBjCi0yLjE0NyA1LjE5MSAtMS45MjkgNS45MzcgLTEuMzY1IDYuNTQgYwotMC44NjMgNy4wNzUgLTAuMjAyIDcuMzk1IDAuNjE2IDcuNTAyIGMKMC44NzggNy41MzYgMS4yNjIgNy41MjkgMS43NzEgNy40ODIgYwoyLjI3OSA3LjQzNCAyLjY3IDcuNDI4IDIuOTQgNy40NjIgYwozLjQxMSA3LjUyNCAzLjczMiA2Ljk1IDMuOTAzIDUuNzQgYwozLjk5OSA1LjA0NiAzLjgwMyA0LjY2OSAzLjMxNSA0LjYwNSBjCjIuOTc3IDQuNTYyIDIuNjEzIDQuNzk5IDIuMjIzIDUuMzIgYwoxLjgzNCA1Ljg0MSAxLjQ5NyA2LjA4MiAxLjIwOSA2LjA0NCBjCjAuNTcxIDUuOTYxIDAuMjkyIDUuNjYgMC4zNjQgNS4xNDIgYwowLjQwNyA0LjgzOSAwLjgxMiA0LjU0MiAxLjU4MSA0LjI1NCBjCjIuNjIgMy44NzEgMy4zNCAzLjUzMiAzLjczNyAzLjIzNSBjCjQuNTQ5IDIuNjMyIDUuMDMyIDEuNzg4IDUuMTg1IDAuNzAzIGMKNS4zNTEgLTAuNDgxIDUuMTQ3IC0xLjUgNC41NzEgLTIuMzU0IGMKMy45OTUgLTMuMjA1IDMuMTg0IC0zLjY5OCAyLjEzOCAtMy44MzYgYwoxLjA2NiAtMy45NzUgMC4xNTIgLTMuNzk3IC0wLjYwMiAtMy4yOTUgYwotMS40MzUgLTIuNzU1IC0xLjkzMiAtMS45IC0yLjA5NyAtMC43MjUgYwotMi4xODEgLTAuMTM4IC0xLjk1MSAwLjE5MSAtMS40MTMgMC4yNjIgYwotMS4yMzUgMC4yODUgLTEuMDQ0IDAuMjM3IC0wLjgzOCAwLjExNSBjCi0wLjYyOCAtMC4wMDkgLTAuMzUyIC0wLjA0NyAwIDAgYwpmClEKcQoxIDAgMCAxIDEyNC4yNDkgNzU4Ljk4IGNtCjAgMCBtCi0wLjE0OCAwLjk5MyAtMC4zNTEgMS41NzggLTAuNjA1IDEuNzUzIGMKLTAuNjkxIDEuNzkzIC0wLjgxIDEuODUxIC0wLjk2NiAxLjkzMSBjCi0xLjA3NyAyLjAzNSAtMS4xNDggMi4xOTUgLTEuMTc4IDIuNDEgYwotMS4yMzUgMi44MSAtMS4wNTEgMy4xMzcgLTAuNjIzIDMuMzkxIGMKLTAuMjgxIDMuNjA0IDAuMTY5IDMuNzQyIDAuNzI5IDMuODA1IGMKMS40OTcgMy44OTYgMi4wNTYgMy44NjQgMi40MDcgMy43MTMgYwoyLjY5MSAzLjU5IDIuODU1IDMuMzY4IDIuODk5IDMuMDQ2IGMKMi45MjkgMi44NTEgMi45MDUgMi43MDQgMi44MzYgMi42MDUgYwoyLjc2NyAyLjUwNSAyLjY5MyAyLjQxMyAyLjYyNCAyLjMyNCBjCjIuNTUgMi4yMzUgMi40OTkgMi4xMTkgMi40NjYgMS45NzUgYwoyLjM3IDEuNTI2IDIuMzgyIDAuODYxIDIuNTA2IC0wLjAxNyBjCjIuNTAyIDAuMDEyIGwKMi41NzMgLTAuMzY1IDIuNzE2IC0xLjAxOCAyLjkyOCAtMS45NDUgYwozLjExNCAtMi43NzMgMy4yNCAtMy40MjIgMy4zMDggLTMuODkxIGMKMy40NTggLTQuOTQ1IDMuMzExIC01LjgwNSAyLjg3MSAtNi40NjcgYwoyLjQzMyAtNy4xMzEgMS43NDcgLTcuNTIzIDAuODE0IC03LjY0NCBjCi0wLjExOCAtNy43NjYgLTAuODgzIC03LjYxNCAtMS40NzUgLTcuMTgzIGMKLTIuMTA3IC02LjczIC0yLjQ5NyAtNS45OTEgLTIuNjQgLTQuOTY2IGMKLTIuNjgxIC00LjY4MyAtMi42NjUgLTQuMzUzIC0yLjU5NCAtMy45NzcgYwotMi41MDkgLTMuNTA4IC0yLjM2MSAtMy4yMzUgLTIuMTQ5IC0zLjE1OCBjCi0yLjA0OSAtMy4xMTQgLTEuOTYgLTMuMDg4IC0xLjg4MiAtMy4wNzggYwotMS42MzYgLTMuMDQ3IC0xLjM5OSAtMy4yMDMgLTEuMTY4IC0zLjU1MiBjCi0wLjkzNiAtMy44OTggLTAuNjg0IC00LjA1NiAtMC40MDMgLTQuMDE4IGMKMC4yODQgLTMuOTI4IDAuNTIzIC0zLjEzMiAwLjMxIC0xLjYyOSBjCjAuMjc3IC0xLjM5NiAwLjE4OCAtMC44ODEgMC4wNCAtMC4wODUgYwowLjAxOSAtMC4wNTggMC4wMDYgLTAuMDMgMCAwIGMKZgpRCnEKMSAwIDAgMSAxMzYuMTAyNyA3NjAuMDA0NSBjbQowIDAgbQowLjA0OSAtMC4zMzEgMC4xMjQgLTAuODI2IDAuMjI5IC0xLjQ4NCBjCjAuMzM2IC0yLjE0IDAuNDE0IC0yLjYzNCAwLjQ1OSAtMi45NjYgYwowLjU5MyAtMy45MTIgMC4zNSAtNC44NjIgLTAuMjcgLTUuODExIGMKLTAuODg5IC02Ljc2MSAtMS42MjYgLTcuMjkzIC0yLjQ4NCAtNy40MDQgYwotNC4wMjQgLTcuNjA0IC01LjE1NyAtNy40MjEgLTUuODc3IC02Ljg0OSBjCi02LjYyNSAtNi4yNjEgLTcuMTE3IC01LjEyOCAtNy4zNTYgLTMuNDQ5IGMKLTcuNDAyIC0zLjEyNyAtNy40NTUgLTIuNjQxIC03LjUxMyAtMS45OTQgYwotNy41NzUgLTEuMzQ2IC03LjYyNiAtMC44NjIgLTcuNjcyIC0wLjUzOSBjCi03Ljc3MyAwLjE3MyAtNy45MTYgMC42ODUgLTguMTAzIDAuOTk5IGMKLTguMTk1IDEuMTQ2IC04LjM1NCAxLjI5NCAtOC41OCAxLjQ0NSBjCi04Ljc0NiAxLjU1MiAtOC44NDUgMS43MTUgLTguODc0IDEuOTI3IGMKLTguOTM0IDIuMzQ3IC04LjcyOCAyLjY4NiAtOC4yNTkgMi45NDcgYwotNy45MzkgMy4xMjcgLTcuNTQyIDMuMjQ4IC03LjA3MyAzLjMxIGMKLTUuNjQxIDMuNDk3IC00Ljg3OCAzLjI0OSAtNC43ODIgMi41NjUgYwotNC43NTIgMi4zNTEgLTQuOCAyLjE2MSAtNC45MyAxLjk5NSBjCi01LjEgMS43NzMgLTUuMTk5IDEuNjA3IC01LjIzMSAxLjQ5MiBjCiAKLTUuMzI0IDEuMDg0IC01LjMwNCAwLjQyIC01LjE3NSAtMC40OTYgYwotNS4xOSAtMC40NyBsCi01LjA1OCAtMS4zNjUgLTQuODkyIC0xLjk2IC00LjcwMiAtMi4yNTQgYwotNC40MTIgLTIuNjczIC0zLjg5NiAtMi44MzMgLTMuMTUzIC0yLjczNiBjCi0yLjUyOSAtMi42NTUgLTIuMTIyIC0yLjQ1MyAtMS45NCAtMi4xMzEgYwotMS43NiAtMS44MDggLTEuNzIxIC0xLjI4OCAtMS44MjIgLTAuNTY2IGMKLTEuOTI1IDAuMTc1IC0yLjAzNiAwLjc1MyAtMi4xNDcgMS4xNjYgYwotMi4yNzkgMS42NjUgLTIuNDgxIDEuOTgyIC0yLjc0OCAyLjExNiBjCi0yLjk4NCAyLjIyMyAtMy4xMjMgMi40MSAtMy4xNiAyLjY3MyBjCi0zLjI2NiAzLjQyNCAtMi42MzEgMy44OTEgLTEuMjUyIDQuMDcgYwotMC44OTYgNC4xMTYgLTAuNTcyIDQuMDk0IC0wLjI4NCA0LjAwMiBjCjAuMDk4IDMuODc0IDAuMzE0IDMuNjMzIDAuMzYzIDMuMjgxIGMKMC4zOTQgMy4wNjggMC4zNDUgMi44NzcgMC4yMTggMi43MTIgYwowLjA1MyAyLjUwMSAtMC4wNDQgMi4zMzkgLTAuMDczIDIuMjI2IGMKLTAuMTcgMS43NzYgLTAuMTQ1IDEuMDM0IDAgMCBjCmYKUQpxCjEgMCAwIDEgMTQxLjExODEgNzU4LjcyMjMgY20KMCAwIG0KMC4wMzcgLTAuMjQ1IDAuMTc5IC0wLjY4MSAwLjQzMiAtMS4zMDkgYwowLjY4MyAtMS45MzYgMC44NjYgLTIuMzEzIDAuOTc3IC0yLjQzNyBjCjEuMDg3IC0yLjU2MyAxLjIwMyAtMi42ODYgMS4zMjkgLTIuODA5IGMKMS40ODMgLTIuOTU4IDEuNTg1IC0zLjEwOSAxLjYzNSAtMy4yNjIgYwoxLjY4NyAtMy40NTMgMS43MjYgLTMuNjI3IDEuNzQ3IC0zLjc4MyBjCjEuODA5IC00LjIxMiAxLjcxMSAtNC41MzIgMS40NTcgLTQuNzQ0IGMKMS4yNDggLTQuOTExIDAuODU1IC01LjA0NSAwLjI3NiAtNS4xNTMgYwowLjAxMSAtNS4yMjcgLTAuNTc1IC01LjMyMyAtMS40ODMgLTUuNDQxIGMKLTEuODMyIC01LjQ4NyAtMi4xOTggLTUuNDU2IC0yLjU4NiAtNS4zNDcgYwotMi45MjkgLTUuMjYyIC0zLjE2NyAtNS4xMSAtMy4zMDUgLTQuODg5IGMKLTMuNDI0IC00LjczNiAtMy41IC00LjU0NyAtMy41MzEgLTQuMzIyIGMKLTMuNTM2IC00LjI4MyAtMy41NDIgLTQuMjQyIC0zLjU0OSAtNC4xOTggYwotMy41NTQgLTQuMTU0IC0zLjU2MyAtNC4xMDIgLTMuNTcgLTQuMDQ2IGMKLTMuNTg3IC0zLjkxOCAtMy41NDkgLTMuNzc4IC0zLjQ1NCAtMy42MjcgYwotMy4zNzYgLTMuNTA2IC0zLjI5MSAtMy4zODEgLTMuMjAzIC0zLjI1MSBjCi0zLjA5OSAtMi4xMDUgLTMuMDU3IC0xLjA0NyAtMy4wNzkgLTAuMDc2IGMKLTMuMDkxIDAuNzA4IC0zLjEyNCAxLjQxOSAtMy4xOCAyLjA1OCBjCi0zLjI1OCAyLjk5MiAtMy40NiAzLjU3MiAtMy43ODUgMy43OTggYwotMy44NjkgMy44MzYgLTMuOTkgMy44OTUgLTQuMTQzIDMuOTc1IGMKLTQuMjY0IDQuMDc4IC00LjMzNyA0LjIzNyAtNC4zNjkgNC40NTEgYwotNC40MjcgNC44NTEgLTQuMjQzIDUuMTc4IC0zLjgxNiA1LjQzMyBjCi0zLjQ3MyA1LjY0NiAtMy4wMjEgNS43ODQgLTIuNDYyIDUuODQ4IGMKLTEuNTEgNS45NTEgLTAuODc4IDUuODgxIC0wLjU2NyA1LjYzMiBjCi0wLjExNyA1LjM4NCAwLjM1OCA0LjcxIDAuODUgMy42MTIgYwoxLjM4NyAyLjQzMSAxLjg1OSAxLjY3MyAyLjI2MiAxLjMzNyBjCjIuMzYyIDEuMjYxIDIuNDYyIDEuMjQ5IDIuNTYxIDEuMzAyIGMKMi42NDMgMS40NjIgMi42NjUgMS42ODMgMi42MjggMS45NjYgYwoyLjYxMSAyLjA3MyAyLjU3NCAyLjIzOCAyLjUxNSAyLjQ1OSBjCjIuNTE1IDIuNDc4IDIuNTEgMi41MDIgMi41MDQgMi41MzEgYwoyLjQ4OCAyLjU1OCBsCjIuNDMgMi43OSAyLjM2NCAzLjAzNSAyLjI5NCAzLjI5NCBjCjIuMDY5IDMuODIxIDEuNzY3IDQuMjE0IDEuMzkzIDQuNDczIGMKMS4zMDggNC41MTMgMS4xOSA0LjU3MSAxLjAzNyA0LjY1IGMKMC45MjMgNC43NTQgMC44NTMgNC45MTQgMC44MjEgNS4xMjkgYwowLjc2NCA1LjUyOSAwLjk0OCA1Ljg1NiAxLjM3NyA2LjEwOSBjCjEuNzE2IDYuMzI0IDIuMTY3IDYuNDYzIDIuNzI4IDYuNTI2IGMKMy40OTYgNi42MTUgNC4wNTUgNi41ODQgNC40MDggNi40MzEgYwo0LjY5IDYuMzA5IDQuODU0IDYuMDg3IDQuODk5IDUuNzY1IGMKNC45MjggNS41NyA0LjkwOSA1LjQyNCA0Ljg0MyA1LjMyNiBjCjQuNzc1IDUuMjI3IDQuNzAzIDUuMTM0IDQuNjI3IDUuMDQ1IGMKNC41NTEgNC45NTUgNC40OTcgNC44MzggNC40NjUgNC42OTUgYwo0LjM5IDQuNDc3IDQuMzE0IDQuMjU0IDQuMjM5IDQuMDI1IGMKNC4xMzUgMy42NDMgNC4xMTIgMy4yMjggNC4xNzYgMi43OCBjCjQuMTczIDIuNzk5IDQuMTgxIDIuNzM1IDQuMjAzIDIuNTkgYwo0LjI5NiAyLjA1NSA0LjU0NyAxLjI2MyA0Ljk1MSAwLjIxNCBjCjUuMzM1IC0wLjc5MSA1LjU2NCAtMS41ODEgNS42NDUgLTIuMTU3IGMKNS43NTIgLTIuOTE3IDUuNzcgLTMuNDUyIDUuNjk5IC0zLjc1OCBjCjUuNTggLTQuMjQyIDUuMjMzIC00LjUyIDQuNjU5IC00LjU5NSBjCjQuMDIyIC00LjY3OCAzLjM4IC00LjI5IDIuNzM3IC0zLjQyOSBjCjIuNTcxIC0zLjIwNCAyLjA5MSAtMi4zOTEgMS4yOTkgLTAuOTk0IGMKMC44MDQgLTAuMTE2IDAuNDA2IDAuMzA2IDAuMTEgMC4yNjYgYwowLjAxMyAwLjI1NCAtMC4wMjIgMC4xNjUgMCAwIGMKZgpRCnEKMSAwIDAgMSAxNTAuNjQwMSA3NjAuODg3NiBjbQowIDAgbQowLjU1IC0xLjk0NiAwLjkzNiAtMy4wNTIgMS4xNjEgLTMuMzIxIGMKMS4yOTYgLTMuNDQzIDEuNDM4IC0zLjU3NCAxLjU4NCAtMy43MTQgYwoxLjczMiAtMy44NTQgMS44MTcgLTQuMDAxIDEuODQgLTQuMTU4IGMKMS45NTUgLTQuOTU4IDEuODQgLTUuNDc0IDEuNSAtNS43MDYgYwoxLjI0MSAtNS44OSAwLjUwNSAtNi4wNiAtMC43MDcgLTYuMjE4IGMKLTEuNzYzIC02LjM1NiAtMi40NjQgLTYuMzA5IC0yLjgxNyAtNi4wNzQgYwotMi45NDcgLTYuMDg0IC0zLjAzNiAtNS45OTUgLTMuMDgxIC01LjgxMyBjCi0zLjIxOCAtNS42MTMgLTMuMzEgLTUuMzIgLTMuMzY1IC00Ljk0IGMKLTMuMzg0IC00Ljc5NCAtMy4zMjQgLTQuNjIyIC0zLjE4NCAtNC40MjUgYwotMy4wMTMgLTQuMTg0IC0yLjkxOCAtNC4wMjggLTIuOTAyIC0zLjk1NiBjCi0yLjU1MSAtMi43MzggLTIuNTIxIC0xLjAyNSAtMi44MTYgMS4xODIgYwotMi45NjIgMi4xNjggLTMuMTY1IDIuNzQ3IC0zLjQyMSAyLjkyMiBjCi0zLjUwNiAyLjk2IC0zLjYyNSAzLjAyIC0zLjc4IDMuMDk5IGMKLTMuODkyIDMuMjAzIC0zLjk2MyAzLjM2NCAtMy45OTcgMy41NzggYwotNC4wNTEgMy45NzcgLTMuODY1IDQuMzA1IC0zLjQ0IDQuNTU5IGMKLTMuMDk2IDQuNzcyIC0yLjY0NSA0LjkxIC0yLjA4NSA0Ljk3NCBjCi0xLjMyIDUuMDY1IC0wLjc2IDUuMDM0IC0wLjQwOCA0Ljg3OSBjCi0wLjEyMyA0Ljc1OSAwLjA0MSA0LjUzNSAwLjA4NyA0LjIxNCBjCjAuMTEzIDQuMDIgMC4wOTMgMy44NzIgMC4wMjQgMy43NzQgYwotMC4wNTEgMy42NzUgLTAuMTIgMy41ODEgLTAuMTk0IDMuNDkzIGMKLTAuMjY0IDMuNDAzIC0wLjMxNiAzLjI4OCAtMC4zNDggMy4xNDUgYwotMC4zOTcgMi45MTkgLTAuNDE4IDIuNjM4IC0wLjQwMyAyLjMwMyBjCi0wLjM0NyAxLjk1MiAtMC4yMTMgMS43OTEgLTAuMDAzIDEuODE4IGMKMC43MTEgMS45MTIgMS4wMDMgMi40MjggMC44NyAzLjM2OSBjCjAuODQ4IDMuNTE1IDAuNzcyIDMuNjY2IDAuNjM1IDMuODE3IGMKMC40OTggMy45NjkgMC40MTkgNC4xMTkgMC4zOTYgNC4yNjUgYwowLjM0NiA0LjYyOSAwLjUwNSA0LjkxMyAwLjg3NSA1LjEyMiBjCjEuMTk3IDUuMzAyIDEuNzQyIDUuNDUzIDIuNTE3IDUuNTc1IGMKMi45OTQgNS42NDggMy4zMTcgNS42NTkgMy40ODYgNS42MTEgYwozLjc3MSA1LjUxOSAzLjk1MiA1LjI0MyA0LjAyNyA0Ljc4MyBjCjQuMDcyIDQuNDcxIDMuOTIyIDQuMjM2IDMuNTgxIDQuMDgyIGMKMy4zMTQgMy45OTkgMy4wNTEgMy45MTQgMi43OTEgMy44MyBjCjIuNTM5IDMuNzA3IDIuMzIgMy40NDUgMi4xMjcgMy4wNDEgYwoxLjg1NyAyLjQ2NSAxLjc3NSAxLjc5OCAxLjg5IDEuMDM0IGMKMi4wMTYgMC4yNDIgMi42NDQgLTAuNjMzIDMuNzgzIC0xLjU5MiBjCjQuNTA1IC0yLjE5NiA1LjIxNCAtMi42ODIgNS45MDQgLTMuMDUyIGMKNi4wNTggLTMuMTMxIDYuMzg2IC0zLjMyNyA2Ljg5MiAtMy42NDEgYwo2Ljk2MiAtMy42ODIgNy4wMzEgLTMuNzgxIDcuMTAzIC0zLjk0MyBjCjcuMTc0IC00LjEwMyA3LjIxNyAtNC4yMzEgNy4yMjkgLTQuMzI5IGMKNy4yNzkgLTQuNjgxIDcuMTg3IC00LjkzOSA2Ljk1MiAtNS4xIGMKNi43OTkgLTUuMTk5IDYuNTMzIC01LjI3NCA2LjE1OCAtNS4zMjEgYwo0LjYzIC01LjUyMSBsCjQuMjk2IC01LjU2NiA0LjAxMiAtNS41MTggMy43NjkgLTUuMzggYwozLjQ2MyAtNS4yMiAzLjA0MSAtNC42NDEgMi41IC0zLjY0MiBjCjIuMDU4IC0yLjc4MyAxLjYxMyAtMS45MjIgMS4xNjQgLTEuMDYyIGMKMC42NzYgLTAuMTc5IDAuMzIgMC4yNSAwLjEwMyAwLjIyMyBjCjAuMDU4IDAuMjI2IDAuMDI0IDAuMjA3IDAuMDAzIDAuMTY0IGMKLTAuMDE2IDAuMTIyIC0wLjAxNyAwLjA2NyAwIDAgYwpmClEKcQoxIDAgMCAxIDE2MC41Mzg5IDc1Ny4yMDM5IGNtCjAgMCBtCjAuMDU0IC0wLjM4NSAtMC4wMTcgLTAuNjkzIC0wLjIxMiAtMC45MjEgYwotMC4zODkgLTEuMTM0IC0wLjY1IC0xLjI2NCAtMS4wMDEgLTEuMzA4IGMKLTEuMjk5IC0xLjM0OCAtMS41NTIgLTEuMjc4IC0xLjc1NSAtMS4wOTkgYwotMS45NjQgLTAuOTIgLTIuMDkzIC0wLjY1OSAtMi4xNDEgLTAuMzE4IGMKLTIuMTg2IDAuMDE2IC0yLjEzNSAwLjM2NiAtMS45ODEgMC43MzMgYwotMS44MDcgMS4xMzUgLTEuNTc2IDEuMzU1IC0xLjI5NSAxLjM5MiBjCi0wLjk5NSAxLjQzIC0wLjcxMyAxLjI4OSAtMC40NDUgMC45NjIgYwotMC4xOTYgMC42NjggLTAuMDQ5IDAuMzQ3IDAgMCBjCmYKUQpxCjEgMCAwIDEgMTYzLjIyMzMgNzU4LjY3MzEgY20KMCAwIG0KMC4xMzQgMC4wMTggMC4yNzcgMC4wODYgMC40MzEgMC4yMDggYwowLjU4NyAwLjMzMSAwLjcwNyAwLjM5NiAwLjc5NCAwLjQwNyBjCjAuOTUyIDAuNDI5IDEuMTAzIDAuMzg3IDEuMjM3IDAuMjg0IGMKMS4zNzEgMC4xODIgMS40NSAwLjA0MSAxLjQ3NiAtMC4xNCBjCjEuNTUxIC0wLjY4MiAxLjQzOCAtMS4xNTYgMS4xMjkgLTEuNTU4IGMKMC44MjEgLTEuOTYxIDAuNDE4IC0yLjE5NCAtMC4wNzMgLTIuMjU2IGMKLTAuNjg4IC0yLjMzOCAtMS4yMjEgLTIuMTM1IC0xLjY2OCAtMS42NTIgYwotMi4wNzcgLTEuMjEgLTIuMzMgLTAuNjM0IC0yLjQyOSAwLjA3MSBjCi0yLjU0MyAwLjg2NiAtMi40NTMgMS41NyAtMi4xNTggMi4xODMgYwotMS44MzIgMi44NiAtMS4zMjQgMy4yNDQgLTAuNjM1IDMuMzMyIGMKLTAuMjY4IDMuMzgxIDAuMDY1IDMuMzE4IDAuMzY1IDMuMTUxIGMKMC43MDEgMi45NTcgMC44OTcgMi42NjcgMC45NTIgMi4yNzQgYwowLjk3NiAyLjA5MyAwLjk2MyAxLjkzOSAwLjkxMiAxLjgwNyBjCjAuODQ2IDEuNjQ4IDAuNzQgMS41NTkgMC41OSAxLjU0IGMKMC40NjMgMS41MjMgMC4zMDIgMS41OTQgMC4xMDQgMS43NTYgYwotMC4wOTQgMS45MTYgLTAuMjU5IDEuOTg3IC0wLjM5IDEuOTcxIGMKLTAuNTkzIDEuOTQ1IC0wLjc0NiAxLjgxNiAtMC44NDkgMS41ODQgYwotMC45NTMgMS4zNTIgLTAuOTkgMS4xMTggLTAuOTU3IDAuODgyIGMKIAotMC45MjQgMC42NTcgLTAuODA4IDAuNDQ3IC0wLjYwNyAwLjI1NCBjCi0wLjQwMSAwLjA1OCAtMC4xOTkgLTAuMDI3IDAgMCBjCmYKUQpxCjEgMCAwIDEgMTY5LjE2MDEgNzU4LjM2NzcgY20KMCAwIG0KMC4wNTIgLTAuMzY1IC0wLjA2NCAtMC42NzMgLTAuMzUyIC0wLjkxOSBjCi0wLjU5OCAtMS4xMzQgLTAuODk0IC0xLjI2NCAtMS4yNDUgLTEuMzEgYwotMS4zOTggLTEuMzMxIC0xLjU2NSAtMS4zMDUgLTEuNzM2IC0xLjIzMyBjCi0xLjkxMiAtMS4xNjEgLTIuMDI5IC0xLjEyOCAtMi4wODQgLTEuMTM3IGMKLTIuMTY1IC0xLjE0NyAtMi4yODYgLTEuMTkgLTIuNDQ3IC0xLjI2NiBjCi0yLjYwOCAtMS4zNDIgLTIuNzM2IC0xLjM4NyAtMi44MjggLTEuMzk5IGMKLTMuMTUgLTEuNDQxIC0zLjQzOSAtMS4zMzYgLTMuNjk1IC0xLjA4MiBjCi0zLjk1NCAtMC44MjcgLTQuMTA5IC0wLjUxNiAtNC4xNjIgLTAuMTUgYwotNC4yNCAwLjM4OSAtNC4xMzIgMC44ODcgLTMuODQ2IDEuMzQ0IGMKLTMuNTcyIDEuNzcxIC0zLjIwNSAyLjA3OCAtMi43NDEgMi4yNjUgYwotMi42ODQgMi4yNzYgLTIuNjAzIDIuMzE0IC0yLjQ5NiAyLjM3NCBjCi0yLjM5MSAyLjQzNCAtMi4zNSAyLjU1NiAtMi4zNzYgMi43NDIgYwotMi40MzkgMy4xNzMgLTIuNTc3IDMuMzc0IC0yLjc5NyAzLjM0NSBjCi0yLjkyOSAzLjMyOCAtMy4wMjkgMy4yMzUgLTMuMSAzLjA2NCBjCi0zLjE3NCAyLjg5NSAtMy4yNDQgMi43MzEgLTMuMzA5IDIuNTczIGMKLTMuNDE3IDIuMzk1IC0zLjU3NCAyLjI5MyAtMy43NzUgMi4yNjUgYwotMy44ODQgMi4yNTIgLTMuOTc4IDIuMjg4IC00LjA1NyAyLjM3NyBjCi00LjEzNyAyLjQ2NCAtNC4xODUgMi41NjcgLTQuMjA1IDIuNjkgYwotNC4yNjIgMy4xMTUgLTQuMDg4IDMuNDcxIC0zLjY3OCAzLjc2MSBjCi0zLjM2IDMuOTg2IC0yLjk3OCA0LjEyOCAtMi41MzYgNC4xODQgYwotMS45NjUgNC4yNiAtMS41NjIgNC4xNTEgLTEuMzMyIDMuODYgYwotMS4xOSAzLjY2OSAtMS4wNzkgMy4zMDIgLTEuMDAzIDIuNzU0IGMKLTAuOTgyIDIuNjExIGwKLTAuOTE0IDIuMTQyIC0wLjgzNCAxLjc4NSAtMC43MzUgMS41NDMgYwotMC42OTggMS40NjMgLTAuNTY4IDEuMTg3IC0wLjM0MSAwLjcxNiBjCi0wLjExMiAwLjI0NiAtMC4wMDIgMC4wMDYgMCAwIGMKLTIuMjIgMS4zMTkgbQotMi4yNDUgMS40OTMgLTIuMjc3IDEuNTg3IC0yLjMyNCAxLjYwMSBjCi0yLjMzMSAxLjYyNiAtMi4zNTMgMS42MzggLTIuMzg3IDEuNjMyIGMKLTIuNTMxIDEuNjE0IC0yLjYzMyAxLjUyNyAtMi42OTEgMS4zNzEgYwotMi43NTMgMS4yMTYgLTIuNzcxIDEuMDU5IC0yLjc0OSAwLjg5OCBjCi0yLjcgMC41NTcgLTIuNTY1IDAuNDAxIC0yLjM0NyAwLjQyOSBjCi0yLjI2OCAwLjQ0IC0yLjIxNSAwLjU0MiAtMi4xOTIgMC43MzUgYwotMi4xNjcgMC44NzUgLTIuMTY2IDAuOTk5IC0yLjE4MiAxLjExIGMKLTIuMTg0IDEuMTM2IC0yLjE5MSAxLjE3IC0yLjE5NSAxLjIxNSBjCi0yLjIwOSAxLjI1OSAtMi4yMTcgMS4yOTUgLTIuMjIgMS4zMTkgYwpmClEKUQowIDAgMCAwIGsKcQoxIDAgMCAxIDcxLjAzMzQgNzQ0LjY2ODEgY20KMCAwIG0KMC4wMDUgLTAuNjA1IGwKNDYuNDkyIC0wLjQ1NCBsCjQ2LjQ4OSAwLjE1MiBsCmgKZgpRCnEKMCAwIDYxMiA3OTIgcmUKVyBuCjAgMCAwIDEgawovR1MwIGdzCnEKMSAwIDAgMSA1My4yODc3IDcxNS43MzA4IGNtCjAgMCBtCi0wLjA0NiA1Ljk2NCAtNS4wMzYgMTAuNzgyIC0xMS4xNDkgMTAuNzYzIGMKLTE3LjI2IDEwLjc0NCAtMjIuMTc4IDUuODkxIC0yMi4xMzIgLTAuMDczIGMKLTIyLjA4NiAtNi4wMzggLTE3LjA5MyAtMTAuODU3IC0xMC45ODMgLTEwLjgzOSBjCi00Ljg3IC0xMC44MTcgMC4wNDYgLTUuOTY1IDAgMCBjCmYKUQovQ1MwIGNzIDEgIHNjbgovR1MxIGdzCnEKMSAwIDAgMSA0OC40MTI3IDcxNS43MTUgY20KMCAwIG0KLTAuMDI2IDMuMzM3IC0yLjgxOCA2LjAzMiAtNi4yMzcgNi4wMjIgYwotOS42NTcgNi4wMSAtMTIuNDA5IDMuMjk3IC0xMi4zODMgLTAuMDQxIGMKLTEyLjM1NiAtMy4zNzkgLTkuNTY0IC02LjA3NiAtNi4xNDQgLTYuMDY0IGMKLTIuNzI1IC02LjA1MiAwLjAyNiAtMy4zMzggMCAwIGMKZgpRCjAgMCAwIDEgawovR1MwIGdzCnEKMSAwIDAgMSA0OC40MTI3IDcxNS43MTUgY20KMCAwIG0KMC4xMTUgMCBsCjAuMDg5IDMuMzk5IC0yLjc1NSA2LjE0NiAtNi4yMzggNi4xMzMgYwotOS43MjIgNi4xMjQgLTEyLjUyNCAzLjM1OCAtMTIuNDk4IC0wLjA0MSBjCi0xMi40NzIgLTMuNDQxIC05LjYyOCAtNi4xODggLTYuMTQzIC02LjE3NiBjCi0yLjY2MSAtNi4xNjYgMC4xNDEgLTMuNCAwLjExNSAwIGMKMCAwIGwKLTAuMTEzIDAgbAotMC4xMDEgLTEuNjQgLTAuNzcxIC0zLjEyNSAtMS44NjEgLTQuMjAxIGMKLTIuOTUyIC01LjI3OSAtNC40NjYgLTUuOTQ4IC02LjE0NSAtNS45NTMgYwotNy44MjMgLTUuOTU4IC05LjM0OSAtNS4yOTkgLTEwLjQ1NiAtNC4yMjkgYwotMTEuNTY0IC0zLjE2IC0xMi4yNTYgLTEuNjggLTEyLjI2OSAtMC4wNCBjCi0xMi4yODEgMS41OTcgLTExLjYxMyAzLjA4MyAtMTAuNTIgNC4xNTkgYwotOS40MyA1LjIzNyAtNy45MTUgNS45MDQgLTYuMjM2IDUuOTExIGMKLTQuNTU4IDUuOTE2IC0zLjAzMyA1LjI1NyAtMS45MjYgNC4xODcgYwotMC44MTkgMy4xMTYgLTAuMTI2IDEuNjM3IC0wLjExMyAwIGMKaApmClEKMCAwIDAgMCBrCi9HUzEgZ3MKcQoxIDAgMCAxIDQ0LjUzNSA3MTUuNzAxNCBjbQowIDAgbQotMC4wMSAxLjI0NiAtMS4wNTMgMi4yNTMgLTIuMzMgMi4yNSBjCi0zLjYwNyAyLjI0NSAtNC42MzYgMS4yMzEgLTQuNjI1IC0wLjAxNSBjCi00LjYxNSAtMS4yNjEgLTMuNTcyIC0yLjI2OSAtMi4yOTYgLTIuMjY1IGMKLTEuMDE4IC0yLjI2IDAuMDEgLTEuMjQ3IDAgMCBjCmYKUQowIDAgMCAxIGsKL0dTMCBncwpxCjEgMCAwIDEgNDQuNTM1IDcxNS43MDE0IGNtCjAgMCBtCjAuMTcxIDAuMDAyIGwKMC4xNiAxLjM0IC0wLjk2IDIuNDIxIC0yLjMzMSAyLjQxOSBjCi0zLjcwMyAyLjQxMyAtNC44MDcgMS4zMjIgLTQuNzk3IC0wLjAxNCBjCi00Ljc4NiAtMS4zNTUgLTMuNjY2IC0yLjQzOCAtMi4yOTQgLTIuNDMzIGMKLTAuOTIyIC0yLjQyOCAwLjE4MSAtMS4zMzkgMC4xNzEgMC4wMDIgYwowIDAgbAotMC4xNzMgMCBsCi0wLjE2OSAtMC41NzggLTAuNDAzIC0xLjEgLTAuNzg4IC0xLjQ4MSBjCi0xLjE3MiAtMS44NiAtMS43MDUgLTIuMDk0IC0yLjI5NyAtMi4wOTcgYwotMi44ODkgLTIuMDk5IC0zLjQyNCAtMS44NjYgLTMuODE2IC0xLjQ4OSBjCi00LjIwNyAtMS4xMTIgLTQuNDQ5IC0wLjU5MyAtNC40NTMgLTAuMDE0IGMKLTQuNDU4IDAuNTY0IC00LjIyMyAxLjA4NSAtMy44MzkgMS40NjUgYwotMy40NTIgMS44NDUgLTIuOTIxIDIuMDc4IC0yLjMyOSAyLjA4IGMKLTEuNzM3IDIuMDgzIC0xLjIwMSAxLjg1MiAtMC44MTEgMS40NzYgYwotMC40MiAxLjA5NyAtMC4xNzcgMC41NzcgLTAuMTczIDAgYwpoCmYKUQpxCjEgMCAwIDEgMTA1LjU5NTQgNzE1LjkwMjUgY20KMCAwIG0KLTAuMDQ1IDUuOTY0IC01LjAzNSAxMC43ODMgLTExLjE0NiAxMC43NjMgYwotMTcuMjU4IDEwLjc0MyAtMjIuMTc1IDUuODkyIC0yMi4xMyAtMC4wNzMgYwotMjIuMDgzIC02LjAzOCAtMTcuMDkxIC0xMC44NTcgLTEwLjk4IC0xMC44MzcgYwotNC44NjkgLTEwLjgxOCAwLjA0OCAtNS45NjYgMCAwIGMKZgpRCi9DUzAgY3MgMSAgc2NuCi9HUzEgZ3MKcQoxIDAgMCAxIDEwMC43MjUzIDcxNS44ODU2IGNtCjAgMCBtCi0wLjAyNyAzLjMzOCAtMi44MTkgNi4wMzQgLTYuMjM5IDYuMDIzIGMKLTkuNjYgNi4wMTEgLTEyLjQxMSAzLjI5OCAtMTIuMzg2IC0wLjAzOSBjCi0xMi4zNiAtMy4zNzggLTkuNTY4IC02LjA3NCAtNi4xNDUgLTYuMDYzIGMKLTIuNzI2IC02LjA1MyAwLjAyNSAtMy4zMzggMCAwIGMKZgpRCjAgMCAwIDEgawovR1MwIGdzCnEKMSAwIDAgMSAxMDAuNzI1MyA3MTUuODg1NiBjbQowIDAgbQowLjExNCAwLjAwMSBsCjAuMDg0IDMuNCAtMi43NTggNi4xNDYgLTYuMjQgNi4xMzQgYwotOS43MjMgNi4xMjMgLTEyLjUyNiAzLjM2IC0xMi41MDEgLTAuMDQgYwotMTIuNDczIC0zLjQ0MiAtOS42MjkgLTYuMTg3IC02LjE0NSAtNi4xNzcgYwotMi42NjQgLTYuMTY0IDAuMTQgLTMuNCAwLjExNCAwLjAwMSBjCjAgMCBsCi0wLjExNCAwIGwKLTAuMTAzIC0xLjYzOSAtMC43NzIgLTMuMTI0IC0xLjg2MiAtNC4yMDIgYwotMi45NTcgLTUuMjc4IC00LjQ3IC01Ljk0NiAtNi4xNDcgLTUuOTUxIGMKLTcuODI2IC01Ljk1OSAtOS4zNSAtNS4yOTkgLTEwLjQ2IC00LjIyOSBjCi0xMS41NjYgLTMuMTYgLTEyLjI2IC0xLjY3OSAtMTIuMjcyIC0wLjAzOSBjCi0xMi4yODYgMS41OTcgLTExLjYxNCAzLjA4MyAtMTAuNTIyIDQuMTU5IGMKLTkuNDMyIDUuMjM3IC03LjkxOSA1LjkwNyAtNi4yMzggNS45MTIgYwotNC41NjEgNS45MTcgLTMuMDM2IDUuMjYgLTEuOTI4IDQuMTg4IGMKLTAuODIgMy4xMTkgLTAuMTI3IDEuNjM3IC0wLjExNCAwIGMKaApmClEKMCAwIDAgMCBrCi9HUzEgZ3MKcQoxIDAgMCAxIDk2Ljg0NDkgNzE1Ljg3MzkgY20KMCAwIG0KLTAuMDEyIDEuMjQ2IC0xLjA1NCAyLjI1MyAtMi4zMyAyLjI0OCBjCi0zLjYwOCAyLjI0NCAtNC42MzUgMS4yMjkgLTQuNjI2IC0wLjAxNSBjCi00LjYxNiAtMS4yNjIgLTMuNTczIC0yLjI3IC0yLjI5NSAtMi4yNjUgYwotMS4wMTkgLTIuMjYzIDAuMDA5IC0xLjI0OCAwIDAgYwpmClEKMCAwIDAgMSBrCi9HUzAgZ3MKcQoxIDAgMCAxIDk2Ljg0NDkgNzE1Ljg3MzkgY20KMCAwIG0KMC4xNzEgMCBsCjAuMTYgMS4zMzkgLTAuOTU4IDIuNDIxIC0yLjMzMSAyLjQxNiBjCi0zLjcwMyAyLjQxMSAtNC44MDcgMS4zMjMgLTQuNzk3IC0wLjAxNiBjCi00Ljc4NiAtMS4zNTcgLTMuNjY1IC0yLjQzNiAtMi4yOTQgLTIuNDM0IGMKLTAuOTIyIC0yLjQyOSAwLjE4MSAtMS4zNCAwLjE3MSAwIGMKMCAwIGwKLTAuMTcxIC0wLjAwMiBsCi0wLjE2OCAtMC41NzkgLTAuNDAzIC0xLjEwMSAtMC43ODggLTEuNDgxIGMKLTEuMTc0IC0xLjg2IC0xLjcwNiAtMi4wOTcgLTIuMjk3IC0yLjA5NiBjCi0yLjg4OSAtMi4xIC0zLjQyNSAtMS44NjcgLTMuODE1IC0xLjQ5IGMKLTQuMjA2IC0xLjExNCAtNC40NSAtMC41OTMgLTQuNDU0IC0wLjAxNSBjCi00LjQ1OCAwLjU2MSAtNC4yMjMgMS4wODQgLTMuODM4IDEuNDYzIGMKLTMuNDUzIDEuODQzIC0yLjkyMSAyLjA3OCAtMi4zMjkgMi4wODEgYwotMS43MzggMi4wODEgLTEuMjAzIDEuODUxIC0wLjgxMiAxLjQ3NCBjCi0wLjQxOSAxLjA5NyAtMC4xNzYgMC41NzUgLTAuMTcxIC0wLjAwMiBjCmgKZgpRCnEKMSAwIDAgMSAxMTkuMzA3OSA3MjkuMjYxMiBjbQowIDAgbQotMC4xNzMgLTAuMDAxIGwKLTAuMTY4IC0wLjU3NyAtMC40MDMgLTEuMDk5IC0wLjc4NyAtMS40NzcgYwotMS4xNjkgLTEuODU3IC0xLjcwMSAtMi4wOTIgLTIuMjkzIC0yLjA5NCBjCi0yLjg4MyAtMi4wOTYgLTMuNDE5IC0xLjg2NCAtMy44MDggLTEuNDg4IGMKLTQuMTk5IC0xLjExMiAtNC40NDMgLTAuNTkxIC00LjQ0OCAtMC4wMTUgYwotNC40NTIgMC41NjIgLTQuMjE3IDEuMDgzIC0zLjgzMSAxLjQ2MiBjCi0zLjQ0NyAxLjg0MiAtMi45MTggMi4wNzcgLTIuMzI2IDIuMDc5IGMKLTEuNzM1IDIuMDgxIC0xLjE5OSAxLjg0OSAtMC44MDkgMS40NzIgYwogCi0wLjQxOCAxLjA5NSAtMC4xNzggMC41NzYgLTAuMTczIC0wLjAwMSBjCjAgMCBsCjAuMTcxIDAuMDAyIGwKMC4xNjEgMS4zMzcgLTAuOTU4IDIuNDE4IC0yLjMyOCAyLjQxMyBjCi0zLjY5OSAyLjQwOCAtNC44IDEuMzIyIC00Ljc5IC0wLjAxNiBjCi00Ljc3OSAtMS4zNTQgLTMuNjYxIC0yLjQzMyAtMi4yOSAtMi40MjkgYwotMC45MjEgLTIuNDI1IDAuMTgxIC0xLjMzNyAwLjE3MSAwLjAwMiBjCmgKZgpRCjAgMCAwIDAgawovR1MxIGdzCnEKMSAwIDAgMSA3MS4xNjg1IDc0NC4xNTk5IGNtCjAgMCBtCi0wLjEyMiAxNS44MDkgbAotMC4xNCAxOC4xMjUgLTQuMzM4IDE5LjQ5NiAtMTMuOTc0IDE5LjQ2NCBjCi0yMy42MDYgMTkuNDMyIC0yOC4zMjcgMTUuNzE2IHkKLTMyLjQyMSAzLjU3MyAtMzIuOTcxIDIuMzQ2IHYKLTQ2LjY1MyAyLjMgLTUxLjYgLTEuOTQgLTUwLjE5NCAtOS4yOTUgYwotNDguNzkgLTE2LjY1IC01MC4wMjggLTMwLjgyNSB5Ci00MS42MDYgLTMwLjc5OCBsCi00MS4zNyAtMjcuOTY4IC0zOS43NjcgLTE5LjY0IC0yOS4wMzUgLTE5LjE3MyBjCi0xOC44NDUgLTE4LjczMSAtMTYuNDA4IC0yNi44OTggLTE2LjI2MSAtMjcuODU0IGMKMTAuOTk1IC0yNy43NjMgbAoxMi4xOCAtMjUuMDA4IDE1LjQ1NyAtMTkuNzQ0IDIzLjE5MSAtMTkuODIgYwozMS44MjkgLTE5LjkwNCAzNC45MDUgLTI1LjM4MiAzNS43OTcgLTI3LjY4MiBjCjQwLjU2NSAtMjcuNjY3IGwKNDYuOTg5IC0yNy42NDYgbAo0Ni45NDQgLTIxLjkyMiBsCjQ2Ljc3NCAwLjE1NCBsCmgKZgpRCjAgMCAwIDEgawovR1MwIGdzCnEKMSAwIDAgMSA3MS4xNjg1IDc0NC4xNTk5IGNtCjAgMCBtCjAuMTcyIDAuMDAyIGwKMC4wNSAxNS44MDkgbAowLjA0NyAxNi40MzkgLTAuMjUyIDE3LjAxMyAtMC44MjcgMTcuNDg5IGMKLTEuNjkyIDE4LjIwNCAtMy4xNjkgMTguNzM0IC01LjMzNCAxOS4wOTcgYwotNy40OTkgMTkuNDU4IC0xMC4zNTYgMTkuNjQ0IC0xMy45NzUgMTkuNjMyIGMKLTIzLjY1NSAxOS42IC0yOC40MTMgMTUuODYzIC0yOC40MzQgMTUuODQ2IGMKLTI4LjQ3NCAxNS44MTYgbAotMjguNDg4IDE1Ljc2OSBsCi0yOC41NTIgMTUuNTggLTI4LjY2NiAxNS4yNDUgdgotMjkuMDYxIDE0LjA3NSAtMzAuMDU4IDExLjEzMyAtMzEuMDE2IDguMzQ4IGMKLTMxLjQ5NCA2Ljk1NSAtMzEuOTY0IDUuNjAzIC0zMi4zNDMgNC41MzIgYwotMzIuNTMzIDMuOTk3IC0zMi43IDMuNTMyIC0zMi44MzQgMy4xNjkgYwotMzIuOTY5IDIuODA1IC0zMy4wNyAyLjUzOCAtMzMuMTI4IDIuNDE0IGMKLTMyLjk3MSAyLjM0NiBsCi0zMi45NzIgMi41MTMgbAotMzkuMTE0IDIuNDkyIC00My41MTUgMS42MzEgLTQ2LjM5NyAwLjAwNCBjCi00Ny44MzcgLTAuODExIC00OC44OTcgLTEuODIgLTQ5LjU5IC0zLjAxMiBjCi01MC4yODIgLTQuMjAzIC01MC42MDggLTUuNTcxIC01MC41OTYgLTcuMDkyIGMKLTUwLjU5IC03LjgwMyAtNTAuNTEyIC04LjU0OCAtNTAuMzYzIC05LjMyNCBjCi00OS44OTkgLTExLjc1NyAtNDkuNzIyIC0xNC45NjIgLTQ5LjY5OSAtMTguMTQ3IGMKLTQ5LjY3NCAtMjEuMzMgLTQ5Ljc5OSAtMjQuNDk4IC00OS45MyAtMjYuODY3IGMKLTQ5Ljk5NyAtMjguMDUyIC01MC4wNjQgLTI5LjAzOSAtNTAuMTE0IC0yOS43MjkgYwotNTAuMTQgLTMwLjA3MyAtNTAuMTYxIC0zMC4zNDMgLTUwLjE3NiAtMzAuNTI3IGMKLTUwLjE5MiAtMzAuNzE0IC01MC4yIC0zMC44MTEgeQotNTAuMjE2IC0zMC45OTQgbAotNDEuNDQ3IC0zMC45NjQgbAotNDEuNDMzIC0zMC44MTMgbAotNDEuMzE4IC0yOS40MTMgLTQwLjg2MiAtMjYuNjUyIC0zOS4xMTUgLTI0LjE5NSBjCi0zOC4yNDMgLTIyLjk2NiAtMzcuMDQ4IC0yMS44MTIgLTM1LjQxIC0yMC45MzYgYwotMzMuNzcxIC0yMC4wNTggLTMxLjY4NyAtMTkuNDU2IC0yOS4wMjYgLTE5LjM0MSBjCi0yOC43OCAtMTkuMzMxIC0yOC41MzkgLTE5LjMyNSAtMjguMzAzIC0xOS4zMjMgYwotMjMuNTY0IC0xOS4zMSAtMjAuNjQ3IC0yMS4yMiAtMTguODc1IC0yMy4yNTIgYwotMTcuOTkxIC0yNC4yNjcgLTE3LjM5NSAtMjUuMzE2IC0xNy4wMTQgLTI2LjE2NSBjCi0xNi44MjQgLTI2LjU4OSAtMTYuNjg0IC0yNi45NjQgLTE2LjU5MSAtMjcuMjU4IGMKLTE2LjQ5OCAtMjcuNTU2IC0xNi40NDYgLTI3Ljc3NCAtMTYuNDMyIC0yNy44NzcgYwotMTYuNDA5IC0yOC4wMjEgbAoxMS4xMSAtMjcuOTMyIGwKMTEuMTU0IC0yNy44MjcgbAoxMS43MzMgLTI2LjQ3OSAxMi44MjMgLTI0LjUyMSAxNC42OTYgLTIyLjkwMyBjCjE2LjU3IC0yMS4yODUgMTkuMjI2IC0yMCAyMi45NzQgLTE5Ljk4NiBjCjIzLjA0NCAtMTkuOTg2IDIzLjExOSAtMTkuOTg3IDIzLjE5MSAtMTkuOTg5IGMKMjcuNDc1IC0yMC4wMyAzMC4zNTMgLTIxLjQwMyAzMi4yODcgLTIzLjA0NiBjCjM0LjIxOSAtMjQuNjg5IDM1LjE5OCAtMjYuNjA5IDM1LjYzOCAtMjcuNzQxIGMKMzUuNjggLTI3Ljg0OSBsCjQwLjU2NiAtMjcuODM1IGwKNDcuMTYgLTI3LjgxNCBsCjQ3LjExNSAtMjEuOTIyIGwKNDYuOTQ0IDAuMzIyIGwKLTAuMDAxIDAuMTY4IGwKMCAwIGwKMC4xNzIgMC4wMDIgbAowIDAgbAowLjAwMSAtMC4xNjcgbAo0Ni42MDQgLTAuMDEzIGwKNDYuNzcyIC0yMS45MjMgbAo0Ni44MTUgLTI3LjQ3OCBsCjQwLjU2NCAtMjcuNDk5IGwKMzUuNzk2IC0yNy41MTQgbAozNS43OTcgLTI3LjY4MiBsCjM1Ljk1NyAtMjcuNjI0IGwKMzUuNTA0IC0yNi40NTcgMzQuNTAxIC0yNC40ODcgMzIuNTA5IC0yMi43OTQgYwozMC41MjQgLTIxLjEwMiAyNy41NDkgLTE5LjY5NCAyMy4xOTMgLTE5LjY1MiBjCjIzLjExOSAtMTkuNjUyIDIzLjA0NCAtMTkuNjUxIDIyLjk3MiAtMTkuNjUxIGMKMTkuMTM5IC0xOS42NjIgMTYuMzkzIC0yMC45ODcgMTQuNDY3IC0yMi42NTEgYwoxMi41NDEgLTI0LjMxNyAxMS40MzEgLTI2LjMxOSAxMC44MzcgLTI3LjY5OSBjCjEwLjk5NSAtMjcuNzYzIGwKMTAuOTk0IC0yNy41OTYgbAotMTYuMjYzIC0yNy42ODYgbAotMTYuMjYxIC0yNy44NTQgbAotMTYuMDkxIC0yNy44MjggbAotMTYuMTEzIC0yNy42OTggLTE2LjE2NiAtMjcuNDczIC0xNi4yNjMgLTI3LjE2MSBjCi0xNi42MDYgLTI2LjA4NSAtMTcuNDkgLTI0LjA0MSAtMTkuMzU2IC0yMi4yNiBjCi0yMS4yMiAtMjAuNDggLTI0LjA3NCAtMTguOTczIC0yOC4zMDYgLTE4Ljk4OSBjCi0yOC41NDYgLTE4Ljk5IC0yOC43OTMgLTE4Ljk5NiAtMjkuMDQzIC0xOS4wMDcgYwotMzEuNzQ4IC0xOS4xMjIgLTMzLjg4OCAtMTkuNzM1IC0zNS41NzUgLTIwLjY0MiBjCi0zOC4xMDkgLTIxLjk5NyAtMzkuNjE3IC0yNC4wMDIgLTQwLjUxMSAtMjUuOTMgYwotNDEuNDA0IC0yNy44NTggLTQxLjY4NiAtMjkuNzA5IC00MS43NzUgLTMwLjc4NSBjCi00MS42MDYgLTMwLjc5OCBsCi00MS42MDcgLTMwLjYzMSBsCi01MC4wMjkgLTMwLjY1OSBsCi01MC4wMjggLTMwLjgyNSBsCi00OS44NTggLTMwLjg0MiBsCi00OS44NTcgLTMwLjgzOCAtNDkuMzA2IC0yNC41MzQgLTQ5LjM1NSAtMTguMTQ1IGMKLTQ5LjM3OSAtMTQuOTQ5IC00OS41NTQgLTExLjczMyAtNTAuMDI3IC05LjI2NCBjCi01MC4xNzIgLTguNTAzIC01MC4yNDggLTcuNzc4IC01MC4yNTMgLTcuMDkyIGMKLTUwLjI2NSAtNS42MTcgLTQ5Ljk1MSAtNC4zMTIgLTQ5LjI5IC0zLjE3OCBjCi00OC4zIC0xLjQ3OCAtNDYuNTIzIC0wLjE0OSAtNDMuODM0IDAuNzYzIGMKLTQxLjE0NSAxLjY3NiAtMzcuNTUxIDIuMTY0IC0zMi45NjkgMi4xNzggYwotMzIuODU3IDIuMTc4IGwKLTMyLjgxMyAyLjI3OCBsCi0zMi43NDEgMi40NDIgLTMyLjYxNyAyLjc2NCAtMzIuNDUzIDMuMjE2IGMKLTMxLjI5OCA2LjM2NyAtMjguMTYzIDE1LjY2MiAtMjguMTYzIDE1LjY2NCBjCi0yOC4zMjcgMTUuNzE2IGwKLTI4LjIxOCAxNS41ODYgbAotMjguMjA2IDE1LjU5NSBsCi0yNy45NCAxNS43OTUgLTIzLjI2IDE5LjI2NiAtMTMuOTczIDE5LjI5NyBjCi05LjE2MyAxOS4zMTIgLTUuNzE1IDE4Ljk3NyAtMy40ODggMTguMzU1IGMKLTIuMzc0IDE4LjA0NiAtMS41NjYgMTcuNjY1IC0xLjA0OSAxNy4yMzQgYwotMC41MzMgMTYuODAyIC0wLjI5OSAxNi4zMzUgLTAuMjkzIDE1LjgwOSBjCi0wLjE3IC0wLjE2NiBsCjAuMDAxIC0wLjE2NyBsCmgKZgpRCjAgMCAwIDAgawovR1MxIGdzCnEKMSAwIDAgMSAyMi4zOTIxIDcyNy4wMzU0IGNtCjAgMCBtCi0wLjAyIDIuNDkxIC0wLjUxOSA0LjUwNyAtMS4xMTcgNC41MDUgYwotMS43MTQgNC41MDEgLTIuMTgyIDIuNDgzIC0yLjE2MyAtMC4wMDYgYwotMi4xNDQgLTIuNDk3IC0xLjY0NCAtNC41MTMgLTEuMDQ4IC00LjUxIGMKLTAuNDQ5IC00LjUxIDAuMDE5IC0yLjQ4OSAwIDAgYwpmClEKMCAwIDAgMSBrCi9HUzAgZ3MKcQoxIDAgMCAxIDIyLjM5MjEgNzI3LjAzNTQgY20KMCAwIG0KMC4xNzMgMC4wMDEgbAowLjE2MyAxLjI1NiAwLjAzMiAyLjM5MSAtMC4xNzUgMy4yMjUgYwotMC4yNzcgMy42NDMgLTAuNCAzLjk4NCAtMC41NDQgNC4yMzMgYwotMC42MTUgNC4zNTggLTAuNjkzIDQuNDYyIC0wLjc4NyA0LjUzOSBjCi0wLjg3NyA0LjYxOCAtMC45OTIgNC42NzIgLTEuMTE5IDQuNjcyIGMKLTEuMjQ0IDQuNjcgLTEuMzU4IDQuNjE2IC0xLjQ0OCA0LjUzOCBjCi0xLjYwNiA0LjM5OCAtMS43MjQgNC4xODYgLTEuODMzIDMuOTEgYwotMS45OTQgMy40OTMgLTIuMTIxIDIuOTI4IC0yLjIwOCAyLjI1OSBjCi0yLjI5NiAxLjU4OSAtMi4zNDEgMC44MTcgLTIuMzM0IC0wLjAwNyBjCi0yLjMyNSAtMS4yNjIgLTIuMTk2IC0yLjM5OCAtMS45ODkgLTMuMjMyIGMKLTEuODg1IC0zLjY0OCAtMS43NjMgLTMuOTg5IC0xLjYyMSAtNC4yNCBjCi0xLjU0OCAtNC4zNjUgLTEuNDcxIC00LjQ2NyAtMS4zNzggLTQuNTQ3IGMKLTEuMjg3IC00LjYyNCAtMS4xNzIgLTQuNjc5IC0xLjA0NiAtNC42NzggYwotMC45MiAtNC42NzkgLTAuODA2IC00LjYyMyAtMC43MTYgLTQuNTQ1IGMKLTAuNTU3IC00LjQwNSAtMC40MzkgLTQuMTkyIC0wLjMzIC0zLjkxOCBjCi0wLjE3IC0zLjUwMiAtMC4wNDQgLTIuOTM2IDAuMDQzIC0yLjI2NSBjCjAuMTMxIC0xLjU5NyAwLjE3OSAtMC44MjMgMC4xNzMgMC4wMDEgYwowIDAgbAotMC4xNzIgMC4wMDEgbAotMC4xNjEgLTEuMjM1IC0wLjI3NCAtMi4zNTMgLTAuNDU5IC0zLjE1MiBjCi0wLjU1MyAtMy41NDkgLTAuNjY0IC0zLjg2OSAtMC43NzkgLTQuMDc0IGMKLTAuODM2IC00LjE3OCAtMC44OTYgLTQuMjUyIC0wLjk0NCAtNC4yOTIgYwotMC45OTQgLTQuMzM1IC0xLjAyNiAtNC4zNDQgLTEuMDQ4IC00LjM0MyBjCi0xLjA3MiAtNC4zNDMgLTEuMTAzIC00LjMzNyAtMS4xNTMgLTQuMjkzIGMKLTEuMjQxIC00LjIyMyAtMS4zNTUgLTQuMDQ4IC0xLjQ1NCAtMy43OTggYwotMS42MDYgLTMuNDI0IC0xLjczNyAtMi44NzkgLTEuODM0IC0yLjIyNyBjCi0xLjkyOCAtMS41NzYgLTEuOTg2IC0wLjgxNiAtMS45OTIgLTAuMDA2IGMKLTIuMDAyIDEuMjI2IC0xLjg5IDIuMzQ1IC0xLjcwNCAzLjE0NCBjCi0xLjYxMyAzLjU0MyAtMS41MDEgMy44NjIgLTEuMzg0IDQuMDcgYwotMS4zMjYgNC4xNzIgLTEuMjY5IDQuMjQ1IC0xLjIxOSA0LjI4NiBjCi0xLjE3IDQuMzI4IC0xLjE0IDQuMzM3IC0xLjExNiA0LjMzNyBjCi0xLjA5MyA0LjMzNiAtMS4wNjEgNC4zMjkgLTEuMDEgNC4yODYgYwotMC45MjMgNC4yMTUgLTAuODExIDQuMDQzIC0wLjcxIDMuNzk1IGMKIAotMC41NTggMy40MTggLTAuNDI1IDIuODczIC0wLjMzIDIuMjIgYwotMC4yMzYgMS41NjggLTAuMTc4IDAuODEgLTAuMTcyIDAuMDAxIGMKaApmClEKUQowIDAgMCAxIGsKL0dTMCBncwpxCjEgMCAwIDEgMjEuMjczMyA3MzEuNzA3MiBjbQowIDAgbQowLjAwNCAtMC4zMzUgbAoyLjYzNCAtMC4zMjUgbAoyLjYzMyAwLjAwOCBsCmgKZgpRCnEKMCAwIDYxMiA3OTIgcmUKVyBuCnEKMSAwIDAgMSA4Mi4yMDQ0IDcxNi41NTkzIGNtCjAgMCBtCi0wLjAwNiAwLjAwMiBsCi0wLjA2NSAwLjAxNSAtMC42OTIgMC4xODYgLTEuMjk2IDAuNzA2IGMKLTEuODk4IDEuMjI2IC0yLjQ4NyAyLjA4NyAtMi41IDMuNTM1IGMKLTIuNTA1IDQuMDI2IC0yLjQ0MSA0LjU4MiAtMi4yODcgNS4yMTggYwotMS43NyA3LjM0NCAtMC40MTYgOS45ODIgMS44ODUgMTIuMDgzIGMKNC4xODYgMTQuMTgzIDcuNDI3IDE1Ljc1MiAxMS43NTEgMTUuNzY3IGMKMTIuMjg2IDE1Ljc2OSAxMi44NCAxNS43NDYgMTMuNDExIDE1LjY5OCBjCjE3LjkzIDE1LjMxNiAyMS45NDEgMTMuNjM3IDI0LjgyMSAxMS4xNDkgYwoyNy43MDQgOC42NjEgMjkuNDU3IDUuMzcgMjkuNDg3IDEuNzQ2IGMKMjkuNDkgMS4xNTggMjkuNDQ5IDAuNTYyIDI5LjM1OCAtMC4wNDEgYwoyOS43IC0wLjA5MSBsCjI5Ljc5IDAuNTI5IDI5LjgzMiAxLjE0MiAyOS44MjggMS43NDcgYwoyOS43OTkgNS40NzggMjcuOTkyIDguODYyIDI1LjA0OCAxMS40IGMKMjIuMTA3IDEzLjk0IDE4LjAyNyAxNS42NDQgMTMuNDM4IDE2LjAzMiBjCjEyLjg1NyAxNi4wODEgMTIuMjk2IDE2LjEwMyAxMS43NDggMTYuMTAxIGMKNy4zMzcgMTYuMDg4IDQuMDA1IDE0LjQ3OCAxLjY0OCAxMi4zMjcgYwotMC43MDYgMTAuMTc0IC0yLjA4NiA3LjQ4OSAtMi42MjEgNS4yOTYgYwotMi43OCA0LjYzOSAtMi44NDggNC4wNTQgLTIuODQ0IDMuNTM0IGMKLTIuODM0IDEuOTQ0IC0yLjE0NSAwLjk2MyAtMS40NTcgMC40IGMKLTAuNzczIC0wLjE2MyAtMC4wOTYgLTAuMzIyIC0wLjA4IC0wLjMyNyBjCmgKZgpRClEKcQoxIDAgMCAxIDIxLjQyMjcgNzIyLjY5MjggY20KMCAwIG0KMC4wMDMgLTAuMzM2IGwKMi42MzMgLTAuMzI4IGwKMi42MzIgMC4wMDggbApoCmYKUQpxCjAgMCA2MTIgNzkyIHJlClcgbgowIDAgMCAwIGsKL0dTMSBncwpxCjEgMCAwIDEgMTkuNDk3NyA3MTkuNzQ5MyBjbQowIDAgbQozLjIxNSAwLjY2NyAzLjA5NyAtMi4yMTcgdgoyLjk4IC01LjEwMiAzLjUyIC02LjkyOSAyLjQxMiAtNi45MzEgYwoxLjMwNCAtNi45MzUgLTEuMzA1IC02LjAzNiAtMS4zMjYgLTMuNDQyIGMKLTEuMzQ1IC0wLjg0OSAwIDAgeQpmClEKMCAwIDAgMSBrCi9HUzAgZ3MKcQoxIDAgMCAxIDE5LjQ5NzcgNzE5Ljc0OTMgY20KMCAwIG0KMC4wMzcgLTAuMTY0IGwKMC4wNDggLTAuMTYxIGwKMC4xMDUgLTAuMTUgMC4zODYgLTAuMTAzIDAuNzQ0IC0wLjEwMiBjCjEuMTgzIC0wLjA5OSAxLjczOCAtMC4xNjkgMi4xNjYgLTAuNDQ0IGMKMi4zODEgLTAuNTc5IDIuNTY2IC0wLjc2MSAyLjcwMiAtMS4wMTcgYwoyLjgzOCAtMS4yNzMgMi45MjUgLTEuNjA0IDIuOTI5IC0yLjAzOSBjCjIuOTI5IC0yLjA5NCAyLjkyNyAtMi4xNTMgMi45MjYgLTIuMjEgYwoyLjkxIC0yLjYxMyAyLjkwNiAtMi45OTMgMi45MDkgLTMuMzUzIGMKMi45MTUgLTQuMTM4IDIuOTUyIC00LjgxNSAyLjk1NiAtNS4zNTMgYwoyLjk2MiAtNS44NSAyLjkzMiAtNi4yMzMgMi44NDMgLTYuNDYgYwoyLjggLTYuNTczIDIuNzQ3IC02LjY0NiAyLjY4MyAtNi42OSBjCjIuNjIxIC02LjczNiAyLjUzOSAtNi43NjQgMi40MTEgLTYuNzY0IGMKMi4xNTcgLTYuNzY1IDEuNzk5IC02LjcxMyAxLjQxNCAtNi41OTMgYwowLjgzNiAtNi40MTMgMC4xOTIgLTYuMDgzIC0wLjMwMiAtNS41NzMgYwotMC43OTcgLTUuMDYxIC0xLjE0NiAtNC4zNzIgLTEuMTU0IC0zLjQ0MiBjCi0xLjE2NCAtMi4xNzIgLTAuODQxIC0xLjM0NiAtMC41MjMgLTAuODM1IGMKLTAuMzYzIC0wLjU4MSAtMC4yMDcgLTAuNDA1IC0wLjA5IC0wLjI5NCBjCi0wLjAzMiAtMC4yMzYgMC4wMTYgLTAuMTk4IDAuMDQ4IC0wLjE3MyBjCjAuMDg1IC0wLjE0NiBsCjAuMDkxIC0wLjE0MiBsCjAuMDkzIC0wLjE0MSBsCjAuMDU3IC0wLjA4OCBsCjAuMDkzIC0wLjE0MSBsCjAuMDU3IC0wLjA4OCBsCjAuMDkzIC0wLjE0MSBsCjAgMCBsCjAuMDM3IC0wLjE2NCBsCjAgMCBsCi0wLjA5NCAwLjE0MSBsCi0wLjExMSAwLjEzMSAtMC40NjggLTAuMSAtMC44MTYgLTAuNjYxIGMKLTEuMTY4IC0xLjIyMyAtMS41MDcgLTIuMTE3IC0xLjQ5NyAtMy40NDQgYwotMS40OTIgLTQuMTE3IC0xLjMxNyAtNC42OTMgLTEuMDM3IC01LjE2NSBjCi0wLjYxOCAtNS44NzUgMC4wMjkgLTYuMzU5IDAuNjczIC02LjY2NCBjCjEuMzIgLTYuOTY5IDEuOTY1IC03LjA5OCAyLjQxMyAtNy4wOTkgYwoyLjU5NSAtNy4xIDIuNzU5IC03LjA1NSAyLjg4OCAtNi45NjEgYwoyLjk4NCAtNi44OTEgMy4wNiAtNi43OTcgMy4xMTUgLTYuNjg5IGMKMy4yNzggLTYuMzY3IDMuMzAxIC01LjkyNSAzLjI5OSAtNS4zNTMgYwozLjI5NSAtNC44IDMuMjU3IC00LjEyNyAzLjI1MSAtMy4zNTIgYwozLjI0OSAtMi45OTYgMy4yNTIgLTIuNjIgMy4yNjkgLTIuMjI1IGMKMy4yNzEgLTIuMTYxIDMuMjcyIC0yLjA5OSAzLjI3MiAtMi4wMzggYwozLjI2OCAtMS41NiAzLjE3MSAtMS4xNzMgMy4wMDYgLTAuODYzIGMKMi43NTkgLTAuMzk3IDIuMzYzIC0wLjExOCAxLjk0OCAwLjAzOCBjCjEuNTMzIDAuMTk0IDEuMDk4IDAuMjM0IDAuNzQxIDAuMjM0IGMKMC4yOTYgMC4yMzMgLTAuMDI4IDAuMTY3IC0wLjAzNSAwLjE2NCBjCi0wLjA2NyAwLjE1NyBsCi0wLjA5NCAwLjE0MSBsCmgKZgpRCjAgMCAwIDAgawovR1MxIGdzCnEKMSAwIDAgMSAxMTQuNTgwMiA3MjAuNDI5NCBjbQowIDAgbQowLjg3OCAyLjEyNyAyLjI5MyAxLjk2OSB2CjMuNzA4IDEuODA5IDYuMTkyIC0xLjM3MSAzLjc1NCAtMy45MTUgYwozLjI5NiAtNC4yIDAuNTkxIC00LjIxIDAuNDA5IC0zLjczNCBjCjAuMjI5IC0zLjI1OSAtMC40NTkgLTIuMzEgMCAwIGMKZgpRCjAgMCAwIDEgawovR1MwIGdzCnEKMSAwIDAgMSAxMTQuNTgwMiA3MjAuNDI5NCBjbQowIDAgbQowLjE1NyAtMC4wNjMgbAowLjE2NiAtMC4wNDMgbAowLjIxMSAwLjA1NyAwLjQyOSAwLjUzNCAwLjc3OCAwLjk3NiBjCjAuOTU1IDEuMTk4IDEuMTYzIDEuNDA5IDEuMzkzIDEuNTYxIGMKMS42MjMgMS43MTUgMS44NzIgMS44MDggMi4xMzkgMS44MSBjCjIuMTgzIDEuODEgMi4yMjkgMS44MDcgMi4yNzUgMS44MDMgYwoyLjQ4MSAxLjc4MSAyLjczNiAxLjY3NSAyLjk5NCAxLjQ5NSBjCjMuMzg4IDEuMjI4IDMuNzkzIDAuNzk4IDQuMDk3IDAuMjc3IGMKNC40MDEgLTAuMjQ1IDQuNjAzIC0wLjg2IDQuNjA5IC0xLjQ5OCBjCjQuNjEzIC0yLjI1MiA0LjM0NyAtMy4wNDcgMy42MjcgLTMuNzk5IGMKMy43NTQgLTMuOTE1IGwKMy42NiAtMy43NzMgbAozLjYzOSAtMy43ODkgMy41NzUgLTMuODE1IDMuNDg4IC0zLjgzNyBjCjMuMjIxIC0zLjkwMyAyLjc1IC0zLjk0NCAyLjI2NyAtMy45NDcgYwoxLjg0OCAtMy45NDkgMS40MTggLTMuOTIgMS4wODggLTMuODYgYwowLjkyMyAtMy44MzEgMC43ODMgLTMuNzk0IDAuNjkzIC0zLjc1MyBjCjAuNjQ1IC0zLjczNCAwLjYxMSAtMy43MTUgMC41OTMgLTMuNjk5IGMKMC41NzMgLTMuNjgxIGwKMC41NjkgLTMuNjc2IGwKMC41NjkgLTMuNjc5IGwKMC41NjkgLTMuNjc2IGwKMC41NjkgLTMuNjc5IGwKMC41NjkgLTMuNjc2IGwKMC40OTIgLTMuNDc4IDAuMzYxIC0zLjI0NiAwLjI0MyAtMi45MDIgYwowLjEyNiAtMi41NTggMC4wMjEgLTIuMTA5IDAuMDE3IC0xLjQ5NyBjCjAuMDE0IC0xLjA4NiAwLjA1NSAtMC42MDQgMC4xNjcgLTAuMDMyIGMKMCAwIGwKMC4xNTcgLTAuMDYzIGwKMCAwIGwKLTAuMTY4IDAuMDMzIGwKLTAuMjg2IC0wLjU1OCAtMC4zMyAtMS4wNjQgLTAuMzI3IC0xLjQ5OCBjCi0wLjMyMSAtMi4xNDYgLTAuMjEyIC0yLjYzNSAtMC4wODMgLTMuMDA4IGMKMC4wNDUgLTMuMzc4IDAuMTg5IC0zLjYzNSAwLjI1IC0zLjc5MSBjCjAuMjc4IC0zLjg2MyAwLjMyNSAtMy45MTUgMC4zNzYgLTMuOTU4IGMKMC40NjggLTQuMDMyIDAuNTg0IC00LjA3OCAwLjcxNSAtNC4xMTkgYwoxLjExMSAtNC4yMzYgMS43IC00LjI4MiAyLjI3IC00LjI4MSBjCjIuNjA1IC00LjI4IDIuOTMgLTQuMjYxIDMuMjA1IC00LjIyNiBjCjMuMzQ1IC00LjIwOCAzLjQ2NiAtNC4xODYgMy41NzMgLTQuMTYgYwozLjY4MiAtNC4xMzQgMy43NjggLTQuMTA1IDMuODQ3IC00LjA1NSBjCjMuODYzIC00LjA0NSBsCjMuODgxIC00LjAyOSBsCjQuNjU1IC0zLjIyMSA0Ljk1OSAtMi4zMzEgNC45NTIgLTEuNDk2IGMKNC45NDQgLTAuNTUzIDQuNTUxIDAuMzE2IDQuMDM2IDAuOTY5IGMKMy43NzcgMS4yOTYgMy40ODUgMS41NjkgMy4xOTEgMS43NyBjCjIuODk4IDEuOTcyIDIuNTk4IDIuMTAyIDIuMzEzIDIuMTM1IGMKMi4yNTUgMi4xNDIgMi4xOTUgMi4xNDUgMi4xMzYgMi4xNDUgYwoxLjc2MSAyLjE0NCAxLjQyNyAyLjAwMiAxLjE0NCAxLjgwMyBjCjAuNzE5IDEuNTAyIDAuNCAxLjA2OSAwLjE4MSAwLjcxMSBjCi0wLjA0IDAuMzUzIC0wLjE1NyAwLjA2OCAtMC4xNTkgMC4wNjMgYwotMC4xNjUgMC4wNDkgbAotMC4xNjggMC4wMzMgbApoCmYKUQpxCjEgMCAwIDEgNTUuMDA0IDcxNi4xNjg4IGNtCjAgMCBtCjMuNjEgMi4zOTUgbAozLjU2NSAyLjUxNiBsCjMuNTYxIDIuNTI1IDIuMTc3IDYuMjc0IC0wLjU2MSAxMC4wMjkgYwotMS45MjggMTEuOTA2IC0zLjYzNiAxMy43ODYgLTUuNjg0IDE1LjE5OCBjCi03LjczMiAxNi42MTIgLTEwLjEyNiAxNy41NTUgLTEyLjg1IDE3LjU0NiBjCi0xNy45NDYgMTcuNTI5IC0yMi42OTQgMTUuMTQ4IC0yNi4xNiAxMS42MzggYwotMjkuNjI0IDguMTI2IC0zMS44MTUgMy40ODMgLTMxLjc4IC0xLjA5NiBjCi0zMS43NzYgLTEuNjgyIC0zMS43MzQgLTIuMjY2IC0zMS42NTUgLTIuODQ3IGMKLTMxLjMxNCAtMi44MDUgbAotMzEuMzkyIC0yLjIzNiAtMzEuNDMyIC0xLjY2NyAtMzEuNDM2IC0xLjA5NCBjCi0zMS40NzIgMy4zNzUgLTI5LjMyNCA3Ljk1IC0yNS45MTEgMTEuNDA2IGMKLTIyLjQ5OSAxNC44NjIgLTE3LjgzMyAxNy4xOTUgLTEyLjg0OCAxNy4yMSBjCi0xMC4yMDcgMTcuMjE4IC03Ljg4NiAxNi4zMDcgLTUuODgyIDE0LjkyNiBjCi0yLjg3NCAxMi44NTUgLTAuNTg3IDkuNzIyIDAuOTQgNy4xMDcgYwoxLjcwNiA1LjgwMSAyLjI4MiA0LjYyMyAyLjY2NiAzLjc3NCBjCjIuODU4IDMuMzQ4IDMuMDAzIDMuMDA2IDMuMSAyLjc3IGMKMy4xNDcgMi42NTEgMy4xODMgMi41NiAzLjIwNyAyLjQ5OCBjCjMuMjMgMi40MzYgMy4yNDIgMi40MDUgeQozLjQwMyAyLjQ2MSBsCjMuMzA3IDIuNTk5IGwKLTAuMTk1IDAuMjc3IGwKaApmClEKcQoxIDAgMCAxIDQyLjg0MzcgNzU5LjcwODMgY20KMCAwIG0KMS4yNCAwLjAwNCBsCjEuMjM4IDAuMTcyIGwKMS4wNjggMC4xNTUgbAoxLjA3NyAwLjA1MiAxLjA5NSAtMC4xMzYgdgoxLjE0NiAtMC43MDQgMS4yNTEgLTIuMDQ2IDEuMjY0IC0zLjY3MyBjCjEuMjggLTUuNzI3IDEuMTQ4IC04LjIzOCAwLjU4NCAtMTAuMjE5IGMKMC4zMDQgLTExLjIwOSAtMC4wODUgLTEyLjA2MyAtMC42MDMgLTEyLjY1OSBjCi0xLjEyMSAtMTMuMjU2IC0xLjc1MSAtMTMuNiAtMi41NjggLTEzLjYwMyBjCiAKLTMuMTM1IC0xMy42MDUgLTMuNzk4IC0xMy40MzkgLTQuNTY4IC0xMy4wNTQgYwotNC43MjMgLTEzLjM1MiBsCi0zLjkxOCAtMTMuNzUzIC0zLjIwMiAtMTMuOTM5IC0yLjU2NiAtMTMuOTM3IGMKLTEuNjQ1IC0xMy45MzcgLTAuOTAxIC0xMy41MjkgLTAuMzM5IC0xMi44NzUgYwowLjUwNyAtMTEuODk1IDAuOTg5IC0xMC4zNzIgMS4yNjggLTguNzA0IGMKMS41NDcgLTcuMDM5IDEuNjE4IC01LjIyNiAxLjYwNiAtMy42NzIgYwoxLjU4OSAtMS40ODUgMS40MDggMC4xODQgMS40MDggMC4xODkgYwoxLjM5MSAwLjM0IGwKLTAuMDA0IDAuMzM1IGwKaApmClEKUQpxCjEgMCAwIDEgNzAuOTk3NCA3NDQuMTYwNSBjbQowIDAgbQowLjE5NyAtMjUuNDkgbAowLjU0IC0yNS40ODcgbAowLjM0MyAwLjAwMSBsCmgKZgpRCnEKMCAwIDYxMiA3OTIgcmUKVyBuCnEKMSAwIDAgMSA1OS44NzI4IDcyMC4yOTI3IGNtCjAgMCBtCjAuMDAyIC0wLjE2OCBsCjEwLjMzOSAtMC4xMzQgbAoxMC4wNDcgMzcuNzIgbAoxMC4wNDUgMzcuNzM3IDEwLjA0MiAzOC4zNDIgOS42MTggMzguOTYgYwo5LjQwNiAzOS4yNjcgOS4wODUgMzkuNTc3IDguNjE1IDM5LjgwNCBjCjguMTQ0IDQwLjAzIDcuNTI4IDQwLjE3NyA2LjcyNCA0MC4xNzQgYwozLjA2NSA0MC4xNjIgMS4zNDggNDAuMjgxIC0yLjc5MyA0MC4yNjYgYwotNC44NjIgNDAuMjYgLTcuNzkzIDQwLjI1MiAtMTAuMjEyIDM5Ljk5OCBjCi0xMS40MjQgMzkuODcgLTEyLjUwNyAzOS42ODMgLTEzLjMwMiAzOS4zOTYgYwotMTMuNjk5IDM5LjI1MSAtMTQuMDMgMzkuMDgzIC0xNC4yNjggMzguODczIGMKLTE0LjUwNSAzOC42NjUgLTE0LjY1NSAzOC40IC0xNC42NTEgMzguMTAxIGMKLTE0LjQ2OSAxNC40IGwKLTE0LjMwMyAxNC4zOTUgbAotMTQuMjc5IDE0LjM5NSBsCi0xNC4wMyAxNC4zODMgLTExLjcyNCAxNC4yMTkgLTguODcgMTIuMzM5IGMKLTYuMDE5IDEwLjQ1NiAtMi42MTMgNi44NTggLTAuMTYyIC0wLjA1NSBjCi0wLjEyMyAtMC4xNjggbAowLjAwMiAtMC4xNjggbAowIDAgbAowLjE2MiAwLjA1MyBsCi0yLjM4NiA3LjI0OSAtNS45ODYgMTAuOTI3IC04Ljk2MSAxMi43OTYgYwotMTEuOTM0IDE0LjY2NyAtMTQuMjcxIDE0LjczMSAtMTQuMjk0IDE0LjczIGMKLTE0LjI5OSAxNC41NjMgbAotMTQuMTI4IDE0LjU2MyBsCi0xNC4zMDkgMzguMTAxIGwKLTE0LjMwOSAzOC4yOTIgLTE0LjIyNiAzOC40NTYgLTE0LjAzNyAzOC42MjUgYwotMTMuNzA3IDM4LjkxOCAtMTMuMDU2IDM5LjE2OCAtMTIuMjE3IDM5LjM1MiBjCi0xMC45NTggMzkuNjI5IC05LjI3NiAzOS43NzQgLTcuNTc0IDM5Ljg0OCBjCi01Ljg3MiAzOS45MjIgLTQuMTQ4IDM5LjkyOSAtMi43OTEgMzkuOTMzIGMKMS4zNDIgMzkuOTQ2IDMuMDU3IDM5LjgyOCA2LjcyNyAzOS44NCBjCjcuNDg4IDM5Ljg0MyA4LjA0OCAzOS43MDQgOC40NjQgMzkuNTA0IGMKOS4wODMgMzkuMjAzIDkuMzg4IDM4Ljc1OSA5LjU0NiAzOC4zODMgYwo5LjYyNSAzOC4xOTUgOS42NjQgMzguMDI2IDkuNjg0IDM3LjkwNCBjCjkuNjk1IDM3Ljg0MyA5LjY5OCAzNy43OTYgOS43MDIgMzcuNzY0IGMKOS43MDQgMzcuNzI4IGwKOS43MDQgMzcuNzIgbAo5LjcwNCAzNy43MiBsCjkuOTkzIDAuMiBsCi0wLjAwMiAwLjE2NyBsCjAgMCBsCjAuMTYyIDAuMDUzIGwKaApmClEKUQpxCjEgMCAwIDEgNTguNDA1NSA3MTguNzk2NyBjbQowIDAgbQowLjAwMyAtMC4zMzQgbAoyMS4zNDggLTAuMjY0IGwKMjEuMzQ3IDAuMDcgbApoCmYKUQpxCjEgMCAwIDEgNDUuNDk1OSA3NDQuOTQ1MyBjbQowIDAgbQowLjAwMiAtMC4zMzYgbAoyNC4zNTUgLTAuMjU2IGwKMjQuMzUyIDAuMDgxIGwKaApmClEKcQoxIDAgMCAxIDQ1LjUwMTMgNzQ0LjI0NDIgY20KMCAwIG0KMC4wMDMgLTAuMzM2IGwKMjQuMzU2IC0wLjI1NSBsCjI0LjM1MyAwLjA3OSBsCmgKZgpRCnEKMCAwIDYxMiA3OTIgcmUKVyBuCnEKMSAwIDAgMSA3MS4wMzM2IDc0NC42OTQ1IGNtCjAgMCBtCjQ2LjkwNSAwLjE1MyBsCjQ2LjkwMiAwLjMyMiBsCjQ2LjggMC4xODkgbAo0Ni44MDEgMC4xODcgbAo0Ni44MjIgMC4xNzMgNDYuOTE4IDAuMDk2IDQ3LjAwMyAwLjAwNiBjCjQ3LjA0NyAtMC4wMzggNDcuMDg4IC0wLjA4NyA0Ny4xMTMgLTAuMTI3IGMKNDcuMTI1IC0wLjE0NyA0Ny4xMzYgLTAuMTY2IDQ3LjEzOSAtMC4xNzggYwo0Ny4xNDUgLTAuMTk3IGwKNDcuMTc5IC0wLjE5NiBsCjQ3LjE1IC0wLjE4IGwKNDcuMTQ1IC0wLjE5NyBsCjQ3LjE3OSAtMC4xOTYgbAo0Ny4xNSAtMC4xOCBsCjQ3LjE3NCAtMC4xOTYgbAo0Ny4xNTIgLTAuMTc0IGwKNDcuMTUgLTAuMTggbAo0Ny4xNzQgLTAuMTk2IGwKNDcuMTUyIC0wLjE3NCBsCjQ3LjE1OCAtMC4xOCBsCjQ3LjE1NSAtMC4xNzQgbAo0Ny4xNTIgLTAuMTc0IGwKNDcuMTU4IC0wLjE4IGwKNDcuMTU1IC0wLjE3NCBsCjQ3LjE1MiAtMC4xNzQgNDcuMTM4IC0wLjE4OCA0Ny4wOTQgLTAuMTk2IGMKNDcuMDU2IC0wLjIwNSA0Ni45OTMgLTAuMjEzIDQ2LjkwOCAtMC4yMTMgYwo0Ni45MSAtMC41NDcgbAo0Ny4wNzcgLTAuNTQ4IDQ3LjIwNCAtMC41MjkgNDcuMzA5IC0wLjQ3OCBjCjQ3LjM2IC0wLjQ0OSA0Ny40MDggLTAuNDExIDQ3LjQ0IC0wLjM2IGMKNDcuNDczIC0wLjMwOCA0Ny40ODcgLTAuMjQ5IDQ3LjQ4OCAtMC4xOTYgYwo0Ny40ODUgLTAuMDkxIDQ3LjQ0MSAtMC4wMSA0Ny4zOTcgMC4wNjIgYwo0Ny4zMjMgMC4xNzEgNDcuMjI4IDAuMjYzIDQ3LjE1MSAwLjMzNCBjCjQ3LjA3NCAwLjQwNSA0Ny4wMTIgMC40NTIgNDcuMDA4IDAuNDUzIGMKNDYuOTYgMC40OTEgbAotMC4wMDMgMC4zMzYgbApoCmYKUQowIDAgMCAwIGsKL0dTMSBncwpxCjEgMCAwIDEgNDMuNjE5MyA3NDkuNDQ2NyBjbQowIDAgbQotMS40NiAtMS4xMTUgLTEuNDQ1IC0yLjk4MiB2Ci0xLjQzMSAtNC44NTIgMC4wMiAtNS43NyB5CjAuMDAzIC0zLjYzNSBsCjAuNjI5IC0zLjYzMyBsCjAuNjE4IC0yLjMwOCBsCjAuMDI3IC0yLjMwOSBsCmgKZgpRCjAgMCAwIDEgawovR1MwIGdzCnEKMSAwIDAgMSA0My42MTkzIDc0OS40NDY3IGNtCjAgMCBtCi0wLjEwNiAwLjEzMiBsCi0wLjExNCAwLjEyNCAtMC40OTIgLTAuMTY0IC0wLjg2OSAtMC42OTYgYwotMS4yNDYgLTEuMjI3IC0xLjYyNSAtMi4wMDYgLTEuNjE3IC0yLjk4MyBjCi0xLjYwOSAtMy45NjMgLTEuMjI0IC00LjY5NiAtMC44NDIgLTUuMTc5IGMKLTAuNDYgLTUuNjYzIC0wLjA4MyAtNS45MDMgLTAuMDczIC01LjkxMiBjCjAuMTkzIC02LjA3OSBsCjAuMTc2IC0zLjgwMyBsCjAuODAzIC0zLjggbAowLjc5IC0yLjEzOSBsCjAuMTk3IC0yLjE0MSBsCjAuMTY5IDAuMzM5IGwKLTAuMTA2IDAuMTMyIGwKMCAwIGwKLTAuMTcyIC0wLjAwMyBsCi0wLjE0MSAtMi40NzcgbAowLjQ0OCAtMi40NzYgbAowLjQ1NiAtMy40NjggbAotMC4xNjkgLTMuNDY5IGwKLTAuMTUxIC01Ljc3MSBsCjAuMDIgLTUuNzcgbAowLjExMyAtNS42MyBsCjAuMTExIC01LjYyOSBsCjAuMDggLTUuNjA4IC0wLjI2NyAtNS4zNzUgLTAuNjA0IC00LjkzNCBjCi0wLjk0IC00LjQ5MyAtMS4yNjcgLTMuODQ2IC0xLjI3MyAtMi45ODIgYwotMS4yOCAtMi4wOTIgLTAuOTM1IC0xLjM3OSAtMC41ODcgLTAuODg3IGMKLTAuNDEyIC0wLjY0MSAtMC4yMzcgLTAuNDUgLTAuMTA1IC0wLjMyMyBjCi0wLjA0MSAtMC4yNTggMC4wMTQgLTAuMjExIDAuMDUxIC0wLjE4MSBjCjAuMDkzIC0wLjE0NCBsCjAuMTA1IC0wLjEzNSBsCjAuMTA3IC0wLjEzMyBsCjAgMCBsCi0wLjE3MiAtMC4wMDMgbApoCmYKUQpFTUMgCi9QIDw8L0xhbmcgKGVuLVVTKS9NQ0lEIDAgPj5CREMgClEKQlQKL0NTMCBjcyAxICBzY24KL0dTMSBncwovVDFfMCAxIFRmCjI0IDAgMCAyNCA0MjYuMzg1NiA3NTcuMTc2MyBUbQpbKEJJTiBSRU5UKTc5IChBTCldVEoKRVQKRU1DIApCVAovUCA8PC9MYW5nIChlbi1VUykvTUNJRCAxID4+QkRDIAowIDAgMCAxIGsKL0dTMCBncwovVDFfMSAxIFRmCjkgMCAwIDkgMTI2IDczMi4zMzAxIFRtClsoOSkxMCAoMiBEYXZpZHMpMTAuMSAob24gUykyNSAodHIpMzUgKGVlKTE1ICh0LCBVbml0IDIpLTkuOSAoLCBCYXJyaWUpMzAgKCwgT04gTDRNIDNSKTEwLjEgKDgpXVRKCkVNQyAKL1AgPDwvTGFuZyAoZW4tVVMpL01DSUQgMiA+PkJEQyAKMCAtMS4yIFREClsoNykyMCAoMCkxMCAoNSkxMCAoLjMzMykxMCAoLikzMCAoNyktMjAgKDcpNTAgKDYpNTAgKDcgIFwyMjUgaGVsbG9AamUpMjAuMSAoXDAzNykzNSAoc2p1bmspLTMwICguKTE1IChjYSldVEoKRU1DIAovUCA8PC9MYW5nIChlbi1VUykvTUNJRCAzID4+QkRDIAoxMCAwIDAgMTAgMTggNjc2LjgyMDEgVG0KWyhOYW1lKTEwICg6KV1USgpFTUMgCi9QIDw8L0xhbmcgKGVuLVVTKS9NQ0lEIDQgPj5CREMgCjAgLTIgVEQKWyhBKTEwIChkZHIpMzUgKGVzKTEwIChzOildVEoKRU1DIAovUCA8PC9MYW5nIChlbi1VUykvTUNJRCA1ID4+QkRDIAovQzBfMCAxMCBUZgoxIDAgMCAxIDE4IDYzNi42MjAxIFRtCjwwMDI0MDBBRTAwQTcwMDg2PlRqCi9DMF8xIDEwIFRmCjEgMCAwIDEgNDYuMzEgNjM2LjYyMDEgVG0KPDAxNTkwMTQwPlRqCi9DMF8wIDEwIFRmCjEgMCAwIDEgNTYuMTcgNjM2LjYyMDEgVG0KPDAxMzY+VGoKRU1DIApFVAovUCA8PC9MYW5nIChlbi1VUykvTUNJRCA2ID4+QkRDIApFTUMgCi9QIDw8L0xhbmcgKGVuLVVTKS9NQ0lEIDcgPj5CREMgCkVNQyAKL1AgPDwvTGFuZyAoZW4tVVMpL01DSUQgOCA+PkJEQyAKRU1DIAovUCA8PC9MYW5nIChlbi1VUykvTUNJRCA5ID4+QkRDIApFTUMgCi9QIDw8L0xhbmcgKGVuLVVTKS9NQ0lEIDEwID4+QkRDIApFTUMgCi9QIDw8L0xhbmcgKGVuLVVTKS9NQ0lEIDExID4+QkRDIApFTUMgCkJUCi9QIDw8L0xhbmcgKGVuLVVTKS9NQ0lEIDEyID4+QkRDIAovVDFfMSAxMCBUZgozNjAgNzE4LjU3NyBUZAooQmluICM6KVRqCjAgLTIwIFRECihDb3B5OilUagpUKgooU2l6ZTopVGoKMCAtMTkuOTEzIFRECihEcm9wIE9mZiBEYXRlOilUagovQzBfMSAxMCBUZgo8MDE1OT5UagovVDFfMSAxMCBUZgowIC0yMCBURAooUGljayBVcCBEYXRlOilUagovQzBfMSAxMCBUZgo8MDE1OT5UagovVDFfMSAxMCBUZgpUKgooRXh0ZW5kZWQgRGF0ZTopVGoKL0MwXzEgMTAgVGYKVCoKPDAwNEUwMEQ0MDA3MTAwQjgwMTU5MDAzRDAwQ0EwMEM1MDE1OTAxNDAwMTM2PlRqCkVNQyAKRVQKL0FydGlmYWN0IDw8L0JCb3ggWzM5MC4xMTUgNzE4LjMxIDU5NC4xMjUgNzE4LjU2IF0vTyAvTGF5b3V0ID4+QkRDIApxCjEgMCAwIDEgMzkwLjI0IDcxOC40MzUgY20KMCAwIG0KMjAzLjc2IDAgbApTClEKRU1DIAovQXJ0aWZhY3QgPDwvQkJveCBbMzkwLjExNSA2OTguODcgNTk0LjEyNSA2OTkuMTIgXS9PIC9MYXlvdXQgPj5CREMgCnEKMSAwIDAgMSAzOTAuMjQgNjk4Ljk5NSBjbQowIDAgbQoyMDMuNzYgMCBsClMKUQpFTUMgCi9BcnRpZmFjdCA8PC9CQm94IFszODEuODM1IDY3OC43MSA1OTQuMTI1IDY3OC45NiBdL08gL0xheW91dCA+PkJEQyAKcQoxIDAgMCAxIDM4MS45NiA2NzguODM1IGNtCjAgMCBtCjIxMi4wNCAwIGwKUwpRCkVNQyAKL0FydGlmYWN0IDw8L0JCb3ggWzQzMC40MzUgNjU4LjkxIDU5NC4xMjUgNjU5LjE2IF0vTyAvTGF5b3V0ID4+QkRDIApxCjEgMCAwIDEgNDMwLjU2IDY1OS4wMzUgY20KMCAwIG0KMTYzLjQ0IDAgbApTClEKRU1DIAovQXJ0aWZhY3QgPDwvQkJveCBbNDI0LjMxNSA2MzguNzUgNTk0LjEyNSA2MzkgXSAKL08gL0xheW91dCA+PkJEQyAKcQoxIDAgMCAxIDQyNC40NCA2MzguODc1IGNtCjAgMCBtCjE2OS41NiAwIGwKUwpRCkVNQyAKL0FydGlmYWN0IDw8L0JCb3ggWzQzNC43NTUgNjE4LjU5IDU5NC4xMjUgNjE4Ljg0IF0vTyAvTGF5b3V0ID4+QkRDIApFTUMgCi9BcnRpZmFjdCA8PC9CQm94IFs0OS4zNzUgNjc2LjkxIDMwNi4xMjUgNjc3LjE2IF0vTyAvTGF5b3V0ID4+QkRDIApxCjEgMCAwIDEgNDkuNSA2NzcuMDM1IGNtCjAgMCBtCjI1Ni41IDAgbApTClEKRU1DIAovQXJ0aWZhY3QgPDwvQkJveCBbNTkuMjc1IDY1NyAzMDYuMTI1IDY1Ny4yNSBdL08gL0xheW91dCA+PkJEQyAKcQoxIDAgMCAxIDU5LjQgNjU3LjEyNSBjbQowIDAgbQoyNDYuNiAwIGwKUwpRCkVNQyAKL0FydGlmYWN0IDw8L0JCb3ggWzM0LjA3NSA2MzYuOTUgMzA2LjEyNSA2MzcuMiBdL08gL0xheW91dCA+PkJEQyAKcQowLjkwOTMxNyAwIDAgMC45OTk5ODQ3IDU4Ljg1ODgyNTcgNjM3LjA3MTM1MDEgY20KMCAwIG0KMjcxLjggMCBsClMKUQpFTUMgCi9BcnRpZmFjdCA8PC9CQm94IFs1MC45OTUgNjE2Ljc5IDMwNC42ODUgNjE3LjA0IF0vTyAvTGF5b3V0ID4+QkRDIApxCjEuMDE0NjE3OSAwIDAgMSA0OC41NjQ2NTE1IDYxNi45MTIzNTM1IGNtCjAgMCBtCjI1My40NCAwIGwKUwpRCkVNQyAKL0FydGlmYWN0IDw8L0JCb3ggWzExMi4zMiAxNzkuMTU1IDExMi41NyA2MDcuMDg1IF0vTyAvTGF5b3V0ID4+QkRDIApxCjEuMDAwMDE1MyAwIDAgMC43OTQyODEgMTEyLjQ0NTM1ODMgNTE4Ljk1MzQzMDIgY20KMCAwIG0KMCAtNDI3LjY4IGwKUwpRCkVNQyAKQlQKL1AgPDwvTGFuZyAoZW4tVVMpL01DSUQgMTMgPj5CREMgCjAgMCAwIDAgawovR1MxIGdzCi9UMV8xIDEgVGYKMTAgMCAwIDEwIDQxLjQ5MzQgNTI3LjMzOTUgVG0KWyhRVSkzMCAoQU5USVRZKV1USgpFTUMgCi9QIDw8L0xhbmcgKGVuLVVTKS9NQ0lEIDE0ID4+QkRDIAowIDAgMCAxIGsKL0dTMCBncwoxLjY3OCAtMi4zMDQgVGQKKEJJTilUagpFTUMgCi9QIDw8L0xhbmcgKGVuLVVTKS9NQ0lEIDE1ID4+QkRDIAotMS4wOTYgLTEuMiBUZApbKFJFTlQpNzUgKEFMKV1USgpFTUMgCi9QIDw8L0xhbmcgKGVuLVVTKS9NQ0lEIDE2ID4+QkRDIAowIDAgMCAwIGsKL0dTMSBncwoxNy45NjMgMy41NTggVGQKWyhERSkyNSAoUykyNSAoQyk1IChSSVBUSU9OKV1USgpFTUMgCi9QIDw8L0xhbmcgKGVuLVVTKS9NQ0lEIDE3ID4+QkRDIAoyOS4zNTMgMCBUZApbKExJTkUgVCk1MCAoTyk1MCAoVCk3NSAoQUwpXVRKCkVNQyAKRVQKL0FydGlmYWN0IDw8L0JCb3ggWzQ5OS4yNSA0My42NTEgNDk5LjUgNjA2Ljk0MSBdL08gL0xheW91dCA+PkJEQyAKL0dTMCBncwpxCjAuODIwNzU1IDAgMCAwLjg0NDU1ODcgNDk5LjM1MjYwMDEgNTE5LjI3NzI4MjcgY20KMCAwIG0KMCAtNTYzLjA0IGwKUwpRCkVNQyAKQlQKL1AgPDwvTGFuZyAoZW4tVVMpL01DSUQgMTggPj5CREMgCjAgMCAwIDEgawoxMCAwIDAgMTAgMTIyLjEzODIgNDkyLjA1OTUgVG0KWyhEKTM1IChBKTgwIChZKTU1IChTIFJFTlRFRCldVEoKRU1DIAovUCA8PC9MYW5nIChlbi1VUykvTUNJRCAxOSA+PkJEQyAKMCAtMi42NjQgVEQKWyhQTCk0MCAoVSk1IChTIERVTVAgRkVFIC0gJCAxMDApMzAuMSAoLikyMCAoMDApNDAgKC9NRVRSSUMgVCk1MC4xIChPTk5FIFwoMjIpMjAgKDAwTEIpMTAgKFNcKSldVEoKRU1DIApFVAovQXJ0aWZhY3QgPDwvQkJveCBbMTguNDUxIDU1MC41NSA1OTMuNTQ5MSA1NTAuOCBdL08gL0xheW91dCA+PkJEQyAKcQoxIDAgMCAxIDE5Ljc1NDE5NjIgNDg1LjQzNDQ2MzUgY20KMCAwIG0KNTc0Ljg0OCAwIGwKUwpRCkVNQyAKL0FydGlmYWN0IDw8L0JCb3ggWzE3Ljg3NSA1MTYuNzEgNTkzLjU0OTEgNTE2Ljk2IF0vTyAvTGF5b3V0ID4+QkRDIApxCjEgMCAwIDEgMTkuMTc4MTkyMSA0NTEuNTk0NDY3MiBjbQowIDAgbQo1NzUuNDI0IDAgbApTClEKRU1DIAovQXJ0aWZhY3QgPDwvQkJveCBbMTcuODc1IDQ4NC4zMSA1OTMuNTQ5MSA0ODQuNTYgXS9PIC9MYXlvdXQgPj5CREMgCnEKMSAwIDAgMSAxOS4xNzgxOTIxIDQxOC4xOTQ0NTggY20KMCAwIG0KNTc1LjQyNCAwIGwKUwpRCkVNQyAKL0FydGlmYWN0IDw8L0JCb3ggWzE4LjQ1MSA0NTEuMTkgNTkzLjU0OTEgNDUxLjQ0IF0vTyAvTGF5b3V0ID4+QkRDIApxCjEgMCAwIDEgMTkuMjMwNTc1NiAzNTAuNTE0NTU2OSBjbQowIDAgbQo1NzQuODQ4IDAgbApTClEKRU1DIAovQXJ0aWZhY3QgPDwvQkJveCBbMTguNDUxIDQxOC4wNyA1OTMuNjkzIDQxOC4zMiBdL08gL0xheW91dCA+PkJEQyAKcQoxIDAgMCAxIDE5LjIzMDU3NTYgMzE3LjM5NDU2MTggY20KMCAwIG0KNTc0Ljk5MiAwIGwKUwpRCkVNQyAKL0FydGlmYWN0IDw8L0JCb3ggWzE4LjU5NSAzODQuMjMgNTkzLjU0OTEgMzg0LjQ4IF0vTyAvTGF5b3V0ID4+QkRDIApFTUMgCi9BcnRpZmFjdCA8PC9CQm94IFsxOC4zMDcgMzUwLjc1IDU5My41NDkxIDM1MSBdL08gL0xheW91dCA+PkJEQyAKRU1DIAovQXJ0aWZhY3QgPDwvQkJveCBbMTguNDUxIDMxNi41NSA1OTMuNjkzIDMxNi44IF0vTyAvTGF5b3V0ID4+QkRDIApFTUMgCi9BcnRpZmFjdCA8PC9CQm94IFsxOC41OTUgMjgxLjk5IDU5My41NDkxIDI4Mi4yNCBdL08gL0xheW91dCA+PkJEQyAKcQoxIDAgMCAxIDE4LjcyIDI4Mi4xMTUgY20KMCAwIG0KNTc0LjcwNCAwIGwKUwpRCkVNQyAKL0FydGlmYWN0IDw8L0JCb3ggWzE4LjQ1MSAyNDguMTUgNTk0LjEyNSAyNDguNCBdL08gL0xheW91dCA+PkJEQyAKcQoxIDAgMCAxIDE4LjU3NiAyNDguMjc1IGNtCjAgMCBtCjU3NS40MjQgMCBsClMKUQpFTUMgCi9BcnRpZmFjdCA8PC9CQm94IFsxOC41OTUgMjEzLjU5IDU5My41NDkxIDIxMy44NCBdL08gL0xheW91dCA+PkJEQyAKcQoxIDAgMCAxIDE4LjcyIDIxMy43MTUgY20KMCAwIG0KNTc0LjcwNCAwIGwKUwpRCkVNQyAKL0FydGlmYWN0IDw8L0JCb3ggWzE4LjQ1MSAxNzkuMDMgNTkzLjQwNSAxNzkuMjggXS9PIC9MYXlvdXQgPj5CREMgCnEKMSAwIDAgMSAxOC41NzYgMTc5LjE1NSBjbQowIDAgbQo1NzQuNzA0IDAgbApTClEKRU1DIApCVAovUCA8PC9MYW5nIChlbi1VUykvTUNJRCAyMCA+PkJEQyAKMTAgMCAwIDEwIDEyMi4xMzgyIDQzMC44NTk2IFRtClsoRVhUUik1IChBIEQpMzUgKEEpODAgKFkpNTUgKFMgUkVOVEVEKV1USgpFTUMgCi9QIDw8L0xhbmcgKGVuLVVTKS9NQ0lEIDIxID4+QkRDIAotNy45OTEgLTIzLjI4NCBUZApbKFApNjAuNCAoQSk4MCAoWU1FTlQpXVRKCkVNQyAKL1AgPDwvTGFuZyAoZW4tVVMpL01DSUQgMjIgPj5CREMgCjEuMDM1IC0xLjIgVGQKKFRZUEUpVGoKRU1DIAovUCA8PC9MYW5nIChlbi1VUykvTUNJRCAyMyA+PkJEQyAKLTMuNDU3IC03LjM3NyBUZApbKEJJTiBQTCktOS42IChBKV1USgoxMCAwIDAgMTAgMTIxLjYxNDYgMzk1LjI5OTcgVG0KLTYuNjIzIC0yOC4zMDUgVGQKWyhDKTUgKEVNRU5UKTYwLjEgKDopXVRKCkVNQyAKL1AgPDwvTGFuZyAoZW4tVVMpL01DSUQgMjQgPj5CREMgCi0yLjg3NCA0LjcyNSBUZAooRVhQOilUagpFTUMgCi9QIDw8L0xhbmcgKGVuLVVTKS9NQ0lEIDI1ID4+QkRDIAotMC4wNCBUYyAwLjA0IFR3IDEzLjM5MiAwLjAzNiBUZApbKEMpLTM1IChDKS0yMCAoVjopXVRKCkVNQyAKL1AgPDwvTGFuZyAoZW4tVVMpL01DSUQgMjYgPj5CREMgCjAgVGMgMCBUdyAyOC43MDggLTMuNDU2IFRkClsoUykyMCAodWIpMTUgKHQpMzUgKG8pMTUgKHQpMzUgKGFsOildVEoKRU1DIAovUCA8PC9MYW5nIChlbi1VUykvTUNJRCAyNyA+PkJEQyAKLTAuMDUgVGMgMC4wNSBUdyAwLjkzOCAtNi43NjggVGQKWyhUT1QpMjUgKEEpLTUwIChMKS01MCAoOildVEoKRU1DIAovUCA8PC9MYW5nIChlbi1VUykvTUNJRCAyOCA+PkJEQyAKMCBUYyAwIFR3IC0zLjU1MyAzLjMxMiBUZApbKFNhbGVzIFQpMTEwIChheCBIUyk1NS4xIChUKTYwICg6KV1USgpFTUMgCkVUCi9BcnRpZmFjdCA8PC9CQm94IFs0OTkuMzc1IDExMi4wNyA1OTMuNDA1IDExMi4zMiBdL08gL0xheW91dCA+PkJEQyAKcQoxIDAgMCAxIDQ5OS41IDExMi4xOTUgY20KMCAwIG0KOTMuNzggMCBsClMKUQpFTUMgCi9BcnRpZmFjdCA8PC9CQm94IFs0OTkuMzc1IDc3LjUxIDU5My40MDUgNzcuNzYgXS9PIC9MYXlvdXQgPj5CREMgCnEKMSAwIDAgMSA0OTkuNSA3Ny42MzUgY20KMCAwIG0KOTMuNzggMCBsClMKUQpFTUMgCi9BcnRpZmFjdCA8PC9CQm94IFs0OTkuMTIzIDQzLjY3IDU5My42OTMgNDMuOTIgXS9PIC9MYXlvdXQgPj5CREMgCnEKMSAwIDAgMSA0OTkuMjQ4IDQzLjc5NSBjbQowIDAgbQo5NC4zMiAwIGwKUwpRCkVNQyAKL0FydGlmYWN0IDw8L0JCb3ggWzEwMC4zMTUgMTEyLjA3IDM4OC41NjUgMTEyLjMyIF0vTyAvTGF5b3V0ID4+QkRDIApxCjEgMCAwIDEgMTAwLjQ0IDExMi4xOTUgY20KMCAwIG0KMjg4IDAgbApTClEKRU1DIAovQXJ0aWZhY3QgPDwvQkJveCBbNTkzLjI4IDQzLjc5NSA1OTMuNTMgMTQ2LjY0NSBdL08gL0xheW91dCA+PkJEQyAKcQoxIDAgMCAxIDU5My40MDUgMTQ2LjUyIGNtCjAgMCBtCjAgLTEwMi42IGwKUwpRCkVNQyAKL0FydGlmYWN0IDw8L0JCb3ggWzE4LjIzNSA3OC41OSAzODguMTAyNCA3OC44NCBdL08gL0xheW91dCA+PkJEQyAKcQoxIDAgMCAxIDE4LjM2IDc4LjcxNSBjbQowIDAgbQozNjkuNjE3IDAgbApTClEKRU1DIAovQXJ0aWZhY3QgPDwvQkJveCBbMTguMjM1IDQ1IDM4OC4xMDI0IDQ1LjI1IF0vTyAvTGF5b3V0ID4+QkRDIApxCjEgMCAwIDEgMTguMzYgNDUuMTI1IGNtCjAgMCBtCjM2OS42MTcgMCBsClMKUQpFTUMgCkJUCi9DMF8wIDEwIFRmCjE4IDYxNi43OTEgVGQKPDAwMEQwMDg2MDBBMjAwQTI+VGoKL0MwXzEgMTAgVGYKPDAxNTkwMTQwPlRqCi9UMV8xIDEwIFRmCig6KVRqCi9DMF8wIDEwIFRmCjwwMTU5PlRqCjAgLTE3Ljg3NyBURAo8MDAzRDAwOEYwMDhGMDA5NjAwN0QwMDg2PlRqCi9DMF8xIDEwIFRmCjwwMTU5MDE0MD5UagovVDFfMSAxMCBUZgooOilUagpFVAovVG91Y2hVcF9UZXh0RWRpdCBNUApCVAovVDFfMSAxIFRmCjEwIDAgMCAxMCAxOCA1NzguODU2MyBUbQpbKEUpMTAgKC1NYWlsOildVEoKRVQKcQowLjYzMTM5MzQgMCAwIDEgNjAuNjI1MzY2MiA1OTkuMTExMjA2MSBjbQowIDAgbQoyNzEuOCAwIGwKUwpRCnEKMSAwIDAgMSA1MS4xMTk5OTUxIDU3OC45NTExODcxIGNtCjAgMCBtCjI1My40NCAwIGwKUwpRCkJUCi9UMV8xIDEwIFRmCjIzNC42MjQgNTk5LjY2NiBUZAooRSlUagovQzBfMiAxMCBUZgo8MDBEOTAwQzUwMTM2PlRqCkVUCnEKLTAuMTk5NjkxOCAwIDAgMSAzMDYuMTM4NDU4MyA1OTkuMTExMjA2MSBjbQowIDAgbQoyNzEuOCAwIGwKUwpRCnEKMC45NDYwNzU0IDAgMCAxIDQzNC4wODExMTU3IDYxOC43NDc4MDI3IGNtCjAgMCBtCjE2OS41NiAwIGwKUwpRCnEKMS4wOTQyOTkzIDAgMCAxIDQyMC4zNTQyMTc1IDU5OC41ODc3Njg2IGNtCjAgMCBtCjE1OS4xMiAwIGwKUwpRCnEKMC45OTc1MjgxIDAgMCAwLjk5OTk4NDcgMTguODg5NTU2OSAzODMuNjM0MTU1MyBjbQowIDAgbQo1NzUuNDI0IDAgbApTClEKcQowLjk5NzE0NjYgMCAwIDEgMTkuNDM0OTA2IDUxOC45OTQyNjI3IGNtCjAgMCBtCjU3NS40MjQgMCBsClMKUQogClEKCnEKMC4wIDAuMCA2MTIgNzkyIHJlClcKbgoxIDAgMCAxIDAgMCBjbQpCVAovRjEgMTIgVGYKMTQuNCBUTApFVApCVAovRjEgMTAgVGYKMTIgVEwKRVQKMC4yIDAuMiAwLjIgcmcKQlQKMSAwIDAgMSAzMi43MTUgMzk2LjkgVG0KKERST1BQRURcMDQwQlkpIFRqClQqCkVUCkJUCjEgMCAwIDEgMzAuNDkgMzYzLjA1IFRtCihQSUNLRURcMDQwVVBcMDQwQlkpIFRqClQqCkVUClEKCgplbmRzdHJlYW0KZW5kb2JqCjYgMCBvYmoKPDwKL0FJUyBmYWxzZQovQk0gL05vcm1hbAovQ0EgMQovT1AgdHJ1ZQovT1BNIDEKL1NBIHRydWUKL1NNYXNrIC9Ob25lCi9UeXBlIC9FeHRHU3RhdGUKL2NhIDEKL29wIHRydWUKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0FJUyBmYWxzZQovQk0gL05vcm1hbAovQ0EgMQovT1AgZmFsc2UKL09QTSAxCi9TQSB0cnVlCi9TTWFzayAvTm9uZQovVHlwZSAvRXh0R1N0YXRlCi9jYSAxCi9vcCBmYWxzZQo+PgplbmRvYmoKOCAwIG9iago8PAovQmFzZUZvbnQgL0VYWElYUStHaWxtZXItTGlnaHQKL0Rlc2NlbmRhbnRGb250cyA5IDAgUgovRW5jb2RpbmcgL0lkZW50aXR5LUgKL1N1YnR5cGUgL1R5cGUwCi9Ub1VuaWNvZGUgMTUgMCBSCi9UeXBlIC9Gb250Cj4+CmVuZG9iago5IDAgb2JqClsgMTAgMCBSIF0KZW5kb2JqCjEwIDAgb2JqCjw8Ci9CYXNlRm9udCAvRVhYSVhRK0dpbG1lci1MaWdodAovQ0lEU3lzdGVtSW5mbyAxMSAwIFIKL0RXIDEwMDAKL0ZvbnREZXNjcmlwdG9yIDEyIDAgUgovU3VidHlwZSAvQ0lERm9udFR5cGUwCi9UeXBlIC9Gb250Ci9XIFsgMCBbIDUwMCA2ODEgNjgxIDY4MSA2ODEgNjgxIDY4MSA2ODEgNjgxIDY4MSA2ODEgOTY2IDY4MiA3ODIgNzgyIDc4MiA3ODIgNzgyIDcyMCA3NTEgNzIwIDc1MSA2MjEgNjIxIDYyMSA2MjEgNjIxIDYyMSA2MjEgNjIxIDYyMSA1NzMgNzk5IDc5OSA3OTkgNzk5IDcxNCA3NDAgMjExIDIxMSAyMTEgMjExIDIxMSAyMTEgMjExIDIxMSA2MDEgNjY2IDY2NiA1NjkgNTY5IDU3OSA1NjkgNjEyIDgxMCA3MTkgNzE5IDcxOSA3MTkgNzE5IDcxOSA4MDUgODA1IDgwNSA4MDUgODA1IDgwNSA4MDUgODA1IDgwNSBdIDcxIFsgNjM2IDYzNiA4MDUgNjY3IDY2NyA2NjcgNjY3IDY1OCA2NTggNjU4IDY1OCA2NTggNjIyIDYyMiA2MjIgNjIyIDYyMiA3MDAgNzAwIDcwMCA3MDAgNzAwIDcwMCA3MDAgNzAwIDcwMCA2NjIgOTc4IDk3OCA5NzggOTc4IDk3OCA2NjkgNjM5IDYzOSA2MzkgNjM5IDYzOSA2MjEgNjIxIDYyMSA2MjEgNjQzIDY0MyA2NDMgNjQzIDY0MyA2NDMgNjQzIDY0MyA2NDMgNjQzIDEwNTYgNjQzIDU3NiA1NzYgNTc2IDU3NiA1NzYgNjQzIDYxMyA3MDAgNjU0IDU4NyA1ODcgNTg3IDU4NyA1ODcgNTg3IDU4NyA1ODcgNTg3IDM5NCA2NDMgNjQzIDY0MyA2NDMgNjAxIDYwOSAyMjAgMjEwIDIxMCAyMTAgMjEwIDIxMCAyMTAgMjEwIDIxMCAyMTYgNTEwIDUxMCAyMDkgMjA5IDI3OSAyMDkgMjU2IDkxNiA2MDEgNjAxIDYwMSA2MDEgNjAxIDYwMSA2MTQgNjE0IDYxNCA2MTQgNjE0IDYxNCA2MTQgNjE0IDYxNCAxMDU4IDY0MyA2NDMgNjQzIDMzOSAzMzkgMzM5IDMzOSA1MDUgNTA1IDUwNSA1MDUgNTA1IDU4MSA0MDcgNDA3IDQwNyA0MDcgNDA3IDYwMSA2MDEgNjAxIDYwMSA2MDEgNjAxIDYwMSA2MDEgNjAxIDUyNCA3NDcgNzQ3IDc0NyA3NDcgNzQ3IDUxMSA1MjcgNTI3IDUyNyA1MjcgNTI3IDUwOSA1MDkgNTA5IDUwOSA2OTMgODU1IDg1NSA4NjUgNTU2IDcwOSA1NTYgNTY2IDcxMSA2ODEgODMwIDYzNyA2NDggNjMwIDM2NCA1NjYgNTc2IDU4MSA1NzcgNTU3IDUxNSA1OTggNTU3IDM3NyAyMjggMzMzIDM0NiAzNDIgMzQxIDMyNyAzMDMgMzQ2IDMyNyA1NzAgNTcwIDU3MCA1NzAgNTcwIDU3MCA1NzAgNTcwIDU3MCA1NzAgMzc3IDIyOCAzMzMgMzQ2IDM0MiAzNDEgMzI3IDMwMyAzNDYgMzI3IDM3NyAyMjggMzMzIDM0NiAzNDIgMzQxIDMyNyAzMDMgMzQ2IDMyNyAzNzcgMjI4IDMzMyAzNDYgMzQyIDM0MSAzMjcgMzAzIDM0NiAzMjcgMTkxIDc1MiA3NjEgODc5IDc2NSA4ODMgODc4IDg0MCAyMDYgMjI1IDIwNiAyMjkgNTc4IDIzNiAyMDYgNTU2IDUzNiAyMDYgMjgyIDQwNiA3MjEgNTM4IDUzOCAyNjYgMjY2IDM4NCAzODQgMzI2IDMyNiA1MDAgNjMwIDkzMCA1ODAgMjI1IDM1OCAzNTggMzU4IDIyNSAyMjUgNDQwIDQ0MCAzMDcgMzA3IDMxNCAxODAgMjY1IDY0NSA1NzQgNjEyIDYzNyA3NTYgNDg3IDYwNyA2NDggNjQ4IDY1OSA1NTAgNTUwIDQ5MyA1ODAgNTUyIDU1MiA1NDUgNTQ1IDU1NSA1NTUgNTUwIDYxMCA1OTAgNTYwIDUwNiA5MDAgNTM1IDUzMyA2MzYgNjQ5IDY1NiA2NDAgOTc1IDEzOTggNzc4IDY3MSA4NjIgNjcwIDc3OCA2NzEgODYyIDY3MCAxMTIyIDc3OCA1NjcgMTAxMiA2ODIgNjEwIDU0OSA3NjEgNzYxIDcwOCAzOTggMTk3IDE5NyA1MDAgNTAwIDg1NSAxMDU3IDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDE0MSAyNzggMjc1IDIwMiAyNzUgMjU0IDg2IDE0MSAyODEgMjUwIDE3MSAyMTAgMjg0IF0gXQo+PgplbmRvYmoKMTEgMCBvYmoKPDwKL09yZGVyaW5nIChJZGVudGl0eSkKL1JlZ2lzdHJ5IChBZG9iZSkK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vGcfxAf2UXxkF+KCLXnSOc9ZfGZfxPSBmZb8mvNryak5p5ZsmrNpyaY5m5ZsmrNpyUYDH9TjRPjIqLPw7Ie5h0CtmNs/94BPv3X4/EN874Gq+Fa/AgwAhlOgtQplbmRzdHJlYW0KZW5kb2JqCjI3IDAgb2JqCjw8Ci9CYXNlRm9udCAvS01HVVBYK0dpbG1lci1MaWdodAovRW5jb2RpbmcgMjggMCBSCi9GaXJzdENoYXIgMzEKL0ZvbnREZXNjcmlwdG9yIDI5IDAgUgovTGFzdENoYXIgMTQ5Ci9TdWJ0eXBlIC9UeXBlMQovVG9Vbmljb2RlIDMxIDAgUgovVHlwZSAvRm9udAovV2lkdGhzIFsgNjkzIDI2NSAwIDAgNzIxIDYzNyAwIDY4MiAwIDI2NiAyNjYgNDA2IDAgMjI1IDUwMCAyMDYgNTM4IDYzMCAzNjQgNTY2IDU3NiA1ODEgNTc3IDU1NyA1MTUgNTk4IDU1NyAyMDYgMCAwIDAgMCA1NTYgMTAxMiA2ODEgNjgyIDc4MiA3MjAgNjIxIDU3MyA3OTkgNzE0IDIxMSA2MDEgNjY2IDU2OSA4MTAgNzE5IDgwNSA2MzYgODA1IDY2NyA2NTggNjIyIDcwMCA2NjIgOTc4IDY2OSA2MzkgMCAwIDAgMCAwIDAgMCA2NDMgNjQzIDU3NiA2NDMgNTg3IDM5NCA2NDMgNjAxIDIyMCAyMTYgNTEwIDIwOSA5MTYgNjAxIDYxNCA2NDMgNjQzIDMzOSA1MDUgNDA3IDYwMSA1MjQgNzQ3IDUxMSA1MjcgNTA5IDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAwIDAgMCAyMjUgMCAwIDI4MiBdCj4+CmVuZG9iagoyOCAwIG9iago8PAovQmFzZUVuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKL0RpZmZlcmVuY2VzIFsgMzEgL2ZfZiBdCi9UeXBlIC9FbmNvZGluZwo+PgplbmRvYmoKMjkgMCBvYmoKPDwKL0FzY2VudCA5NjQKL0NhcEhlaWdodCA3MDAKL0NoYXJTZXQgKFwwNTdmXDEzN2ZcMDU3c3BhY2VcMDU3bnVtYmVyc2lnblwwNTdkb2xsYXJcMDU3YW1wZXJzYW5kXDA1N3BhcmVubGVmdFwwNTdwYXJlbnJpZ2h0XDA1N2FzdGVyaXNrXDA1N2NvbW1hXDA1N2h5cGhlblwwNTdwZXJpb2RcMDU3c2xhc2hcMDU3emVyb1wwNTdvbmVcMDU3dHdvXDA1N3RocmVlXDA1N2ZvdXJcMDU3Zml2ZVwwNTdzaXhcMDU3c2V2ZW5cMDU3ZWlnaHRcMDU3bmluZVwwNTdjb2xvblwwNTdxdWVzdGlvblwwNTdhdFwwNTdBXDA1N0JcMDU3Q1wwNTdEXDA1N0VcMDU3RlwwNTdHXDA1N0hcMDU3SVwwNTdKXDA1N0tcMDU3TFwwNTdNXDA1N05cMDU3T1wwNTdQXDA1N1FcMDU3UlwwNTdTXDA1N1RcMDU3VVwwNTdWXDA1N1dcMDU3WFwwNTdZXDA1N2FcMDU3YlwwNTdjXDA1N2RcMDU3ZVwwNTdmXDA1N2dcMDU3aFwwNTdpXDA1N2pcMDU3a1wwNTdsXDA1N21cMDU3blwwNTdvXDA1N3BcMDU3cVwwNTdyXDA1N3NcMDU3dFwwNTd1XDA1N3ZcMDU3d1wwNTd4XDA1N3lcMDU3elwwNTdxdW90ZXJpZ2h0XDA1N2J1bGxldCkKL0Rlc2NlbnQgLTI0MwovRmxhZ3MgMzIKL0ZvbnRCQm94IFsgLTI4NCAtMjQzIDEzNDMgOTY0IF0KL0ZvbnRGYW1pbHkgKEdpbG1lclwwNDBMaWdodCkKL0ZvbnRGaWxlMyAzMCAwIFIKL0ZvbnROYW1lIC9LTUdVUFgrR2lsbWVyLUxpZ2h0Ci9Gb250U3RyZXRjaCAvTm9ybWFsCi9Gb250V2VpZ2h0IDMwMAovSXRhbGljQW5nbGUgMAovU3RlbVYgNDgKL1R5cGUgL0ZvbnREZXNjcmlwdG9yCi9YSGVpZ2h0IDQ5NQo+PgplbmRvYmoKMzAgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL1N1YnR5cGUgL1R5cGUxQwovTGVuZ3RoIDQ4MDAKPj4Kc3RyZWFtCkiJbFQLUBRXFp1meN0jn1ZmpjHMaPegpYS/4EYYRH4uICrKJ7Kjooh8BMQfuCCKYoxGSdStWFmTdcsVP5iVDJ+UUZmGwQ+66CoiVoFgRNdlVVQiiqy3x4vWNia7SVW26vV7/d699/S5797TlMLeTkFRlHZOfOyCBJN3bG7+qqwC37m5K3LWj5xP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MC4wIF0KL0MxIFsgMC42OSAwLjAgMSAwLjAgXQovRG9tYWluIFsgMCAxIF0KL0Z1bmN0aW9uVHlwZSAyCi9OIDEKL1JhbmdlIFsgMC4wIDEgMC4wIDEgMC4wIDEgMC4wIDEgXQo+PiBdCmVuZG9iagp4cmVmCjAgMzMKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNzQgMDAwMDAgbiAKMDAwMDAwMDExMyAwMDAwMCBuIAowMDAwMDAwMTYyIDAwMDAwIG4gCjAwMDAwMDk1NjIgMDAwMDAgbiAKMDAwMDA1NTI3MyAwMDAwMCBuIAowMDAwMDU1MzkzIDAwMDAwIG4gCjAwMDAwNTU1MTUgMDAwMDAgbiAKMDAwMDA1NTY1OCAwMDAwMCBuIAowMDAwMDU1Njg0IDAwMDAwIG4gCjAwMDAwNTc1NDkgMDAwMDAgbiAKMDAwMDA1NzYyNCAwMDAwMCBuIAowMDAwMDU3OTIwIDAwMDAwIG4gCjAwMDAwNTgwMzcgMDAwMDAgbiAKMDAwMDA1OTk4NSAwMDAwMCBuIAowMDAwMDYwMzQ4IDAwMDAwIG4gCjAwMDAwNjA0OTMgMDAwMDAgbiAKMDAwMDA2MDUyMCAwMDAwMCBuIAowMDAwMDYwODk1IDAwMDAwIG4gCjAwMDAwNjEwNDAgMDAwMDAgbiAKMDAwMDA2MTA2NyAwMDAwMCBuIAowMDAwMDYxMzg2IDAwMDAwIG4gCjAwMDAwNjE0OTQgMDAwMDAgbiAKMDAwMDA2MTg0MSAwMDAwMCBuIAowMDAwMDYyMjY0IDAwMDAwIG4gCjAwMDAwNjU0MTAgMDAwMDAgbiAKMDAwMDA2NTgwOSAwMDAwMCBuIAowMDAwMDY2MzgzIDAwMDAwIG4gCjAwMDAwNjY0NzcgMDAwMDAgbiAKMDAwMDA2NzI5MCAwMDAwMCBuIAowMDAwMDcyMTgxIDAwMDAwIG4gCjAwMDAwNzI4MjUgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSAzMwovUm9vdCAzIDAgUgovSW5mbyAyIDAgUgo+PgpzdGFydHhyZWYKNzMwMTMKJSVFT0YK';

async function printBinRental(jobId) {
  var j = null;
  jobs.forEach(function(jj) { if (jj.id === jobId) j = jj; });
  if (!j) { toast('Job not found'); return; }
  if (j.service !== 'Bin Rental') { toast('Print only available for Bin Rentals'); return; }

  try {
    var pdfBytes = Uint8Array.from(atob(BIN_RENTAL_PDF_B64), function(c) { return c.charCodeAt(0); });
    var pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
    var page = pdfDoc.getPages()[0];
    var font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    var fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    var H = 792; // page height
    var black = PDFLib.rgb(0, 0, 0);

    function drawText(text, x, yFromTop, opts) {
      if (!text) return;
      page.drawText(String(text), {
        x: x,
        y: H - yFromTop,
        size: (opts && opts.size) || 10,
        font: (opts && opts.bold) ? fontBold : font,
        color: black
      });
    }

    // Look up full client data — always fetch from Supabase to ensure all fields are included
    var email = '';
    var clientPhones = [];
    if (j.clientId) {
      var cr = await db.from('clients').select('*').eq('cid', j.clientId).single();
      if (cr.data) {
        email = (cr.data.emails && cr.data.emails.length) ? cr.data.emails[0] : (cr.data.email || '');
        clientPhones = cr.data.phones || [];
      }
    }

    // Look up assigned bin — fetch from Supabase if not in local cache
    var assignedBin = j.binBid ? binItems.find(function(b) { return b.bid === j.binBid; }) : null;
    if (!assignedBin && j.binBid) {
      var br = await db.from('bin_items').select('*').eq('bid', j.binBid).single();
      if (br.data) assignedBin = br.data;
    }
    var binNum = assignedBin ? assignedBin.num : '';
    var binSize = assignedBin ? assignedBin.size : (j.binSize || '');

    // Format date helper
    function fmtDate(d) {
      if (!d) return '';
      var parts = d.split('-');
      if (parts.length === 3) return parts[1] + '/' + parts[2] + '/' + parts[0];
      return d;
    }

    // Parse address into street + city
    var street = j.address || '';
    var city = j.city || '';

    // Driveway side
    var side = j.binSide ? j.binSide.charAt(0).toUpperCase() + j.binSide.slice(1) + ' Side' : '';

    // ── LEFT COLUMN: Customer Info ──
    drawText(j.name, 55, 112);
    drawText(street, 65, 132);
    // Find home phone by type
    var homePhone = clientPhones.find(function(p) { return p && p.type === 'home'; });
    if (homePhone) drawText(homePhone.num, 65, 152);
    // Cell phone
    var cellPhone = clientPhones.find(function(p) { return p && (p.type === 'cell' || !p.type); });
    drawText(cellPhone ? cellPhone.num : (j.phone || ''), 55, 172);
    // Office phone + ext
    var officePhone = clientPhones.find(function(p) { return p && p.type === 'office'; });
    if (officePhone) {
      drawText(officePhone.num, 65, 190);
      if (officePhone.ext) drawText(officePhone.ext, 258, 189);
    }
    drawText(email, 55, 210);

    // ── RIGHT COLUMN: Bin Info ──
    drawText(binNum, 395, 70);          // Bin #
    drawText(binSize, 390, 110);        // Size
    drawText(fmtDate(j.binDropoff), 440, 130);  // Drop Off Date
    drawText(fmtDate(j.binPickup), 430, 150);   // Pick Up Date

    // ── TABLE: Line Items ──
    var price = parseFloat(j.price) || 0;
    var duration = j.binDuration || '';

    // Days rented value next to description
    drawText(duration, 200, 296);
    // Line total
    drawText('$' + price.toFixed(2), 530, 290);

    // Deposit row in table (row 4, after extra days rented)
    var deposit = parseFloat(j.deposit) || 0;
    if (deposit > 0) {
      drawText('DEPOSIT' + (j.depositPaid ? ' (PAID)' : ''), 130, 392);
      drawText('$' + deposit.toFixed(2), 530, 392);
    }

    // ── WOOD UNDER BIN (row below Picked Up By) ──
    drawText('WOOD UNDER BIN', 42, 478);

    // ── PAYMENT TYPE ──
    drawText(j.payMethod || '', 130, 596);

    // ── BIN PLACEMENT (wrap text to stay on the lines) ──
    var placementText = side + (j.notes ? ' — ' + j.notes : '');
    var maxWidth = 370; // stop before Subtotal/HST/Total labels on the right
    var lineHeight = 13;
    var placementY = 673;
    if (placementText) {
      var words = placementText.split(' ');
      var line = '';
      var lineNum = 0;
      for (var wi = 0; wi < words.length; wi++) {
        var testLine = line ? line + ' ' + words[wi] : words[wi];
        var testWidth = font.widthOfTextAtSize(testLine, 10);
        if (testWidth > maxWidth && line) {
          drawText(line, 105, placementY + lineNum * lineHeight);
          line = words[wi];
          lineNum++;
        } else {
          line = testLine;
        }
      }
      if (line) drawText(line, 105, placementY + lineNum * lineHeight);
    }

    // Generate and open
    var filledBytes = await pdfDoc.save();
    var blob = new Blob([filledBytes], { type: 'application/pdf' });
    var url = URL.createObjectURL(blob);
    window.open(url, '_blank');

    toast('Bin Rental form generated!');
  } catch (err) {
    console.error('PDF generation error:', err);
    toast('Error generating PDF: ' + err.message);
  }
}


