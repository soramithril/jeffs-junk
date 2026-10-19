// ── REVIEW REQUEST BY TEXT ──────────────────────────────────────────────────
// Jake, 2026-10-19 (out of the Jobber comparison): the review ask should be a text,
// not an email — people answer texts. The app has no texting service, so it hands
// the finished message to the phone's Messages app and the office hits send:
//   - on a phone: the Text button opens Messages straight away with the number and
//     the message filled in (an sms: link, the same way the Call buttons use tel:);
//   - on a PC: the same sms: link drawn as a QR code (qrcode.js, vendored). Point the
//     iPhone camera at it, tap the Messages banner, send. No app, no account, no cost.
// The wording lives in the "Review Text" template on Email Templates. It asks the
// customer to say what we did and where — a review that reads "bin rental in Barrie"
// is what Google ranks us for (the website SEO work said the same).
// Sending stamps review_asked_at exactly as the email path does, so the job drops off
// the Review follow-ups card, and files a quote_correspondence row with channel
// 'text' (migration 20261019) so the client's history shows the text beside the
// emails. Undo puts the job back on the list; the filed row stays, like email.

var _rtJobId = null;

// The number a text goes to: the booking's phone first (it was typed for this job),
// the client record as a backstop — the same order openEmailModal uses for email.
function reviewTextPhone(j){
  var raw = j.phone || (j.phones && j.phones[0] && j.phones[0].num) || '';
  if(!raw && j.clientId){
    var cl = clients.find(function(c){ return c.cid === j.clientId; });
    if(cl) raw = cl.phone || (cl.phones && cl.phones[0] && cl.phones[0].num) || '';
  }
  return raw;
}

// "+17055551234" for an sms: link, or '' when the number is too short to be one.
function reviewTextDigits(raw){
  var d = String(raw || '').replace(/\D/g, '');
  if(d.length === 10) d = '1' + d;
  if(d.length !== 11 || d.charAt(0) !== '1') return '';
  return '+' + d;
}

// "?&body=" rather than "&body=" or "?body=": iPhones read the first, Android the
// second, and both accept this form.
function reviewSmsUrl(phone, body){
  return 'sms:' + phone + '?&body=' + encodeURIComponent(body);
}

function reviewTextBody(j){
  return fillEmailTemplate(getPreset('review_text').body, j);
}

// The Job details button. Separate from reviewBtnHtml on purpose: that one swaps
// itself in place by id, and two buttons under one id would double up on redraw.
function reviewTextBtnHtml(j){
  if(j.service === 'Extra Jobs') return '';
  return '<button class="btn btn-ghost" onclick="openReviewText(\'' + j.id + '\')" '
    + 'title="Opens Messages on a phone, or a QR code to scan from this screen" '
    + 'style="justify-content:center;border-color:rgba(37,99,235,.4);color:#2563eb;font-weight:700">💬 Text review request</button>';
}

async function openReviewText(jobId){
  var j = jobs.find(function(x){ return x.id === jobId; });
  if(!j){
    // Not in memory (the Review follow-ups card lists jobs weeks old) — fetch it.
    var r = await db.from('jobs').select('*').eq('job_id', jobId).single();
    if(r.error || !r.data){ toast('⚠ Could not load job ' + jobId); return; }
    j = dbToJob(r.data);
    jobs.push(j);
  }
  var phone = reviewTextDigits(reviewTextPhone(j));
  var body = reviewTextBody(j);
  if(isMobileView()){
    if(!phone){ toast('⚠ No mobile number on this booking — add one to the job first.'); return; }
    // Stamp first: Messages takes the screen and the tab may sleep behind it.
    markReviewTexted(j, phone, body);
    window.location.href = reviewSmsUrl(phone, body);
    return;
  }
  _rtJobId = j.id;
  closeM('detail-modal');
  document.getElementById('rt-phone').value = phone;
  document.getElementById('rt-body').value = body;
  document.getElementById('rt-who').textContent = j.name || j.id;
  rtRedraw();
  openM('review-text-modal');
}

// Redrawn on every keystroke in either box, so the code on screen is always the
// message on screen. A number too short for a text gets a note instead of a code.
function rtRedraw(){
  var phone = reviewTextDigits(document.getElementById('rt-phone').value);
  var body = document.getElementById('rt-body').value;
  var host = document.getElementById('rt-qr');
  if(!phone){
    host.innerHTML = '<div style="padding:40px 16px;text-align:center;color:var(--muted);font-size:13px;font-weight:600">Enter a 10-digit mobile number to get a code.</div>';
    return;
  }
  var q = qrcode(0, 'L');
  q.addData(reviewSmsUrl(phone, body));
  q.make();
  host.innerHTML = q.createSvgTag({cellSize:4, margin:2, scalable:true});
}

function rtDone(){
  var j = jobs.find(function(x){ return x.id === _rtJobId; });
  if(!j) throw new Error('rtDone: job ' + _rtJobId + ' not in memory');
  var phone = reviewTextDigits(document.getElementById('rt-phone').value);
  if(!phone){ toast('⚠ That isn\'t a mobile number we can text.'); return; }
  markReviewTexted(j, phone, document.getElementById('rt-body').value.trim());
  closeM('review-text-modal');
}

function markReviewTexted(j, phone, body){
  var askedAt = new Date().toISOString();
  j.reviewAskedAt = askedAt;
  redrawReviewBtn(j);
  // Chained, not fired-and-forgotten: the follow-ups card re-queries the database.
  patchJob(j.id, {reviewAskedAt:askedAt}).then(renderReviewFollowups);
  if(j.clientId){
    var sentBy = (currentUser && currentUser.displayName) ? currentUser.displayName : (currentUser && currentUser.email ? currentUser.email : 'unknown');
    db.from('quote_correspondence').insert({
      client_id: j.clientId, job_id: j.id, channel:'text', to_phone: phone,
      subject:'Review request (text)', body: body, service: j.service || null, sent_by: sentBy
    }).select().then(function(r){
      if(r.error){ console.warn('Review text record save failed:', r.error.message); return; }
      if(r.data && r.data.length) quoteCorrespondence.unshift(r.data[0]);
    });
  }
  undoToast('Review text ready for ' + (j.name || j.id) + ' — marked as asked.', function(){
    j.reviewAskedAt = '';
    patchJob(j.id, {reviewAskedAt:null}).then(function(){
      renderReviewFollowups();
      redrawReviewBtn(j);
      toast('Put back on the review follow-up list.');
    });
  });
}
