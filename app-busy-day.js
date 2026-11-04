// ── IS THE DAY FULL? Junk removal hours per day (v716) ────────────────────────
// A junk day is full at 8 hours booked IN TOTAL, however many crews are out (Jake,
// 2026-11-03). On the booking form, a Junk Removal with a date shows how many hours
// that day already has; when this job takes the day past 8, the line becomes a big red
// bar. It only warns: anyone can still book a full day (no manager override, by Jake's
// decision on 2026-10-30).
//
// Counts Junk Removal only. Quote visits never carry hours (the form hides the box for
// them), and Extra Jobs are JWG's own day-length work.
//
// The estimated duration became required on Junk Removal at the same time (saveJob in
// app.js), because 102 of 224 junk removals from June to November 2026 had none, so the
// count would have been half the real work.
//
// Nothing here writes anything. The service is picked by buttons that set a hidden
// input, so there is no event to listen for; the hours box itself (#junk-duration-wrap)
// is shown and hidden on every service change and edit-load, so that is what is watched.

var BUSY_FULL_MIN = 8 * 60;
var _busySeq = 0;   // the newest check; an older answer arriving late is dropped

function _busyH(min){ return String(Math.round(min / 30) / 2); }   // to the half hour

async function busyDayCheck(){
  var box = document.getElementById('busy-day');
  var svc = document.getElementById('f-svc').value;
  var day = document.getElementById('f-junk-date').value;
  document.getElementById('est-dur-req').style.display = svc === 'Junk Removal' ? '' : 'none';
  if(document.getElementById('f-est-duration').value) clearErr('f-est-duration');   // filled in: the "missing" note goes at once
  var seq = ++_busySeq;
  if(svc !== 'Junk Removal' || !day){ box.hidden = true; return; }
  var r = await db.from('jobs').select('job_id,est_duration_min').eq('service', 'Junk Removal').neq('status', 'Cancelled')
    .or('junk_date.eq.' + day + ',and(junk_date.is.null,date.eq.' + day + ')');
  if(seq !== _busySeq) return;
  if(r.error) throw new Error('Busy day: could not count the junk hours for ' + day + ': ' + r.error.message);
  var others = r.data.filter(function(j){ return j.job_id !== editId; });   // the job being edited counts as "this job"
  var booked = others.reduce(function(t, j){ return t + (j.est_duration_min || 0); }, 0);
  var unset = others.filter(function(j){ return !j.est_duration_min; }).length;
  var mine = parseInt(_estDurToMinutes('Junk Removal'), 10) || 0;
  var total = booked + mine;
  var name = new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' });
  var jobsWord = others.length + ' other junk removal' + (others.length === 1 ? '' : 's')
    + (unset ? ', ' + unset + ' with no hours yet' : '');
  var full = total > BUSY_FULL_MIN;
  box.className = 'busy-day' + (full ? ' busy-full' : '');
  box.innerHTML = full
    ? '<b>⚠ ' + escHtml(name) + ' is full: ' + _busyH(total) + ' of 8 hours with this job.</b>'
      + '<span>' + _busyH(booked) + ' hours are already booked (' + jobsWord + '). You can still save it.</span>'
    : '<b>' + escHtml(name) + ': ' + _busyH(booked) + ' of 8 hours of junk booked'
      + (mine ? ', ' + _busyH(total) + ' with this job' : '') + (total === BUSY_FULL_MIN ? '. This fills the day.' : '') + '</b>'
      + (others.length ? '<span>' + jobsWord + '</span>' : '<span>Nothing else booked that day.</span>');
  box.hidden = false;
}

(function(){
  var wrap = document.getElementById('junk-duration-wrap');
  var box = document.createElement('div');
  box.id = 'busy-day';
  box.className = 'busy-day';
  box.setAttribute('role', 'status');
  box.hidden = true;
  wrap.appendChild(box);
  new MutationObserver(function(){ busyDayCheck(); }).observe(wrap, { attributes:true, attributeFilter:['style'] });
  // And each time the booking form opens: the box may already have been showing.
  var modal = document.getElementById('job-modal');
  new MutationObserver(function(){ if(modal.classList.contains('open')) busyDayCheck(); }).observe(modal, { attributes:true, attributeFilter:['class'] });
  ['f-junk-date', 'f-est-duration'].forEach(function(id){
    var el = document.getElementById(id);
    el.addEventListener('input', busyDayCheck);
    el.addEventListener('change', busyDayCheck);
  });
  // The 30m / 1h / ... buttons set the box's value directly, which fires no event.
  var setDur = setEstDuration;
  setEstDuration = function(min){ setDur(min); busyDayCheck(); };
})();
