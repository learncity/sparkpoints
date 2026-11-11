/* Learn City Help — one shared help panel for every app.
   Add to any page AFTER that page's own app.js:

     <script src="help.js" data-app="sparkpoints"></script>

   Options (attributes on the script tag):
     data-app          which app's questions to show; comma-separate for
                       several (e.g. "sparkpoints,fees"). Required.
     data-endpoint     Apps Script /exec URL. Optional: if left out, the
                       page's own ENDPOINT constant from app.js is used.
     data-email-field  id of the sign-in email box (default staffEmail)
     data-code-field   id of the sign-in code box  (default staffCode)

   Content comes from the HELP tab in the Spark Points sheet. Signed-in
   staff see questions for their role; everyone else sees the general ones. */
(function () {
  'use strict';

  var me = document.currentScript;
  var cfg = {
    app: (me && me.getAttribute('data-app')) || '',
    endpoint: (me && me.getAttribute('data-endpoint')) || '',
    emailField: (me && me.getAttribute('data-email-field')) || 'staffEmail',
    codeField: (me && me.getAttribute('data-code-field')) || 'staffCode'
  };
  var NAVY = '#004AAD';
  var manualUser = null;
  var cache = { key: '', entries: null };

  function endpoint() {
    if (cfg.endpoint) return cfg.endpoint;
    try { if (typeof ENDPOINT !== 'undefined' && ENDPOINT) return ENDPOINT; } catch (e) { /* not defined */ }
    return '';
  }

  function currentUser() {
    if (manualUser) return manualUser;
    var e = document.getElementById(cfg.emailField);
    var c = document.getElementById(cfg.codeField);
    var email = e && e.value ? e.value.trim() : '';
    var code = c && c.value ? c.value.trim() : '';
    return email && code ? { email: email, code: code } : null;
  }

  function currentScreen() {
    var active = document.querySelector('.tabBtn.activeTab, [aria-selected="true"]');
    var label = active ? active.textContent.trim() : '';
    return (label ? label + ' — ' : '') + (document.title || '');
  }

  function call(payload) {
    var url = endpoint();
    if (!url) return Promise.reject(new Error('Help is not connected yet.'));
    var body = new URLSearchParams();
    body.append('data', JSON.stringify(payload));
    return fetch(url, { method: 'POST', body: body })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.success) throw new Error((res && res.error) || 'Something went wrong.');
        return res;
      });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // Plain text -> paragraphs, line breaks and clickable links.
  function formatAnswer(text) {
    return String(text || '').split(/\n\s*\n/).map(function (para) {
      var html = esc(para).replace(/\n/g, '<br>')
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
      return '<p>' + html + '</p>';
    }).join('');
  }

  /* ---------- styles ---------- */
  var css =
    '.lch-btn{position:fixed;right:16px;bottom:16px;z-index:9998;width:48px;height:48px;border-radius:50%;border:0;' +
      'background:' + NAVY + ';color:#fff;font-family:inherit;font-weight:700;font-size:22px;line-height:48px;box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer;padding:0}' +
    '.lch-btn:focus-visible{outline:3px solid #F8A74B;outline-offset:2px}' +
    '.lch-overlay{position:fixed;inset:0;z-index:9998;background:rgba(15,23,42,.35)}' +
    '.lch-panel{position:fixed;top:0;right:0;bottom:0;z-index:9999;width:100%;max-width:420px;background:#fff;color:#1f2937;' +
      'display:flex;flex-direction:column;box-shadow:-6px 0 24px rgba(0,0,0,.15);font-family:inherit}' +
    '.lch-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e5e9f0}' +
    '.lch-head h2{margin:0;font-size:18px;color:' + NAVY + '}' +
    '.lch-x{background:none;border:0;font-size:26px;line-height:1;cursor:pointer;color:#5b6577;padding:4px 8px}' +
    '.lch-body{flex:1;overflow-y:auto;padding:12px 16px 20px}' +
    '.lch-search{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cfd6e3;border-radius:6px;font:inherit;margin-bottom:12px}' +
    '.lch-cat{margin:16px 0 6px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#5b6577}' +
    '.lch-q{border:1px solid #e5e9f0;border-radius:6px;margin-bottom:6px;background:#fff}' +
    '.lch-q summary{cursor:pointer;padding:10px 12px;font-weight:600;list-style:none}' +
    '.lch-q summary::-webkit-details-marker{display:none}' +
    '.lch-q summary:before{content:"+";display:inline-block;width:16px;color:' + NAVY + '}' +
    '.lch-q[open] summary:before{content:"−"}' +
    '.lch-a{padding:0 12px 6px 28px;font-size:14px;line-height:1.55}' +
    '.lch-a p{margin:0 0 8px}.lch-a a{color:' + NAVY + '}' +
    '.lch-muted{color:#5b6577;font-size:14px}' +
    '.lch-report{margin-top:22px;padding-top:14px;border-top:1px solid #e5e9f0}' +
    '.lch-report h3{margin:0 0 8px;font-size:15px}' +
    '.lch-report input,.lch-report textarea{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #cfd6e3;border-radius:6px;font:inherit;margin-bottom:8px}' +
    '.lch-send{background:' + NAVY + ';color:#fff;border:0;border-radius:6px;padding:10px 16px;font:inherit;font-weight:600;cursor:pointer}' +
    '.lch-send[disabled]{opacity:.6;cursor:default}' +
    '.lch-err{color:#b00020;font-size:14px}.lch-ok{color:#166534;font-size:14px}' +
    '.lch-hidden{display:none!important}' +
    '@media print{.lch-btn,.lch-panel,.lch-overlay{display:none!important}}';

  /* ---------- markup ---------- */
  function build() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lch-btn';
    btn.setAttribute('aria-label', 'Help');
    btn.title = 'Help';
    btn.textContent = '?';

    var overlay = document.createElement('div');
    overlay.className = 'lch-overlay lch-hidden';

    var panel = document.createElement('aside');
    panel.className = 'lch-panel lch-hidden';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Help');
    panel.innerHTML =
      '<div class="lch-head"><h2>Help</h2><button type="button" class="lch-x" aria-label="Close help">&times;</button></div>' +
      '<div class="lch-body">' +
        '<input type="search" class="lch-search" placeholder="Search help…" aria-label="Search help">' +
        '<div class="lch-list"><p class="lch-muted">Loading…</p></div>' +
        '<div class="lch-report">' +
          '<h3>Still stuck? Report an issue</h3>' +
          '<div class="lch-anon">' +
            '<input type="text" class="lch-name" placeholder="Your name" autocomplete="name">' +
            '<input type="text" class="lch-contact" placeholder="Email or phone number" autocomplete="email">' +
          '</div>' +
          '<textarea class="lch-msg" rows="4" placeholder="What were you trying to do, and what happened?"></textarea>' +
          '<button type="button" class="lch-send">Send to Head of IT</button>' +
          '<p class="lch-err" aria-live="polite"></p><p class="lch-ok" aria-live="polite"></p>' +
        '</div>' +
      '</div>';

    document.body.appendChild(btn);
    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    var q = function (sel) { return panel.querySelector(sel); };
    var search = q('.lch-search'), list = q('.lch-list');

    function open() {
      overlay.classList.remove('lch-hidden');
      panel.classList.remove('lch-hidden');
      q('.lch-anon').classList.toggle('lch-hidden', !!currentUser());
      q('.lch-err').textContent = ''; q('.lch-ok').textContent = '';
      load();
      setTimeout(function () { search.focus(); }, 50);
    }
    function close() {
      overlay.classList.add('lch-hidden');
      panel.classList.add('lch-hidden');
      btn.focus();
    }

    function load() {
      var user = currentUser();
      var key = cfg.app + '|' + (user ? user.email : '');
      if (cache.key === key && cache.entries) { render(); return; }
      list.innerHTML = '<p class="lch-muted">Loading…</p>';
      var payload = { action: 'help.list', app: cfg.app };
      if (user) { payload.email = user.email; payload.code = user.code; }
      call(payload).then(function (res) {
        cache = { key: key, entries: res.entries || [] };
        render();
      }).catch(function (err) {
        list.innerHTML = '<p class="lch-err">' + esc(err.message) + '</p>';
      });
    }

    function render() {
      var term = search.value.trim().toLowerCase();
      var items = (cache.entries || []).filter(function (e) {
        return !term || (e.question + ' ' + e.answer + ' ' + e.category).toLowerCase().indexOf(term) !== -1;
      });
      if (!items.length) {
        list.innerHTML = '<p class="lch-muted">' + (term ? 'Nothing matches “' + esc(term) + '”. Try other words, or report an issue below.' : 'No help topics yet.') + '</p>';
        return;
      }
      var groups = [], byCat = {};
      items.forEach(function (e) {
        if (!byCat[e.category]) { byCat[e.category] = []; groups.push(e.category); }
        byCat[e.category].push(e);
      });
      list.innerHTML = groups.map(function (cat) {
        return '<div class="lch-cat">' + esc(cat) + '</div>' + byCat[cat].map(function (e) {
          return '<details class="lch-q"' + (term ? ' open' : '') + '><summary>' + esc(e.question) + '</summary>' +
            '<div class="lch-a">' + formatAnswer(e.answer) + '</div></details>';
        }).join('');
      }).join('');
    }

    function send() {
      var err = q('.lch-err'), ok = q('.lch-ok'), sendBtn = q('.lch-send');
      err.textContent = ''; ok.textContent = '';
      var user = currentUser();
      var payload = { action: 'help.report', app: cfg.app, screen: currentScreen(), message: q('.lch-msg').value.trim() };
      if (user) { payload.email = user.email; payload.code = user.code; }
      else { payload.name = q('.lch-name').value.trim(); payload.contact = q('.lch-contact').value.trim(); }
      if (payload.message.length < 10) { err.textContent = 'Please describe the problem in a sentence or two.'; return; }
      sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
      call(payload).then(function () {
        q('.lch-msg').value = '';
        ok.textContent = 'Sent. The Head of IT will get back to you.';
      }).catch(function (e) {
        err.textContent = e.message;
      }).then(function () {
        sendBtn.disabled = false; sendBtn.textContent = 'Send to Head of IT';
      });
    }

    btn.addEventListener('click', open);
    overlay.addEventListener('click', close);
    q('.lch-x').addEventListener('click', close);
    search.addEventListener('input', render);
    q('.lch-send').addEventListener('click', send);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !panel.classList.contains('lch-hidden')) close();
    });
  }

  /* For apps that keep sign-in details elsewhere: call after sign-in
     LCHelp.setUser(email, code), and LCHelp.setUser(null) on sign-out. */
  window.LCHelp = {
    setUser: function (email, code) {
      manualUser = email && code ? { email: email, code: code } : null;
      cache = { key: '', entries: null };
    }
  };

  if (!cfg.app) { console.warn('help.js: add data-app="..." to the script tag.'); return; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
