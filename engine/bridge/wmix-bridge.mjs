#!/usr/bin/env node
// Local-only WMix -> libobs bridge. No network listener, no browser exposure.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const binary = process.argv[2];
if (!binary) {
  console.error('Usage: node engine/bridge/wmix-bridge.mjs <path-to-wmix-obs-smoke>');
  process.exit(2);
}
const child = spawn(resolve(binary), ['--control'], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const output = createInterface({ input: child.stdout });
const input = createInterface({ input: process.stdin });
let ready = false;
let pending = null;
let closed = false;
const queue = [];

function emit(message) { process.stdout.write(JSON.stringify(message) + '\n'); }
function pump() {
  if (!ready || pending || closed || queue.length === 0) return;
  pending = queue.shift();
  child.stdin.write(pending.command + '\n');
}
output.on('line', (line) => {
  if (line === 'READY WMIX_OBS_CONTROL_V1') {
    ready = true;
    emit({ type: 'ready', protocol: 'WMIX_OBS_CONTROL_V1' });
    pump();
  } else if (/^(STATUS |OK CUT |ERROR |BYE)/.test(line)) {
    if (pending) {
      emit({ type: 'response', id: pending.id, message: line, ok: !line.startsWith('ERROR') });
      pending = null;
      pump();
    } else {
      emit({ type: 'event', message: line });
    }
  } else {
    process.stderr.write('[libobs] ' + line + '\n');
  }
});
input.on('line', (line) => {
  let request;
  try { request = JSON.parse(line); }
  catch { emit({ type: 'error', message: 'INVALID_JSON' }); return; }
  const id = request?.id;
  if (!(typeof id === 'string' || Number.isSafeInteger(id)) ||
      !['STATUS', 'CUT', 'QUIT'].includes(request?.command)) {
    emit({ type: 'error', id, message: 'INVALID_REQUEST' });
    return;
  }
  if (closed || queue.length >= 100) {
    emit({ type: 'error', id, message: closed ? 'ENGINE_CLOSED' : 'QUEUE_FULL' });
    return;
  }
  queue.push({ id, command: request.command });
  pump();
});
child.on('error', (error) => {
  closed = true;
  emit({ type: 'error', message: 'ENGINE_SPAWN_FAILED', detail: error.message });
});
child.on('exit', (code, signal) => {
  closed = true;
  if (pending) emit({ type: 'error', id: pending.id, message: 'ENGINE_EXITED' });
  for (const item of queue) emit({ type: 'error', id: item.id, message: 'ENGINE_EXITED' });
  emit({ type: 'exit', code, signal });
  process.exitCode = code || (signal ? 1 : 0);
});
input.on('close', () => {
  if (!closed) child.stdin.end();
});
