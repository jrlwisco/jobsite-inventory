'use strict';
/*
 * Job Site Inventory - server
 * Node + Express + SQLite. Serves the app (../public) and a small JSON API.
 * Settings come from environment variables (see README):
 *   PORT, HOST, DATA_DIR, COOKIE_SECURE (auto|true|false), TRUST_PROXY, SETUP_CODE
 */
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { openDb } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const COOKIE_SECURE = (process.env.COOKIE_SECURE || 'auto').toLowerCase();
const SETUP_CODE = process.env.SETUP_CODE || '';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 3600 * 1000;
const BCRYPT_ROUNDS = 12;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_THUMB_BYTES = 512 * 1024;

const db = openDb(DATA_DIR);
const app = express();
app.disable('x-powered-by');
const tp = process.env.TRUST_PROXY ?? '1';
app.set('trust proxy', /^\d+$/.test(tp) ? Number(tp) : tp === 'true' ? true : tp === 'false' ? false : tp);

// ---------- small helpers ----------
const now = () => Date.now();
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = msg => new HttpError(400, msg);

function str(v, { max = 200, required = false, label = 'Value' } = {}) {
  if (v == null) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') throw bad(`${label} is not valid.`);
  // strip control characters except newline/tab
  const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (required && !s) throw bad(`Please fill in ${label.toLowerCase()}.`);
  if (s.length > max) throw bad(`${label} is too long (max ${max} characters).`);
  return s;
}
function qty(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e9) throw bad('Quantity must be a number, 0 or more.');
  return Math.round(n * 100) / 100;
}
function validPassword(p) {
  if (typeof p !== 'string' || p.length < 8) throw bad('Password must be at least 8 characters.');
  if (p.length > 200) throw bad('Password is too long.');
  return p;
}
function validUsername(u) {
  const s = str(u, { max: 60, required: true, label: 'Username' }).toLowerCase();
  if (!/^[a-z0-9._@+-]{3,60}$/.test(s)) throw bad('Username: 3 or more letters or numbers (no spaces). An email address is fine.');
  return s;
}
const getSetting = k => (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) || {}).value;
const settingsObj = () => ({ crewCanDelete: getSetting('crew_can_delete') === '1' });

// ---------- photos ----------
const PHOTO_NAME = /^[a-f0-9]{32}(_t)?\.(jpg|png|webp)$/;
function decodeImage(dataUrl, maxBytes) {
  if (typeof dataUrl !== 'string') throw bad('Photo is not valid.');
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) throw bad('Only pictures (JPEG, PNG or WebP) can be uploaded.');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) throw bad('Photo is empty.');
  if (buf.length > maxBytes) throw new HttpError(413, 'Photo is too big.');
  let ext = null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ext = 'jpg';
  else if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ext = 'png';
  else if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') ext = 'webp';
  if (!ext) throw bad('That file is not a picture.');
  return { buf, ext };
}
// Returns {photo, thumb} file names, written to disk.
function savePhotos(photoDataUrl, thumbDataUrl) {
  const p = decodeImage(photoDataUrl, MAX_PHOTO_BYTES);
  const t = thumbDataUrl ? decodeImage(thumbDataUrl, MAX_THUMB_BYTES) : p;
  const base = crypto.randomBytes(16).toString('hex');
  const photo = `${base}.${p.ext}`, thumb = `${base}_t.${t.ext}`;
  fs.writeFileSync(path.join(PHOTO_DIR, photo), p.buf);
  fs.writeFileSync(path.join(PHOTO_DIR, thumb), t.buf);
  return { photo, thumb };
}
function removePhotoFiles(...names) {
  for (const n of names) if (n && PHOTO_NAME.test(n)) fs.rm(path.join(PHOTO_DIR, n), { force: true }, () => {});
}
function photoToDataUrl(name) {
  if (!name || !PHOTO_NAME.test(name)) return '';
  try {
    const buf = fs.readFileSync(path.join(PHOTO_DIR, name));
    const ext = name.split('.').pop();
    return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf.toString('base64')}`;
  } catch { return ''; }
}

// ---------- sessions ----------
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isSecure(req) { return COOKIE_SECURE === 'true' || (COOKIE_SECURE === 'auto' && req.secure); }
function setSessionCookie(req, res, token, maxAgeSec) {
  res.append('Set-Cookie', `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${isSecure(req) ? '; Secure' : ''}`);
}
function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)')
    .run(sha256(token), userId, now(), now() + SESSION_MS, String(req.get('user-agent') || '').slice(0, 200));
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), userId);
  setSessionCookie(req, res, token, SESSION_MS / 1000);
  return token;
}
function loadSession(req, res) {
  const token = parseCookies(req).sid;
  if (!token || token.length > 100) return null;
  const h = sha256(token);
  const row = db.prepare(`SELECT s.token_hash, s.expires_at, u.id, u.username, u.name, u.role, u.must_change_password, u.disabled
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(h);
  if (!row || row.expires_at < now() || row.disabled) {
    if (row) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(h);
    return null;
  }
  // Sliding expiry: renew at most once a day so people who use it stay signed in.
  if (row.expires_at - now() < SESSION_MS - 24 * 3600 * 1000) {
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(now() + SESSION_MS, h);
    setSessionCookie(req, res, token, SESSION_MS / 1000);
  }
  return { tokenHash: h, id: row.id, username: row.username, name: row.name, role: row.role, mustChangePassword: !!row.must_change_password };
}
function publicUser(u) {
  return u ? { id: u.id, username: u.username, name: u.name, role: u.role, mustChangePassword: !!u.mustChangePassword } : null;
}
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now()), 3600 * 1000).unref();

