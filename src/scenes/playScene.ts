/**
 * playScene.ts — the playable scene: level, camera, player, enemies.
 *
 * Step 4 scope: the stage can now kill you and you can now clear it. Collision
 * is resolved in a fixed order every tick — player shots first, then threats
 * against the player — so a bullet and the soldier that fired it can never
 * trade in a way that depends on list order.
 */

import { Camera } from '../core/camera';
import { PAL } from '../core/palette';
import type { Renderer } from '../core/renderer';
import { debug } from '../core/debug';
import { Input } from '../systems/input';
import { Tilemap } from '../systems/tilemap';
import { Spawner } from '../systems/spawner';
import { Player } from '../entities/player';
import { BulletPool } from '../entities/bullet';
import { Enemy, type EnemyContext } from '../entities/enemy';
import { SKIN_P1 } from '../entities/playerSprite';
import { AIM_NAME } from '../entities/aim';
import { overlaps } from '../entities/entity';
import { PLAYGROUND } from '../levels/playground';
import {
  CAMERA_ANCHOR_X,
  CONTINUE_SECONDS,
  EXPLOSION_FRAMES,
  RIFLE_MAX_ONSCREEN,
  SCREEN_H,
  SCREEN_W,
  TICK_HZ,
  TILE,
} from '../tuning';

interface Explosion {
  x: number;
  y: number;
  t: number;
  big: boolean;
}

export class PlayScene {
  readonly camera = new Camera();
  readonly input = new Input();
  readonly map = new Tilemap(PLAYGROUND);
  readonly bullets: BulletPool;
  readonly player: Player;
  readonly enemies: Enemy[] = [];
  readonly spawner: Spawner;

  private readonly explosions: Explosion[] = [];

  /** Set when the last life is gone; cleared by a continue. */
  gameOver = false;
  private continueTimer = 0;
  continuesUsed = 0;

  /** Diagnostics. */
  kills = 0;

  constructor() {
    this.bullets = new BulletPool(this.map);
    this.player = new Player(0, this.input.p1, this.map, SKIN_P1, this.bullets);
    this.player.spawnAt(this.map.level.spawnX, this.map.level.spawnY);

    const ctx: EnemyContext = {
      map: this.map,
      bullets: this.bullets,
      // Enemies ask for a target rather than holding a player reference, so a
      // dead player is simply not a target and co-op can return the nearest.
      target: () => (this.player.alive ? { x: this.player.centerX, y: this.player.centerY } : null),
    };
    this.spawner = new Spawner(this.map.level, ctx);

    this.camera.setBounds(0, 0, this.map.widthPx, this.map.heightPx);
    this.camera.snapTo(this.player.centerX - CAMERA_ANCHOR_X, 0);
  }

  get entityCount(): number {
    return 1 + this.enemies.length + this.bullets.activeCount + this.explosions.length;
  }

  // -------------------------------------------------------------------------

  update(): void {
    this.input.update();

    if (this.gameOver) {
      this.updateGameOver();
      return;
    }

    this.camera.beginTick();

    this.player.update();
    this.spawner.update(this.camera, this.enemies);

    for (const e of this.enemies) e.update();
    this.bullets.update(this.camera);

    this.resolveCollisions();
    this.cullEnemies();
    this.updateExplosions();

    // The camera only follows a living player; during the death arc it holds
    // position so the respawn point stays where the player expects it.
    if (this.player.alive) {
      this.camera.followTo(this.player.centerX - CAMERA_ANCHOR_X, 0);
    }

    if (this.player.outOfLives) {
      this.gameOver = true;
      this.continueTimer = CONTINUE_SECONDS * TICK_HZ;
    }
  }

  /**
   * Order matters and is fixed: your shots land before anything is allowed to
   * kill you. A soldier you shot on the same tick it touched you dies, and you
   * live — the generous reading, and the one an arcade player expects.
   */
  private resolveCollisions(): void {
    // 1. Player bullets vs enemies.
    for (const b of this.bullets.items) {
      if (!b.active || b.spark > 0 || b.team !== 'player') continue;
      for (const e of this.enemies) {
        if (e.dead || !overlaps(b, e)) continue;
        const fatal = e.takeHit();
        if (fatal) {
          this.kills++;
          this.explode(e.centerX, e.centerY, e.w > 12);
        }
        b.impact();
        break;
      }
    }

    if (!this.player.alive || this.player.invuln > 0) return;

    // 2. Enemy bullets vs the player.
    for (const b of this.bullets.items) {
      if (!b.active || b.spark > 0 || b.team !== 'enemy') continue;
      if (overlaps(b, this.player)) {
        b.impact();
        this.killPlayer();
        return;
      }
    }

    // 3. Bodily contact.
    for (const e of this.enemies) {
      if (!e.dead && overlaps(e, this.player)) {
        this.killPlayer();
        return;
      }
    }
  }

