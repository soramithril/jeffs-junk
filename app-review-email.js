// ── DESIGNED REVIEW EMAIL ───────────────────────────────────────────────────
// Jake, 2026-10-23: the Google review ask as a designed email (photo, stars, button),
// sent by the app itself through Microsoft 365 from hello@jeffsjunk.ca, so every one
// lands in that mailbox's Sent folder as the receipt. The plain mailto review email
// and the review text (app-review-text.js) carry on unchanged beside it.
//
// The words are editable (subject, heading, each paragraph) with the finished email
// beside the boxes; the stars, button, signature and footer are fixed. The layout and
// the sending live in the review-email edge function (supabase/functions/review-email),
// so the preview here is the exact email that goes out, built by the same code.
//
// Hidden behind Jake's switch until he and Sam confirm the look: jwg_app_settings
// 'review_email_on'. Off, only Jake (the developer tier) sees the button and the
// template; the edge function enforces the same rule on every send.
//
// Sending stamps review_asked_at and files a quote_correspondence row, exactly as the
// review text does, so the job drops off the Review follow-ups card.

var _reOn = false;            // Jake's switch
var _reJob = null;            // the job the editing window is open on
var _reTimer = null;          // preview typing pause
var _reSeq = 0;               // drops a preview that arrives after a newer one
var _reCountdown = null;      // the 10-second hold before sending
var RE_PARTS = [
  ['heading', 'Heading', 1],
  ['p1', 'First paragraph', 3],
  ['p2', 'Second paragraph', 3],
  ['tip', 'Green tip box (under the button)', 2],
  ['closing', 'Last paragraph', 2]
];
var RE_ERRORS = {
  not_signed_in: 'You\'re signed out. Sign in again and retry.',
  not_staff: 'Your login can\'t send emails.',
  switched_off: 'The review email is switched off.',
  no_email: 'This customer is marked "no emails".',
  no_address: 'There\'s no email address on this booking. Add one to the job first.',
  too_old: 'This job is more than two years old, so we can\'t email them (anti-spam law).',
  cancelled: 'This job was cancelled.',
  extra_jobs: 'Extra Jobs don\'t get review emails.',
  job_not_found: 'Couldn\'t find this job.',
  subject_missing: 'The subject can\'t be empty.',
  heading_missing: 'The heading can\'t be empty.',
  too_long: 'One of the boxes is too long.',
  microsoft_not_connected: 'Microsoft isn\'t connected yet, so nothing can send.',
  google_not_configured: 'The Google rating isn\'t set up.'
};

db.auth.onAuthStateChange(function(event, session){
  // Not awaited inside the callback: a database call there can stall the auth client.
  if(session) setTimeout(reLoadSwitch, 0);
});
async function reLoadSwitch(){
  var r = await db.from('jwg_app_settings').select('value').eq('key', 'review_email_on').maybeSingle();
  if(r.error){ console.warn('Review email switch load failed:', r.error.message); return; }
  _reOn = !!(r.data && r.data.value === true);
}

function reviewEmailVisible(){
  return currentRole === 'developer' || _reOn;
}

// The saved wording: one JSON object of the five boxes, kept in email_presets like
// every other template. A body that isn't one is a bug — say so, don't guess.
function reTemplateParts(){
  var parts = JSON.parse(getPreset('review_email').body);
  RE_PARTS.forEach(function(p){ if(typeof parts[p[0]] !== 'string') throw new Error('review_email template is missing ' + p[0]); });
  return parts;
}

// ── talking to the edge function ──
async function reCall(payload){
  var sess = await db.auth.getSession();
  var token = sess && sess.data && sess.data.session && sess.data.session.access_token;
  if(!token) throw new Error('not_signed_in');
  var r = await fetch(SUPABASE_URL + '/functions/v1/review-email', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
    body: JSON.stringify(payload)
  });
  var j = await r.json().catch(function(){ return {error: 'bad_response'}; });
  if(!r.ok || j.error){
    var e = new Error(j.error || ('HTTP ' + r.status));
    e.detail = j.detail || '';
    throw e;
  }
  return j;
}
function reErrorText(e){
  return RE_ERRORS[e.message] || ('Something went wrong: ' + e.message + (e.detail ? ' (' + e.detail + ')' : ''));
}

