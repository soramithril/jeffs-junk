// ── WRITTEN QUOTES ─────────────────────────────────────────
// Barb's quotes for clients: typed up here, saved, and downloaded as a PDF to attach to
// an email. Replaces typing over last customer's Word file.
// Standalone module. Depends on app.js globals: db, toast, currentUser, canDelete,
// todayStr, _wrapForWidth, and PDFLib (index.html loads pdf-lib). PDF.js is loaded on
// demand the first time the editor opens, for the preview only.
// Called by render('writtenquotes'). A bug here only affects this page.
//
// Owners + leads only, enforced twice: go() blocks the page (RESTRICTED_PAGES) and the
// written_quotes table only answers is_admin() users.
//
// Deliberately NOT the crew's Junk Quote job type (printJunkQuote). That one is the
// on-site sheet with a single price and Office/Driver copies, and it stays exactly as it
// is (Jake, 2026-09-16). Nothing here reads or writes jobs.

var WQ_HST_PERCENT = 13;
var WQ_MONTHS = ['January','February','March','April','May','June','July','August',
                 'September','October','November','December'];

var _wqQuotes = [];
var _wqLoaded = false;
var _wqFilter = 'all';        // all | draft | sent
var _wqQuery = '';
var _wqEdit = null;           // the quote open in the editor; null = showing the list
var _wqDirty = false;
var _wqPreviewTimer = null;
var _wqPreviewSeq = 0;
var _wqPdfjsReady = null;      // promise of the PDF.js global, once it has been asked for
var _wqAssetBytes = null;

