/**
 * movement.mjs — behavioural tests for the step-2 movement rules.
 *
 *   node tests/movement.mjs
 *
 * Drives the real Player against the real Tilemap with a synthetic input
 * snapshot, one 60Hz tick at a time. These assert *feel* as measurable numbers:
 * how high a tapped jump goes versus a held one, how long you hang, whether a
 * stance change is refused under a low ceiling.
 */

import { mirrorSource, installDomShim, check, eq, near, section, report } from './harness.mjs';

installDomShim();
const mod = mirrorSource();

const { Tilemap } = await import(mod('systems/tilemap.ts'));
const { PLAYGROUND } = await import(mod('levels/playground.ts'));
const { Player } = await import(mod('entities/player.ts'));
const { SKIN_P1 } = await import(mod('entities/playerSprite.ts'));
const { AIM, AIM_NAME } = await import(mod('entities/aim.ts'));
const T = await import(mod('tuning.ts'));

function blankInput() {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    fire: false,
    jump: false,
    firePressed: false,
    jumpPressed: false,
    jumpReleased: false,
    any: false,
  };
}

/** A world with one player, plus tick/press helpers that mimic the real edges. */
function world(spawnTileCol = 2, spawnTileRow = 11) {
  const map = new Tilemap(PLAYGROUND);
  const inp = blankInput();
  const p = new Player(0, inp, map, SKIN_P1);
  p.spawnAt(spawnTileCol * T.TILE + T.TILE / 2, (spawnTileRow + 1) * T.TILE);

  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      p.update();
      // Edge flags live for exactly one tick, as endKeyboardTick() enforces.
      inp.firePressed = false;
      inp.jumpPressed = false;
      inp.jumpReleased = false;
    }
  };

  const pressJump = () => {
    inp.jump = true;
    inp.jumpPressed = true;
  };
  const releaseJump = () => {
    inp.jump = false;
    inp.jumpReleased = true;
  };

  // Let gravity seat the character on the floor before any test begins.
  tick(20);
  return { map, inp, p, tick, pressJump, releaseJump };
}

/** Jump and report the arc. `holdTicks` = how long the button stays down. */
function measureJump(holdTicks) {
  const w = world();
  const startBottom = w.p.bottom;
  let apex = 0;
  let air = 0;

  w.pressJump();
  w.tick(1);

  for (let i = 0; i < 240; i++) {
    if (i + 1 === holdTicks) w.releaseJump();
    w.tick(1);
    apex = Math.max(apex, startBottom - w.p.bottom);
    if (w.p.onGround) break;
    air++;
  }

  if (w.inp.jump) w.releaseJump();
  return { apex, air, landedBottom: w.p.bottom, startBottom };
}

// ---------------------------------------------------------------------------
section('jump: tap versus hold');
// ---------------------------------------------------------------------------

const tap = measureJump(1);
const hold = measureJump(999);

console.log(
  `  tapped: ${tap.apex.toFixed(1)}px over ${tap.air} frames | ` +
    `held: ${hold.apex.toFixed(1)}px over ${hold.air} frames`,
);

check('holding jumps meaningfully higher than tapping', hold.apex > tap.apex * 1.4,
  `tap ${tap.apex.toFixed(1)}px vs hold ${hold.apex.toFixed(1)}px`);
check('held jump clears 2.5 tiles', hold.apex >= 38 && hold.apex <= 46,
  `${hold.apex.toFixed(1)}px, want 38-46`);
check('tapped jump is a short hop', tap.apex >= 18 && tap.apex <= 30,
  `${tap.apex.toFixed(1)}px, want 18-30`);
check('held jump hangs longer', hold.air > tap.air, `${hold.air}f vs ${tap.air}f`);
check('held airtime is arcade-brisk', hold.air >= 22 && hold.air <= 36, `${hold.air} frames`);
eq('lands back at the height it left', hold.landedBottom, hold.startBottom);

// A partial hold should land between the two extremes.
const mid = measureJump(5);
check('a 5-frame hold lands between tap and hold', mid.apex > tap.apex && mid.apex < hold.apex,
  `${mid.apex.toFixed(1)}px between ${tap.apex.toFixed(1)} and ${hold.apex.toFixed(1)}`);

// Holding the button through a landing must not re-launch on its own.
{
  const w = world();
  w.pressJump();
  w.tick(60); // still held the whole time
  check('holding through a landing does not auto-bounce', w.p.onGround);
}

// ---------------------------------------------------------------------------
section('run');
// ---------------------------------------------------------------------------
{
  const w = world();
  const x0 = w.p.x;
  w.inp.right = true;
  w.tick(10);
  near('run speed is exact and instant', w.p.x - x0, T.RUN_SPEED * 10, 0.001);
  eq('facing follows input', w.p.facing, 1);
  eq('running state', w.p.state, 'run');

  w.inp.right = false;
  w.inp.left = true;
  w.tick(1);
  eq('turning is immediate', w.p.facing, -1);

  w.inp.left = false;
  w.tick(1);
  eq('stopping is immediate', w.p.vx, 0);
  eq('back to standing', w.p.state, 'stand');
}

// ---------------------------------------------------------------------------
section('prone');
// ---------------------------------------------------------------------------
{
  const w = world();
  const feet = w.p.bottom;
  w.inp.down = true;
  w.tick(1);
  eq('prone state', w.p.state, 'prone');
  eq('hitbox shrinks', w.p.h, T.PLAYER_PRONE_H);
  eq('feet stay planted through the stance change', w.p.bottom, feet);

  w.inp.right = true;
  w.tick(5);
  eq('prone pins you in place', w.p.vx, 0);
  eq('but you can still turn to aim', w.p.facing, 1);
  eq('prone aims along the floor', w.p.aim, AIM.E);

  w.inp.down = false;
  w.inp.right = false;
  w.tick(1);
  eq('standing back up', w.p.state, 'stand');
  eq('hitbox restored', w.p.h, T.PLAYER_H);
  eq('feet still planted', w.p.bottom, feet);
}

