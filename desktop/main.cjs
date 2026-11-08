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
const STARTUP_TIMEOUT_MS = 15000;
let startupTimer = null;
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
  ready = false;
  engine = spawn(path.resolve(binary), ['--control'], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  const processRef = engine;
  startupTimer = setTimeout(() => {
    if (engine !== processRef || ready) return;
    notify({ type: 'offline', reason: 'Engine startup timeout' });
    processRef.kill();
  }, STARTUP_TIMEOUT_MS);
  createInterface({ input: engine.stdout }).on('line', (line) => {
    if (line === 'READY WMIX_OBS_CONTROL_V1') {
      clearTimeout(startupTimer);
      startupTimer = null;
      ready = true;
      notify({ type: 'ready' });
      pump();
    } else if (/^(STATUS |SOURCE_STATUS |PROGRAM_SOURCE_STATUS |PREVIEW_SOURCE_STATUS |VIDEO_STATUS |TALLY_STATUS |OK CUT |OK SOURCE |ERROR |BYE)/.test(line)) {
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
    clearTimeout(startupTimer);
    startupTimer = null;
    ready = false;
    failAll(err.message);
    notify({ type: 'offline', reason: err.message });
    if (engine === processRef) engine = null;
  });
  engine.on('exit', (code) => {
    clearTimeout(startupTimer);
    startupTimer = null;
    ready = false;
    failAll('Engine exited: ' + code);
    notify({ type: 'offline', reason: 'Engine exited: ' + code });
    if (engine === processRef) engine = null;
  });
}
function command(name) {
  if (!['STATUS', 'CUT', 'ADD_TEST_SOURCE', 'SOURCE_STATUS', 'PROGRAM_SOURCE_STATUS', 'PREVIEW_SOURCE_STATUS', 'VIDEO_STATUS', 'TALLY_STATUS'].includes(name)) return Promise.reject(new Error('Unsupported command'));
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
  // A packaged app must surface renderer failures instead of silently showing
  // a blank window. Keep the diagnostic local; no telemetry is transmitted.
  window.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    console.error('[WMix Desktop] Renderer load failed:', code, description, validatedURL);
    if (process.env.WMIX_SMOKE_TEST === '1') {
      app.exit(5);
      return;
    }
    const { dialog } = require('electron');
    dialog.showErrorBox('WMix — Falha ao abrir a interface',
      'Não foi possível carregar a interface local do WMix.\\n' +
      'Verifique se o pacote ZIP foi extraído por completo.\\n\\n' +
      'Código: ' + code + ' — ' + description);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[WMix Desktop] Renderer process exited:', details.reason);
    if (process.env.WMIX_SMOKE_TEST === '1') app.exit(6);
  });
  // Vite bundles can load index.html successfully while a JS chunk fails.
  // Capture those failures in CI instead of accepting an empty interface.
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error('[WMix Renderer]', message, sourceId, line);
  });
  // CI-only interactive renderer smoke check. It checks that React actually
  // mounted, rather than merely verifying that the HTML/JS files exist.
  if (process.env.WMIX_SMOKE_TEST === '1') {
    const timeout = setTimeout(() => {
      console.error('[WMix Smoke] Renderer did not mount within 30 seconds');
      app.exit(2);
    }, 30000);
    window.webContents.once('did-finish-load', async () => {
      try {
        const mounted = await window.webContents.executeJavaScript(
          "new Promise(resolve => { const deadline = Date.now() + 15000; const check = () => { const ready = document.documentElement.dataset.wmixStudioReady === 'true'; const error = document.querySelector('[role=alert]'); const monitors = document.querySelectorAll('canvas'); if (error) resolve(false); else if (ready && monitors.length >= 2) resolve(true); else if (Date.now() > deadline) resolve(false); else setTimeout(check, 200); }; check(); })"
        );
        clearTimeout(timeout);
        console.log('[WMix Smoke] React mounted:', mounted);
        if (mounted && process.env.WMIX_SMOKE_SCREENSHOT) {
          await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
          const fs = require('node:fs');
          const screenshot = await window.webContents.capturePage();
          fs.writeFileSync(process.env.WMIX_SMOKE_SCREENSHOT, screenshot.toPNG());
          console.log('[WMix Smoke] Screenshot saved:', process.env.WMIX_SMOKE_SCREENSHOT);
        }
        app.exit(mounted ? 0 : 3);
      } catch (error) {
        clearTimeout(timeout);
        console.error('[WMix Smoke] Renderer execution failed:', error);
        app.exit(4);
      }
    });
  }
  const url = process.env.WMIX_DEV_URL;
  if (url) {
    const parsed = new URL(url);
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.protocol !== 'http:') {
      throw new Error('WMIX_DEV_URL must be local HTTP');
    }
    window.loadURL(url);
  } else {
    // Packaged desktop builds load the offline renderer from disk, without
    // depending on the Lovable preview or a running development server.
    const fs = require('node:fs');
    const renderer = path.join(__dirname, 'dist-renderer', 'index.html');
    if (fs.existsSync(renderer)) {
      window.loadFile(renderer);
    } else {
      window.loadURL('data:text/html,<h2>WMix Desktop</h2><p>Renderer missing. Run the desktop renderer build.</p>');
    }
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
