/* Learn City Spark Points — staff portal
   Structure and error-handling pattern mirrors RecruitmentTest/app.js. */
'use strict';

/* ---------- fail loudly, not silently ---------- */

function fatal(message) {
  var bar = document.getElementById('lcFatal');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'lcFatal';
    bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#9b1c1c;color:#fff;' +
      'padding:12px 16px;font:14px/1.5 Arial,Helvetica,sans-serif;white-space:pre-wrap';
    (document.body || document.documentElement).appendChild(bar);
  }
  bar.textContent = 'Spark Points startup problem — report this line to Head of IT:\n' + message;
}

window.addEventListener('error', function (e) {
  fatal((e.message || 'Unknown error') + '  [' + (e.filename || '?').split('/').pop() + ' line ' + (e.lineno || '?') + ']');
});

/* SETUP: paste your deployed Apps Script /exec URL here. */
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxahzgarriiZeHw-RCWr8PivATnm1ajQa3cUcadNyyj0eNYdUFT4zbt8_yqxQSxSBqW/exec';

const STORE_EMAIL = 'LC_SPARK_EMAIL';
const STORE_CODE = 'LC_SPARK_CODE';

const ALL_CLASSES = ['Nursery 1', 'Nursery 2', 'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
  'JSS 1', 'JSS 2', 'JSS 3', 'SSS 1', 'SSS 2', 'SSS 3'];

const $ = function (id) { return document.getElementById(id); };

let state = {
  email: '', code: '', fullName: '', role: '', assignedClasses: [], homeClass: '',
  canLog: false, canAmendDelete: false,
  students: [], achievement: [], behavioural: [],
  lastRecent: [], currentDashStudentId: '',
  bulkMode: false, currentSingleClass: ''
};

/* ---------- server calls ---------- */

function call(action, extra) {
  const payload = Object.assign({ action: action, email: state.email, code: state.code }, extra || {});
  return fetch(ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ data: JSON.stringify(payload) })
  }).then(function (r) { return r.json(); });
}

/* ---------- sign in ---------- */

function trySignIn(email, code) {
  state.email = email.trim().toLowerCase();
  state.code = code.trim();

  $('signInBtn').disabled = true;
  $('signInError').textContent = 'Checking...';

  call('verifyStaff').then(function (r) {
    if (!r || !r.success) {
      $('signInBtn').disabled = false;
      $('signInError').textContent = (r && r.error) || 'Sign in failed.';
      return;
    }
    state.fullName = r.fullName;
    state.role = r.role;
    state.assignedClasses = r.assignedClasses;
    state.homeClass = r.homeClass || '';
    state.canLog = r.canLog;
    state.canAmendDelete = r.canAmendDelete;

    try {
      /* "Remember me" persists across visits (localStorage); unchecked
         still keeps the existing within-tab convenience (sessionStorage),
         same as before this checkbox existed. Only one is ever set at a
         time, so unchecking it on a later sign-in correctly stops it
         persisting from here on. */
      if ($('rememberMeToggle') && $('rememberMeToggle').checked) {
        localStorage.setItem(STORE_EMAIL, state.email);
        localStorage.setItem(STORE_CODE, state.code);
        sessionStorage.removeItem(STORE_EMAIL);
        sessionStorage.removeItem(STORE_CODE);
      } else {
        sessionStorage.setItem(STORE_EMAIL, state.email);
        sessionStorage.setItem(STORE_CODE, state.code);
        localStorage.removeItem(STORE_EMAIL);
        localStorage.removeItem(STORE_CODE);
      }
    } catch (e) { /* private browsing — sign-in still works for this session */ }

    enterPortal();
  }).catch(function () {
    $('signInBtn').disabled = false;
    $('signInError').textContent = 'Could not reach the server. Check your connection and try again.';
  });
}

function signOut() {
  try {
    sessionStorage.removeItem(STORE_EMAIL); sessionStorage.removeItem(STORE_CODE);
    localStorage.removeItem(STORE_EMAIL); localStorage.removeItem(STORE_CODE);
  } catch (e) {}
  location.reload();
}

