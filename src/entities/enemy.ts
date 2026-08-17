/**
 * enemy.ts — the opposition.
 *
 * Every behaviour here is a small deterministic state machine driven by frame
 * counters. No pathfinding, no steering, no randomness that depends on frame
 * timing: given the same camera position and the same player movement, enemies
 * do the same thing every run. That is what makes an arcade stage learnable
 * rather than merely hard, and it is what lets the tests assert on behaviour.
 *
 * Each attack has a visible wind-up. An enemy that fires the instant it decides
 * to is indistinguishable from an unfair one — the telegraph is what converts a
 * death into the player's mistake instead of the game's.
 */

import { Entity } from './entity';
import type { Renderer } from '../core/renderer';
import type { Camera } from '../core/camera';
import type { Tilemap } from '../systems/tilemap';
import type { BulletPool } from './bullet';
import { PAL } from '../core/palette';
import { moveBody } from '../systems/physics';
import {
  ENEMY_BULLET_SPEED,
  ENEMY_HIT_FLASH,
  GRAVITY,
  MAX_FALL_SPEED,
  SOLDIER_CROUCH_H,
  SOLDIER_FIRE_COOLDOWN,
  SOLDIER_FIRE_RANGE,
  SOLDIER_H,
  SOLDIER_JUMP_VELOCITY,
  SOLDIER_RECOVER_FRAMES,
  SOLDIER_ROLL_FRAMES,
  SOLDIER_ROLL_INTERVAL,
  SOLDIER_ROLL_SPEED,
  SOLDIER_RUN_SPEED,
  SOLDIER_TELEGRAPH_FRAMES,
  SOLDIER_W,
  TURRET_FIRE_PERIOD,
  TURRET_H,
  TURRET_HEALTH,
  TURRET_RANGE,
  TURRET_TELEGRAPH_FRAMES,
  TURRET_W,
} from '../tuning';

/** What an enemy needs from the world, without knowing about the scene. */
export interface EnemyContext {
  map: Tilemap;
  bullets: BulletPool;
  /** Nearest living player, or null if everyone is dead. */
  target(): { x: number; y: number } | null;
}

export abstract class Enemy extends Entity {
  readonly ctx: EnemyContext;

  health = 1;
  facing: 1 | -1 = -1;

  /** Ticks of white-out remaining after a non-fatal hit. */
  hitFlash = 0;

  /** True once killed, so the scene can spawn an explosion exactly once. */
  killed = false;

  // Physics body fields.
  onGround = false;
  dropThrough = 0;

  /** Counts up every tick this enemy is winding up an attack. */
  telegraph = 0;

  constructor(ctx: EnemyContext) {
    super();
    this.ctx = ctx;
  }

  /** Returns true if this hit was fatal. */
  takeHit(damage = 1): boolean {
    if (this.killed) return false;
    this.health -= damage;
    this.hitFlash = ENEMY_HIT_FLASH;
    if (this.health <= 0) {
      this.killed = true;
      this.dead = true;
      return true;
    }
    return false;
  }

  protected tickCommon(): void {
    this.beginTick();
    if (this.hitFlash > 0) this.hitFlash--;
  }

  /** Fire one bullet toward a point, snapped to eight directions. */
  protected fireAt(tx: number, ty: number, fromX: number, fromY: number): void {
    const dx = tx - fromX;
    const dy = ty - fromY;
    const len = Math.hypot(dx, dy) || 1;

    // Snapping to eight directions keeps enemy fire readable — a bullet on a
    // clean axis or diagonal can be judged at a glance, an arbitrary angle
    // cannot.
    const ax = Math.abs(dx / len);
    const ay = Math.abs(dy / len);
    let nx = 0;
    let ny = 0;
    if (ax > 0.383) nx = Math.sign(dx);
    if (ay > 0.383) ny = Math.sign(dy);
    if (nx === 0 && ny === 0) nx = this.facing;

    const inv = 1 / Math.hypot(nx, ny);
    this.ctx.bullets.spawn(
      fromX,
      fromY,
      nx * inv * ENEMY_BULLET_SPEED,
      ny * inv * ENEMY_BULLET_SPEED,
      'enemy',
      -1,
    );
  }

  /** White silhouette flash on hit, drawn over whatever the subclass drew. */
  protected drawHitFlash(r: Renderer, x: number, y: number): void {
    if (this.hitFlash > 0) r.fillRect(x, y, this.w, this.h, PAL.white);
  }
}

// ---------------------------------------------------------------------------
// Soldier
// ---------------------------------------------------------------------------

type SoldierState = 'run' | 'aim' | 'recover' | 'roll';

export class Soldier extends Enemy {
  override w = SOLDIER_W;
  override h = SOLDIER_H;

  state: SoldierState = 'run';
  private stateTimer = 0;
  private fireCooldown = 0;
  private rollCooldown = SOLDIER_ROLL_INTERVAL;
  private animTimer = 0;
  private frame = 0;

