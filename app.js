/* Job Site Inventory - main app (plain JavaScript, no libraries) */
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
    box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 3 6.5v11L12 22l9-4.5v-11L12 2zm0 2.2 6.6 3.3L12 10.8 5.4 7.5 12 4.2zM5 9.1l6 3v7.6l-6-3V9.1zm8 10.6v-7.6l6-3v7.6l-6 3z"/></svg>'
  };

  const app = document.getElementById('app');
  const titleEl = document.getElementById('pageTitle');
  const backBtn = document.getElementById('backBtn');
  let backTarget = '#/';
  const searchState = { home: '', material: { q: '', loc: '' }, tool: { q: '', loc: '' } };

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function fmtQty(n) {
    const v = Number(n);
    if (!isFinite(v)) return '0';
    return String(Math.round(v * 100) / 100);
  }
  function go(hash) { location.hash = hash; }
  function setHeader(title, back) {
    titleEl.textContent = title;
    document.title = title === 'Inventory' ? 'Job Site Inventory' : title + ' - Inventory';
    if (back) { backBtn.hidden = false; backTarget = back; } else { backBtn.hidden = true; }
  }
  backBtn.addEventListener('click', () => go(backTarget));

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function confirmBox(text, okLabel) {
    return new Promise(resolve => {
      const m = document.getElementById('modal');
      const ok = document.getElementById('modalOk');
      const cancel = document.getElementById('modalCancel');
      document.getElementById('modalText').textContent = text;
      ok.textContent = okLabel || 'Delete';
      m.hidden = false;
      cancel.focus();
      function done(v) {
        m.hidden = true;
        ok.removeEventListener('click', yes);
        cancel.removeEventListener('click', no);
        m.removeEventListener('click', bg);
        resolve(v);
      }
      function yes() { done(true); }
      function no() { done(false); }
      function bg(e) { if (e.target === m) done(false); }
      ok.addEventListener('click', yes);
      cancel.addEventListener('click', no);
      m.addEventListener('click', bg);
    });
  }

  // Search: every word typed must appear somewhere in name, quantity, location or description.
  function matches(item, query) {
    const words = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const hay = [item.name, fmtQty(item.quantity), item.location, item.description].join(' \u0001 ').toLowerCase();
    return words.every(w => hay.includes(w));
  }
  function sortItems(items) {
    return items.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base', numeric: true }));
  }

  // ---------- image resize ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve({ img, url }); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that picture. Try another one.')); };
      img.src = url;
    });
  }
  function drawScaled(img, max, quality) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const scale = Math.min(1, max / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    return c.toDataURL('image/jpeg', quality);
  }
  async function processPhoto(file) {
    const { img, url } = await loadImage(file);
    try {
      return { photo: drawScaled(img, 1024, 0.8), thumb: drawScaled(img, 240, 0.75) };
    } finally { URL.revokeObjectURL(url); }
  }

  // ---------- rendering pieces ----------
  function cardHTML(item, showType) {
    const t = TYPES[item.type] || TYPES.material;
    const thumb = item.thumb
      ? `<img class="thumb" src="${item.thumb}" alt="">`
      : `<div class="thumb thumb-empty ${t.key}" aria-hidden="true">${ICONS[t.key]}</div>`;
    return `<li><a class="card" href="#/${t.path}/${encodeURIComponent(item.id)}">
      ${thumb}
      <div class="card-body">
        ${showType ? `<span class="tag ${t.key}">${t.one}</span>` : ''}
        <span class="card-name">${esc(item.name) || '(no name)'}</span>
        <span class="card-qty">Qty: <b>${fmtQty(item.quantity)}</b></span>
        ${item.location ? `<span class="card-loc">${ICONS.pin}${esc(item.location)}</span>` : ''}
      </div>
    </a></li>`;
  }

  function searchBoxHTML(id, placeholder, value) {
    return `<div class="search">
      <label for="${id}" class="sr-only">Search</label>
      ${ICONS.search}
      <input id="${id}" type="search" placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="off" enterkeyhint="search">
      <button type="button" class="clear-btn" aria-label="Clear search" ${value ? '' : 'hidden'}>&times;</button>
    </div>`;
  }
  function wireSearch(root, id, onChange) {
    const input = root.querySelector('#' + id);
    const clear = input.parentElement.querySelector('.clear-btn');
    input.addEventListener('input', () => { clear.hidden = !input.value; onChange(input.value); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; onChange(''); input.focus(); });
    return input;
  }

  // ---------- pages ----------
  async function renderHome() {
    setHeader('Inventory', null);
    const items = await DB.all();
    const nMat = items.filter(i => i.type === 'material').length;
    const nTool = items.filter(i => i.type === 'tool').length;
    app.innerHTML = `
      <section class="home-search">
        ${searchBoxHTML('homeSearch', 'Search everything', searchState.home)}
        <p class="result-count" id="homeCount" hidden></p>
        <ul class="cards" id="homeResults"></ul>
      </section>
      <div class="home-buttons" id="homeButtons">
        <a class="big-btn material" href="#/materials">${ICONS.material}<span class="big-label">Materials</span><span class="big-count">${nMat} ${nMat === 1 ? 'item' : 'items'}</span></a>
        <a class="big-btn tool" href="#/tools">${ICONS.tool}<span class="big-label">Tools</span><span class="big-count">${nTool} ${nTool === 1 ? 'item' : 'items'}</span></a>
        <a class="btn btn-light btn-wide backup-link" href="#/backup">${ICONS.box}<span>Backup &amp; Restore</span></a>
      </div>
    `;
    const buttons = app.querySelector('#homeButtons');
    const results = app.querySelector('#homeResults');
    const count = app.querySelector('#homeCount');
    function update(q) {
      searchState.home = q;
      buttons.hidden = !!q.trim();
      if (!q.trim()) { results.innerHTML = ''; count.hidden = true; return; }
      const found = sortItems(items.filter(i => matches(i, q)));
      count.hidden = false;
      count.textContent = found.length ? `Found ${found.length}` : 'Nothing found. Try a different word.';
      results.innerHTML = found.map(i => cardHTML(i, true)).join('');
    }
    wireSearch(app, 'homeSearch', update);
    update(searchState.home);
  }

  async function renderList(t) {
    setHeader(t.many, '#/');
    const items = sortItems(await DB.byType(t.key));
    const st = searchState[t.key];
    const locations = [...new Set(items.map(i => (i.location || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    if (st.loc && !locations.includes(st.loc)) st.loc = '';
    app.innerHTML = `
      <a class="btn btn-primary btn-wide ${t.key}" href="#/${t.path}/new">${ICONS.plus}<span>Add ${t.one}</span></a>
      ${items.length ? `
      <div class="filters">
        ${searchBoxHTML('listSearch', 'Search ' + t.many.toLowerCase(), st.q)}
        ${locations.length > 1 ? `<label class="loc-filter">${ICONS.pin}<span class="sr-only">Location</span>
          <select id="locFilter">
            <option value="">All locations</option>
            ${locations.map(l => `<option value="${esc(l)}" ${l === st.loc ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select></label>` : ''}
      </div>
      <p class="result-count" id="listCount"></p>
      <ul class="cards" id="list"></ul>` : `
      <div class="empty">
        <div class="empty-icon ${t.key}">${ICONS[t.key]}</div>
        <p>No ${t.many.toLowerCase()} yet.</p>
        <p>Tap <b>Add ${t.one}</b> to add your first one.</p>
      </div>`}
    `;
    if (!items.length) return;
    const list = app.querySelector('#list');
    const count = app.querySelector('#listCount');
    function update() {
      const found = items.filter(i => matches(i, st.q) && (!st.loc || (i.location || '').trim() === st.loc));
      const filtered = st.q.trim() || st.loc;
      count.textContent = filtered
        ? (found.length ? `Showing ${found.length} of ${items.length}` : 'Nothing found. Try a different word.')
        : `${items.length} ${items.length === 1 ? t.one.toLowerCase() : t.many.toLowerCase()}`;
      list.innerHTML = found.map(i => cardHTML(i, false)).join('');
    }
    wireSearch(app, 'listSearch', q => { st.q = q; update(); });
    const sel = app.querySelector('#locFilter');
    if (sel) sel.addEventListener('change', () => { st.loc = sel.value; update(); });
    update();
  }

  async function renderDetail(t, id) {
    const item = await DB.get(id);
    if (!item || item.type !== t.key) { setHeader(t.many, '#/' + t.path); app.innerHTML = notFound(t); return; }
    setHeader(t.one, '#/' + t.path);
    app.innerHTML = `
      <article class="detail">
        ${item.photo ? `<img class="detail-photo" src="${item.photo}" alt="Photo of ${esc(item.name)}">` :
          `<div class="detail-photo photo-empty ${t.key}">${ICONS[t.key]}<span>No photo</span></div>`}
        <div class="detail-info">
          <h2 class="detail-name">${esc(item.name)}</h2>
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
          <p class="muted small">Last changed: ${new Date(item.updatedAt || item.createdAt).toLocaleString()}</p>
          <div class="action-row">
            <a class="btn btn-primary ${t.key}" href="#/${t.path}/${encodeURIComponent(item.id)}/edit">Edit</a>
            <button type="button" class="btn btn-danger" id="delBtn">Delete</button>
          </div>
        </div>
      </article>`;
    const out = app.querySelector('#qtyOut');
    app.querySelectorAll('.qty-btn').forEach(b => b.addEventListener('click', async () => {
      const next = Math.max(0, Number(item.quantity || 0) + Number(b.dataset.step));
      item.quantity = Math.round(next * 100) / 100;
      item.updatedAt = Date.now();
      out.textContent = fmtQty(item.quantity);
      await DB.put(item);
      toast('Quantity saved: ' + fmtQty(item.quantity));
    }));
    app.querySelector('#delBtn').addEventListener('click', async () => {
      if (await confirmBox(`Delete "${item.name}"? This cannot be undone.`, 'Delete')) {
        await DB.remove(item.id);
        toast('Deleted');
        go('#/' + t.path);
      }
    });
  }

  function notFound(t) {
    return `<div class="empty"><p>That item was not found. It may have been deleted.</p>
      <a class="btn btn-primary ${t.key}" href="#/${t.path}">Back to ${t.many}</a></div>`;
  }

  async function renderForm(t, id) {
    let item = null;
    if (id) {
      item = await DB.get(id);
      if (!item || item.type !== t.key) { setHeader(t.many, '#/' + t.path); app.innerHTML = notFound(t); return; }
    }
    const editing = !!item;
    setHeader(editing ? 'Edit ' + t.one : 'Add ' + t.one, editing ? `#/${t.path}/${encodeURIComponent(id)}` : '#/' + t.path);
    const data = item ? Object.assign({}, item) : { name: '', quantity: 1, location: '', description: '', photo: '', thumb: '' };

    app.innerHTML = `
      <form class="form" id="itemForm" novalidate>
        <div class="field">
          <label for="f-name">Name <span class="req">(required)</span></label>
          <input id="f-name" name="name" type="text" required maxlength="120" autocomplete="off" autocapitalize="sentences"
            placeholder="${t.key === 'tool' ? 'e.g. Cordless drill' : 'e.g. 2x4 lumber 8 ft'}" value="${esc(data.name)}">
          <p class="error" id="nameErr" hidden>Please type a name.</p>
        </div>
        <div class="field">
          <label for="f-qty">Quantity</label>
          <div class="qty-row">
            <button type="button" class="qty-btn" data-step="-1" aria-label="One less">&minus;</button>
            <input id="f-qty" name="quantity" type="number" inputmode="decimal" min="0" step="any" value="${fmtQty(data.quantity)}">
            <button type="button" class="qty-btn" data-step="1" aria-label="One more">+</button>
          </div>
        </div>
        <div class="field">
          <label for="f-loc">Location <span class="hint">Where is it?</span></label>
          <input id="f-loc" name="location" type="text" maxlength="120" list="locList" autocomplete="off" autocapitalize="sentences"
            placeholder="e.g. Truck 2, Shop, Smith job" value="${esc(data.location)}">
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
          <textarea id="f-desc" name="description" rows="4" maxlength="2000" autocapitalize="sentences">${esc(data.description)}</textarea>
        </div>
        <div class="action-row sticky-actions">
          <a class="btn btn-light" href="${backTarget}">Cancel</a>
          <button type="submit" class="btn btn-primary ${t.key}" id="saveBtn">Save</button>
        </div>
      </form>`;

    // location suggestions from existing items
    DB.byType(t.key).then(all => {
      const locs = [...new Set(all.map(i => (i.location || '').trim()).filter(Boolean))];
      app.querySelector('#locList') && (app.querySelector('#locList').innerHTML = locs.map(l => `<option value="${esc(l)}">`).join(''));
    });

    const form = app.querySelector('#itemForm');
    const qty = form.querySelector('#f-qty');
    form.querySelectorAll('.qty-btn').forEach(b => b.addEventListener('click', () => {
      const cur = parseFloat(qty.value) || 0;
      qty.value = fmtQty(Math.max(0, cur + Number(b.dataset.step)));
    }));

    const photoBox = form.querySelector('#photoBox');
    const fileInput = form.querySelector('#f-photo');
    const status = form.querySelector('#photoStatus');
    const removeBtn = form.querySelector('#photoRemove');
    const pickText = form.querySelector('#photoPickText');
    let busy = false;
    function showPhoto() {
      photoBox.innerHTML = data.photo
        ? `<img src="${data.photo}" alt="Photo preview">`
        : `<div class="photo-empty ${t.key}">${ICONS.camera}<span>No photo yet</span></div>`;
      removeBtn.hidden = !data.photo;
      pickText.textContent = data.photo ? 'Change photo' : 'Take or choose photo';
    }
    showPhoto();
    form.querySelector('#photoPick').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      busy = true;
      status.textContent = 'Getting photo ready...';
      try {
        const r = await processPhoto(f);
        data.photo = r.photo; data.thumb = r.thumb;
        status.textContent = '';
        showPhoto();
      } catch (err) {
        status.textContent = err.message || 'Could not use that photo.';
      } finally {
        busy = false;
        fileInput.value = '';
      }
    });
    removeBtn.addEventListener('click', () => { data.photo = ''; data.thumb = ''; showPhoto(); });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (busy) { toast('Wait a moment, photo is still loading'); return; }
      const name = form.querySelector('#f-name').value.trim();
      const errEl = form.querySelector('#nameErr');
      if (!name) { errEl.hidden = false; form.querySelector('#f-name').focus(); return; }
      errEl.hidden = true;
      const now = Date.now();
      const q = parseFloat(qty.value);
      const rec = {
        id: editing ? item.id : uid(),
        type: t.key,
        name,
        quantity: isFinite(q) && q > 0 ? Math.round(q * 100) / 100 : 0,
        location: form.querySelector('#f-loc').value.trim(),
        description: form.querySelector('#f-desc').value.trim(),
        photo: data.photo || '',
        thumb: data.thumb || '',
        createdAt: editing ? item.createdAt : now,
        updatedAt: now
      };
      const btn = form.querySelector('#saveBtn');
      btn.disabled = true;
      try {
        await DB.put(rec);
        toast('Saved');
        go(editing ? `#/${t.path}/${encodeURIComponent(rec.id)}` : '#/' + t.path);
      } catch (err) {
        btn.disabled = false;
        alert('Could not save. Your phone may be out of space.\n\n' + (err && err.message ? err.message : ''));
      }
    });
    if (!editing) setTimeout(() => { if (window.matchMedia('(pointer: fine)').matches) form.querySelector('#f-name').focus(); }, 50);
  }

  // ---------- backup ----------
  async function renderBackup() {
    setHeader('Backup & Restore', '#/');
    const items = await DB.all();
    app.innerHTML = `
      <section class="panel">
        <h2>Save a backup</h2>
        <p>Your list is saved only on this device. Save a backup file now and then (with photos) and keep it somewhere safe, like email or cloud storage.</p>
        <p class="muted">${items.length} ${items.length === 1 ? 'item' : 'items'} on this device.</p>
        <button type="button" class="btn btn-primary btn-wide" id="exportBtn" ${items.length ? '' : 'disabled'}>Save backup file</button>
      </section>
      <section class="panel">
        <h2>Restore from a backup</h2>
        <p>Pick a backup file. Items in the file are added to this device. Items that already exist are updated.</p>
        <input type="file" id="importFile" accept=".json,application/json" class="sr-only" tabindex="-1">
        <label for="importFile" class="btn btn-light btn-wide" role="button">Choose backup file</label>
        <p class="hint" id="importStatus" aria-live="polite"></p>
      </section>
      <section class="panel danger-zone">
        <h2>Start over</h2>
        <p>Delete everything on this device. Save a backup first!</p>
        <button type="button" class="btn btn-danger btn-wide" id="wipeBtn" ${items.length ? '' : 'disabled'}>Delete everything</button>
      </section>`;

    app.querySelector('#exportBtn').addEventListener('click', async () => {
      const all = await DB.all();
      const payload = { app: 'jobsite-inventory', version: 1, exportedAt: new Date().toISOString(), items: all };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const d = new Date();
      const name = `inventory-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
      // On phones, the share sheet is the most reliable way to save a file (Save to Files, email, etc.)
      const file = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
      const touch = window.matchMedia('(pointer: coarse)').matches;
      if (touch && file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Inventory backup' }); toast('Backup ready'); return; }
        catch (err) { if (err && err.name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('Backup file saved');
    });

    const imp = app.querySelector('#importFile');
    const st = app.querySelector('#importStatus');
    imp.addEventListener('change', async () => {
      const f = imp.files && imp.files[0];
      if (!f) return;
      st.textContent = 'Reading file...';
      try {
        const data = JSON.parse(await f.text());
        const list = Array.isArray(data) ? data : data && data.items;
        if (!Array.isArray(list)) throw new Error('This is not an inventory backup file.');
        const clean = list.filter(i => i && typeof i === 'object' && i.id && (i.type === 'material' || i.type === 'tool')).map(i => ({
          id: String(i.id), type: i.type, name: String(i.name || ''), quantity: Number(i.quantity) || 0,
          location: String(i.location || ''), description: String(i.description || ''),
          photo: typeof i.photo === 'string' && i.photo.startsWith('data:image/') ? i.photo : '',
          thumb: typeof i.thumb === 'string' && i.thumb.startsWith('data:image/') ? i.thumb : '',
          createdAt: Number(i.createdAt) || Date.now(), updatedAt: Number(i.updatedAt) || Date.now()
        }));
        if (!clean.length) throw new Error('No items found in this file.');
        await DB.putMany(clean);
        st.textContent = '';
        toast(`Restored ${clean.length} ${clean.length === 1 ? 'item' : 'items'}`);
        renderBackup();
      } catch (err) {
        st.textContent = 'Could not restore: ' + (err instanceof SyntaxError ? 'this file is not a backup file.' : err.message);
      } finally { imp.value = ''; }
    });

    app.querySelector('#wipeBtn').addEventListener('click', async () => {
      if (await confirmBox('Delete ALL materials and tools on this device? This cannot be undone.', 'Delete all')) {
        await DB.clear();
        toast('Everything deleted');
        renderBackup();
      }
    });
  }

  // ---------- router ----------
  let renderSeq = 0;
  async function route() {
    const seq = ++renderSeq;
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean).map(decodeURIComponent);
    const m = document.getElementById('modal'); m.hidden = true;
    try {
      if (!parts.length) await renderHome();
      else if (parts[0] === 'backup') await renderBackup();
      else if (byPath[parts[0]]) {
        const t = byPath[parts[0]];
        if (parts.length === 1) await renderList(t);
        else if (parts[1] === 'new') await renderForm(t, null);
        else if (parts[2] === 'edit') await renderForm(t, parts[1]);
        else await renderDetail(t, parts[1]);
      } else { go('#/'); return; }
    } catch (err) {
      console.error(err);
      app.innerHTML = `<div class="empty"><p>Something went wrong.</p><p class="muted">${esc(err && err.message)}</p>
        <a class="btn btn-primary" href="#/">Go home</a></div>`;
    }
    if (seq === renderSeq) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();

  // Ask the browser not to clear our data when space runs low.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(p => { if (!p) navigator.storage.persist().catch(() => {}); }).catch(() => {});
  }

  // Offline support
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed', err)); });
  }
})();
