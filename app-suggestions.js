// ── SUGGESTION BOX (sticky-note wall) ─────────────────────────────────────
// Anyone signed in can stick a note on the board — a suggestion, an idea, or
// something that needs fixing. Admins (canAccessAnalytics) can mark notes done
// or take them down. Table: suggestions (RLS: any authenticated user).
(function(){
  'use strict';

  var STICKY_COLORS = ['#fff9c4','#ffe0b2','#c8e6c9','#bbdefb','#f8bbd0','#e1bee7'];
  var STICKY_TILT   = [-2, 1.5, -1, 2, -1.5, 1];

  function host(){ return document.getElementById('suggestions-page'); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function isAdmin(){ return typeof canAccessAnalytics==='function' && canAccessAnalytics(); }
  function me(){ return (typeof currentUser!=='undefined' && currentUser) ? (currentUser.displayName || String(currentUser.email||'').split('@')[0]) : 'Unknown'; }

  var _notes = [];

  async function renderSuggestions(){
    var el = host(); if(!el) return;
    el.innerHTML = '<div style="padding:48px;text-align:center;color:var(--muted)">Loading the board…</div>';
    var r = await db.from('suggestions').select('*').order('created_at',{ascending:false});
    if(r.error){ el.innerHTML = '<div style="padding:48px;text-align:center;color:#dc2626">Couldn\'t load suggestions: '+esc(r.error.message)+'</div>'; return; }
    _notes = r.data || [];
    paint();
  }

  function noteCard(n, i){
    var col = STICKY_COLORS[i % STICKY_COLORS.length];
    var rot = STICKY_TILT[i % STICKY_TILT.length];
    var done = n.status === 'done';
    var when = new Date(n.created_at).toLocaleDateString('en-CA',{month:'short',day:'numeric'});
    var adm = isAdmin();
    return '<div class="sugg-note" style="background:'+col+';--tilt:'+rot+'deg'+(done?';opacity:.55':'')+'">'
      + '<div class="sugg-body"'+(done?' style="text-decoration:line-through"':'')+'>'+esc(n.body)+'</div>'
      + '<div class="sugg-foot">'
      +   '<span style="flex:1">'+esc(n.author)+' · '+when+(done&&n.done_by?' · ✅ '+esc(n.done_by):'')+'</span>'
      +   (adm&&!done ? '<button class="sugg-btn" onclick="SuggestBox.markDone(\''+n.id+'\')" title="Mark done">✓ Done</button>' : '')
      +   (adm ? '<button class="sugg-btn" onclick="SuggestBox.remove(\''+n.id+'\')" title="Take the note down">✕</button>' : '')
      + '</div></div>';
  }

  function paint(){
    var el = host(); if(!el) return;
    var sorted = _notes.slice().sort(function(a,b){
      var d = (a.status==='done'?1:0) - (b.status==='done'?1:0);
      return d !== 0 ? d : String(b.created_at).localeCompare(String(a.created_at));
    });
    var openCount = _notes.filter(function(n){ return n.status!=='done'; }).length;
    var h = '<div style="max-width:1100px;margin:0 auto;padding:30px 26px 60px">'
      + '<div style="display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap;margin-bottom:6px">'
      +   '<div><div style="font-family:\'Bebas Neue\',sans-serif;font-size:40px;letter-spacing:1.2px;line-height:1;color:#1a1a2e">SUGGESTIONS</div>'
      +   '<div style="font-size:13px;color:#868e96;margin-top:6px">Ideas, requests, things that need fixing — stick a note on the board.</div></div>'
      +   '<div style="margin-left:auto;font-size:12px;font-weight:600;color:#495057;background:#fff;border:1px solid #e9ecef;border-radius:99px;padding:7px 13px">'+openCount+' open</div>'
      + '</div>'
      + '<div class="sugg-compose">'
      +   '<textarea id="sugg-new" rows="2" placeholder="What should we add or fix?"></textarea>'
      +   '<button class="btn btn-primary" onclick="SuggestBox.post()" style="align-self:flex-end;padding:10px 22px">📌 Post it</button>'
      + '</div>'
      + (sorted.length
          ? '<div class="sugg-grid">'+sorted.map(noteCard).join('')+'</div>'
          : '<div style="padding:60px;text-align:center;color:var(--muted);font-size:14px">Nothing on the board yet — be the first.</div>')
      + '</div>';
    el.innerHTML = h;
  }

  async function post(){
    var ta = document.getElementById('sugg-new'); if(!ta) return;
    var body = ta.value.trim(); if(!body) return;
    var r = await db.from('suggestions').insert({author:me(), body:body});
    if(r.error){ toast('Couldn\'t post: '+r.error.message, 'error'); return; }
    toast('📌 Posted!');
    renderSuggestions();
  }

  async function markDone(id){
    var r = await db.from('suggestions').update({status:'done', done_by:me(), done_at:new Date().toISOString()}).eq('id', id);
    if(r.error){ toast('Failed: '+r.error.message, 'error'); return; }
    renderSuggestions();
  }

  async function remove(id){
    if(!confirm('Take this note down for good?')) return;
    var r = await db.from('suggestions').delete().eq('id', id);
    if(r.error){ toast('Failed: '+r.error.message, 'error'); return; }
    renderSuggestions();
  }

  window.renderSuggestions = renderSuggestions;
  window.SuggestBox = { post:post, markDone:markDone, remove:remove };
})();
