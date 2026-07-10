// ── DOCUMENTS ─────────────────────────────────────────────
// Standalone module. No dependencies on other app.js code.
// Loaded via its own <script> tag before app.js. Called by render('documents').
var DOCUMENTS = [
  { name: 'Bin Rental Agreement',        group: 'Bins',             desc: 'Customer signs before bin drop-off. Covers rental terms, swap and pickup policy.', file: '2026 BIN Rental - final draft.pdf' },
  { name: 'Furniture Drop-Off',          group: 'Furniture',        desc: "Left at the customer's location. Lists accepted items and condition requirements.", file: '2026 FB Drop Off - final draft.pdf' },
  { name: 'Furniture Pick-Up',           group: 'Furniture',        desc: 'Signed at pickup to confirm items received and condition noted.',                   file: '2026 FB Pick-up final draft.pdf' },
  { name: 'Junk Removal Agreement',      group: 'Junk & Donations', desc: 'Customer authorizes removal. Covers liability, access, and disposal terms.',        file: '2026 Junk Removal - final draft.pdf' },
  { name: 'Junk Quote Form',             group: 'Junk & Donations', desc: 'Blank estimate sheet to hand to a customer on-site before booking.',                file: '2026 Junk Quote - final draft.pdf' }
];
function renderDocuments(){
  var el = document.getElementById('documents-list');
  if(!el) return;
  var groups = ['Bins','Furniture','Junk & Donations'];
  el.innerHTML = groups.map(function(g, i){
    var docs = DOCUMENTS.filter(function(d){ return d.group === g; });
    if(!docs.length) return '';
    return '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin:'+(i===0?'4px':'28px')+' 0 10px">'+g+'</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">'
      + docs.map(docCard).join('')
      + '</div>';
  }).join('');
}
function docCard(d){
  var href = 'docs/' + encodeURIComponent(d.file);
  return '<a class="chart-card" href="'+href+'" target="_blank" rel="noopener" '
    + 'style="text-decoration:none;color:inherit;padding:18px 20px;display:flex;align-items:flex-start;gap:14px;transition:transform .15s, box-shadow .15s" '
    + 'onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 6px 18px rgba(0,0,0,.12)\'" '
    + 'onmouseout="this.style.transform=\'\';this.style.boxShadow=\'\'">'
    + '<div style="font-size:32px;line-height:1;flex-shrink:0;margin-top:2px">📄</div>'
    + '<div style="min-width:0">'
      + '<div style="font-weight:600;font-size:14px;color:var(--text);line-height:1.25">'+d.name+'</div>'
      + '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.4">'+d.desc+'</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:6px">PDF · opens in new tab</div>'
    + '</div>'
  + '</a>';
}
