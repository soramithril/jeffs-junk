// ─── FB PICKUP: "AT THE DOOR" BOX ON JOB DETAILS ───
// The crew's iPad page (fb-pickup.html) saves what actually left the house, and the
// customer's signature, into fb_door_checks. The office's booked list on the job is never
// changed by it (Jake, 2026-10-16: "theres 2, one that they fill out and the one from the
// office ... kelly can compare in office"), so this box shows the two side by side.
// Depends on app.js globals: db, escHtml, fd, furnitureCustomerPays (furniture-pricing.js).

async function renderFbDoorInDetail(j){
  var wrap = document.getElementById('fb-door-section');
  if (!wrap) return;
  var r = await db.from('fb_door_checks').select('*').eq('job_id', j.id).maybeSingle();
  if (r.error) throw new Error('fb_door_checks: ' + r.error.message);
  if (!r.data) { wrap.innerHTML = ''; return; }
  var c = r.data;
  function money(n){ return '$' + Number(n).toFixed(2); }
  var bookedFee = 0, bookedRec = 0;
  c.lines.forEach(function(l){ bookedFee += l.booked * l.fee; bookedRec += l.booked * l.val; });
  var bookedPay = furnitureCustomerPays(bookedFee, j.city).pay;
  var diffs = c.lines.filter(function(l){ return l.qty !== l.booked; }).length;
  var when = new Date(c.finished_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  var rows = c.lines.map(function(l){
    var st = l.added ? '<span style="color:#7c3aed;font-weight:700">Added at the door</span>'
      : l.qty === 0 ? '<span style="color:var(--bad);font-weight:700">Not taken</span>'
      : l.qty !== l.booked ? '<span style="color:var(--warn);font-weight:700">Changed</span>' : '';
    var bg = l.qty !== l.booked ? 'background:rgba(234,179,8,.08);' : '';
    return '<tr style="' + bg + 'border-top:1px solid var(--border)">'
      + '<td style="padding:6px 8px">' + escHtml(l.name) + '</td>'
      + '<td style="padding:6px 8px;text-align:right">' + l.booked + '</td>'
      + '<td style="padding:6px 8px;text-align:right;font-weight:700">' + l.qty + '</td>'
      + '<td style="padding:6px 8px">' + st + '</td></tr>';
  }).join('');

  wrap.innerHTML = '<div class="detail-section" style="border:1px solid rgba(124,58,237,.35);background:rgba(124,58,237,.04)">'
    + '<div class="detail-section-title" style="color:#7c3aed">🚚 At the door <span style="font-weight:400;color:var(--muted);font-size:12px">— signed by '
    + escHtml(c.signed_name) + ', ' + escHtml(when) + '</span></div>'
    + '<div style="font-size:13px;margin-bottom:8px;font-weight:700;color:' + (diffs ? 'var(--warn)' : 'var(--accent)') + '">'
    + (diffs ? diffs + ' line' + (diffs === 1 ? '' : 's') + ' differ from the booked list' : 'Matches the booked list') + '</div>'
    + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums">'
    + '<tr style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px"><th style="text-align:left;padding:4px 8px">Item</th><th style="text-align:right;padding:4px 8px">Booked</th><th style="text-align:right;padding:4px 8px">At door</th><th></th></tr>'
    + rows + '</table></div>'
    + '<div class="detail-grid" style="margin-top:10px">'
    + '<div class="detail-item"><label>Customer pays (booked)</label><span>' + money(bookedPay) + '</span></div>'
    + '<div class="detail-item"><label>Customer pays (signed for)</label><span style="font-weight:800;color:var(--accent)">' + money(c.pay) + ' + ' + money(c.hst) + ' HST</span></div>'
    + '<div class="detail-item"><label>Receipt value (booked)</label><span>' + money(bookedRec) + '</span></div>'
    + '<div class="detail-item"><label>Receipt value (at door)</label><span style="font-weight:800;color:#0d6efd">' + money(c.receipt) + '</span></div>'
    + '</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-top:4px">' + escHtml(c.pay_note) + '</div>'
    + '<div style="margin-top:10px"><img src="' + escHtml(c.signature) + '" alt="Customer signature" style="max-width:280px;width:100%;background:#fff;border:1px solid var(--border);border-radius:8px"></div>'
    + '</div>';
}
