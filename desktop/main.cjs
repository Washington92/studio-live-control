const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');

let engine = null;
let ready = false;
let pending = null;
let nextId = 1;
const queue = [];
let window = null;
const COMMAND_TIMEOUT_MS = 5000;
function settle(request, error, value) {
  if (!request) return;
  clearTimeout(request.timer);
  if (error) request.reject(error);
  else request.resolve(value);
}

function notify(event) {
  if (window && !window.isDestroyed()) window.webContents.send('wmix:engine-event', event);
}
function pump() {
  if (!ready || pending || !queue.length || !engine) return;
  pending = queue.shift();
  const request = pending;
  request.timer = setTimeout(() => {
    if (pending !== request) return;
    pending = null;
    settle(request, new Error('Engine command timeout'));
    // A timed-out command may still return later; restart to avoid mismatched replies.
    ready = false;
    notify({ type: 'offline', reason: 'Engine command timeout' });
    engine?.kill();
  }, COMMAND_TIMEOUT_MS);
  engine.stdin.write(request.command + '\n');
}
function failAll(reason) {
  if (pending) settle(pending, new Error(reason));
  pending = null;
  while (queue.length) settle(queue.shift(), new Error(reason));
}
function startEngine() {
  const binary = process.env.WMIX_ENGINE_BINARY;
  if (!binary) {
    notify({ type: 'offline', reason: 'WMIX_ENGINE_BINARY not configured' });
    return;
  }
  if (engine) return;
  engine = spawn(path.resolve(binary), ['--control'], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  createInterface({ input: engine.stdout }).on('line', (line) => {
    if (line === 'READY WMIX_OBS_CONTROL_V1') {
      ready = true;
      notify({ type: 'ready' });
      pump();
    } else if (/^(STATUS |OK CUT |ERROR |BYE)/.test(line)) {
      if (pending) {
        const request = pending;
        pending = null;
        if (line.startsWith('ERROR')) settle(request, new Error(line));
        else settle(request, null, line);
        pump();
      }
    }
  });
  createInterface({ input: engine.stderr }).on('line', line => console.error('[WMix Engine]', line));
  engine.on('error', err => {
    ready = false;
    failAll(err.message);
    notify({ type: 'offline', reason: err.message });
  });
  engine.on('exit', (code) => {
    ready = false;
    failAll('Engine exited: ' + code);
    notify({ type: 'offline', reason: 'Engine exited: ' + code });
    engine = null;
  });
}
function command(name) {
  if (!['STATUS', 'CUT'].includes(name)) return Promise.reject(new Error('Unsupported command'));
  if (!engine || !ready) return Promise.reject(new Error('Engine offline'));
  if (queue.length >= 50) return Promise.reject(new Error('Command queue full'));
  return new Promise((resolve, reject) => {
    const request = { id: nextId++, command: name, resolve, reject };
    queue.push(request);
    pump();
  });
}
app.whenReady().then(() => {
  ipcMain.handle('wmix:engine-command', (_event, name) => command(name));
  ipcMain.handle('wmix:engine-status', () => ({ ready }));
  ipcMain.handle('wmix:engine-restart', () => {
    if (engine) return { restarted: false, reason: 'Engine process still running' };
    if (!process.env.WMIX_ENGINE_BINARY) return { restarted: false, reason: 'WMIX_ENGINE_BINARY not configured' };
    startEngine();
    return { restarted: true };
  });
  window = new BrowserWindow({
    width: 1440, height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  const url = process.env.WMIX_DEV_URL;
  if (url) {
    const parsed = new URL(url);
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.protocol !== 'http:') {
      throw new Error('WMIX_DEV_URL must be local HTTP');
    }
    window.loadURL(url);
  } else {
    window.loadURL('data:text/html,<h2>WMix Desktop</h2><p>Set WMIX_DEV_URL to your local Vite server.</p>');
  }
  startEngine();
});
app.on('before-quit', () => {
  if (engine) {
    engine.stdin.write('QUIT\n');
    engine.stdin.end();
  }
});
app.on('window-all-closed', () => app.quit());