// ---------- rate limiting (in memory) ----------
const hits = new Map();
function limited(key, max, windowMs) {
  const h = hits.get(key);
  if (!h || now() - h.start > windowMs) return false;
  return h.count >= max;
}
function hit(key) {
  const h = hits.get(key);
  if (!h || now() - h.start > 15 * 60 * 1000) hits.set(key, { start: now(), count: 1 });
  else h.count++;
}
setInterval(() => { for (const [k, h] of hits) if (now() - h.start > 15 * 60 * 1000) hits.delete(k); }, 60 * 1000).unref();
const WINDOW = 15 * 60 * 1000;
const TOO_MANY = 'Too many tries. Please wait 15 minutes and try again.';

// ---------- middleware ----------
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'geolocation=(), microphone=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  });
  if (isSecure(req)) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});

// CSRF protection: state-changing requests must come from this site and be JSON.
const extraOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* ignore */ }
    const okHosts = [req.get('host'), req.get('x-forwarded-host')].filter(Boolean);
    if (!okHosts.includes(host) && !extraOrigins.includes(origin)) return res.status(403).json({ error: 'Request blocked (wrong origin).' });
  } else {
    const site = req.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') return res.status(403).json({ error: 'Request blocked.' });
  }
  if (req.method !== 'DELETE' && !req.is('application/json')) return res.status(415).json({ error: 'Expected JSON.' });
  next();
});

const jsonSmall = express.json({ limit: '8mb' });
const jsonBig = express.json({ limit: process.env.MAX_RESTORE_SIZE || '500mb' });
app.use('/api', (req, res, next) => (req.path === '/restore' ? jsonBig : jsonSmall)(req, res, next));

app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); req.user = loadSession(req, res); next(); });

function auth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  if (req.user.mustChangePassword) return res.status(403).json({ error: 'Please choose a new password first.', mustChangePassword: true });
  next();
}
function adminOnly(req, res, next) {
  auth(req, res, () => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Only an admin can do that.' }));
}

app.get('/healthz', (req, res) => { db.prepare('SELECT 1').get(); res.type('text').send('ok'); });

// ---------- auth routes ----------
const userCount = () => db.prepare('SELECT COUNT(*) c FROM users').get().c;

app.get('/api/state', (req, res) => {
  res.json({ setupNeeded: userCount() === 0, setupCodeRequired: !!SETUP_CODE, user: publicUser(req.user), settings: settingsObj() });
});

app.post('/api/setup', (req, res) => {
  const ipKey = 'setup:' + req.ip;
  if (limited(ipKey, 10, WINDOW)) throw new HttpError(429, TOO_MANY);
  hit(ipKey);
  if (SETUP_CODE) {
    const a = Buffer.from(String(req.body.setupCode || '')), b = Buffer.from(SETUP_CODE);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(403, 'Setup code is wrong.');
  }
  const name = str(req.body.name, { max: 60, required: true, label: 'Name' });
  const username = validUsername(req.body.username);
  const password = validPassword(req.body.password);
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const id = db.transaction(() => {
    if (userCount() > 0) throw new HttpError(409, 'Setup is already done. Please sign in.');
    return db.prepare('INSERT INTO users (username, name, role, password_hash, created_at) VALUES (?,?,?,?,?)')
      .run(username, name, 'admin', hash, now()).lastInsertRowid;
  })();
  startSession(req, res, id);
  res.json({ user: { id, username, name, role: 'admin', mustChangePassword: false } });
});

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);
app.post('/api/login', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase().slice(0, 60);
  const password = String(req.body.password || '').slice(0, 200);
  const ipKey = 'ip:' + req.ip, userKey = 'user:' + username;
  if (limited(ipKey, 30, WINDOW) || limited(userKey, 8, WINDOW)) throw new HttpError(429, TOO_MANY);
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) { hit(ipKey); hit(userKey); throw new HttpError(401, 'Wrong username or password.'); }
  if (u.disabled) throw new HttpError(403, 'This account is turned off. Ask your boss to turn it back on.');
  hits.delete(userKey);
  startSession(req, res, u.id);
  res.json({ user: publicUser({ ...u, mustChangePassword: u.must_change_password }) });
});