/* ---------- entering the portal ---------- */

function enterPortal() {
  $('signInScreen').classList.add('hidden');
  $('logScreen').classList.remove('hidden');
  $('staffNameDisplay').textContent = state.fullName;
  $('staffRoleDisplay').textContent = state.role;

  if (!state.canLog) {
    $('logError').textContent = 'Your account can view records but is not set up to log new entries. Contact Head of IT if this seems wrong.';
    $('submitBtn').disabled = true;
  }

  $('submitBtn').disabled = !state.canLog;
  $('logError').textContent = state.canLog ? '' : $('logError').textContent;
  $('studentSelect').innerHTML = '<option value="">Loading students...</option>';

  call('getFormData').then(function (r) {
    if (!r || !r.success) { fatal((r && r.error) || 'Could not load student list.'); return; }
    state.students = r.students;
    state.achievement = r.achievement;
    state.behavioural = r.behavioural;
    $('currentTermDisplay').textContent = 'Logging for: ' + r.term + ', ' + r.session;
    populateSingleClasses();
    populateCategories();
    populateDashboardPickers();
    populateBulkClasses();
  }).catch(function () {
    fatal('Could not reach the server while loading the form.');
  });
}

function populateDashboardPickers() {
  const studentSel = $('dashStudentSelect');
  studentSel.innerHTML = '<option value="">Choose a student...</option>';
  const sorted = [...state.students].sort(function (a, b) { return a.name.localeCompare(b.name); });
  sorted.forEach(function (s) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name + ' — ' + s.className;
    studentSel.appendChild(opt);
  });

  const classSel = $('dashClassSelect');
  classSel.innerHTML = '<option value="">Choose a class...</option>';
  const classes = state.assignedClasses.indexOf('ALL') !== -1 ? ALL_CLASSES : state.assignedClasses;
  classes.forEach(function (c) {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    classSel.appendChild(opt);
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tabPanel').forEach(function (p) { p.classList.add('hidden'); });
  document.querySelectorAll('.tabBtn').forEach(function (b) { b.classList.remove('activeTab'); });
  $(tabId).classList.remove('hidden');
  document.querySelector('.tabBtn[data-tab="' + tabId + '"]').classList.add('activeTab');
}

/* Single-entry mode used to show every student across every one of a
   staff member's assigned classes in one merged, name-sorted list. For
   anyone covering more than one class (chiefly Section Heads), that made
   it easy to pick a same-first-name student from the WRONG class by
   mistake — exactly what happened here. Now it defaults to just their
   Home Class, with an explicit class switcher for when they deliberately
   need to log for a different class they cover. A Class Teacher with only
   one assigned class never sees the picker at all — there's nothing to
   switch between. */
function populateSingleClasses() {
  const area = $('singleClassArea');
  const sel = $('singleClassSelect');
  const classes = state.assignedClasses.indexOf('ALL') !== -1 ? ALL_CLASSES : state.assignedClasses;

  if (classes.length <= 1) {
    area.classList.add('hidden');
    state.currentSingleClass = classes[0] || '';
    populateStudentsForSingleClass();
    return;
  }

  area.classList.remove('hidden');
  sel.innerHTML = '';
  classes.forEach(function (c) {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
  const defaultClass = (state.homeClass && classes.indexOf(state.homeClass) !== -1) ? state.homeClass : classes[0];
  sel.value = defaultClass;
  state.currentSingleClass = defaultClass;
  populateStudentsForSingleClass();
}

function populateStudentsForSingleClass() {
  const sel = $('studentSelect');
  sel.innerHTML = '';
  const cls = state.currentSingleClass;
  const inClass = state.students.filter(function (s) { return s.className === cls; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });

  if (!inClass.length) {
    sel.innerHTML = '<option value="">No students in this class</option>';
    populateCategories();
    return;
  }
  inClass.forEach(function (s) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name + ' — ' + s.className;
    sel.appendChild(opt);
  });
  populateCategories();
}

function currentStudent() {
  const id = $('studentSelect').value;
  return state.students.find(function (s) { return s.id === id; });
}

function sectionForClass(className) {
  /* Nursery is its own section — separate category library and tier
     scale from Primary, not an alias of it. */
  if (!className) return 'Secondary';
  if (className.indexOf('Nursery') === 0) return 'Nursery';
  if (className.indexOf('Primary') === 0) return 'Primary';
  return 'Secondary';
}

/* Returns the section to filter categories by, regardless of which mode
   is active — the single student's section, or the bulk class's section. */
function currentSection() {
  if (state.bulkMode) {
    const cls = $('bulkClassSelect').value;
    return cls ? sectionForClass(cls) : '';
  }
  const student = currentStudent();
  return student ? student.section : '';
}

function populateCategories() {
  const section = currentSection();
  const entryType = $('entryTypeSelect').value;
  const sel = $('categorySelect');
  sel.innerHTML = '';

  $('notifyParentArea').classList.toggle('hidden', entryType !== 'Behavioural Points');

  if (!section) { sel.innerHTML = '<option value="">Choose a student first</option>'; return; }

  const list = entryType === 'Achievement Points' ? state.achievement : state.behavioural;
  const options = list.filter(function (c) { return c.section === section; });

  if (!options.length) { sel.innerHTML = '<option value="">No categories for this section</option>'; return; }
  options.forEach(function (c) {
    const opt = document.createElement('option');
    opt.value = c.category;
    opt.textContent = c.category;
    sel.appendChild(opt);
  });
}

/* ---------- bulk mode ---------- */

function toggleBulkMode() {
  state.bulkMode = $('bulkModeToggle').checked;
  $('singleStudentArea').classList.toggle('hidden', state.bulkMode);
  $('bulkStudentArea').classList.toggle('hidden', !state.bulkMode);
  cancelConfirm(); // a confirmation prepared for the old mode no longer matches what's on screen
  populateCategories();
}

function populateBulkClasses() {
  const sel = $('bulkClassSelect');
  sel.innerHTML = '<option value="">Choose a class...</option>';
  const classes = state.assignedClasses.indexOf('ALL') !== -1 ? ALL_CLASSES : state.assignedClasses;
  classes.forEach(function (c) {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
  /* Same reasoning as the single-entry picker: default to their own Home
     Class rather than leaving it blank, so the common case doesn't need an
     extra click — but it's still just a default, freely changeable. */
  if (state.homeClass && classes.indexOf(state.homeClass) !== -1) {
    sel.value = state.homeClass;
    populateBulkStudentList();
  }
}

function populateBulkStudentList() {
  const cls = $('bulkClassSelect').value;
  const box = $('bulkStudentList');
  box.innerHTML = '';
  if (!cls) { box.innerHTML = '<p class="subtitle">Choose a class first.</p>'; populateCategories(); return; }

  const inClass = state.students.filter(function (s) { return s.className === cls; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });

  if (!inClass.length) { box.innerHTML = '<p class="subtitle">No students found in this class.</p>'; populateCategories(); return; }

  inClass.forEach(function (s) {
    const label = document.createElement('label');
    label.className = 'check';
    label.innerHTML = '<input type="checkbox" class="bulkStudentCheck" value="' + s.id + '"> ' + escapeHtml(s.name);
    box.appendChild(label);
  });
  populateCategories();
}

function getBulkSelectedIds() {
  return Array.prototype.slice.call(document.querySelectorAll('.bulkStudentCheck:checked')).map(function (el) { return el.value; });
}

/* ---------- submitting an entry ---------- */

/* Every save now goes through an on-page confirmation step showing exactly
   who it's for and whether a parent will be notified, before anything is
   actually sent. This is deliberately NOT a native confirm() popup — those
   get reflexively dismissed on a high-frequency action like this one, which
   would defeat the point. See pendingEntry below for how the confirmed data
   and the saved data are guaranteed to be the same thing. */
/* While the confirmation panel is open, the form is locked. This is
   defense-in-depth, not the primary safeguard — the primary one is that
   doSingleSave/doBulkSave never re-read the form at all (see pendingEntry
   above them). Locking just stops the form from looking editable while a
   confirmation is showing, which would be confusing even though it can no
   longer change what gets saved. */
function confirmLockFields() {
  return ['singleClassSelect', 'studentSelect', 'bulkClassSelect', 'entryTypeSelect', 'categorySelect',
    'notifyParentToggle', 'noteInput', 'actionSelect', 'followUpSelect'];
}
function lockFormForConfirm() {
  confirmLockFields().forEach(function (id) { const el = $(id); if (el) el.disabled = true; });
  document.querySelectorAll('.bulkStudentCheck').forEach(function (el) { el.disabled = true; });
}
function unlockForm() {
  confirmLockFields().forEach(function (id) { const el = $(id); if (el) el.disabled = false; });
  document.querySelectorAll('.bulkStudentCheck').forEach(function (el) { el.disabled = false; });
}

/* pendingEntry holds the EXACT data that was shown in the confirmation —
   captured once, at the moment Save Entry was clicked. doSingleSave/
   doBulkSave use this snapshot, and ONLY this snapshot — they never read
   the form a second time. This is deliberate: reading the form twice
   (once for the confirmation text, again at save time) is a real
   vulnerability whenever anything can change the form state in between —
   a gap in the lock, a timing issue, anything. Confirming and saving must
   use the same frozen data, or the confirmation can't be trusted. */
let pendingEntry = null;

function submitEntry() {
  if (state.bulkMode) { prepareBulkConfirm(); return; }
  prepareSingleConfirm();
}

function prepareSingleConfirm() {
  const studentId = $('studentSelect').value;
  const category = $('categorySelect').value;
  const note = $('noteInput').value.trim();
  const entryType = $('entryTypeSelect').value;
  const notifyParent = $('notifyParentToggle').checked;
  const actionTaken = $('actionSelect').value;
  const followUp = $('followUpSelect').value;

  $('logError').textContent = '';
  $('logSuccess').textContent = '';

  if (!studentId) { $('logError').textContent = 'Choose a student.'; return; }
  if (!category) { $('logError').textContent = 'Choose a category.'; return; }
  if (entryType === 'Behavioural Points' && note.length < 10) {
    $('logError').textContent = 'Note must describe what happened — at least 10 characters for a Behavioural Points entry.';
    return;
  }

  const student = currentStudent();
  const willNotify = entryType === 'Behavioural Points' && notifyParent;

  // Frozen at this exact moment — this, and only this, is what gets saved.
  pendingEntry = {
    mode: 'single', studentId: studentId, category: category, note: note, entryType: entryType,
    notifyParent: notifyParent, actionTaken: actionTaken, followUp: followUp,
    studentName: student ? student.name : '', studentClass: student ? student.className : ''
  };

  $('confirmSummary').innerHTML = 'Log <strong>' + escapeHtml(category) + '</strong> for <strong>' +
    escapeHtml(pendingEntry.studentName) + '</strong> (' + escapeHtml(pendingEntry.studentClass) + ').' +
    (willNotify ? '<br><strong>The parent will be notified.</strong>' : '<br>The parent will not be notified for this entry.');

  lockFormForConfirm();
  $('submitBtn').classList.add('hidden');
  $('confirmPanel').classList.remove('hidden');
}

function doSingleSave() {
  const entry = pendingEntry;
  if (!entry) return;

  $('confirmSaveBtn').disabled = true;
  $('confirmSaveBtn').textContent = 'Saving...';

  call('logEntry', {
    studentId: entry.studentId,
    entryType: entry.entryType,
    category: entry.category,
    note: entry.note,
    actionTaken: entry.actionTaken,
    followUp: entry.followUp,
    notifyParent: entry.notifyParent
  }).then(function (r) {
    endConfirm();
    if (!r || !r.success) { $('logError').textContent = (r && r.error) || 'Could not save the entry.'; return; }
    $('logSuccess').textContent = 'Saved — ' + (r.pointsAwarded > 0 ? '+' : '') + r.pointsAwarded + ' points recorded for ' +
      entry.studentName + '.' + (r.parentNotified ? ' Parent notified.' : '');
    $('noteInput').value = '';
  }).catch(function () {
    endConfirm();
    $('logError').textContent = 'Could not reach the server. Your entry was not saved — try again.';
  });
}

function prepareBulkConfirm() {
  const studentIds = getBulkSelectedIds();
  const category = $('categorySelect').value;
  const note = $('noteInput').value.trim();
  const entryType = $('entryTypeSelect').value;
  const notifyParent = $('notifyParentToggle').checked;
  const actionTaken = $('actionSelect').value;
  const followUp = $('followUpSelect').value;

  $('logError').textContent = '';
  $('logSuccess').textContent = '';

  if (!studentIds.length) { $('logError').textContent = 'Tick at least one student.'; return; }
  if (!category) { $('logError').textContent = 'Choose a category.'; return; }
  if (entryType === 'Behavioural Points' && note.length < 10) {
    $('logError').textContent = 'Note must describe what happened — at least 10 characters for a Behavioural Points entry.';
    return;
  }

  const willNotify = entryType === 'Behavioural Points' && notifyParent;
  const names = studentIds.map(function (id) {
    const s = state.students.find(function (x) { return x.id === id; });
    return s ? s.name : id;
  });
  const nameList = names.length <= 3 ? names.join(', ') : (names.slice(0, 3).join(', ') + ' and ' + (names.length - 3) + ' more');

  // Frozen at this exact moment — this, and only this, is what gets saved.
  pendingEntry = {
    mode: 'bulk', studentIds: studentIds, category: category, note: note, entryType: entryType,
    notifyParent: notifyParent, actionTaken: actionTaken, followUp: followUp, names: names
  };

  $('confirmSummary').innerHTML = 'Log <strong>' + escapeHtml(category) + '</strong> for <strong>' + names.length +
    ' student' + (names.length === 1 ? '' : 's') + '</strong>: ' + escapeHtml(nameList) + '.' +
    (willNotify ? '<br><strong>' + names.length + ' parent' + (names.length === 1 ? '' : 's') + ' will be notified.</strong>' : '<br>Parents will not be notified for this entry.');

  lockFormForConfirm();
  $('submitBtn').classList.add('hidden');
  $('confirmPanel').classList.remove('hidden');
}

function doBulkSave() {
  const entry = pendingEntry;
  if (!entry) return;

  $('confirmSaveBtn').disabled = true;
  $('confirmSaveBtn').textContent = 'Saving...';

  call('logBulkEntries', {
    studentIds: entry.studentIds,
    entryType: entry.entryType,
    category: entry.category,
    note: entry.note,
    actionTaken: entry.actionTaken,
    followUp: entry.followUp,
    notifyParent: entry.notifyParent
  }).then(function (r) {
    endConfirm();
    if (!r || !r.success) { $('logError').textContent = (r && r.error) || 'Could not save these entries.'; return; }
    $('logSuccess').textContent = 'Saved — ' + (r.pointsAwarded > 0 ? '+' : '') + r.pointsAwarded + ' points recorded for ' +
      r.count + ' student' + (r.count === 1 ? '' : 's') + '. ' + r.notified + ' parent' + (r.notified === 1 ? '' : 's') + ' notified.';
    $('noteInput').value = '';
    document.querySelectorAll('.bulkStudentCheck:checked').forEach(function (el) { el.checked = false; });
  }).catch(function () {
    endConfirm();
    $('logError').textContent = 'Could not reach the server. Nothing was saved — try again.';
  });
}

function confirmAndSave() {
  if (!pendingEntry) return;
  if (pendingEntry.mode === 'bulk') doBulkSave(); else doSingleSave();
}

function cancelConfirm() {
  $('confirmPanel').classList.add('hidden');
  $('submitBtn').classList.remove('hidden');
  unlockForm();
  pendingEntry = null;
}

function endConfirm() {
  $('confirmSaveBtn').disabled = false;
  $('confirmSaveBtn').textContent = 'Confirm & Save';
  $('confirmPanel').classList.add('hidden');
  $('submitBtn').classList.remove('hidden');
  unlockForm();
  pendingEntry = null;
}

/* ---------- student dashboard ---------- */

function loadStudentDashboard(studentId) {
  $('studentDashError').textContent = '';
  $('studentDashContent').classList.add('hidden');
  if (!studentId) return;
  state.currentDashStudentId = studentId;

  call('getStudentDashboard', { studentId: studentId }).then(function (r) {
    if (!r || !r.success) { $('studentDashError').textContent = (r && r.error) || 'Could not load this student.'; return; }
    renderStudentDashboard(r);
  }).catch(function () {
    $('studentDashError').textContent = 'Could not reach the server.';
  });
}

function renderStudentDashboard(r) {
  $('statAchievement').textContent = fmtPts(r.stats.achievementTerm);
  $('statBehavioural').textContent = fmtPts(r.stats.behaviouralTerm);
  $('statNet').textContent = r.stats.netTerm;
  $('statTier').textContent = r.stats.tier;
  $('statSession').textContent = r.stats.sessionNet;
  $('statL1').textContent = r.stats.l1;
  $('statL2').textContent = r.stats.l2;
  $('statL3').textContent = r.stats.l3;
  $('statL4').textContent = r.stats.l4;
  $('statL5').textContent = r.stats.l5;
  $('statFlag').textContent = r.stats.flag;
  $('statRecommended').textContent = r.stats.recommendedAction;

  const list = $('recentActivityList');
  list.innerHTML = '';
  state.lastRecent = r.recent;
  if (!r.recent.length) {
    list.innerHTML = '<p class="subtitle">No activity recorded yet.</p>';
  } else {
    r.recent.forEach(function (e) {
      const row = document.createElement('div');
      row.className = 'activityRow';
      row.id = 'entry-' + e.id;

      if (e.deleted) {
        row.innerHTML = '<strong>' + escapeHtml(e.category) + '</strong> (' + fmtPts(e.points) + ') — ' +
          escapeHtml(e.date) + ' ' + escapeHtml(e.time || '') +
          '<br><span class="deletedBadge">DELETED</span> <span class="subtitle">' + escapeHtml(e.deletedReason) + '</span>';
        list.appendChild(row);
        return;
      }

      let buttons = '';
      if (r.canAmendDelete) {
        buttons = '<div class="entryActions">' +
          '<button type="button" class="smallBtn" onclick="startEdit(\'' + e.id + '\')">Edit</button> ' +
          '<button type="button" class="smallBtn danger" onclick="confirmDelete(\'' + e.id + '\')">Delete</button>' +
          '</div>';
      }
      row.innerHTML = '<strong>' + escapeHtml(e.category) + '</strong> (' + fmtPts(e.points) + ') — ' +
        escapeHtml(e.date) + ' ' + escapeHtml(e.time || '') +
        '<br><span class="subtitle">' + escapeHtml(e.note || '') + '</span>' +
        '<br><span class="subtitle">Logged by ' + escapeHtml(e.staff || '') + '</span>' + buttons;
      list.appendChild(row);
    });
  }
  $('studentDashContent').classList.remove('hidden');
}

/* ---------- amend / delete ---------- */

function startEdit(id) {
  const entry = state.lastRecent.find(function (e) { return String(e.id) === String(id); });
  if (!entry) return;
  const row = $('entry-' + id);
  row.innerHTML =
    '<label>Note</label><textarea id="editNote-' + id + '" rows="3">' + escapeHtml(entry.note || '') + '</textarea>' +
    '<label>Action Taken</label><input id="editAction-' + id + '" value="' + escapeHtml(entry.actionTaken || '') + '">' +
    '<label>Follow-up</label><input id="editFollowUp-' + id + '" value="' + escapeHtml(entry.followUp || '') + '">' +
    '<div class="entryActions">' +
    '<button type="button" class="smallBtn" onclick="saveEdit(\'' + id + '\')">Save</button> ' +
    '<button type="button" class="smallBtn" onclick="loadStudentDashboard(state.currentDashStudentId)">Cancel</button>' +
    '</div>';
}

function saveEdit(id) {
  const note = $('editNote-' + id).value;
  const actionTaken = $('editAction-' + id).value;
  const followUp = $('editFollowUp-' + id).value;
  call('amendEntry', { id: id, note: note, actionTaken: actionTaken, followUp: followUp }).then(function (r) {
    if (!r || !r.success) { alert((r && r.error) || 'Could not save changes.'); return; }
    loadStudentDashboard(state.currentDashStudentId);
  }).catch(function () { alert('Could not reach the server.'); });
}

function confirmDelete(id) {
  const reason = prompt('Reason for deleting this entry (required):');
  if (reason === null) return;
  if (reason.trim().length < 5) { alert('Please give a brief reason — at least 5 characters.'); return; }
  call('deleteEntry', { id: id, reason: reason.trim() }).then(function (r) {
    if (!r || !r.success) { alert((r && r.error) || 'Could not delete this entry.'); return; }
    loadStudentDashboard(state.currentDashStudentId);
  }).catch(function () { alert('Could not reach the server.'); });
}

/* ---------- class dashboard ---------- */

function loadClassDashboard(className) {
  $('classDashError').textContent = '';
  $('classDashContent').classList.add('hidden');
  if (!className) return;

  call('getClassDashboard', { className: className }).then(function (r) {
    if (!r || !r.success) { $('classDashError').textContent = (r && r.error) || 'Could not load this class.'; return; }
    renderClassDashboard(r);
  }).catch(function () {
    $('classDashError').textContent = 'Could not reach the server.';
  });
}

function renderClassDashboard(r) {
  $('classTotal').textContent = r.totalStudents;
  $('classAch7d').textContent = fmtPts(r.achievement7d);
  $('classBeh7d').textContent = fmtPts(r.behavioural7d);
  $('classMostCommon').textContent = r.mostCommonBehaviour;

  fillList('classApproachingList', r.approachingEscalation, function (s) {
    return '<strong>' + escapeHtml(s.name) + '</strong> — L2: ' + s.l2 + ', L3: ' + s.l3 + ' — ' + escapeHtml(s.flag);
  }, 'No students currently approaching escalation.');

  fillList('classTopList', r.topAchievements, function (a) {
    return '<strong>' + escapeHtml(a.name) + '</strong> — ' + escapeHtml(a.category) + ' (' + fmtPts(a.points) + ') — ' + escapeHtml(a.date) + ' ' + escapeHtml(a.time || '');
  }, 'No achievements recorded yet this term.');

  fillList('classFollowUpList', r.needingFollowUp, function (f) {
    return '<strong>' + escapeHtml(f.name) + '</strong> — ' + escapeHtml(f.category) + ' — ' + escapeHtml(f.followUp) + ' (' + escapeHtml(f.staff) + ')';
  }, 'Nothing outstanding.');

  $('classDashContent').classList.remove('hidden');
}

function fillList(id, items, renderFn, emptyText) {
  const el = $(id);
  el.innerHTML = '';
  if (!items.length) { el.innerHTML = '<p class="subtitle">' + emptyText + '</p>'; return; }
  items.forEach(function (item) {
    const row = document.createElement('div');
    row.className = 'activityRow';
    row.innerHTML = renderFn(item);
    el.appendChild(row);
  });
}

/* ---------- small helpers ---------- */

function fmtPts(n) {
  n = Number(n || 0);
  return (n > 0 ? '+' : '') + n;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ---------- wiring ---------- */

function wire() {
  const needed = ['signInScreen', 'logScreen', 'signInForm', 'staffEmail', 'staffCode', 'rememberMeToggle', 'signInBtn', 'signInError',
    'staffNameDisplay', 'staffRoleDisplay', 'signOutBtn', 'currentTermDisplay',
    'bulkModeToggle', 'singleStudentArea', 'singleClassArea', 'singleClassSelect', 'studentSelect', 'bulkStudentArea', 'bulkClassSelect', 'bulkStudentList',
    'entryTypeSelect', 'categorySelect', 'notifyParentArea', 'notifyParentToggle',
    'noteInput', 'actionSelect', 'followUpSelect', 'submitBtn', 'confirmPanel', 'confirmSummary', 'confirmSaveBtn', 'confirmCancelBtn', 'logError', 'logSuccess',
    'dashStudentSelect', 'studentDashError', 'studentDashContent',
    'statAchievement', 'statBehavioural', 'statNet', 'statTier', 'statSession',
    'statL1', 'statL2', 'statL3', 'statL4', 'statL5', 'statFlag', 'statRecommended', 'recentActivityList',
    'dashClassSelect', 'classDashError', 'classDashContent',
    'classTotal', 'classAch7d', 'classBeh7d', 'classMostCommon',
    'classApproachingList', 'classTopList', 'classFollowUpList'];
  const missing = needed.filter(function (id) { return !document.getElementById(id); });
  if (missing.length) { fatal('index.html is missing these elements: ' + missing.join(', ')); return; }

  $('signInForm').addEventListener('submit', function (e) {
    e.preventDefault();
    trySignIn($('staffEmail').value, $('staffCode').value);
  });
  $('signOutBtn').addEventListener('click', signOut);
  $('studentSelect').addEventListener('change', populateCategories);
  $('entryTypeSelect').addEventListener('change', populateCategories);
  $('submitBtn').addEventListener('click', submitEntry);
  $('confirmSaveBtn').addEventListener('click', confirmAndSave);
  $('confirmCancelBtn').addEventListener('click', cancelConfirm);
  $('bulkModeToggle').addEventListener('change', toggleBulkMode);
  $('bulkClassSelect').addEventListener('change', populateBulkStudentList);
  $('singleClassSelect').addEventListener('change', function () {
    state.currentSingleClass = $('singleClassSelect').value;
    populateStudentsForSingleClass();
  });

  document.querySelectorAll('.tabBtn').forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.getAttribute('data-tab')); });
  });
  $('dashStudentSelect').addEventListener('change', function () { loadStudentDashboard(this.value); });
  $('dashClassSelect').addEventListener('change', function () { loadClassDashboard(this.value); });

  /* A link from the enrolment email looks like ?email=...&code=... —
     prefill and sign in automatically if both are present, taking
     priority over anything already saved on this device. */
  const params = new URLSearchParams(location.search);
  const linkEmail = params.get('email');
  const linkCode = params.get('code');

  if (linkEmail && linkCode) {
    $('staffEmail').value = linkEmail;
    $('staffCode').value = linkCode;
    history.replaceState({}, document.title, location.pathname);
    trySignIn(linkEmail, linkCode);
    return;
  }

  let savedEmail, savedCode;
  try {
    savedEmail = localStorage.getItem(STORE_EMAIL) || sessionStorage.getItem(STORE_EMAIL);
    savedCode = localStorage.getItem(STORE_CODE) || sessionStorage.getItem(STORE_CODE);
  } catch (e) {}
  if (savedEmail && savedCode) {
    $('staffEmail').value = savedEmail;
    $('staffCode').value = savedCode;
    try { if (localStorage.getItem(STORE_EMAIL)) $('rememberMeToggle').checked = true; } catch (e) {}
    trySignIn(savedEmail, savedCode);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();
