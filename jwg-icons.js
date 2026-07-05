/* ============================================================================
   Jeff's Junk — Icon Set  (style: "2A Emboss")
   Drop-in, zero dependencies. Works in the existing vanilla app.js string-HTML
   pattern. Load once (e.g. <script src="jwg-icons.js"></script>) — it exposes a
   global `JWGIcons`.

   HOW COLOUR WORKS
   - Every glyph is a 24x24 inline SVG drawn with stroke="currentColor".
   - On the GREEN sidebar rail  -> render the glyph white:  JWGIcons.svg('schedule', {stroke:'#fff'})
   - On WHITE content (cards, dashboard, calendar, task picker) -> use an
     emboss TILE (colour tile + white glyph):  JWGIcons.embossTile('bins', {color:'green'})
   - As a plain coloured line icon -> set the parent's color, or pass stroke.

   RULE OF THUMB:  colour = content,  white = nav chrome,  green = active state.
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---- 24x24 glyph geometry (inner SVG markup) --------------------------- */
  var PATHS = {
    /* Services */
    /* Bins = the truck that delivers / hauls the bins */
    bins:        '<path d="M2 13.6h12.4V18H2z"/><path d="M14.4 11.3h3L20.5 13.7V18h-6z"/><path d="M2.5 13.6c1-2.3 2.2-2.3 3.1 0 .9-2.9 2.2-2.9 3.1 0 .9-2.5 2.2-2.5 3.1 0"/><circle cx="5.9" cy="18.6" r="1.6"/><circle cx="16.5" cy="18.6" r="1.6"/>',
    /* Junk Removal = the bin / container the junk fills */
    junk:        '<path d="M2.5 8.5h19"/><path d="M4.6 8.5 6 18.5h12l1.4-10"/><path d="M8 8.5 8.6 18.5M12 8.5 12 18.5M16 8.5 15.4 18.5"/>',
    furniture:   '<path d="M4 10V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/><path d="M2.5 15a2 2 0 0 1 4 0v1h11v-1a2 2 0 0 1 4 0v4.2H2.5z"/><path d="M5.2 20.2v1.6M18.8 20.2v1.6"/>',
    landscaping: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/>',
    /* Garbage run = a tied garbage bag (distinct from the "del" trash can) */
    garbage:     '<path d="M6.6 8.6h10.8l-1.15 10.8a2.2 2.2 0 0 1-2.19 2H9.94a2.2 2.2 0 0 1-2.19-2L6.6 8.6z"/><path d="M8.8 8.6c-.4-2.4 1-3.7 3.2-3.7s3.6 1.3 3.2 3.7"/><path d="M9.4 6.2 8.1 4.2M14.6 6.2 15.9 4.2"/><path d="M10.4 12.2v5M13.6 12.2v5"/>',

    /* Scheduler statuses */
    off:         '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sick:        '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
    shop:        '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',

    /* Job / service events */
    binDrop:     '<path d="M2 9h12.5"/><path d="M3.6 9 4.7 18h7.6L13.4 9"/><path d="M6.7 9 7.1 18M10 9 9.7 18"/><path d="M19 4.6v7.4"/><path d="M16.5 9.5 19 12 21.5 9.5"/>',
    binPickup:   '<path d="M2 9h12.5"/><path d="M3.6 9 4.7 18h7.6L13.4 9"/><path d="M6.7 9 7.1 18M10 9 9.7 18"/><path d="M19 12V4.6"/><path d="M16.5 7.1 19 4.6 21.5 7.1"/>',
    junkQuote:   '<rect x="5" y="4.5" width="14" height="17" rx="2"/><rect x="9" y="2.8" width="6" height="3.4" rx="1"/><path d="M8.5 10.5h7M8.5 14h7M8.5 17.5h4"/>',
    call:        '<path d="M21.5 16.9v2.6a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.6 3.8 2 2 0 0 1 3.6 1.6h2.6a2 2 0 0 1 2 1.7 12.8 12.8 0 0 0 .7 2.8 2 2 0 0 1-.5 2.1L7.3 9.4a16 16 0 0 0 6 6l1.2-1.1a2 2 0 0 1 2.1-.5 12.8 12.8 0 0 0 2.8.7 2 2 0 0 1 1.8 2z"/>',
    email:       '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M3.4 7 12 12.9 20.6 7"/>',

    /* Navigation */
    dashboard:   '<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
    allJobs:     '<path d="M8 6.5h11M8 12h11M8 17.5h11"/><circle cx="4.2" cy="6.5" r="1.1"/><circle cx="4.2" cy="12" r="1.1"/><circle cx="4.2" cy="17.5" r="1.1"/>',
    schedule:    '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 9.7h18"/>',
    clients:     '<path d="M16 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20"/><circle cx="9.5" cy="8" r="3.4"/><path d="M21 20v-1.6a3.4 3.4 0 0 0-2.6-3.3M15 4.7a3.4 3.4 0 0 1 0 6.6"/>',
    vehicles:    '<path d="M14 16.5V6.5a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1"/><path d="M14 8.5h4l3 3.2v4.8a1 1 0 0 1-1 1h-1"/><circle cx="7" cy="17.3" r="2"/><circle cx="17.4" cy="17.3" r="2"/><path d="M9 17.3h6.4"/>',
    liveJobs:    '<circle cx="12" cy="12" r="9"/><path d="M12 7.2v5l3.4 2"/>',
    dispatch:    '<circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.4 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.6"/>',
    binMap:      '<path d="M9 4 3 6.2v14L9 18l6 2 6-2.2v-14L15 6 9 4z"/><path d="M9 4v14M15 6v14"/>',
    damage:      '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.2v4.3M12 17.1h.01"/>',
    analytics:   '<path d="M6 20v-6M12 20V6M18 20v-9"/><path d="M3 20.5h18"/>',
    pricing:     '<path d="M12 2v20"/><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    documents:   '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 16.5h4"/>',
    /* Navigation extras (sidebar) */
    newJob:      '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M12 8.3v7.4M8.3 12h7.4"/>',
    summerWinter:'<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.3M12 19.1v2.3M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.6 12h2.3M19.1 12h2.3M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
    leaderboard: '<rect x="9.4" y="8" width="5.2" height="13" rx="1"/><rect x="3.2" y="12.5" width="5.2" height="8.5" rx="1"/><rect x="15.6" y="10.5" width="5.2" height="10.5" rx="1"/>',
    utilization: '<path d="M3.5 18a8.5 8.5 0 0 1 17 0"/><path d="M12 18l4.2-4.6"/><circle cx="12" cy="18" r="1.3"/>',
    clothing:    '<path d="M8.5 3 3 8l2.8 2.2V20a1 1 0 0 0 1 1h10.4a1 1 0 0 0 1-1v-9.8L21 8 15.5 3a3.5 3.5 0 0 1-7 0z"/>',
    advisor:     '<path d="M9.5 18.5h5M10.5 21.3h3"/><path d="M12 2.8a6.2 6.2 0 0 1 3.9 11c-.6.5-.9 1.1-.9 1.9v.3H9v-.3c0-.8-.3-1.4-.9-1.9A6.2 6.2 0 0 1 12 2.8z"/>',
    /* Oil / fuel — a droplet, for vehicle oil-change KPIs */
    oil:         '<path d="M12 3s5.6 6.1 5.6 10.3a5.6 5.6 0 1 1-11.2 0C6.4 9.1 12 3 12 3z"/><path d="M9.3 13.4a2.7 2.7 0 0 0 2.5 2.6"/>',

    /* Actions / status */
    confirmed:   '<circle cx="12" cy="12" r="9"/><path d="M8 12.4 10.6 15 16 9.3"/>',
    cancelled:   '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    maintenance: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    del:         '<path d="M4 7h16"/><path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7"/><path d="M6 7 6.9 19.2A1.6 1.6 0 0 0 8.5 20.6h7a1.6 1.6 0 0 0 1.6-1.4L18 7"/><path d="M10 11v5.6M14 11v5.6"/>',
    edit:        '<path d="M13.5 6.5 17.5 10.5"/><path d="M4.5 19.5 5.4 16 16 5.4a2 2 0 0 1 2.9 2.9L8.3 18.9 4.5 19.5z"/>',
    print:       '<path d="M6.5 9.5V3.5h11v6"/><path d="M6.5 17.5H5a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2h-1.5"/><rect x="6.5" y="14.5" width="11" height="6" rx="1"/>',
    directions:  '<path d="M3 11 21 3l-8 18-2.4-7.6L3 11z"/>',
    booked:      '<rect x="5" y="4.5" width="14" height="17" rx="2"/><rect x="9" y="2.8" width="6" height="3.4" rx="1"/><path d="M8.6 13 10.6 15 15 10.6"/>'
  };

  /* ---- Colour tokens: one [mid, deep] pair per concept ------------------- */
  var COLORS = {
    green:  ['#22c55e', '#15803d'], // Bins, brand, positive/confirm, booked
    blue:   ['#2563eb', '#1d4ed8'], // Junk Removal
    violet: ['#7c3aed', '#6d28d9'], // Furniture
    olive:  ['#65a30d', '#3f6212'], // Landscaping
    cyan:   ['#06b6d4', '#0e7490'], // Bin drop-off
    pink:   ['#ec4899', '#be185d'], // Bin pickup
    teal:   ['#14b8a6', '#0d9488'], // Email
    yellow: ['#eab308', '#a16207'], // Junk removal (app's amber scheme)
    indigo: ['#6366f1', '#4338ca'], // Junk quote
    amber:  ['#d97706', '#b45309'], // Shop / maintenance
    orange: ['#f97316', '#c2410c'], // Off sick
    slate:  ['#64748b', '#475569'], // Day off, edit, print
    red:    ['#ef4444', '#b91c1c']  // Delete, cancelled
  };

  /* Default colour key per icon (used on white surfaces / emboss tiles). */
  var ICON_COLOR = {
    bins:'green', junk:'blue', furniture:'violet', landscaping:'olive', garbage:'red',
    off:'slate', sick:'orange', shop:'amber',
    binDrop:'cyan', binPickup:'pink', junkQuote:'indigo', call:'amber', email:'teal',
    dashboard:'green', allJobs:'green', schedule:'green', clients:'green', vehicles:'green',
    liveJobs:'green', dispatch:'green', binMap:'green', damage:'green', analytics:'green',
    pricing:'green', documents:'green',
    newJob:'green', summerWinter:'amber', leaderboard:'amber', utilization:'green', clothing:'violet', advisor:'amber', oil:'amber',
    confirmed:'green', cancelled:'red', maintenance:'amber', del:'red', edit:'slate',
    print:'slate', directions:'blue', booked:'green'
  };

  /* What each icon replaces today + where it's used (for find/replace + docs). */
  var REPLACES = {
    bins:'🚛 (bin rental)', junk:'🗑️ (junk removal)', furniture:'🛋️', landscaping:'🌿', garbage:'red dot (garbage run)',
    off:'📅 day off', sick:'🤒', shop:'amber dot',
    binDrop:'🚛 drop-off', binPickup:'🚚 pickup', junkQuote:'📋 quote', call:'📞 / ✉️',
    dashboard:'grid (feather)', allJobs:'clipboard (feather)', schedule:'calendar (feather)',
    clients:'users (feather)', vehicles:'truck (feather)', liveJobs:'clock (feather)',
    dispatch:'route (feather)', binMap:'map (feather)', damage:'⚠️ triangle', analytics:'bars (feather)',
    pricing:'$ (feather)', documents:'file (feather)',
    confirmed:'✅', cancelled:'🚫', maintenance:'🔧', del:'🗑️ delete', edit:'✏️',
    print:'🖨️', directions:'🧭', booked:'📝'
  };

  /* ---- Renderers --------------------------------------------------------- */

  // Raw inline SVG. opts: {size, stroke, width, cls, extra}
  function svg(name, opts) {
    opts = opts || {};
    var p = PATHS[name];
    if (!p) throw new Error('JWGIcons: unknown icon "' + name + '"');
    var s = opts.size || 24;
    return '<svg class="' + (opts.cls || '') + '" viewBox="0 0 24 24" width="' + s + '" height="' + s +
      '" fill="none" stroke="' + (opts.stroke || 'currentColor') + '" stroke-width="' + (opts.width || 1.9) +
      '" stroke-linecap="round" stroke-linejoin="round"' + (opts.extra ? ' ' + opts.extra : '') + '>' + p + '</svg>';
  }

  // Emboss TILE (colour tile + white glyph). For WHITE surfaces only.
  // opts: {color:'green'|..., size, radius, glyph}
  function embossTile(name, opts) {
    opts = opts || {};
    var key = opts.color || ICON_COLOR[name] || 'green';
    var c = COLORS[key] || COLORS.green, mid = c[0], deep = c[1];
    var size = opts.size || 46, radius = opts.radius || 13, glyph = opts.glyph || Math.round(size * 0.54);
    var style = [
      'width:' + size + 'px', 'height:' + size + 'px', 'border-radius:' + radius + 'px',
      'background:radial-gradient(115% 85% at 50% -12%, rgba(255,255,255,.42), rgba(255,255,255,0) 60%), linear-gradient(155deg,' + mid + ',' + deep + ')',
      'box-shadow:inset 0 1.2px 0 rgba(255,255,255,.45), inset 0 -1.4px 2px rgba(0,0,0,.16), 0 8px 16px -6px ' + deep + '59, 0 2px 5px rgba(16,24,40,.12)',
      'display:inline-grid', 'place-items:center', 'color:#fff', 'flex:none'
    ].join(';');
    return '<span class="jwg-emboss" style="' + style + '">' +
      svg(name, { size: glyph, stroke: '#fff', width: opts.width || 1.9, extra: 'style="filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))"' }) +
      '</span>';
  }

  // White line glyph for the GREEN nav rail (inactive item).
  function navIcon(name, opts) {
    opts = opts || {};
    return svg(name, { size: opts.size || 18, stroke: '#fff', width: 1.9 });
  }

  global.JWGIcons = {
    PATHS: PATHS, COLORS: COLORS, ICON_COLOR: ICON_COLOR, REPLACES: REPLACES,
    svg: svg, embossTile: embossTile, navIcon: navIcon
  };
})(typeof window !== 'undefined' ? window : this);
