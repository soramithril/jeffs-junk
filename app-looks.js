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
    { id:'forest', name:'Forest night',  from:'"Dashboard Animation" clip (Verdelo)', dark:true,  sw:['#0B1410','#5BE38F'], fonts:'Manrope:wght@400;500;600;700;800' },
    { id:'widget', name:'Black widget',  from:'black widget screenshot (green glow bars)', dark:true, sw:['#000000','#39FF6A'], fonts:'Oswald:wght@300;400;500&family=Inter:wght@400;500;600;700' },
    { id:'clay',   name:'Clay map',      from:'3D clay map with the blue route', dark:false, sw:['#ECEEE8','#1E7B3A'], fonts:'Outfit:wght@400;500;600;700;800' },
    { id:'admin',  name:'Dark admin',    from:'dark admin dashboard recording', dark:true,  sw:['#0E1117','#00C26A'], fonts:'Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700' },
    { id:'yard',   name:'Logistics yard',from:'3D logistics yard recording', dark:false, sw:['#E4E8EC','#FF7A1A'], fonts:'Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700' },
    { id:'float',  name:'Floating cards',from:'isometric warehouse with floating cards', dark:false, sw:['#F3F5FB','#00A85A'], fonts:'DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700' },
    { id:'glow',   name:'Green glow',    from:'green-glow pill buttons recording', dark:true,  sw:['#050807','#22FF88'], fonts:'Sora:wght@400;500;600;700' }
  ];
  var KEY = 'jjLook';
  var jake = false;

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
    root.classList.remove('look-dark', 'look-on');
    var look = current();
    if(look){
      loadFonts(look);
      root.classList.add('look-on', 'look-' + look.id);
      if(look.dark) root.classList.add('look-dark');
    }
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
