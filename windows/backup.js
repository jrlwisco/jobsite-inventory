'use strict';
/*
 * "Backup Inventory.bat": makes a safe copy of the inventory data (works while it is running)
 * into Documents\Inventory Backups\Inventory Backup YYYY-MM-DD HHMM.zip
 * The zip contains a "data" folder: database, photos and notification keys.
 */
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFileSync, spawn } = require('node:child_process');
const zlib = require('node:zlib');
const Database = require('better-sqlite3');

const APP_DIR = path.join(__dirname, '..');
const DATA_DIR = process.env.INVENTORY_DATA_DIR
  || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'JobsiteInventory', 'data') : path.join(APP_DIR, '..', 'data'));

function documentsFolder() {
  if (process.env.INVENTORY_BACKUP_DIR) return null;
  if (process.platform === 'win32') {
    try {
      const d = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "[Environment]::GetFolderPath('MyDocuments')"], { encoding: 'utf8' }).trim();
      if (d) return d;
    } catch (e) { /* fall back below */ }
  }
  return path.join(os.homedir(), 'Documents');
}

// Small zip writer (deflate, no extra programs needed). Writes file by file, so memory stays low.
function writeZip(zipPath, rootDir, topName) {
  const files = [];
  (function walk(rel) {
    const abs = path.join(rootDir, rel);
    if (fs.statSync(abs).isDirectory()) {
      files.push({ name: rel.split(path.sep).join('/') + '/', abs: null });
      for (const n of fs.readdirSync(abs).sort()) walk(path.join(rel, n));
    } else files.push({ name: rel.split(path.sep).join('/'), abs });
  })(topName);
  const fd = fs.openSync(zipPath + '.part', 'w');
  let offset = 0;
  const central = [];
  const put = buf => { fs.writeSync(fd, buf); offset += buf.length; };
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  try {
    for (const f of files) {
      const name = Buffer.from(f.name, 'utf8');
      const raw = f.abs ? fs.readFileSync(f.abs) : Buffer.alloc(0);
      const crc = zlib.crc32(raw);
      let data = f.abs ? zlib.deflateRawSync(raw, { level: 6 }) : raw, method = f.abs ? 8 : 0;
      if (data.length >= raw.length) { data = raw; method = 0; }
      if (offset + data.length > 0xFFFFFFF0) throw new Error('The backup is too big for one zip file (over 4 GB).');
      const h = Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8);
      h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14);
      h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10);
      c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20);
      c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(f.abs ? 0 : 0x10, 38); c.writeUInt32LE(offset, 42);
      central.push(Buffer.concat([c, name]));
      put(h); put(name); put(data);
    }
    const cd = Buffer.concat(central), e = Buffer.alloc(22);
    e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10);
    e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16);
    put(cd); put(e);
  } finally { fs.closeSync(fd); }
  fs.renameSync(zipPath + '.part', zipPath);
}

async function main() {
  const dbFile = path.join(DATA_DIR, 'inventory.db');
  if (!fs.existsSync(dbFile)) {
    console.log(`\n  No inventory data found yet in ${DATA_DIR}.\n  Start the inventory at least once first.\n`);
    process.exit(1);
  }
  const outDir = process.env.INVENTORY_BACKUP_DIR || path.join(documentsFolder(), 'Inventory Backups');
  fs.mkdirSync(outDir, { recursive: true });
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}${p2(d.getMinutes())}`;
  let zip = path.join(outDir, `Inventory Backup ${stamp}.zip`);
  for (let n = 2; fs.existsSync(zip); n++) zip = path.join(outDir, `Inventory Backup ${stamp} (${n}).zip`);

  console.log('\n  Making a backup of the inventory. Please wait...\n');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-backup-'));
  const stageData = path.join(stage, 'data');
  fs.mkdirSync(stageData);
  try {
    // SQLite's own backup: a consistent copy even while people are using the app.
    const db = new Database(dbFile, { fileMustExist: true });
    await db.backup(path.join(stageData, 'inventory.db'));
    db.close();
    const photos = path.join(DATA_DIR, 'photos');
    if (fs.existsSync(photos)) fs.cpSync(photos, path.join(stageData, 'photos'), { recursive: true });
    const vapid = path.join(DATA_DIR, 'vapid.json');
    if (fs.existsSync(vapid)) fs.copyFileSync(vapid, path.join(stageData, 'vapid.json'));
    writeZip(zip, stage, 'data');
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
  const mb = (fs.statSync(zip).size / 1048576).toFixed(1);
  console.log(`  Done! Backup saved (${mb} MB):\n\n    ${zip}\n`);
  console.log('  Tip: copy the "Inventory Backups" folder to a USB stick or cloud drive now and then.\n');
  if (process.platform === 'win32' && process.env.INVENTORY_NO_BROWSER !== '1') {
    try { // show the new zip in File Explorer (detached, so this window never waits for it)
      const c = spawn('explorer.exe', [`/select,"${zip}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
      c.on('error', () => {}); c.unref();
    } catch (e) { /* not important */ }
  }
}
main().catch(err => { console.error('\n  Backup failed:', err && err.message ? err.message : err, '\n'); process.exit(1); });
