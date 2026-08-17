/**
 * player.ts — the commando: movement, stance, and aiming.
 *
 * Design notes that matter to the feel:
 *
 * - Horizontal motion is instant, not accelerated. Arcade run-and-gun controls
 *   live or die on the player believing the character starts and stops exactly
 *   when they say so; momentum belongs in a different genre.
 *
 * - Falling off a ledge and jumping are different states. A jump is a tucked
 *   somersault with a shorter hitbox; a fall keeps you upright. Reusing one
 *   state for both is the usual reason a character looks like it is spinning
 *   for no reason after stepping off a step.
 *
 * - Stance changes are anchored at the feet and refuse to happen when there is
 *   no room, which is what makes the low tunnel work: you crawl in prone, and
 *   trying to stand up under rock simply does not happen.
 */

import { Entity } from './entity';
import { AIM, AIM_VEC, resolveAim, type AimDir } from './aim';
import type { ActionState } from '../systems/input';
import type { Tilemap } from '../systems/tilemap';
import type { Renderer } from '../core/renderer';
import type { Camera } from '../core/camera';
import { moveBody, hasHeadroom, probeGround, type CollisionResult } from '../systems/physics';
import { drawPlayer, type PlayerSkin } from './playerSprite';
import type { BulletPool } from './bullet';
import {
  COYOTE_FRAMES,
  DROP_THROUGH_FRAMES,
  GRAVITY,
  JUMP_BUFFER_FRAMES,
  JUMP_HOLD_FRAMES,
  JUMP_HOLD_GRAVITY,
  JUMP_VELOCITY,
  MAX_FALL_SPEED,
  MUZZLE_FLASH_FRAMES,
  DEATH_KNOCKBACK_X,
  DEATH_KNOCKBACK_Y,
  INVULN_FRAMES,
  INVULN_FLICKER_PERIOD,
  RESPAWN_DELAY_FRAMES,
  STARTING_LIVES,
  PLAYER_H,
  PLAYER_JUMP_H,
  PLAYER_PRONE_H,
  PLAYER_W,
  RIFLE_BULLET_SPEED,
  RIFLE_COOLDOWN_FRAMES,
  RIFLE_MAX_ONSCREEN,
  RUN_ANIM_FRAMES,
  RUN_SPEED,
  SOMERSAULT_SPINS,
} from '../tuning';

export type PlayerState = 'stand' | 'run' | 'prone' | 'jump' | 'fall' | 'dying';

/** Read-only movement telemetry, surfaced by the debug overlay for tuning. */
export interface JumpTelemetry {
  /** Peak height above the launch point, in pixels, of the last completed jump. */
  lastApex: number;
  /** Ticks spent airborne on the last completed jump. */
  lastAirtime: number;
  /** Live apex of the jump in progress. */
  currentApex: number;
}

export class Player extends Entity {
  override w = PLAYER_W;
  override h = PLAYER_H;

  readonly index: number;
  readonly skin: PlayerSkin;

  facing: 1 | -1 = 1;
  aim: AimDir = AIM.E;
  state: PlayerState = 'fall';

  // --- physics body fields ---
  onGround = false;
  dropThrough = 0;

  // --- jump bookkeeping ---
  private coyote = 0;
  private jumpBuffer = 0;
  private holdFrames = 0;

  // --- animation ---
  private animTimer = 0;
  runFrame = 0;
  /** 0..1 through the somersault rotation. */
  spin = 0;

  /** Where bullets are born, in world space. */
  muzzleX = 0;
  muzzleY = 0;
  /** Ticks remaining on the muzzle flash. */
  muzzleFlash = 0;
  /** Ticks until the rifle will accept another shot. */
  fireCooldown = 0;
  /** Shots fired, for the debug readout. */
  shotsFired = 0;

  readonly telemetry: JumpTelemetry = { lastApex: 0, lastAirtime: 0, currentApex: 0 };
  private launchBottom = 0;
  private airFrames = 0;

  /** Diagnostics for the debug overlay. */
  lastCollision: CollisionResult | null = null;
  fallCount = 0;

  // --- life cycle --------------------------------------------------------
  /** False while playing out the death arc. */
  alive = true;
  lives = STARTING_LIVES;
  /** Ticks of post-respawn immunity remaining. */
  invuln = 0;
  /** Counts down the death animation before the respawn happens. */
  private deathTimer = 0;
  /** Set for one tick when the last life is spent, for the scene to notice. */
  outOfLives = false;
  deaths = 0;

