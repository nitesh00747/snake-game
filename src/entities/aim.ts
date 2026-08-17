/**
 * aim.ts — the 8-direction aiming vocabulary and the rules that pick one.
 *
 * The aiming rules ARE the character. Two buttons and a d-pad have to express
 * eight firing angles, and the trick the genre uses is that stance disambiguates
 * the d-pad: down means "go prone" with your feet on the floor and "shoot at
 * the ground" in mid-air, so the same input never means two things at once.
 */

export const AIM = {
  E: 0,
  NE: 1,
  N: 2,
  NW: 3,
  W: 4,
  SW: 5,
  S: 6,
  SE: 7,
} as const;

export type AimDir = (typeof AIM)[keyof typeof AIM];

const D = Math.SQRT1_2; // 0.7071, so diagonal shots are not faster than straight ones

/** Unit vectors, indexed by AimDir. Screen space: +y is down. */
export const AIM_VEC: ReadonlyArray<{ x: number; y: number }> = [
  { x: 1, y: 0 }, // E
  { x: D, y: -D }, // NE
  { x: 0, y: -1 }, // N
  { x: -D, y: -D }, // NW
  { x: -1, y: 0 }, // W
  { x: -D, y: D }, // SW
  { x: 0, y: 1 }, // S
  { x: D, y: D }, // SE
];

export const AIM_NAME: ReadonlyArray<string> = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];

export interface AimInputs {
  facing: 1 | -1;
  up: boolean;
  down: boolean;
  /** True when a horizontal direction is held, regardless of movement. */
  horizontal: boolean;
  grounded: boolean;
  prone: boolean;
}

/**
 * Resolve the firing direction from stance and d-pad.
 *
 *   prone        -> horizontal only (that is what makes it useful: shoot along
 *                   the floor at things a standing shot flies over)
 *   on the floor -> horizontal, diagonal-up, or straight up. Never downward:
 *                   down is spoken for by the prone stance.
 *   in the air   -> all eight, including straight down.
 */
export function resolveAim(i: AimInputs): AimDir {
  const forward: AimDir = i.facing === 1 ? AIM.E : AIM.W;

  if (i.prone) return forward;

  if (i.up) {
    if (i.horizontal) return i.facing === 1 ? AIM.NE : AIM.NW;
    return AIM.N;
  }

  if (i.down && !i.grounded) {
    if (i.horizontal) return i.facing === 1 ? AIM.SE : AIM.SW;
    return AIM.S;
  }

  return forward;
}
