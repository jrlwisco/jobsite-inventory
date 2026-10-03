/* Job Site Inventory v2 - shared inventory with sign-in (plain JavaScript, no libraries) */
(function () {
  'use strict';

  const TYPES = {
    material: { key: 'material', path: 'materials', one: 'Material', many: 'Materials' },
    tool: { key: 'tool', path: 'tools', one: 'Tool', many: 'Tools' }
  };
  const byPath = { materials: TYPES.material, tools: TYPES.tool };

  const ICONS = {
    material: '<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="currentColor"><rect x="4" y="30" width="18" height="12" rx="1.5"/><rect x="26" y="30" width="18" height="12" rx="1.5"/><rect x="15" y="16" width="18" height="12" rx="1.5"/><rect x="4" y="16" width="9" height="12" rx="1.5"/><rect x="35" y="16" width="9" height="12" rx="1.5"/><rect x="4" y="4" width="18" height="10" rx="1.5"/><rect x="26" y="4" width="18" height="10" rx="1.5"/></g></svg>',
    tool: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M41.6 11.2 35 17.8l-4.8-4.8 6.6-6.6a11 11 0 0 0-14.3 13.6L6.3 36.2a3.4 3.4 0 0 0 0 4.8l.7.7a3.4 3.4 0 0 0 4.8 0l16.2-16.2A11 11 0 0 0 41.6 11.2z"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>',
    box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 3 6.5v11L12 22l9-4.5v-11L12 2zm0 2.2 6.6 3.3L12 10.8 5.4 7.5 12 4.2zM5 9.1l6 3v7.6l-6-3V9.1zm8 10.6v-7.6l6-3v7.6l-6 3z"/></svg>',
    person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4.2" fill="currentColor"/><path fill="currentColor" d="M3.5 21a8.5 8.5 0 0 1 17 0z"/></svg>',
    people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.6" fill="currentColor"/><circle cx="17" cy="9" r="2.8" fill="currentColor"/><path fill="currentColor" d="M1.5 20a7.5 7.5 0 0 1 15 0zM15.5 20a6 6 0 0 0-1.6-4.3A5.6 5.6 0 0 1 22.5 20z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 12H7L6 9z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  const app = document.getElementById('app');
  const titleEl = document.getElementById('pageTitle');
  const backBtn = document.getElementById('backBtn');
  const acctBtn = document.getElementById('acctBtn');
  const bellBtn = document.getElementById('bellBtn');
  const bellBadge = document.getElementById('bellBadge');
  const banner = document.getElementById('offlineBanner');
  let backTarget = '#/';
  const searchState = { home: '', material: { q: '', loc: '' }, tool: { q: '', loc: '' } };
  const S = { user: null, settings: {}, setupNeeded: false, setupCodeRequired: false, lastPassword: '', unread: 0 };
  let pageRefresh = null;
  const itemCache = new Map(); // last-seen items, used to show details when offline // set by pages that can quietly reload their data

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtQty(n) { const v = Number(n); return isFinite(v) ? String(Math.round(v * 100) / 100) : '0'; }
  function fmtWhen(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleString(undefined, opts);
  }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function isAdmin() { return S.user && S.user.role === 'admin'; }
  function canDelete() { return !!S.user; } // everyone can delete (admins can restore from Notifications)
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

  function setHeader(title, back, showAcct) {
    titleEl.textContent = title;
    document.title = title === 'Inventory' ? 'Job Site Inventory' : title + ' - Inventory';
    if (back) { backBtn.hidden = false; backTarget = back; } else backBtn.hidden = true;
    if (showAcct !== false && S.user && !S.user.mustChangePassword) {
      acctBtn.hidden = false;
      acctBtn.querySelector('span').textContent = firstName(S.user.name);
    } else acctBtn.hidden = true;
    bellBtn.hidden = acctBtn.hidden || !isAdmin();
    setBadge(S.unread);
  }
  function setBadge(n) {
    S.unread = n || 0;
    bellBadge.hidden = !S.unread;
    bellBadge.textContent = S.unread > 99 ? '99+' : String(S.unread);
    bellBtn.setAttribute('aria-label', S.unread ? `Notifications, ${S.unread} new` : 'Notifications');
    if (isAdmin() && navigator.setAppBadge) { (S.unread ? navigator.setAppBadge(S.unread) : navigator.clearAppBadge()).catch(() => {}); }
  }
  async function refreshUnread() {
    if (!isAdmin() || (S.user && S.user.mustChangePassword)) return;
    try { setBadge((await api('GET', 'notifications/unread')).unread); } catch (e) { /* ignore */ }
  }
  bellBtn.addEventListener('click', () => go('#/notifications'));
  backBtn.addEventListener('click', () => go(backTarget));
  acctBtn.addEventListener('click', () => go('#/account'));

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function confirmBox(text, okLabel) {
    return new Promise(resolve => {
      const m = document.getElementById('modal'), ok = document.getElementById('modalOk'), cancel = document.getElementById('modalCancel');
      document.getElementById('modalText').textContent = text;
      ok.textContent = okLabel || 'Delete';
      m.hidden = false; cancel.focus();
      function done(v) { m.hidden = true; ok.onclick = cancel.onclick = m.onclick = null; resolve(v); }
      ok.onclick = () => done(true);
      cancel.onclick = () => done(false);
      m.onclick = e => { if (e.target === m) done(false); };
    });
  }
  function showError(el, msg) { if (!el) { alert(msg); return; } el.textContent = msg; el.hidden = !msg; if (msg) el.scrollIntoView({ block: 'nearest' }); }

  // ---------- connection + API ----------
  let offline = !navigator.onLine;
  function setOffline(v) { offline = v; banner.hidden = !v; }
  setOffline(offline);
  window.addEventListener('offline', () => setOffline(true));
  window.addEventListener('online', () => { setOffline(false); refreshQuietly(); });

  class ApiError extends Error { constructor(msg, status, data) { super(msg); this.status = status; this.data = data || {}; } }
  const NO_CONN = "No connection — changes can't be saved right now. Try again when you have signal.";

  async function api(method, path, body) {
    let res;
    try {
      res = await fetch('api/' + path, {
        method, credentials: 'same-origin',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
      });
    } catch (e) {
      setOffline(true);
      throw new ApiError(NO_CONN, 0);
    }
    // The service worker marks answers that came from the saved copy because we're offline.
    if (res.headers.get('X-From-Cache') === '1') setOffline(true);
    else if (res.status !== 504) setOffline(false);
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (res.status === 504 && res.headers.get('X-Offline') === '1') { setOffline(true); throw new ApiError(NO_CONN, 0); }
    if (res.status === 401 && path !== 'login' && path !== 'me/password') {
      S.user = null; clearApiCache();
      if (path !== 'state') { route(); }
      throw new ApiError((data && data.error) || 'Please sign in.', 401);
    }
    if (res.status === 403 && data && data.mustChangePassword) { S.user && (S.user.mustChangePassword = true); route(); }
    if (!res.ok) throw new ApiError((data && data.error) || `Something went wrong (${res.status}).`, res.status, data);
    return data;
  }
  function clearApiCache() { if (window.caches) caches.delete('jobsite-api').catch(() => {}); }

  async function loadState() {
    const s = await api('GET', 'state');
    S.user = s.user; S.settings = s.settings || S.settings; S.setupNeeded = s.setupNeeded; S.setupCodeRequired = s.setupCodeRequired; S.unread = s.unread || 0;
  }

  // Search: every word typed must appear somewhere in name, quantity, location or description.
  function matches(item, query) {
    const words = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const hay = [item.name, fmtQty(item.quantity), item.location, item.description].join(' \u0001 ').toLowerCase();
    return words.every(w => hay.includes(w));
  }
  const sortItems = items => items.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base', numeric: true }));

  // ---------- image resize ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that picture. Try another one.')); };
      img.src = url;
    });
  }
  function drawScaled(img, max, quality) {
    const w = img.naturalWidth, h = img.naturalHeight, scale = Math.min(1, max / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(img, 0, 0, cw, ch);
    return c.toDataURL('image/jpeg', quality);
  }
  async function processPhoto(file) {
    if (file.type && !/^image\//.test(file.type)) throw new Error('That file is not a picture.');
    const { img, url } = await loadImage(file);
    try { return { photo: drawScaled(img, 1024, 0.8), thumb: drawScaled(img, 240, 0.75) }; } finally { URL.revokeObjectURL(url); }
  }

  // ---------- shared pieces ----------
  function cardHTML(item, showType) {
    const t = TYPES[item.type] || TYPES.material;
    const thumb = item.thumbUrl
      ? `<img class="thumb" src="${esc(item.thumbUrl)}" alt="" loading="lazy">`
      : `<div class="thumb thumb-empty ${t.key}" aria-hidden="true">${ICONS[t.key]}</div>`;
    return `<li><a class="card" href="#/${t.path}/${encodeURIComponent(item.id)}">
      ${thumb}
      <div class="card-body">
        ${showType ? `<span class="tag ${t.key}">${t.one}</span>` : ''}
        <span class="card-name">${esc(item.name) || '(no name)'}</span>
        <span class="card-qty">Qty: <b>${fmtQty(item.quantity)}</b></span>
        ${item.location ? `<span class="card-loc">${ICONS.pin}${esc(item.location)}</span>` : ''}
      </div></a></li>`;
  }
  function searchBoxHTML(id, placeholder, value) {
    return `<div class="search"><label for="${id}" class="sr-only">Search</label>${ICONS.search}
      <input id="${id}" type="search" placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="off" enterkeyhint="search">
      <button type="button" class="clear-btn" aria-label="Clear search" ${value ? '' : 'hidden'}>&times;</button></div>`;
  }
  function wireSearch(root, id, onChange) {
    const input = root.querySelector('#' + id), clear = input.parentElement.querySelector('.clear-btn');
    input.addEventListener('input', () => { clear.hidden = !input.value; onChange(input.value); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; onChange(''); input.focus(); });
  }
  function passwordField(id, label, opts) {
    opts = opts || {};
    return `<div class="field"><label for="${id}">${label}${opts.hint ? ` <span class="hint">${opts.hint}</span>` : ''}</label>
      <input id="${id}" type="password" autocomplete="${opts.autocomplete || 'current-password'}" ${opts.minlength ? `minlength="${opts.minlength}"` : ''} maxlength="200" autocapitalize="off" spellcheck="false"></div>`;
  }
  function showPasswordToggle() {
    return `<label class="check"><input type="checkbox" class="showpw"> <span>Show password</span></label>`;
  }
  function wireShowPw(root) {
    const cb = root.querySelector('.showpw');
    if (cb) cb.addEventListener('change', () => root.querySelectorAll('input[type=password],input[data-pw]').forEach(i => { i.dataset.pw = 1; i.type = cb.checked ? 'text' : 'password'; }));
  }
  function errorBox(id) { return `<p class="error-box" id="${id}" role="alert" hidden></p>`; }
  async function withBusy(btn, fn) {
    if (btn.disabled) return;
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Please wait...';
    try { return await fn(); } finally { btn.disabled = false; btn.textContent = label; }
  }

  // ---------- sign in / setup ----------
  function renderSetup() {
    setHeader('Welcome', null, false);
    app.innerHTML = `
      <div class="auth-wrap">
        <img class="auth-logo" src="icons/icon-192.png" alt="">
        <h2>Set up your inventory</h2>
        <p>Create the <b>admin</b> account. This is the boss account that can add crew members. You only do this once.</p>
        <form id="setupForm" class="form" novalidate>
          ${S.setupCodeRequired ? `<div class="field"><label for="s-code">Setup code <span class="hint">from whoever installed the app</span></label><input id="s-code" type="text" autocomplete="off" autocapitalize="off"></div>` : ''}
          <div class="field"><label for="s-name">Your name</label><input id="s-name" type="text" autocomplete="name" maxlength="60" placeholder="e.g. Joseph"></div>
          <div class="field"><label for="s-user">Username <span class="hint">used to sign in</span></label><input id="s-user" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="60" placeholder="e.g. joseph"></div>
          ${passwordField('s-pw', 'Password', { hint: 'at least 8 characters', autocomplete: 'new-password', minlength: 8 })}
          ${passwordField('s-pw2', 'Type password again', { autocomplete: 'new-password' })}
          ${showPasswordToggle()}
          ${errorBox('setupErr')}
          <button class="btn btn-primary btn-wide" type="submit" id="setupBtn">Create admin account</button>
        </form>
      </div>`;
    wireShowPw(app);
    const f = app.querySelector('#setupForm'), err = app.querySelector('#setupErr');
    f.addEventListener('submit', e => {
      e.preventDefault();
      const v = id => f.querySelector(id) ? f.querySelector(id).value : '';
      if (v('#s-pw') !== v('#s-pw2')) return showError(err, 'The two passwords are not the same.');
      withBusy(f.querySelector('#setupBtn'), async () => {
        try {
          const r = await api('POST', 'setup', { name: v('#s-name'), username: v('#s-user'), password: v('#s-pw'), setupCode: v('#s-code') });
          S.user = r.user; S.setupNeeded = false;
          toast('Admin account created'); go('#/');
        } catch (ex) { showError(err, ex.message); }
      });
    });
  }

  function renderLogin() {
    setHeader('Sign in', null, false);
    app.innerHTML = `
      <div class="auth-wrap">
        <img class="auth-logo" src="icons/icon-192.png" alt="">
        <h2>Job Site Inventory</h2>
        <form id="loginForm" class="form" novalidate>
          <div class="field"><label for="l-user">Username</label>
            <input id="l-user" type="text" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="60" enterkeyhint="next"></div>
          ${passwordField('l-pw', 'Password')}
          ${showPasswordToggle()}
          ${errorBox('loginErr')}
          <button class="btn btn-primary btn-wide" type="submit" id="loginBtn">Sign in</button>
          <p class="hint center">Forgot your password? Ask your boss to reset it.</p>
        </form>
      </div>`;
    wireShowPw(app);
    const f = app.querySelector('#loginForm'), err = app.querySelector('#loginErr');
    f.addEventListener('submit', e => {
      e.preventDefault();
      const username = f.querySelector('#l-user').value.trim(), password = f.querySelector('#l-pw').value;
      if (!username || !password) return showError(err, 'Please type your username and password.');
      withBusy(f.querySelector('#loginBtn'), async () => {
        try {
          const r = await api('POST', 'login', { username, password });
          S.user = r.user; S.lastPassword = r.user.mustChangePassword ? password : '';
          await loadState().catch(() => {});
          go('#/');
        } catch (ex) { showError(err, ex.message); f.querySelector('#l-pw').select(); }
      });
    });
  }

  function renderPasswordForm(forced) {
    setHeader(forced ? 'New password' : 'Change password', forced ? null : '#/account', !forced);
    const knowCurrent = forced && S.lastPassword;
    app.innerHTML = `
      <div class="auth-wrap">
        ${forced ? `<h2>Hi ${esc(firstName(S.user.name))}! Pick your own password</h2><p>You signed in with a temporary password. Choose a new one that only you know.</p>` : ''}
        <form id="pwForm" class="form" novalidate>
          ${knowCurrent ? '' : passwordField('p-cur', forced ? 'Temporary password' : 'Current password')}
          ${passwordField('p-new', 'New password', { hint: 'at least 8 characters', autocomplete: 'new-password', minlength: 8 })}
          ${passwordField('p-new2', 'Type new password again', { autocomplete: 'new-password' })}
          ${showPasswordToggle()}
          ${errorBox('pwErr')}
          <button class="btn btn-primary btn-wide" type="submit" id="pwBtn">Save new password</button>
          ${forced ? '<button type="button" class="btn btn-light btn-wide mt" id="pwLogout">Sign out</button>' : ''}
        </form>
      </div>`;
    wireShowPw(app);
    const f = app.querySelector('#pwForm'), err = app.querySelector('#pwErr');
    const lo = f.querySelector('#pwLogout'); if (lo) lo.addEventListener('click', logout);
    f.addEventListener('submit', e => {
      e.preventDefault();
      const cur = knowCurrent ? S.lastPassword : f.querySelector('#p-cur').value;
      const n1 = f.querySelector('#p-new').value, n2 = f.querySelector('#p-new2').value;
      if (n1.length < 8) return showError(err, 'New password must be at least 8 characters.');
      if (n1 !== n2) return showError(err, 'The two new passwords are not the same.');
      withBusy(f.querySelector('#pwBtn'), async () => {
        try {
          await api('POST', 'me/password', { currentPassword: cur, newPassword: n1 });
          S.lastPassword = ''; S.user.mustChangePassword = false;
          toast('Password changed'); go(forced ? '#/' : '#/account');
        } catch (ex) { showError(err, ex.message); }
      });
    });
  }

  async function logout() {
    try {
      const sub = await currentSub();
      if (sub) { await api('POST', 'push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
    } catch (e) { /* ignore */ }
    try { await api('POST', 'logout', {}); } catch (e) { /* still sign out locally */ }
    setBadge(0);
    S.user = null; clearApiCache(); toast('Signed out'); go('#/');
  }

  function renderAccount() {
    setHeader('My account', '#/', false);
    app.innerHTML = `
      <section class="panel">
        <div class="who"><span class="who-icon">${ICONS.person}</span>
          <div><div class="who-name">${esc(S.user.name)}</div>
          <div class="muted">Username: <b>${esc(S.user.username)}</b> · ${isAdmin() ? 'Admin' : 'Crew'}</div></div></div>
      </section>
      <a class="btn btn-light btn-wide mb" href="#/account/password">Change my password</a>
      <button type="button" class="btn btn-wide" id="logoutBtn">Sign out</button>
      <p class="hint center mt">You stay signed in on this device for 30 days. Sign out if this is a shared device.</p>`;
    app.querySelector('#logoutBtn').addEventListener('click', logout);
  }

  // ---------- home ----------
  async function renderHome() {
    setHeader('Inventory', null);
    app.innerHTML = `
      <p class="hello">Signed in as <b>${esc(S.user.name)}</b> <span class="role-tag ${S.user.role}">${isAdmin() ? 'Admin' : 'Crew'}</span></p>
      <div id="pushPrompt"></div>
      <section class="home-search">
        ${searchBoxHTML('homeSearch', 'Search everything', searchState.home)}
        <p class="result-count" id="homeCount" hidden></p>
        <ul class="cards" id="homeResults"></ul>
      </section>
      <div class="home-buttons" id="homeButtons">
        <a class="big-btn material" href="#/materials">${ICONS.material}<span class="big-label">Materials</span><span class="big-count" id="nMat">&nbsp;</span></a>
        <a class="big-btn tool" href="#/tools">${ICONS.tool}<span class="big-label">Tools</span><span class="big-count" id="nTool">&nbsp;</span></a>
        ${isAdmin() ? `<div class="admin-links">
          <a class="btn btn-light" href="#/people">${ICONS.people}<span>People</span></a>
          <a class="btn btn-light" href="#/backup">${ICONS.box}<span>Backup</span></a></div>` : ''}
      </div>`;
    let items = [];
    const results = app.querySelector('#homeResults'), count = app.querySelector('#homeCount'), buttons = app.querySelector('#homeButtons');
    function update(q) {
      searchState.home = q;
      buttons.hidden = !!q.trim();
      if (!q.trim()) { results.innerHTML = ''; count.hidden = true; return; }
      const found = sortItems(items.filter(i => matches(i, q)));
      count.hidden = false;
      count.textContent = found.length ? `Found ${found.length}` : 'Nothing found. Try a different word.';
      results.innerHTML = found.map(i => cardHTML(i, true)).join('');
    }
    async function load() {
      const r = await api('GET', 'items');
      items = r.items; items.forEach(i => itemCache.set(i.id, i));
      const nm = items.filter(i => i.type === 'material').length, nt = items.length - nm;
      const a = app.querySelector('#nMat'), b = app.querySelector('#nTool');
      if (a) a.textContent = `${nm} ${nm === 1 ? 'item' : 'items'}`;
      if (b) b.textContent = `${nt} ${nt === 1 ? 'item' : 'items'}`;
      update(searchState.home);
    }
    wireSearch(app, 'homeSearch', update);
    pageRefresh = load;
    if (isAdmin()) showHomePushPrompt(app.querySelector('#pushPrompt'));
    await load();
  }

  // ---------- list ----------
  async function renderList(t) {
    setHeader(t.many, '#/');
    const st = searchState[t.key];
    app.innerHTML = `
      <a class="btn btn-primary btn-wide ${t.key}" href="#/${t.path}/new">${ICONS.plus}<span>Add ${t.one}</span></a>
      <div class="filters">
        ${searchBoxHTML('listSearch', 'Search ' + t.many.toLowerCase(), st.q)}
        <label class="loc-filter" id="locWrap" hidden>${ICONS.pin}<span class="sr-only">Location</span><select id="locFilter"></select></label>
      </div>
      <div class="count-row"><p class="result-count" id="listCount">Loading...</p>
        <button type="button" class="btn btn-light btn-small" id="refreshBtn">${ICONS.refresh}<span>Refresh</span></button></div>
      <ul class="cards" id="list"></ul>
      <div class="empty" id="emptyMsg" hidden>
        <div class="empty-icon ${t.key}">${ICONS[t.key]}</div>
        <p>No ${t.many.toLowerCase()} yet.</p><p>Tap <b>Add ${t.one}</b> to add the first one.</p></div>`;
    let items = [];
    const list = app.querySelector('#list'), count = app.querySelector('#listCount'), sel = app.querySelector('#locFilter');
    function update() {
      const found = items.filter(i => matches(i, st.q) && (!st.loc || (i.location || '').trim() === st.loc));
      const filtered = st.q.trim() || st.loc;
      app.querySelector('#emptyMsg').hidden = items.length > 0;
      count.textContent = !items.length ? '' : filtered
        ? (found.length ? `Showing ${found.length} of ${items.length}` : 'Nothing found. Try a different word.')
        : `${items.length} ${items.length === 1 ? t.one.toLowerCase() : t.many.toLowerCase()}`;
      list.innerHTML = found.map(i => cardHTML(i, false)).join('');
    }
    async function load() {
      const r = await api('GET', 'items?type=' + t.key);
      items = sortItems(r.items); items.forEach(i => itemCache.set(i.id, i));
      const locs = [...new Set(items.map(i => (i.location || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      if (st.loc && !locs.includes(st.loc)) st.loc = '';
      app.querySelector('#locWrap').hidden = locs.length < 2;
      sel.innerHTML = `<option value="">All locations</option>` + locs.map(l => `<option value="${esc(l)}" ${l === st.loc ? 'selected' : ''}>${esc(l)}</option>`).join('');
      update();
    }
    wireSearch(app, 'listSearch', q => { st.q = q; update(); });
    sel.addEventListener('change', () => { st.loc = sel.value; update(); });
    app.querySelector('#refreshBtn').addEventListener('click', e => withBusy(e.currentTarget, async () => {
      try { await load(); toast('Up to date'); } catch (ex) { toast(ex.message); }
    }));
    pageRefresh = load;
    await load();
  }

  async function fetchItem(id) {
    try { const it = (await api('GET', 'items/' + encodeURIComponent(id))).item; itemCache.set(it.id, it); return it; }
    catch (ex) { if (ex.status === 0 && itemCache.has(id)) return itemCache.get(id); throw ex; }
  }

  // ---------- detail ----------
  async function renderDetail(t, id) {
    setHeader(t.one, '#/' + t.path);
    let item;
    try { item = await fetchItem(id); }
    catch (ex) { if (ex.status === 404) { itemCache.delete(id); app.innerHTML = notFound(t); return; } throw ex; }
    if (item.type !== t.key) { app.innerHTML = notFound(t); return; }
    function updatedLine() {
      return item.updatedByName ? `Updated by <b>${esc(item.updatedByName)}</b>, ${esc(fmtWhen(item.updatedAt))}` : `Updated ${esc(fmtWhen(item.updatedAt))}`;
    }
    app.innerHTML = `
      <article class="detail">
        ${item.photoUrl ? `<img class="detail-photo" src="${esc(item.photoUrl)}" alt="Photo of ${esc(item.name)}">` :
          `<div class="detail-photo photo-empty ${t.key}">${ICONS[t.key]}<span>No photo</span></div>`}
        <div class="detail-info">
          <h2 class="detail-name">${esc(item.name)}</h2>
          <p class="updated" id="updatedLine">${updatedLine()}</p>
          <div class="field-label">Quantity</div>
          <div class="qty-row">
            <button type="button" class="qty-btn" data-step="-1" aria-label="One less">&minus;</button>
            <output class="qty-big" id="qtyOut">${fmtQty(item.quantity)}</output>
            <button type="button" class="qty-btn" data-step="1" aria-label="One more">+</button>
          </div>
          <div class="field-label">Location</div>
          <p class="detail-text">${item.location ? esc(item.location) : '<span class="muted">Not set</span>'}</p>
          <div class="field-label">Description</div>
          <p class="detail-text pre">${item.description ? esc(item.description) : '<span class="muted">None</span>'}</p>
          <div class="action-row ${canDelete() ? '' : 'one'}">
            <a class="btn btn-primary ${t.key}" href="#/${t.path}/${encodeURIComponent(item.id)}/edit">Edit</a>
            ${canDelete() ? '<button type="button" class="btn btn-danger" id="delBtn">Delete</button>' : ''}
          </div>
        </div>
      </article>`;
    const dp = app.querySelector('img.detail-photo');
    if (dp && item.thumbUrl) dp.addEventListener('error', () => { if (!dp.dataset.fb) { dp.dataset.fb = 1; dp.src = item.thumbUrl; } });
    const out = app.querySelector('#qtyOut');
    app.querySelectorAll('.qty-btn').forEach(b => b.addEventListener('click', async () => {
      try {
        const r = await api('POST', `items/${encodeURIComponent(item.id)}/adjust`, { delta: Number(b.dataset.step) });
        item = r.item;
        out.textContent = fmtQty(item.quantity);
        app.querySelector('#updatedLine').innerHTML = updatedLine();
        toast('Quantity saved: ' + fmtQty(item.quantity));
      } catch (ex) { toast(ex.message); }
    }));
    const del = app.querySelector('#delBtn');
    if (del) del.addEventListener('click', async () => {
      if (!(await confirmBox(`Delete "${item.name}"? The boss will be told, and can bring it back if it was a mistake.`, 'Delete'))) return;
      try { await api('DELETE', 'items/' + encodeURIComponent(item.id)); itemCache.delete(item.id); toast('Deleted'); go('#/' + t.path); }
      catch (ex) { alert(ex.message); }
    });
    pageRefresh = async () => { if (document.getElementById('modal').hidden) await renderDetail(t, id); };
  }
  function notFound(t) {
    return `<div class="empty"><p>That item was not found. It may have been deleted.</p>
      <a class="btn btn-primary ${t.key}" href="#/${t.path}">Back to ${t.many}</a></div>`;
  }

  // ---------- add / edit ----------
  async function renderForm(t, id) {
    let item = null;
    if (id) {
      try { item = await fetchItem(id); }
      catch (ex) { if (ex.status === 404) { setHeader(t.many, '#/' + t.path); app.innerHTML = notFound(t); return; } throw ex; }
    }
    const editing = !!item;
    setHeader(editing ? 'Edit ' + t.one : 'Add ' + t.one, editing ? `#/${t.path}/${encodeURIComponent(id)}` : '#/' + t.path);
    const data = { photoPreview: item ? item.photoUrl : '', newPhoto: null, removePhoto: false };
    const v = item || { name: '', quantity: 1, location: '', description: '' };
    app.innerHTML = `
      <form class="form" id="itemForm" novalidate>
        <div class="field">
          <label for="f-name">Name <span class="req">(required)</span></label>
          <input id="f-name" type="text" maxlength="120" autocomplete="off" autocapitalize="sentences"
            placeholder="${t.key === 'tool' ? 'e.g. Cordless drill' : 'e.g. 2x4 lumber 8 ft'}" value="${esc(v.name)}">
          <p class="error" id="nameErr" hidden>Please type a name.</p>
        </div>
        <div class="field">
          <label for="f-qty">Quantity</label>
          <div class="qty-row">
            <button type="button" class="qty-btn" data-step="-1" aria-label="One less">&minus;</button>
            <input id="f-qty" type="number" inputmode="decimal" min="0" step="any" value="${fmtQty(v.quantity)}">
            <button type="button" class="qty-btn" data-step="1" aria-label="One more">+</button>
          </div>
        </div>
        <div class="field">
          <label for="f-loc">Location <span class="hint">Where is it?</span></label>
          <input id="f-loc" type="text" maxlength="120" list="locList" autocomplete="off" autocapitalize="sentences"
            placeholder="e.g. Truck 2, Shop, Smith job" value="${esc(v.location)}">
          <datalist id="locList"></datalist>
        </div>
        <div class="field">
          <span class="label">Photo</span>
          <div class="photo-box" id="photoBox"></div>
          <input id="f-photo" type="file" accept="image/*" capture="environment" class="sr-only" tabindex="-1">
          <div class="photo-actions">
            <label for="f-photo" class="btn btn-light" id="photoPick" role="button" tabindex="0">${ICONS.camera}<span id="photoPickText"></span></label>
            <button type="button" class="btn btn-light" id="photoRemove">Remove photo</button>
          </div>
          <p class="hint" id="photoStatus" aria-live="polite"></p>
        </div>
        <div class="field">
          <label for="f-desc">Description <span class="hint">Size, brand, notes...</span></label>
          <textarea id="f-desc" rows="4" maxlength="2000" autocapitalize="sentences">${esc(v.description)}</textarea>
        </div>
        ${errorBox('saveErr')}
        <div class="action-row sticky-actions">
          <a class="btn btn-light" href="${backTarget}">Cancel</a>
          <button type="submit" class="btn btn-primary ${t.key}" id="saveBtn">Save</button>
        </div>
      </form>`;
    api('GET', 'items?type=' + t.key).then(r => {
      const locs = [...new Set(r.items.map(i => (i.location || '').trim()).filter(Boolean))];
      const dl = app.querySelector('#locList'); if (dl) dl.innerHTML = locs.map(l => `<option value="${esc(l)}">`).join('');
    }).catch(() => {});

    const form = app.querySelector('#itemForm'), qty = form.querySelector('#f-qty');
    form.querySelectorAll('.qty-btn').forEach(b => b.addEventListener('click', () => {
      qty.value = fmtQty(Math.max(0, (parseFloat(qty.value) || 0) + Number(b.dataset.step)));
    }));
    const photoBox = form.querySelector('#photoBox'), fileInput = form.querySelector('#f-photo'), status = form.querySelector('#photoStatus');
    const removeBtn = form.querySelector('#photoRemove'), pickText = form.querySelector('#photoPickText');
    let busy = false;
    function showPhoto() {
      const src = data.newPhoto ? data.newPhoto.photo : (data.removePhoto ? '' : data.photoPreview);
      photoBox.innerHTML = src ? `<img src="${esc(src)}" alt="Photo preview">` : `<div class="photo-empty ${t.key}">${ICONS.camera}<span>No photo yet</span></div>`;
      removeBtn.hidden = !src;
      pickText.textContent = src ? 'Change photo' : 'Take or choose photo';
    }
    showPhoto();
    form.querySelector('#photoPick').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      busy = true; status.textContent = 'Getting photo ready...';
      try { data.newPhoto = await processPhoto(f); data.removePhoto = false; status.textContent = ''; showPhoto(); }
      catch (err) { status.textContent = err.message || 'Could not use that photo.'; }
      finally { busy = false; fileInput.value = ''; }
    });
    removeBtn.addEventListener('click', () => { data.newPhoto = null; data.removePhoto = true; showPhoto(); });

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (busy) { toast('Wait a moment, photo is still loading'); return; }
      const name = form.querySelector('#f-name').value.trim(), errEl = form.querySelector('#nameErr');
      if (!name) { errEl.hidden = false; form.querySelector('#f-name').focus(); return; }
      errEl.hidden = true;
      const q = parseFloat(qty.value);
      const body = {
        type: t.key, name, quantity: isFinite(q) && q > 0 ? Math.round(q * 100) / 100 : 0,
        location: form.querySelector('#f-loc').value.trim(), description: form.querySelector('#f-desc').value.trim()
      };
      if (data.newPhoto) { body.photo = data.newPhoto.photo; body.thumb = data.newPhoto.thumb; }
      else if (data.removePhoto) body.removePhoto = true;
      const saveErr = form.querySelector('#saveErr');
      withBusy(form.querySelector('#saveBtn'), async () => {
        try {
          const r = editing ? await api('PUT', 'items/' + encodeURIComponent(item.id), body) : await api('POST', 'items', body);
          toast('Saved');
          go(editing ? `#/${t.path}/${encodeURIComponent(r.item.id)}` : '#/' + t.path);
        } catch (ex) { showError(saveErr, ex.message + (ex.status === 0 ? ' Your typing is kept on this screen.' : '')); }
      });
    });
    if (!editing) setTimeout(() => { if (window.matchMedia('(pointer: fine)').matches) form.querySelector('#f-name').focus(); }, 50);
  }

  // ---------- people (admin) ----------
  function makeTempPassword() {
    const words = ['brick', 'nail', 'beam', 'stud', 'drill', 'level', 'truck', 'block', 'rebar', 'plank', 'joist', 'saw'];
    const a = new Uint32Array(2); crypto.getRandomValues(a);
    return words[a[0] % words.length] + '-' + String(1000 + (a[1] % 9000));
  }
  async function renderPeople() {
    setHeader('People', '#/');
    const r = await api('GET', 'users');
    app.innerHTML = `
      <a class="btn btn-primary btn-wide" href="#/people/new">${ICONS.plus}<span>Add a person</span></a>
      <ul class="cards people mt" id="people">
        ${r.users.map(u => `<li><a class="card person-card" href="#/people/${u.id}">
          <div class="thumb thumb-empty person ${u.disabled ? 'off' : ''}" aria-hidden="true">${ICONS.person}</div>
          <div class="card-body">
            <span class="card-name">${esc(u.name)}${u.id === S.user.id ? ' <span class="muted small">(you)</span>' : ''}</span>
            <span class="muted">Username: <b>${esc(u.username)}</b></span>
            <span><span class="role-tag ${u.role}">${u.role === 'admin' ? 'Admin' : 'Crew'}</span>
              ${u.disabled ? '<span class="role-tag off">Turned off</span>' : ''}
              ${u.mustChangePassword && !u.disabled ? '<span class="role-tag temp">Temp password</span>' : ''}</span>
          </div></a></li>`).join('')}
      </ul>
      <p class="hint mt">Admins can manage people, see notifications and restore deleted items. Everyone can add, edit and delete items.</p>`;
  }

  function renderAddPerson() {
    setHeader('Add person', '#/people');
    const temp = makeTempPassword();
    app.innerHTML = `
      <form class="form" id="personForm" novalidate>
        <div class="field"><label for="u-name">Name</label><input id="u-name" type="text" maxlength="60" autocomplete="off" placeholder="e.g. Mike Torres"></div>
        <div class="field"><label for="u-user">Username <span class="hint">what they type to sign in</span></label>
          <input id="u-user" type="text" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. mike"></div>
        <div class="field"><label for="u-pw">Temporary password <span class="hint">they'll change it when they first sign in</span></label>
          <input id="u-pw" type="text" maxlength="200" autocomplete="off" autocapitalize="off" spellcheck="false" value="${temp}"></div>
        <div class="field"><span class="label">Role</span>
          <div class="seg"><label><input type="radio" name="role" value="crew" checked><span>Crew</span></label>
          <label><input type="radio" name="role" value="admin"><span>Admin</span></label></div>
          <p class="hint">Crew: add, edit and delete items. Admin: also gets notifications, manages people, restores deleted items and backups.</p></div>
        ${errorBox('personErr')}
        <button type="submit" class="btn btn-primary btn-wide" id="personBtn">Add person</button>
      </form>`;
    const f = app.querySelector('#personForm');
    f.querySelector('#u-name').addEventListener('input', e => {
      const u = f.querySelector('#u-user');
      if (!u.dataset.touched) u.value = firstName(e.target.value).toLowerCase().replace(/[^a-z0-9._-]/g, '');
    });
    f.querySelector('#u-user').addEventListener('input', e => { e.target.dataset.touched = 1; });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const body = { name: f.querySelector('#u-name').value, username: f.querySelector('#u-user').value, password: f.querySelector('#u-pw').value, role: f.querySelector('input[name=role]:checked').value };
      withBusy(f.querySelector('#personBtn'), async () => {
        try {
          const r = await api('POST', 'users', body);
          app.innerHTML = `<section class="panel success">
            <h2>${esc(r.user.name)} was added</h2>
            <p>Give them these to sign in:</p>
            <dl class="creds"><dt>Username</dt><dd>${esc(r.user.username)}</dd><dt>Temporary password</dt><dd>${esc(body.password)}</dd></dl>
            <p class="hint">They will pick their own password the first time they sign in.</p></section>
            <a class="btn btn-primary btn-wide" href="#/people">Done</a>`;
        } catch (ex) { showError(f.querySelector('#personErr'), ex.message); }
      });
    });
  }

  async function renderPerson(id) {
    setHeader('Person', '#/people');
    const r = await api('GET', 'users');
    const u = r.users.find(x => String(x.id) === String(id));
    if (!u) { app.innerHTML = '<div class="empty"><p>Person not found.</p><a class="btn btn-primary" href="#/people">Back to People</a></div>'; return; }
    const me = u.id === S.user.id;
    app.innerHTML = `
      <form class="form" id="editPerson" novalidate>
        <div class="field"><label for="e-name">Name</label><input id="e-name" type="text" maxlength="60" value="${esc(u.name)}"></div>
        <p>Username: <b>${esc(u.username)}</b></p>
        <div class="field"><span class="label">Role</span>
          <div class="seg"><label><input type="radio" name="role" value="crew" ${u.role === 'crew' ? 'checked' : ''}><span>Crew</span></label>
          <label><input type="radio" name="role" value="admin" ${u.role === 'admin' ? 'checked' : ''}><span>Admin</span></label></div>
          <p class="hint">Admins get notifications and can manage people.${me ? ' If you change yourself to Crew you lose these right away.' : ''}</p></div>
        ${errorBox('editErr')}
        <button class="btn btn-primary btn-wide" type="submit" id="editBtn">Save changes</button>
      </form>
      <section class="panel mt">
        <h2>Reset password</h2>
        <p>Use this if ${esc(firstName(u.name))} forgot their password. ${me ? '' : 'They will pick a new one after signing in.'}</p>
        <div class="field"><label for="r-pw">New temporary password</label>
          <input id="r-pw" type="text" maxlength="200" autocomplete="off" autocapitalize="off" spellcheck="false" value="${makeTempPassword()}"></div>
        ${errorBox('resetErr')}
        <button type="button" class="btn btn-light btn-wide" id="resetBtn">Reset password</button>
      </section>
      <section class="panel danger-zone">
        <h2>Access</h2>
        ${me ? '' : `<button type="button" class="btn btn-light btn-wide mb" id="toggleBtn">${u.disabled ? 'Turn sign-in back on' : 'Turn off sign-in (keep history)'}</button>`}
        <button type="button" class="btn btn-danger btn-wide" id="removeBtn">${me ? 'Remove my account' : 'Remove ' + esc(firstName(u.name))}</button>
        ${errorBox('accessErr')}
        <p class="hint mt">${me ? 'You can only remove yourself if there is another admin.' : 'Turning off stops them from signing in right away. Their name stays on items they changed.'}</p>
      </section>`;
    const f = app.querySelector('#editPerson');
    f.addEventListener('submit', e => {
      e.preventDefault();
      const roleEl = f.querySelector('input[name=role]:checked');
      withBusy(f.querySelector('#editBtn'), async () => {
        try {
          if (me && u.role === 'admin' && roleEl.value === 'crew' &&
            !(await confirmBox('Change yourself to Crew? You will no longer be an admin.', 'Yes, change'))) return;
          await api('PUT', 'users/' + u.id, { name: f.querySelector('#e-name').value, role: roleEl.value });
          if (me) { await loadState(); toast('Saved'); go(isAdmin() ? '#/people' : '#/'); return; }
          toast('Saved'); go('#/people');
        } catch (ex) { showError(f.querySelector('#editErr'), ex.message); }
      });
    });
    app.querySelector('#resetBtn').addEventListener('click', e => withBusy(e.currentTarget, async () => {
      const pw = app.querySelector('#r-pw').value;
      try {
        await api('POST', `users/${u.id}/password`, { password: pw });
        showError(app.querySelector('#resetErr'), '');
        toast('Password reset');
        app.querySelector('#resetErr').insertAdjacentHTML('afterend', `<p class="ok-box">New password for <b>${esc(u.username)}</b>: <b>${esc(pw)}</b></p>`);
      } catch (ex) { showError(app.querySelector('#resetErr'), ex.message); }
    }));
    const tog = app.querySelector('#toggleBtn');
    if (tog) tog.addEventListener('click', async () => {
      try { await api('PUT', 'users/' + u.id, { disabled: !u.disabled }); toast(u.disabled ? 'Sign-in turned on' : 'Sign-in turned off'); renderPerson(id); }
      catch (ex) { showError(app.querySelector('#accessErr'), ex.message); }
    });
    const rem = app.querySelector('#removeBtn');
    if (rem) rem.addEventListener('click', async () => {
      if (!(await confirmBox(me ? 'Remove your own account? You will be signed out.' : `Remove ${u.name}? They won't be able to sign in. Items they changed stay.`, 'Remove'))) return;
      try {
        await api('DELETE', 'users/' + u.id);
        if (me) { S.user = null; clearApiCache(); toast('Your account was removed'); go('#/'); return; }
        toast('Removed'); go('#/people');
      } catch (ex) { showError(app.querySelector('#accessErr'), ex.message); }
    });
  }

  // ---------- push notifications on this device ----------
  function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  async function currentSub() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg && reg.pushManager ? reg.pushManager.getSubscription() : null;
  }
  // on | off | denied | ios-home | unsupported
  async function pushState() {
    const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) return isIOS() && !isStandalone() ? 'ios-home' : 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    const sub = await currentSub().catch(() => null);
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  }
  function b64ToBytes(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }
  async function enablePush() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied'
      ? 'Notifications are blocked for this app. Turn them on in your phone or browser settings, then try again.'
      : 'Notifications were not turned on.');
    const { publicKey } = await api('GET', 'push/key');
    const reg = await navigator.serviceWorker.ready;
    const key = b64ToBytes(publicKey);
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const old = sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
      if (old && (old.length !== key.length || old.some((v, i) => v !== key[i]))) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) {
      try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); }
      catch (ex) { throw new Error("This device couldn't turn on notifications. Check that notifications are allowed for this app in the phone or browser settings, then try again."); }
    }
    await api('POST', 'push/subscribe', { subscription: sub.toJSON() });
  }
  async function disablePush() {
    const sub = await currentSub();
    if (sub) { await api('POST', 'push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
  }
  const IOS_HINT = `<p><b>On iPhone or iPad:</b> notifications only work when the app is on your Home Screen (iOS 16.4 or newer).</p>
    <ol class="steps"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with arrow).</li>
    <li>Tap <b>Add to Home Screen</b>.</li><li>Open the app from the Home Screen, sign in, and come back here.</li></ol>`;
  async function renderPushCard(el, opts) {
    opts = opts || {};
    const st = await pushState();
    if (opts.promptOnly && st !== 'off' && st !== 'ios-home') { el.innerHTML = ''; return; }
    const head = `<h2>${ICONS.bell} Alerts on this device</h2>`;
    let body = '';
    if (st === 'on') body = `<p class="ok-line">Notifications are <b>ON</b> for this device.</p>
        <div class="two-btns"><button type="button" class="btn btn-light" id="pushTest">Send a test</button>
        <button type="button" class="btn btn-light" id="pushOff">Turn off</button></div>`;
    else if (st === 'off') body = `<p>Get an alert on this device when someone adds or deletes an item.</p>
        <button type="button" class="btn btn-primary btn-wide" id="pushOn">${ICONS.bell}<span>Turn on notifications on this device</span></button>
        ${opts.promptOnly ? '<button type="button" class="btn btn-light btn-wide mt" id="pushLater">Not now</button>' : ''}
        ${isIOS() ? '<p class="hint mt">iPhone: works only from the Home Screen app (iOS 16.4+).</p>' : ''}`;
    else if (st === 'ios-home') body = IOS_HINT + (opts.promptOnly ? '<button type="button" class="btn btn-light btn-wide" id="pushLater">Not now</button>' : '');
    else if (st === 'denied') body = `<p>Notifications are <b>blocked</b> for this app. To get alerts, allow notifications for this site in your phone or browser settings, then come back.</p>`;
    else body = `<p>This browser can't show notifications. You will still see everything on this page.</p>`;
    el.innerHTML = `<section class="panel push-card">${head}${body}${errorBox('pushErr')}</section>`;
    const err = el.querySelector('#pushErr');
    const on = el.querySelector('#pushOn');
    if (on) on.addEventListener('click', () => withBusy(on, async () => {
      try { await enablePush(); toast('Notifications turned on'); await renderPushCard(el, Object.assign({}, opts, { promptOnly: false })); }
      catch (ex) { showError(err, ex.message || 'Could not turn on notifications.'); }
    }));
    const off = el.querySelector('#pushOff');
    if (off) off.addEventListener('click', () => withBusy(off, async () => { await disablePush(); toast('Notifications turned off'); await renderPushCard(el, opts); }));
    const test = el.querySelector('#pushTest');
    if (test) test.addEventListener('click', () => withBusy(test, async () => {
      try { await api('POST', 'push/test', {}); toast('Test sent'); } catch (ex) { showError(err, ex.message); }
    }));
    const later = el.querySelector('#pushLater');
    if (later) later.addEventListener('click', () => { localStorage.setItem('pushPromptHidden', '1'); el.innerHTML = ''; });
  }
  function showHomePushPrompt(el) {
    if (localStorage.getItem('pushPromptHidden') === '1') return;
    renderPushCard(el, { promptOnly: true }).catch(() => {});
  }

  // ---------- notifications (admins) ----------
  function notifHTML(n) {
    const t = TYPES[n.itemType] || TYPES.material;
    const sn = n.snapshot || {};
    const verbs = { add: 'added', delete: 'deleted', restore: 'restored', edit: 'changed', qty: 'changed the quantity of' };
    const thumb = n.thumbUrl ? `<img class="thumb" src="${esc(n.thumbUrl)}" alt="" loading="lazy">`
      : `<div class="thumb thumb-empty ${t.key}" aria-hidden="true">${ICONS[t.key]}</div>`;
    let line2 = '';
    if (n.kind === 'qty') line2 = `Qty ${fmtQty(n.details.from)} → <b>${fmtQty(n.details.to)}</b>`;
    else if (n.kind === 'edit') line2 = esc((n.details.changes || []).join(', '));
    else line2 = `Qty ${fmtQty(sn.quantity)}${sn.location ? ' — ' + esc(sn.location) : ''}`;
    const del = n.kind === 'delete';
    return `<li class="notif ${n.read ? '' : 'unread'} kind-${n.kind}" data-id="${n.id}">
      <button type="button" class="notif-main" data-open="${n.id}">
        ${thumb}
        <span class="notif-body">
          <span class="notif-top"><span class="kind-tag kind-${n.kind}">${{ add: 'Added', delete: 'Deleted', restore: 'Restored', edit: 'Edited', qty: 'Quantity' }[n.kind]}</span>
            ${n.read ? '' : '<span class="new-dot">New</span>'}</span>
          <span class="notif-text"><b>${esc(n.mine ? 'You' : n.actorName)}</b> ${verbs[n.kind]} <b>${esc(sn.name)}</b></span>
          <span class="notif-line">${line2}</span>
          <span class="notif-when">${esc(fmtWhen(n.createdAt))}</span>
        </span>
      </button>
      ${del ? `<div class="deleted-snap">
          ${sn.description ? `<p class="pre">${esc(sn.description)}</p>` : ''}
          ${n.itemDeleted ? `<button type="button" class="btn btn-primary btn-wide restore-btn" data-restore="${esc(n.itemId)}">Restore this ${t.one.toLowerCase()}</button>`
            : (n.itemExists ? '<p class="restored-note">Back in the list (restored).</p>' : '<p class="muted">Removed for good.</p>')}
        </div>` : ''}
    </li>`;
  }

  async function renderNotifications() {
    setHeader('Notifications', '#/');
    app.innerHTML = `
      <div id="pushCard"></div>
      <div class="notif-tools">
        <div class="seg" role="group" aria-label="Show">
          <label><input type="radio" name="nf" value="key"><span>Adds &amp; deletes</span></label>
          <label><input type="radio" name="nf" value="all"><span>Everything</span></label>
        </div>
        <div class="count-row"><p class="result-count" id="unreadLine"></p>
          <button type="button" class="btn btn-light btn-small" id="markAll">Mark all read</button></div>
      </div>
      <ul class="notif-list" id="notifList"><li class="muted">Loading...</li></ul>
      <button type="button" class="btn btn-light btn-wide mt" id="moreBtn" hidden>Show older</button>`;
    renderPushCard(app.querySelector('#pushCard')).catch(() => {});
    let list = [];
    const ul = app.querySelector('#notifList'), more = app.querySelector('#moreBtn');
    function paint(unread) {
      setBadge(unread);
      app.querySelector('#unreadLine').textContent = unread ? `${unread} new` : 'All caught up';
      app.querySelector('#markAll').hidden = !unread;
      ul.innerHTML = list.length ? list.map(notifHTML).join('') : '<li class="empty"><p>Nothing yet. When someone adds or deletes an item, it shows up here.</p></li>';
    }
    async function load(append) {
      const before = append && list.length ? list[list.length - 1].id : '';
      const r = await api('GET', 'notifications' + (before ? '?before=' + before : ''));
      list = append ? list.concat(r.items) : r.items;
      app.querySelectorAll('input[name=nf]').forEach(i => { i.checked = i.value === r.filter; });
      more.hidden = !r.more;
      paint(r.unread);
    }
    app.querySelectorAll('input[name=nf]').forEach(i => i.addEventListener('change', async () => {
      try { await api('PUT', 'notifications/prefs', { filter: i.value }); await load(false); } catch (ex) { toast(ex.message); }
    }));
    app.querySelector('#markAll').addEventListener('click', async () => {
      try { const r = await api('POST', 'notifications/read', { all: true }); list.forEach(n => { n.read = true; }); paint(r.unread); toast('All marked as read'); }
      catch (ex) { toast(ex.message); }
    });
    more.addEventListener('click', () => withBusy(more, () => load(true)));
    ul.addEventListener('click', async e => {
      const rb = e.target.closest('[data-restore]');
      if (rb) {
        withBusy(rb, async () => {
          try { await api('POST', `items/${encodeURIComponent(rb.dataset.restore)}/restore`, {}); toast('Restored'); await load(false); }
          catch (ex) { toast(ex.message); }
        });
        return;
      }
      const ob = e.target.closest('[data-open]');
      if (!ob) return;
      const n = list.find(x => String(x.id) === ob.dataset.open);
      if (!n) return;
      if (!n.read) {
        n.read = true;
        api('POST', 'notifications/read', { ids: [n.id] }).then(r => setBadge(r.unread)).catch(() => {});
      }
      const t = TYPES[n.itemType] || TYPES.material;
      if (n.itemExists && !n.itemDeleted) go(`#/${t.path}/${encodeURIComponent(n.itemId)}`);
      else paint(Math.max(0, S.unread - 1));
    });
    pageRefresh = () => load(false);
    await load(false);
  }

  // ---------- backup (admin) ----------
  function renderBackup() {
    setHeader('Backup', '#/');
    app.innerHTML = `
      <section class="panel">
        <h2>Download a backup</h2>
        <p>One file with all materials, tools, photos and people. Keep it somewhere safe and private (it contains sign-in info).</p>
        <a class="btn btn-primary btn-wide" href="api/backup" download id="dlBackup">Download backup file</a>
      </section>
      <section class="panel">
        <h2>Restore</h2>
        <p>Pick a backup file. Items in the file are added; items that already exist are replaced with the file's copy. People who are missing are added back.</p>
        <p>Files saved by the <b>old version</b> of this app (from each phone's "Save backup file") work here too.</p>
        <input type="file" id="importFile" accept=".json,application/json" class="sr-only" tabindex="-1">
        <label for="importFile" class="btn btn-light btn-wide" role="button">Choose backup file</label>
        <p class="hint" id="importStatus" aria-live="polite"></p>
      </section>`;
    const imp = app.querySelector('#importFile'), st = app.querySelector('#importStatus');
    imp.addEventListener('change', async () => {
      const f = imp.files && imp.files[0];
      if (!f) return;
      st.textContent = 'Uploading... please keep this screen open.';
      try {
        const text = await f.text();
        try { JSON.parse(text); } catch (e) { throw new Error('This is not a backup file.'); }
        const r = await api('POST', 'restore', text);
        st.textContent = `Done: ${r.items} ${r.items === 1 ? 'item' : 'items'} restored` + (r.people ? `, ${r.people} people added` : '') + (r.skipped ? ` (${r.skipped} skipped because they were not valid)` : '') + '.';
        toast('Restore finished');
      } catch (ex) { st.textContent = 'Could not restore: ' + ex.message; }
      finally { imp.value = ''; }
    });
  }

  // ---------- router ----------
  let renderSeq = 0, booted = false;
  async function route() {
    const seq = ++renderSeq;
    pageRefresh = null;
    document.getElementById('modal').hidden = true;
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean).map(decodeURIComponent);
    try {
      if (!booted) {
        try { await loadState(); booted = true; }
        catch (ex) {
          if (ex.status === 0) { app.innerHTML = `<div class="empty"><p>${esc(NO_CONN)}</p><button class="btn btn-primary" id="reloadBtn">Try again</button></div>`;
            app.querySelector('#reloadBtn').addEventListener('click', () => location.reload()); return; }
          throw ex;
        }
      }
      if (S.setupNeeded) return renderSetup();
      if (!S.user) return renderLogin();
      if (S.user.mustChangePassword) return renderPasswordForm(true);
      const adminPages = ['people', 'backup', 'notifications'];
      if (adminPages.includes(parts[0]) && !isAdmin()) return go('#/');
      if (!parts.length) await renderHome();
      else if (parts[0] === 'account') parts[1] === 'password' ? renderPasswordForm(false) : renderAccount();
      else if (parts[0] === 'backup') renderBackup();
      else if (parts[0] === 'notifications') await renderNotifications();
      else if (parts[0] === 'people') {
        if (!parts[1]) await renderPeople();
        else if (parts[1] === 'new') renderAddPerson();
        else await renderPerson(parts[1]);
      } else if (byPath[parts[0]]) {
        const t = byPath[parts[0]];
        if (parts.length === 1) await renderList(t);
        else if (parts[1] === 'new') await renderForm(t, null);
        else if (parts[2] === 'edit') await renderForm(t, parts[1]);
        else await renderDetail(t, parts[1]);
      } else return go('#/');
    } catch (err) {
      if (err.status === 401) return; // already sent to sign-in
      console.error(err);
      if (seq === renderSeq) app.innerHTML = `<div class="empty"><p>${esc(err.message || 'Something went wrong.')}</p>
        <button class="btn btn-primary" id="retryBtn">Try again</button></div>`;
      const rb = document.getElementById('retryBtn'); if (rb) rb.addEventListener('click', route);
    }
    if (seq === renderSeq) window.scrollTo(0, 0);
    if (parts[0] !== 'notifications') refreshUnread();
  }

  // Keep lists fresh for everyone: reload when the app comes back to the front, and every 30 seconds while open.
  let lastRefresh = 0;
  async function refreshQuietly() {
    if (document.hidden || Date.now() - lastRefresh < 3000) return;
    lastRefresh = Date.now();
    if (!pageRefresh || !location.hash.startsWith('#/notifications')) refreshUnread();
    if (!pageRefresh) return;
    try { await pageRefresh(); } catch (e) { /* banner already shows connection problems */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshQuietly(); });
  window.addEventListener('focus', refreshQuietly);
  setInterval(refreshQuietly, 30000);

  // A push arrived while the app is open: update the bell right away.
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'push') { refreshUnread(); if (location.hash.startsWith('#/notifications') && pageRefresh) pageRefresh().catch(() => {}); }
  });
  window.addEventListener('hashchange', route);
  route();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed', err)); });
  }
})();
