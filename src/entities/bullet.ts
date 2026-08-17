/**
 * bullet.ts — projectiles and the pool that owns them.
 *
 * Bullets are the highest-churn object in the game: with two players on spread
 * guns there can be dozens spawning and dying every second. Allocating one per
 * shot hands the garbage collector a steady stream of short-lived objects, and
 * a GC pause during a boss fight is a dropped frame at the worst possible
 * moment. So the pool is allocated once at boot and objects are recycled
 * forever after; `spawn` never constructs anything.
 *
 * Movement is sub-stepped against the tilemap. At the rifle's 4px/tick nothing
 * could tunnel through a 16px tile anyway, but the Rapid power-up in step 6
 * raises that, and a bullet that teleports through a wall is a bug that only
 * shows up once the level is full of enemies.
 */

import { Entity } from './entity';
import type { Renderer } from '../core/renderer';
import type { Camera } from '../core/camera';
import type { Tilemap } from '../systems/tilemap';
import { PAL } from '../core/palette';
import {
  BULLET_CULL_MARGIN,
  BULLET_H,
  BULLET_POOL_SIZE,
  BULLET_SPARK_FRAMES,
  BULLET_W,
  TILE,
} from '../tuning';

export type Team = 'player' | 'enemy';

/** Largest distance a bullet may travel before collision is re-tested. */
const MAX_SUBSTEP = TILE / 2;

export class Bullet extends Entity {
  override w = BULLET_W;
  override h = BULLET_H;

  /** Pool slot index. Fixed for the object's lifetime. */
  readonly slot: number;

  /** False when the object is sitting idle in the pool. */
  active = false;

  team: Team = 'player';
  /** Which player fired it, so the on-screen cap is per player. */
  owner = 0;

  /** Counts down while the impact flash plays, then the slot is freed. */
  spark = 0;

  /**
   * True for the remainder of the tick a bullet is born on.
   *
   * Without this the pool's update runs after the player's, so a bullet moves
   * a full step before it is ever drawn and the first frame shows it detached
   * from the muzzle flash that supposedly produced it.
   */
  justSpawned = false;

  private map: Tilemap | null = null;

  constructor(slot: number) {
    super();
    this.slot = slot;
  }

  /** Reset every field. A recycled object must not remember its past life. */
  init(x: number, y: number, vx: number, vy: number, team: Team, owner: number, map: Tilemap): void {
    this.placeAt(x - this.w / 2, y - this.h / 2);
    this.vx = vx;
    this.vy = vy;
    this.team = team;
    this.owner = owner;
    this.map = map;
    this.active = true;
    this.dead = false;
    this.spark = 0;
    this.age = 0;
    this.justSpawned = true;

    // Fired point-blank into a wall: flash immediately rather than sitting
    // inside the tile for a frame.
    if (map.boxHitsSolid(this.x, this.y, this.w, this.h)) this.impact();
  }

  /** Stop and play the impact flash. */
  impact(): void {
    this.vx = 0;
    this.vy = 0;
    this.spark = BULLET_SPARK_FRAMES;
  }

  override update(): void {
    this.beginTick();

    if (this.spark > 0) {
      this.spark--;
      if (this.spark === 0) this.dead = true;
      return;
    }

    const map = this.map;
    if (!map) return;

    const dist = Math.hypot(this.vx, this.vy);
    const steps = Math.max(1, Math.ceil(dist / MAX_SUBSTEP));
    const sx = this.vx / steps;
    const sy = this.vy / steps;

    for (let i = 0; i < steps; i++) {
      this.x += sx;
      this.y += sy;
      if (map.boxHitsSolid(this.x, this.y, this.w, this.h)) {
        // Back out of the tile so the flash sits on the surface, not inside it.
        this.x -= sx;
        this.y -= sy;
        this.impact();
        return;
      }
    }
  }

  override draw(r: Renderer, cam: Camera, alpha: number): void {
    const x = this.renderX(alpha) - cam.renderX(alpha);
    const y = this.renderY(alpha) - cam.renderY(alpha);

    if (this.spark > 0) {
      // Brief cross-shaped flash.
      r.hline(x - 1, y + 1, 5, PAL.yellow);
      r.vline(x + 1, y - 1, 5, PAL.yellow);
      r.px(x + 1, y + 1, PAL.white);
      return;
    }

    // A hot core with a short tail opposite the direction of travel, which
    // reads as speed without needing motion blur.
    const d = Math.hypot(this.vx, this.vy) || 1;
    const tx = x + 1 - (this.vx / d) * 2;
    const ty = y + 1 - (this.vy / d) * 2;
    r.px(Math.round(tx), Math.round(ty), PAL.orange);
    r.fillRect(x, y, this.w, this.h, PAL.yellow);
    r.px(x + 1, y + 1, PAL.white);
  }
}

/**
 * Fixed-capacity bullet pool.
 *
 * Free slots are tracked on a stack, so spawning and freeing are both O(1) and
 * neither scans the array. When the pool is exhausted the request is dropped:
 * silently refusing to fire is far better than a frame hitch, and with the
 * per-weapon on-screen caps it should never happen in practice.
 */
export class BulletPool {
  readonly items: Bullet[] = [];
  private readonly free: number[] = [];
  private readonly map: Tilemap;

  /** Diagnostics: how many spawns were refused because the pool was full. */
  overflow = 0;

  constructor(map: Tilemap, capacity = BULLET_POOL_SIZE) {
    this.map = map;
    for (let i = 0; i < capacity; i++) {
      this.items.push(new Bullet(i));
      this.free.push(i);
    }
  }

  get capacity(): number {
    return this.items.length;
  }

  get activeCount(): number {
    return this.items.length - this.free.length;
  }

  /** Live bullets belonging to one player — the on-screen cap counts these. */
  countFor(owner: number, team: Team = 'player'): number {
    let n = 0;
    for (const b of this.items) {
      // A bullet playing its impact flash no longer counts against the cap;
      // it has already stopped, and holding the slot would make the gun feel
      // like it stutters against walls.
      if (b.active && b.spark === 0 && b.owner === owner && b.team === team) n++;
    }
    return n;
  }

  spawn(x: number, y: number, vx: number, vy: number, team: Team, owner: number): Bullet | null {
    const slot = this.free.pop();
    if (slot === undefined) {
      this.overflow++;
      return null;
    }
    const b = this.items[slot];
    b.init(x, y, vx, vy, team, owner, this.map);
    return b;
  }

  update(cam: Camera): void {
    for (const b of this.items) {
      if (!b.active) continue;

      // Born this tick: hold it at the muzzle for one frame so the shot reads
      // as leaving the barrel.
      if (b.justSpawned) {
        b.justSpawned = false;
        continue;
      }

      b.update();

      if (!b.dead && !cam.isVisible(b.x, b.y, b.w, b.h, BULLET_CULL_MARGIN)) b.dead = true;

      if (b.dead) {
        b.active = false;
        this.free.push(b.slot);
      }
    }
  }

  draw(r: Renderer, cam: Camera, alpha: number): void {
    for (const b of this.items) if (b.active) b.draw(r, cam, alpha);
  }

  /** Clear the field — used on death and level transitions. */
  reset(): void {
    this.free.length = 0;
    for (const b of this.items) {
      b.active = false;
      b.dead = false;
      b.spark = 0;
      this.free.push(b.slot);
    }
  }
}