// ---------------------------------------------------------------------------
section('the low tunnel (cols 14-18, a 16px slot)');
// ---------------------------------------------------------------------------
{
  // Floor of the slot is the top of row 9; rock fills rows 0-7 above it.
  const w = world(16, 8);
  eq('spawns inside the slot', w.p.bottom, 9 * T.TILE);

  w.inp.down = true;
  w.tick(1);
  eq('can go prone in the slot', w.p.state, 'prone');

  w.inp.down = false;
  w.tick(3);
  eq('cannot stand up under rock', w.p.state, 'prone');
  eq('still the small box', w.p.h, T.PLAYER_PRONE_H);

  // A tuck-jump is 14px and the slot is 16px, so hopping inside it is legal.
  w.pressJump();
  w.tick(2);
  eq('a tucked jump does fit', w.p.state, 'jump');
  w.releaseJump();
  w.tick(30);
  check('and it lands back prone', w.p.state === 'prone' && w.p.onGround);
}

// ---------------------------------------------------------------------------
section('one-way platforms');
// ---------------------------------------------------------------------------
{
  // Ground under the col 25-28 platform, which sits at the top of row 9.
  const w = world(26, 11);
  const platformTop = 10 * T.TILE;

  // The platform is 2 tiles up, so this needs a held jump — a tap peaks at
  // ~25px and would not clear it. That is the intended level-design contract.
  w.pressJump();
  let passedThrough = false;
  for (let i = 0; i < 20; i++) {
    w.tick(1);
    if (w.p.bottom < platformTop) passedThrough = true;
  }
  w.releaseJump();
  check('a rising jump passes up through a platform', passedThrough);

  // Coming back down, it catches you.
  for (let i = 0; i < 60 && !w.p.onGround; i++) w.tick(1);
  check('and catches you on the way down', w.p.onGround);
  eq('landing exactly on its surface', w.p.bottom, platformTop);

  // Drop-through: prone, then jump.
  w.inp.down = true;
  w.tick(1);
  eq('prone on the platform', w.p.state, 'prone');
  w.pressJump();
  w.tick(1);
  w.releaseJump();
  w.inp.down = false;
  check('drop-through armed', w.p.dropThrough > 0);
  for (let i = 0; i < 60 && !w.p.onGround; i++) w.tick(1);
  check('fell to the floor below', w.p.bottom > platformTop, `bottom ${w.p.bottom}`);
  eq('landed on the ground', w.p.bottom, 12 * T.TILE);
}

// ---------------------------------------------------------------------------
section('walls, ceilings, pits');
// ---------------------------------------------------------------------------
{
  // The two-tile block at cols 40-41.
  const w = world(38, 11);
  w.inp.right = true;
  w.tick(60);
  check('running into a wall stops you dead', w.p.right <= 40 * T.TILE + 0.001,
    `right edge ${w.p.right}, wall at ${40 * T.TILE}`);

  // Ceiling bonk under the slab at cols 60-62 (its underside is row 9's top).
  const c = world(61, 11);
  c.pressJump();
  c.tick(1);
  let bonked = false;
  for (let i = 0; i < 30; i++) {
    c.tick(1);
    if (c.p.lastCollision && c.p.lastCollision.hitCeiling) bonked = true;
  }
  c.releaseJump();
  check('a held jump bonks the low ceiling', bonked);

  // Falling into a pit is fatal as of step 4: it costs a life and respawns
  // you at the screen edge rather than silently teleporting you back.
  const f = world(21, 11);
  f.tick(200);
  check('falling into a pit costs a life', f.p.deaths > 0 && f.p.lives < T.STARTING_LIVES,
    `deaths ${f.p.deaths}, lives ${f.p.lives}`);
  check('and puts you back on solid ground', f.p.alive && f.p.bottom < f.map.heightPx,
    `bottom ${f.p.bottom}`);
}

// ---------------------------------------------------------------------------
section('aiming');
// ---------------------------------------------------------------------------
{
  const w = world();
  const aimNow = () => AIM_NAME[w.p.aim];

  w.tick(1);
  eq('standing still aims forward', aimNow(), 'E');

  w.inp.up = true;
  w.tick(1);
  eq('standing + up aims straight up', aimNow(), 'N');

  w.inp.right = true;
  w.tick(1);
  eq('running + up aims diagonally up', aimNow(), 'NE');

  w.inp.up = false;
  w.inp.left = true;
  w.inp.right = false;
  w.tick(1);
  eq('running left aims west', aimNow(), 'W');

  // Down on the ground is the prone stance, never a downward shot.
  w.inp.left = false;
  w.inp.down = true;
  w.tick(1);
  eq('down on the ground goes prone, not aim-down', w.p.state, 'prone');
  eq('prone still aims horizontally', aimNow(), 'W');

  // Airborne unlocks the full eight.
  w.inp.down = false;
  w.tick(2);
  w.pressJump();
  w.tick(2);
  w.inp.down = true;
  w.tick(1);
  eq('airborne + down aims straight down', aimNow(), 'S');
  w.inp.right = true;
  w.tick(1);
  eq('airborne + down + forward aims diagonally down', aimNow(), 'SE');
  w.releaseJump();
}

report();
