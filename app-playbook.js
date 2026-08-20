// ══════════════════════════════════════════════════════════════════════════
//  CLIENT PLAYBOOK — what the office knows that the database didn't
// ══════════════════════════════════════════════════════════════════════════
// Three fields on a client: who to ask for, how they like the job done, how they
// pay. Before this they lived in one person's head, or half-written inside the
// client's own name — "DODDS GARAGE DOORS (ZACK or PENNY)".
//
// Two ways in, one editor:
//   • the profile — "Playbook" block with an Edit button
//   • capture mode — walks the top accounts one at a time, for sitting down with
//     whoever is leaving and getting it out of their head in an hour
//
// Depends on app.js: db, toast, escHtml, clients, dbToClient, CLIENT_LIST_COLS,
// closeM, openClientDetail.
(function(){
  'use strict';

  var FIELDS = [
    { key:'contactPerson', col:'contact_person', label:'Who do we ask for?',
      hint:'The name in the brackets, made real — "Zack, or Penny if he’s on site"', rows:2 },
    { key:'playbook', col:'playbook', label:'How do they like it done?',
      hint:'Where the bin goes, gate codes, back lane, call ahead, don’t block the customer lot', rows:4 },
    { key:'billingNote', col:'billing_note', label:'How do they pay?',
      hint:'PO number required, invoiced monthly, card on file, slow payer', rows:3 }
  ];

  function esc(s){
    return String(s==null?'':s).replace(/[&<>"]/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
    });
  }
  function has(cl){ return !!(cl && (cl.contactPerson || cl.playbook || cl.billingNote)); }

  // ── Block shown on the client profile ────────────────────────────────────
  function card(cl){
    if(!cl) return '';
    var edit = '<button class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 10px"'
      + ' onclick="JJPlaybook.edit(\''+esc(cl.cid)+'\')">'+(has(cl)?'Edit':'+ Add')+'</button>';
    if(!has(cl)){
      // An empty playbook is worth saying out loud on a client who books constantly —
      // that is exactly the account whose details walk out the door with someone.
      return '<div style="margin:0 0 12px;padding:10px 14px;border-radius:9px;border:1px dashed var(--border-strong);'
        + 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">'
        + '<span style="font-size:12.5px;color:var(--muted)">No playbook yet — who to ask for, how they like it, how they pay.</span>'
        + edit + '</div>';
    }
    var rows = FIELDS.map(function(f){
      var v = cl[f.key];
      if(!v) return '';
      return '<div style="margin-top:8px">'
        + '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:2px">'+esc(f.label)+'</div>'
        + '<div style="font-size:14px;color:var(--text);white-space:pre-wrap">'+esc(v)+'</div>'
        + '</div>';
    }).join('');
    return '<div style="margin:0 0 12px;padding:12px 16px;border-radius:10px;'
      + 'background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.30)">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">'
      + '<span style="font-size:13px;font-weight:800;color:#15803d">📋 Playbook</span>' + edit
      + '</div>' + rows + '</div>';
  }

  // ── Editor ───────────────────────────────────────────────────────────────
  // _queue holds the remaining accounts in capture mode; empty means a single edit.
  var _queue = [], _pos = 0;

  function fieldHtml(cl){
    return FIELDS.map(function(f){
      return '<div style="margin-bottom:12px">'
        + '<label style="display:block;font-size:12px;font-weight:700;margin-bottom:3px">'+esc(f.label)+'</label>'
        + '<div style="font-size:11px;color:var(--muted);margin-bottom:5px">'+esc(f.hint)+'</div>'
        + '<textarea id="pb-'+f.col+'" rows="'+f.rows+'" style="width:100%;padding:9px 12px;border-radius:8px;'
        + 'border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:14px;'
        + 'font-family:inherit;resize:vertical">'+esc(cl[f.key]||'')+'</textarea>'
        + '</div>';
    }).join('');
  }

  // Whoever the editor is currently showing — the save handlers read it back.
  var _showing = null;

  function render(cl){
    _showing = cl;
    var old=document.getElementById('pb-overlay'); if(old) old.remove();
    var capturing = _queue.length > 0;
    var progress = capturing
      ? '<div style="font-size:11px;color:var(--muted);margin-bottom:2px">Account '+(_pos+1)+' of '+_queue.length+'</div>' : '';
    var subtitle = cl._recent
      ? '<span style="font-size:12px;color:var(--muted)"> · '+cl._recent+' jobs in the last 180 days</span>' : '';
    var buttons = capturing
      ? '<button class="btn btn-ghost" onclick="JJPlaybook.skip()">Skip</button>'
        + '<button class="btn btn-primary" onclick="JJPlaybook.saveNext()">Save &amp; next →</button>'
      : '<button class="btn btn-ghost" onclick="JJPlaybook.close()">Cancel</button>'
        + '<button class="btn btn-primary" onclick="JJPlaybook.saveOne()">Save</button>';

    var html = '<div class="modal-overlay open" id="pb-overlay" onclick="if(event.target===this)JJPlaybook.close()">'
      + '<div style="background:var(--surface);border-radius:14px;padding:22px;max-width:560px;width:94%;'
      + 'max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
      + progress
      + '<div style="font-size:17px;font-weight:800;margin-bottom:2px">'+esc(cl.name||cl.businessName||'Client')+subtitle+'</div>'
      + '<div style="font-size:12px;color:var(--muted);margin-bottom:14px">'
      + 'Anything that would embarrass us if we didn’t know it.</div>'
      + fieldHtml(cl)
      + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px">'+buttons+'</div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    var first=document.getElementById('pb-contact_person'); if(first) first.focus();
  }

  function find(cid){
    return (typeof clients!=='undefined' ? clients : []).find(function(c){ return c.cid===cid; });
  }

  async function load(cid){
    var cl = find(cid);
    if(cl) return cl;
    var r = await db.from('clients').select(CLIENT_LIST_COLS).eq('cid',cid).single();
    if(r.error||!r.data){ toast('Couldn’t load that client: '+((r.error&&r.error.message)||'not found'),'error'); return null; }
    cl = dbToClient(r.data);
    if(typeof clients!=='undefined') clients.push(cl);
    return cl;
  }

  // Reads the boxes and writes them. Returns false and says why on failure, so a
  // capture session never advances past an account whose answers didn't save.
  async function persist(cid){
    var cl = find(cid); if(!cl) return false;
    var patch = {};
    FIELDS.forEach(function(f){
      var el = document.getElementById('pb-'+f.col);
      patch[f.col] = el ? el.value.trim() : (cl[f.key]||'');
    });
    var r = await db.from('clients').update(patch).eq('cid', cid);
    if(r.error){ toast('Save failed: '+r.error.message,'error'); return false; }
    // Keep the in-memory copy in step so the profile and cards show it immediately.
    FIELDS.forEach(function(f){ cl[f.key] = patch[f.col]; });
    return true;
  }

  var API = {
    card: card,

    async edit(cid){
      _queue = []; _pos = 0;
      var cl = await load(cid);
      if(cl) render(cl);
    },

    async saveOne(){
      var cl = _current(); if(!cl) return;
      if(await persist(cl.cid)){
        toast('✓ Playbook saved');
        API.close();
        // Reopen the profile so the new block is visible straight away.
        if(typeof openClientDetail==='function') openClientDetail(cl.cid);
      }
    },

    // ── Capture mode ───────────────────────────────────────────────────────
    // Walks the busiest accounts one at a time. Sit with whoever is leaving,
    // they talk, someone types, and an hour later it is written down.
    start(cids){
      if(!cids || !cids.length){ toast('No top clients to walk through yet.'); return; }
      _queue = cids.slice(); _pos = 0;
      _step();
    },

    skip(){ _pos++; _step(); },

    async saveNext(){
      var cl = _current(); if(!cl) return;
      if(await persist(cl.cid)){ _pos++; _step(); }
    },

    close(){
      var el=document.getElementById('pb-overlay'); if(el) el.remove();
      _queue = []; _pos = 0;
    }
  };

  function _current(){ return _showing; }

  async function _step(){
    if(_pos >= _queue.length){
      API.close();
      toast('✓ Playbook capture finished — that knowledge is written down now.');
      if(typeof renderClients==='function') renderClients();
      return;
    }
    var cl = await load(_queue[_pos]);
    if(!cl){ _pos++; return _step(); }
    render(cl);
  }

  window.JJPlaybook = API;
})();