function _wqEsc(s){
  return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── money: always whole cents, so HST never picks up a floating-point stray penny ──
function _wqBadAmount(v){
  var s = String(v == null ? '' : v).replace(/[$,\s]/g, '');
  return s !== '' && !/^-?\d+(\.\d{0,2})?$/.test(s);
}
function _wqCents(v){
  var s = String(v == null ? '' : v).replace(/[$,\s]/g, '');
  if (s === '' || _wqBadAmount(v)) return 0;
  return Math.round(parseFloat(s) * 100);
}
function _wqTotals(lines){
  var sub = (lines || []).reduce(function(t, l){ return t + _wqCents(l.amount); }, 0);
  var hst = Math.round(sub * WQ_HST_PERCENT / 100);
  return { sub: sub, hst: hst, total: sub + hst };
}
function _wqMoney(cents){
  var neg = cents < 0, c = Math.abs(cents);
  var dollars = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-$' : '$') + dollars + '.' + String(c % 100).padStart(2, '0');
}
function _wqLongDate(ymd){
  if (!ymd) return '';
  var p = String(ymd).split('-');
  return WQ_MONTHS[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0];
}

// ── data ──────────────────────────────────────────────────────────────────────
function _wqBlank(){
  return {
    id: null, quote_no: null, status: 'draft', sent_at: null, created_by: null,
    quote_date: todayStr(),
    customer_name: '', customer_phone: '', customer_email: '',
    site_street: '', site_town: '', site_postal: '',
    job_type: 'Junk removal', salesperson: 'Jeff', start_text: 'ASAP', end_text: '',
    payment_terms: 'Due on receipt',
    lines: [{ description: '', amount: '' }]
  };
}
// A saved row, shaped for editing: amounts become the text you'd type.
function _wqFromRow(row){
  var q = JSON.parse(JSON.stringify(row));
  q.lines = (row.lines || []).map(function(l){
    return { description: l.description || '',
             amount: l.amount == null ? '' : _wqMoney(Math.round(l.amount * 100)).replace('$', '') };
  });
  if (!q.lines.length) q.lines.push({ description: '', amount: '' });
  return q;
}

async function loadWrittenQuotes(){
  var r = await db.from('written_quotes').select('*').order('quote_no', { ascending: false });
  if (r.error) throw new Error('Could not load quotes: ' + r.error.message);
  _wqQuotes = r.data || [];
  _wqLoaded = true;
}

// ── page ──────────────────────────────────────────────────────────────────────
async function renderWrittenQuotes(bg){
  var host = document.getElementById('wq-root');
  if (!host) return;
  _wqInjectStyle();
  if (_wqEdit) {
    // A background refresh (someone else's job update) must never rebuild the form
    // under Barb's cursor.
    if (bg) return;
    host.innerHTML = _wqEditorHtml(_wqEdit);
    _wqRenderLines();
    _wqRefreshTotals();
    _wqRenderPreview();
    return;
  }
  if (bg) { if (_wqLoaded) _wqRenderListBody(); return; }
  if (!_wqLoaded) host.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">Loading…</div>';
  try { await loadWrittenQuotes(); }
  catch (err) {
    console.error(err);
    host.innerHTML = '<div class="chart-card" style="padding:20px;color:var(--bad-ink)">' + _wqEsc(err.message) + '</div>';
    return;
  }
  if (_wqEdit) return;   // they opened a quote while the list was loading
  host.innerHTML = _wqListShellHtml();
  _wqRenderListBody();
}

function _wqListShellHtml(){
  return '<div class="page-header">'
      + '<div><div class="page-title page-title-sm">Written Quotes</div>'
      + '<div class="page-sub" id="wq-sub"></div></div>'
      + '<button class="btn btn-primary" onclick="wqNew()">+ New quote</button>'
    + '</div>'
    + '<div class="filters-bar" style="margin-bottom:14px;align-items:center;gap:10px">'
      + '<input type="text" class="search-icon" placeholder="Search quotes — customer, address, quote number…"'
      + ' value="' + _wqEsc(_wqQuery) + '" oninput="wqSearch(this.value)"'
      + ' style="flex:1;min-width:200px;box-sizing:border-box;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--radius-sm)">'
      + '<div id="wq-chips" style="display:flex;gap:8px;flex-wrap:wrap"></div>'
    + '</div>'
    + '<div id="wq-list"></div>';
}

function _wqRenderListBody(){
  var list = document.getElementById('wq-list');
  if (!list) return;
  var drafts = _wqQuotes.filter(function(q){ return q.status !== 'sent'; }).length;
  var sent = _wqQuotes.length - drafts;
  var sub = document.getElementById('wq-sub');
  if (sub) sub.textContent = _wqQuotes.length + ' quote' + (_wqQuotes.length === 1 ? '' : 's')
    + ' · ' + drafts + ' draft' + (drafts === 1 ? '' : 's') + ' · ' + sent + ' sent';
  var chips = document.getElementById('wq-chips');
  if (chips) chips.innerHTML = [['all','All',_wqQuotes.length],['draft','Drafts',drafts],['sent','Sent',sent]]
    .map(function(c){
      return '<button class="filter-chip' + (_wqFilter === c[0] ? ' active' : '') + '" onclick="wqSetFilter(\'' + c[0] + '\')">'
        + c[1] + ' (' + c[2] + ')</button>';
    }).join('');
  var q = _wqQuery.trim().toLowerCase();
  var shown = _wqQuotes.filter(function(x){
    if (_wqFilter === 'draft' && x.status === 'sent') return false;
    if (_wqFilter === 'sent' && x.status !== 'sent') return false;
    if (!q) return true;
    return [x.quote_no, x.customer_name, x.customer_email, x.customer_phone, x.site_street, x.site_town]
      .join(' ').toLowerCase().indexOf(q) !== -1;
  });
  if (!shown.length) {
    list.innerHTML = '<div style="text-align:center;padding:50px 20px;color:var(--muted);font-size:15px">'
      + (_wqQuotes.length ? 'No quotes match.' : 'No quotes yet. Click <b>+ New quote</b> to write the first one.')
      + '</div>';
    return;
  }
  list.innerHTML = shown.map(_wqRowHtml).join('');
}

function _wqRowHtml(q){
  var t = _wqTotals(q.lines);
  var place = [q.site_street, q.site_town].filter(Boolean).join(', ');
  var meta = [place, _wqLongDate(q.quote_date), q.created_by ? 'by ' + q.created_by : '']
    .filter(Boolean).map(_wqEsc).join(' · ');
  return '<div class="chart-card wq-row" onclick="wqOpen(\'' + q.id + '\')">'
    + '<div class="wq-no">#' + q.quote_no + '</div>'
    + '<div style="min-width:0;flex:1">'
      + '<div class="wq-who">' + _wqEsc(q.customer_name || 'No name yet') + '</div>'
      + '<div class="wq-meta">' + meta + '</div>'
    + '</div>'
    + '<div style="text-align:right;flex-shrink:0">'
      + '<div class="wq-total">' + _wqMoney(t.total) + '</div>'
      + '<span class="wq-chip ' + (q.status === 'sent' ? 'sent' : 'draft') + '">' + (q.status === 'sent' ? 'Sent' : 'Draft') + '</span>'
    + '</div>'
  + '</div>';
}

function wqSetFilter(f){ _wqFilter = f; _wqRenderListBody(); }
function wqSearch(v){ _wqQuery = v; _wqRenderListBody(); }

function wqNew(){
  _wqEdit = _wqBlank();
  _wqDirty = false;
  renderWrittenQuotes();
  window.scrollTo(0, 0);
  var name = document.getElementById('wq-f-customer_name');
  if (name) name.focus();
}
function wqOpen(id){
  var row = _wqQuotes.find(function(q){ return q.id === id; });
  if (!row) throw new Error('Quote ' + id + ' is not loaded');
  _wqEdit = _wqFromRow(row);
  _wqDirty = false;
  renderWrittenQuotes();
  window.scrollTo(0, 0);
}
function wqBack(){
  if (_wqDirty && !confirm('Leave without saving? Your changes to this quote will be lost.')) return;
  _wqEdit = null;
  _wqDirty = false;
  renderWrittenQuotes();
}

// ── editor ────────────────────────────────────────────────────────────────────
function _wqInput(key, label, opts){
  opts = opts || {};
  return '<div class="form-group' + (opts.full ? ' full' : '') + '">'
    + '<label for="wq-f-' + key + '">' + label + '</label>'
    + '<input id="wq-f-' + key + '" type="' + (opts.type || 'text') + '"'
    + (opts.placeholder ? ' placeholder="' + _wqEsc(opts.placeholder) + '"' : '')
    + (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '')
    + ' value="' + _wqEsc(_wqEdit[key]) + '" oninput="wqSet(\'' + key + '\', this.value)">'
    + '</div>';
}

function _wqEditorHtml(q){
  var saved = !!q.id;
  var title = saved ? 'Quote #' + q.quote_no : 'New quote';
  var sub = !saved ? 'Not saved yet — fill it in, then Save.'
    : q.status === 'sent'
      ? 'Sent' + (q.sent_at ? ' ' + _wqLongDate(q.sent_at.slice(0, 10)) : '')
      : 'Draft' + (q.created_by ? ' · started by ' + q.created_by : '');
  return '<div class="page-header">'
      + '<div><div class="page-title page-title-sm">' + _wqEsc(title) + '</div>'
      + '<div class="page-sub">' + _wqEsc(sub) + '</div></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + '<button class="btn btn-ghost" onclick="wqBack()">← All quotes</button>'
        + (saved ? '<button class="btn btn-ghost" onclick="wqToggleSent()">' + (q.status === 'sent' ? 'Back to draft' : 'Mark as sent') + '</button>' : '')
        + '<button class="btn btn-ghost" onclick="wqDownload()">Download PDF</button>'
        + '<button class="btn btn-primary" id="wq-save-btn" onclick="wqSave()">Save</button>'
      + '</div>'
    + '</div>'
    + '<div class="wq-edit">'
      + '<div>'
        + '<section class="chart-card wq-sec"><h3>Customer</h3><div class="wq-grid">'
          + _wqInput('customer_name', 'Name', { full: true })
          + _wqInput('customer_phone', 'Phone', { type: 'tel' })
          + _wqInput('customer_email', 'Email', { type: 'email' })
        + '</div></section>'
        + '<section class="chart-card wq-sec"><h3>Job site</h3><div class="wq-grid">'
          + _wqInput('site_street', 'Street address', { full: true })
          + _wqInput('site_town', 'Town', { placeholder: 'Bradford, ON' })
          + _wqInput('site_postal', 'Postal code')
        + '</div></section>'
        + '<section class="chart-card wq-sec"><h3>The job</h3><div class="wq-grid">'
          + _wqInput('quote_date', 'Quote date', { type: 'date' })
          + _wqInput('job_type', 'Job')
          + _wqInput('salesperson', 'Salesperson')
          + _wqInput('payment_terms', 'Payment terms')
          + _wqInput('start_text', 'Start date', { placeholder: 'ASAP' })
          + _wqInput('end_text', 'End date', { placeholder: 'Leave blank if one day' })
        + '</div></section>'
        + '<section class="chart-card wq-sec"><h3>Charges</h3>'
          + '<div id="wq-lines"></div>'
          + '<button type="button" class="wq-add" onclick="wqAddLine()">+ Add a charge</button>'
          + '<div class="wq-totals" id="wq-totals"></div>'
        + '</section>'
        + (saved && canDelete
            ? '<div style="margin:6px 0 30px"><button class="btn btn-danger btn-sm" onclick="wqDelete()">Delete this quote</button></div>'
            : '')
      + '</div>'
      + '<div class="wq-preview">'
        + '<div class="wq-preview-head"><h3>What the customer gets</h3><span>Updates when you stop typing</span></div>'
        + '<div class="wq-note" id="wq-preview-note" hidden></div>'
        + '<div class="wq-sheet" id="wq-sheet" role="img" aria-label="Preview of the quote PDF">'
          + '<div class="wq-sheet-wait">Building the preview…</div>'
        + '</div>'
      + '</div>'
    + '</div>';
}

function _wqRenderLines(){
  var host = document.getElementById('wq-lines');
  if (!host) return;
  host.innerHTML = _wqEdit.lines.map(function(l, i){
    return '<div class="wq-line">'
      + '<textarea rows="2" placeholder="Describe the work" aria-label="Charge ' + (i + 1) + ' description"'
      + ' oninput="wqSetLine(' + i + ', \'description\', this.value)">' + _wqEsc(l.description) + '</textarea>'
      + '<div class="wq-amt' + (_wqBadAmount(l.amount) ? ' bad' : '') + '" id="wq-amt-' + i + '"><span>$</span>'
        + '<input inputmode="decimal" placeholder="0.00" aria-label="Charge ' + (i + 1) + ' amount"'
        + ' value="' + _wqEsc(l.amount) + '" oninput="wqSetLine(' + i + ', \'amount\', this.value)" onblur="wqTidyAmount(' + i + ', this)">'
      + '</div>'
      + '<button type="button" class="wq-kill" title="Remove this charge" aria-label="Remove charge ' + (i + 1) + '" onclick="wqRemoveLine(' + i + ')">×</button>'
    + '</div>';
  }).join('');
}

function _wqRefreshTotals(){
  var host = document.getElementById('wq-totals');
  if (!host) return;
  var t = _wqTotals(_wqEdit.lines);
  host.innerHTML = '<span>Subtotal</span><span>' + _wqMoney(t.sub) + '</span>'
    + '<span>HST (' + WQ_HST_PERCENT + '%)</span><span>' + _wqMoney(t.hst) + '</span>'
    + '<span class="grand">Total</span><span class="grand">' + _wqMoney(t.total) + '</span>';
}

function _wqChanged(){
  _wqDirty = true;
  clearTimeout(_wqPreviewTimer);
  _wqPreviewTimer = setTimeout(_wqRenderPreview, 650);
}
function wqSet(key, value){ _wqEdit[key] = value; _wqChanged(); }
function wqSetLine(i, key, value){
  _wqEdit.lines[i][key] = value;
  if (key === 'amount') {
    var box = document.getElementById('wq-amt-' + i);
    if (box) box.classList.toggle('bad', _wqBadAmount(value));
    _wqRefreshTotals();
  }
  _wqChanged();
}
function wqTidyAmount(i, input){
  var v = _wqEdit.lines[i].amount;
  if (String(v).trim() === '' || _wqBadAmount(v)) return;
  input.value = _wqEdit.lines[i].amount = _wqMoney(_wqCents(v)).replace('$', '');
}
function wqAddLine(){
  _wqEdit.lines.push({ description: '', amount: '' });
  _wqRenderLines();
  _wqChanged();
  var boxes = document.querySelectorAll('#wq-lines textarea');
  boxes[boxes.length - 1].focus();
}
function wqRemoveLine(i){
  if (_wqEdit.lines.length === 1) _wqEdit.lines[0] = { description: '', amount: '' };
  else _wqEdit.lines.splice(i, 1);
  _wqRenderLines();
  _wqRefreshTotals();
  _wqChanged();
}

// The preview used to be the PDF in an <iframe>. Every update reloaded the browser's PDF
// viewer, which blanks to grey and redraws — a flash on every pause in typing (Barb found
// it hard on the eyes). Now PDF.js draws each page onto a canvas that isn't on screen yet,
// and the finished pages replace the old ones in one step, so the old preview stays up
// until the new one is completely ready. Nothing blanks in between.
var WQ_PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/';

function _wqPdfjs(){
  if (!_wqPdfjsReady) {
    _wqPdfjsReady = new Promise(function(resolve, reject){
      var tag = document.createElement('script');
      tag.src = WQ_PDFJS + 'build/pdf.min.js';
      tag.onload = function(){
        pdfjsLib.GlobalWorkerOptions.workerSrc = WQ_PDFJS + 'build/pdf.worker.min.js';
        resolve(pdfjsLib);
      };
      tag.onerror = function(){
        _wqPdfjsReady = null;   // let the next pause in typing try again
        reject(new Error('The preview couldn\'t load (no connection to cdn.jsdelivr.net). Download PDF still works.'));
      };
      document.head.appendChild(tag);
    });
  }
  return _wqPdfjsReady;
}

async function _wqRenderPreview(){
  var seq = ++_wqPreviewSeq;
  var sheet = document.getElementById('wq-sheet');
  var note = document.getElementById('wq-preview-note');
  if (!sheet || !_wqEdit) return;
  var pages = [];
  try {
    var bytes = await buildWrittenQuotePdf(_wqEdit, await _wqAssets());
    var pdfjs = await _wqPdfjs();
    if (seq !== _wqPreviewSeq) return;   // a newer preview is already on its way
    var doc = await pdfjs.getDocument({
      data: bytes, isEvalSupported: false,
      standardFontDataUrl: WQ_PDFJS + 'standard_fonts/'
    }).promise;
    var cssWidth = sheet.clientWidth - 24;               // the sheet's own padding
    var ratio = window.devicePixelRatio || 1;
    for (var n = 1; n <= doc.numPages; n++) {
      var page = await doc.getPage(n);
      var viewport = page.getViewport({ scale: cssWidth * ratio / page.getViewport({ scale: 1 }).width });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      // 'print' draws straight through. The default 'display' mode waits on screen-refresh
      // callbacks, which stop entirely while the tab is in the background — so flicking to
      // an email to copy a customer's details froze the preview (measured: never finished
      // hidden, vs 49 ms in print mode). This PDF has no forms or annotations, so it looks
      // the same either way, and print is what the customer actually gets.
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport, intent: 'print' }).promise;
      pages.push(canvas);
      if (seq !== _wqPreviewSeq) { doc.destroy(); return; }
    }
    doc.destroy();
  } catch (err) {
    console.error('written quote preview', err);
    if (seq === _wqPreviewSeq && note) { note.textContent = err.message; note.hidden = false; }
    return;
  }
  if (note) note.hidden = true;
  sheet.replaceChildren.apply(sheet, pages);   // one swap: old pages out, finished pages in
}