app.post('/api/logout', (req, res) => {
  if (req.user) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.user.tokenHash);
  setSessionCookie(req, res, '', 0);
  res.json({ ok: true });
});

app.post('/api/me/password', async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Please sign in.');
  const key = 'pw:' + req.user.id;
  if (limited(key, 10, WINDOW)) throw new HttpError(429, TOO_MANY);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!(await bcrypt.compare(String(req.body.currentPassword || ''), u.password_hash))) {
    hit(key);
    throw bad('Your current password is not right.');
  }
  const p = validPassword(req.body.newPassword);
  if (p === req.body.currentPassword) throw bad('Pick a password different from the old one.');
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(await bcrypt.hash(p, BCRYPT_ROUNDS), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(u.id, req.user.tokenHash); // sign out other devices
  res.json({ ok: true });
});

// ---------- items ----------
function itemOut(r) {
  return {
    id: r.id, type: r.type, name: r.name, quantity: r.quantity, location: r.location, description: r.description,
    photoUrl: r.photo ? 'api/photos/' + r.photo : '', thumbUrl: r.thumb ? 'api/photos/' + r.thumb : '',
    createdAt: r.created_at, createdByName: r.created_by_name || '', updatedAt: r.updated_at, updatedByName: r.updated_by_name || ''
  };
}
function readItemBody(b) {
  if (b.type !== 'material' && b.type !== 'tool') throw bad('Type must be material or tool.');
  return {
    type: b.type,
    name: str(b.name, { max: 120, required: true, label: 'Name' }),
    quantity: qty(b.quantity ?? 0),
    location: str(b.location, { max: 120, label: 'Location' }),
    description: str(b.description, { max: 2000, label: 'Description' })
  };
}
const getItem = id => db.prepare('SELECT * FROM items WHERE id = ?').get(String(id));

app.get('/api/items', auth, (req, res) => {
  const t = req.query.type;
  const rows = (t === 'material' || t === 'tool')
    ? db.prepare('SELECT * FROM items WHERE type = ? ORDER BY name COLLATE NOCASE').all(t)
    : db.prepare('SELECT * FROM items ORDER BY name COLLATE NOCASE').all();
  res.json({ items: rows.map(itemOut) });
});

app.get('/api/items/:id', auth, (req, res) => {
  const r = getItem(req.params.id);
  if (!r) throw new HttpError(404, 'That item was not found. It may have been deleted.');
  res.json({ item: itemOut(r) });
});

