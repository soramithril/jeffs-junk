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

   THE PALE CHIP, AND WHY IT WENT (v613)
     Rail and flyout icons used to sit on a white chip, because green artwork on
     the dark green rail (#14532d) measured as low as 1.01:1. That number came
     from comparing flat colour to flat colour, which is not what is on screen:
     every icon carries its own dark outline, top highlight and drop shadow, and
     those are what actually separate it from the rail. Rendered side by side the
     bare icons read fine and the chips looked like stickers, so they are gone.
     Jake's call, 2026-08-23.

   FACING
     Eight nav icons were mirrored so they face right (v613). Held back on
     purpose: chart (the trend would run downhill), summerWinter (the seasons
     would swap sides), confirmed and junkQuote (a mirrored tick reads as wrong)
     and allJobs and documents (their lines would read right-to-left). The
     mirroring is baked into the PNGs, not applied at render time, so an icon
     faces the same way on every screen it appears on.

   THE WIDE-ICON BOOST
     Artwork is square but some objects are not. The dump truck's ink is 72x58
     inside its 72px square, so `object-fit: contain` draws it 22.6px tall on the
     34px rail where a full-height icon gets 27.6px — about 18% short, and it
     read as a smaller icon. RAIL_BOOST scales those back up. Rail and flyout
     only, where the slot is a fixed box: tag() is left alone so nothing in the
     lists and tables shifts.
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

  // Wide, short artwork loses height to empty canvas — see the note above.
  var RAIL_BOOST = { junk: 1.22, vehicles: 1.12 };

  // The rail and the More-tools flyout. A fixed square slot with the icon
  // centred in it, so a boosted icon grows inside the slot instead of pushing
  // its neighbours around.
  function rail(key, size) {
    var px = size || 34;
    var pad = Math.max(2, Math.round(px * 0.08));
    var inner = Math.round((px - pad * 2) * (RAIL_BOOST[key] || 1));
    var style = [
      'width:' + px + 'px', 'height:' + px + 'px',
      'display:inline-grid', 'place-items:center', 'flex:none', 'overflow:hidden'
    ].join(';');
    return '<span class="jj3d-rail" style="' + style + '">' + tag(key, inner) + '</span>';
  }

  global.JJ3D = { tag: tag, rail: rail };
})(window);
