/* ============================================================================
   Jeff's Junk — illustrated icon set (TRIAL, v601)

   A second look for the icons: the 3-D illustrated artwork instead of the flat
   Phosphor glyphs in jwg-icons.js. Off by default. This exists so the style can
   be judged on the real screens rather than on a mockup.

   TURNING IT ON AND OFF
     https://soramithril.github.io/jeffs-junk/?icons=3d     -> illustrated
     https://soramithril.github.io/jeffs-junk/?icons=flat   -> back to normal
   The choice is remembered per browser, so the link is only needed once.

   WHAT IT SWAPS
     iconTile()     — the emboss tiles on cards, job rows and pickers
     lineIcon()     — the flat glyphs inside buttons
     paintNavIcons()— the sidebar rail and the More-tools flyout
   Everything else is untouched.

   THE KNOWN TRADE-OFF
     These are pictures, so they cannot take a colour the way the glyphs do.
     A screen that asks for `junk` in amber gets the artwork as drawn. That loss
     is the main thing this trial is meant to show.

   Artwork lives in assets/icons-3d/, one 72px square PNG per icon key. 72px is
   the smallest canvas that stays sharp at the largest size the app draws (the
   34px sidebar rail) on a 2x screen. All 41 keys in jwg-icons.js are covered,
   so illustrated mode never has a hole in it.
   ========================================================================== */
(function (global) {
  'use strict';

  var STORE = 'jj_icon_style';
  var DIR = 'assets/icons-3d/';

  // A link like ?icons=3d sets the mode and is remembered from then on.
  var asked = (global.location.search.match(/[?&]icons=(3d|flat)/i) || [])[1];
  if (asked) {
    try { localStorage.setItem(STORE, asked.toLowerCase()); } catch (e) {}
  }

  var mode = 'flat';
  try { if (localStorage.getItem(STORE) === '3d') mode = '3d'; } catch (e) {}

  function on() { return mode === '3d'; }

  // Flip and reload — the icons are baked into markup that is already on screen.
  function set(next) {
    mode = (next === '3d') ? '3d' : 'flat';
    try { localStorage.setItem(STORE, mode); } catch (e) {}
    global.location.reload();
  }

  // Ad blockers drop any request with "analytics" in the path, so that one icon
  // ships under a different filename. Every other icon is simply key + '.png'.
  var RENAMED = { analytics: 'chart' };

  // One illustrated icon at the size the caller asked for. Square, so it drops
  // into the same slot an emboss tile came out of.
  function tag(key, size, extraStyle) {
    var px = size || 18;
    return '<img class="jj3d" src="' + DIR + (RENAMED[key] || key) + '.png" width="' + px +
      '" height="' + px + '" alt="" style="flex:none;vertical-align:middle;object-fit:contain' +
      (extraStyle ? ';' + extraStyle : '') + '">';
  }

  global.JJ3D = { on: on, set: set, tag: tag, mode: function () { return mode; } };
})(window);
