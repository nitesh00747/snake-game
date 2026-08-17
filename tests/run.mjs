/**
 * run.mjs — headless verification of the step-1 plumbing.
 *
 *   node tests/run.mjs
 *
 * Covers the parts that are easy to get subtly wrong and hard to eyeball:
 * the accumulator's tick pacing under stalls and high refresh rates, camera
 * clamping and interpolation, font data integrity, and renderer scaling.
 */

import { mirrorSource, installDomShim, check, eq, near, section, report } from './harness.mjs';

const dom = installDomShim();
const mod = mirrorSource();

// ---------------------------------------------------------------------------
section('font');
// ---------------------------------------------------------------------------
{
  // Importing the module runs its glyph validation; a malformed row throws.
  const font = await import(mod('core/font.ts'));

  check('glyph table loads and validates', font.glyphCount() > 60);
  eq('measure("") is 0', font.measure(''), 0);
  eq('measure("A") is glyph width', font.measure('A'), 3);
  eq('measure("AB") includes 1px gap', font.measure('AB'), 7);
  eq('lowercase folds to uppercase glyph', font.glyphIndex('a'), font.glyphIndex('A'));
  eq('unknown char falls back to ?', font.glyphIndex('☃'), font.glyphIndex('?'));

  const atlas = font.getAtlas('#ffffff');
  eq('atlas is one row tall', atlas.height, font.GLYPH_H);
  eq('atlas caches per colour', font.getAtlas('#ffffff'), atlas);
  check('different colour builds a different atlas', font.getAtlas('#ff0000') !== atlas);
}

// ---------------------------------------------------------------------------
section('camera');
// ---------------------------------------------------------------------------
{
  const { Camera } = await import(mod('core/camera.ts'));
  const { SCREEN_W } = await import(mod('tuning.ts'));

  const cam = new Camera();
  cam.setBounds(0, 0, SCREEN_W * 4, 224);

  cam.snapTo(-50, -50);
  eq('clamps to left world edge', cam.x, 0);
  eq('clamps to top world edge', cam.y, 0);

  cam.scrollBy(10, 0);
  near('scrolls forward', cam.x, 10);

  cam.scrollBy(-100, 0);
  near('never backtracks', cam.x, 10);

  cam.snapTo(99999, 0);
  eq('clamps to right world edge', cam.x, SCREEN_W * 4 - SCREEN_W);

  const c2 = new Camera();
  c2.setBounds(0, 0, 10000, 10000);
  c2.snapTo(0, 0);
  c2.beginTick();
  c2.scrollBy(10, 0);
  eq('renderX at alpha 0 is previous position', c2.renderX(0), 0);
  eq('renderX at alpha 1 is current position', c2.renderX(1), 10);
  eq('renderX interpolates and stays integral', c2.renderX(0.5), 5);

  check('isVisible accepts an on-screen box', c2.isVisible(c2.x + 8, 8, 16, 16));
  check('isVisible rejects a far-off box', !c2.isVisible(c2.x + 5000, 8, 16, 16));
}

