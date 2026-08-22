/* ============================================================================
   Jeff's Junk — icon style picker (v604)

   Three ways to draw the icons, chosen from a button in the sidebar footer:

     Simple       the flat Phosphor glyphs in jwg-icons.js. The default.
     Mixed        illustrated artwork where it is drawn big (the sidebar rail
                  and the More-tools flyout, 28px and up), flat glyphs
                  everywhere below that.
     Illustrated  the artwork everywhere.

   WHY MIXED EXISTS
     Measured on the live dashboard: 244 icons are drawn, and 203 of them are
     17px or smaller. At that size a detailed illustration is a coloured blob —
     bin drop-offs and bin pickups become the same green smudge, because the
     little up/down arrow that separates them disappears. The rail draws at
     34px, where the artwork looks genuinely good. Mixed keeps the personality
     where it reads and the glyphs where they work.

   THE OTHER TRADE-OFF
     Artwork is a picture, so it cannot take a colour the way a glyph can. A
     screen asking for `junk` in amber gets the artwork as drawn, and button
     icons stop following the button's colour.

   Artwork lives in assets/icons-3d/, one 72px square PNG per icon key — the
   smallest canvas that stays sharp at the biggest size the app draws (34px)
   on a 2x screen. All 41 keys in jwg-icons.js are covered.
   ========================================================================== */
