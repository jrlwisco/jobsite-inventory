'use strict';
// Emergency password reset from the server's command line (e.g. if the only admin forgets their password).
// Usage: DATA_DIR=/data node server/reset-password.js <username> <new-password>
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { openDb } = require('./db');
const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.error('Usage: node server/reset-password.js <username> <new-password (8+ characters)>');
  process.exit(1);
}
const db = openDb(path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data')));
const u = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim().toLowerCase());
if (!u) { console.error('No such user: ' + username); process.exit(1); }
db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, disabled = 0 WHERE id = ?').run(bcrypt.hashSync(password, 12), u.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
console.log(`Password reset for ${username}. They will be asked to pick a new one after signing in.`);