  private killPlayer(): void {
    this.player.kill();
    this.explode(this.player.centerX, this.player.centerY, false);
  }

  private cullEnemies(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead || Spawner.isOffStage(e, this.camera)) this.enemies.splice(i, 1);
    }
  }

  private explode(x: number, y: number, big: boolean): void {
    this.explosions.push({ x, y, t: EXPLOSION_FRAMES, big });
  }

  private updateExplosions(): void {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      if (--this.explosions[i].t <= 0) this.explosions.splice(i, 1);
    }
  }

  private updateGameOver(): void {
    if (this.continueTimer > 0) this.continueTimer--;

    // Fire accepts the continue; the countdown running out ends the run.
    if (this.input.p1.firePressed && this.continueTimer > 0) {
      this.continuesUsed++;
      this.gameOver = false;
      this.player.restoreLives();
      this.player.respawn(this.camera.x);
      this.bullets.reset();
      this.enemies.length = 0;
      this.explosions.length = 0;
    }
  }

  // -------------------------------------------------------------------------

  draw(r: Renderer, alpha: number): void {
    const camX = this.camera.renderX(alpha);
    const camY = this.camera.renderY(alpha);

    this.drawBackdrop(r, camX);
    this.map.draw(r, camX, camY);

    for (const e of this.enemies) e.draw(r, this.camera, alpha);
    this.player.draw(r, this.camera, alpha);
    this.bullets.draw(r, this.camera, alpha);
    this.drawExplosions(r, camX, camY);

    if (debug.showHitboxes) this.drawHitboxes(r, camX, camY, alpha);
    this.drawHud(r);
    if (this.gameOver) this.drawGameOver(r);
  }

  private drawBackdrop(r: Renderer, camX: number): void {
    const bands = this.map.level.skyBands;
    const bandH = Math.ceil(SCREEN_H / bands.length);
    for (let i = 0; i < bands.length; i++) r.fillRect(0, i * bandH, SCREEN_W, bandH, bands[i]);

    // Distant ridge at 1/4 speed, taking the sky's colour for aerial depth.
    const horizon = SCREEN_H - TILE * 3;
    const farOff = Math.round(camX * 0.25);
    for (let i = -1; i < 12; i++) {
      const bx = i * 48 - (farOff % 48);
      for (let px = 0; px < 48; px++) {
        const colH = 10 + Math.round(Math.sin((px / 48) * Math.PI) * 22);
        r.fillRect(bx + px, horizon - colH, 1, colH + 48, PAL.sky0);
      }
    }

    // Treeline at 1/2 speed.
    const midOff = Math.round(camX * 0.5);
    for (let i = -1; i < 18; i++) {
      const bx = i * 24 - (midOff % 24);
      r.fillRect(bx + 10, horizon - 14, 3, 20, PAL.brown0);
      for (let row = 0; row < 5; row++) {
        const w = 18 - row * 3;
        r.fillRect(bx + 11 - (w >> 1), horizon - 26 + row * 3, w, 3, PAL.green0);
      }
    }
  }

  private drawExplosions(r: Renderer, camX: number, camY: number): void {
    for (const ex of this.explosions) {
      const x = Math.round(ex.x) - camX;
      const y = Math.round(ex.y) - camY;
      const t = 1 - ex.t / EXPLOSION_FRAMES;
      const radius = (ex.big ? 14 : 9) * t;

      // An expanding ring that cools from white through yellow to red.
      const color = t < 0.3 ? PAL.white : t < 0.6 ? PAL.yellow : PAL.red2;
      r.circleOutline(x, y, Math.max(1, radius), color);
      if (t < 0.5) r.circle(x, y, Math.max(1, radius * 0.6), PAL.orange);
    }
  }

  private drawHitboxes(r: Renderer, camX: number, camY: number, alpha: number): void {
    const p = this.player;

    for (let row = 0; row < this.map.rows; row++) {
      for (let col = Math.floor(p.x / TILE) - 1; col <= Math.floor((p.x + p.w) / TILE) + 1; col++) {
        if (!this.map.isStandableAt(col, row)) continue;
        const color = this.map.isOneWayAt(col, row) ? PAL.cyan : PAL.yellow;
        r.strokeRect(col * TILE - camX, row * TILE - camY, TILE, TILE, color);
      }
    }

    r.strokeRect(p.renderX(alpha) - camX, p.renderY(alpha) - camY, p.w, p.h, PAL.hitbox);
    for (const e of this.enemies) {
      r.strokeRect(e.renderX(alpha) - camX, e.renderY(alpha) - camY, e.w, e.h, PAL.red2);
      if (e.telegraph > 0) r.text('!', e.centerX - camX, e.y - camY - 8, PAL.white);
    }
    for (const b of this.bullets.items) {
      if (b.active) r.strokeRect(b.x - camX, b.y - camY, b.w, b.h, PAL.cyan);
    }

    const mx = Math.round(p.muzzleX) - camX;
    const my = Math.round(p.muzzleY) - camY;
    r.hline(mx - 2, my, 5, PAL.white);
    r.vline(mx, my - 2, 5, PAL.white);
  }

  private drawHud(r: Renderer): void {
    // Lives as pips: readable at a glance without parsing a number.
    r.text('LIVES', 4, 4, PAL.grey4, { shadow: PAL.black });
    for (let i = 0; i < Math.max(0, this.player.lives); i++) {
      const x = 26 + i * 6;
      r.fillRect(x, 4, 4, 5, PAL.red2);
      r.px(x + 1, 4, PAL.grey4);
    }

    r.text(`KILLS ${this.kills}`, SCREEN_W - 4, 4, PAL.grey4, {
      align: 'right',
      shadow: PAL.black,
    });
    r.text('ARROWS AIM  Z FIRE  X JUMP  DOWN PRONE', 4, SCREEN_H - 9, PAL.grey4, {
      shadow: PAL.black,
    });
  }

  private drawGameOver(r: Renderer): void {
    const seconds = Math.ceil(this.continueTimer / TICK_HZ);
    r.fillRect(48, 84, SCREEN_W - 96, 46, PAL.black);
    r.strokeRect(48, 84, SCREEN_W - 96, 46, PAL.red2);
    r.text('GAME OVER', SCREEN_W / 2, 92, PAL.red2, { align: 'center' });

    if (seconds > 0) {
      r.text('PRESS Z TO CONTINUE', SCREEN_W / 2, 106, PAL.white, { align: 'center' });
      r.text(`${seconds}`, SCREEN_W / 2, 118, PAL.yellow, { align: 'center' });
    } else {
      r.text('OUT OF CREDITS', SCREEN_W / 2, 110, PAL.grey3, { align: 'center' });
    }
  }

  // -------------------------------------------------------------------------

  /** Lines contributed to the F1 overlay. */
  debugLines(): string[] {
    const p = this.player;
    const t = p.telemetry;
    return [
      `CAM X${this.camera.x.toFixed(1)}`,
      `POS ${p.x.toFixed(1)} ${p.y.toFixed(1)} BOX ${p.w}X${p.h}`,
      `STATE ${p.state.toUpperCase()} AIM ${AIM_NAME[p.aim]} ${p.facing > 0 ? 'R' : 'L'}`,
      `GND ${p.onGround ? 'Y' : 'N'} INV ${p.invuln}`,
      `JUMP APEX ${t.lastApex.toFixed(1)}PX AIR ${t.lastAirtime}F`,
      `LIVES ${p.lives} DEATHS ${p.deaths} CONT ${this.continuesUsed}`,
      `ENEMIES ${this.enemies.length} PEND ${this.spawner.pending} KILLS ${this.kills}`,
      `SHOTS ${p.shotsFired} LIVE ${this.bullets.countFor(0)}/${RIFLE_MAX_ONSCREEN}`,
      `POOL ${this.bullets.activeCount}/${this.bullets.capacity} OVF ${this.bullets.overflow}`,
    ];
  }
}