  private readonly input: ActionState;
  private readonly map: Tilemap;
  private readonly bullets: BulletPool;

  constructor(
    index: number,
    input: ActionState,
    map: Tilemap,
    skin: PlayerSkin,
    bullets: BulletPool,
  ) {
    super();
    this.index = index;
    this.input = input;
    this.map = map;
    this.skin = skin;
    this.bullets = bullets;
  }

  /** Place the character with its feet at (x, y). */
  spawnAt(x: number, y: number): void {
    this.setHeight(PLAYER_H);
    this.placeAt(Math.round(x - this.w / 2), Math.round(y - this.h));
    this.vx = 0;
    this.vy = 0;
    this.state = 'fall';
    this.facing = 1;
    this.aim = AIM.E;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.dropThrough = 0;
    this.telemetry.currentApex = 0;
  }

  /** Resize anchored at the feet, so a stance change never sinks into a floor. */
  private setHeight(next: number): void {
    this.y += this.h - next;
    this.h = next;
  }

  get isProne(): boolean {
    return this.state === 'prone';
  }

  get airborne(): boolean {
    return this.state === 'jump' || this.state === 'fall';
  }

  // -------------------------------------------------------------------------

  override update(): void {
    this.beginTick();

    if (!this.alive) {
      this.updateDying();
      return;
    }

    if (this.invuln > 0) this.invuln--;

    const inp = this.input;

    // --- facing -----------------------------------------------------------
    if (inp.left) this.facing = -1;
    else if (inp.right) this.facing = 1;
    const horizontal = inp.left || inp.right;

    // --- stance -----------------------------------------------------------
    if (this.onGround) {
      if (inp.down && this.state !== 'prone') {
        this.setHeight(PLAYER_PRONE_H);
        this.state = 'prone';
      } else if (!inp.down && this.state === 'prone') {
        // Only stand back up if there is room overhead.
        if (hasHeadroom(this, this.map, PLAYER_H)) {
          this.setHeight(PLAYER_H);
          this.state = horizontal ? 'run' : 'stand';
        }
      }
    }

    // --- horizontal drive -------------------------------------------------
    // Prone pins you in place: the trade for the small hitbox and the floor-
    // level line of fire is that you cannot advance while using it.
    if (this.state === 'prone') {
      this.vx = 0;
    } else {
      this.vx = horizontal ? RUN_SPEED * this.facing : 0;
    }

    // --- jump -------------------------------------------------------------
    if (inp.jumpPressed) this.jumpBuffer = JUMP_BUFFER_FRAMES;
    if (this.jumpBuffer > 0) this.jumpBuffer--;
    if (this.coyote > 0) this.coyote--;

    const canLaunch = this.onGround || this.coyote > 0;
    if (this.jumpBuffer > 0 && canLaunch) {
      const support = probeGround(this, this.map);

      if (this.state === 'prone' && support.oneWay && !support.solid) {
        this.dropThroughPlatform();
      } else if (hasHeadroom(this, this.map, PLAYER_JUMP_H)) {
        this.launch();
      }
    }

    // --- gravity ----------------------------------------------------------
    this.applyGravity(inp);

    // --- move -------------------------------------------------------------
    const wasGrounded = this.onGround;
    const res = moveBody(this, this.map);
    this.lastCollision = res;

    if (res.hitCeiling) {
      // Head hits rock: kill the hold window so you drop away immediately
      // rather than scraping along the underside of the ceiling.
      this.holdFrames = JUMP_HOLD_FRAMES;
    }

    if (res.hitGround) {
      if (this.airborne) this.land(horizontal);
      this.coyote = 0;
    } else {
      if (wasGrounded && this.state !== 'jump') {
        // Walked off an edge: brief forgiveness window, and fall upright.
        this.coyote = COYOTE_FRAMES;
        this.state = 'fall';
      }
      this.trackAirborne();
    }

    if (this.onGround && !this.airborne && this.state !== 'prone') {
      this.state = this.vx !== 0 ? 'run' : 'stand';
    }

    // --- aim & animation --------------------------------------------------
    this.aim = resolveAim({
      facing: this.facing,
      up: inp.up,
      down: inp.down,
      horizontal,
      grounded: this.onGround,
      prone: this.state === 'prone',
    });

    this.updateMuzzle();
    this.tryFire(inp);
    this.updateAnimation();

    // A pit is as lethal as a bullet, and ignores invulnerability: nothing
    // saves you from leaving the world.
    if (this.y > this.map.heightPx + 8) {
      this.fallCount++;
      this.kill(true);
    }
  }

