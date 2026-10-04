'use strict';
/*
 * Windows launcher for Job Site Inventory (used by "Start Inventory.bat").
 * - keeps the data in %LOCALAPPDATA%\JobsiteInventory\data (outside the app folder, so replacing the app folder never deletes data)
 * - uses port 3000, or the next free one
 * - if the inventory is already running, just opens it in the browser
 * - opens the browser and shows the address phones on the same Wi-Fi can use
 * Options: --startup (started with Windows: don't open the browser)
 */
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

const APP_DIR = path.join(__dirname, '..');
const STARTUP = process.argv.includes('--startup');
const DATA_DIR = process.env.INVENTORY_DATA_DIR
  || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'JobsiteInventory', 'data') : path.join(APP_DIR, '..', 'data'));
const FIRST_PORT = Number(process.env.INVENTORY_PORT) || 3000;
const LAST_PORT = FIRST_PORT + 20;

function openBrowser(url) {
  if (STARTUP || process.env.INVENTORY_NO_BROWSER === '1') return;
  // Detached + unref: never keeps this process waiting for the browser.
  const run = (cmd, args, verbatim) => {
    try {
      const c = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: !!verbatim });
      c.on('error', () => {}); c.unref();
    } catch (e) { /* no browser: the address is shown in the window */ }
  };
  if (process.platform === 'win32') run('cmd.exe', ['/d', '/c', `start "" "${url}"`], true);
  else if (process.platform === 'darwin') run('open', [url]);
  else run('xdg-open', [url]);
}

// Is a Job Site Inventory already answering on this port?
function isInventory(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/state', timeout: 1500 }, res => {
      let body = '';
      res.on('data', d => { body += d; if (body.length > 1e5) req.destroy(); });
      res.on('end', () => { try { resolve('setupNeeded' in JSON.parse(body)); } catch (e) { resolve(false); } });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}
function isFree(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '0.0.0.0', () => srv.close(() => resolve(true)));
  });
}

// IPv4 addresses phones on the same network can use. Wi-Fi first, virtual adapters (WSL, Hyper-V, VPNs...) left out.
function lanAddresses() {
  const skip = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|Loopback|Bluetooth|docker|Tailscale|ZeroTier|Npcap|TAP|VPN/i;
  const priv = ip => /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      const score = (/wi-?fi|wireless|wlan/i.test(name) ? 0 : /ethernet|^eth|^en/i.test(name) ? 1 : 2) + (priv(a.address) ? 0 : 5);
      list.push({ name, address: a.address, score });
    }
  }
  return list.sort((x, y) => x.score - y.score).map(x => x.address);
}

function banner(port, ips) {
  const line = '  ' + '='.repeat(66);
  const out = ['', line,
    '', '      INVENTORY IS RUNNING.     LEAVE THIS WINDOW OPEN.', '',
    line, '',
    `      On this laptop:   http://localhost:${port}`, ''];
  if (ips.length) {
    out.push('      Phones on the same Wi-Fi can open:', '');
    ips.slice(0, 3).forEach(ip => out.push(`            http://${ip}:${port}`));
  } else {
    out.push('      (Not connected to Wi-Fi yet. The phone address will show here', '       when the laptop connects.)');
  }
  out.push('', '      To STOP the inventory: close this window.',
    `      Your data is kept in: ${DATA_DIR}`, '', line, '');
  console.log(out.join('\n'));
}

async function main() {
  process.title = 'Jobsite Inventory';
  // Already running (for example, double-clicked twice)? Just open it.
  for (let p = FIRST_PORT; p <= LAST_PORT; p++) {
    if (await isInventory(p)) {
      console.log(`\n  The inventory is already running: http://localhost:${p}\n  Opening it in your browser. You can close this window.\n`);
      openBrowser(`http://localhost:${p}`);
      setTimeout(() => process.exit(0), 6000);
      return;
    }
  }
  let port = 0;
  for (let p = FIRST_PORT; p <= LAST_PORT; p++) if (await isFree(p)) { port = p; break; }
  if (!port) { console.error(`\n  Could not find a free port between ${FIRST_PORT} and ${LAST_PORT}. Restart the laptop and try again.\n`); process.exit(1); }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  Object.assign(process.env, {
    DATA_DIR, PORT: String(port), HOST: '0.0.0.0',
    COOKIE_SECURE: 'false',   // plain http on the local network
    TRUST_PROXY: 'false',     // no proxy in front: don't believe X-Forwarded-* headers from the network
    SETUP_LOCAL_ONLY: process.env.SETUP_LOCAL_ONLY ?? '1'
  });
  const app = require(path.join(APP_DIR, 'server', 'server.js'));
  const server = app.listen(port, '0.0.0.0', () => {
    let ips = lanAddresses();
    banner(port, ips);
    openBrowser(`http://localhost:${port}`);
    // Wi-Fi can connect later (e.g. right after Windows starts): show the new address when it changes.
    setInterval(() => {
      const now = lanAddresses();
      if (now.join() !== ips.join()) { ips = now; banner(port, ips); }
    }, 30000).unref();
  });
  server.on('error', err => {
    console.error(`\n  The inventory could not start: ${err.message}\n`);
    process.exit(1);
  });
}
main().catch(err => { console.error('\n  The inventory could not start:', err && err.message ? err.message : err, '\n'); process.exit(1); });
