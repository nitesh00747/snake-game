/**
 * playground.ts — the step-2 movement test level.
 *
 * Not a real stage: a 4-screen obstacle course where every movement rule has a
 * place to prove itself, left to right.
 *
 *   cols  0-7    flat ground — run, turn, tap-jump vs held-jump
 *   cols  8-12   single-tile stairs — each step needs a jump, none can be walked
 *   cols 14-18   a 16px slot with solid rock above: passable prone, not standing
 *   cols 20-23   bottomless pit
 *   cols 25-31   one-way platforms at two heights — jump up through them
 *   cols 33-36   a one-way bridge spanning a pit — drop through it to die
 *   cols 40-41   a two-tile block — running into it must stop you dead
 *   cols 44-46   pit
 *   cols 50-57   three stacked one-ways — drop-through chained downward
 *   cols 60-62   a low ceiling to bonk your head on
 *
 * Legend: '.' empty  '#' solid  '=' one-way  'R' rock  'B' bridge
 */

import { PAL } from '../core/palette';
import { TILE } from '../tuning';
import { compileLevel, type LevelData, type SpawnEntry } from './types';

/**
 * Spawn table. `at` is the camera X that arms the entry; the enemy appears at
 * its own x/y, which is normally just off the right edge of that view so it
 * walks into frame rather than popping into the middle of it.
 *
 * Positions are written in tiles and converted, because "column 24, standing on
 * row 12" is checkable against the ASCII map above and "x: 384" is not.
 */
const T = TILE;
const onGround = (col: number, row: number) => ({ x: col * T + T / 2, y: row * T });

const SPAWNS: SpawnEntry[] = [
  // Two soldiers holding the top of the stairs. Cols 11-19 are solid from row
  // 9 down, so row 9 is the surface there — placing them on row 12 like the
  // flat ground would bury them inside the hillside.
  { at: 0, type: 'soldier', ...onGround(13, 9), opts: { facing: 'left' } },
  // Col 18 sits under the rock overhang, where a 20px soldier does not fit at
  // all — the slot is 16px, which is why the player has to crawl through it.
  { at: 40, type: 'soldier', ...onGround(11, 9), opts: { facing: 'left' } },

  // A turret overlooking the stairs, forcing the climb under fire.
  { at: 60, type: 'turret', ...onGround(19, 9) },

  // Waiting on the far side of the first pit.
  { at: 200, type: 'soldier', ...onGround(26, 12), opts: { facing: 'left' } },
  { at: 240, type: 'soldier', ...onGround(31, 12), opts: { facing: 'left' } },

  // Guarding the one-way bridge over the second pit.
  { at: 380, type: 'turret', ...onGround(30, 8) },
  { at: 440, type: 'soldier', ...onGround(39, 12), opts: { facing: 'left' } },

  // The block at cols 40-41, with a soldier using it as cover.
  { at: 520, type: 'soldier', ...onGround(43, 12), opts: { facing: 'left' } },
  { at: 560, type: 'turret', ...onGround(47, 12) },

  // The stacked platforms: one soldier below, one up top.
  { at: 640, type: 'soldier', ...onGround(50, 12), opts: { facing: 'left' } },
  { at: 660, type: 'soldier', ...onGround(55, 10), opts: { facing: 'left' } },
  { at: 700, type: 'soldier', ...onGround(58, 12), opts: { facing: 'left' } },

  // Last stand under the low ceiling.
  { at: 760, type: 'turret', ...onGround(60, 12) },
  { at: 780, type: 'soldier', ...onGround(63, 12), opts: { facing: 'left' } },
];

// Platform spacing is a gameplay constraint, not decoration: a held jump peaks
// at 2.5 tiles, so nothing climbable is ever more than 2 tiles above its
// approach. The first draft had three-tile gaps and was quietly impossible.
// prettier-ignore
const ROWS = [
  '..............RRRRR.............................................', //  0
  '..............RRRRR.............................................', //  1
  '..............RRRRR.............................................', //  2
  '..............RRRRR.............................................', //  3
  '..............RRRRR.............................................', //  4
  '..............RRRRR.............................................', //  5
  '..............RRRRR...............................====..........', //  6
  '..............RRRRR.............................................', //  7
  '.............................===....................======..###.', //  8
  '...........#########........................................###.', //  9
  '.........###########.....====....====.............======........', // 10
  '........############....................##......................', // 11
  '####################....#########....#######...#################', // 12
  '####################....#########....#######...#################', // 13
];

export const PLAYGROUND: LevelData = compileLevel(
  {
    id: 'playground',
    name: 'MOVEMENT TEST',
    kind: 'horizontal',
    rows: ROWS,
    // Feet on the floor of the flat opening stretch.
    spawnTile: { col: 2, row: 11 },
    spawns: SPAWNS,
    skyBands: [PAL.sky0, PAL.sky1, PAL.sky2, PAL.sky3],
  },
  TILE,
);