// ── the boxes, shared by the editing window ('m') and the Email Templates page ('t') ──
function reFieldsHtml(which, parts){
  var hooks = which === 't'
    ? function(id){ return ' onfocus="etplFocus(\'' + id + '\')" oninput="etplPreview()"'; }
    : function(){ return ' oninput="rePreviewSoon()"'; };
  return RE_PARTS.map(function(p){
    var id = 're-' + which + '-' + p[0];
    return '<div class="etpl-lbl etpl-lbl-sp">' + p[1] + '</div>'
      + '<textarea id="' + id + '" class="etpl-area re-area" rows="' + p[2] + '"' + hooks(id) + '>' + escHtml(parts[p[0]]) + '</textarea>';
  }).join('')
  + '<div class="etpl-hint" style="margin-top:10px">The photo, stars, button, signature and footer are the same on every email. Leave a paragraph empty to drop it.</div>';
}
function reReadParts(which){
  var parts = {};
  RE_PARTS.forEach(function(p){ parts[p[0]] = document.getElementById('re-' + which + '-' + p[0]).value; });
  return parts;
}
function reShow(frameId, msgId, html){
  document.getElementById(msgId).textContent = '';
  // srcdoc pages resolve against this page, so the cid: pictures become the site's own files.
  document.getElementById(frameId).srcdoc = html
    .replace('<head>', '<head><base target="_blank">')
    .replace(/src="cid:([^"]+)"/g, 'src="assets/email/$1"');
}
async function rePreviewInto(frameId, msgId, payload){
  var seq = ++_reSeq;
  try {
    var r = await reCall(payload);
    if(seq === _reSeq) reShow(frameId, msgId, r.html);
  } catch(e){
    if(seq === _reSeq) document.getElementById(msgId).textContent = '⚠ ' + reErrorText(e);
  }
}

// ── the Job details button ──
function reviewEmailBtnHtml(j){
  if(!reviewEmailVisible() || j.service === 'Extra Jobs') return '';
  return '<button class="btn btn-ghost" onclick="openReviewEmail(\'' + j.id + '\')" '
    + 'title="The designed Google review email, sent from hello@jeffsjunk.ca' + (_reOn ? '' : ' (only you can see this until you switch it on)') + '" '
    + 'style="justify-content:center;border-color:rgba(22,163,74,.45);color:var(--accent);font-weight:700">✉️ Review email</button>';
}

// ── the editing window ──
function reJobTooOld(j){
  var d = j.date || String(j.createdAt || '').slice(0, 10);
  return !!d && (Date.now() - Date.parse(d)) > 730 * 86400000;
}

async function openReviewEmail(jobId){
  var j = jobs.find(function(x){ return x.id === jobId; });
  if(!j){
    var r = await db.from('jobs').select('*').eq('job_id', jobId).single();
    if(r.error || !r.data){ toast('⚠ Could not load job ' + jobId); return; }
    j = dbToJob(r.data);
    jobs.push(j);
  }
  if(j.noEmail){ toast('⚠ ' + RE_ERRORS.no_email); return; }
  if(!jobEmail(j)){ toast('⚠ ' + RE_ERRORS.no_address); return; }
  if(reJobTooOld(j)){ toast('⚠ ' + RE_ERRORS.too_old); return; }
  reInjectStyle();
  _reJob = j;
  var tpl = reTemplateParts(), parts = {};
  RE_PARTS.forEach(function(p){ parts[p[0]] = fillEmailTemplate(tpl[p[0]], j); });
  closeM('detail-modal');
  document.body.insertAdjacentHTML('beforeend',
    '<div class="modal-overlay open" id="re-modal" onclick="if(event.target===this)reClose()">'
    + '<div class="re-box">'
      + '<div class="re-head"><div>'
        + '<div class="re-title">Review email</div>'
        + '<div class="re-to">To <b>' + escHtml(jobEmail(j)) + '</b> · from hello@jeffsjunk.ca</div>'
      + '</div><button class="btn btn-ghost btn-sm" onclick="reClose()" aria-label="Close">✕</button></div>'
      + '<div class="re-cols">'
        + '<div class="re-fields">'
          + '<div class="etpl-lbl">Subject line</div>'
          + '<input id="re-m-subject" class="etpl-input" type="text" oninput="rePreviewSoon()">'
          + reFieldsHtml('m', parts)
        + '</div>'
        + '<div class="re-prev"><iframe id="re-m-frame" class="re-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" title="The email as the customer will see it"></iframe>'
        + '<div id="re-m-msg" class="re-msg">Building the preview…</div></div>'
      + '</div>'
      + '<div class="re-foot"><span id="re-status" class="re-status">Goes out from hello@jeffsjunk.ca. A copy lands in its Sent folder.</span>'
        + '<button class="btn btn-ghost" onclick="reClose()">Cancel</button>'
        + '<button class="btn btn-primary" id="re-send" onclick="reSend()">Send email</button></div>'
    + '</div></div>');
  document.getElementById('re-m-subject').value = fillEmailTemplate(getPreset('review_email').subject, j);
  document.body.classList.add('modal-open');
  rePreview();
}

