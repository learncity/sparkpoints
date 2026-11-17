/* Learn City — Payroll, inside the Fees tab (loaded after app.js and fees.js;
   uses call(), state, $, escapeHtml, finMoney, finMsg, finSet, finAsk, finTodayStr).
   Bursar makes, Head of School checks, Head of IT makes, checks, downloads and pays.
   The server decides who may do what; this file only hides buttons that would be refused. */
'use strict';

var PAY_ROLES = ['Bursar', 'Head of IT', 'Head of School'];
var PAY = { view: 'months', overview: null, run: null, staff: null, banks: [], dirty: false, filter: '', wired: false, editStaffId: '' };

function payAllowed() { return PAY_ROLES.indexOf(state.role) !== -1; }

function payN(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function payRound(n) { return Math.round(n * 100) / 100; }
function payNet(l) { return payRound(payN(l.gross) - (payN(l.tax) + payN(l.cfCurrent) + payN(l.welfare) + payN(l.other))); }
function payOutstanding(l) { return payRound(payN(l.cfTotal) - (payN(l.cfPaid) + payN(l.cfCurrent))); }
function payTotals(lines) {
  var t = { staffPaid: 0, gross: 0, tax: 0, childFee: 0, welfare: 0, other: 0, net: 0 };
  lines.forEach(function (l) {
    if (!l.pay) return;
    t.gross += payN(l.gross); t.tax += payN(l.tax); t.childFee += payN(l.cfCurrent); t.welfare += payN(l.welfare); t.other += payN(l.other);
    var n = payNet(l); t.net += n; if (n > 0) t.staffPaid++;
  });
  Object.keys(t).forEach(function (k) { t[k] = payRound(t[k]); });
  t.cooperative = t.welfare; t.fileTotal = payRound(t.net + t.cooperative);
  return t;
}

var PAY_BADGE = {
  Draft: 'background:#F3F4F6;color:#374151;border:1px solid #D1D5DB',
  Returned: 'background:#FFF7ED;color:#9A3412;border:1px solid #FDBA74',
  Submitted: 'background:#EEF2FF;color:#4338CA;border:1px solid #C7D2FE',
  Approved: 'background:#ECFDF5;color:#047857;border:1px solid #6EE7B7',
  Paid: 'background:#047857;color:#fff;border:1px solid #047857'
};
function payBadge(s) {
  var label = s === 'Submitted' ? 'Awaiting approval' : s;
  return '<span style="padding:2px 10px;border-radius:12px;font-size:13px;white-space:nowrap;' + (PAY_BADGE[s] || '') + '">' + escapeHtml(label) + '</span>';
}

/* ---------- entry ---------- */

function payShow() {
  if (!PAY.wired) {
    PAY.wired = true;
    $('feesTab').addEventListener('click', payOnClick);
    $('feesTab').addEventListener('input', payOnInput);
    $('feesTab').addEventListener('change', payOnChange);
  }
  PAY.view = 'months'; PAY.run = null; PAY.dirty = false;
  payLoadOverview();
}

function payLoadOverview() {
  finSet('finBody', '<p class="subtitle">Loading...</p>');
  call('payroll.overview', {}).then(function (r) {
    if (!r || !r.success) { finSet('finBody', ''); finMsg((r && r.error) || 'Could not load payroll.'); return; }
    PAY.overview = r; PAY.view = 'months'; payRenderMonths();
  }).catch(function () { finSet('finBody', ''); finMsg('Could not reach the server.'); });
}

/* ---------- list of months ---------- */

function payRenderMonths() {
  var o = PAY.overview, P = o.perms;
  var nextVal = o.next.year + '-' + ('0' + o.next.month).slice(-2);
  var start = !P.canMake ? '' :
    '<h3>Start a month</h3><div class="finForm">' +
    '<label>Month<input id="payNewMonth" type="month" value="' + nextVal + '"></label>' +
    '<label class="check"><input type="checkbox" id="payCopy" checked> Copy the previous month</label>' +
    '<button type="button" data-pay="start">Start</button></div>' +
    '<p class="subtitle">Copying brings over every figure from the latest month, so you only change what is different. Child fees move on by themselves.</p>';
  var rows = o.runs.map(function (r) {
    var who = r.status === 'Paid' ? 'Paid by ' + r.paidBy : r.status === 'Approved' ? 'Approved by ' + r.approvedBy :
      r.status === 'Submitted' ? 'Submitted by ' + r.submittedBy : r.status === 'Returned' ? 'Returned by ' + r.returnedBy : 'Started by ' + r.createdBy;
    return '<tr data-pay-run="' + escapeHtml(r.id) + '" style="cursor:pointer"><td><strong>' + escapeHtml(r.label) + '</strong></td><td>' + payBadge(r.status) +
      '</td><td>' + (r.staffPaid || '') + '</td><td>' + (r.fileTotal ? finMoney(r.fileTotal) : '') + '</td><td>' + escapeHtml(who) + '</td></tr>';
  }).join('') || '<tr><td colspan="5" class="subtitle">No payroll months yet.</td></tr>';
  var waiting = o.runs.filter(function (r) { return r.status === 'Submitted'; });
  finSet('finBody',
    '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between">' +
    '<h3 style="margin:0">Payroll</h3><button type="button" data-pay="staff">Staff register (' + o.activeStaff + ' active)</button></div>' +
    (P.canCheck && waiting.length ? '<p style="border-left:4px solid #4338CA;padding:6px 10px;background:#EEF2FF"><strong>Waiting for approval:</strong> ' +
      waiting.map(function (r) { return escapeHtml(r.label); }).join(', ') + '. Open it to check and approve.</p>' : '') +
    (!o.hasCooperative ? '<p class="error">The Cooperative Society is not in the staff register, so welfare cannot be paid to it.</p>' : '') +
    start +
    '<h3>Months</h3><div style="overflow-x:auto"><table class="finTable"><thead><tr><th>Month</th><th>Status</th><th>Staff paid</th><th>File total</th><th></th></tr></thead><tbody>' +
    rows + '</tbody></table></div>');
}

function payStart() {
  var v = ($('payNewMonth').value || '').split('-');
  if (v.length !== 2) { finMsg('Choose a month.'); return; }
  var y = Number(v[0]), m = Number(v[1]), copy = $('payCopy').checked;
  finMsg('');
  call('payroll.createRun', { year: y, month: m, copy: copy }).then(function (r) {
    if (!r || !r.success) { finMsg((r && r.error) || 'Could not start the month.'); return; }
    finMsg(r.copiedFrom ? 'Started. Figures copied from ' + r.copiedFrom + '; child fees moved on. Change only what is different, then Save.' : 'Started with blank figures.', true);
    payOpenRun(r.runId, true);
  }).catch(function () { finMsg('Could not reach the server. Check whether the month was started before trying again.'); });
}

/* ---------- one month ---------- */

function payOpenRun(runId, keepMsg) {
  if (!keepMsg) finMsg('');
  finSet('finConfirm', '');
  finSet('finBody', '<p class="subtitle">Loading...</p>');
  call('payroll.getRun', { runId: runId }).then(function (r) {
    if (!r || !r.success) { finMsg((r && r.error) || 'Could not load this month.'); payLoadOverview(); return; }
    r.lines.forEach(function (l) { l.otherNote = l.otherNote || ''; });
    PAY.run = r; PAY.view = 'month'; PAY.dirty = !!r.notes.length && r.canEdit; payRenderRun();
  }).catch(function () { finMsg('Could not reach the server.'); });
}

function payCell(i, f, v, E, w) {
  if (!E) return '<td style="text-align:right">' + (payN(v) ? finMoney(v) : '') + '</td>';
  return '<td><input type="number" min="0" step="any" inputmode="decimal" data-pay-f="' + f + '" data-i="' + i + '" value="' + (payN(v) ? v : '') +
    '" style="width:' + (w || 92) + 'px" aria-label="' + f + '"></td>';
}

function payRowHtml(l, i, E) {
  var flags = '';
  if (l.isNewLine || l.newSincePrev) flags += ' <span title="Not in the previous approved month" style="font-size:11px;padding:1px 6px;border-radius:8px;background:#EEF2FF;color:#4338CA">new</span>';
  if (l.bankChanged) flags += ' <span title="Bank details differ from the previous approved month" style="font-size:11px;padding:1px 6px;border-radius:8px;background:#FEF2F2;color:#B91C1C">bank changed</span>';
  if (l.bankProblem) flags += ' <span title="' + escapeHtml(l.bankProblem) + '" style="font-size:11px;padding:1px 6px;border-radius:8px;background:#FEF2F2;color:#B91C1C">bank details</span>';
  var net = payNet(l), out = payOutstanding(l);
  var hide = PAY.filter && l.name.toLowerCase().indexOf(PAY.filter) === -1;
  return '<tr data-pay-row="' + i + '"' + (hide ? ' style="display:none"' : (!l.pay ? ' style="color:#9CA3AF"' : '')) + '>' +
    '<td style="white-space:nowrap">' + escapeHtml(l.name) + flags + '<br><span class="subtitle" style="font-size:12px">' + escapeHtml(l.bankName) + ' ' + escapeHtml(l.accountNo) + '</span></td>' +
    '<td style="text-align:center">' + (E ? '<input type="checkbox" data-pay-f="pay" data-i="' + i + '"' + (l.pay ? ' checked' : '') + ' aria-label="Pay this month">' : (l.pay ? '&#10003;' : 'not paid')) + '</td>' +
    payCell(i, 'gross', l.gross, E, 104) + payCell(i, 'tax', l.tax, E) +
    payCell(i, 'cfTotal', l.cfTotal, E) + payCell(i, 'cfPaid', l.cfPaid, E) + payCell(i, 'cfCurrent', l.cfCurrent, E) +
    '<td data-pay-out="' + i + '" style="text-align:right;' + (out < 0 ? 'color:#B91C1C;font-weight:bold' : '') + '">' + (payN(l.cfTotal) ? finMoney(out) : '') + '</td>' +
    payCell(i, 'welfare', l.welfare, E) + payCell(i, 'other', l.other, E) +
    '<td>' + (E ? '<input type="text" maxlength="200" data-pay-f="otherNote" data-i="' + i + '" value="' + escapeHtml(l.otherNote) + '" style="width:110px" aria-label="Other deduction note">' : escapeHtml(l.otherNote)) + '</td>' +
    '<td data-pay-net="' + i + '" style="text-align:right;font-weight:bold;' + (l.pay && net <= 0 ? 'color:#B91C1C' : '') + '">' + (l.pay ? finMoney(net) : '-') + '</td>' +
    '<td style="text-align:right;color:#6B7280">' + (l.prevNet === null || l.prevNet === undefined ? '' : finMoney(l.prevNet)) + '</td></tr>';
}

function payTotalsHtml() {
  var t = payTotals(PAY.run.lines);
  var card = function (label, v, cls) { return '<div class="statCard"><span class="statLabel">' + label + '</span><span class="statValue ' + (cls || '') + '">' + v + '</span></div>'; };
  return card('Staff paid', t.staffPaid) + card('Gross', finMoney(t.gross)) + card('Tax', finMoney(t.tax)) + card('Child fees', finMoney(t.childFee)) +
    card('Other deductions', finMoney(t.other)) + card('Net salaries', finMoney(t.net), 'good') +
    card('Cooperative (welfare)', finMoney(t.cooperative)) + card('File total', finMoney(t.fileTotal));
}

function payRenderRun() {
  var r = PAY.run, run = r.run, E = r.canEdit;
  var hist = [];
  if (run.copiedFrom) hist.push('copied from the previous month');
  hist.push('started by ' + run.createdBy + ' ' + run.createdAt);
  if (run.submittedBy) hist.push('submitted by ' + run.submittedBy + ' ' + run.submittedAt);
  if (run.approvedBy) hist.push('approved by ' + run.approvedBy + ' ' + run.approvedAt);
  if (run.emailedTo) hist.push('file emailed to ' + run.emailedTo + ' ' + run.emailedAt);
  else if (run.status === 'Approved' && run.emailedAt) hist.push('<strong style="color:#B91C1C">email not sent: ' + escapeHtml(run.emailedAt) + '</strong>');
  if (run.paidBy) hist.push('marked paid by ' + run.paidBy + ' ' + run.paidAt);

  var actions = [];
  if (E) actions.push('<button type="button" data-pay="save">Save</button>', '<button type="button" data-pay="submit">Submit for approval</button>');
  if (r.canDecide) actions.push('<button type="button" data-pay="approve">Approve &amp; send file to Head of IT</button>', '<button type="button" class="linkBtn" data-pay="return">Return to maker</button>');
  if (r.canDownload) actions.push('<button type="button" data-pay="download">Download payment file</button>');
  if (r.canMarkPaid) actions.push('<button type="button" data-pay="paid">Mark paid</button>');
  if (r.canResend) actions.push('<button type="button" class="linkBtn" data-pay="resend">Email the file again</button>');
  if (r.canRecall) actions.push('<button type="button" class="linkBtn" data-pay="recall">Recall (not yet paid)</button>');
  actions.push('<button type="button" class="linkBtn" data-pay="csv">Download payroll sheet (CSV)</button>');

  var cols = '<th>Name</th><th>Pay</th><th>Gross</th><th>Tax</th><th>Child fee<br>total</th><th>Child fee<br>paid</th><th>Child fee<br>this month</th>' +
    '<th>Child fee<br>outstanding</th><th>Welfare</th><th>Other<br>deduction</th><th>Note</th><th>Net</th><th>' + (r.prevLabel ? escapeHtml(r.prevLabel) + '<br>net' : 'Last<br>net') + '</th>';
  var coopRow = r.cooperative ? '<tr style="background:#F9FAFB"><td><strong>' + escapeHtml(r.cooperative.name) + '</strong><br><span class="subtitle" style="font-size:12px">' +
    escapeHtml(r.cooperative.bankName) + ' ' + escapeHtml(r.cooperative.accountNo) + ' — receives total welfare</span></td><td colspan="10"></td><td id="payCoopCell" style="text-align:right;font-weight:bold">' +
    finMoney(payTotals(r.lines).cooperative) + '</td><td></td></tr>' : '';

  finSet('finBody',
    '<button type="button" class="linkBtn" data-pay="back">&larr; All months</button>' +
    '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center"><h3 style="margin:6px 0">Payroll — ' + escapeHtml(run.label) + '</h3>' + payBadge(run.status) + '</div>' +
    '<p class="subtitle">' + hist.map(function (h) { return h.charAt(0) === '<' ? h : escapeHtml(h); }).join(' · ') + '</p>' +
    (run.status === 'Returned' && run.returnReason ? '<p style="border-left:4px solid #EA580C;padding:6px 10px;background:#FFF7ED"><strong>Returned by ' + escapeHtml(run.returnedBy) + ':</strong> ' + escapeHtml(run.returnReason) + '</p>' : '') +
    (r.notes.length ? '<p style="border-left:4px solid #4338CA;padding:6px 10px;background:#EEF2FF">' + r.notes.map(escapeHtml).join('<br>') + '</p>' : '') +
    (r.problems.length ? '<div style="border-left:4px solid #B91C1C;padding:6px 10px;background:#FEF2F2"><strong>Before this month can be ' + (run.status === 'Submitted' ? 'approved' : 'submitted') + ':</strong><ul style="margin:4px 0 0 18px;padding:0">' +
      r.problems.slice(0, 15).map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') + (r.problems.length > 15 ? '<li>and ' + (r.problems.length - 15) + ' more</li>' : '') + '</ul></div>' : '') +
    (r.canDecide ? '<p class="subtitle">Check the figures against last month, and look for anyone marked <em>new</em> or <em>bank changed</em>. Approving emails the payment file to the Head of IT.</p>' : '') +
    '<div class="statGrid" id="payTotals">' + payTotalsHtml() + '</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">' + actions.join(' ') + '</div>' +
    '<input id="paySearch" type="search" placeholder="Find a name" value="' + escapeHtml(PAY.filter) + '" style="min-width:200px;margin-bottom:6px">' +
    '<div style="overflow-x:auto"><table class="finTable" id="payGrid"><thead><tr>' + cols + '</tr></thead><tbody>' +
    r.lines.map(function (l, i) { return payRowHtml(l, i, E); }).join('') + coopRow + '</tbody></table></div>' +
    (E ? '<p class="subtitle">Net is worked out for you: Gross − (Tax + Child fee this month + Welfare + Other). Untick <em>Pay</em> for anyone not being paid this month. Save before leaving this page.</p>' : ''));
}

function payRefreshRow(i) {
  var l = PAY.run.lines[i], net = payNet(l), out = payOutstanding(l);
  var n = document.querySelector('[data-pay-net="' + i + '"]');
  if (n) { n.textContent = l.pay ? finMoney(net) : '-'; n.style.color = l.pay && net <= 0 ? '#B91C1C' : ''; }
  var o = document.querySelector('[data-pay-out="' + i + '"]');
  if (o) { o.textContent = payN(l.cfTotal) ? finMoney(out) : ''; o.style.color = out < 0 ? '#B91C1C' : ''; o.style.fontWeight = out < 0 ? 'bold' : ''; }
  var row = document.querySelector('[data-pay-row="' + i + '"]');
  if (row) row.style.color = l.pay ? '' : '#9CA3AF';
  finSet('payTotals', payTotalsHtml());
  var c = $('payCoopCell'); if (c) c.textContent = finMoney(payTotals(PAY.run.lines).cooperative);
}

function payLinesPayload() {
  return PAY.run.lines.map(function (l) {
    return { staffId: l.staffId, pay: !!l.pay, gross: l.gross, tax: l.tax, cfTotal: l.cfTotal, cfPaid: l.cfPaid, cfCurrent: l.cfCurrent,
      welfare: l.welfare, other: l.other, otherNote: l.otherNote };
  });
}

function paySave(then) {
  var runId = PAY.run.run.id;
  finMsg('Saving...', true);
  return call('payroll.saveRun', { runId: runId, lines: payLinesPayload() }).then(function (r) {
    if (!r || !r.success) { finMsg((r && r.error) || 'Not saved. Nothing was changed.'); return false; }
    PAY.dirty = false;
    if (then) return then();
    finMsg('Saved.' + (r.problems.length ? ' Some things still need attention before it can be submitted (listed above).' : ' Ready to submit for approval.'), true);
    payOpenRun(runId, true);
    return true;
  }).catch(function () { finMsg('Could not reach the server. Your changes may not have been saved.'); return false; });
}

function paySubmit() {
  var t = payTotals(PAY.run.lines), runId = PAY.run.run.id;
  finAsk('Submit <strong>' + escapeHtml(PAY.run.run.label) + '</strong> for approval? ' + t.staffPaid + ' staff, net salaries <strong>' + finMoney(t.net) +
    '</strong>, Cooperative <strong>' + finMoney(t.cooperative) + '</strong>, file total <strong>' + finMoney(t.fileTotal) + '</strong>. It cannot be changed while it waits for approval.', 'Save & submit', function () {
    paySave(function () {
      return call('payroll.submitRun', { runId: runId }).then(function (r) {
        finSet('finConfirm', '');
        if (!r || !r.success) {
          finMsg((r && r.error) || 'Not submitted.');
          if (r && r.problems) finSet('finConfirm', '<ul class="error">' + r.problems.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') + '</ul>');
          payOpenRun(runId, true);
          return;
        }
        finMsg('Submitted for approval.', true); payOpenRun(runId, true);
      });
    });
  });
}

function payApprove() {
  var t = payTotals(PAY.run.lines), runId = PAY.run.run.id;
  finAsk('Approve <strong>' + escapeHtml(PAY.run.run.label) + '</strong>: ' + t.staffPaid + ' staff, net salaries <strong>' + finMoney(t.net) + '</strong>, Cooperative <strong>' +
    finMoney(t.cooperative) + '</strong>, file total <strong>' + finMoney(t.fileTotal) + '</strong>? The payment file will be emailed to the Head of IT.', 'Approve & send', function () {
    call('payroll.approveRun', { runId: runId }).then(function (r) {
      finSet('finConfirm', '');
      if (!r || !r.success) {
        finMsg((r && r.error) || 'Not approved.');
        if (r && r.problems) finSet('finConfirm', '<ul class="error">' + r.problems.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') + '</ul>');
        return;
      }
      finMsg(r.emailed ? 'Approved. ' + r.emailStatus + '.' : 'Approved, but the email did not go: ' + r.emailStatus + '. Use "Email the file again".', r.emailed);
      payOpenRun(runId, true);
    }).catch(finFail);
  });
}

function payWithReason(label, yes, action, okMsg) {
  var runId = PAY.run.run.id;
  finAskReason(label, yes, function (reason) {
    call(action, { runId: runId, reason: reason }).then(function (r) {
      finSet('finConfirm', '');
      if (!r || !r.success) { finMsg((r && r.error) || 'Nothing was changed.'); return; }
      finMsg(okMsg, true); payOpenRun(runId, true);
    }).catch(finFail);
  });
}

function payDownloadFile() {
  var runId = PAY.run.run.id;
  finMsg('Preparing the file...', true);
  call('payroll.download', { runId: runId }).then(function (r) {
    if (!r || !r.success) { finMsg((r && r.error) || 'Could not build the file.'); return; }
    var bin = atob(r.base64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
    a.download = r.fileName;
    document.body.appendChild(a); a.click(); a.remove();
    finMsg('Downloaded ' + r.fileName + '.', true);
  }).catch(function () { finMsg('Could not reach the server.'); });
}

/* The month in the Bursar's own layout, for her records. */
function payDownloadCsv() {
  var r = PAY.run, t = payTotals(r.lines);
  var rows = r.lines.map(function (l) {
    return [l.name, payN(l.gross), payN(l.tax), payN(l.cfTotal), payN(l.cfPaid), payN(l.cfCurrent), payOutstanding(l), payN(l.welfare), payN(l.other), l.otherNote, l.pay ? payNet(l) : 0, l.pay ? 'Yes' : 'No'];
  });
  if (r.cooperative) rows.push([r.cooperative.name, '', '', '', '', '', '', '', '', 'Total welfare', t.cooperative, '']);
  rows.push(['TOTAL', t.gross, t.tax, '', '', t.childFee, '', t.welfare, t.other, '', t.net, '']);
  finDownloadCsv('payroll_' + r.run.label.replace(' ', '_'), ['Name', 'Gross Salary', 'Tax', 'Child Fee Total', 'Child Fee Paid', 'Child Fee This Month', 'Child Fee Outstanding',
    'Welfare', 'Other deduction', 'Other note', 'Net Salary', 'Paid this month'], rows);
}

function payLeave(go) {
  if (PAY.view === 'month' && PAY.dirty && PAY.run && PAY.run.canEdit) {
    finAsk('You have changes that are not saved. Leave without saving?', 'Leave without saving', function () { finSet('finConfirm', ''); PAY.dirty = false; go(); });
    return;
  }
  go();
}

/* ---------- staff register ---------- */

function payLoadStaff(keepMsg) {
  if (!keepMsg) finMsg('');
  finSet('finConfirm', '');
  finSet('finBody', '<p class="subtitle">Loading...</p>');
  call('payroll.listStaff', {}).then(function (r) {
    if (!r || !r.success) { finMsg((r && r.error) || 'Could not load the staff register.'); return; }
    PAY.staff = r.staff; if (r.banks && r.banks.length) PAY.banks = r.banks; PAY.staffPerms = r.perms; PAY.view = 'staff'; payRenderStaff();
  }).catch(function () { finMsg('Could not reach the server.'); });
}

function payRenderStaff() {
  var P = PAY.staffPerms, E = P.canMake;
  var s = PAY.editStaffId ? PAY.staff.find(function (x) { return x.id === PAY.editStaffId; }) : null;
  var rows = PAY.staff.map(function (x) {
    return '<tr' + (x.status === 'Left' ? ' style="color:#9CA3AF"' : '') + '><td>' + escapeHtml(x.name) + (x.type === 'Cooperative' ? ' <em>(cooperative)</em>' : '') +
      '</td><td>' + escapeHtml(x.bankName) + ' <span class="subtitle">' + escapeHtml(x.bankCode) + '</span></td><td>' + escapeHtml(x.accountNo) +
      (x.problem ? ' <strong style="color:#B91C1C" title="' + escapeHtml(x.problem) + '">check</strong>' : '') + '</td><td>' + escapeHtml(x.status) + '</td><td>' + escapeHtml(x.notes) +
      '</td><td class="subtitle" style="font-size:12px">' + escapeHtml(x.updatedBy) + '<br>' + escapeHtml(x.updatedAt) + '</td><td>' +
      (E ? '<button type="button" class="linkBtn" data-pay="edit-staff" data-id="' + escapeHtml(x.id) + '">Edit</button>' : '') + '</td></tr>';
  }).join('');
  var bankList = '<datalist id="payBankList">' + PAY.banks.map(function (b) { return '<option value="' + escapeHtml(b.name) + '">' + escapeHtml(b.code) + '</option>'; }).join('') + '</datalist>';
  var form = !E ? '' :
    '<h3>' + (s ? 'Edit ' + escapeHtml(s.name) : 'Add a member of staff') + '</h3>' + bankList + '<div class="finForm">' +
    '<label>Name on bank account<input id="payStaffName" type="text" maxlength="100" value="' + escapeHtml(s ? s.name : '') + '" style="min-width:240px"></label>' +
    '<label>Bank<input id="payStaffBank" list="payBankList" value="' + escapeHtml(s ? s.bankName : '') + '" placeholder="Start typing the bank" style="min-width:240px"></label>' +
    '<label>Account number<input id="payStaffAcct" type="text" inputmode="numeric" maxlength="10" value="' + escapeHtml(s ? s.accountNo : '') + '" style="width:130px"></label>' +
    (s ? '<label>Status<select id="payStaffStatus"><option' + (s.status === 'Active' ? ' selected' : '') + '>Active</option><option' + (s.status === 'Left' ? ' selected' : '') + '>Left</option></select></label>' : '') +
    '<label>Notes<input id="payStaffNotes" type="text" maxlength="200" value="' + escapeHtml(s ? s.notes : '') + '"></label>' +
    '<button type="button" data-pay="save-staff">' + (s ? 'Review changes' : 'Review new staff') + '</button>' +
    (s ? ' <button type="button" class="linkBtn" data-pay="cancel-edit">Cancel</button>' : '') + '</div>' +
    '<p class="subtitle">New staff are added to the next payroll with blank figures. Marking someone <em>Left</em> removes them from months that are still being prepared. Bank changes are logged.</p>';
  finSet('finBody',
    '<button type="button" class="linkBtn" data-pay="back">&larr; All months</button><h3>Staff register</h3>' + form +
    '<div style="overflow-x:auto"><table class="finTable"><thead><tr><th>Name</th><th>Bank</th><th>Account</th><th>Status</th><th>Notes</th><th>Last change</th><th></th></tr></thead><tbody>' +
    rows + '</tbody></table></div>');
}

function payReviewStaff() {
  var s = PAY.editStaffId ? PAY.staff.find(function (x) { return x.id === PAY.editStaffId; }) : null;
  var name = $('payStaffName').value.trim(), bank = $('payStaffBank').value.trim(), acct = $('payStaffAcct').value.replace(/\s+/g, '');
  var status = $('payStaffStatus') ? $('payStaffStatus').value : 'Active', notes = $('payStaffNotes').value.trim();
  if (name.length < 3) { finMsg('Enter the name exactly as it is on the bank account.'); return; }
  if (!PAY.banks.some(function (b) { return b.name === bank; })) { finMsg('Choose the bank from the list.'); return; }
  if (!/^\d{10}$/.test(acct)) { finMsg('The account number must be exactly 10 digits.'); return; }
  finMsg('');
  var bankMoved = s && (s.bankName !== bank || s.accountNo !== acct);
  var text = s ? 'Save changes to <strong>' + escapeHtml(s.name) + '</strong>?' + (bankMoved ? '<br><strong>Bank details change:</strong> ' + escapeHtml(s.bankName + ' ' + s.accountNo) + ' &rarr; ' +
    escapeHtml(bank + ' ' + acct) + '. From the next payroll, salary goes to the new account.' : '') + (s.status !== status ? '<br>Status: ' + escapeHtml(s.status) + ' &rarr; ' + escapeHtml(status) + '.' : '')
    : 'Add <strong>' + escapeHtml(name) + '</strong>, ' + escapeHtml(bank) + ' ' + escapeHtml(acct) + '?';
  finAsk(text, 'Confirm & save', function () {
    call('payroll.saveStaff', { staffId: s ? s.id : '', name: name, bankName: bank, accountNo: acct, status: status, notes: notes }).then(function (r) {
      finSet('finConfirm', '');
      if (!r || !r.success) { finMsg((r && r.error) || 'Not saved.'); return; }
      PAY.editStaffId = '';
      finMsg(r.unchanged ? 'Nothing had changed.' : 'Saved.', true); payLoadStaff(true);
    }).catch(finFail);
  });
}

/* ---------- events ---------- */

function payOnClick(e) {
  if (FIN.sub !== 'payroll') return;
  var row = e.target.closest && e.target.closest('[data-pay-run]');
  if (row) { payOpenRun(row.getAttribute('data-pay-run')); return; }
  var b = e.target.closest && e.target.closest('[data-pay]');
  if (!b) return;
  var a = b.getAttribute('data-pay');
  switch (a) {
    case 'start': payStart(); break;
    case 'staff': PAY.editStaffId = ''; payLoadStaff(); break;
    case 'back': payLeave(function () { finMsg(''); finSet('finConfirm', ''); PAY.filter = ''; payLoadOverview(); }); break;
    case 'save': paySave(); break;
    case 'submit': paySubmit(); break;
    case 'approve': payApprove(); break;
    case 'return': payWithReason('Return <strong>' + escapeHtml(PAY.run.run.label) + '</strong> to the maker? Say what needs to change.', 'Return', 'payroll.returnRun', 'Returned to the maker.'); break;
    case 'recall': payWithReason('Recall <strong>' + escapeHtml(PAY.run.run.label) + '</strong>? The Head of IT will be told not to use the file already sent, and the month goes back to the maker.', 'Recall', 'payroll.recallRun', 'Recalled. The Head of IT has been told not to use the earlier file.'); break;
    case 'download': payDownloadFile(); break;
    case 'csv': payDownloadCsv(); break;
    case 'paid':
      finAsk('Mark <strong>' + escapeHtml(PAY.run.run.label) + '</strong> as paid? Do this only after the payment has gone through. It cannot be undone.', 'Mark paid', function () {
        call('payroll.markPaid', { runId: PAY.run.run.id }).then(function (r) {
          finSet('finConfirm', ''); if (!r || !r.success) { finMsg((r && r.error) || 'Not changed.'); return; }
          finMsg('Marked paid.', true); payOpenRun(PAY.run.run.id, true);
        }).catch(finFail);
      }); break;
    case 'resend': b.disabled = true;
      call('payroll.resendEmail', { runId: PAY.run.run.id }).then(function (r) {
        if (!r || !r.success) { b.disabled = false; finMsg((r && r.error) || 'Not sent.'); return; }
        finMsg(r.emailStatus + '.', true); payOpenRun(PAY.run.run.id, true);
      }).catch(finFail); break;
    case 'edit-staff': PAY.editStaffId = b.getAttribute('data-id'); finMsg(''); payRenderStaff(); window.scrollTo && window.scrollTo(0, 0); break;
    case 'cancel-edit': PAY.editStaffId = ''; finMsg(''); payRenderStaff(); break;
    case 'save-staff': payReviewStaff(); break;
  }
}

function payOnInput(e) {
  if (FIN.sub !== 'payroll') return;
  var t = e.target;
  if (t.id === 'paySearch') {
    PAY.filter = t.value.trim().toLowerCase();
    PAY.run.lines.forEach(function (l, i) {
      var row = document.querySelector('[data-pay-row="' + i + '"]');
      if (row) row.style.display = PAY.filter && l.name.toLowerCase().indexOf(PAY.filter) === -1 ? 'none' : '';
    });
    return;
  }
  var f = t.getAttribute && t.getAttribute('data-pay-f');
  if (!f || f === 'pay' || !PAY.run) return;
  var i = Number(t.getAttribute('data-i'));
  PAY.run.lines[i][f] = t.value;
  PAY.dirty = true;
  if (f !== 'otherNote') payRefreshRow(i);
}

function payOnChange(e) {
  if (FIN.sub !== 'payroll') return;
  var t = e.target;
  if (t.getAttribute && t.getAttribute('data-pay-f') === 'pay' && PAY.run) {
    var i = Number(t.getAttribute('data-i'));
    PAY.run.lines[i].pay = t.checked; PAY.dirty = true; payRefreshRow(i);
  }
}

window.addEventListener('beforeunload', function (e) {
  if (PAY.dirty && PAY.view === 'month' && PAY.run && PAY.run.canEdit) { e.preventDefault(); e.returnValue = ''; }
});

window.payShow = payShow;
window.payAllowed = payAllowed;
