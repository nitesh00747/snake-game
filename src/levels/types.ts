/**
 * types.ts — the level data contract.
 *
 * A level is data, not code: a tile grid plus a spawn table keyed to camera
 * position. Adding a level means adding a file in this folder, never a new
 * class. The spawn table is declared here now (unused until step 4) so level
 * files written today do not need reshaping later.
 */

import { ASCII_LEGEND } from './tiles';

export type LevelKind = 'horizontal' | 'vertical' | 'corridor';

export interface SpawnEntry {
  /** Camera position that arms this entry: X for horizontal, Y for vertical. */
  at: number;
  /** Enemy type key, resolved by the spawner in step 4. */
  type: string;
  /** World position to spawn at. */
  x: number;
  y: number;
  /** Optional per-type parameters (facing, patrol range, fire cadence...). */
  opts?: Record<string, number | string | boolean>;
}

export interface LevelData {
  id: string;
  name: string;
  kind: LevelKind;

  /** Grid dimensions in tiles. */
  cols: number;
  rows: number;
  /** Row-major tile ids, length cols * rows. */
  tiles: Uint8Array;

  /** Player start, in world pixels, as the bottom-centre of the character. */
  spawnX: number;
  spawnY: number;

  /** Enemy spawn table, sorted by `at`. Empty until step 4. */
  spawns: SpawnEntry[];

  /** Background colour bands, top to bottom, for the sky gradient. */
  skyBands: string[];
}

export interface LevelSource {
  id: string;
  name: string;
  kind: LevelKind;
  /** One string per tile row, top to bottom. All rows must be equal length. */
  rows: string[];
  spawnTile: { col: number; row: number };
  spawns?: SpawnEntry[];
  skyBands: string[];
}

/**
 * Turn authored ASCII into a validated tile grid.
 *
 * Validation is strict and throws: a level with a ragged row or a typo'd glyph
 * is a bug that should surface the moment it loads, not as an invisible hole in
 * the floor three screens in.
 */
export function compileLevel(src: LevelSource, tileSize: number): LevelData {
  const rows = src.rows.length;
  if (rows === 0) throw new Error(`level ${src.id}: no rows`);

  const cols = src.rows[0].length;
  const tiles = new Uint8Array(cols * rows);

  for (let y = 0; y < rows; y++) {
    const line = src.rows[y];
    if (line.length !== cols) {
      throw new Error(
        `level ${src.id}: row ${y} is ${line.length} tiles, expected ${cols} — rows must be uniform`,
      );
    }
    for (let x = 0; x < cols; x++) {
      const ch = line[x];
      const id = ASCII_LEGEND[ch];
      if (id === undefined) {
        throw new Error(`level ${src.id}: unknown tile glyph "${ch}" at row ${y}, col ${x}`);
      }
      tiles[y * cols + x] = id;
    }
  }

  const { col, row } = src.spawnTile;
  if (col < 0 || col >= cols || row < 0 || row >= rows) {
    throw new Error(`level ${src.id}: spawn tile ${col},${row} is outside the grid`);
  }

  return {
    id: src.id,
    name: src.name,
    kind: src.kind,
    cols,
    rows,
    tiles,
    // Spawn is the bottom-centre of the spawn tile: feet on its floor.
    spawnX: col * tileSize + tileSize / 2,
    spawnY: (row + 1) * tileSize,
    spawns: (src.spawns ?? []).slice().sort((a, b) => a.at - b.at),
    skyBands: src.skyBands,
  };
}
