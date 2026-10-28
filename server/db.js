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
  if (db.pragma('user_version', { simple: true }) < 3) {
    // v2.2: Equipment & Maintenance. SQLite can't change CHECK rules in place, so items/events are rebuilt.
    db.pragma('foreign_keys = OFF');
    db.transaction(() => db.exec(`
      CREATE TABLE items_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('material','tool','equipment')),
        name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        location TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        photo TEXT, thumb TEXT,
        created_at INTEGER NOT NULL, created_by_name TEXT,
        updated_at INTEGER NOT NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by_name TEXT,
        deleted_at INTEGER, deleted_by_name TEXT,
        meter_unit TEXT CHECK (meter_unit IN ('hours','miles')),
        meter_value REAL, meter_updated_at INTEGER, meter_updated_by_name TEXT
      );
      INSERT INTO items_new (id, type, name, quantity, location, description, photo, thumb, created_at, created_by_name, updated_at, updated_by, updated_by_name, deleted_at, deleted_by_name)
        SELECT id, type, name, quantity, location, description, photo, thumb, created_at, created_by_name, updated_at, updated_by, updated_by_name, deleted_at, deleted_by_name FROM items;
      DROP TABLE items;
      ALTER TABLE items_new RENAME TO items;
      CREATE INDEX items_type ON items(type);

      CREATE TABLE events_new (
        id INTEGER PRIMARY KEY,
        kind TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_type TEXT NOT NULL,
        actor_id INTEGER,
        actor_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        details TEXT,
        recipient_id INTEGER,   -- NULL = for all admins; otherwise a notice for one person (e.g. "your request was approved")
        ref_id TEXT             -- change request / repair request id
      );
      INSERT INTO events_new (id, kind, item_id, item_type, actor_id, actor_name, created_at, snapshot, details)
        SELECT id, kind, item_id, item_type, actor_id, actor_name, created_at, snapshot, details FROM events;
      DROP TABLE events;
      ALTER TABLE events_new RENAME TO events;
      CREATE INDEX events_item ON events(item_id);
      CREATE INDEX events_recipient ON events(recipient_id);

      CREATE TABLE meter_readings (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        user_id INTEGER, user_name TEXT NOT NULL,
        lower INTEGER NOT NULL DEFAULT 0,
        previous REAL
      );
      CREATE INDEX meter_item ON meter_readings(item_id, created_at);

      CREATE TABLE maint_records (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('maintenance','repair')),
        done_date TEXT NOT NULL,
        meter REAL, meter_unit TEXT,
        work TEXT NOT NULL,
        performed_by TEXT NOT NULL DEFAULT '',
        cost REAL,
        photos TEXT NOT NULL DEFAULT '[]',
        repair_request_id TEXT,
        created_at INTEGER NOT NULL, created_by INTEGER, created_by_name TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER, deleted_by_name TEXT
      );
      CREATE INDEX maint_item ON maint_records(item_id);

      CREATE TABLE record_audit (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL,
        at INTEGER NOT NULL,
        action TEXT NOT NULL,          -- created | changed | deleted | change_denied
        by_name TEXT NOT NULL,
        approved_by_name TEXT,
        details TEXT,
        note TEXT
      );
      CREATE INDEX audit_record ON record_audit(record_id);

      CREATE TABLE change_requests (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('edit','delete')),
        old TEXT NOT NULL, proposed TEXT,
        reason TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
        requested_by INTEGER, requested_by_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        decided_by_name TEXT, decided_at INTEGER, decision_note TEXT
      );
      CREATE INDEX cr_record ON change_requests(record_id);
      CREATE INDEX cr_status ON change_requests(status);

      CREATE TABLE repair_requests (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        problem TEXT NOT NULL,
        urgency TEXT NOT NULL CHECK (urgency IN ('can_wait','soon','down')),
        photo TEXT, thumb TEXT,
        meter REAL, meter_unit TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','declined')),
        requested_by INTEGER, requested_by_name TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        status_by_name TEXT, status_note TEXT, record_id TEXT
      );
      CREATE INDEX rr_item ON repair_requests(item_id);
      CREATE INDEX rr_status ON repair_requests(status);
      PRAGMA user_version = 3;
    `))();
    db.pragma('foreign_keys = ON');
    const bad = db.pragma('foreign_key_check');
    if (bad.length) throw new Error('Database upgrade problem: ' + JSON.stringify(bad));
  }
  if (db.pragma('user_version', { simple: true }) < 4) {
    // v2.3: material categories, quantity unit, and per-category extra fields (wire length, gauge, ...).
    const { seedCategories, OTHER_ID } = require('./catalog');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE categories (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '📦',
          sort INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0,
          fields TEXT NOT NULL DEFAULT '[]', created_at INTEGER,
          parent_id TEXT
        );
        ALTER TABLE items ADD COLUMN category_id TEXT;
        ALTER TABLE items ADD COLUMN unit TEXT NOT NULL DEFAULT 'each';
        ALTER TABLE items ADD COLUMN extra TEXT;
        CREATE INDEX items_category ON items(category_id);
      `);
      seedCategories(db, Date.now());
      db.prepare("UPDATE items SET category_id = ? WHERE type = 'material' AND category_id IS NULL").run(OTHER_ID);
      db.pragma('user_version = 4');
    })();
  }
  if (db.pragma('user_version', { simple: true }) < 5) {
    // v2.4: main/subcategory hierarchy (parent_id), merge aggregates→site-work, concrete→masonry, roads-bridges→asphalt.
    const { applyHierarchyV5 } = require('./catalog');
    db.transaction(() => {
      const cols = db.prepare("PRAGMA table_info(categories)").all().map(c => c.name);
      if (!cols.includes('parent_id')) {
        db.exec('ALTER TABLE categories ADD COLUMN parent_id TEXT');
      }
      applyHierarchyV5(db, Date.now());
      db.pragma('user_version = 5');
    })();
  }
  if (db.pragma('user_version', { simple: true }) < 6) {
    // v2.4.1: keep one combined trades parent (mep); clearer name; do not split Plumbing/HVAC/Electrical/LV into four mains.
    const { applyHierarchyV6 } = require('./catalog');
    db.transaction(() => {
      applyHierarchyV6(db, Date.now());
      db.pragma('user_version = 6');
    })();
  }
  return db;
}
module.exports = { openDb };
