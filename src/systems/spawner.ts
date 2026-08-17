/**
 * spawner.ts — turns a level's spawn table into live enemies.
 *
 * Entries are keyed to camera position and the table is pre-sorted, so arming
 * is a single moving cursor rather than a scan: O(entries spawned), not
 * O(entries) per tick.
 *
 * Two rules that matter for how the stage plays:
 *
 *  - An entry fires once and never again. Backtracking is impossible in a
 *    forward-scrolling stage anyway, but a player who dies and respawns must
 *    not walk into a re-armed ambush they already cleared.
 *
 *  - Enemies are despawned once they fall far enough behind the camera. They
 *    are gone, not paused: an off-screen soldier that keeps running would
 *    accumulate somewhere pointless and still cost a physics step.
 */

import type { Camera } from '../core/camera';
import type { LevelData, SpawnEntry } from '../levels/types';
import { Enemy, Soldier, Turret, type EnemyContext } from '../entities/enemy';
import { ENEMY_DESPAWN_MARGIN, SCREEN_W } from '../tuning';

export class Spawner {
  private readonly table: SpawnEntry[];
  private readonly ctx: EnemyContext;
  private readonly vertical: boolean;

  /** Index of the next entry that has not been armed yet. */
  private cursor = 0;
  /** Sequence number handed to each enemy, to de-synchronise their timers. */
  private phase = 0;

  /** Diagnostics for the debug overlay. */
  spawnedTotal = 0;

  constructor(level: LevelData, ctx: EnemyContext) {
    this.table = level.spawns;
    this.ctx = ctx;
    this.vertical = level.kind === 'vertical';
  }

  /** Entries still waiting to be armed. */
  get pending(): number {
    return this.table.length - this.cursor;
  }

  /** Rewind to the start — used when a continue restarts the stage. */
  reset(): void {
    this.cursor = 0;
    this.phase = 0;
    this.spawnedTotal = 0;
  }

  /**
   * Arm every entry the camera has reached. `out` is appended to rather than
   * returned, so no array is allocated on a tick where nothing spawns.
   */
  update(cam: Camera, out: Enemy[]): void {
    // The trigger is the leading edge of the view: enemies appear as their
    // position scrolls into sight, not when the camera's origin passes them.
    const front = this.vertical ? cam.y : cam.x + SCREEN_W;

    while (this.cursor < this.table.length && this.table[this.cursor].at <= front) {
      const entry = this.table[this.cursor++];
      const enemy = this.build(entry);
      if (enemy) {
        out.push(enemy);
        this.spawnedTotal++;
      }
    }
  }

  private build(entry: SpawnEntry): Enemy | null {
    const facing: 1 | -1 = entry.opts?.facing === 'right' ? 1 : -1;
    const phase = this.phase++;

    switch (entry.type) {
      case 'soldier':
        return new Soldier(this.ctx, entry.x, entry.y, facing, phase);
      case 'turret':
        return new Turret(this.ctx, entry.x, entry.y, phase);
      default:
        // An unknown type is a typo in level data, not a runtime condition to
        // survive quietly.
        throw new Error(`spawner: unknown enemy type "${entry.type}"`);
    }
  }

  /** True once an enemy is far enough behind the camera to be forgotten. */
  static isOffStage(e: Enemy, cam: Camera, vertical = false): boolean {
    if (vertical) return e.y > cam.y + 224 + ENEMY_DESPAWN_MARGIN;
    return e.x + e.w < cam.x - ENEMY_DESPAWN_MARGIN;
  }
}
