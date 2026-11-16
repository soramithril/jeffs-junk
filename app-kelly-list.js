// ── KELLY'S LIST — PREVIEW, JAKE ONLY (v749) ────────────────────────────────
// Jake, 2026-11-16: "Kelly always forgets bins are out", and the morning brief pop-up
// doesn't work either — it closes with one click and nobody reads it. Three layouts
// for its replacement, built into the real dashboard so he can pick on his own screen
// with real data before anyone else sees it:
//   a  — the list pinned above Today's Jobs
//   b  — Today's Jobs keeps the top, the list is pinned down the right-hand side
//   c  — b, plus the bin check-in card that takes over the screen on the first visit
// Only Jake's login sees any of it; for everyone else JJKellyList.on() is false and
// nothing here draws. While a layout is on, it stands in for his morning brief.
//
// The lines come from the morning brief itself (_jjbGather/_jjbLines in app-brief.js,
// Kelly's 'office' list), plus one new line: bins out with no pickup date for 7+ days.
// Those are the forgotten ones — on 2026-11-16, 16 of 35 bins out had no pickup date
// and nothing ever made them due. Bins with a booked pickup were all on time.
//
// PRACTICE MODE: the bin card saves nothing. "Book pickup" and "Still using it" only
// remember the answer on this page, so Jake can click freely. The real saving (a
// check-in date per job) is built after he picks a layout.