function rePreviewSoon(){
  clearTimeout(_reTimer);
  _reTimer = setTimeout(rePreview, 400);
}
function rePreview(){
  rePreviewInto('re-m-frame', 're-m-msg', Object.assign({mode: 'preview', service: _reJob.service}, reReadParts('m')));
}

// Closing the window during the countdown cancels the send.
function reClose(){
  clearInterval(_reCountdown); _reCountdown = null;
  clearTimeout(_reTimer);
  var m = document.getElementById('re-modal');
  if(m) m.remove();
  document.body.classList.remove('modal-open');
  _reJob = null;
}

function reLock(locked){
  document.querySelectorAll('#re-modal input, #re-modal textarea').forEach(function(el){ el.disabled = locked; });
}
function reStatus(text, bad){
  var s = document.getElementById('re-status');
  s.textContent = text;
  s.classList.toggle('bad', !!bad);
}

// Send holds for 10 seconds with Undo on the same button, like every other email in the
// app — an email can't be unsent, so this is the only Undo there is.
function reSend(){
  var btn = document.getElementById('re-send');
  if(_reCountdown){
    clearInterval(_reCountdown); _reCountdown = null;
    reLock(false);
    btn.textContent = 'Send email';
    reStatus('Not sent. Change anything you like and send again.');
    return;
  }
  var subject = document.getElementById('re-m-subject').value.trim();
  var parts = reReadParts('m');
  if(!subject){ reStatus(RE_ERRORS.subject_missing, true); return; }
  if(!parts.heading.trim()){ reStatus(RE_ERRORS.heading_missing, true); return; }
  var left = 10;
  reLock(true);
  btn.textContent = 'Undo (' + left + ')';
  reStatus('Sending in 10 seconds…');
  _reCountdown = setInterval(function(){
    left--;
    if(left > 0){ btn.textContent = 'Undo (' + left + ')'; reStatus('Sending in ' + left + ' seconds…'); return; }
    clearInterval(_reCountdown); _reCountdown = null;
    reDeliver(subject, parts);
  }, 1000);
}

async function reDeliver(subject, parts){
  var btn = document.getElementById('re-send');
  var j = _reJob;
  btn.disabled = true;
  btn.textContent = 'Sending…';
  reStatus('Sending…');
  try {
    var r = await reCall(Object.assign({mode: 'send', job_id: j.id, subject: subject}, parts));
  } catch(e){
    btn.disabled = false;
    btn.textContent = 'Send email';
    reLock(false);
    reStatus('⚠ Not sent. ' + reErrorText(e), true);
    return;
  }
  reMarkAsked(j, r.to, subject, parts);
  reClose();
  toast('✅ Review email sent to ' + r.to + '. The copy is in hello@jeffsjunk.ca\'s Sent folder.');
}

// The same two receipts as the review text: the job drops off the follow-ups card, and
// the client's history shows the email.
function reMarkAsked(j, to, subject, parts){
  var askedAt = new Date().toISOString();
  j.reviewAskedAt = askedAt;
  redrawReviewBtn(j);
  patchJob(j.id, {reviewAskedAt: askedAt}).then(renderReviewFollowups);
  if(!j.clientId) return;
  var sentBy = (currentUser && currentUser.displayName) ? currentUser.displayName : (currentUser && currentUser.email ? currentUser.email : 'unknown');
  var body = RE_PARTS.map(function(p){ return parts[p[0]].trim(); }).filter(Boolean).join('\n\n');
  db.from('quote_correspondence').insert({
    client_id: j.clientId, job_id: j.id, channel: 'email', to_email: to,
    subject: subject, body: body, service: j.service || null, sent_by: sentBy
  }).select().then(function(r){
    if(r.error){ console.warn('Review email record save failed:', r.error.message); return; }
    if(r.data && r.data.length) quoteCorrespondence.unshift(r.data[0]);
  });
}

