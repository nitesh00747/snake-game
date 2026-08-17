/**
 * keyboard.ts — raw keyboard state with two independent edge channels.
 *
 * Deliberately dumb: it knows about physical keys, not about actions. The Input
 * system (step 2) maps these onto per-player bindings and folds in gamepad
 * state. Debug/system shortcuts read from here directly.
 *
 * Why two channels: game logic consumes edges once per 60Hz *tick*, while
 * system hotkeys (pause, F1) are polled once per rendered *frame* — and those
 * two rates are not the same. On a 144Hz display several frames can pass with
 * no tick, and while paused no ticks run at all. Separate press buffers mean
 * one channel consuming an edge never hides it from the other, and no edge is
 * ever double-counted.
 *
 * Edges are recorded from the events themselves rather than diffed from a
 * state snapshot, so a press-and-release inside a single frame is never lost.
 */

const downNow = new Set<string>();

const pressTick = new Set<string>();
const releaseTick = new Set<string>();
const pressFrame = new Set<string>();
const releaseFrame = new Set<string>();

/** Keys we swallow so the browser doesn't scroll, search, or open help. */
const SWALLOW = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Enter',
  'F1',
  'F2',
  'Tab',
  'Backslash',
  'Slash',
  "Quote",
]);

let installed = false;

export function installKeyboard(target: EventTarget = window): void {
  if (installed) return;
  installed = true;

  target.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    if (SWALLOW.has(ev.code)) ev.preventDefault();
    if (ev.repeat) return;
    downNow.add(ev.code);
    pressTick.add(ev.code);
    pressFrame.add(ev.code);
  });

  target.addEventListener('keyup', (e) => {
    const ev = e as KeyboardEvent;
    if (SWALLOW.has(ev.code)) ev.preventDefault();
    downNow.delete(ev.code);
    releaseTick.add(ev.code);
    releaseFrame.add(ev.code);
  });

  // Losing focus mid-hold would otherwise leave keys stuck down forever.
  window.addEventListener('blur', () => {
    for (const code of downNow) {
      releaseTick.add(code);
      releaseFrame.add(code);
    }
    downNow.clear();
  });
}

// --- tick channel (game logic) ---------------------------------------------

export function isDown(code: string): boolean {
  return downNow.has(code);
}

export function wasPressed(code: string): boolean {
  return pressTick.has(code);
}

export function wasReleased(code: string): boolean {
  return releaseTick.has(code);
}

/** Call at the end of every logic tick. */
export function endKeyboardTick(): void {
  pressTick.clear();
  releaseTick.clear();
}

// --- frame channel (system hotkeys) ----------------------------------------

export function framePressed(code: string): boolean {
  return pressFrame.has(code);
}

/** Call at the end of every rendered frame. */
export function endKeyboardFrame(): void {
  pressFrame.clear();
  releaseFrame.clear();
}

export function heldCount(): number {
  return downNow.size;
}
