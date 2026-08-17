/**
 * entity.ts — the common base for everything that lives in the world.
 *
 * Position is the top-left of the collision box, in world pixels. Every entity
 * records its previous position each tick so the renderer can interpolate
 * between ticks; without that, 60Hz logic on a 144Hz display judders.
 */

import type { Renderer } from '../core/renderer';
import type { Camera } from '../core/camera';

export abstract class Entity {
  x = 0;
  y = 0;
  w = 8;
  h = 8;
  vx = 0;
  vy = 0;

  prevX = 0;
  prevY = 0;

  /** Cleared entities are removed by the scene at the end of the tick. */
  dead = false;

  /** Ticks since spawn — handy for animation and lifetimes. */
  age = 0;

  get left(): number {
    return this.x;
  }
  get right(): number {
    return this.x + this.w;
  }
  get top(): number {
    return this.y;
  }
  get bottom(): number {
    return this.y + this.h;
  }
  get centerX(): number {
    return this.x + this.w / 2;
  }
  get centerY(): number {
    return this.y + this.h / 2;
  }

  /** Snapshot position for interpolation. Call at the top of update(). */
  beginTick(): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.age++;
  }

  /** Interpolated screen position, snapped to whole pixels. */
  renderX(alpha: number): number {
    return Math.round(this.prevX + (this.x - this.prevX) * alpha);
  }

  renderY(alpha: number): number {
    return Math.round(this.prevY + (this.y - this.prevY) * alpha);
  }

  /** Teleport without leaving an interpolation streak across the screen. */
  placeAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
  }

  abstract update(): void;
  abstract draw(r: Renderer, cam: Camera, alpha: number): void;
}

/** Axis-aligned overlap test, used for every hit check in the game. */
export function overlaps(a: Entity, b: Entity): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
