// ── LOOK PICKER — PREVIEW, JAKE ONLY (v757) ─────────────────────────────────
// Jake, 2026-11-19: build the mockups inside the real app, with a picker to flip
// through them, only visible to him. Each look restyles the WHOLE app (every page,
// pop-ups too) with real data. One look per video/screenshot he sent:
// the Verdelo "Dashboard Animation" clip and the black-widget screenshot (11-19), and
// the six Instagram recordings from 11-11.
//
// Nothing is saved anywhere but this browser (localStorage 'jjLook'), and only Jake's
// login ever gets a look applied. Everyone else never sees the picker or a look.
// All the styling is in app-looks.css, scoped under html.look-<id>.

window.JJLooks = (function(){
  var LOOKS = [
    { id:'forest', lay:'open', grid:'right', name:'Forest night',  from:'"Dashboard Animation" clip (Verdelo)', dark:true,  sw:['#0B1410','#5BE38F'], fonts:'Manrope:wght@400;500;600;700;800' },
    { id:'widget', lay:'top', grid:'left', name:'Black widget',  from:'black widget screenshot (green glow bars)', dark:true, sw:['#000000','#39FF6A'], fonts:'Oswald:wght@300;400;500&family=Inter:wght@400;500;600;700' },
    { id:'clay', lay:'island', grid:'left',   name:'Clay map',      from:'3D clay map with the blue route', dark:false, sw:['#ECEEE8','#1E7B3A'], fonts:'Outfit:wght@400;500;600;700;800' },
    { id:'admin', lay:'open', grid:'right',  name:'Dark admin',    from:'dark admin dashboard recording', dark:true,  sw:['#0E1117','#00C26A'], fonts:'Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700' },
    { id:'yard', lay:'top', grid:'yard',   name:'Logistics yard',from:'3D logistics yard recording', dark:false, sw:['#E4E8EC','#FF7A1A'], fonts:'Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700' },
    { id:'float', lay:'island', grid:'right',  name:'Floating cards',from:'isometric warehouse with floating cards', dark:false, sw:['#F3F5FB','#00A85A'], fonts:'DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700' },
    { id:'glow', lay:'pill', grid:'single',   name:'Green glow',    from:'green-glow pill buttons recording', dark:true,  sw:['#050807','#22FF88'], fonts:'Sora:wght@400;500;600;700' }
  ];
  var KEY = 'jjLook';
  var LAYS = ['open', 'top', 'island', 'pill'];
  var GRIDS = ['right', 'left', 'yard', 'single'];
  var jake = false;
  var clock = 0;
  var watching = false;

  function lsGet(){ try { return localStorage.getItem(KEY); } catch(e){ return null; } }
  function lsSet(v){ try { localStorage.setItem(KEY, v); } catch(e){} }
  function find(id){ for(var i = 0; i < LOOKS.length; i++) if(LOOKS[i].id === id) return LOOKS[i]; return null; }
  function current(){ return jake ? find(lsGet()) : null; }

  function loadFonts(look){
    var id = 'jjlook-font-' + look.id;
    if(document.getElementById(id)) return;
    var l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + look.fonts + '&display=swap';
    document.head.appendChild(l);
  }

  function apply(){
    var root = document.documentElement;
    LOOKS.forEach(function(l){ root.classList.remove('look-' + l.id); });
    LAYS.forEach(function(x){ root.classList.remove('lay-' + x); });
    GRIDS.forEach(function(x){ root.classList.remove('grid-' + x); });
    root.classList.remove('look-dark', 'look-on');
    var look = current();
    if(look){
      loadFonts(look);
      root.classList.add('look-on', 'look-' + look.id, 'lay-' + look.lay, 'grid-' + look.grid);
      if(look.dark) root.classList.add('look-dark');
    }
    drawHello(look);
    drawPicker();
  }

  function set(id){
    lsSet(id && find(id) ? id : 'off');
    apply();
  }
  function step(dir){
    var look = current();
    var i = look ? LOOKS.indexOf(look) : -1;
    // from "Normal", forward goes to the first look and back goes to the last
    var n = (i + dir + LOOKS.length + 1) % (LOOKS.length + 1);
    set(n === LOOKS.length ? 'off' : LOOKS[n].id);
  }

  // ── the greeting across the top of the dashboard (looks only) ──
  // The numbers are the jump bar's own badges (Today's jobs, Needs you, Bins out),
  // so the greeting can never disagree with the page underneath it.
  function badge(id){
    var el = document.getElementById(id);
    if(!el) throw new Error('app-looks.js: #' + id + ' is missing from the dashboard jump bar');
    var n = parseInt(el.textContent, 10);
    return isNaN(n) ? 0 : n;
  }
  function plural(n, one, many){ return n + ' ' + (n === 1 ? one : many); }
  function fillHello(){
    var el = document.getElementById('jjlook-hello');
    if(!el) return;
    var now = new Date(), h = now.getHours();
    var part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    var jobs = badge('jb-today'), needs = badge('jb-needsyou'), out = badge('jb-binsout');
    var hh = now.getHours() % 12 || 12, mm = ('0' + now.getMinutes()).slice(-2);
    el.innerHTML =
      '<div class="jjh-left">'
      + '<div class="jjh-date">' + now.toLocaleDateString('en-CA', { weekday:'long', month:'long', day:'numeric' }) + '</div>'
      + '<div class="jjh-hi">' + part + ', Jake</div>'
      + '<div class="jjh-line">' + plural(jobs, 'job', 'jobs') + ' today'
      + (needs ? ' · <b>' + plural(needs, 'thing needs', 'things need') + ' you</b>' : ' · nothing needs you')
      + ' · ' + plural(out, 'bin', 'bins') + ' out</div>'
      + '</div>'
      + '<div class="jjh-clock"><span>' + hh + ':' + mm + '</span><small>' + (h < 12 ? 'AM' : 'PM') + '</small></div>'
      + '<div class="jjh-stats">'
      +   '<div><b>' + jobs + '</b><small>Today</small></div>'
      +   '<div><b>' + needs + '</b><small>Needs you</small></div>'
      +   '<div><b>' + out + '</b><small>Bins out</small></div>'
      + '</div>';
  }
  function drawHello(look){
    var view = document.getElementById('view-dashboard');
    if(!view) throw new Error('app-looks.js: #view-dashboard is missing');
    var el = document.getElementById('jjlook-hello');
    if(!look){
      if(el) el.remove();
      clearInterval(clock); clock = 0;
      return;
    }
    if(!el){
      el = document.createElement('section');
      el.id = 'jjlook-hello';
      view.insertBefore(el, view.firstChild);
    }
    if(!watching){
      var bar = view.querySelector('.djj-jumpbar');
      if(!bar) throw new Error('app-looks.js: the dashboard jump bar is missing');
      new MutationObserver(fillHello).observe(bar, { childList:true, characterData:true, subtree:true });
      watching = true;
    }
    fillHello();
    if(!clock) clock = setInterval(fillHello, 30000);
  }

  // ── the picker: a small bar bottom-right, Jake only ──
  function drawPicker(){
    var bar = document.getElementById('jjlook-bar');
    if(!jake){ if(bar) bar.remove(); return; }
    if(!bar){
      bar = document.createElement('div');
      bar.id = 'jjlook-bar';
      document.body.appendChild(bar);
    }
    var look = current();
    var i = look ? LOOKS.indexOf(look) + 1 : 0;
    var open = bar.classList.contains('open');
    bar.innerHTML =
      '<div class="jjlook-list">'
      + '<div class="jjlook-hd">Look picker <span>only you can see this</span></div>'
      + '<button type="button" class="jjlook-opt' + (!look ? ' on' : '') + '" onclick="JJLooks.set(\'off\')">'
      +   '<span class="jjlook-sw" style="background:#f7f9f8"><i style="background:#123f24"></i></span>'
      +   '<span><b>Normal</b><small>the app as everyone sees it</small></span></button>'
      + LOOKS.map(function(l, k){
          return '<button type="button" class="jjlook-opt' + (look === l ? ' on' : '') + '" onclick="JJLooks.set(\'' + l.id + '\')">'
            + '<span class="jjlook-sw" style="background:' + l.sw[0] + '"><i style="background:' + l.sw[1] + '"></i></span>'
            + '<span><b>' + (k + 1) + ' · ' + l.name + '</b><small>from the ' + l.from + '</small></span></button>';
        }).join('')
      + '</div>'
      + '<div class="jjlook-pill">'
      +   '<button type="button" class="jjlook-arrow" onclick="JJLooks.step(-1)" aria-label="Previous look">&#8249;</button>'
      +   '<button type="button" class="jjlook-name" onclick="JJLooks.toggle()">'
      +     '<span class="jjlook-dot" style="background:' + (look ? look.sw[1] : '#16a34a') + '"></span>'
      +     (look ? i + '/' + LOOKS.length + ' · ' + look.name : 'Looks · Normal') + '</button>'
      +   '<button type="button" class="jjlook-arrow" onclick="JJLooks.step(1)" aria-label="Next look">&#8250;</button>'
      + '</div>';
    bar.classList.toggle('open', open);
  }
  function toggle(){
    var bar = document.getElementById('jjlook-bar');
    if(bar) bar.classList.toggle('open');
  }

  // Who is signed in: app.js writes the name into #logged-in-username on sign-in and
  // clears the card on sign-out. Watching it keeps this file out of app.js.
  function watchUser(){
    var nameEl = document.getElementById('logged-in-username');
    var card = document.getElementById('user-card');
    if(!nameEl || !card) throw new Error('app-looks.js: #logged-in-username or #user-card is missing, cannot tell who is signed in');
    function check(){
      var now = !card.classList.contains('signed-out') && nameEl.textContent.trim() === 'Jake';
      if(now !== jake){ jake = now; apply(); }
    }
    new MutationObserver(check).observe(nameEl, { childList:true, characterData:true, subtree:true });
    new MutationObserver(check).observe(card, { attributes:true, attributeFilter:['class'] });
    check();
  }

  document.addEventListener('keydown', function(e){
    // Alt + left/right flips looks without reaching for the mouse
    if(!jake || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    step(e.key === 'ArrowRight' ? 1 : -1);
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchUser);
  else watchUser();

  return { set:set, step:step, toggle:toggle, list:LOOKS };
})();