(function (global) {
  'use strict';

  var STORE = 'jj_icon_style';
  var DIR = 'assets/icons-3d/';

  // Below this, artwork is unreadable, so Mixed falls back to the flat glyph.
  var BIG = 28;

  var MODES = [
    { id: 'flat', name: 'Simple',
      blurb: 'The flat icons, everywhere. This is how the app looks today.' },
    { id: 'mixed', name: 'Mixed',
      blurb: 'Illustrations on the sidebar where they are big enough to read, flat icons everywhere else.' },
    { id: 'illustrated', name: 'Illustrated',
      blurb: 'The illustrations everywhere, including the small buttons.' }
  ];

  var mode = 'flat';
  try {
    var saved = localStorage.getItem(STORE);
    if (saved === 'mixed' || saved === 'illustrated') mode = saved;
  } catch (e) {}

  // Should this particular icon, at this size, be drawn as artwork?
  function useArt(size) {
    if (mode === 'illustrated') return true;
    if (mode === 'mixed') return (size || 18) >= BIG;
    return false;
  }

  function set(next) {
    mode = next;
    try { localStorage.setItem(STORE, mode); } catch (e) {}
    global.location.reload();
  }

  // Ad blockers drop any request with "analytics" in the path, so that one icon
  // ships under a different filename. Every other icon is simply key + '.png'.
  var RENAMED = { analytics: 'chart' };

  function tag(key, size, extraStyle) {
    var px = size || 18;
    return '<img class="jj3d" src="' + DIR + (RENAMED[key] || key) + '.png" width="' + px +
      '" height="' + px + '" alt="" style="flex:none;vertical-align:middle;object-fit:contain' +
      (extraStyle ? ';' + extraStyle : '') + '">';
  }

  // The sidebar rail is dark green (#14532d) and most of this artwork is green
  // too, so on the rail the icons sink into the background — measured contrast
  // was as low as 1.0:1. The emboss tiles never had that problem because each
  // carries its own coloured tile, so on the rail the artwork gets a pale chip
  // of the same footprint. Median contrast goes 1.41:1 -> 6.10:1.
  function chip(key, size) {
    var px = size || 34;
    var pad = Math.max(2, Math.round(px * 0.08));
    var style = [
      'width:' + px + 'px', 'height:' + px + 'px',
      'border-radius:' + Math.round(px * 0.26) + 'px',
      'background:linear-gradient(160deg,#ffffff,#eef3ef)',
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.9), 0 1px 3px rgba(0,0,0,.28)',
      'display:inline-grid', 'place-items:center', 'flex:none'
    ].join(';');
    return '<span class="jj3d-chip" style="' + style + '">' + tag(key, px - pad * 2) + '</span>';
  }

  /* ---- the picker ---------------------------------------------------------
     Injected into the sidebar footer rather than written into index.html, so
     the whole feature stays in this one file and can be lifted out whole. */

  function sample(id) {
    var keys = ['bins', 'junk', 'edit'];
    return keys.map(function (k) {
      var big = (id === 'illustrated') || (id === 'mixed' && k !== 'edit');
      if (big) return tag(k, 22, 'margin-right:5px');
      return window.JWGIcons
        ? JWGIcons.embossTile(k, { size: 22, radius: 6, color: JWGIcons.ICON_COLOR[k] })
        : '';
    }).join('');
  }

  function openPicker() {
    if (document.getElementById('jj3d-picker')) return closePicker();
    var box = document.createElement('div');
    box.id = 'jj3d-picker';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Icon style');
    box.style.cssText = [
      'position:fixed', 'z-index:9999', 'left:12px', 'bottom:96px', 'width:270px',
      'background:#fff', 'border:1px solid #dbe3dd', 'border-radius:14px',
      'box-shadow:0 18px 40px -12px rgba(10,20,14,.45)', 'padding:12px',
      'font-family:inherit', 'color:#0f1512'
    ].join(';');

    var html = '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;' +
      'color:#6c7a72;font-weight:600;margin:2px 2px 10px">Icon style</div>';

    MODES.forEach(function (m) {
      var picked = (m.id === mode);
      html += '<button type="button" data-mode="' + m.id + '" style="' + [
        'display:block', 'width:100%', 'text-align:left', 'cursor:pointer',
        'border:1px solid ' + (picked ? '#16a34a' : '#e3e9e5'),
        'background:' + (picked ? '#f0f9f3' : '#fff'),
        'border-radius:10px', 'padding:9px 10px', 'margin-bottom:7px', 'font:inherit'
      ].join(';') + '">' +
        '<span style="display:flex;align-items:center;gap:6px;margin-bottom:5px">' + sample(m.id) + '</span>' +
        '<span style="display:block;font-size:13px;font-weight:600">' + m.name +
          (picked ? ' <span style="color:#16a34a;font-weight:500">&middot; on now</span>' : '') + '</span>' +
        '<span style="display:block;font-size:11.5px;color:#6c7a72;line-height:1.35;margin-top:2px">' +
          m.blurb + '</span>' +
      '</button>';
    });
    html += '<div style="font-size:11px;color:#8b9a92;padding:2px 2px 0">Changing this reloads the page.</div>';
    box.innerHTML = html;

    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (b && b.getAttribute('data-mode') !== mode) set(b.getAttribute('data-mode'));
    });
    document.body.appendChild(box);
    setTimeout(function () { document.addEventListener('mousedown', outside); }, 0);
  }

  function outside(e) {
    var box = document.getElementById('jj3d-picker');
    if (box && !box.contains(e.target) && !e.target.closest('#jj3d-btn')) closePicker();
  }

  function closePicker() {
    var box = document.getElementById('jj3d-picker');
    if (box) box.remove();
    document.removeEventListener('mousedown', outside);
  }

  // Its own row inside the footer. The rail is only ~82px wide, and the Help
  // button already fills that row, so sharing it pushes this button outside the
  // sidebar entirely.
  function mountButton() {
    var foot = document.querySelector('.sidebar-footer');
    if (!foot || document.getElementById('jj3d-btn')) return;
    var row = document.createElement('div');
    row.className = 'footer-slim';
    row.style.cssText = 'justify-content:flex-start';
    var b = document.createElement('button');
    b.id = 'jj3d-btn';
    b.type = 'button';
    b.className = 'footer-help';
    b.title = 'Choose how the icons are drawn';
    b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"' +
      ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>' +
      '<rect x="3" y="14" width="7" height="7" rx="1.5"/><circle cx="17.5" cy="17.5" r="3.5"/></svg>Icons';
    b.addEventListener('click', function (e) { e.stopPropagation(); openPicker(); });
    row.appendChild(b);
    var card = document.getElementById('user-card');
    if (card) foot.insertBefore(row, card); else foot.appendChild(row);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton);
  } else {
    mountButton();
  }

  global.JJ3D = {
    useArt: useArt, tag: tag, chip: chip, set: set,
    mode: function () { return mode; },
    MODES: MODES
  };
})(window);
