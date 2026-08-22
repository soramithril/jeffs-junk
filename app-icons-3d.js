/* ============================================================================
   Jeff's Junk — illustrated icon set (v606)

   The 3-D artwork is now the icon set, everywhere. There is no longer a style
   picker: iconTile(), lineIcon() and paintNavIcons() all draw from here.

   The flat Phosphor glyphs in jwg-icons.js are kept, and are still the register
   of which icon keys exist, but nothing renders from them any more. They are the
   backup if this set is ever pulled.

   ARTWORK
     assets/icons-3d/ — one 72px square PNG per icon key, transparent. 72 is the
     smallest canvas that stays sharp at the biggest size the app draws (the 34px
     sidebar rail) on a 2x screen. All 41 keys are covered, so there are no holes.

   THE TRADE-OFF, WRITTEN DOWN
     Measured on the live dashboard: of 244 icons on one screen, 203 are drawn at
     17px or smaller. Artwork at that size reads as a coloured shape rather than a
     recognisable object — bin drop-offs and bin pickups are the same silhouette
     once the little arrow is gone, separated only by colour. That is why every
     icon here is a distinct colour, and why the colours match what each screen
     already used. Jake chose artwork everywhere over the earlier mixed setting.

   THE PALE CHIP
     The sidebar rail is dark green (#14532d) and a lot of this artwork is green,
     so on the rail it sinks into the background — measured as low as 1.01:1.
     Rail and flyout icons therefore sit on a pale chip of the same footprint,
     which took median contrast from 1.41:1 to 6.10:1.
   ========================================================================== */
(function (global) {
  'use strict';

  var DIR = 'assets/icons-3d/';

  // Ad blockers drop any request with "analytics" in the path, so that one icon
  // ships under a different filename. Every other icon is simply key + '.png'.
  var RENAMED = { analytics: 'chart' };

  function tag(key, size, extraStyle) {
    var px = size || 18;
    return '<img class="jj3d" src="' + DIR + (RENAMED[key] || key) + '.png" width="' + px +
      '" height="' + px + '" alt="" style="flex:none;vertical-align:middle;object-fit:contain' +
      (extraStyle ? ';' + extraStyle : '') + '">';
  }

  // For the dark green rail only — see the note above.
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

  global.JJ3D = { tag: tag, chip: chip };
})(window);
