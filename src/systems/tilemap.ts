/**
 * tilemap.ts — tile queries and tile rendering.
 *
 * Queries are deliberately total: asking about a tile outside the grid returns
 * something sensible rather than undefined. Off the left and right edges is
 * solid (the world has walls, so a player can never run out of the level), and
 * above and below is empty (so ceilings are open sky and pits are bottomless).
 */

import { Renderer } from '../core/renderer';
import { PAL } from '../core/palette';
import { SCREEN_H, SCREEN_W, TILE } from '../tuning';
import type { LevelData } from '../levels/types';
import { TILE_ID, isOneWay, isSolid, isStandable } from '../levels/tiles';

/** Cheap deterministic hash, so tile texture never shimmers as it scrolls. */
function hash2(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export class Tilemap {
  readonly level: LevelData;
  readonly cols: number;
  readonly rows: number;
  readonly widthPx: number;
  readonly heightPx: number;

  constructor(level: LevelData) {
    this.level = level;
    this.cols = level.cols;
    this.rows = level.rows;
    this.widthPx = level.cols * TILE;
    this.heightPx = level.rows * TILE;
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  tileAt(col: number, row: number): number {
    if (col < 0 || col >= this.cols) return TILE_ID.SOLID; // level edges are walls
    if (row < 0 || row >= this.rows) return TILE_ID.EMPTY; // open sky, bottomless pits
    return this.level.tiles[row * this.cols + col];
  }

  tileAtPixel(x: number, y: number): number {
    return this.tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  isSolidAt(col: number, row: number): boolean {
    return isSolid(this.tileAt(col, row));
  }

  isOneWayAt(col: number, row: number): boolean {
    return isOneWay(this.tileAt(col, row));
  }

  isStandableAt(col: number, row: number): boolean {
    return isStandable(this.tileAt(col, row));
  }

  /** True if any solid tile overlaps the given world-space box. */
  boxHitsSolid(x: number, y: number, w: number, h: number): boolean {
    const c0 = Math.floor(x / TILE);
    const c1 = Math.floor((x + w - 1) / TILE);
    const r0 = Math.floor(y / TILE);
    const r1 = Math.floor((y + h - 1) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.isSolidAt(c, r)) return true;
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  draw(r: Renderer, camX: number, camY: number): void {
    const c0 = Math.max(0, Math.floor(camX / TILE));
    const c1 = Math.min(this.cols - 1, Math.floor((camX + SCREEN_W) / TILE));
    const r0 = Math.max(0, Math.floor(camY / TILE));
    const r1 = Math.min(this.rows - 1, Math.floor((camY + SCREEN_H) / TILE));

    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const id = this.tileAt(col, row);
        if (id === TILE_ID.EMPTY) continue;
        const sx = col * TILE - camX;
        const sy = row * TILE - camY;

        switch (id) {
          case TILE_ID.SOLID:
            this.drawDirt(r, sx, sy, col, row);
            break;
          case TILE_ID.ROCK:
            this.drawRock(r, sx, sy, col, row);
            break;
          case TILE_ID.ONEWAY:
            this.drawPlatform(r, sx, sy);
            break;
          case TILE_ID.BRIDGE:
            this.drawBridge(r, sx, sy, col);
            break;
          default:
            break;
        }
      }
    }
  }

  private drawDirt(r: Renderer, sx: number, sy: number, col: number, row: number): void {
    r.fillRect(sx, sy, TILE, TILE, PAL.brown1);

    // Grass cap wherever the tile above is open.
    if (!isStandable(this.tileAt(col, row - 1))) {
      r.fillRect(sx, sy, TILE, 3, PAL.green2);
      r.hline(sx, sy + 3, TILE, PAL.green1);
      // Ragged blades so the seam is not a ruler-straight line.
      for (let i = 0; i < TILE; i += 2) {
        if (hash2(col * 16 + i, row) > 0.5) r.px(sx + i, sy + 3, PAL.green2);
        else r.px(sx + i, sy + 4, PAL.green1);
      }
    }

    // Sparse grit, fixed per world position.
    for (let i = 0; i < 5; i++) {
      const h = hash2(col * 32 + i, row * 7 + i);
      const px = sx + Math.floor(h * TILE);
      const py = sy + 5 + Math.floor(hash2(row * 13 + i, col * 5) * (TILE - 6));
      r.px(px, py, h > 0.6 ? PAL.brown2 : PAL.brown0);
    }

    // Shade the right and bottom edges where they face open space.
    if (!isSolid(this.tileAt(col + 1, row))) r.vline(sx + TILE - 1, sy, TILE, PAL.brown0);
    if (!isSolid(this.tileAt(col, row + 1))) r.hline(sx, sy + TILE - 1, TILE, PAL.brown0);
  }

  private drawRock(r: Renderer, sx: number, sy: number, col: number, row: number): void {
    r.fillRect(sx, sy, TILE, TILE, PAL.grey1);
    // Blocky masonry: alternate the seam offset per row.
    const off = row % 2 === 0 ? 0 : 8;
    r.vline(sx + ((off + 8) % TILE), sy, TILE, PAL.grey0);
    r.hline(sx, sy, TILE, PAL.grey0);
    for (let i = 0; i < 3; i++) {
      const h = hash2(col * 11 + i, row * 17);
      r.px(sx + Math.floor(h * TILE), sy + 2 + Math.floor(hash2(i, col + row) * (TILE - 4)), PAL.grey2);
    }
    if (!isSolid(this.tileAt(col, row + 1))) r.hline(sx, sy + TILE - 1, TILE, PAL.grey0);
  }

  private drawPlatform(r: Renderer, sx: number, sy: number): void {
    // Thin girder: the visual sits at the top of the tile, which is exactly
    // where the collision surface is, so what you see is what you land on.
    r.fillRect(sx, sy, TILE, 5, PAL.brown2);
    r.hline(sx, sy, TILE, PAL.brown3);
    r.hline(sx, sy + 4, TILE, PAL.brown0);
    r.px(sx + 3, sy + 2, PAL.brown0);
    r.px(sx + 11, sy + 2, PAL.brown0);
  }

  private drawBridge(r: Renderer, sx: number, sy: number, col: number): void {
    r.fillRect(sx, sy, TILE, 4, PAL.brown2);
    r.hline(sx, sy + 3, TILE, PAL.brown0);
    for (let i = 1; i < TILE; i += 4) r.vline(sx + i, sy, 3, PAL.brown0);
    // Rope hangers on alternating tiles.
    if (col % 2 === 0) r.vline(sx + 8, sy + 4, 3, PAL.brown0);
  }
}
