// Report a problem with a bin (Jake, 2026-11-20).
//
// Kelly was putting "14R-02 needs paint and decals" on the Suggestions board,
// because the only place to flag paint or decals was the Edit Bin form, which
// office staff cannot open, on a page (Bin Fleet) she never visits. This is the
// one short sheet for all of it: which bin, what is wrong, one line of detail.
//
// It writes to the bin itself and nowhere new:
//   • Damaged      -> bin_items.damage = 'damage', plus a row on Damage Reports
//                     (fileBinDamage in app-damage.js), as "Report damage" did.
//   • Needs paint  -> bin_items.repaint = true
//   • Needs decals -> bin_items.decals  = true
//   • every report -> a dated, signed line on top of bin_items.notes
// "Done" beside a flag on the bin's pop-up clears it the same way and signs it.
//
// Open to every signed-in user, like the damage flag before it: the people who
// spot a problem are not the admins.
//
// Depends on app.js: binItems, patchBin, toast, closeM, escHtml, todayStr,
// currentUser, renderBinInventory, _renderBinPeekTop.
(function(){
  'use strict';

  // key, the bin field, label on the chip, how it reads in the note, how "Done" reads.
  var KINDS = [
    { key:'damage',  label:'Damaged',      note:'damaged',      done:'Fixed' },
    { key:'repaint', label:'Needs paint',  note:'needs paint',  done:'Painted' },
    { key:'decals',  label:'Needs decals', note:'needs decals', done:'Decals on' }
  ];
  var S = { bid:null, locked:false, pick:{} };

  function me(){
    if(typeof currentUser === 'undefined' || !currentUser || !currentUser.displayName) throw new Error('Not signed in');
    return currentUser.displayName;
  }
  function stamp(){
    var p = todayStr().split('-');
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1]-1] + ' ' + (+p[2]) + ' ' + p[0];
  }
  function has(b, key){ return key === 'damage' ? b.damage === 'damage' : !!b[key]; }
  function byBid(bid){ return binItems.find(function(x){ return x.bid === bid; }) || null; }
  function byNum(text){
    var t = String(text||'').trim().toLowerCase();
    if(!t) return null;
    return binItems.find(function(x){ return String(x.num||'').trim().toLowerCase() === t; }) || null;
  }
  // New line on top, older lines kept underneath.
  function withLine(b, text){
    var line = stamp() + ' · ' + me() + ' · ' + text;
    return b.notes ? line + '\n' + b.notes : line;
  }
  // One write to the bin. patchBin changes the copy in memory before the save
  // goes out, so a failed save has to put the old values back.
  async function write(b, fields){
    var was = {};
    Object.keys(fields).forEach(function(k){ was[k] = b[k]; });
    var r = await patchBin(b.bid, fields);
    if(r && r.error){ Object.assign(b, was); return false; }
    return true;
  }
  function repaintScreens(b){
    if(typeof renderBinInventory === 'function') renderBinInventory();
    var peek = document.getElementById('bin-peek');
    if(peek && peek.classList.contains('open') && typeof _renderBinPeekTop === 'function') _renderBinPeekTop(b);
  }

  // ── The sheet ────────────────────────────────────────────────────────────
  function modal(){
    var m = document.getElementById('bin-problem-modal');
    if(m) return m;
    m = document.createElement('div');
    m.id = 'bin-problem-modal';
    m.className = 'modal-overlay';
    m.onclick = function(e){ if(e.target === m) closeM('bin-problem-modal'); };
    var lab = 'display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px';
    var inp = 'width:100%;box-sizing:border-box;background:var(--surface2);border:1px solid var(--border-strong);color:var(--text);'
            + 'padding:10px 12px;border-radius:8px;font-size:14px;font-family:inherit';
    m.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px 22px;'
        + 'max-width:460px;width:92%;box-shadow:var(--shadow-lg)">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px">'
        + '<div class="modal-title" style="font-size:18px">Report a problem with a bin</div>'
        + '<button class="btn btn-ghost btn-sm" onclick="closeM(\'bin-problem-modal\')">✕</button>'
      + '</div>'
      + '<label for="binp-bin" style="' + lab + '">Which bin?</label>'
      + '<input id="binp-bin" list="binp-list" type="text" autocomplete="off" placeholder="e.g. 14R-02" style="' + inp + '" '
        + 'oninput="BinProblem.typed()">'
      + '<datalist id="binp-list"></datalist>'
      + '<div id="binp-found" style="font-size:12.5px;min-height:18px;margin:6px 0 12px"></div>'
      + '<div style="' + lab + '">What’s wrong? Pick any that apply</div>'
      + '<div id="binp-kinds" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"></div>'
      + '<label for="binp-text" style="' + lab + '">Details <span id="binp-text-need" style="font-weight:500"></span></label>'
      + '<input id="binp-text" type="text" placeholder="e.g. Left door hinge popped out" style="' + inp + '">'
      + '<div style="font-size:12px;color:var(--muted);margin-top:9px;line-height:1.45">The bin keeps renting. '
        + 'This goes on the bin’s own record, with your name and today’s date.</div>'
      + '<div class="form-actions" style="margin-top:14px;display:flex;gap:10px;justify-content:flex-end">'
        + '<button class="btn btn-ghost" onclick="closeM(\'bin-problem-modal\')">Cancel</button>'
        + '<button class="btn btn-primary" id="binp-save" onclick="BinProblem.save()">Save to bin</button>'
      + '</div></div>';
    document.body.appendChild(m);
    return m;
  }

  function paintKinds(){
    var b = S.bid ? byBid(S.bid) : null;
    document.getElementById('binp-kinds').innerHTML = KINDS.map(function(k){
      var already = b && has(b, k.key);
      var on = !already && S.pick[k.key];
      return '<button type="button"' + (already ? ' disabled' : '') + ' onclick="BinProblem.pick(\'' + k.key + '\')" '
        + 'style="flex:1;min-width:120px;font-family:inherit;font-size:13.5px;font-weight:600;padding:10px 12px;border-radius:9px;'
        + 'cursor:' + (already ? 'default' : 'pointer') + ';'
        + (on ? 'border:2px solid var(--accent);background:rgba(22,163,74,.12);color:var(--accent)'
              : 'border:1px solid var(--border-strong);background:var(--surface2);color:' + (already ? 'var(--muted)' : 'var(--text)'))
        + '">' + (on ? '✓ ' : '') + k.label
        + (already ? '<span style="display:block;font-size:11px;font-weight:500">already flagged</span>' : '')
        + '</button>';
    }).join('');
    document.getElementById('binp-text-need').textContent = S.pick.damage ? '(needed for damage)' : '(optional)';
  }
  function paintFound(){
    var el = document.getElementById('binp-found');
    var typed = document.getElementById('binp-bin').value.trim();
    var b = S.bid ? byBid(S.bid) : null;
    if(b){
      el.style.color = 'var(--text-secondary)';
      el.textContent = (b.size || '') + ' · ' + (b.status === 'in' ? 'in the yard' : 'out on a job');
    } else {
      el.style.color = 'var(--bad)';
      el.textContent = typed ? 'No bin with that number.' : '';
    }
  }

  var API = {
    // bid given: opened from that bin. No bid: opened from the dashboard or the
    // Suggestions page, so the bin number is typed.
    open: function(bid){
      if(typeof binItems === 'undefined' || !binItems.length){ toast('The bins have not loaded yet. Try again in a moment.','error'); return; }
      var b = bid ? byBid(bid) : null;
      if(bid && !b){ toast('That bin is not loaded. Refresh the page.','error'); return; }
      S = { bid: b ? b.bid : null, locked: !!b, pick:{} };
      var m = modal();
      document.getElementById('binp-list').innerHTML = binItems.map(function(x){
        return '<option value="' + escHtml(x.num || '') + '">';
      }).join('');
      var inp = document.getElementById('binp-bin');
      inp.value = b ? (b.num || '') : '';
      inp.readOnly = !!b;
      document.getElementById('binp-text').value = '';
      var btn = document.getElementById('binp-save');
      btn.disabled = false; btn.textContent = 'Save to bin';
      paintFound(); paintKinds();
      m.classList.add('open');
      document.body.classList.add('modal-open');
      setTimeout(function(){ var f = document.getElementById(b ? 'binp-text' : 'binp-bin'); if(f) f.focus(); }, 60);
    },
    typed: function(){
      if(S.locked) return;
      var b = byNum(document.getElementById('binp-bin').value);
      S.bid = b ? b.bid : null;
      paintFound(); paintKinds();
    },
    pick: function(key){ S.pick[key] = !S.pick[key]; paintKinds(); },

    save: async function(){
      var b = S.bid ? byBid(S.bid) : null;
      if(!b){ toast('Pick a bin first.','error'); return; }
      var text = document.getElementById('binp-text').value.trim();
      var picked = KINDS.filter(function(k){ return S.pick[k.key] && !has(b, k.key); });
      if(!picked.length && !text){ toast('Pick what is wrong, or type a note.','error'); return; }
      if(S.pick.damage && !has(b,'damage') && !text){ toast('Please say what is damaged.','error'); return; }
      var btn = document.getElementById('binp-save');
      btn.disabled = true; btn.textContent = 'Saving…';

      // The damage report goes first: if it fails nothing has been changed yet.
      if(picked.some(function(k){ return k.key === 'damage'; })){
        var r = await fileBinDamage(b, text);
        if(r.error){
          btn.disabled = false; btn.textContent = 'Save to bin';
          toast('Could not save: ' + r.error.message,'error');
          return;
        }
      }
      var fields = {};
      picked.forEach(function(k){ fields[k.key] = k.key === 'damage' ? 'damage' : true; });
      var said = picked.map(function(k){ return k.note; }).join(', ');
      said = said ? said.charAt(0).toUpperCase() + said.slice(1) + (text ? ': ' + text : '') : text;
      fields.notes = withLine(b, said);
      var ok = await write(b, fields);
      closeM('bin-problem-modal');
      repaintScreens(b);
      if(ok) toast('Saved on bin ' + (b.num || b.bid) + '.');
      else if(fields.damage) toast('The damage report was filed, but the bin itself did not update. Do NOT file it again.','error');
    },

    // "Done" beside a flag: clear it and sign the note. Painting also records
    // today as the painted date, the same rule the Edit Bin form follows.
    done: async function(bid, key){
      var b = byBid(bid);
      if(!b){ toast('That bin is not loaded. Refresh the page.','error'); return; }
      var k = KINDS.find(function(x){ return x.key === key; });
      if(!k) throw new Error('Unknown bin flag: ' + key);
      if(!has(b, key)) return;
      var fields = { notes: withLine(b, k.done) };
      if(key === 'damage') fields.damage = 'good';
      else fields[key] = false;
      if(key === 'repaint') fields.painted_date = todayStr();
      var ok = await write(b, fields);
      repaintScreens(b);
      if(ok) toast('Bin ' + (b.num || b.bid) + ': ' + k.done.toLowerCase() + '.');
    },

    // The "Needs doing" rows on the bin's pop-up.
    todoHtml: function(b){
      var rows = KINDS.filter(function(k){ return has(b, k.key); });
      if(!rows.length) return '';
      return '<div class="peek-sec">Needs doing</div>' + rows.map(function(k){
        return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">'
          + '<span style="font-size:13px;flex:1">' + k.label + '</span>'
          + '<button class="btn btn-ghost btn-sm" onclick="BinProblem.done(\'' + b.bid + '\',\'' + k.key + '\')">✓ Done</button>'
          + '</div>';
      }).join('');
    }
  };
  window.BinProblem = API;
})();
