// Furniture Bank Toronto collections (Kelly's suggestion, 2026-10-09).
//
// Our Furniture Pickup jobs go to the storage unit we rent. Furniture Bank Toronto's
// truck collects from there on dates they book with us, about every two weeks. The
// office enters those dates here; nothing is worked out from jobs.
//
// On the dashboard, in the Today's Jobs card (#dash-fb-collect), for the date the
// dashboard is showing: a line when a collection falls on that date, otherwise a chip
// with the next booked collection. Either one opens the list to add, move or remove dates.

var _fbcDates = [];   // collections from the earlier of today / the shown date onward, soonest first

function _fbcDay(dateS){
  return new Date(dateS + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}

async function _fbcLoad(fromS){
  var r = await db.from('fb_collections').select('id,collect_date,note').gte('collect_date', fromS).order('collect_date');
  if(r.error) throw new Error('Could not load Furniture Bank collections: ' + r.error.message);
  _fbcDates = r.data;
}

// Called by refreshDashJobs / renderDash each time they redraw Today's Jobs.
async function renderFbCollect(dateS){
  var today = todayStr();
  await _fbcLoad(dateS < today ? dateS : today);
  var el = document.getElementById('dash-fb-collect');
  var on = _fbcDates.find(function(d){ return d.collect_date === dateS; });
  if(on){
    el.innerHTML = '<div class="fbc-line" onclick="openFbCollections()" title="Furniture Bank Toronto collection dates">'
      + '<span class="fbc-icon">🚚</span>'
      + '<span><strong>Furniture Bank Toronto</strong> collecting from the storage unit'
      + (dateS === today ? ' today' : ' on ' + _fbcDay(dateS)) + '</span>'
      + (on.note ? '<span class="fbc-note">' + escHtml(on.note) + '</span>' : '')
      + '</div>';
    return;
  }
  var next = _fbcDates.find(function(d){ return d.collect_date >= today; });
  el.innerHTML = '<button type="button" class="fbc-chip" onclick="openFbCollections()" title="Furniture Bank Toronto collection dates">'
    + '🚚 ' + (next ? 'Next FB Toronto collection: <strong>' + _fbcDay(next.collect_date) + '</strong>'
                    : 'No FB Toronto collection booked — add a date')
    + '</button>';
}

function _fbcRefreshDash(){
  var dp = document.getElementById('dash-bin-date');
  renderFbCollect(dp && dp.value ? dp.value : todayStr());
}

async function openFbCollections(){
  var modal = document.getElementById('fbc-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'fbc-modal';
    modal.className = 'modal-overlay';
    modal.onclick = function(e){ if(e.target === modal) closeM('fbc-modal'); };
    document.body.appendChild(modal);
  }
  await _fbcLoad(todayStr());
  var rows = _fbcDates.map(function(d){
    return '<div class="fbc-row">'
      + '<input type="date" id="fbc-d-' + d.id + '" value="' + d.collect_date + '">'
      + '<input type="text" id="fbc-n-' + d.id + '" value="' + escHtml(d.note) + '" placeholder="Note (tentative, confirmed, time…)">'
      + '<button class="btn btn-ghost btn-sm" onclick="fbcSave(' + d.id + ')">Save</button>'
      + '<button class="btn btn-ghost btn-sm fbc-remove" onclick="fbcRemove(' + d.id + ')">Remove</button>'
      + '</div>';
  }).join('');
  modal.innerHTML = '<div class="modal modal-md" style="--modal-w:min(96vw,620px)">'
    + '<div class="modal-header">'
      + '<div class="modal-title">🚚 Furniture Bank Toronto collections</div>'
      + '<button class="modal-close" onclick="closeM(\'fbc-modal\')">&times;</button>'
    + '</div>'
    + '<p class="fbc-help">The days Furniture Bank Toronto\'s truck collects from our storage unit.</p>'
    + (rows || '<p class="fbc-help">No upcoming collections booked.</p>')
    + '<div class="fbc-row fbc-add">'
      + '<input type="date" id="fbc-new-d">'
      + '<input type="text" id="fbc-new-n" placeholder="Note (tentative, confirmed, time…)">'
      + '<button class="btn btn-primary btn-sm" onclick="fbcAdd()">Add date</button>'
    + '</div>'
    + '</div>';
  modal.classList.add('open');
}

function _fbcDone(r, what){
  if(r.error){ toast('⚠ ' + what + ' failed: ' + r.error.message, 'error'); return false; }
  openFbCollections();
  _fbcRefreshDash();
  return true;
}

async function fbcAdd(){
  var d = document.getElementById('fbc-new-d').value;
  if(!d){ toast('⚠ Pick a date first.', 'error'); return; }
  var note = document.getElementById('fbc-new-n').value.trim();
  var by = currentUser.displayName || currentUser.email.split('@')[0];
  var r = await db.from('fb_collections').insert({ collect_date:d, note:note, created_by:by });
  if(_fbcDone(r, 'Adding the date')) toast('FB Toronto collection added for ' + _fbcDay(d) + '.');
}

async function fbcSave(id){
  var d = document.getElementById('fbc-d-' + id).value;
  if(!d){ toast('⚠ A collection needs a date.', 'error'); return; }
  var note = document.getElementById('fbc-n-' + id).value.trim();
  var r = await db.from('fb_collections').update({ collect_date:d, note:note }).eq('id', id);
  if(_fbcDone(r, 'Saving')) toast('Saved — ' + _fbcDay(d) + '.');
}

async function fbcRemove(id){
  var r = await db.from('fb_collections').delete().eq('id', id);
  if(_fbcDone(r, 'Removing the date')) toast('Collection date removed.');
}