app.post('/api/items', auth, (req, res) => {
  const v = readItemBody(req.body);
  const files = req.body.photo ? savePhotos(req.body.photo, req.body.thumb) : { photo: null, thumb: null };
  const id = crypto.randomUUID();
  const t = now();
  try {
    db.prepare(`INSERT INTO items (id, type, name, quantity, location, description, photo, thumb, created_at, created_by_name, updated_at, updated_by, updated_by_name)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, v.type, v.name, v.quantity, v.location, v.description, files.photo, files.thumb, t, req.user.name, t, req.user.id, req.user.name);
  } catch (e) { removePhotoFiles(files.photo, files.thumb); throw e; }
  res.status(201).json({ item: itemOut(getItem(id)) });
});

app.put('/api/items/:id', auth, (req, res) => {
  const old = getItem(req.params.id);
  if (!old) throw new HttpError(404, 'That item was not found. It may have been deleted.');
  const v = readItemBody({ ...req.body, type: old.type });
  let photo = old.photo, thumb = old.thumb;
  if (req.body.photo) ({ photo, thumb } = savePhotos(req.body.photo, req.body.thumb));
  else if (req.body.removePhoto) { photo = null; thumb = null; }
  db.prepare(`UPDATE items SET name=?, quantity=?, location=?, description=?, photo=?, thumb=?, updated_at=?, updated_by=?, updated_by_name=? WHERE id=?`)
    .run(v.name, v.quantity, v.location, v.description, photo, thumb, now(), req.user.id, req.user.name, old.id);
  if (photo !== old.photo) removePhotoFiles(old.photo, old.thumb);
  res.json({ item: itemOut(getItem(old.id)) });
});

// +/- buttons: change the amount on the server so two people tapping at once don't overwrite each other.
app.post('/api/items/:id/adjust', auth, (req, res) => {
  const delta = Number(req.body.delta);
  if (!Number.isFinite(delta) || Math.abs(delta) > 1e6) throw bad('Bad amount.');
  const r = db.prepare(`UPDATE items SET quantity = MAX(0, ROUND(quantity + ?, 2)), updated_at = ?, updated_by = ?, updated_by_name = ? WHERE id = ?`)
    .run(delta, now(), req.user.id, req.user.name, String(req.params.id));
  if (!r.changes) throw new HttpError(404, 'That item was not found. It may have been deleted.');
  res.json({ item: itemOut(getItem(req.params.id)) });
});

app.delete('/api/items/:id', auth, (req, res) => {
  if (req.user.role !== 'admin' && !settingsObj().crewCanDelete) throw new HttpError(403, 'Only an admin can delete items.');
  const old = getItem(req.params.id);
  if (!old) throw new HttpError(404, 'That item was not found. It may have been deleted.');
  db.prepare('DELETE FROM items WHERE id = ?').run(old.id);
  removePhotoFiles(old.photo, old.thumb);
  res.json({ ok: true });
});

// Photos are only served to signed-in people.
app.get('/api/photos/:name', (req, res) => {
  if (!req.user) return res.status(401).end();
  const n = req.params.name;
  if (!PHOTO_NAME.test(n)) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(path.join(PHOTO_DIR, n), err => { if (err && !res.headersSent) res.status(404).end(); });
});

// ---------- people (admin) ----------
const userOut = u => ({ id: u.id, username: u.username, name: u.name, role: u.role, disabled: !!u.disabled, mustChangePassword: !!u.must_change_password, createdAt: u.created_at, lastLoginAt: u.last_login_at });
const activeAdmins = () => db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND disabled = 0").get().c;

app.get('/api/users', adminOnly, (req, res) => {
  res.json({ users: db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE').all().map(userOut) });
});
app.post('/api/users', adminOnly, (req, res) => {
  const name = str(req.body.name, { max: 60, required: true, label: 'Name' });
  const username = validUsername(req.body.username);
  const password = validPassword(req.body.password);
  const role = req.body.role === 'admin' ? 'admin' : 'crew';
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'That username is already taken. Try another.');
  const id = db.prepare('INSERT INTO users (username, name, role, password_hash, must_change_password, created_at) VALUES (?,?,?,?,1,?)')
    .run(username, name, role, bcrypt.hashSync(password, BCRYPT_ROUNDS), now()).lastInsertRowid;
  res.status(201).json({ user: userOut(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
});
function targetUser(req) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!u) throw new HttpError(404, 'Person not found.');
  return u;
}
app.put('/api/users/:id', adminOnly, (req, res) => {
  const u = targetUser(req);
  const name = req.body.name !== undefined ? str(req.body.name, { max: 60, required: true, label: 'Name' }) : u.name;
  const role = req.body.role === 'admin' || req.body.role === 'crew' ? req.body.role : u.role;
  const disabled = req.body.disabled !== undefined ? (req.body.disabled ? 1 : 0) : u.disabled;
  if (u.id === req.user.id && (role !== 'admin' || disabled)) throw bad("You can't turn off or demote your own account.");
  if (u.role === 'admin' && !u.disabled && (role !== 'admin' || disabled) && activeAdmins() <= 1) throw bad('There must be at least one admin.');
  db.prepare('UPDATE users SET name = ?, role = ?, disabled = ? WHERE id = ?').run(name, role, disabled, u.id);
  if (disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  res.json({ user: userOut(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
});
app.post('/api/users/:id/password', adminOnly, (req, res) => {
  const u = targetUser(req);
  const p = validPassword(req.body.password);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?').run(bcrypt.hashSync(p, BCRYPT_ROUNDS), u.id === req.user.id ? 0 : 1, u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(u.id, req.user.tokenHash);
  res.json({ ok: true });
});
app.delete('/api/users/:id', adminOnly, (req, res) => {
  const u = targetUser(req);
  if (u.id === req.user.id) throw bad("You can't remove yourself.");
  if (u.role === 'admin' && !u.disabled && activeAdmins() <= 1) throw bad('There must be at least one admin.');
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  res.json({ ok: true });
});
app.put('/api/settings', adminOnly, (req, res) => {
  if (req.body.crewCanDelete !== undefined) db.prepare("UPDATE settings SET value = ? WHERE key = 'crew_can_delete'").run(req.body.crewCanDelete ? '1' : '0');
  res.json({ settings: settingsObj() });
});

// ---------- backup / restore (admin) ----------
app.get('/api/backup', adminOnly, (req, res) => {
  const items = db.prepare('SELECT * FROM items ORDER BY created_at').all().map(r => ({
    id: r.id, type: r.type, name: r.name, quantity: r.quantity, location: r.location, description: r.description,
    photo: photoToDataUrl(r.photo), thumb: photoToDataUrl(r.thumb),
    createdAt: r.created_at, createdByName: r.created_by_name, updatedAt: r.updated_at, updatedByName: r.updated_by_name
  }));
  const users = db.prepare('SELECT * FROM users').all().map(u => ({
    username: u.username, name: u.name, role: u.role, disabled: !!u.disabled, passwordHash: u.password_hash, createdAt: u.created_at
  }));
  const d = new Date().toISOString().slice(0, 10);
  res.set('Content-Disposition', `attachment; filename="inventory-backup-${d}.json"`);
  res.type('application/json').send(JSON.stringify({ app: 'jobsite-inventory', version: 2, exportedAt: new Date().toISOString(), settings: settingsObj(), users, items }));
});

app.post('/api/restore', adminOnly, (req, res) => {
  const data = req.body;
  const list = Array.isArray(data) ? data : data && data.items;
  if (!Array.isArray(list)) throw bad('This is not an inventory backup file.');
  const isV1 = !(data && data.version >= 2);
  let items = 0, people = 0, skipped = 0;
  const written = [];
  const tx = db.transaction(() => {
    for (const raw of list) {
      try {
        if (!raw || typeof raw !== 'object') { skipped++; continue; }
        const v = readItemBody(raw);
        const id = str(raw.id, { max: 100 }) || crypto.randomUUID();
        let files = { photo: null, thumb: null };
        if (raw.photo) { files = savePhotos(raw.photo, raw.thumb || null); written.push(files.photo, files.thumb); }
        const old = getItem(id);
        const created = Number(raw.createdAt) || now(), updated = Number(raw.updatedAt) || now();
        const byName = isV1 ? `${req.user.name} (from old version)` : (str(raw.updatedByName, { max: 60 }) || req.user.name);
        db.prepare(`INSERT INTO items (id, type, name, quantity, location, description, photo, thumb, created_at, created_by_name, updated_at, updated_by, updated_by_name)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,?)
          ON CONFLICT(id) DO UPDATE SET type=excluded.type, name=excluded.name, quantity=excluded.quantity, location=excluded.location,
            description=excluded.description, photo=excluded.photo, thumb=excluded.thumb, updated_at=excluded.updated_at, updated_by=NULL, updated_by_name=excluded.updated_by_name`)
          .run(id, v.type, v.name, v.quantity, v.location, v.description, files.photo, files.thumb, created,
            isV1 ? byName : (str(raw.createdByName, { max: 60 }) || byName), updated, byName);
        if (old) removePhotoFiles(old.photo, old.thumb);
        items++;
      } catch (e) { if (e instanceof HttpError) skipped++; else throw e; }
    }
    if (!isV1 && Array.isArray(data.users)) {
      for (const u of data.users) {
        try {
          const username = validUsername(u.username);
          if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) continue;
          if (typeof u.passwordHash !== 'string' || !/^\$2[aby]\$\d\d\$/.test(u.passwordHash)) continue;
          db.prepare('INSERT INTO users (username, name, role, password_hash, disabled, created_at) VALUES (?,?,?,?,?,?)')
            .run(username, str(u.name, { max: 60 }) || username, u.role === 'admin' ? 'admin' : 'crew', u.passwordHash, u.disabled ? 1 : 0, Number(u.createdAt) || now());
          people++;
        } catch (e) { if (!(e instanceof HttpError)) throw e; }
      }
    }
  });
  try { tx(); } catch (e) { removePhotoFiles(...written); throw e; }
  res.json({ items, people, skipped, fromOldVersion: isV1 });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// ---------- the app (static files) ----------
app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, file) {
    // Always check for a newer copy; the service worker handles offline use.
    res.set('Cache-Control', 'no-cache');
    if (file.endsWith('manifest.json')) res.type('application/manifest+json');
  }
}));

// ---------- errors ----------
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too big to upload.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'That file or data could not be read.' });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => console.log(`Job Site Inventory running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (data: ${DATA_DIR})`));
}
module.exports = app;