window.JJKellyList = (function(){
  var MODES = { a: 'A · List on top', b: 'B · List down the side', c: 'C · Side + bin card first', off: 'Off' };
  var BIN_DAYS = 7;          // a bin with no pickup date comes up once it has been out this long
  var practice = {};         // job_id -> what Jake answered on the card (this page only)
  var bins = [];             // the no-date bins due a check-in, oldest first
  var lines = [];            // the brief's open lines for Kelly
  var renderNo = 0;          // a newer render wins over a slower older one
  var cardAt = 0;            // index of the bin showing on the card

  function isJake(){ return !!(currentUser && currentUser.displayName === 'Jake'); }
  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lsSet(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
  function mode(){
    if(!isJake()) return 'off';
    var m = lsGet('jjKellyListMode');
    return MODES[m] ? m : 'c';
  }
  function on(){ return mode() !== 'off'; }

  function plusDays(n){ var d = new Date(); d.setDate(d.getDate() + n); return ymdLocal(d); }
  function niceDate(s){
    return new Date(s + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  async function loadBins(){
    var r = await db.from('jobs')
      .select('job_id,name,business_name,phone,address,city,bin_bid,bin_size,bin_dropoff,date,bin_will_call')
      .eq('service', 'Bin Rental').eq('bin_instatus', 'dropped').neq('status', 'Cancelled').is('bin_pickup', null);
    if(r.error) throw new Error('Kelly\'s list: bins query failed: ' + r.error.message);
    return r.data.map(function(j){ j._days = binDaysOut(j.bin_dropoff || j.date); return j; })
      .filter(function(j){ return j._days >= BIN_DAYS; })
      .sort(function(a, b){ return b._days - a._days; });
  }

  // ── the list ──────────────────────────────────────────────────────────────
  function binsLine(){
    var left = bins.filter(function(j){ return !practice[j.job_id]; });
    var top = bins.slice(0, 3).map(function(j){ return escHtml(j.bin_bid || 'no bin') + ' (' + j._days + ' days)'; }).join(', ');
    return {
      key: 'bins', ic: 'call', lvl: 'warn', open: left.length > 0,
      title: bins.length + ' bin' + (bins.length === 1 ? '' : 's') + ' out with no pickup booked',
      sub: left.length
        ? top + (bins.length > 3 ? ' and ' + (bins.length - 3) + ' more' : '') + ' · call to check in'
        : 'All answered (practice): ' + bins.map(function(j){ return escHtml(j.bin_bid) + ' ' + practice[j.job_id]; }).join(' · '),
      link: 'Start calls'
    };
  }

  function rowsNow(){
    var rows = [];
    if(bins.length) rows.push(binsLine());
    lines.forEach(function(l){ rows.push({ key: l.key, ic: l.ic, lvl: l.lvl, open: true, title: l.title, sub: l.sub, link: l.link }); });
    // A line that was open earlier today and has gone from the brief's data was done
    // somewhere in the app — keep it on the list, ticked, so the list visibly shrinks.
    var seenKey = 'jjKellyListSeen:' + todayStr();
    var seen = JSON.parse(lsGet(seenKey) || '{}');
    rows.forEach(function(r){ if(r.open) seen[r.key] = { title: r.title, ic: r.ic, lvl: r.lvl }; });
    Object.keys(seen).forEach(function(k){
      if(!rows.some(function(r){ return r.key === k; })) rows.push({ key: k, ic: seen[k].ic, lvl: seen[k].lvl, open: false, title: seen[k].title, sub: '', link: '' });
    });
    lsSet(seenKey, JSON.stringify(seen));
    return rows;
  }

  var TRUCK = '<svg viewBox="0 0 46 28" width="46" height="28" aria-hidden="true"><rect x="1" y="7" width="27" height="14" rx="2" fill="currentColor" opacity=".85"/><path d="M28 11h8l6 6v4H28z" fill="currentColor"/><rect x="31" y="12.5" width="5" height="4" rx="1" fill="#fff"/><circle cx="9" cy="23" r="4" fill="#1a211e"/><circle cx="35" cy="23" r="4" fill="#1a211e"/></svg>';

  function listHtml(rows){
    var n = rows.length, done = rows.filter(function(r){ return !r.open; }).length;
    var all = n > 0 && done === n, pct = n ? done / n : 1;
    var first = escHtml(String(currentUser.displayName).split(' ')[0]);
    return '<div class="jjkl-head"><span class="jjkl-title">Kelly\'s list</span>'
        + '<span class="jjkl-left">' + (n ? (all ? 'All clear' : (n - done) + ' of ' + n + ' left') : 'Nothing waiting') + '</span></div>'
      + '<div class="jjkl-road' + (all || !n ? ' arrived' : '') + '" aria-hidden="true"><span class="jjkl-truck" style="left:calc(23px + (100% - 90px) * ' + pct + ')">' + TRUCK + '</span><span class="jjkl-yard">YARD</span></div>'
      + (all || !n ? '<div class="jjkl-clear"><b>All clear, ' + first + '</b><span>' + (n ? n + ' thing' + (n === 1 ? '' : 's') + ' done today.' : 'Nothing needs you right now.') + '</span></div>' : '')
      + '<div class="jjkl-lines">' + rows.map(function(r){
          return '<div class="jjkl-line jjkl-' + r.lvl + (r.open ? '' : ' is-done') + '">'
            + '<span class="jjkl-ico">' + lineIcon(r.ic, 20) + '</span>'
            + '<span class="jjkl-txt"><span class="jjkl-t">' + r.title + '</span>' + (r.sub ? '<span class="jjkl-s">' + r.sub + '</span>' : '') + '</span>'
            + '<span class="jjkl-act">' + (r.open
                ? '<button type="button" class="jjkl-btn' + (r.key === 'bins' ? ' pri' : '') + '" onclick="JJKellyList.follow(\'' + r.key + '\')">' + escHtml(r.link) + '</button>'
                : '<span class="jjkl-done">DONE</span>') + '</span>'
          + '</div>';
        }).join('') + '</div>';
  }

  function switchHtml(m){
    return '<span class="jjkl-sw-lbl">Preview · only you see this</span><span class="jjkl-sw-btns">'
      + Object.keys(MODES).map(function(k){
          return '<button type="button" class="jjkl-sw-b' + (k === m ? ' on' : '') + '" onclick="JJKellyList.setMode(\'' + k + '\')">' + MODES[k] + '</button>';
        }).join('') + '</span>';
  }

  function clear(){
    ['jjkl-switch', 'jjkl-list'].forEach(function(id){ var el = document.getElementById(id); if(el) el.remove(); });
    var split = document.querySelector('.jjkl-split');
    if(split) split.classList.remove('jjkl-split');
  }

  function paint(m){
    clear();
    var bar = document.querySelector('#view-dashboard .djj-jumpbar');
    if(!bar) throw new Error('Kelly\'s list: dashboard jump bar not found');
    var sw = document.createElement('div');
    sw.id = 'jjkl-switch';
    sw.innerHTML = switchHtml(m);
    bar.parentNode.insertBefore(sw, bar);
    if(m === 'off') return;
    var todaySec = document.getElementById('card-today-jobs').closest('.dash-section');
    var list = document.createElement('section');
    list.id = 'jjkl-list';
    list.className = 'jjkl-list';
    list.innerHTML = listHtml(rowsNow());
    if(m === 'a'){
      todaySec.parentNode.insertBefore(list, todaySec);
    } else {
      todaySec.classList.add('jjkl-split');
      todaySec.appendChild(list);
    }
  }

  // Called by the dashboard after every render; arrival = the first render of a visit.
  async function render(arrival){
    if(!isJake()) return;
    var m = mode();
    var my = ++renderNo;
    if(m === 'off'){ paint(m); return; }
    var res = await Promise.all([_jjbGather(), loadBins()]);
    if(my !== renderNo) return;
    lines = _jjbLines(res[0], 'office').filter(function(l){ return l.ids.length; });
    bins = res[1];
    paint(m);
    if(arrival && m === 'c' && lsGet('jjKellyCard:' + todayStr()) !== '1'
       && bins.some(function(j){ return !practice[j.job_id]; }) && !_jjbBlocked()){
      openCard();
    }
  }

  function setMode(m){
    if(!MODES[m]) throw new Error('Kelly\'s list: unknown layout ' + m);
    lsSet('jjKellyListMode', m);
    render(false);
    if(m === 'c'){
      // Picking C shows the card straight away so it can be seen, even if it already ran today.
      lsSet('jjKellyCard:' + todayStr(), '');
      practice = {};
      setTimeout(function(){ if(mode() === 'c' && bins.length) openCard(); }, 600);
    }
  }

  function follow(key){
    if(key === 'bins'){ openCard(); return; }
    var l = lines.find(function(x){ return x.key === key; });
    if(!l) throw new Error('Kelly\'s list: no line ' + key);
    l.go();
  }

  // ── the bin check-in card ─────────────────────────────────────────────────
  function cardEl(){
    var el = document.getElementById('jjkl-card');
    if(!el){
      el = document.createElement('div');
      el.id = 'jjkl-card';
      el.className = 'modal-overlay jjkl-ov';
      document.body.appendChild(el);
    }
    return el;
  }

  function openCard(){
    cardAt = bins.findIndex(function(j){ return !practice[j.job_id]; });
    if(cardAt < 0){ practice = {}; cardAt = 0; }   // all answered: run them again from the top
    drawCard();
    cardEl().classList.add('open');
  }

  function closeCard(){
    lsSet('jjKellyCard:' + todayStr(), '1');
    cardEl().classList.remove('open');
    var list = document.getElementById('jjkl-list');
    if(list) list.innerHTML = listHtml(rowsNow());
  }

  function drawCard(){
    if(cardAt >= bins.length){ closeCard(); return; }
    var j = bins[cardAt], n = bins.length, dots = '';
    for(var k = 0; k < n; k++) dots += '<span class="' + (practice[bins[k].job_id] ? 'ok' : k === cardAt ? 'on' : '') + '"></span>';
    var who = [j.business_name, j.name].filter(Boolean).map(escHtml).join(' · ');
    var drop = j.bin_dropoff || j.date;
    cardEl().innerHTML = '<div class="jjkl-cc" role="dialog" aria-label="Bin check-in call">'
      + '<div class="jjkl-cch"><b>Bin check-in · ' + (cardAt + 1) + ' of ' + n + '</b><span>Answer each bin to open the dashboard</span></div>'
      + '<div class="jjkl-dots">' + dots + '</div>'
      + '<div class="jjkl-ccb">'
        + '<div class="jjkl-bid">' + escHtml(j.bin_bid || 'No bin number') + '</div>'
        + '<div class="jjkl-bsz">' + escHtml(j.bin_size || '') + (j.bin_will_call ? ' · Will-call' : ' · No pickup date') + '</div>'
        + '<div class="jjkl-addr">' + escHtml([j.address ? j.address.split(',')[0] : '', j.city].filter(Boolean).join(', ')) + '</div>'
        + '<div class="jjkl-out">Out ' + j._days + ' days · dropped ' + niceDate(drop) + '</div>'
        + '<div class="jjkl-who"><b>' + (who || 'No name on the job') + '</b><span>' + escHtml(j.phone || 'no phone on the job') + '</span></div>'
        + '<div class="jjkl-acts" id="jjkl-acts">'
          + '<button type="button" class="jjkl-go y" onclick="JJKellyList.book()">Book pickup</button>'
          + '<button type="button" class="jjkl-go n" onclick="JJKellyList.still()">Still using it</button>'
        + '</div>'
        + '<div class="jjkl-ccn"><span class="jjkl-prac">Practice mode · nothing here saves</span>'
          + '<button type="button" class="jjkl-skip" onclick="JJKellyList.skip()">Close (preview only)</button></div>'
      + '</div></div>';
  }

  function answer(text){
    practice[bins[cardAt].job_id] = text;
    cardAt++;
    drawCard();
  }

  function book(){
    document.getElementById('jjkl-acts').innerHTML =
      '<input type="date" id="jjkl-date" class="jjkl-date" value="' + plusDays(3) + '" min="' + todayStr() + '" aria-label="Pickup date">'
      + '<button type="button" class="jjkl-go y" style="flex:0 0 150px" onclick="JJKellyList.saveBook()">Save</button>';
  }
  function saveBook(){
    var v = document.getElementById('jjkl-date').value;
    if(!v) throw new Error('Kelly\'s list: no pickup date picked');
    answer('pickup ' + niceDate(v));
  }

  function still(){
    document.getElementById('jjkl-acts').innerHTML = '<div class="jjkl-ask">Check again in</div>'
      + [[7, '1 week'], [14, '2 weeks'], [30, '1 month']].map(function(o){
          return '<button type="button" class="jjkl-go n" onclick="JJKellyList.saveStill(' + o[0] + ')">' + o[1] + '</button>';
        }).join('');
  }
  function saveStill(days){ answer('check again ' + niceDate(plusDays(days))); }

  return { on: on, render: render, setMode: setMode, follow: follow,
           book: book, saveBook: saveBook, still: still, saveStill: saveStill, skip: closeCard };
})();