  /**
   * `phase` is a per-enemy offset supplied by the spawner so that a group does
   * not act in lockstep. It is consumed here to stagger the timers and not
   * retained — nothing downstream needs to know its own index.
   */
  constructor(ctx: EnemyContext, x: number, y: number, facing: 1 | -1, phase = 0) {
    super(ctx);
    this.placeAt(x - this.w / 2, y - this.h);
    this.facing = facing;
    // Every soldier gets a beat of running before its first shot, staggered
    // per enemy. Without the floor, one spawning already in range begins its
    // wind-up on the very tick it appears, which the player cannot read as
    // anything but an ambush.
    const half = SOLDIER_FIRE_COOLDOWN / 2;
    this.fireCooldown = half + ((phase * 17) % half);
    this.rollCooldown = SOLDIER_ROLL_INTERVAL + ((phase * 29) % 60);
  }

  override update(): void {
    this.tickCommon();

    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.rollCooldown > 0) this.rollCooldown--;

    const target = this.ctx.target();
    const dist = target ? Math.abs(target.x - this.centerX) : Infinity;

    // Always turn to face the player: a soldier shooting the wrong way reads
    // as broken rather than as a missed opportunity.
    if (target && this.state !== 'roll') {
      this.facing = target.x < this.centerX ? -1 : 1;
    }

    switch (this.state) {
      case 'run':
        this.vx = SOLDIER_RUN_SPEED * this.facing;
        this.setHeight(SOLDIER_H);

        if (target && dist < SOLDIER_FIRE_RANGE && this.fireCooldown === 0) {
          this.enter('aim', SOLDIER_TELEGRAPH_FRAMES);
        } else if (this.rollCooldown === 0 && dist > SOLDIER_FIRE_RANGE * 0.6) {
          this.enter('roll', SOLDIER_ROLL_FRAMES);
          this.rollCooldown = SOLDIER_ROLL_INTERVAL;
        }
        break;

      case 'aim':
        // Wind-up: planted, crouched, visibly about to shoot.
        this.vx = 0;
        this.setHeight(SOLDIER_CROUCH_H);
        this.telegraph = this.stateTimer;
        if (this.stateTimer <= 0) {
          if (target) this.fireAt(target.x, target.y, this.muzzleX(), this.muzzleY());
          this.fireCooldown = SOLDIER_FIRE_COOLDOWN;
          this.telegraph = 0;
          this.enter('recover', SOLDIER_RECOVER_FRAMES);
        }
        break;

      case 'recover':
        this.vx = 0;
        if (this.stateTimer <= 0) this.enter('run', 0);
        break;

      case 'roll':
        // A dive-roll crosses ground fast and low, ducking anything fired at
        // standing height.
        this.vx = SOLDIER_ROLL_SPEED * this.facing;
        this.setHeight(SOLDIER_CROUCH_H);
        if (this.stateTimer <= 0) this.enter('run', 0);
        break;

      default:
        break;
    }

    if (this.stateTimer > 0) this.stateTimer--;

    // --- physics ---
    this.vy += GRAVITY;
    if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;

    const res = moveBody(this, this.ctx.map);

    // Blocked by a wall while advancing: hop it if we can, turn if we cannot.
    if ((res.hitLeft || res.hitRight) && this.onGround) {
      if (this.state === 'roll') this.enter('run', 0);
      else this.vy = SOLDIER_JUMP_VELOCITY;
    }

    // Walked off into a pit — let gravity have it, then recycle below the map.
    if (this.y > this.ctx.map.heightPx + 32) this.dead = true;

    this.animTimer++;
    if (this.animTimer >= 6) {
      this.animTimer = 0;
      this.frame = (this.frame + 1) % 4;
    }
  }

  private enter(state: SoldierState, duration: number): void {
    this.state = state;
    this.stateTimer = duration;
  }

  /** Resize anchored at the feet, matching the player's stance rule. */
  private setHeight(next: number): void {
    if (this.h === next) return;
    this.y += this.h - next;
    this.h = next;
  }

  private muzzleX(): number {
    return this.centerX + this.facing * 6;
  }

  private muzzleY(): number {
    return this.y + 6;
  }

  override draw(r: Renderer, cam: Camera, alpha: number): void {
    const x = this.renderX(alpha) - cam.renderX(alpha);
    const y = this.renderY(alpha) - cam.renderY(alpha);
    const f = this.facing;
    const cx = x + this.w / 2;

    const winding = this.state === 'aim';
    // The wind-up flashes between two body colours: unmistakable at a glance,
    // even with several soldiers on screen.
    const uniform = winding && this.telegraph % 6 < 3 ? PAL.red2 : PAL.red0;
    const trim = PAL.brown2;

    if (this.state === 'roll') {
      // Tucked ball, rolling.
      const spin = (this.age * 0.25) % 1;
      r.fillRect(cx - 4, y + 2, 8, 8, uniform);
      const hx = cx + Math.cos(spin * Math.PI * 2) * 3;
      const hy = y + 6 + Math.sin(spin * Math.PI * 2) * 3;
      r.fillRect(hx - 2, hy - 2, 4, 4, trim);
      this.drawHitFlash(r, x, y);
      return;
    }

    const crouched = this.h === SOLDIER_CROUCH_H;
    const top = y;

    // Legs.
    if (crouched) {
      r.fillRect(cx - 4, top + 7, 8, 5, uniform);
      r.fillRect(cx - 4, top + 10, 8, 2, PAL.grey1);
    } else {
      const stride = this.state === 'run' ? (this.frame === 0 ? 2 : this.frame === 2 ? -2 : 0) : 0;
      r.fillRect(cx - 3 + stride, top + 13, 3, 7, PAL.grey1);
      r.fillRect(cx - stride, top + 13, 3, 7, PAL.grey1);
    }

    // Torso and head.
    const torsoY = crouched ? top + 3 : top + 6;
    r.fillRect(cx - 3, torsoY, 6, crouched ? 5 : 7, uniform);
    r.fillRect(cx - 3, torsoY, 6, 2, trim); // shoulder strap
    r.fillRect(cx - 3, top, 6, 5, PAL.brown3);
    r.fillRect(cx - 4, top, 8, 2, trim); // helmet
    r.px(cx + f * 2, top + 3, PAL.black);

    // Rifle, held level and pointed at the player.
    const gunY = torsoY + 2;
    const gunX = f === 1 ? cx + 2 : cx - 8;
    r.fillRect(gunX, gunY, 6, 2, PAL.grey2);

    // Muzzle flare on the frame the shot leaves.
    if (this.state === 'recover' && this.age % 60 < 3) {
      r.fillRect(f === 1 ? gunX + 6 : gunX - 3, gunY - 1, 3, 3, PAL.yellow);
    }

    this.drawHitFlash(r, x, y);
  }
}

