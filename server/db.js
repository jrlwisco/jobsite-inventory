'use strict';
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'photos'), { recursive: true });
  const db = new Database(path.join(dataDir, 'inventory.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const version = db.pragma('user_version', { simple: true });
  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin','crew')),
        password_hash TEXT NOT NULL,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        user_agent TEXT
      );
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('material','tool')),
        name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        location TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        photo TEXT,
        thumb TEXT,
        created_at INTEGER NOT NULL,
        created_by_name TEXT,
        updated_at INTEGER NOT NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by_name TEXT
      );
      CREATE INDEX IF NOT EXISTS items_type ON items(type);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO settings (key, value) VALUES ('crew_can_delete', '0');
      PRAGMA user_version = 1;
    `);
  }
  if (db.pragma('user_version', { simple: true }) < 2) {
    db.transaction(() => db.exec(`
      ALTER TABLE items ADD COLUMN deleted_at INTEGER;
      ALTER TABLE items ADD COLUMN deleted_by_name TEXT;
      ALTER TABLE users ADD COLUMN notif_filter TEXT NOT NULL DEFAULT 'key';
      ALTER TABLE users ADD COLUMN notif_read_upto INTEGER NOT NULL DEFAULT 0;
      -- Activity feed for admins: one row per add / delete / restore / edit / quantity change
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('add','delete','restore','edit','qty')),
        item_id TEXT NOT NULL,
        item_type TEXT NOT NULL,
        actor_id INTEGER,
        actor_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        snapshot TEXT NOT NULL,       -- JSON: name, quantity, location, description, photo/thumb at that moment
        details TEXT                  -- JSON: changes list, quantity from/to
      );
      CREATE INDEX IF NOT EXISTS events_item ON events(item_id);
      CREATE TABLE IF NOT EXISTS event_reads (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, event_id)
      );
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        user_agent TEXT
      );
      DELETE FROM settings WHERE key = 'crew_can_delete';
      PRAGMA user_version = 2;
    `))();
  }
  return db;
}
module.exports = { openDb };
