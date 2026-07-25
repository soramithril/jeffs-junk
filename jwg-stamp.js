/* ============================================================================
   Jeff's Junk — Work-order STAMPS  (companion to jwg-stamp.css)
   Drop-in, zero dependencies. Same string-HTML pattern as jwg-icons.js.
   Load once:  <script src="jwg-stamp.js"></script>   -> global `JWGStamp`

   WHAT IT IS
   A stamp is the receipt for a finished step. It replaces the button that
   fired the action, in the same spot. No toast, no modal, nothing to dismiss.

   THE FOUR STEPS OF A JOB
     booked    green   JOB 39718 / BOOKED
     bin       cyan    BIN 214 / 14 YD
     emailed   indigo  EMAILED / JUL 25 · 9:06A
     confirmed amber   CONFIRMED / BY PHONE

   USAGE (replace a button in place)
     btn.outerHTML = JWGStamp.emailed({ sub:'JUL 25 · 9:06A', size:'sm' });

   In a row template (matches the 50px .djj-row without changing its height):
     job.email_sent
       ? JWGStamp.emailed({ size:'sm' })
       : '<button class="djj-btn" data-email="'+job.id+'">📧 Email</button>'

   Pass fresh:false when re-rendering an already-stamped job, so old stamps
   don't re-animate on every repaint.
   ========================================================================== */
(function (global) {
  'use strict';

  /* kind -> [ink class, default caption, default number, default sub] */
  var KINDS = {
    booked:    { ink:'green',  cap:'JOB', sub:'BOOKED' },
    bin:       { ink:'cyan',   cap:'BIN', sub:'' },
    emailed:   { ink:'indigo', word:'EMAILED',   sub:'' },
    confirmed: { ink:'amber',  word:'CONFIRMED', sub:'' },
    cancelled: { ink:'red',    word:'CANCELLED', sub:'' },
    voided:    { ink:'slate',  word:'VOID',      sub:'' }
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Core renderer.
     opts: { num, cap, word, sub, size:'sm', fresh:false, ink:'green', title } */
  function stamp(kind, opts) {
    opts = opts || {};
    var k = KINDS[kind];
    if (!k) throw new Error('JWGStamp: unknown stamp "' + kind + '"');

    var cls = ['jwg-stamp', opts.ink || k.ink];
    if (opts.size === 'sm') cls.push('sm');
    if (opts.size === 'page') cls.push('page');
    if (opts.fresh !== false) cls.push('ink');

    var word = opts.word || k.word;
    var sub  = opts.sub  != null ? opts.sub : k.sub;
    var body;

    if (word) {
      body = '<span class="jwg-stamp-word">' + esc(word) + '</span>';
    } else {
      body = '<span class="jwg-stamp-cap">' + esc(opts.cap || k.cap) + '</span>' +
             '<span class="jwg-stamp-num">' + esc(opts.num) + '</span>';
    }
    if (sub) body += '<span class="jwg-stamp-sub">' + esc(sub) + '</span>';
    if (opts.meta) body += '<span class="jwg-stamp-meta">' + esc(opts.meta) + '</span>';

    return '<span class="' + cls.join(' ') + '"' +
      (opts.title ? ' title="' + esc(opts.title) + '"' : '') +
      ' role="img" aria-label="' + esc(opts.aria || (word || (opts.cap || k.cap) + ' ' + opts.num)) + '">' +
      body + '</span>';
  }

  /* Ghost slot — a step that hasn't happened yet. */
  function slot(opts) {
    opts = opts || {};
    return '<span class="jwg-stamp-slot' + (opts.size === 'sm' ? ' sm' : '') + '" aria-hidden="true"></span>';
  }

  /* Convenience wrappers, one per step. */
  function booked(o)    { return stamp('booked',    o); }
  function bin(o)       { return stamp('bin',       o); }
  function emailed(o)   { return stamp('emailed',   o); }
  function confirmed(o) { return stamp('confirmed', o); }

  /* Replace a live element (usually the button just clicked) with its stamp.
     JWGStamp.replace(btn, 'emailed', { size:'sm', sub:'9:06A' }); */
  function replace(el, kind, opts) {
    if (!el) return null;
    var wrap = document.createElement('span');
    wrap.innerHTML = stamp(kind, opts);
    var node = wrap.firstChild;
    el.parentNode.replaceChild(node, el);
    return node;
  }

  /* PAGE STAMP — stamp the whole work order. `host` must be position:relative.
     Returns the overlay node; call .remove() to undo.
       JWGStamp.stampPage(card, 'booked', { num:39718, meta:'JUL 25 · 9:04A' }); */
  function stampPage(host, kind, opts) {
    if (!host) return null;
    opts = opts || {};
    opts.size = 'page';
    var overlay = document.createElement('div');
    overlay.className = 'jwg-stamp-page';
    overlay.innerHTML = stamp(kind, opts);
    host.appendChild(overlay);
    if (opts.jolt !== false) {
      var hit = opts.joltTarget || host.firstElementChild;
      if (hit) {
        hit.classList.remove('jwg-stamp-jolt');
        void hit.offsetWidth;
        hit.classList.add('jwg-stamp-jolt');
      }
    }
    return overlay;
  }

  /* How many of the four steps a job has done — for the 4-box row indicator. */
  function progress(job) {
    job = job || {};
    return [!!job.id, !!job.bin_number, !!job.email_sent, !!job.confirmed]
      .filter(Boolean).length;
  }

  global.JWGStamp = {
    KINDS: KINDS,
    stamp: stamp, slot: slot, replace: replace, stampPage: stampPage, progress: progress,
    booked: booked, bin: bin, emailed: emailed, confirmed: confirmed
  };
})(typeof window !== 'undefined' ? window : this);
