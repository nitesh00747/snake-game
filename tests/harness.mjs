/**
 * harness.mjs — headless test harness.
 *
 * Node can execute TypeScript directly (type stripping), but it needs explicit
 * file extensions on relative imports, whereas Vite does not. So we mirror src/
 * into a temp directory with `./foo` rewritten to `./foo.ts`, then import the
 * mirror. This lets the real modules — not copies of them — be exercised
 * headlessly, with a minimal DOM shim standing in for the browser.
 */

import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Copy src/ to a temp dir, adding .ts to extensionless relative imports. */
export function mirrorSource() {
  const root = mkdtempSync(join(tmpdir(), 'falcon-'));
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file);
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    const code = readFileSync(file, 'utf8').replace(
      /(from\s+['"])(\.\.?\/[^'"]*?)(['"])/g,
      (m, a, spec, b) => (/\.[a-z]+$/.test(spec) ? m : `${a}${spec}.ts${b}`),
    );
    writeFileSync(dest, code);
  }
  return (rel) => pathToFileURL(join(root, rel)).href;
}

// --- assertions -------------------------------------------------------------

let passed = 0;
const failures = [];

export function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  } else {
    failures.push(name);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

export function eq(name, actual, expected) {
  check(name, Object.is(actual, expected), `got ${actual}, expected ${expected}`);
}

export function near(name, actual, expected, tol = 1e-6) {
  check(name, Math.abs(actual - expected) <= tol, `got ${actual}, expected ~${expected}`);
}

export function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

export function report() {
  console.log(
    `\n${failures.length === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failures.length} failed\x1b[0m`,
  );
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

// --- minimal DOM shim -------------------------------------------------------

/**
 * Just enough of the browser for the modules under test. The canvas context is
 * a recording stub: draw calls are counted, not rasterised.
 */
export function installDomShim() {
  const listeners = new Map();

  const makeCtx = () => {
    const calls = { fillRect: 0, drawImage: 0, clearRect: 0 };
    return {
      calls,
      fillStyle: '#000',
      globalAlpha: 1,
      imageSmoothingEnabled: true,
      fillRect: () => calls.fillRect++,
      drawImage: () => calls.drawImage++,
      clearRect: () => calls.clearRect++,
      save() {},
      restore() {},
    };
  };

  const makeCanvas = () => {
    const ctx = makeCtx();
    return {
      width: 0,
      height: 0,
      style: {},
      getContext: () => ctx,
      addEventListener: () => {},
    };
  };

  const rafQueue = [];

  globalThis.document = {
    hidden: false,
    createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {} }),
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    getElementById: () => makeCanvas(),
  };

  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatch: (type, ev) => (listeners.get(type) ?? []).forEach((fn) => fn(ev)),
  };

  globalThis.requestAnimationFrame = (fn) => {
    rafQueue.push(fn);
    return rafQueue.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.HTMLCanvasElement = class {};

  return {
    makeCanvas,
    /** Drop any pending callbacks — call between tests that own their own loop. */
    resetRaf() {
      rafQueue.length = 0;
    },
    /**
     * Run one frame with a controlled timestamp.
     *
     * Only the most recently registered callback belongs to the live loop;
     * anything older is a stale re-queue from a stopped loop (the shim's
     * cancelAnimationFrame is a no-op). Running a stale callback would feed a
     * dead loop timestamps from the past, so we take the newest and discard
     * the rest.
     */
    pump(now) {
      const fn = rafQueue.pop();
      rafQueue.length = 0;
      if (fn) fn(now);
    },
    dispatch: (type, ev) => (listeners.get(type) ?? []).forEach((fn) => fn(ev)),
  };
}
