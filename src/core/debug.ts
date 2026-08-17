/**
 * debug.ts — F1 developer overlay.
 *
 * Flags here are read by other systems (the physics system will draw hitboxes
 * when `debug.showHitboxes` is set), so this module is the single switchboard
 * for development visualisation.
 *
 * Keys:
 *   F1  toggle overlay
 *   F2  cycle overlay detail (compact -> full -> off)
 *   \   toggle hitboxes independently
 */

import { Renderer } from './renderer';
import { LINE_HEIGHT } from './font';
import type { LoopStats } from './loop';
import { SCREEN_H, SCREEN_W, TICK_HZ } from '../tuning';

export type StatProvider = () => string[];

class Debug {
  enabled = false;
  detail: 'compact' | 'full' = 'compact';
  showHitboxes = false;

  /** Extra lines contributed by other systems (entity counts, camera, etc.). */
  private providers: StatProvider[] = [];

  addProvider(fn: StatProvider): void {
    this.providers.push(fn);
  }

  toggle(): void {
    this.enabled = !this.enabled;
  }

  cycleDetail(): void {
    if (!this.enabled) {
      this.enabled = true;
      this.detail = 'compact';
    } else if (this.detail === 'compact') {
      this.detail = 'full';
    } else {
      this.enabled = false;
    }
  }

  draw(r: Renderer, stats: LoopStats): void {
    if (!this.enabled) return;

    const lines: string[] = [
      `FPS ${stats.fps.toFixed(0).padStart(3)}  ${stats.frameMs.toFixed(2)}MS`,
      `TICK ${stats.totalTicks}  X${stats.ticksLastFrame}`,
    ];

    if (this.detail === 'full') {
      lines.push(
        `UPD ${stats.updateMs.toFixed(2)} RND ${stats.renderMs.toFixed(2)}`,
        `FRAMES ${stats.totalFrames}  DROP ${stats.droppedTicks}`,
        `SCALE ${r.scale}X ${SCREEN_W}X${SCREEN_H} ${TICK_HZ}HZ`,
      );
    }

    for (const p of this.providers) lines.push(...p());
    if (this.showHitboxes) lines.push('HITBOXES ON');

    // Panel
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, r.textWidth(l));
    const padX = 3;
    const padY = 3;
    const boxW = maxW + padX * 2;
    const boxH = lines.length * LINE_HEIGHT - 2 + padY * 2;

    this.dim(r, 1, 1, boxW, boxH);
    r.strokeRect(1, 1, boxW, boxH, '#3a9e3a');

    for (let i = 0; i < lines.length; i++) {
      r.text(lines[i], 1 + padX, 1 + padY + i * LINE_HEIGHT, '#7cf07c');
    }

    if (this.detail === 'full') this.drawFrameGraph(r, 1, 1 + boxH + 2);
  }

  /** Cheap 50%-ish dim: a solid dark fill under the panel. */
  private dim(r: Renderer, x: number, y: number, w: number, h: number): void {
    const ctx = r.ctx;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#001200';
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }

  private history: number[] = [];

  /** Feed the graph once per frame. */
  sample(frameMs: number): void {
    this.history.push(frameMs);
    if (this.history.length > 64) this.history.shift();
  }

  private drawFrameGraph(r: Renderer, x: number, y: number): void {
    const w = 64;
    const h = 20;
    this.dim(r, x, y, w + 2, h + 2);
    r.strokeRect(x, y, w + 2, h + 2, '#3a9e3a');

    // 16.67ms budget line: bars crossing it mean a missed 60Hz frame.
    const budgetY = y + 1 + h - Math.round((16.67 / 33.3) * h);
    r.hline(x + 1, budgetY, w, '#4d8f4d');

    for (let i = 0; i < this.history.length; i++) {
      const ms = this.history[i];
      const bar = Math.max(1, Math.min(h, Math.round((ms / 33.3) * h)));
      const color = ms > 16.67 ? '#f05a5a' : '#7cf07c';
      r.fillRect(x + 1 + i, y + 1 + h - bar, 1, bar, color);
    }
  }
}

export const debug = new Debug();
