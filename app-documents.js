// ── DOCUMENTS ─────────────────────────────────────────────
// Standalone module. No dependencies on other app.js code.
// Loaded via its own <script> tag before app.js. Called by render('documents').
var DOCUMENTS = [
  { name: 'Bin Rental Agreement',        file: '2026 BIN Rental - final draft.pdf' },
  { name: 'Furniture Drop-Off',          file: '2026 FB Drop Off - final draft.pdf' },
  { name: 'Furniture Pick-Up',           file: '2026 FB Pick-up final draft.pdf' },
  { name: 'Junk Removal Agreement',      file: '2026 Junk Removal - final draft.pdf' },
  { name: 'Donation Receiving Document', file: '2026_DONATION_RECEIVING_DOCUMENT-1.pdf' }
];
function renderDocuments(){
  var el = document.getElementById('documents-list');
  if(!el) return;
  el.innerHTML = DOCUMENTS.map(function(d){
    var href = 'docs/' + encodeURIComponent(d.file);
    return '<a class="chart-card" href="'+href+'" target="_blank" rel="noopener" '
      + 'style="text-decoration:none;color:inherit;padding:16px 18px;display:flex;align-items:center;gap:12px;transition:transform .15s, box-shadow .15s" '
      + 'onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 6px 18px rgba(0,0,0,.08)\'" '
      + 'onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\'">'
      + '<div style="font-size:32px;line-height:1;flex-shrink:0">📄</div>'
      + '<div style="min-width:0">'
        + '<div style="font-weight:600;font-size:14px;color:var(--text)">'+d.name+'</div>'
        + '<div style="font-size:11px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+d.file+'</div>'
      + '</div>'
    + '</a>';
  }).join('');
}
