/* ============================================================================
   Jeff's Junk — Icon Set  (Phosphor Bold, v561)
   Drop-in, zero dependencies. Works in the existing vanilla app.js string-HTML
   pattern. Load once (e.g. <script src="jwg-icons.js"></script>) — it exposes a
   global `JWGIcons`.

   GEOMETRY
   - Every glyph is Phosphor Bold: a FILLED 256x256 path, not a stroked 24x24 one.
   - The paths carry fill="currentColor", so colour is set via the svg's CSS
     `color` — that's what opts.color does. There is no stroke and no line width.
   - Swapped from the hand-drawn "2A Emboss" line set on 2026-08-15. All 41 keys
     kept their names, so no call site had to move.

   HOW COLOUR WORKS
   - On the GREEN sidebar rail  -> render the glyph white:  JWGIcons.svg('schedule', {color:'#fff'})
   - On WHITE content (cards, dashboard, calendar, task picker) -> use an
     emboss TILE (colour tile + white glyph):  JWGIcons.embossTile('bins', {color:'green'})
   - As a plain coloured glyph -> set the parent's color, or pass opts.color.

   RULE OF THUMB:  colour = content,  white = nav chrome,  green = active state.
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---- Phosphor Bold glyph geometry (inner SVG markup, 256x256) ---------- */
  var PATHS = {
    /* Services */
    bins:         '<path fill="currentColor" d="M224 93.65A60.08 60.08 0 0 0 164 36a20 20 0 0 0-20 20v116h-16V72a12 12 0 0 0-12-12H20A20 20 0 0 0 0 80v104a36 36 0 0 0 60 26.8a36 36 0 0 0 57.94-14.8h68.12A36 36 0 0 0 256 184v-48a44.08 44.08 0 0 0-32-42.35m-56-33.43A36.06 36.06 0 0 1 200 96v8a12 12 0 0 0 12 12a20 20 0 0 1 20 20v14.06A36 36 0 0 0 186.06 172H168ZM104 84v70.08a35.92 35.92 0 0 0-44 3.12a35.93 35.93 0 0 0-36-7.14V84ZM36 196a12 12 0 1 1 12-12a12 12 0 0 1-12 12m48 0a12 12 0 1 1 12-12a12 12 0 0 1-12 12m136 0a12 12 0 1 1 12-12a12 12 0 0 1-12 12"/>',
    junk:         '<path fill="currentColor" d="M216 48H40a12 12 0 0 0 0 24h4v136a20 20 0 0 0 20 20h128a20 20 0 0 0 20-20V72h4a12 12 0 0 0 0-24m-28 156H68V72h120ZM76 20A12 12 0 0 1 88 8h80a12 12 0 0 1 0 24H88a12 12 0 0 1-12-12"/>',
    furniture:    '<path fill="currentColor" d="M244 104V72a20 20 0 0 0-20-20H32a20 20 0 0 0-20 20v32a20 20 0 0 0-8 16v48a20 20 0 0 0 20 20h4v12a12 12 0 0 0 24 0v-12h152v12a12 12 0 0 0 24 0v-12h4a20 20 0 0 0 20-20v-48a20 20 0 0 0-8-16m-24-4h-12a20 20 0 0 0-20 20v4h-48V76h80ZM116 76v48H68v-4a20 20 0 0 0-20-20H36V76Zm112 88H28v-40h16v12a12 12 0 0 0 12 12h144a12 12 0 0 0 12-12v-12h16Z"/>',
    landscaping:  '<path fill="currentColor" d="M255.62 51.65a12 12 0 0 0-11.27-11.27c-53.27-3.13-96.2 13.36-114.84 44.14c-12.14 20-12.56 44.17-1.46 67.3a75.1 75.1 0 0 0-12.28 23l-12.66-12.66c7.19-16.77 6.43-34.11-2.4-48.69C86.73 90.36 54.89 78 15.55 80.27A12 12 0 0 0 4.28 91.55C2 130.89 14.36 162.73 37.45 176.71a49.76 49.76 0 0 0 26 7.27a57.5 57.5 0 0 0 22.7-4.87L112 205v23a12 12 0 0 0 24 0v-29.49a51.63 51.63 0 0 1 9.49-29.95a76.8 76.8 0 0 0 32.1 7.39a64.9 64.9 0 0 0 33.89-9.46c30.77-18.64 47.28-61.57 44.14-114.84M49.88 156.18c-13.19-8-21.18-27.46-21.83-52.13c24.67.65 44.14 8.64 52.13 21.83a26 26 0 0 1 3.63 17l-11.33-11.37a12 12 0 0 0-17 17l11.34 11.34a26.27 26.27 0 0 1-16.94-3.67M199.05 146c-10.66 6.45-23 7.67-35.81 3.76l37.25-37.24a12 12 0 0 0-17-17l-37.25 37.24C142.37 120 143.59 107.61 150 97c12.7-21 42.65-33 81.32-33h.68c.14 39-11.86 69.18-32.95 82"/>',
    garbage:      '<path fill="currentColor" d="M216 60h-36.17a52 52 0 0 0-103.66 0H40a20 20 0 0 0-20 20v120a20 20 0 0 0 20 20h176a20 20 0 0 0 20-20V80a20 20 0 0 0-20-20m-88-24a28 28 0 0 1 27.71 24h-55.42A28 28 0 0 1 128 36m84 160H44V84h32v12a12 12 0 0 0 24 0V84h56v12a12 12 0 0 0 24 0V84h32Z"/>',

    /* Scheduler statuses */
    off:          '<path fill="currentColor" d="M236.37 139.4a12 12 0 0 0-12-3A84.07 84.07 0 0 1 119.6 31.59a12 12 0 0 0-15-15a108.86 108.86 0 0 0-54.91 38.48A108 108 0 0 0 136 228a107.1 107.1 0 0 0 64.93-21.69a108.86 108.86 0 0 0 38.44-54.94a12 12 0 0 0-3-11.97m-49.88 47.74A84 84 0 0 1 68.86 69.51a84.9 84.9 0 0 1 23.41-21.22Q92 52.13 92 56a108.12 108.12 0 0 0 108 108q3.87 0 7.71-.27a84.8 84.8 0 0 1-21.22 23.41"/>',
    sick:         '<path fill="currentColor" d="M212 52a32 32 0 1 0 32 32a32 32 0 0 0-32-32m0 40a8 8 0 1 1 8-8a8 8 0 0 1-8 8m-52-36a52 52 0 0 0-104 0v94.69a64 64 0 1 0 104 0Zm-52 172a40 40 0 0 1-30.91-65.39a12 12 0 0 0 2.91-7.83V56a28 28 0 0 1 56 0v98.77a12 12 0 0 0 2.77 7.68A40 40 0 0 1 108 228m24-40a24 24 0 1 1-36-20.78V92a12 12 0 0 1 24 0v75.22A24 24 0 0 1 132 188"/>',
    shop:         '<path fill="currentColor" d="M224 64h-44v-8a28 28 0 0 0-28-28h-48a28 28 0 0 0-28 28v8H32a20 20 0 0 0-20 20v108a20 20 0 0 0 20 20h192a20 20 0 0 0 20-20V84a20 20 0 0 0-20-20m-124-8a4 4 0 0 1 4-4h48a4 4 0 0 1 4 4v8h-56Zm120 32v32h-24v-4a12 12 0 0 0-24 0v4H84v-4a12 12 0 0 0-24 0v4H36V88ZM36 188v-44h24v4a12 12 0 0 0 24 0v-4h88v4a12 12 0 0 0 24 0v-4h24v44Z"/>',

    /* Job / service events */
    binDrop:      '<path fill="currentColor" d="m226.73 66.63l-16-32A12 12 0 0 0 200 28H56a12 12 0 0 0-10.73 6.63l-16 32A12 12 0 0 0 28 72v136a20 20 0 0 0 20 20h160a20 20 0 0 0 20-20V72a12 12 0 0 0-1.27-5.37M192.58 52l6 12H57.42l6-12ZM52 204V88h152v116Zm116.49-64.49a12 12 0 0 1 0 17l-32 32a12 12 0 0 1-17 0l-32-32a12 12 0 0 1 17-17L116 151v-39a12 12 0 0 1 24 0v39l11.51-11.52a12 12 0 0 1 16.98.03"/>',
    binPickup:    '<path fill="currentColor" d="m226.73 66.63l-16-32A12 12 0 0 0 200 28H56a12 12 0 0 0-10.73 6.63l-16 32A12 12 0 0 0 28 72v136a20 20 0 0 0 20 20h160a20 20 0 0 0 20-20V72a12 12 0 0 0-1.27-5.37M192.58 52l6 12H57.42l6-12ZM52 204V88h152v116Zm116.49-68.49a12 12 0 0 1-17 17L140 141v39a12 12 0 0 1-24 0v-39l-11.51 11.52a12 12 0 0 1-17-17l32-32a12 12 0 0 1 17 0Z"/>',
    junkQuote:    '<path fill="currentColor" d="M172 164a12 12 0 0 1-12 12H96a12 12 0 0 1 0-24h64a12 12 0 0 1 12 12m-12-52H96a12 12 0 0 0 0 24h64a12 12 0 0 0 0-24m60-64v168a20 20 0 0 1-20 20H56a20 20 0 0 1-20-20V48a20 20 0 0 1 20-20h34.53a51.88 51.88 0 0 1 74.94 0H200a20 20 0 0 1 20 20M100.29 60h55.42a28 28 0 0 0-55.42 0M196 52h-17.41A52 52 0 0 1 180 64v8a12 12 0 0 1-12 12H88a12 12 0 0 1-12-12v-8a52 52 0 0 1 1.41-12H60v160h136Z"/>',
    call:         '<path fill="currentColor" d="m224 154.8l-47.09-21.11l-.18-.08a19.94 19.94 0 0 0-19 1.75a13 13 0 0 0-1.12.84l-22.31 19c-13-7.05-26.43-20.37-33.49-33.21l19.06-22.66a12 12 0 0 0 .85-1.15a20 20 0 0 0 1.66-18.83a1.4 1.4 0 0 1-.08-.18L101.2 32a20.06 20.06 0 0 0-20.78-11.85A60.27 60.27 0 0 0 28 80c0 81.61 66.39 148 148 148a60.27 60.27 0 0 0 59.85-52.42A20.06 20.06 0 0 0 224 154.8M176 204A124.15 124.15 0 0 1 52 80a36.29 36.29 0 0 1 28.48-35.54l18.82 42l-19.16 22.82a12 12 0 0 0-.86 1.16A20 20 0 0 0 78 130.08c9.42 19.28 28.83 38.56 48.31 48a20 20 0 0 0 19.69-1.45a12 12 0 0 0 1.11-.85l22.43-19.07l42 18.81A36.29 36.29 0 0 1 176 204"/>',
    email:        '<path fill="currentColor" d="M224 44H32a12 12 0 0 0-12 12v136a20 20 0 0 0 20 20h176a20 20 0 0 0 20-20V56a12 12 0 0 0-12-12m-96 83.72L62.85 68h130.3Zm-35.21.28L44 172.72V83.28Zm17.76 16.28l9.34 8.57a12 12 0 0 0 16.22 0l9.34-8.57l47.7 43.72H62.85ZM163.21 128L212 83.28v89.44Z"/>',

    /* Navigation */
    dashboard:    '<path fill="currentColor" d="M100 36H56a20 20 0 0 0-20 20v44a20 20 0 0 0 20 20h44a20 20 0 0 0 20-20V56a20 20 0 0 0-20-20m-4 60H60V60h36Zm104-60h-44a20 20 0 0 0-20 20v44a20 20 0 0 0 20 20h44a20 20 0 0 0 20-20V56a20 20 0 0 0-20-20m-4 60h-36V60h36Zm-96 40H56a20 20 0 0 0-20 20v44a20 20 0 0 0 20 20h44a20 20 0 0 0 20-20v-44a20 20 0 0 0-20-20m-4 60H60v-36h36Zm104-60h-44a20 20 0 0 0-20 20v44a20 20 0 0 0 20 20h44a20 20 0 0 0 20-20v-44a20 20 0 0 0-20-20m-4 60h-36v-36h36Z"/>',
    allJobs:      '<path fill="currentColor" d="M228 128a12 12 0 0 1-12 12H40a12 12 0 0 1 0-24h176a12 12 0 0 1 12 12M40 76h176a12 12 0 0 0 0-24H40a12 12 0 0 0 0 24m176 104H40a12 12 0 0 0 0 24h176a12 12 0 0 0 0-24"/>',
    schedule:     '<path fill="currentColor" d="M208 28h-20v-4a12 12 0 0 0-24 0v4H92v-4a12 12 0 0 0-24 0v4H48a20 20 0 0 0-20 20v160a20 20 0 0 0 20 20h160a20 20 0 0 0 20-20V48a20 20 0 0 0-20-20M68 52a12 12 0 0 0 24 0h72a12 12 0 0 0 24 0h16v24H52V52ZM52 204V100h152v104Zm60-80v56a12 12 0 0 1-24 0v-36.68a12 12 0 0 1-9.37-22l16-8A12 12 0 0 1 112 124m61.49 33.88L163.9 168h4.1a12 12 0 0 1 0 24h-32a12 12 0 0 1-8.71-20.25L155.45 142a4 4 0 0 0 .55-2a4 4 0 0 0-7.47-2a12 12 0 0 1-20.78-12A28 28 0 0 1 180 140a27.77 27.77 0 0 1-5.64 16.86a11 11 0 0 1-.87 1.02"/>',
    clients:      '<path fill="currentColor" d="M125.18 156.94a64 64 0 1 0-82.36 0a100.23 100.23 0 0 0-39.49 32a12 12 0 0 0 19.35 14.2a76 76 0 0 1 122.64 0a12 12 0 0 0 19.36-14.2a100.33 100.33 0 0 0-39.5-32M44 108a40 40 0 1 1 40 40a40 40 0 0 1-40-40m206.1 97.67a12 12 0 0 1-16.78-2.57A76.31 76.31 0 0 0 172 172a12 12 0 0 1 0-24a40 40 0 1 0-10.3-78.67a12 12 0 1 1-6.16-23.19a64 64 0 0 1 57.64 110.8a100.23 100.23 0 0 1 39.49 32a12 12 0 0 1-2.57 16.73"/>',
    vehicles:     '<path fill="currentColor" d="m255.14 115.54l-14-35A19.89 19.89 0 0 0 222.58 68H196v-4a12 12 0 0 0-12-12H32a20 20 0 0 0-20 20v112a20 20 0 0 0 20 20h14.06a36 36 0 0 0 67.88 0h44.12a36 36 0 0 0 67.88 0H236a20 20 0 0 0 20-20v-64a21.7 21.7 0 0 0-.86-4.46M196 92h23.88l6.4 16H196ZM80 204a12 12 0 1 1 12-12a12 12 0 0 1-12 12m92-41.92A36.32 36.32 0 0 0 158.06 180h-44.12a36 36 0 0 0-67.88 0H36v-40h136Zm0-46.08H36V76h136Zm20 88a12 12 0 1 1 12-12a12 12 0 0 1-12 12m40-24h-6.06A36.09 36.09 0 0 0 196 156.23V132h36Z"/>',
    liveJobs:     '<path fill="currentColor" d="M128 20a108 108 0 1 0 108 108A108.12 108.12 0 0 0 128 20m0 192a84 84 0 1 1 84-84a84.09 84.09 0 0 1-84 84m68-84a12 12 0 0 1-12 12h-56a12 12 0 0 1-12-12V72a12 12 0 0 1 24 0v44h44a12 12 0 0 1 12 12"/>',
    dispatch:     '<path fill="currentColor" d="M200 164a36.07 36.07 0 0 0-33.94 24H72a28 28 0 0 1 0-56h96a44 44 0 0 0 0-88H72a12 12 0 0 0 0 24h96a20 20 0 0 1 0 40H72a52 52 0 0 0 0 104h94.06A36 36 0 1 0 200 164m0 48a12 12 0 1 1 12-12a12 12 0 0 1-12 12"/>',
    binMap:       '<path fill="currentColor" d="M231.38 46.54a12 12 0 0 0-10.29-2.18L161.4 59.28l-60-30a12 12 0 0 0-8.28-.91l-64 16A12 12 0 0 0 20 56v144a12 12 0 0 0 14.91 11.64l59.69-14.92l60 30a12 12 0 0 0 8.28.91l64-16A12 12 0 0 0 236 200V56a12 12 0 0 0-4.62-9.46M108 59.42l40 20v117.16l-40-20Zm-64 6l40-10v119.21l-40 10Zm168 125.21l-40 10V81.37l40-10Z"/>',
    damage:       '<path fill="currentColor" d="M240.26 186.1L152.81 34.23a28.74 28.74 0 0 0-49.62 0L15.74 186.1a27.45 27.45 0 0 0 0 27.71A28.31 28.31 0 0 0 40.55 228h174.9a28.31 28.31 0 0 0 24.79-14.19a27.45 27.45 0 0 0 .02-27.71m-20.8 15.7a4.46 4.46 0 0 1-4 2.2H40.55a4.46 4.46 0 0 1-4-2.2a3.56 3.56 0 0 1 0-3.73L124 46.2a4.77 4.77 0 0 1 8 0l87.44 151.87a3.56 3.56 0 0 1 .02 3.73M116 136v-32a12 12 0 0 1 24 0v32a12 12 0 0 1-24 0m28 40a16 16 0 1 1-16-16a16 16 0 0 1 16 16"/>',
    analytics:    '<path fill="currentColor" d="M224 196h-4V40a12 12 0 0 0-12-12h-56a12 12 0 0 0-12 12v36H96a12 12 0 0 0-12 12v36H48a12 12 0 0 0-12 12v60h-4a12 12 0 0 0 0 24h192a12 12 0 0 0 0-24M164 52h32v144h-32Zm-56 48h32v96h-32Zm-48 48h24v48H60Z"/>',
    pricing:      '<path fill="currentColor" d="M152 116h-12V60h4a28 28 0 0 1 28 28a12 12 0 0 0 24 0a52.06 52.06 0 0 0-52-52h-4V24a12 12 0 0 0-24 0v12h-4a52 52 0 0 0 0 104h4v56h-12a28 28 0 0 1-28-28a12 12 0 0 0-24 0a52.06 52.06 0 0 0 52 52h12v12a12 12 0 0 0 24 0v-12h12a52 52 0 0 0 0-104m-40 0a28 28 0 0 1 0-56h4v56Zm40 80h-12v-56h12a28 28 0 0 1 0 56"/>',
    documents:    '<path fill="currentColor" d="m216.49 79.52l-56-56A12 12 0 0 0 152 20H56a20 20 0 0 0-20 20v176a20 20 0 0 0 20 20h144a20 20 0 0 0 20-20V88a12 12 0 0 0-3.51-8.48M160 57l23 23h-23ZM60 212V44h76v48a12 12 0 0 0 12 12h48v108Zm112-80a12 12 0 0 1-12 12H96a12 12 0 0 1 0-24h64a12 12 0 0 1 12 12m0 40a12 12 0 0 1-12 12H96a12 12 0 0 1 0-24h64a12 12 0 0 1 12 12"/>',

    /* Navigation extras (sidebar) */
    newJob:       '<path fill="currentColor" d="M208 28H48a20 20 0 0 0-20 20v160a20 20 0 0 0 20 20h160a20 20 0 0 0 20-20V48a20 20 0 0 0-20-20m-4 176H52V52h152ZM76 128a12 12 0 0 1 12-12h28V88a12 12 0 0 1 24 0v28h28a12 12 0 0 1 0 24h-28v28a12 12 0 0 1-24 0v-28H88a12 12 0 0 1-12-12"/>',
    summerWinter: '<path fill="currentColor" d="M116 36V20a12 12 0 0 1 24 0v16a12 12 0 0 1-24 0m80 92a68 68 0 1 1-68-68a68.07 68.07 0 0 1 68 68m-24 0a44 44 0 1 0-44 44a44.05 44.05 0 0 0 44-44M51.51 68.49a12 12 0 1 0 17-17l-12-12a12 12 0 0 0-17 17Zm0 119l-12 12a12 12 0 0 0 17 17l12-12a12 12 0 1 0-17-17M196 72a12 12 0 0 0 8.49-3.51l12-12a12 12 0 0 0-17-17l-12 12A12 12 0 0 0 196 72m8.49 115.51a12 12 0 0 0-17 17l12 12a12 12 0 0 0 17-17ZM48 128a12 12 0 0 0-12-12H20a12 12 0 0 0 0 24h16a12 12 0 0 0 12-12m80 80a12 12 0 0 0-12 12v16a12 12 0 0 0 24 0v-16a12 12 0 0 0-12-12m108-92h-16a12 12 0 0 0 0 24h16a12 12 0 0 0 0-24"/>',
    leaderboard:  '<path fill="currentColor" d="M232 60h-20V48a12 12 0 0 0-12-12H56a12 12 0 0 0-12 12v12H24A20 20 0 0 0 4 80v16a44.05 44.05 0 0 0 44 44h.77A84.18 84.18 0 0 0 116 195.15V212H96a12 12 0 0 0 0 24h64a12 12 0 0 0 0-24h-20v-16.89c30.94-4.51 56.53-26.2 67-55.11h1a44.05 44.05 0 0 0 44-44V80a20 20 0 0 0-20-20M28 96V84h16v28c0 1.21 0 2.41.09 3.61A20 20 0 0 1 28 96m160 15.1c0 33.33-26.71 60.65-59.54 60.9A60 60 0 0 1 68 112V60h120ZM228 96a20 20 0 0 1-16.12 19.62c.08-1.5.12-3 .12-4.52V84h16Z"/>',
    utilization:  '<path fill="currentColor" d="M209.88 69.83A115.2 115.2 0 0 0 128 36h-.41C63.85 36.22 12 88.76 12 153.13V176a20 20 0 0 0 20 20h192a20 20 0 0 0 20-20v-24a115.25 115.25 0 0 0-34.12-82.17M220 172h-92.68l46.44-65a12 12 0 1 0-19.52-14l-56.42 79H36v-18.87c0-1.72 0-3.43.14-5.13H56a12 12 0 0 0 0-24H40.62c10.91-33.39 40-58.52 75.38-63.21V80a12 12 0 0 0 24 0V60.8a92 92 0 0 1 75.66 63.2H200a12 12 0 0 0 0 24h19.9c.06 1.33.1 2.66.1 4Z"/>',
    clothing:     '<path fill="currentColor" d="m246.17 57.9l-48.08-28.25A11.9 11.9 0 0 0 192 28h-32a12 12 0 0 0-12 12a20 20 0 0 1-40 0a12 12 0 0 0-12-12H64a11.9 11.9 0 0 0-6.07 1.66L9.83 57.9A20.18 20.18 0 0 0 2 84l17.9 36.8A19.62 19.62 0 0 0 37.67 132H52v76a20 20 0 0 0 20 20h112a20 20 0 0 0 20-20v-76h14.32a19.64 19.64 0 0 0 17.75-11.17L254 84a20.18 20.18 0 0 0-7.83-26.1M40.37 108L25.16 76.73L52 61v47ZM180 204H76V52h9.67a44 44 0 0 0 84.68 0H180Zm35.62-96H204V61l26.83 15.76Z"/>',
    advisor:      '<path fill="currentColor" d="M180 232a12 12 0 0 1-12 12H88a12 12 0 0 1 0-24h80a12 12 0 0 1 12 12m40-128a91.51 91.51 0 0 1-35.17 72.35A12.26 12.26 0 0 0 180 186v2a20 20 0 0 1-20 20H96a20 20 0 0 1-20-20v-2a12 12 0 0 0-4.7-9.51A91.57 91.57 0 0 1 36 104.52C35.73 54.69 76 13.2 125.79 12A92 92 0 0 1 220 104m-24 0a68 68 0 0 0-69.65-68C89.56 36.88 59.8 67.55 60 104.38a67.71 67.71 0 0 0 26.1 53.19A35.87 35.87 0 0 1 100 184h56.1a36.13 36.13 0 0 1 13.9-26.51A67.68 67.68 0 0 0 196 104m-20.07-5.32a48.5 48.5 0 0 0-31.91-40a12 12 0 0 0-8 22.62a24.31 24.31 0 0 1 16.09 20a12 12 0 0 0 23.86-2.64Z"/>',
    oil:          '<path fill="currentColor" d="M134.88 6.17a12 12 0 0 0-13.76 0a259 259 0 0 0-42.18 39C50.85 77.43 36 111.62 36 144a92 92 0 0 0 184 0c0-77.36-81.64-135.4-85.12-137.83M128 212a68.07 68.07 0 0 1-68-68c0-33.31 20-63.37 36.7-82.71A249.4 249.4 0 0 1 128 31.11a249.4 249.4 0 0 1 31.3 30.18C176 80.63 196 110.69 196 144a68.07 68.07 0 0 1-68 68m49.62-52.4a52 52 0 0 1-34 34a12.2 12.2 0 0 1-3.6.55a12 12 0 0 1-3.6-23.45a28 28 0 0 0 18.32-18.32a12 12 0 0 1 22.9 7.2Z"/>',

    /* Actions / status */
    confirmed:    '<path fill="currentColor" d="M176.49 95.51a12 12 0 0 1 0 17l-56 56a12 12 0 0 1-17 0l-24-24a12 12 0 1 1 17-17L112 143l47.51-47.52a12 12 0 0 1 16.98.03M236 128A108 108 0 1 1 128 20a108.12 108.12 0 0 1 108 108m-24 0a84 84 0 1 0-84 84a84.09 84.09 0 0 0 84-84"/>',
    cancelled:    '<path fill="currentColor" d="M168.49 104.49L145 128l23.52 23.51a12 12 0 0 1-17 17L128 145l-23.51 23.52a12 12 0 0 1-17-17L111 128l-23.49-23.51a12 12 0 0 1 17-17L128 111l23.51-23.52a12 12 0 0 1 17 17ZM236 128A108 108 0 1 1 128 20a108.12 108.12 0 0 1 108 108m-24 0a84 84 0 1 0-84 84a84.09 84.09 0 0 0 84-84"/>',
    maintenance:  '<path fill="currentColor" d="M230.47 67.5a12 12 0 0 0-19.26-4.32L172.43 99l-12.68-2.72L157 83.57l35.79-38.78a12 12 0 0 0-4.32-19.26a76.07 76.07 0 0 0-100.06 96.11l-57.49 52.54a5 5 0 0 0-.39.38a36 36 0 0 0 50.91 50.91l.38-.39l52.54-57.49A76.05 76.05 0 0 0 230.47 67.5M160 148a51.5 51.5 0 0 1-23.35-5.52a12 12 0 0 0-14.26 2.62l-58.08 63.56a12 12 0 0 1-17-17l63.55-58.07a12 12 0 0 0 2.62-14.26A51.5 51.5 0 0 1 108 96a52.06 52.06 0 0 1 52-52h.89l-25.72 27.87a12 12 0 0 0-2.91 10.65l5.66 26.35a12 12 0 0 0 9.21 9.21l26.35 5.66a12 12 0 0 0 10.65-2.91L212 95.12v.89A52.06 52.06 0 0 1 160 148"/>',
    del:          '<path fill="currentColor" d="M216 48h-36V36a28 28 0 0 0-28-28h-48a28 28 0 0 0-28 28v12H40a12 12 0 0 0 0 24h4v136a20 20 0 0 0 20 20h128a20 20 0 0 0 20-20V72h4a12 12 0 0 0 0-24M100 36a4 4 0 0 1 4-4h48a4 4 0 0 1 4 4v12h-56Zm88 168H68V72h120Zm-72-100v64a12 12 0 0 1-24 0v-64a12 12 0 0 1 24 0m48 0v64a12 12 0 0 1-24 0v-64a12 12 0 0 1 24 0"/>',
    edit:         '<path fill="currentColor" d="m230.14 70.54l-44.68-44.69a20 20 0 0 0-28.29 0L33.86 149.17A19.85 19.85 0 0 0 28 163.31V208a20 20 0 0 0 20 20h44.69a19.86 19.86 0 0 0 14.14-5.86L230.14 98.82a20 20 0 0 0 0-28.28M93 180l71-71l11 11l-71 71Zm-17-17l-11-11l71-71l11 11Zm-24 10l15.51 15.51L83 204H52Zm140-70l-39-39l18.34-18.34l39 39Z"/>',
    print:        '<path fill="currentColor" d="M214.67 68H204V40a12 12 0 0 0-12-12H64a12 12 0 0 0-12 12v28H41.33C25.16 68 12 80.56 12 96v80a12 12 0 0 0 12 12h28v28a12 12 0 0 0 12 12h128a12 12 0 0 0 12-12v-28h28a12 12 0 0 0 12-12V96c0-15.44-13.16-28-29.33-28M76 52h104v16H76Zm104 152H76v-32h104Zm40-40h-16v-4a12 12 0 0 0-12-12H64a12 12 0 0 0-12 12v4H36V96c0-2.17 2.44-4 5.33-4h173.34c2.89 0 5.33 1.83 5.33 4Zm-16-44a16 16 0 1 1-16-16a16 16 0 0 1 16 16"/>',
    directions:   '<path fill="currentColor" d="M238.7 102.46L62.81 37.21l-.25-.09a20 20 0 0 0-25.44 25.44l.09.25l65.25 175.89A20 20 0 0 0 121.3 252h.35a20 20 0 0 0 18.77-14.12l.09-.29l21.23-75.85l75.85-21.23l.29-.09a20 20 0 0 0 .82-38Zm-89.93 38a12 12 0 0 0-8.32 8.32l-19.68 70.29L62.8 62.8l156.26 58Z"/>',
    bell:         '<path fill="currentColor" d="M225.29 165.93C216.61 151 212 129.57 212 104a84 84 0 0 0-168 0c0 25.58-4.59 47-13.27 61.93a20.08 20.08 0 0 0-.07 20.07A19.77 19.77 0 0 0 48 196h36.18a44 44 0 0 0 87.64 0H208a19.77 19.77 0 0 0 17.31-10a20.08 20.08 0 0 0-.02-20.07M128 212a20 20 0 0 1-19.6-16h39.2a20 20 0 0 1-19.6 16m-73.34-40C63.51 154 68 131.14 68 104a60 60 0 0 1 120 0c0 27.13 4.48 50 13.33 68Z"/>',
    booked:       '<path fill="currentColor" d="M208 28h-20v-4a12 12 0 0 0-24 0v4H92v-4a12 12 0 0 0-24 0v4H48a20 20 0 0 0-20 20v160a20 20 0 0 0 20 20h160a20 20 0 0 0 20-20V48a20 20 0 0 0-20-20M68 52a12 12 0 0 0 24 0h72a12 12 0 0 0 24 0h16v24H52V52ZM52 204V100h152v104Zm120.49-84.49a12 12 0 0 1 0 17l-48 48a12 12 0 0 1-17 0l-24-24a12 12 0 0 1 17-17L116 159l39.51-39.52a12 12 0 0 1 16.98.03"/>'
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
    bin:    ['#00a04e', '#00713a'], // Bin Fleet — sampled off the bin artwork itself
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
    print:'slate', directions:'blue', booked:'green', bell:'orange'
  };

  /* Which Phosphor Bold glyph each key is drawn from (source of truth for
     re-mapping or changing weight — every name below is a real ph: icon). */
  var SOURCE = {
    bins:'truck-trailer', junk:'trash-simple', furniture:'couch', landscaping:'plant',
    garbage:'bag', off:'moon', sick:'thermometer', shop:'toolbox',
    binDrop:'box-arrow-down', binPickup:'box-arrow-up', junkQuote:'clipboard-text', call:'phone',
    email:'envelope', dashboard:'squares-four', allJobs:'list', schedule:'calendar',
    clients:'users', vehicles:'truck', liveJobs:'clock', dispatch:'path',
    binMap:'map-trifold', damage:'warning', analytics:'chart-bar', pricing:'currency-dollar',
    documents:'file-text', newJob:'plus-square', summerWinter:'sun', leaderboard:'trophy',
    utilization:'gauge', clothing:'t-shirt', advisor:'lightbulb', oil:'drop',
    confirmed:'check-circle', cancelled:'x-circle', maintenance:'wrench', del:'trash',
    edit:'pencil', print:'printer', directions:'navigation-arrow', bell:'bell',
    booked:'calendar-check'
  };

  /* ---- Renderers --------------------------------------------------------- */

  // Raw inline SVG. opts: {size, color, cls, style}
  // `color` drives the glyph via CSS currentColor; Phosphor paths are filled.
  function svg(name, opts) {
    opts = opts || {};
    var p = PATHS[name];
    if (!p) throw new Error('JWGIcons: unknown icon "' + name + '"');
    var s = opts.size || 24;
    var style = 'color:' + (opts.color || 'currentColor') + (opts.style ? ';' + opts.style : '');
    return '<svg class="' + (opts.cls || '') + '" viewBox="0 0 256 256" width="' + s +
      '" height="' + s + '" style="' + style + '">' + p + '</svg>';
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
      svg(name, { size: glyph, color: '#fff', style: 'filter:drop-shadow(0 1px 1px rgba(0,0,0,.25))' }) +
      '</span>';
  }

  // White line glyph for the GREEN nav rail (inactive item).
  function navIcon(name, opts) {
    opts = opts || {};
    return svg(name, { size: opts.size || 18, color: '#fff' });
  }

  global.JWGIcons = {
    PATHS: PATHS, COLORS: COLORS, ICON_COLOR: ICON_COLOR, SOURCE: SOURCE,
    svg: svg, embossTile: embossTile, navIcon: navIcon
  };
})(typeof window !== 'undefined' ? window : this);