// ---------------------------------------------------------------------------
section('fixed-timestep loop');
// ---------------------------------------------------------------------------
{
  const { GameLoop } = await import(mod('core/loop.ts'));
  const { TICK_MS, MAX_FRAME_MS } = await import(mod('tuning.ts'));

  const alphas = [];
  const mk = () => {
    dom.resetRaf();
    let ticks = 0;
    let renders = 0;
    const tickCounts = [];
    const loop = new GameLoop(
      () => ticks++,
      (a) => {
        renders++;
        alphas.push(a);
        tickCounts.push(loop.stats.ticksLastFrame);
      },
    );
    return { loop, t: () => ticks, r: () => renders, counts: tickCounts };
  };

  // --- one second of 60Hz frames -> exactly 60 ticks ---
  {
    const { loop, t, r } = mk();
    loop.start();
    const t0 = performance.now();
    for (let i = 1; i <= 60; i++) dom.pump(t0 + i * (1000 / 60));
    loop.stop();
    eq('60 frames at 60Hz produce 60 ticks', t(), 60);
    eq('one render per frame', r(), 60);
  }

  // --- one second of 144Hz frames -> still exactly 60 ticks ---
  {
    const { loop, t, r, counts } = mk();
    loop.start();
    const t0 = performance.now();
    for (let i = 1; i <= 144; i++) dom.pump(t0 + i * (1000 / 144));
    loop.stop();
    eq('144 frames produce 60 ticks (logic is refresh-independent)', t(), 60);
    eq('but 144 renders', r(), 144);
    const idle = counts.filter((c) => c === 0).length;
    check('most frames interpolate without ticking', idle > 70, `${idle} idle frames of 144`);
    check('no frame ever runs more than one tick at 144Hz', counts.every((c) => c <= 1));
  }

  // --- 30Hz display -> two ticks per frame ---
  {
    const { loop, t } = mk();
    loop.start();
    const t0 = performance.now();
    for (let i = 1; i <= 30; i++) dom.pump(t0 + i * (1000 / 30));
    loop.stop();
    eq('30 frames at 30Hz still produce 60 ticks', t(), 60);
    eq('last frame ran 2 ticks', loop.stats.ticksLastFrame, 2);
  }

  // --- a long stall is clamped, not caught up ---
  {
    const { loop, t } = mk();
    loop.start();
    const t0 = performance.now();
    dom.pump(t0 + 16);
    dom.pump(t0 + 16 + 5000); // 5 second freeze
    loop.stop();
    const maxTicks = Math.ceil(MAX_FRAME_MS / TICK_MS);
    check(
      'a 5s stall cannot spiral (ticks clamped)',
      t() <= maxTicks + 1,
      `ran ${t()} ticks, cap ~${maxTicks}`,
    );
    check('dropped ticks are accounted for', loop.stats.droppedTicks > 250);
  }

  // --- alpha stays in range ---
  {
    check(
      'render alpha always within [0,1)',
      alphas.every((a) => a >= 0 && a < 1),
      `min ${Math.min(...alphas)} max ${Math.max(...alphas)}`,
    );
  }

  // --- pause and single-step ---
  {
    const { loop, t, r } = mk();
    loop.start();
    const t0 = performance.now();
    dom.pump(t0 + 16);
    const before = t();
    loop.paused = true;
    for (let i = 2; i <= 20; i++) dom.pump(t0 + i * 16);
    eq('paused: logic is frozen', t(), before);
    check('paused: rendering continues', r() > 1);

    loop.requestStep();
    dom.pump(t0 + 21 * 16);
    eq('single-step advances exactly one tick', t(), before + 1);
    dom.pump(t0 + 22 * 16);
    eq('step is not sticky', t(), before + 1);

    loop.paused = false;
    dom.pump(t0 + 23 * 16);
    check('unpausing resumes without a burst', loop.stats.ticksLastFrame <= 2);
    loop.stop();
  }

  // --- pre/post frame hooks ---
  {
    dom.resetRaf();
    let pre = 0;
    let post = 0;
    let order = '';
    const loop = new GameLoop(
      () => (order += 'U'),
      () => (order += 'R'),
      () => {
        pre++;
        order += 'P';
      },
      () => {
        post++;
        order += 'O';
      },
    );
    loop.start();
    const t0 = performance.now();
    dom.pump(t0 + 17);
    loop.paused = true;
    dom.pump(t0 + 34);
    loop.stop();
    eq('preFrame runs every frame', pre, 2);
    eq('postFrame runs every frame', post, 2);
    eq('order is pre -> update -> render -> post', order, 'PURO' + 'PRO');
  }
}

// ---------------------------------------------------------------------------
section('renderer');
// ---------------------------------------------------------------------------
{
  const { Renderer } = await import(mod('core/renderer.ts'));
  const { SCREEN_W, SCREEN_H, MAX_SCALE } = await import(mod('tuning.ts'));

  const canvas = dom.makeCanvas();
  globalThis.window.innerWidth = 1280;
  globalThis.window.innerHeight = 720;
  const r = new Renderer(canvas);

  eq('scale is an integer', r.scale, Math.floor(r.scale));
  eq('1280x720 gives 3x (720/224 = 3.2)', r.scale, 3);
  eq('backing store is scale * virtual width', canvas.width, SCREEN_W * 3);
  eq('backing store is scale * virtual height', canvas.height, SCREEN_H * 3);
  eq('framebuffer stays at native resolution', r.buffer.width, SCREEN_W);
  eq('framebuffer height stays native', r.buffer.height, SCREEN_H);

  globalThis.window.innerWidth = 200;
  globalThis.window.innerHeight = 150;
  r.resize();
  eq('never scales below 1x', r.scale, 1);

  globalThis.window.innerWidth = 99999;
  globalThis.window.innerHeight = 99999;
  r.resize();
  eq('scale is capped', r.scale, MAX_SCALE);

  globalThis.window.innerWidth = 1280;
  globalThis.window.innerHeight = 720;
  globalThis.window.devicePixelRatio = 2;
  r.resize();
  eq('hi-dpi keeps integer device-pixel scaling', r.scale, 6);
  eq('css size still fits the viewport', canvas.style.width, `${(SCREEN_W * 6) / 2}px`);
  globalThis.window.devicePixelRatio = 1;
  r.resize();

  eq('textWidth matches font metrics', r.textWidth('SCORE'), 5 * 4 - 1);

  const ctx = r.ctx;
  const before = ctx.calls.fillRect;
  r.fillRect(0, 0, 10, 10, '#fff');
  eq('fillRect reaches the framebuffer', ctx.calls.fillRect, before + 1);

  const dBefore = ctx.calls.drawImage;
  r.text('HI', 4, 4, '#fff');
  eq('text draws one blit per glyph', ctx.calls.drawImage, dBefore + 2);

  const sBefore = ctx.calls.fillRect;
  r.strokeRect(0, 0, 8, 8, '#fff');
  eq('strokeRect is 4 spans', ctx.calls.fillRect, sBefore + 4);
}

