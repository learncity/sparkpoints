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

const $ = function (id) { return document.getElementById(id); };

let state = {
  email: '', code: '', fullName: '', role: '', assignedClasses: [],
  canLog: false, canAmendDelete: false,
  students: [], achievement: [], behavioural: []
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
    state.canLog = r.canLog;
    state.canAmendDelete = r.canAmendDelete;

    try {
      sessionStorage.setItem(STORE_EMAIL, state.email);
      sessionStorage.setItem(STORE_CODE, state.code);
    } catch (e) { /* private browsing — sign-in still works for this session */ }

    enterPortal();
  }).catch(function () {
    $('signInBtn').disabled = false;
    $('signInError').textContent = 'Could not reach the server. Check your connection and try again.';
  });
}

function signOut() {
  try { sessionStorage.removeItem(STORE_EMAIL); sessionStorage.removeItem(STORE_CODE); } catch (e) {}
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
    populateStudents();
    populateCategories();
  }).catch(function () {
    fatal('Could not reach the server while loading the form.');
  });
}

function populateStudents() {
  const sel = $('studentSelect');
  sel.innerHTML = '';
  if (!state.students.length) {
    sel.innerHTML = '<option value="">No students in your assigned classes</option>';
    return;
  }
  const sorted = [...state.students].sort(function (a, b) { return a.name.localeCompare(b.name); });
  sorted.forEach(function (s) {
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

function populateCategories() {
  const student = currentStudent();
  const entryType = $('entryTypeSelect').value;
  const sel = $('categorySelect');
  sel.innerHTML = '';

  if (!student) { sel.innerHTML = '<option value="">Choose a student first</option>'; return; }

  const list = entryType === 'Achievement Points' ? state.achievement : state.behavioural;
  const options = list.filter(function (c) { return c.section === student.section; });

  if (!options.length) { sel.innerHTML = '<option value="">No categories for this section</option>'; return; }
  options.forEach(function (c) {
    const opt = document.createElement('option');
    opt.value = c.category;
    opt.textContent = c.category;
    sel.appendChild(opt);
  });
}

/* ---------- submitting an entry ---------- */

function submitEntry() {
  const studentId = $('studentSelect').value;
  const category = $('categorySelect').value;
  const note = $('noteInput').value.trim();

  $('logError').textContent = '';
  $('logSuccess').textContent = '';

  if (!studentId) { $('logError').textContent = 'Choose a student.'; return; }
  if (!category) { $('logError').textContent = 'Choose a category.'; return; }
  if (note.length < 10) { $('logError').textContent = 'Note must describe what happened — at least 10 characters.'; return; }

  $('submitBtn').disabled = true;
  $('submitBtn').textContent = 'Saving...';

  call('logEntry', {
    studentId: studentId,
    entryType: $('entryTypeSelect').value,
    category: category,
    note: note,
    actionTaken: $('actionSelect').value,
    followUp: $('followUpSelect').value,
    term: $('termSelect').value
  }).then(function (r) {
    $('submitBtn').disabled = false;
    $('submitBtn').textContent = 'Save Entry';
    if (!r || !r.success) { $('logError').textContent = (r && r.error) || 'Could not save the entry.'; return; }
    $('logSuccess').textContent = 'Saved — ' + (r.pointsAwarded > 0 ? '+' : '') + r.pointsAwarded + ' points recorded for ' +
      (currentStudent() ? currentStudent().name : 'the student') + '.';
    $('noteInput').value = '';
  }).catch(function () {
    $('submitBtn').disabled = false;
    $('submitBtn').textContent = 'Save Entry';
    $('logError').textContent = 'Could not reach the server. Your entry was not saved — try again.';
  });
}

/* ---------- wiring ---------- */

function wire() {
  const needed = ['signInScreen', 'logScreen', 'staffEmail', 'staffCode', 'signInBtn', 'signInError',
    'staffNameDisplay', 'staffRoleDisplay', 'signOutBtn', 'termSelect', 'studentSelect', 'entryTypeSelect',
    'categorySelect', 'noteInput', 'actionSelect', 'followUpSelect', 'submitBtn', 'logError', 'logSuccess'];
  const missing = needed.filter(function (id) { return !document.getElementById(id); });
  if (missing.length) { fatal('index.html is missing these elements: ' + missing.join(', ')); return; }

  $('signInBtn').addEventListener('click', function () { trySignIn($('staffEmail').value, $('staffCode').value); });
  $('staffCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') trySignIn($('staffEmail').value, $('staffCode').value); });
  $('signOutBtn').addEventListener('click', signOut);
  $('studentSelect').addEventListener('change', populateCategories);
  $('entryTypeSelect').addEventListener('change', populateCategories);
  $('submitBtn').addEventListener('click', submitEntry);

  let savedEmail, savedCode;
  try { savedEmail = sessionStorage.getItem(STORE_EMAIL); savedCode = sessionStorage.getItem(STORE_CODE); } catch (e) {}
  if (savedEmail && savedCode) {
    $('staffEmail').value = savedEmail;
    $('staffCode').value = savedCode;
    trySignIn(savedEmail, savedCode);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();
