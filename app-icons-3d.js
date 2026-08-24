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

  // Optical sizing (v614). The canvas is square but the objects are not, so
  // `object-fit: contain` leaves a tall thin phone and a wide flat truck
  // carrying very different weight in the same square slot. Each icon's mean
  // extent — the average of its inked width and height — is nudged 60% of the
  // way toward the set's median, clamped to 0.90–1.26, and never past the point
  // where the ink would clip the slot. All measured off the files.
  //
  // This supersedes the hand-set junk:1.22 / vehicles:1.12 from v613. Those were
  // read off the truck's HEIGHT while the white chip was still there, and the
  // chip's white margin above and below is what made it look small. With the
  // chip gone, two independent measures — inked area and mean extent — both put
  // the truck inside the normal range, and 1.22 now reads oversized next to its
  // neighbours.
  var RAIL_BOOST = {
    advisor:1.06, bell:1.02, binDrop:0.97, binMap:0.97, bins:1.03,
    call:1.12, cancelled:0.98, clothing:0.96, confirmed:0.98, damage:0.98,
    dashboard:0.98, del:1.05, directions:0.97, dispatch:0.96, edit:1.02,
    furniture:1.02, garbage:1.03, junk:1.02, junkQuote:1.06, landscaping:0.96,
    liveJobs:1.06, maintenance:1.02, newJob:0.98, pricing:1.06, print:0.96,
    summerWinter:0.98, utilization:1.03
  };

  // The rail and the More-tools flyout are both dark green (--nav-green and
  // --nav-green-raised). Full-colour artwork sinks into that: measured against
  // #14532d the set's median contrast is 2.29:1, under the 3:1 floor for a
  // graphic, and the Dashboard icon manages 1.34:1. It is not a green-on-green
  // problem — it is dark-on-dark, and the blue and violet icons score worst.
  //
  // Lifting brightness while opening the shadows takes the median to 3.29:1 and
  // drops the icons under 3:1 from 35 to 15, without bleaching the artwork the
  // way a straight brightness push does. Dark surfaces only — tag() on white
  // cards is untouched, because there it already reads fine.
  //
  // Honest limit: 15 icons still sit under 3:1 and no filter rescues them. The
  // only complete fixes for raster artwork on a dark rail are a holder behind it
  // or vector glyphs, and both are off the table for now by choice.
  var RAIL_FILTER = 'filter:brightness(1.3) contrast(.85) saturate(1.25)';

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
    return '<span class="jj3d-rail" style="' + style + '">' + tag(key, inner, RAIL_FILTER) + '</span>';
  }

  global.JJ3D = { tag: tag, rail: rail };
})(window);