// ---------------------------------------------------------------------------
section('keyboard');
// ---------------------------------------------------------------------------
{
  const kb = await import(mod('core/keyboard.ts'));
  kb.installKeyboard(globalThis.window);

  const key = (type, code) =>
    globalThis.window.dispatch(type, { type, code, repeat: false, preventDefault() {} });

  key('keydown', 'KeyZ');
  check('isDown reflects physical state', kb.isDown('KeyZ'));
  check('tick channel sees the press', kb.wasPressed('KeyZ'));
  check('frame channel sees the press', kb.framePressed('KeyZ'));

  kb.endKeyboardTick();
  check('tick edge is consumed', !kb.wasPressed('KeyZ'));
  check('frame edge survives tick consumption', kb.framePressed('KeyZ'));
  check('key is still held', kb.isDown('KeyZ'));

  kb.endKeyboardFrame();
  check('frame edge is consumed', !kb.framePressed('KeyZ'));

  key('keyup', 'KeyZ');
  check('release is reported', kb.wasReleased('KeyZ'));
  check('no longer held', !kb.isDown('KeyZ'));
  kb.endKeyboardTick();

  // Tap and release inside one frame must not be swallowed.
  key('keydown', 'KeyX');
  key('keyup', 'KeyX');
  check('same-frame tap is not lost', kb.wasPressed('KeyX') && kb.wasReleased('KeyX'));
  kb.endKeyboardTick();
  kb.endKeyboardFrame();

  key('keydown', 'KeyC');
  globalThis.window.dispatch('blur', {});
  check('blur clears stuck keys', !kb.isDown('KeyC'));
  eq('nothing left held after blur', kb.heldCount(), 0);
}

// ---------------------------------------------------------------------------
section('boot smoke test');
// ---------------------------------------------------------------------------
{
  // Boots the real Game against the DOM shim and runs a couple of seconds of
  // frames. This is what catches a crash inside a draw path — the thing that
  // would otherwise only show up as a black screen in the browser.
  dom.resetRaf();
  const { Game } = await import(mod('game.ts'));
  const { debug } = await import(mod('core/debug.ts'));

  const canvas = dom.makeCanvas();
  const ctx = canvas.getContext('2d');
  let crash = null;

  try {
    const game = new Game(canvas);
    game.start();
    const t0 = performance.now();

    const key = (code) =>
      globalThis.window.dispatch('keydown', { code, repeat: false, preventDefault() {} });

    for (let i = 1; i <= 120; i++) {
      if (i === 10) key('F1'); // overlay on
      if (i === 20) key('F2'); // full detail (with frame graph)
      if (i === 30) key('Backslash'); // hitbox flag
      if (i === 40) key('Enter'); // pause
      if (i === 50) key('Period'); // single step while paused
      if (i === 60) key('Enter'); // unpause
      if (i === 70) key('Space'); // toggle scene autoscroll
      dom.pump(t0 + i * (1000 / 60));
    }
  } catch (e) {
    crash = e;
  }

  check('game boots and survives 120 frames', crash === null, crash && crash.stack);
  check('frames reached the display canvas', ctx.calls.drawImage > 100);
  check('overlay hotkeys took effect', debug.enabled && debug.detail === 'full');
  check('hitbox flag toggled', debug.showHitboxes === true);
}

report();
