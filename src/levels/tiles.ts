/**
 * tiles.ts — tile vocabulary shared by every level.
 *
 * Levels are authored as ASCII art (see playground.ts) because a wall you can
 * see in the source is a wall you can edit without a tool. This module owns the
 * character legend and the collision flags each tile carries.
 */

export const TILE_ID = {
  EMPTY: 0,
  SOLID: 1,
  /** Passable from below and from the sides; lands on only from above. */
  ONEWAY: 2,
  /** Solid, but visually a bridge — collapses in level 1 (step 5). */
  BRIDGE: 3,
  /** Solid decorative rock face, drawn differently from dirt. */
  ROCK: 4,
} as const;

export type TileId = (typeof TILE_ID)[keyof typeof TILE_ID];

export const ASCII_LEGEND: Record<string, number> = {
  '.': TILE_ID.EMPTY,
  ' ': TILE_ID.EMPTY,
  '#': TILE_ID.SOLID,
  '=': TILE_ID.ONEWAY,
  'B': TILE_ID.BRIDGE,
  'R': TILE_ID.ROCK,
};

const SOLID_SET = new Set<number>([TILE_ID.SOLID, TILE_ID.BRIDGE, TILE_ID.ROCK]);

/** Blocks movement from every direction. */
export function isSolid(id: number): boolean {
  return SOLID_SET.has(id);
}

/** Blocks only a downward crossing of its top edge. */
export function isOneWay(id: number): boolean {
  return id === TILE_ID.ONEWAY;
}

/** Anything the player can stand on. */
export function isStandable(id: number): boolean {
  return isSolid(id) || isOneWay(id);
}
