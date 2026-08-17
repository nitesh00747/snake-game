/**
 * loop.ts — fixed-timestep game loop with an accumulator.
 *
 * Logic ticks at exactly 60Hz no matter the display refresh rate; rendering
 * happens once per animation frame with an `alpha` in [0,1) describing how far
 * we are between the last two logic ticks, so 144Hz monitors get smooth motion
 * out of 60Hz simulation.
 *
 * Guards:
 *  - Frame deltas are clamped to MAX_FRAME_MS so a stalled tab cannot queue up
 *    hundreds of catch-up ticks (the "spiral of death").
 *  - The accumulator is flushed when the tab regains visibility.
 */

import { MAX_FRAME_MS, TICK_MS } from '../tuning';

export interface LoopStats {
  /** Smoothed frames-per-second of the render loop. */
  fps: number;
  /** Smoothed wall-clock milliseconds spent inside update+render. */
  frameMs: number;
  /** Milliseconds spent in update() during the last frame. */
  updateMs: number;
  /** Milliseconds spent in render() during the last frame. */
  renderMs: number;
  /** Logic ticks executed during the last frame (0, 1, or several). */
  ticksLastFrame: number;
  /** Total logic ticks since boot — the canonical game clock. */
  totalTicks: number;
  /** Rendered frames since boot. */
  totalFrames: number;
  /** Ticks discarded because the frame delta exceeded the clamp. */
  droppedTicks: number;
}

export type UpdateFn = () => void;
export type RenderFn = (alpha: number) => void;
/** Runs once per animation frame, before any ticks — even while paused. */
export type FrameHook = () => void;

export class GameLoop {
  readonly stats: LoopStats = {
    fps: 0,
    frameMs: 0,
    updateMs: 0,
    renderMs: 0,
    ticksLastFrame: 0,
    totalTicks: 0,
    totalFrames: 0,
    droppedTicks: 0,
  };

  /** Frame-time history in ms, newest last. Used by the debug graph. */
  readonly frameHistory: number[] = [];
  private static readonly HISTORY_LEN = 96;

  private readonly update: UpdateFn;
  private readonly render: RenderFn;
  private readonly preFrame: FrameHook;
  private readonly postFrame: FrameHook;

  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  /** Set true to advance exactly one tick while paused (debug stepping). */
  private stepRequested = false;
  paused = false;

  constructor(
    update: UpdateFn,
    render: RenderFn,
    preFrame: FrameHook = () => {},
    postFrame: FrameHook = () => {},
  ) {
    this.update = update;
    this.render = render;
    this.preFrame = preFrame;
    this.postFrame = postFrame;

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Discard the time spent hidden rather than simulating it.
        this.lastTime = performance.now();
        this.accumulator = 0;
      }
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Advance a single logic tick on the next frame, even while paused. */
  requestStep(): void {
    this.stepRequested = true;
  }

  private frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);

    const rawDelta = now - this.lastTime;
    this.lastTime = now;

    // Clamp on both ends. Upper: a stalled tab must not queue up hundreds of
    // catch-up ticks. Lower: the timestamp handed to a rAF callback is the
    // frame's start time, which can legitimately predate the performance.now()
    // sampled in start(), so the very first delta may be negative.
    const delta = Math.max(0, Math.min(rawDelta, MAX_FRAME_MS));
    if (rawDelta > MAX_FRAME_MS) {
      this.stats.droppedTicks += Math.floor((rawDelta - MAX_FRAME_MS) / TICK_MS);
    }

    const frameStart = performance.now();
    this.preFrame();
    let ticks = 0;

    if (this.paused) {
      this.accumulator = 0;
      if (this.stepRequested) {
        this.stepRequested = false;
        this.update();
        ticks = 1;
        this.stats.totalTicks++;
      }
      this.stats.updateMs = 0;
    } else {
      this.accumulator += delta;
      const updateStart = performance.now();
      while (this.accumulator >= TICK_MS) {
        this.accumulator -= TICK_MS;
        this.update();
        ticks++;
        this.stats.totalTicks++;
      }
      this.stats.updateMs = performance.now() - updateStart;
    }

    this.stats.ticksLastFrame = ticks;

    // Clamped defensively: renderers assume alpha is a blend factor in [0,1].
    const alpha = this.paused ? 1 : Math.max(0, Math.min(0.999999, this.accumulator / TICK_MS));
    const renderStart = performance.now();
    this.render(alpha);
    this.stats.renderMs = performance.now() - renderStart;

    this.postFrame();

    const frameMs = performance.now() - frameStart;
    this.stats.totalFrames++;

    // Exponential smoothing keeps the readout stable enough to actually read.
    const k = 0.1;
    this.stats.frameMs += (frameMs - this.stats.frameMs) * k;
    const instantFps = rawDelta > 0 ? 1000 / rawDelta : 0;
    this.stats.fps += (instantFps - this.stats.fps) * k;

    this.frameHistory.push(frameMs);
    if (this.frameHistory.length > GameLoop.HISTORY_LEN) this.frameHistory.shift();
  };
}