// ── the Email Templates page tab ──
// app.js builds the page; for this template it hands over here to swap the single
// message box for the five boxes (kept in the hidden #etpl-body as JSON, so the page's
// own stash and Save carry it) and the text preview for the real email.
function reTplMount(){
  reInjectStyle();
  var body = document.getElementById('etpl-body');
  body.style.display = 'none';
  body.insertAdjacentHTML('afterend', reFieldsHtml('t', JSON.parse(body.value)));
  document.querySelector('.etpl-prev').innerHTML =
    '<div class="etpl-prev-h">Preview<span> — a sample customer, so you can see it filled in</span></div>'
    + (currentRole === 'developer'
      ? '<label class="re-switch"><input type="checkbox" id="re-switch"' + (_reOn ? ' checked' : '') + ' onchange="reSetSwitch(this.checked)"> '
        + '<b>Show the Review email button to everyone</b><span>Only you can see this switch. While it\'s off, only you see the button and this template.</span></label>'
      : '')
    + '<div class="etpl-prev-subj" id="etpl-prev-subj"></div>'
    + '<iframe id="re-t-frame" class="re-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" title="The email with a sample customer"></iframe>'
    + '<div id="re-t-msg" class="re-msg"></div>';
}
// The five boxes → the stored body. Runs before the page stashes it.
function reTplSync(){
  document.getElementById('etpl-body').value = JSON.stringify(reReadParts('t'));
}
function reTplPreview(){
  var j = _etplSample();
  document.getElementById('etpl-prev-subj').textContent = fillEmailTemplate(document.getElementById('etpl-subj').value, j);
  var tpl = reReadParts('t'), parts = {};
  RE_PARTS.forEach(function(p){ parts[p[0]] = fillEmailTemplate(tpl[p[0]], j); });
  clearTimeout(_reTimer);
  _reTimer = setTimeout(function(){
    rePreviewInto('re-t-frame', 're-t-msg', Object.assign({mode: 'preview', service: j.service}, parts));
  }, 400);
}

async function reSetSwitch(on){
  var r = await db.from('jwg_app_settings').upsert({key: 'review_email_on', value: on, updated_at: new Date().toISOString()}, {onConflict: 'key'});
  if(r.error){
    toast('⚠ Could not change the switch: ' + r.error.message);
    document.getElementById('re-switch').checked = _reOn;
    return;
  }
  _reOn = on;
  toast(on ? 'Review email switched on for everyone.' : 'Review email switched off. Only you can see it.');
}

function reInjectStyle(){
  if(document.getElementById('re-style')) return;
  document.head.insertAdjacentHTML('beforeend', '<style id="re-style">'
    + '.re-box{background:var(--surface);border-radius:14px;width:min(1180px,96vw);max-height:94vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)}'
    + '.re-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 22px 10px}'
    + '.re-title{font-size:18px;font-weight:800}'
    + '.re-to{font-size:13px;color:var(--muted);margin-top:2px;word-break:break-all}'
    + '.re-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:18px;padding:4px 22px 12px;overflow:auto;min-height:0}'
    + '.re-area{min-height:0;resize:vertical}'
    + '.re-frame{width:100%;height:1150px;border:1px solid var(--border);border-radius:10px;background:#eef0ec}'
    + '.re-prev .re-frame{height:calc(94vh - 190px);min-height:420px}'
    + '.re-msg{font-size:13px;color:var(--muted);margin-top:6px}'
    + '.re-foot{display:flex;align-items:center;gap:10px;padding:12px 22px 18px;border-top:1px solid var(--border)}'
    + '.re-status{flex:1;font-size:13px;color:var(--muted)}'
    + '.re-status.bad{color:var(--danger,#dc2626);font-weight:700}'
    + '.re-switch{display:block;margin:0 0 12px;padding:10px 12px;border:1.5px dashed rgba(22,163,74,.5);border-radius:10px;font-size:13px;cursor:pointer}'
    + '.re-switch span{display:block;color:var(--muted);margin:2px 0 0 22px}'
    + '@media (max-width:900px){.re-cols{grid-template-columns:1fr}.re-prev .re-frame{height:900px}.re-foot{flex-wrap:wrap}.re-status{flex-basis:100%}}'
    + '</style>');
}
