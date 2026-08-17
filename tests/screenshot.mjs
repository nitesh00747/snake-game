/**
 * screenshot.mjs — render real frames headlessly and write PNGs.
 *
 *   node tests/screenshot.mjs
 *
 * Boots the actual Game against a software canvas and captures the display
 * surface after a given number of 60Hz ticks. Nothing here re-implements game
 * drawing; it only supplies the pixel buffer the renderer draws into.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mirrorSource } from './harness.mjs';
import { SoftCanvas, encodePNG } from './softcanvas.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'screenshots');
mkdirSync(OUT, { recursive: true });

// --- DOM shim backed by real pixel buffers ---------------------------------

const listeners = new Map();
const rafQueue = [];

globalThis.document = {
  hidden: false,
  createElement: (tag) => (tag === 'canvas' ? new SoftCanvas() : { style: {} }),
  addEventListener: (t, fn) => (listeners.get(t) ?? listeners.set(t, []).get(t)).push(fn),
  getElementById: () => new SoftCanvas(),
};
globalThis.window = {
  innerWidth: 768,
  innerHeight: 672,
  devicePixelRatio: 1,
  addEventListener: (t, fn) => {
    if (!listeners.has(t)) listeners.set(t, []);
    listeners.get(t).push(fn);
  },
};
globalThis.requestAnimationFrame = (fn) => rafQueue.push(fn);
globalThis.cancelAnimationFrame = () => {};
globalThis.HTMLCanvasElement = SoftCanvas;

const dispatch = (type, ev) => (listeners.get(type) ?? []).forEach((fn) => fn(ev));
const pump = (now) => {
  const fn = rafQueue.pop();
  rafQueue.length = 0;
  if (fn) fn(now);
};
const key = (code) => dispatch('keydown', { code, repeat: false, preventDefault() {} });

// --- run --------------------------------------------------------------------

const mod = mirrorSource();
const { Game } = await import(mod('game.ts'));

const canvas = new SoftCanvas();
const game = new Game(canvas);
game.start();

const t0 = performance.now();
let frame = 0;
const advance = (n) => {
  for (let i = 0; i < n; i++) pump(t0 + ++frame * (1000 / 60));
};

const shots = [];
const capture = (name) => {
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, encodePNG(canvas));
  shots.push(`${name}.png`);
};

advance(90);
capture('01-scene');

key('F1');
advance(2);
capture('02-debug-compact');

key('F2');
advance(120);
capture('03-debug-full');

key('Backslash');
key('Enter'); // pause
advance(2);
capture('04-paused');

console.log(`wrote ${shots.length} screenshots to screenshots/`);
for (const s of shots) console.log(`  ${s}`);
console.log(`display surface: ${canvas.width}x${canvas.height}`);
