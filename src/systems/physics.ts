/**
 * physics.ts — AABB movement against a tilemap.
 *
 * Axis-separated resolution: move on X and resolve, then move on Y and resolve.
 * Doing both at once is what produces the classic "catches on a seam while
 * running along a flat floor" bug, because a body straddling two tiles looks
 * like it is colliding with the side of the second one.
 *
 * Movement is sub-stepped so nothing can tunnel through a tile in a single
 * tick, which matters more later for fast bullets than it does for the player.
 *
 * One-way platforms use the previous-frame bottom edge rather than velocity
 * alone: a body only lands on one if its feet were above the platform's top
 * surface before the move. That is what lets you jump up through a platform and
 * still land on it on the way down.
 */

import { TILE } from '../tuning';
import type { Tilemap } from './tilemap';
import { isOneWay, isSolid } from '../levels/tiles';

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** While > 0, one-way platforms are ignored (drop-through). */
  dropThrough: number;
}

export interface CollisionResult {
  hitLeft: boolean;
  hitRight: boolean;
  hitCeiling: boolean;
  hitGround: boolean;
  /** Tile id the body is standing on, if any. */
  groundTile: number;
  /** True when the supporting surface was a one-way platform. */
  onOneWay: boolean;
}

function blankResult(): CollisionResult {
  return {
    hitLeft: false,
    hitRight: false,
    hitCeiling: false,
    hitGround: false,
    groundTile: 0,
    onOneWay: false,
  };
}

/** Largest step we will take before re-testing collision. */
const MAX_STEP = TILE - 2;

export function moveBody(body: Body, map: Tilemap): CollisionResult {
  const res = blankResult();

  if (body.dropThrough > 0) body.dropThrough--;

  const prevBottom = body.y + body.h;

  // --- X ---------------------------------------------------------------
  let remaining = body.vx;
  while (Math.abs(remaining) > 0.0001) {
    const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, remaining));
    remaining -= step;
    body.x += step;
    if (resolveX(body, map, step, res)) break;
  }

  // --- Y ---------------------------------------------------------------
  remaining = body.vy;
  while (Math.abs(remaining) > 0.0001) {
    const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, remaining));
    remaining -= step;
    body.y += step;
    if (resolveY(body, map, step, prevBottom, res)) break;
  }

  body.onGround = res.hitGround;
  return res;
}

function resolveX(body: Body, map: Tilemap, step: number, res: CollisionResult): boolean {
  if (step === 0) return false;

  const top = body.y;
  const bottom = body.y + body.h - 1;
  const r0 = Math.floor(top / TILE);
  const r1 = Math.floor(bottom / TILE);

  if (step > 0) {
    const col = Math.floor((body.x + body.w - 1) / TILE);
    for (let row = r0; row <= r1; row++) {
      if (isSolid(map.tileAt(col, row))) {
        body.x = col * TILE - body.w;
        body.vx = 0;
        res.hitRight = true;
        return true;
      }
    }
  } else {
    const col = Math.floor(body.x / TILE);
    for (let row = r0; row <= r1; row++) {
      if (isSolid(map.tileAt(col, row))) {
        body.x = (col + 1) * TILE;
        body.vx = 0;
        res.hitLeft = true;
        return true;
      }
    }
  }
  return false;
}

function resolveY(
  body: Body,
  map: Tilemap,
  step: number,
  prevBottom: number,
  res: CollisionResult,
): boolean {
  if (step === 0) return false;

  const left = body.x;
  const right = body.x + body.w - 1;
  const c0 = Math.floor(left / TILE);
  const c1 = Math.floor(right / TILE);

  if (step > 0) {
    // Falling: solid tiles always stop us, one-ways only if we came from above.
    //
    // The row tested is the one the FEET are entering, floor(bottom / TILE) —
    // not floor((bottom - 1) / TILE), which is the last row the body's interior
    // occupies. Using the interior row here means a body resting exactly on a
    // tile boundary tests the empty tile it is standing in rather than the
    // floor it is standing on, so it reports "not grounded" for one tick, falls
    // a fraction of a pixel, re-lands, and flickers between grounded and
    // airborne forever. Stances that require footing then work only half the
    // time, which is exactly what the prone and one-way tests caught.
    const bottom = body.y + body.h;
    const row = Math.floor(bottom / TILE);
    for (let col = c0; col <= c1; col++) {
      const id = map.tileAt(col, row);
      const surface = row * TILE;

      const blocking =
        isSolid(id) || (isOneWay(id) && body.dropThrough <= 0 && prevBottom <= surface + 0.001);

      if (blocking) {
        body.y = surface - body.h;
        body.vy = 0;
        res.hitGround = true;
        res.groundTile = id;
        res.onOneWay = isOneWay(id);
        return true;
      }
    }
  } else {
    const row = Math.floor(body.y / TILE);
    for (let col = c0; col <= c1; col++) {
      // Heads pass straight through one-ways; only solids stop a rise.
      if (isSolid(map.tileAt(col, row))) {
        body.y = (row + 1) * TILE;
        body.vy = 0;
        res.hitCeiling = true;
        return true;
      }
    }
  }
  return false;
}

/**
 * Is there support directly under the body? Used for coyote time and for
 * deciding whether a drop-through is possible, without moving anything.
 */
export function probeGround(
  body: Body,
  map: Tilemap,
): { grounded: boolean; oneWay: boolean; solid: boolean } {
  const bottom = body.y + body.h;
  const row = Math.floor(bottom / TILE);
  const c0 = Math.floor(body.x / TILE);
  const c1 = Math.floor((body.x + body.w - 1) / TILE);

  // Only counts as support if the feet are level with the tile's top edge.
  const atSurface = Math.abs(bottom - row * TILE) < 0.5;
  if (!atSurface) return { grounded: false, oneWay: false, solid: false };

  let oneWay = false;
  let solid = false;
  for (let col = c0; col <= c1; col++) {
    const id = map.tileAt(col, row);
    if (isSolid(id)) solid = true;
    else if (isOneWay(id)) oneWay = true;
  }
  return { grounded: solid || oneWay, oneWay, solid };
}

/** True if the body could occupy a taller box without clipping into geometry. */
export function hasHeadroom(body: Body, map: Tilemap, newHeight: number): boolean {
  if (newHeight <= body.h) return true;
  const grow = newHeight - body.h;
  return !map.boxHitsSolid(body.x, body.y - grow, body.w, grow);
}