  // -------------------------------------------------------------------------
  // Death, respawn, lives
  // -------------------------------------------------------------------------

  /**
   * One hit is all it takes. `force` bypasses invulnerability, which only pits
   * use — flicker frames are meant to protect you from an unfair spawn camp,
   * not from walking off a ledge.
   */
  kill(force = false): void {
    if (!this.alive) return;
    if (this.invuln > 0 && !force) return;

    this.alive = false;
    this.deaths++;
    this.state = 'dying';
    this.setHeight(PLAYER_JUMP_H);

    // Thrown backwards and up: the arc reads as being hit by something, and it
    // carries the body clear of whatever killed it.
    this.vx = DEATH_KNOCKBACK_X * this.facing;
    this.vy = DEATH_KNOCKBACK_Y;
    this.deathTimer = RESPAWN_DELAY_FRAMES;
    this.spin = 0;
  }

  /**
   * The death arc ignores geometry deliberately. Resolving collisions here
   * would let a corpse land on a ledge and sit there, or wedge into a wall,
   * and the animation is over in a second regardless.
   */
  private updateDying(): void {
    this.vy += GRAVITY * 0.8;
    if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
    this.x += this.vx;
    this.y += this.vy;
    this.spin = (this.spin + 0.06) % 1;

    if (this.deathTimer > 0) {
      this.deathTimer--;
      return;
    }

    this.lives--;
    if (this.lives < 0) {
      this.outOfLives = true;
      return;
    }
    this.respawn();
  }

  /**
   * Come back at the left edge of the screen the camera is currently showing,
   * standing on the first solid ground found there. Respawning where you died
   * would drop you straight back into whatever killed you.
   */
  respawn(cameraX = this.x - 96): void {
    const edge = Math.max(0, cameraX) + 24;
    const ground = this.findGround(edge);

    this.alive = true;
    this.outOfLives = false;
    this.setHeight(PLAYER_H);
    this.placeAt(Math.round(ground.x - this.w / 2), Math.round(ground.y - this.h));
    this.vx = 0;
    this.vy = 0;
    this.state = 'fall';
    this.facing = 1;
    this.aim = AIM.E;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.dropThrough = 0;
    this.fireCooldown = 0;
    this.muzzleFlash = 0;
    this.invuln = INVULN_FRAMES;
  }