// ---------------------------------------------------------------------------
// Turret
// ---------------------------------------------------------------------------

/**
 * A fixed gun emplacement. It does not move or track smoothly — it waits on a
 * fixed cadence, telegraphs, then fires a volley at wherever you are. Turrets
 * are the level's punctuation: they make a stretch of ground dangerous without
 * chasing you across it.
 */
export class Turret extends Enemy {
  override w = TURRET_W;
  override h = TURRET_H;

  private timer = 0;
  private aimX = 0;
  private aimY = 0;

  constructor(ctx: EnemyContext, x: number, y: number, phase = 0) {
    super(ctx);
    this.placeAt(x - this.w / 2, y - this.h);
    this.health = TURRET_HEALTH;
    this.timer = (phase * 37) % TURRET_FIRE_PERIOD;
  }

  get isWindingUp(): boolean {
    return this.timer >= TURRET_FIRE_PERIOD - TURRET_TELEGRAPH_FRAMES;
  }

  override update(): void {
    this.tickCommon();

    const target = this.ctx.target();
    const inRange =
      !!target && Math.hypot(target.x - this.centerX, target.y - this.centerY) < TURRET_RANGE;

    if (!inRange) {
      // Hold fire and reset the wind-up rather than shooting at nothing.
      if (this.timer > 0) this.timer--;
      this.telegraph = 0;
      return;
    }

    this.timer++;
    this.telegraph = this.isWindingUp ? this.timer - (TURRET_FIRE_PERIOD - TURRET_TELEGRAPH_FRAMES) : 0;

    if (target) {
      // Lock the aim when the wind-up starts, so the shot goes where the
      // barrel was pointing — dodging during the telegraph has to work.
      if (!this.isWindingUp) {
        this.aimX = target.x;
        this.aimY = target.y;
      }
    }

    if (this.timer >= TURRET_FIRE_PERIOD) {
      this.timer = 0;
      this.telegraph = 0;
      this.fireAt(this.aimX, this.aimY, this.centerX, this.centerY);
    }
  }

  override draw(r: Renderer, cam: Camera, alpha: number): void {
    const x = this.renderX(alpha) - cam.renderX(alpha);
    const y = this.renderY(alpha) - cam.renderY(alpha);
    const cx = x + this.w / 2;
    const cy = y + this.h / 2;

    // Base.
    r.fillRect(x, y + 4, this.w, this.h - 4, PAL.grey1);
    r.fillRect(x, y + 4, this.w, 2, PAL.grey2);
    r.strokeRect(x, y + 4, this.w, this.h - 4, PAL.grey0);

    // Dome, which pulses through the wind-up.
    const hot = this.isWindingUp && this.telegraph % 6 < 3;
    r.circle(cx, cy, 5, hot ? PAL.red2 : PAL.grey2);
    r.circleOutline(cx, cy, 5, PAL.grey0);

    // Barrel pointing at the locked aim.
    const dx = this.aimX - this.centerX;
    const dy = this.aimY - this.centerY;
    const len = Math.hypot(dx, dy) || 1;
    const bx = cx + (dx / len) * 9;
    const by = cy + (dy / len) * 9;
    r.line(cx, cy, bx, by, PAL.grey3);
    r.line(cx, cy + 1, bx, by + 1, PAL.grey2);

    // Eye: bright while charging, dark while reloading.
    r.px(cx, cy, hot ? PAL.yellow : PAL.red0);

    this.drawHitFlash(r, x, y);
  }
}
