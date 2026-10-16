/* Learn City — Fees tab (loaded after app.js; uses its call(), state, $ and escapeHtml).
   Bursar: view + edit. Head of IT / Governors / Head of School: view only.
   The server decides who may do what; this file only hides buttons that would be refused. */
'use strict';

var FIN = {
  sub: 'overview', session: '', term: '', canEdit: false, sessions: [],
  overview: null, students: [], filter: { query: '', className: '', owingOnly: false, status: '' },
  ledger: null, report: null, reportRange: null, schedule: null, invoicePreview: null, wired: false
};

function finMoney(n) {
  n = Number(n) || 0;
  var s = (Math.round(Math.abs(n) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '₦' + s;
}
function finPct(a, b) { return b > 0 ? Math.round((a / b) * 100) + '%' : '0%'; }
function finTodayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function finCsvCell(v) {
  var s = String(v === null || v === undefined ? '' : v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;           // stop a name or note being read as a spreadsheet formula
  return '"' + s.replace(/"/g, '""') + '"';
}
function finDownloadCsv(name, head, rows) {
  var lines = [head.map(finCsvCell).join(',')];
  rows.forEach(function (r) { lines.push(r.map(finCsvCell).join(',')); });
  var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name + '_' + finTodayStr() + '.csv';
  a.click();
}
function finMsg(text, good) {
  var el = $('finMsg'); if (!el) return;
  el.textContent = text || '';
  el.className = good ? 'success' : 'error';
}
function finSet(id, html) { var el = $(id); if (el) el.innerHTML = html; }

/* ---------- entry ---------- */

function initFeesTab() {
  FIN.canEdit = state.role === 'Bursar';
  $('feesTabBtn').classList.remove('hidden');
  if (!FIN.wired) {
    FIN.wired = true;
    $('feesTab').addEventListener('click', finOnClick);
    $('feesTab').addEventListener('change', finOnChange);
    $('feesTab').addEventListener('input', finOnInput);
  }
  finBuildShell();
  finLoadOverview();
}

function finBuildShell() {
  var subs = [['overview', 'Overview'], ['students', 'Students'], ['report', 'Payments report'], ['schedule', FIN.canEdit ? 'Fee schedule & invoices' : 'Fee schedule']];
  $('feesTab').innerHTML =
    '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px">' +
    '<strong id="finTermLabel">Fees</strong>' +
    '<span style="padding:2px 10px;border-radius:12px;font-size:13px;' + (FIN.canEdit ? 'background:#e6f4ea;color:#1b5e20' : 'background:#fff3e0;color:#8a4b00') + '">' +
    (FIN.canEdit ? 'Bursar — can edit' : 'View only') + '</span></div>' +
    '<div id="finSubBar" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">' +
    subs.map(function (s) { return '<button type="button" class="finSubBtn" data-fin-sub="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>' +
    '<p id="finMsg" class="error"></p><div id="finConfirm"></div><div id="finBody"><p class="subtitle">Loading...</p></div>';
  finMarkSub();
}
function finMarkSub() {
  document.querySelectorAll('.finSubBtn').forEach(function (b) {
    var on = b.getAttribute('data-fin-sub') === FIN.sub;
    b.style.fontWeight = on ? 'bold' : 'normal';
    b.style.background = on ? '#004AAD' : '#fff';
    b.style.color = on ? '#fff' : '#004AAD';
    b.style.border = '1px solid #004AAD'; b.style.borderRadius = '6px'; b.style.padding = '6px 12px';
  });
}
function finShowSub(name) {
  FIN.sub = name; FIN.ledger = null; finMsg(''); finSet('finConfirm', ''); finMarkSub();
  if (name === 'overview') finLoadOverview();
  else if (name === 'students') finLoadStudents();
  else if (name === 'report') finRenderReport();
  else finLoadSchedule();
}

/* ---------- overview ---------- */

function finTermPicker() {
  var opts = FIN.sessions.map(function (s) {
    var v = s.session + '|' + s.term;
    return '<option value="' + escapeHtml(v) + '"' + (v === FIN.session + '|' + FIN.term ? ' selected' : '') + '>' + escapeHtml(s.session + ' — ' + s.term) + '</option>';
  }).join('');
  return '<select id="finTermSelect" aria-label="Session and term">' + opts + '</select>';
}

function finLoadOverview() {
  finSet('finBody', '<p class="subtitle">Loading...</p>');
  call('finGetOverview', { session: FIN.session, term: FIN.term }).then(function (r) {
    if (!r || !r.success) { finSet('finBody', ''); finMsg((r && r.error) || 'Could not load fee records.'); return; }
    FIN.overview = r; FIN.session = r.session; FIN.term = r.term; FIN.sessions = r.sessions || []; FIN.canEdit = !!r.canEdit;
    $('finTermLabel').textContent = 'Fees — ' + r.session + ', ' + r.term;
    finRenderOverview();
  }).catch(function () { finSet('finBody', ''); finMsg('Could not reach the server.'); });
}

function finRenderOverview() {
  var o = FIN.overview, t = o.total;
  var card = function (label, val, cls) {
    return '<div class="statCard"><span class="statLabel">' + label + '</span><span class="statValue ' + (cls || '') + '">' + val + '</span></div>';
  };
  var rows = o.classes.map(function (c) {
    return '<tr><td>' + escapeHtml(c.name) + '</td><td>' + c.students + '</td><td>' + finMoney(c.termCharged) + '</td><td>' + finMoney(c.termPaid) +
      '</td><td>' + finMoney(c.outstanding) + '</td><td>' + c.owing + '</td></tr>';
  }).join('');
  var secs = o.sections.map(function (c) {
    return '<tr><td>' + escapeHtml(c.name) + '</td><td>' + c.students + '</td><td>' + finMoney(c.termCharged) + '</td><td>' + finMoney(c.termPaid) +
      '</td><td>' + finMoney(c.outstanding) + '</td><td>' + c.owing + '</td></tr>';
  }).join('');
  var recent = o.recentPayments.length ? o.recentPayments.map(function (p) {
    return '<tr><td>' + escapeHtml(p.date) + '</td><td>' + escapeHtml(p.studentId) + '</td><td>' + finMoney(p.amount) + '</td><td>' + escapeHtml(p.method) +
      '</td><td>' + escapeHtml(p.receiptNo) + '</td></tr>';
  }).join('') : '<tr><td colspan="5" class="subtitle">No payments recorded here yet.</td></tr>';
  var th = '<th>Students</th><th>Charged (net)</th><th>Collected</th><th>Outstanding (all terms)</th><th>Owing</th>';
  finSet('finBody',
    '<div style="margin-bottom:8px">' + finTermPicker() + '</div>' +
    '<div class="statGrid">' +
    card('Charged this term (after discounts)', finMoney(t.termCharged)) + card('Collected this term', finMoney(t.termPaid), 'good') +
    card('Outstanding this term', finMoney(t.termOutstanding), 'bad') + card('Collection rate', finPct(t.termPaid, t.termCharged)) +
    card('Outstanding, all terms', finMoney(t.outstanding), 'bad') + card('Students owing', t.owing + ' of ' + t.students) + '</div>' +
    '<h3>By section</h3><div style="overflow-x:auto"><table class="finTable"><thead><tr><th>Section</th>' + th + '</tr></thead><tbody>' + secs + '</tbody></table></div>' +
    '<h3>By class</h3><button type="button" data-fin="dl-classes">Download CSV</button>' +
    '<div style="overflow-x:auto"><table class="finTable"><thead><tr><th>Class</th>' + th + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<h3>Latest payments</h3><div style="overflow-x:auto"><table class="finTable"><thead><tr><th>Date</th><th>Student ID</th><th>Amount</th><th>Method</th><th>Receipt</th></tr></thead><tbody>' + recent + '</tbody></table></div>' +
    '<p class="subtitle">"Outstanding" includes balances brought forward from earlier terms. Payments recorded when fees were first imported are not listed as recent payments.</p>');
}

/* ---------- students ---------- */

function finLoadStudents() {
  finSet('finBody', '<p class="subtitle">Loading...</p>');
  call('finListStudents', { session: FIN.session, term: FIN.term }).then(function (r) {
    if (!r || !r.success) { finSet('finBody', ''); finMsg((r && r.error) || 'Could not load students.'); return; }
    FIN.students = r.students; FIN.canEdit = !!r.canEdit; finRenderStudents();
  }).catch(function () { finSet('finBody', ''); finMsg('Could not reach the server.'); });
}

function finFilteredStudents() {
  var f = FIN.filter, q = f.query.toLowerCase();
  return FIN.students.filter(function (s) {
    if (f.className && s.className !== f.className) return false;
    if (f.status && s.status !== f.status) return false;
    if (f.owingOnly && s.balance <= 0) return false;
    if (q && s.name.toLowerCase().indexOf(q) === -1 && s.id.toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
}

function finRenderStudents() {
  var classes = []; FIN.students.forEach(function (s) { if (classes.indexOf(s.className) === -1) classes.push(s.className); });
  classes.sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
  finSet('finBody',
    '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
    '<input id="finSearch" type="search" placeholder="Search name or ID" value="' + escapeHtml(FIN.filter.query) + '" style="flex:1;min-width:160px">' +
    '<select id="finClassFilter"><option value="">All classes</option>' + classes.map(function (c) { return '<option' + (c === FIN.filter.className ? ' selected' : '') + '>' + escapeHtml(c) + '</option>'; }).join('') + '</select>' +
    '<select id="finStatusFilter"><option value="">Active and withdrawn</option><option' + (FIN.filter.status === 'Active' ? ' selected' : '') + '>Active</option><option' + (FIN.filter.status === 'Withdrawn' ? ' selected' : '') + '>Withdrawn</option></select>' +
    '<label class="check"><input type="checkbox" id="finOwingOnly"' + (FIN.filter.owingOnly ? ' checked' : '') + '> Owing only</label>' +
    '<button type="button" data-fin="dl-students">Download CSV</button></div>' +
    '<div id="finStudentList"></div>');
  finRenderStudentRows();
}

function finRenderStudentRows() {
  var list = finFilteredStudents();
  var tot = list.reduce(function (a, s) { return a + s.balance; }, 0);
  var rows = list.map(function (s) {
    return '<tr data-fin-student="' + escapeHtml(s.id) + '" style="cursor:pointer"><td>' + escapeHtml(s.name) + (s.status === 'Withdrawn' ? ' <em>(withdrawn)</em>' : '') +
      '</td><td>' + escapeHtml(s.className) + '</td><td>' + finMoney(s.termBalance) + '</td><td><strong style="color:' + (s.balance > 0 ? '#b00020' : '#1b7a3a') + '">' + finMoney(s.balance) + '</strong></td>' +
      '<td>' + (s.hasEmail ? '' : '<span title="No parent email on file" style="color:#8a4b00">no email</span>') + '</td></tr>';
  }).join('') || '<tr><td colspan="5" class="subtitle">No students match.</td></tr>';
  finSet('finStudentList', '<p class="subtitle">' + list.length + ' student' + (list.length === 1 ? '' : 's') + ' — total outstanding ' + finMoney(tot) + '</p>' +
    '<div style="overflow-x:auto"><table class="finTable"><thead><tr><th>Student</th><th>Class</th><th>This term</th><th>Balance, all terms</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>');
}

/* ---------- one student ---------- */

function finOpenLedger(id, keepMsg) {
  if (!keepMsg) finMsg('');
  finSet('finConfirm', '');
  finSet('finBody', '<p class="subtitle">Loading...</p>');
  call('finGetStudentLedger', { studentId: id }).then(function (r) {
    if (!r || !r.success) { finMsg((r && r.error) || 'Could not load this student.'); finRenderStudents(); return; }
    FIN.ledger = r; FIN.canEdit = !!r.canEdit; finRenderLedger();
  }).catch(function () { finMsg('Could not reach the server.'); });
}

function finRenderLedger() {
  var r = FIN.ledger, s = r.student, E = FIN.canEdit;
  var byTerm = {};
  r.lines.forEach(function (l) { var k = l.session + '|' + l.term; (byTerm[k] = byTerm[k] || []).push(l); });
  var termHtml = r.terms.map(function (t) {
    var k = t.session + '|' + t.term, lines = byTerm[k] || [];
    return '<details' + (k === FIN.session + '|' + FIN.term ? ' open' : '') + '><summary><strong>' + escapeHtml(t.session + ' ' + t.term) + '</strong> — charged ' + finMoney(t.charged) +
      ', discounts ' + finMoney(t.discounts) + ', paid ' + finMoney(t.paid) + ', balance <strong>' + finMoney(t.balance) + '</strong></summary>' +
      '<table class="finTable"><tbody>' + lines.map(function (l) {
        return '<tr><td>' + escapeHtml(l.description) + '</td><td style="text-align:right">' + finMoney(l.amount) + '</td>' +
          (E && l.amount > 0 && l.source.indexOf('Reversal') !== 0 ? '<td><button type="button" class="linkBtn" data-fin="rev-charge" data-id="' + escapeHtml(l.id) + '">Reverse</button></td>' : '<td></td>') + '</tr>';
      }).join('') + '</tbody></table></details>';
  }).join('') || '<p class="subtitle">No charges yet.</p>';

  var disc = r.discounts.length ? r.discounts.map(function (d) {
    return '<tr><td>' + escapeHtml(d.date) + '</td><td>' + escapeHtml(d.term) + '</td><td>' + finMoney(d.amount) + '</td><td>' + escapeHtml(d.reason) + (d.note ? ' — ' + escapeHtml(d.note) : '') +
      '</td><td>' + escapeHtml(d.approvedBy) + '</td><td>' + (d.status === 'Cancelled' ? '<em>cancelled</em>' : (E ? '<button type="button" class="linkBtn" data-fin="cancel-disc" data-id="' + escapeHtml(d.id) + '">Cancel</button>' : '')) + '</td></tr>';
  }).join('') : '<tr><td colspan="6" class="subtitle">None.</td></tr>';

  var pays = r.payments.length ? r.payments.map(function (p) {
    var canRev = E && p.type === 'Payment' && p.status !== 'Reversed';
    return '<tr' + (p.status === 'Reversed' || p.type === 'Reversal' ? ' style="color:#888"' : '') + '><td>' + escapeHtml(p.date || (p.type === 'Opening' ? 'opening' : '')) + '</td><td>' + finMoney(p.amount) + '</td><td>' + escapeHtml(p.method) +
      (p.reference ? ' (' + escapeHtml(p.reference) + ')' : '') + '</td><td>' + escapeHtml(p.receiptNo) + '</td><td>' + escapeHtml(p.status === 'Reversed' ? 'reversed' : p.type === 'Reversal' ? 'reversal: ' + p.reverseReason : p.receiptEmailed) + '</td><td>' +
      (canRev ? '<button type="button" class="linkBtn" data-fin="rev-pay" data-id="' + escapeHtml(p.id) + '">Reverse</button> ' : '') +
      (E && p.type === 'Payment' && p.status !== 'Reversed' ? '<button type="button" class="linkBtn" data-fin="resend" data-id="' + escapeHtml(p.id) + '">Resend receipt</button>' : '') + '</td></tr>';
  }).join('') : '<tr><td colspan="6" class="subtitle">No payments yet.</td></tr>';

  var methods = r.methods.map(function (m) { return '<option>' + escapeHtml(m) + '</option>'; }).join('');
  var reasons = r.discountReasons.map(function (m) { return '<option>' + escapeHtml(m) + '</option>'; }).join('');
  var forms = !E ? '' :
    '<h3>Record a payment</h3><div class="finForm">' +
    '<label>Amount (₦)<input id="finPayAmount" type="number" min="1" step="any" inputmode="decimal"></label>' +
    '<label>Date<input id="finPayDate" type="date" value="' + finTodayStr() + '" max="' + finTodayStr() + '"></label>' +
    '<label>Method<select id="finPayMethod">' + methods + '</select></label>' +
    '<label>Reference / teller no.<input id="finPayRef" type="text" maxlength="80"></label>' +
    '<button type="button" data-fin="pay-review">Review payment</button></div>' +
    '<h3>Apply a discount</h3><div class="finForm">' +
    '<label>Amount (₦)<input id="finDiscAmount" type="number" min="1" step="any" inputmode="decimal"></label>' +
    '<label>Reason<select id="finDiscReason">' + reasons + '</select></label>' +
    '<label>Note<input id="finDiscNote" type="text" maxlength="200" placeholder="Required if reason is Other"></label>' +
    '<button type="button" data-fin="disc-review">Review discount</button></div>' +
    '<h3>Add a charge (meals, shuttle, other)</h3><div class="finForm">' +
    '<label>Item<select id="finChargeItem"><option value="MEA">Meals</option><option value="SHT">Shuttle</option><option value="ASC">After School Care</option><option value="ASL">After School Lessons</option><option value="BAL">Ballet</option><option value="KAR">Karate</option><option value="COD">Coding</option><option value="EXT">Extra Tuition / Lessons</option><option value="EXC">Excursion</option><option value="OTH">Other charge</option></select></label>' +
    '<label>Amount (₦)<input id="finChargeAmount" type="number" min="1" step="any" inputmode="decimal"></label>' +
    '<label>Note<input id="finChargeNote" type="text" maxlength="200"></label>' +
    '<label class="check"><input type="checkbox" id="finChargeRecurring"> Repeat every term</label>' +
    '<button type="button" data-fin="charge-review">Review charge</button></div>' +
    '<h3>Fee profile</h3><div class="finForm">' +
    '<label>Learner<select id="finProfLearner"><option' + (s.learnerType === 'New' ? ' selected' : '') + '>New</option><option' + (s.learnerType === 'Returning' ? ' selected' : '') + '>Returning</option></select></label>' +
    (/^SSS/.test(s.className) ? '<label>Track<select id="finProfTrack"><option' + (s.track === 'Science' ? ' selected' : '') + '>Science</option><option' + (s.track === 'Arts & Commercial' ? ' selected' : '') + '>Arts &amp; Commercial</option></select></label>' : '') +
    '<label>Status<select id="finProfStatus"><option' + (s.status === 'Active' ? ' selected' : '') + '>Active</option><option' + (s.status === 'Withdrawn' ? ' selected' : '') + '>Withdrawn</option></select></label>' +
    '<label>Notes<input id="finProfNotes" type="text" maxlength="300" value="' + escapeHtml(r.notes) + '"></label>' +
    '<label>Parent email(s)<input id="finProfEmail" type="text" maxlength="200" placeholder="up to 3, separated by commas" value="' + escapeHtml(r.parentEmail) + '" style="min-width:260px"></label>' +
    '<button type="button" data-fin="profile-save">Save profile</button></div>' +
    '<p class="subtitle">Fee column: ' + escapeHtml(s.variant || 'not set') + (r.profileSource ? ' — ' + escapeHtml(r.profileSource) : '') + '</p>';

  finSet('finBody',
    '<button type="button" class="linkBtn" data-fin="back">&larr; Back to students</button>' +
    '<h3 style="margin-bottom:2px">' + escapeHtml(s.name) + '</h3>' +
    '<p class="subtitle">' + escapeHtml(s.id) + ' — ' + escapeHtml(s.className) + (s.status === 'Withdrawn' ? ' — withdrawn' : '') +
    (E ? ' — parent email: ' + (r.parentEmail ? escapeHtml(r.parentEmail) : '<strong style="color:#8a4b00">none on file (receipts cannot be emailed)</strong>') : '') + '</p>' +
    '<div class="statGrid"><div class="statCard"><span class="statLabel">Charged</span><span class="statValue">' + finMoney(s.charged) + '</span></div>' +
    '<div class="statCard"><span class="statLabel">Discounts</span><span class="statValue">' + finMoney(s.discounts) + '</span></div>' +
    '<div class="statCard"><span class="statLabel">Paid</span><span class="statValue good">' + finMoney(s.paid) + '</span></div>' +
    '<div class="statCard"><span class="statLabel">Balance</span><span class="statValue ' + (s.balance > 0 ? 'bad' : 'good') + '">' + finMoney(s.balance) + '</span></div></div>' +
    '<button type="button" data-fin="dl-ledger">Download statement (CSV)</button>' +
    '<h3>Charges by term</h3>' + termHtml +
    '<h3>Discounts</h3><div style="overflow-x:auto"><table class="finTable"><thead><tr><th>Date</th><th>Term</th><th>Amount</th><th>Reason</th><th>Approved by</th><th></th></tr></thead><tbody>' + disc + '</tbody></table></div>' +
    '<h3>Payments</h3><div style="overflow-x:auto"><table class="finTable"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Receipt</th><th>Status</th><th></th></tr></thead><tbody>' + pays + '</tbody></table></div>' +
    forms);
}

/* ---------- confirm step ---------- */

function finAsk(html, yesLabel, onYes) {
  finSet('finConfirm', '<div style="border:2px solid #c77b00;background:#fff6e6;border-radius:8px;padding:14px;margin:10px 0"><p style="margin:0 0 10px 0">' + html +
    '</p><button type="button" id="finYes">' + escapeHtml(yesLabel) + '</button> <button type="button" class="linkBtn" id="finNo">Cancel</button></div>');
  $('finYes').onclick = function () { $('finYes').disabled = true; onYes(); };
  $('finNo').onclick = function () { finSet('finConfirm', ''); };
  $('finConfirm').scrollIntoView && $('finConfirm').scrollIntoView({ block: 'nearest' });
}
function finDone(r, okMsg, reopenId) {
  finSet('finConfirm', '');
  if (r && r.success) { finMsg(okMsg, true); finOpenLedger(reopenId, true); window.scrollTo && window.scrollTo(0, 0); return; }
  finMsg((r && r.error) || 'That did not save. Nothing was changed.');
}
function finFail() { finSet('finConfirm', ''); finMsg('Could not reach the server. Check whether the change was saved before trying again.'); }

function finPayReview() {
  var s = FIN.ledger.student, amount = Number($('finPayAmount').value), date = $('finPayDate').value, method = $('finPayMethod').value, ref = $('finPayRef').value.trim();
  if (!(amount > 0)) { finMsg('Enter the amount received.'); return; }
  if (!date) { finMsg('Choose the payment date.'); return; }
  finMsg('');
  var mail = FIN.ledger.parentEmail ? 'A receipt will be emailed to ' + escapeHtml(FIN.ledger.parentEmail) + '.' : '<strong>No parent email is on file, so no receipt can be emailed.</strong>';
  finAsk('Record <strong>' + finMoney(amount) + '</strong> from <strong>' + escapeHtml(s.name) + '</strong> (' + escapeHtml(s.className) + '), paid ' + escapeHtml(date) + ' by ' + escapeHtml(method) +
    (ref ? ', ref ' + escapeHtml(ref) : '') + '? Balance after: <strong>' + finMoney(s.balance - amount) + '</strong>. ' + mail, 'Confirm & Save', function () { finSendPayment(false, false); });
}
function finSendPayment(force, allowOverpay) {
  var id = FIN.ledger.student.id;
  call('finRecordPayment', { studentId: id, amount: Number($('finPayAmount').value), date: $('finPayDate').value, method: $('finPayMethod').value, reference: $('finPayRef').value.trim(), force: force, allowOverpay: allowOverpay })
    .then(function (r) {
      if (r && !r.success && r.duplicate) { finAsk(escapeHtml(r.error), 'Yes, record it again', function () { finSendPayment(true, allowOverpay); }); return; }
      if (r && !r.success && r.overpay) { finAsk(escapeHtml(r.error), 'Record as advance payment', function () { finSendPayment(force, true); }); return; }
      finDone(r, r && r.success ? 'Payment recorded. Receipt ' + r.receiptNo + ' — ' + r.receiptStatus + '.' : '', id);
    }).catch(finFail);
}

function finDiscReview() {
  var s = FIN.ledger.student, amount = Number($('finDiscAmount').value), reason = $('finDiscReason').value, note = $('finDiscNote').value.trim();
  if (!(amount > 0)) { finMsg('Enter the discount amount.'); return; }
  if (reason === 'Other' && note.length < 3) { finMsg('Describe the reason in the note.'); return; }
  finMsg('');
  finAsk('Apply a discount of <strong>' + finMoney(amount) + '</strong> to <strong>' + escapeHtml(s.name) + '</strong> for ' + escapeHtml(FIN.term) + ' — ' + escapeHtml(reason) + (note ? ' (' + escapeHtml(note) + ')' : '') + '? It will be recorded as approved by you.', 'Confirm & Apply', function () {
    call('finApplyDiscount', { studentId: s.id, amount: amount, reason: reason, note: note, session: FIN.session, term: FIN.term }).then(function (r) { finDone(r, 'Discount applied.', s.id); }).catch(finFail);
  });
}
function finChargeReview() {
  var s = FIN.ledger.student, amount = Number($('finChargeAmount').value), code = $('finChargeItem').value, note = $('finChargeNote').value.trim(), rec = $('finChargeRecurring').checked;
  var label = $('finChargeItem').options[$('finChargeItem').selectedIndex].text;
  if (!(amount > 0)) { finMsg('Enter the charge amount.'); return; }
  if (code === 'OTH' && note.length < 3) { finMsg('Describe the charge in the note.'); return; }
  finMsg('');
  finAsk('Add <strong>' + escapeHtml(label) + '</strong> of <strong>' + finMoney(amount) + '</strong> to <strong>' + escapeHtml(s.name) + '</strong> for ' + escapeHtml(FIN.term) + (rec ? ', repeating every term' : '') + '?', 'Confirm & Add', function () {
    call('finAddCharge', { studentId: s.id, itemCode: code, amount: amount, note: note, recurring: rec, session: FIN.session, term: FIN.term }).then(function (r) { finDone(r, 'Charge added.', s.id); }).catch(finFail);
  });
}
function finProfileSave() {
  var s = FIN.ledger.student;
  var track = $('finProfTrack') ? $('finProfTrack').value : s.track;
  call('finUpdateStudent', { studentId: s.id, learnerType: $('finProfLearner').value, track: track, status: $('finProfStatus').value, notes: $('finProfNotes').value.trim(), parentEmail: $('finProfEmail').value.trim() })
    .then(function (r) { finDone(r, 'Profile saved. Fee column: ' + (r && r.variant) + '.', s.id); }).catch(finFail);
}
function finAskReason(label, yes, run) {
  finAsk(label + '<br><input id="finReason" type="text" maxlength="200" placeholder="Reason (required)" style="width:100%;margin-top:6px">', yes, function () {
    var reason = $('finReason').value.trim();
    if (reason.length < 3) { $('finYes').disabled = false; finMsg('Give a reason.'); return; }
    finMsg(''); run(reason);
  });
}

/* ---------- payments report ---------- */

function finRangeFor(kind) {
  var d = new Date(), pad = function (n) { return ('0' + n).slice(-2); };
  var iso = function (x) { return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };
  var to = iso(d), from;
  if (kind === 'week') { var m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7)); from = iso(m); }
  else if (kind === 'month') from = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-01';
  else { from = to; }
  return { from: from, to: to };
}
function finRenderReport() {
  var rg = FIN.reportRange || finRangeFor('month');
  finSet('finBody',
    '<div class="finForm"><label>From<input id="finFrom" type="date" value="' + rg.from + '"></label><label>To<input id="finTo" type="date" value="' + rg.to + '"></label>' +
    '<button type="button" data-fin="range-week">This week</button><button type="button" data-fin="range-month">This month</button><button type="button" data-fin="run-report">Show</button></div>' +
    '<div id="finReportOut"></div>');
  if (FIN.report) finRenderReportOut();
}
function finRunReport() {
  var from = $('finFrom').value, to = $('finTo').value;
  if (!from || !to || from > to) { finMsg('Choose a valid date range.'); return; }
  finMsg(''); FIN.reportRange = { from: from, to: to };
  finSet('finReportOut', '<p class="subtitle">Loading...</p>');
  call('finGetPaymentsReport', { from: from, to: to }).then(function (r) {
    if (!r || !r.success) { finSet('finReportOut', ''); finMsg((r && r.error) || 'Could not load the report.'); return; }
    FIN.report = r; finRenderReportOut();
  }).catch(function () { finSet('finReportOut', ''); finMsg('Could not reach the server.'); });
}
function finRenderReportOut() {
  var r = FIN.report;
  var kv = function (o) { return Object.keys(o).sort().map(function (k) { return '<li>' + escapeHtml(k || 'Unknown') + ': <strong>' + finMoney(o[k]) + '</strong></li>'; }).join(''); };
  var rows = r.payments.map(function (p) {
    return '<tr><td>' + escapeHtml(p.date) + '</td><td>' + escapeHtml(p.name) + '</td><td>' + escapeHtml(p.className) + '</td><td>' + finMoney(p.amount) + '</td><td>' + escapeHtml(p.method) + '</td><td>' + escapeHtml(p.receiptNo) + '</td></tr>';
  }).join('') || '<tr><td colspan="6" class="subtitle">No payments in this period.</td></tr>';
  finSet('finReportOut',
    '<h3>' + escapeHtml(r.from) + ' to ' + escapeHtml(r.to) + ': ' + finMoney(r.total) + ' in ' + r.count + ' payment' + (r.count === 1 ? '' : 's') + '</h3>' +
    '<button type="button" data-fin="dl-report">Download CSV</button>' +
    '<div style="display:flex;flex-wrap:wrap;gap:24px"><div><strong>By method</strong><ul>' + kv(r.byMethod) + '</ul></div><div><strong>By section</strong><ul>' + kv(r.bySection) + '</ul></div></div>' +
    '<div style="overflow-x:auto"><table class="finTable"><thead><tr><th>Date</th><th>Student</th><th>Class</th><th>Amount</th><th>Method</th><th>Receipt</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="subtitle">Reversed payments appear with their reversal, so the total is net.</p>');
}

/* ---------- fee schedule + invoices ---------- */

function finLoadSchedule() {
  finSet('finBody', '<p class="subtitle">Loading...</p>');
  call('finGetFeeSchedule', { session: FIN.session, term: FIN.term }).then(function (r) {
    if (!r || !r.success) { finSet('finBody', ''); finMsg((r && r.error) || 'Could not load the fee schedule.'); return; }
    FIN.schedule = r; FIN.canEdit = !!r.canEdit; finRenderSchedule();
  }).catch(function () { finSet('finBody', ''); finMsg('Could not reach the server.'); });
}
function finRenderSchedule() {
  var r = FIN.schedule, E = FIN.canEdit;
  var termOpts = function (id, sel) {
    var seen = {}, o = [];
    FIN.sessions.concat([{ session: r.session, term: r.term }]).forEach(function (s) { var k = s.session + '|' + s.term; if (!seen[k]) { seen[k] = 1; o.push(k); } });
    return '<select id="' + id + '">' + o.map(function (k) { return '<option value="' + escapeHtml(k) + '"' + (k === sel ? ' selected' : '') + '>' + escapeHtml(k.replace('|', ' — ')) + '</option>'; }).join('') + '</select>';
  };
  var codeOpts = r.itemList.map(function (i) { return '<option value="' + escapeHtml(i.code) + '">' + escapeHtml(i.name) + '</option>'; }).join('');
  var variants = r.variants.map(function (v) {
    return '<details><summary><strong>' + escapeHtml(v.variant) + '</strong> — ' + finMoney(v.total) + '</summary><table class="finTable"><tbody>' + v.items.map(function (i) {
      return '<tr><td>' + escapeHtml(i.name) + '</td><td style="text-align:right">' + (E ? '<input type="number" min="0" step="any" value="' + i.amount + '" data-fin-amt data-variant="' + escapeHtml(v.variant) + '" data-code="' + escapeHtml(i.code) + '" style="width:110px"> <button type="button" class="linkBtn" data-fin="save-amt" data-variant="' + escapeHtml(v.variant) + '" data-code="' + escapeHtml(i.code) + '">Save</button>' : finMoney(i.amount)) + '</td></tr>';
    }).join('') + '</tbody></table>' +
      (E ? '<div class="finForm"><label>Add item<select data-fin-newcode="' + escapeHtml(v.variant) + '">' + codeOpts + '</select></label><label>Amount<input type="number" min="1" step="any" data-fin-newamt="' + escapeHtml(v.variant) + '" style="width:110px"></label><button type="button" data-fin="add-item" data-variant="' + escapeHtml(v.variant) + '">Add</button></div>' : '') + '</details>';
  }).join('') || '<p class="subtitle">No fee schedule has been set up for this term.</p>';
  var tools = !E ? '' :
    '<h3>Invoices for a term</h3><div class="finForm"><label>Term' + termOpts('finInvTerm', r.session + '|' + r.term) + '</label><button type="button" data-fin="inv-preview">Preview invoices</button></div><div id="finInvOut"></div>' +
    '<h3>Start a new term</h3><p class="subtitle">Copy a term\'s fees as the starting point, then change any amount above.</p><div class="finForm">' +
    '<label>Copy from' + termOpts('finCopyFrom', r.session + '|' + r.term) + '</label><label>To session<input id="finCopyToSession" placeholder="2026/2027" style="width:110px"></label>' +
    '<label>To term<select id="finCopyToTerm"><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></label><button type="button" data-fin="copy-sched">Copy fees</button></div>' +
    '<h3>Current term</h3><div class="finForm"><label>Session<input id="finCurSession" value="' + escapeHtml(FIN.session) + '" style="width:110px"></label><label>Term<select id="finCurTerm"><option' + (FIN.term === 'Term 1' ? ' selected' : '') + '>Term 1</option><option' + (FIN.term === 'Term 2' ? ' selected' : '') + '>Term 2</option><option' + (FIN.term === 'Term 3' ? ' selected' : '') + '>Term 3</option></select></label><button type="button" data-fin="set-current">Set current term</button></div>';
  finSet('finBody',
    '<div style="margin-bottom:8px">' + termOpts('finSchedTerm', r.session + '|' + r.term) + '</div>' +
    '<p class="subtitle">' + (E ? 'Changing an amount affects invoices generated from now on. Invoices already issued keep the amount they were issued at.' : 'Fee amounts for the selected term.') + '</p>' + variants + tools);
}
function finInvPreview() {
  var v = $('finInvTerm').value.split('|');
  finSet('finInvOut', '<p class="subtitle">Working out the preview...</p>');
  call('finGenerateInvoices', { session: v[0], term: v[1], preview: true }).then(function (r) {
    if (!r || !r.success) { finSet('finInvOut', ''); finMsg((r && r.error) || 'Could not preview.'); return; }
    FIN.invoicePreview = { session: v[0], term: v[1], summary: r.summary }; finMsg('');
    var s = r.summary;
    finSet('finInvOut', '<p><strong>' + s.students + '</strong> students would be invoiced <strong>' + finMoney(s.total) + '</strong> in ' + s.lines + ' lines for ' + escapeHtml(v[0] + ' ' + v[1]) + '. ' +
      s.alreadyInvoiced + ' already invoiced and skipped; ' + s.noVariant + ' have no fee profile.' +
      (s.noSchedule.length ? '<br><strong style="color:#b00020">' + s.noSchedule.length + ' have a fee column with no schedule for this term and will not be invoiced.</strong>' : '') + '</p>' +
      (s.students > 0 ? '<button type="button" data-fin="inv-generate">Generate these invoices</button>' : ''));
  }).catch(function () { finSet('finInvOut', ''); finMsg('Could not reach the server.'); });
}

/* ---------- events ---------- */

function finOnClick(e) {
  var row = e.target.closest && e.target.closest('[data-fin-student]');
  if (row && !e.target.closest('button')) { finOpenLedger(row.getAttribute('data-fin-student')); return; }
  var sub = e.target.closest && e.target.closest('[data-fin-sub]');
  if (sub) { finShowSub(sub.getAttribute('data-fin-sub')); return; }
  var b = e.target.closest && e.target.closest('[data-fin]');
  if (!b) return;
  var a = b.getAttribute('data-fin'), id = b.getAttribute('data-id');
  var sid = FIN.ledger && FIN.ledger.student.id;
  switch (a) {
    case 'back': FIN.ledger = null; finMsg(''); finSet('finConfirm', ''); finRenderStudents(); break;
    case 'pay-review': finPayReview(); break;
    case 'disc-review': finDiscReview(); break;
    case 'charge-review': finChargeReview(); break;
    case 'profile-save': finProfileSave(); break;
    case 'rev-pay': finAskReason('Reverse payment ' + escapeHtml(id) + '? The balance goes back up and the reversal stays on the record.', 'Reverse payment', function (reason) {
      call('finReversePayment', { paymentId: id, reason: reason }).then(function (r) { finDone(r, 'Payment reversed.', sid); }).catch(finFail); }); break;
    case 'cancel-disc': finAskReason('Cancel discount ' + escapeHtml(id) + '?', 'Cancel discount', function (reason) {
      call('finCancelDiscount', { discountId: id, reason: reason }).then(function (r) { finDone(r, 'Discount cancelled.', sid); }).catch(finFail); }); break;
    case 'rev-charge': finAskReason('Reverse this charge?', 'Reverse charge', function (reason) {
      call('finReverseCharge', { lineId: id, reason: reason }).then(function (r) { finDone(r, 'Charge reversed.', sid); }).catch(finFail); }); break;
    case 'resend': b.disabled = true; call('finResendReceipt', { paymentId: id }).then(function (r) { finDone(r, 'Receipt sent again.', sid); }).catch(finFail); break;
    case 'dl-classes': finDownloadCsv('fees_by_class_' + FIN.session.replace('/', '-') + '_' + FIN.term.replace(' ', ''), ['Class', 'Students', 'Charged net this term', 'Collected this term', 'Outstanding all terms', 'Students owing'],
      FIN.overview.classes.map(function (c) { return [c.name, c.students, c.termCharged, c.termPaid, c.outstanding, c.owing]; })); break;
    case 'dl-students': finDownloadCsv('fees_students', ['Student ID', 'Name', 'Class', 'Status', 'Charged', 'Discounts', 'Paid', 'Balance', 'Parent email on file'],
      finFilteredStudents().map(function (s) { return [s.id, s.name, s.className, s.status, s.charged, s.discounts, s.paid, s.balance, s.hasEmail ? 'Yes' : 'No']; })); break;
    case 'dl-report': finDownloadCsv('fees_payments_' + FIN.report.from + '_to_' + FIN.report.to, ['Date', 'Receipt', 'Student ID', 'Name', 'Class', 'Section', 'Amount', 'Method', 'Reference', 'Recorded by'],
      FIN.report.payments.map(function (p) { return [p.date, p.receiptNo, p.studentId, p.name, p.className, p.section, p.amount, p.method, p.reference, p.recordedBy]; })); break;
    case 'dl-ledger': var L = FIN.ledger;
      finDownloadCsv('fee_statement_' + L.student.id.replace(/\//g, '-'), ['Type', 'Session', 'Term', 'Date', 'Description', 'Amount'],
        L.lines.map(function (l) { return ['Charge', l.session, l.term, '', l.description, l.amount]; })
          .concat(L.discounts.filter(function (d) { return d.status !== 'Cancelled'; }).map(function (d) { return ['Discount', d.session, d.term, d.date, d.reason, -d.amount]; }))
          .concat(L.payments.map(function (p) { return ['Payment', p.session, p.term, p.date, (p.method + ' ' + p.reference + ' ' + p.receiptNo).trim(), -p.amount]; }))); break;
    case 'range-week': FIN.reportRange = finRangeFor('week'); $('finFrom').value = FIN.reportRange.from; $('finTo').value = FIN.reportRange.to; finRunReport(); break;
    case 'range-month': FIN.reportRange = finRangeFor('month'); $('finFrom').value = FIN.reportRange.from; $('finTo').value = FIN.reportRange.to; finRunReport(); break;
    case 'run-report': finRunReport(); break;
    case 'save-amt': var inp = document.querySelector('[data-fin-amt][data-variant="' + b.getAttribute('data-variant').replace(/"/g, '\\"') + '"][data-code="' + b.getAttribute('data-code') + '"]');
      call('finSaveScheduleAmount', { session: FIN.schedule.session, term: FIN.schedule.term, variant: b.getAttribute('data-variant'), itemCode: b.getAttribute('data-code'), amount: Number(inp.value) })
        .then(function (r) { if (r && r.success) { finMsg('Saved. New invoices will use this amount.', true); finLoadSchedule(); } else finMsg((r && r.error) || 'Not saved.'); }).catch(finFail); break;
    case 'add-item': var v = b.getAttribute('data-variant');
      var code = document.querySelector('[data-fin-newcode="' + v.replace(/"/g, '\\"') + '"]').value, amt = Number(document.querySelector('[data-fin-newamt="' + v.replace(/"/g, '\\"') + '"]').value);
      if (!(amt > 0)) { finMsg('Enter an amount.'); break; }
      call('finSaveScheduleAmount', { session: FIN.schedule.session, term: FIN.schedule.term, variant: v, itemCode: code, amount: amt })
        .then(function (r) { if (r && r.success) { finMsg('Item added.', true); finLoadSchedule(); } else finMsg((r && r.error) || 'Not added.'); }).catch(finFail); break;
    case 'inv-preview': finInvPreview(); break;
    case 'inv-generate': var p = FIN.invoicePreview;
      finAsk('Generate invoices for <strong>' + p.summary.students + '</strong> students totalling <strong>' + finMoney(p.summary.total) + '</strong> for ' + escapeHtml(p.session + ' ' + p.term) + '? Students already invoiced are skipped.', 'Generate', function () {
        call('finGenerateInvoices', { session: p.session, term: p.term, preview: false }).then(function (r) {
          finSet('finConfirm', '');
          if (r && r.success) { finMsg('Invoices generated for ' + r.summary.students + ' students.', true); finSet('finInvOut', ''); } else finMsg((r && r.error) || 'Not generated.');
        }).catch(finFail); }); break;
    case 'copy-sched': var f = $('finCopyFrom').value.split('|');
      call('finCopySchedule', { fromSession: f[0], fromTerm: f[1], toSession: $('finCopyToSession').value.trim(), toTerm: $('finCopyToTerm').value })
        .then(function (r) { if (r && r.success) { finMsg('Copied ' + r.lines + ' fee lines. Now adjust any amounts that changed.', true); FIN.session = $('finCopyToSession').value.trim(); FIN.term = $('finCopyToTerm').value; FIN.sessions = []; finLoadSchedule(); } else finMsg((r && r.error) || 'Not copied.'); }).catch(finFail); break;
    case 'set-current':
      call('finSetCurrentTerm', { session: $('finCurSession').value.trim(), term: $('finCurTerm').value })
        .then(function (r) { if (r && r.success) { FIN.session = $('finCurSession').value.trim(); FIN.term = $('finCurTerm').value; finMsg('Current term set.', true); finLoadSchedule(); } else finMsg((r && r.error) || 'Not changed.'); }).catch(finFail); break;
  }
}
function finOnChange(e) {
  var t = e.target;
  if (t.id === 'finTermSelect') { var v = t.value.split('|'); FIN.session = v[0]; FIN.term = v[1]; finLoadOverview(); }
  else if (t.id === 'finSchedTerm') { var w = t.value.split('|'); FIN.session = w[0]; FIN.term = w[1]; finLoadSchedule(); }
  else if (t.id === 'finClassFilter') { FIN.filter.className = t.value; finRenderStudentRows(); }
  else if (t.id === 'finStatusFilter') { FIN.filter.status = t.value; finRenderStudentRows(); }
  else if (t.id === 'finOwingOnly') { FIN.filter.owingOnly = t.checked; finRenderStudentRows(); }
}
function finOnInput(e) {
  if (e.target.id === 'finSearch') { FIN.filter.query = e.target.value; finRenderStudentRows(); }
}
window.initFeesTab = initFeesTab;