  /**
   * Find footing near a world X. Scans downward for the first standable tile,
   * then walks right if that column is a pit — dropping the player into a hole
   * on respawn is the worst possible welcome back.
   */
  private findGround(startX: number): { x: number; y: number } {
    const TILE_SIZE = 16;
    for (let step = 0; step < 24; step++) {
      const x = startX + step * TILE_SIZE;
      const col = Math.floor(x / TILE_SIZE);
      for (let row = 0; row < this.map.rows; row++) {
        if (this.map.isStandableAt(col, row)) {
          return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE };
        }
      }
    }
    // No ground anywhere ahead: drop in from the top and let physics sort it.
    return { x: startX, y: 0 };
  }

  /** True on the frames the sprite should be hidden by the invuln flicker. */
  get flickering(): boolean {
    return this.invuln > 0 && Math.floor(this.invuln / INVULN_FLICKER_PERIOD) % 2 === 1;
  }

  /** Restore the run after a continue. */
  restoreLives(): void {
    this.lives = STARTING_LIVES;
    this.outOfLives = false;
  }

  // -------------------------------------------------------------------------

  private launch(): void {
    this.setHeight(PLAYER_JUMP_H);
    this.vy = JUMP_VELOCITY;
    this.state = 'jump';
    this.onGround = false;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.holdFrames = 0;
    this.spin = 0;
    this.launchBottom = this.bottom;
    this.airFrames = 0;
    this.telemetry.currentApex = 0;
  }

  private dropThroughPlatform(): void {
    this.dropThrough = DROP_THROUGH_FRAMES;
    this.jumpBuffer = 0;
    this.onGround = false;
    this.state = 'fall';
    // Nudge clear of the surface so the very next resolve does not re-land.
    this.y += 1;
    this.vy = 0.5;
  }

  private land(horizontal: boolean): void {
    this.telemetry.lastApex = this.telemetry.currentApex;
    this.telemetry.lastAirtime = this.airFrames;
    this.telemetry.currentApex = 0;
    this.airFrames = 0;
    this.spin = 0;

    // Restore standing height if the ceiling allows it; otherwise land prone.
    if (hasHeadroom(this, this.map, PLAYER_H)) {
      this.setHeight(PLAYER_H);
      this.state = horizontal ? 'run' : 'stand';
    } else {
      this.setHeight(PLAYER_PRONE_H);
      this.state = 'prone';
    }
  }

  private applyGravity(inp: ActionState): void {
    const rising = this.vy < 0;

    // Releasing does not scrub upward speed — it simply ends the reduced-
    // gravity window below, and normal gravity takes the arc back down. An
    // extra velocity cut on release stacks with that and collapses a tap to a
    // 9px hop, which reads as the jump button misfiring.
    let g = GRAVITY;
    if (rising && inp.jump && this.holdFrames < JUMP_HOLD_FRAMES) {
      g = JUMP_HOLD_GRAVITY;
      this.holdFrames++;
    }

    this.vy += g;
    if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
  }

  private trackAirborne(): void {
    this.airFrames++;
    if (this.state === 'jump') {
      const apex = this.launchBottom - this.bottom;
      if (apex > this.telemetry.currentApex) this.telemetry.currentApex = apex;
    }
  }

  /**
   * The default rifle: one shot per press, four alive at a time.
   *
   * Firing reads the *edge*, not the held state, so holding Z does nothing —
   * that distinction is what makes the Machine Gun power-up in step 6 feel
   * like an upgrade rather than a stat change.
   */
  private tryFire(inp: ActionState): void {
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.muzzleFlash > 0) this.muzzleFlash--;

    if (!inp.firePressed) return;
    if (this.fireCooldown > 0) return;
    if (this.bullets.countFor(this.index) >= RIFLE_MAX_ONSCREEN) return;

    const v = AIM_VEC[this.aim];
    const shot = this.bullets.spawn(
      this.muzzleX,
      this.muzzleY,
      v.x * RIFLE_BULLET_SPEED,
      v.y * RIFLE_BULLET_SPEED,
      'player',
      this.index,
    );
    if (!shot) return;

    this.fireCooldown = RIFLE_COOLDOWN_FRAMES;
    this.muzzleFlash = MUZZLE_FLASH_FRAMES;
    this.shotsFired++;
  }

  private updateMuzzle(): void {
    const v = AIM_VEC[this.aim];
    // Shoulder height depends on stance; prone fires from just above the floor.
    // 40% down the body is chest height, which is where a rifle is actually
    // held — and, not coincidentally, where a crouching enemy still is.
    const originY = this.state === 'prone' ? this.y + 3 : this.y + Math.round(this.h * 0.4);
    const originX = this.centerX;
    this.muzzleX = originX + v.x * 8;
    this.muzzleY = originY + v.y * 6;
  }

  private updateAnimation(): void {
    if (this.state === 'run') {
      this.animTimer++;
      if (this.animTimer >= RUN_ANIM_FRAMES) {
        this.animTimer = 0;
        this.runFrame = (this.runFrame + 1) % 4;
      }
    } else if (this.state === 'jump') {
      // One full somersault per (airtime / spins); estimated from a nominal
      // 28-frame arc so short hops still read as a complete rotation.
      this.spin = (this.spin + (SOMERSAULT_SPINS / 28) * 1) % 1;
    } else {
      this.animTimer = 0;
      this.runFrame = 0;
    }
  }

  // -------------------------------------------------------------------------

  override draw(r: Renderer, cam: Camera, alpha: number): void {
    // Invulnerability is communicated by blinking the sprite out entirely,
    // which also tells the player exactly when protection ends.
    if (this.flickering) return;

    const sx = this.renderX(alpha) - cam.renderX(alpha);
    const sy = this.renderY(alpha) - cam.renderY(alpha);

    drawPlayer(r, sx, sy, this);
  }
}