// ── save / send / download / delete ───────────────────────────────────────────
function _wqProblem(q){
  if (!String(q.customer_name || '').trim()) return 'Add the customer\'s name before saving.';
  for (var i = 0; i < q.lines.length; i++) {
    if (_wqBadAmount(q.lines[i].amount))
      return 'Charge ' + (i + 1) + ': "' + q.lines[i].amount + '" isn\'t an amount. Type it like 1250 or 1,250.00.';
  }
  return '';
}

// Resolves to the saved quote, or null if it didn't save (the toast says why).
async function wqSave(){
  var q = _wqEdit;
  var problem = _wqProblem(q);
  if (problem) { toast(problem, 'error'); return null; }
  var rec = {
    status: q.status, sent_at: q.sent_at, quote_date: q.quote_date || todayStr(),
    customer_name: q.customer_name.trim(), customer_phone: q.customer_phone.trim(),
    customer_email: q.customer_email.trim(), site_street: q.site_street.trim(),
    site_town: q.site_town.trim(), site_postal: q.site_postal.trim(),
    job_type: q.job_type.trim(), salesperson: q.salesperson.trim(),
    start_text: q.start_text.trim(), end_text: q.end_text.trim(),
    payment_terms: q.payment_terms.trim(),
    lines: q.lines
      .filter(function(l){ return String(l.description).trim() || String(l.amount).trim(); })
      .map(function(l){
        return { description: String(l.description).trim(),
                 amount: String(l.amount).trim() === '' ? null : _wqCents(l.amount) / 100 };
      })
  };
  var btn = document.getElementById('wq-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  var r = q.id
    ? await db.from('written_quotes').update(rec).eq('id', q.id).select().single()
    : await db.from('written_quotes').insert(Object.assign(rec, { created_by: currentUser.displayName })).select().single();
  if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  if (r.error) { toast('Save failed: ' + r.error.message, 'error'); return null; }
  var i = _wqQuotes.findIndex(function(x){ return x.id === r.data.id; });
  if (i === -1) _wqQuotes.unshift(r.data); else _wqQuotes[i] = r.data;
  _wqEdit = _wqFromRow(r.data);
  _wqDirty = false;
  renderWrittenQuotes();
  toast('Quote #' + r.data.quote_no + ' saved.');
  return _wqEdit;
}

async function wqToggleSent(){
  var was = { status: _wqEdit.status, sent_at: _wqEdit.sent_at };
  var toSent = _wqEdit.status !== 'sent';
  _wqEdit.status = toSent ? 'sent' : 'draft';
  _wqEdit.sent_at = toSent ? new Date().toISOString() : null;
  if (!(await wqSave())) { _wqEdit.status = was.status; _wqEdit.sent_at = was.sent_at; }
}

async function wqDownload(){
  // The quote number comes from saving, and the customer's copy must carry it.
  var q = (_wqDirty || !_wqEdit.id) ? await wqSave() : _wqEdit;
  if (!q) return;
  var bytes;
  try { bytes = await buildWrittenQuotePdf(q, await _wqAssets()); }
  catch (err) { console.error('written quote pdf', err); toast(err.message, 'error'); return; }
  var who = String(q.customer_name || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  a.download = 'Jeffs Junk Quote ' + q.quote_no + (who ? ' - ' + who : '') + '.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 10000);
}

async function wqDelete(){
  var q = _wqEdit;
  if (!confirm('Delete quote #' + q.quote_no + ' for ' + (q.customer_name || 'this customer') + '? This cannot be undone.')) return;
  var r = await db.from('written_quotes').delete().eq('id', q.id).select();
  if (r.error) { toast('Delete failed: ' + r.error.message, 'error'); return; }
  // Row security deletes nothing, without an error, for someone not allowed to delete.
  if (!r.data || !r.data.length) { toast('Not deleted — your account isn\'t allowed to delete quotes.', 'error'); return; }
  _wqQuotes = _wqQuotes.filter(function(x){ return x.id !== q.id; });
  _wqEdit = null;
  _wqDirty = false;
  renderWrittenQuotes();
  toast('Quote #' + q.quote_no + ' deleted.');
}

// ── the PDF ───────────────────────────────────────────────────────────────────
async function _wqAssets(){
  if (_wqAssetBytes) return _wqAssetBytes;
  async function get(url){
    var r = await fetch(url);
    if (!r.ok) throw new Error('Could not load ' + url + ' for the PDF (' + r.status + ').');
    return new Uint8Array(await r.arrayBuffer());
  }
  _wqAssetBytes = {
    logo: await get('assets/jeffs-junk-logo.png'),
    jwg: await get('assets/jwg-logo.png'),
    wordmark: await get('assets/quote-wordmark.png')
  };
  return _wqAssetBytes;
}

// The PDF uses Helvetica, which can only print the Windows-1252 character set. Say
// exactly which character in which box is the problem, rather than failing vaguely.
function _wqAssertPrintable(q, font){
  var fields = [
    ['customer_name','the customer name'], ['customer_phone','the phone'], ['customer_email','the email'],
    ['site_street','the street address'], ['site_town','the town'], ['site_postal','the postal code'],
    ['job_type','Job'], ['salesperson','Salesperson'], ['start_text','Start date'], ['end_text','End date'],
    ['payment_terms','Payment terms']
  ].map(function(f){ return [q[f[0]], f[1]]; });
  q.lines.forEach(function(l, i){ fields.push([l.description, 'charge ' + (i + 1)]); });
  fields.forEach(function(f){
    Array.from(_wqClean(f[0])).forEach(function(ch){
      if (ch === '\n') return;
      try { font.widthOfTextAtSize(ch, 10); }
      catch (e) { throw new Error('The PDF can\'t print "' + ch + '" in ' + f[1] + '. Take it out or type it another way, then try again.'); }
    });
  });
}
function _wqClean(s){ return String(s == null ? '' : s).replace(/\r/g, '').replace(/\t/g, '    '); }

async function buildWrittenQuotePdf(q, assets){
  var P = PDFLib;
  var W = 612, H = 792, M = 54, CW = W - 2 * M, BOTTOM = H - 80;
  function rgb(hex){ return P.rgb(parseInt(hex.slice(0,2),16)/255, parseInt(hex.slice(2,4),16)/255, parseInt(hex.slice(4,6),16)/255); }
  var C = { green: rgb('53B847'), dark: rgb('3A8F34'), ink: rgb('2B2B2B'), muted: rgb('7A7A7A'),
            rule: rgb('D9D9D9'), tint: rgb('F4F7F3'), white: rgb('FFFFFF') };

  var pdf = await P.PDFDocument.create();
  var reg = await pdf.embedFont(P.StandardFonts.Helvetica);
  var bold = await pdf.embedFont(P.StandardFonts.HelveticaBold);
  _wqAssertPrintable(q, reg);
  var logo = await pdf.embedPng(assets.logo);
  var jwg = await pdf.embedPng(assets.jwg);
  var mark = await pdf.embedPng(assets.wordmark);
  pdf.setTitle('Quote' + (q.quote_no ? ' #' + q.quote_no : '') + (q.customer_name ? ' - ' + q.customer_name : ''));
  pdf.setAuthor('Jeff\'s Junk');

  var page, y;
  function text(s, x, top, size, font, color){ page.drawText(s, { x: x, y: H - top, size: size, font: font, color: color }); }
  function width(s, size, font){ return font.widthOfTextAtSize(s, size); }
  function right(s, xr, top, size, font, color){ text(s, xr - width(s, size, font), top, size, font, color); }
  function tracked(s, x, top, size, font, color, track){
    for (var i = 0; i < s.length; i++) { text(s[i], x, top, size, font, color); x += width(s[i], size, font) + track; }
  }
  function trackedWidth(s, size, font, track){ return width(s, size, font) + track * Math.max(0, s.length - 1); }
  function box(x, top, w, h, color){ page.drawRectangle({ x: x, y: H - top - h, width: w, height: h, color: color }); }
  function fit(s, size, font, maxW){
    s = _wqClean(s).replace(/\n/g, ' ').trim();
    if (width(s, size, font) <= maxW) return s;
    while (s && width(s + '…', size, font) > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  // _wrapForWidth keeps whole words; break any single word too long for the column too.
  function wrap(s, size, font, maxW){
    var out = [];
    _wrapForWidth(_wqClean(s), font, size, maxW).forEach(function(line){
      while (width(line, size, font) > maxW) {
        var n = line.length;
        while (n > 1 && width(line.slice(0, n), size, font) > maxW) n--;
        out.push(line.slice(0, n));
        line = line.slice(n);
      }
      out.push(line);
    });
    while (out.length && out[0] === '') out.shift();
    while (out.length && out[out.length - 1] === '') out.pop();
    return out;
  }

  function continuationPage(){
    page = pdf.addPage([W, H]);
    text('Quote' + (q.quote_no ? ' #' + q.quote_no : '') + ' (continued)', M, 48, 10, bold, C.ink);
    if (q.customer_name) right(fit(q.customer_name, 9.5, reg, CW / 2), W - M, 48, 9.5, reg, C.muted);
    box(M, 56, CW, 1.5, C.green);
    y = 74;
  }
  var DESC_W = CW - 120;
  function itemsHeader(){
    box(M, y, CW, 17, C.green);
    tracked('DESCRIPTION', M + 8, y + 11.6, 6.8, bold, C.white, 0.8);
    var aw = trackedWidth('AMOUNT', 6.8, bold, 0.8);
    tracked('AMOUNT', W - M - 8 - aw, y + 11.6, 6.8, bold, C.white, 0.8);
    y += 17;
  }

  // ── page 1 masthead ──
  page = pdf.addPage([W, H]);
  // Both companies, the same size and side by side on one centre line (Jake, 2026-09-16).
  var mid = 68, gap = 20;
  var logoW = 150, logoH = logoW * logo.height / logo.width;   // the truck fills its image edge to edge
  page.drawImage(logo, { x: M, y: H - mid - logoH / 2, width: logoW, height: logoH });
  // jwg-logo.png is the badge on a white square: the circle fills only the middle 78%
  // (measured: 43px of white on each side of 400). Draw it so the circle is exactly the
  // truck's height, and pull it left by that white border so the gap is the real one.
  var JWG_BORDER = 43 / 400;
  var jwgH = logoH / (1 - 2 * JWG_BORDER), jwgW = jwgH * jwg.width / jwg.height;
  page.drawImage(jwg, { x: M + logoW + gap - jwgW * JWG_BORDER, y: H - mid - jwgH / 2, width: jwgW, height: jwgH });
  var markW = 146, markH = markW * mark.height / mark.width;
  page.drawImage(mark, { x: W - M - markW, y: H - 42 - markH, width: markW, height: markH });
  [['QUOTE #', q.quote_no ? String(q.quote_no) : '—'], ['DATE', _wqLongDate(q.quote_date)]].forEach(function(m, i){
    var top = 96 + i * 15;
    var vw = width(m[1], 10, reg);
    var lw = trackedWidth(m[0], 7.2, bold, 0.8);
    tracked(m[0], W - M - vw - 7 - lw, top, 7.2, bold, C.muted, 0.8);
    text(m[1], W - M - vw, top, 10, reg, C.ink);
  });
  box(M, 124, CW, 2.2, C.green);

  // ── prepared for / job site ──
  var colW = CW / 2 - 14, col2 = M + CW / 2 + 8;
  tracked('PREPARED FOR', M, 146, 7, bold, C.green, 1.1);
  tracked('JOB SITE', col2, 146, 7, bold, C.green, 1.1);
  [[q.customer_name, 11, bold], [q.customer_phone, 9.5, reg], [q.customer_email, 9.5, reg]]
    .filter(function(v){ return String(v[0] || '').trim(); })
    .forEach(function(v, i){ text(fit(v[0], v[1], v[2], colW), M, 163 + i * 14, v[1], v[2], C.ink); });
  [[q.site_street, 11, bold], [[q.site_town, q.site_postal].filter(function(s){ return String(s || '').trim(); }).join('  '), 9.5, reg]]
    .filter(function(v){ return String(v[0] || '').trim(); })
    .forEach(function(v, i){ text(fit(v[0], v[1], v[2], colW), col2, 163 + i * 14, v[1], v[2], C.ink); });

  // ── job bar ──
  var barTop = 210, cols = [88, 148, 84, 84, 100];
  var heads = ['SALESPERSON', 'JOB', 'START DATE', 'END DATE', 'PAYMENT TERMS'];
  var vals = [q.salesperson, q.job_type, q.start_text, q.end_text || '—', q.payment_terms];
  box(M, barTop, CW, 17, C.green);
  box(M, barTop + 17, CW, 22, C.tint);
  var x = M;
  cols.forEach(function(w, i){
    tracked(heads[i], x + 7, barTop + 11.6, 6.6, bold, C.white, 0.7);
    var f = i < 2 ? bold : reg;
    text(fit(vals[i] || '', 9.5, f, w - 14), x + 7, barTop + 32, 9.5, f, C.ink);
    if (i) box(x - 0.5, barTop, 1, 39, C.white);
    x += w;
  });
  box(M, barTop + 39, CW, 0.7, C.rule);

  // ── charges ──
  y = 268;
  itemsHeader();
  var lines = q.lines.filter(function(l){ return String(l.description).trim() || String(l.amount).trim(); });
  lines.forEach(function(l){
    var dl = wrap(l.description, 9.5, reg, DESC_W);
    if (!dl.length) dl = [''];
    var rowH = 16 + dl.length * 12.5;
    if (y + rowH > BOTTOM) { continuationPage(); itemsHeader(); }
    dl.forEach(function(s, i){ if (s) text(s, M + 8, y + 16 + i * 12.5, 9.5, reg, C.ink); });
    if (String(l.amount).trim()) right(_wqMoney(_wqCents(l.amount)), W - M - 8, y + 16, 9.5, reg, C.ink);
    box(M, y + rowH, CW, 0.6, C.rule);
    y += rowH;
  });

  // ── totals, terms, thank-you: kept together ──
  if (y + 170 > BOTTOM) continuationPage();
  var t = _wqTotals(q.lines);
  var lx = W - M - 250, labR = W - M - 118;
  right('Subtotal', labR, y + 20, 9.5, reg, C.ink);
  right(_wqMoney(t.sub), W - M - 8, y + 20, 9.5, reg, C.ink);
  right('HST (' + WQ_HST_PERCENT + '%)', labR, y + 36, 9.5, reg, C.ink);
  right(_wqMoney(t.hst), W - M - 8, y + 36, 9.5, reg, C.ink);
  box(lx, y + 44, W - M - lx, 1.6, C.green);
  var tw = trackedWidth('TOTAL', 11, bold, 1.2);
  tracked('TOTAL', labR - tw, y + 62, 11, bold, C.dark, 1.2);
  right(_wqMoney(t.total), W - M - 8, y + 62, 12, bold, C.dark);
  y += 84;

  box(M, y, CW, 42, C.tint);
  box(M, y, 3, 42, C.green);
  text('Price includes all labour, materials and equipment needed to complete the job.', M + 14, y + 17, 9, reg, C.ink);
  text('W.S.I.B. covered and insured.', M + 14, y + 31, 9, reg, C.ink);
  y += 42;

  var ty = 'THANK YOU FOR THE OPPORTUNITY TO QUOTE';
  var tyw = trackedWidth(ty, 8.4, bold, 1.8);
  tracked(ty, (W - tyw) / 2, y + 30, 8.4, bold, C.green, 1.8);

  // ── footer on every page: both company names, then how to reach us ──
  var pages = pdf.getPages();
  var dot = ['  •  ', reg, C.green];
  var footLines = [
    { top: H - 42, size: 8.4, parts: [['Jeff White Group', bold, C.green], dot, ["Jeff's Junk", bold, C.green]] },
    { top: H - 30, size: 7.6, parts: [['92 Davidson St. Unit 2, Barrie, ON  L4M 3R8', reg, C.muted], dot,
                                      ['705 734 1282', reg, C.muted], dot, ['barbara@jeffwhitegroup.com', reg, C.muted]] }
  ];
  pages.forEach(function(p, i){
    page = p;
    box(M, H - 56, CW, 0.6, C.rule);
    footLines.forEach(function(line){
      var lw = line.parts.reduce(function(sum, part){ return sum + width(part[0], line.size, part[1]); }, 0);
      var fx = (W - lw) / 2;
      line.parts.forEach(function(part){ text(part[0], fx, line.top, line.size, part[1], part[2]); fx += width(part[0], line.size, part[1]); });
    });
    if (pages.length > 1) right('Page ' + (i + 1) + ' of ' + pages.length, W - M, H - 18, 7.2, reg, C.muted);
  });

  return pdf.save();
}

// Page styles live with the page, not in style.css, so this feature stays in one file.
function _wqInjectStyle(){
  if (document.getElementById('wq-style')) return;
  var s = document.createElement('style');
  s.id = 'wq-style';
  s.textContent = ''
    + '.wq-row{display:flex;align-items:center;gap:16px;padding:14px 18px;margin-bottom:10px;cursor:pointer}'
    + '.wq-no{font-weight:700;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums;min-width:52px}'
    + '.wq-who{font-weight:700;font-size:15px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.wq-meta{font-size:12px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.wq-total{font-weight:700;font-size:15px;color:var(--text);font-variant-numeric:tabular-nums;margin-bottom:4px}'
    + '.wq-chip{font-size:11px;font-weight:700;border-radius:6px;padding:2px 9px}'
    + '.wq-chip.draft{background:var(--n3);color:var(--muted)}'
    + '.wq-chip.sent{background:var(--ok-soft);color:var(--ok-ink)}'
    + '.wq-edit{display:grid;grid-template-columns:minmax(340px,1fr) minmax(400px,1.1fr);gap:22px;align-items:start}'
    + '@media (max-width:1100px){.wq-edit{grid-template-columns:1fr}.wq-preview{position:static}}'
    + '.wq-sec{padding:18px 20px;margin-bottom:14px}'
    + '.wq-sec h3,.wq-preview-head h3{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);margin:0 0 12px}'
    + '.wq-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}'
    + '.wq-grid .full{grid-column:1/-1}'
    + '.wq-line{display:grid;grid-template-columns:1fr 132px 36px;gap:8px;align-items:start;margin-bottom:8px}'
    + '.wq-line textarea{min-height:64px;resize:vertical}'
    + '.wq-amt{position:relative}'
    + '.wq-amt span{position:absolute;left:12px;top:13px;color:var(--muted);pointer-events:none}'
    + '.wq-amt input{padding-left:26px;text-align:right;font-variant-numeric:tabular-nums}'
    + '.wq-amt.bad input{border-color:var(--bad);background:var(--bad-soft)}'
    + '.wq-kill{height:46px;border:1px solid var(--border);background:var(--surface);color:var(--muted);border-radius:var(--radius-sm);font-size:18px;cursor:pointer}'
    + '.wq-kill:hover{border-color:var(--bad);color:var(--bad)}'
    + '.wq-add{width:100%;margin-top:4px;padding:10px;border:1px dashed var(--border-strong);background:none;color:var(--green);font-weight:600;font-size:14px;border-radius:var(--radius-sm);cursor:pointer}'
    + '.wq-add:hover{border-color:var(--accent);background:var(--ok-soft)}'
    + '.wq-totals{display:grid;grid-template-columns:1fr auto;gap:6px 18px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border);font-size:14px;font-variant-numeric:tabular-nums;text-align:right}'
    + '.wq-totals .grand{font-weight:700;font-size:17px;color:var(--green)}'
    + '.wq-preview{position:sticky;top:16px}'
    + '.wq-preview-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px}'
    + '.wq-preview-head span{font-size:12px;color:var(--muted)}'
    + '.wq-note{background:var(--bad-soft);color:var(--bad-ink);border-radius:var(--radius-sm);padding:10px 12px;font-size:13px;margin-bottom:10px}'
    + '.wq-sheet{background:var(--n3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;display:flex;flex-direction:column;gap:12px;max-height:calc(100vh - 150px);overflow-y:auto;min-height:320px}'
    + '.wq-sheet canvas{display:block;width:100%;height:auto;background:#fff;box-shadow:0 1px 3px rgba(26,33,30,.18)}'
    + '.wq-sheet-wait{margin:auto;color:var(--muted);font-size:13px}';
  document.head.appendChild(s);
}
