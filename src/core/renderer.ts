/**
 * renderer.ts — fixed 256x224 virtual framebuffer, integer-scaled to the window.
 *
 * Everything is drawn into an offscreen buffer at native resolution and then
 * blitted once with smoothing disabled. That guarantees true nearest-neighbour
 * upscaling: no half-pixels, no shimmer, no filtered edges — regardless of what
 * the browser does with CSS scaling.
 */

import { SCREEN_W, SCREEN_H, MAX_SCALE } from '../tuning';
import { CHAR_ADVANCE, GLYPH_H, GLYPH_W, LINE_HEIGHT, getAtlas, glyphIndex, measure } from './font';

export interface TextOptions {
  /** Solid colour drawn 1px behind and below the glyphs. */
  shadow?: string;
  /** 'left' | 'center' | 'right', relative to x. */
  align?: 'left' | 'center' | 'right';
}

export class Renderer {
  readonly w = SCREEN_W;
  readonly h = SCREEN_H;

  /** The visible, upscaled canvas in the DOM. */
  readonly display: HTMLCanvasElement;
  private readonly displayCtx: CanvasRenderingContext2D;

  /** The native-resolution buffer everything is drawn into. */
  readonly buffer: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  /** Current integer upscale factor, in device pixels. */
  scale = 1;

  /** Screen-shake offset, applied at blit time so it never affects logic. */
  shakeX = 0;
  shakeY = 0;

  constructor(display: HTMLCanvasElement) {
    this.display = display;
    const dctx = display.getContext('2d', { alpha: false });
    if (!dctx) throw new Error('2D context unavailable on the display canvas');
    this.displayCtx = dctx;

    this.buffer = document.createElement('canvas');
    this.buffer.width = SCREEN_W;
    this.buffer.height = SCREEN_H;
    const bctx = this.buffer.getContext('2d', { alpha: false });
    if (!bctx) throw new Error('2D context unavailable on the framebuffer');
    this.ctx = bctx;
    this.ctx.imageSmoothingEnabled = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
  }

  // -------------------------------------------------------------------------
  // Sizing
  // -------------------------------------------------------------------------

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const availW = window.innerWidth * dpr;
    const availH = window.innerHeight * dpr;

    const fit = Math.min(availW / SCREEN_W, availH / SCREEN_H);
    const scale = Math.max(1, Math.min(MAX_SCALE, Math.floor(fit)));
    this.scale = scale;

    const pxW = SCREEN_W * scale;
    const pxH = SCREEN_H * scale;

    this.display.width = pxW;
    this.display.height = pxH;
    this.display.style.width = `${pxW / dpr}px`;
    this.display.style.height = `${pxH / dpr}px`;

    // Re-disable smoothing: resizing a canvas resets its context state.
    this.displayCtx.imageSmoothingEnabled = false;
  }

  // -------------------------------------------------------------------------
  // Primitives — all coordinates are snapped to the virtual pixel grid
  // -------------------------------------------------------------------------

  clear(color = '#000000'): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  }

  px(x: number, y: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x | 0, y | 0, 1, 1);
  }

  fillRect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** 1px outline, drawn inside the given bounds. */
  strokeRect(x: number, y: number, w: number, h: number, color: string): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rw = Math.round(w);
    const rh = Math.round(h);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(rx, ry, rw, 1);
    this.ctx.fillRect(rx, ry + rh - 1, rw, 1);
    this.ctx.fillRect(rx, ry, 1, rh);
    this.ctx.fillRect(rx + rw - 1, ry, 1, rh);
  }

  hline(x: number, y: number, w: number, color: string): void {
    this.fillRect(x, y, w, 1, color);
  }

  vline(x: number, y: number, h: number, color: string): void {
    this.fillRect(x, y, 1, h, color);
  }

  /** Bresenham, for debug rays and boss tethers. */
  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    let err = dx + dy;

    this.ctx.fillStyle = color;
    for (;;) {
      this.ctx.fillRect(x, y, 1, 1);
      if (x === ex && y === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Filled circle, rasterised on the pixel grid (no antialiasing). */
  circle(cx: number, cy: number, r: number, color: string): void {
    this.ctx.fillStyle = color;
    const icx = Math.round(cx);
    const icy = Math.round(cy);
    const ir = Math.round(r);
    for (let y = -ir; y <= ir; y++) {
      const span = Math.floor(Math.sqrt(ir * ir - y * y));
      this.ctx.fillRect(icx - span, icy + y, span * 2 + 1, 1);
    }
  }

  /** 1px circle outline. */
  circleOutline(cx: number, cy: number, r: number, color: string): void {
    this.ctx.fillStyle = color;
    const icx = Math.round(cx);
    const icy = Math.round(cy);
    let x = Math.round(r);
    let y = 0;
    let err = 1 - x;
    const plot = (px: number, py: number) => this.ctx.fillRect(px, py, 1, 1);
    while (x >= y) {
      plot(icx + x, icy + y);
      plot(icx + y, icy + x);
      plot(icx - y, icy + x);
      plot(icx - x, icy + y);
      plot(icx - x, icy - y);
      plot(icx - y, icy - x);
      plot(icx + y, icy - x);
      plot(icx + x, icy - y);
      y++;
      if (err < 0) err += 2 * y + 1;
      else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Text
  // -------------------------------------------------------------------------

  text(str: string, x: number, y: number, color = '#ffffff', opts: TextOptions = {}): void {
    const lines = str.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      let ox = Math.round(x);
      if (opts.align === 'center') ox -= (measure(line) / 2) | 0;
      else if (opts.align === 'right') ox -= measure(line);
      const oy = Math.round(y) + li * LINE_HEIGHT;

      if (opts.shadow) this.drawLine(line, ox + 1, oy + 1, opts.shadow);
      this.drawLine(line, ox, oy, color);
    }
  }

  private drawLine(line: string, x: number, y: number, color: string): void {
    const atlas = getAtlas(color);
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === ' ') continue;
      const gi = glyphIndex(ch);
      this.ctx.drawImage(
        atlas,
        gi * GLYPH_W,
        0,
        GLYPH_W,
        GLYPH_H,
        x + i * CHAR_ADVANCE,
        y,
        GLYPH_W,
        GLYPH_H,
      );
    }
  }

  textWidth(str: string): number {
    return measure(str);
  }

  // -------------------------------------------------------------------------
  // Blit
  // -------------------------------------------------------------------------

  present(): void {
    const s = this.scale;
    const sx = Math.round(this.shakeX) * s;
    const sy = Math.round(this.shakeY) * s;

    if (sx !== 0 || sy !== 0) {
      this.displayCtx.fillStyle = '#000000';
      this.displayCtx.fillRect(0, 0, this.display.width, this.display.height);
    }

    this.displayCtx.drawImage(
      this.buffer,
      0,
      0,
      SCREEN_W,
      SCREEN_H,
      sx,
      sy,
      SCREEN_W * s,
      SCREEN_H * s,
    );
  }
}

export { GLYPH_H, LINE_HEIGHT };
