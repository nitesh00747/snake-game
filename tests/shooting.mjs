/**
 * shooting.mjs — behavioural tests for the default rifle and the bullet pool.
 *
 *   node tests/shooting.mjs
 *
 * The pool tests matter more than they look: "recycles objects" is the kind of
 * claim that stays true right up until someone adds a field and forgets to
 * reset it, at which point a fresh bullet inherits the last one's velocity.
 * These assert identity reuse and zero growth directly.
 */

import { mirrorSource, installDomShim, check, eq, near, section, report } from './harness.mjs';

installDomShim();
const mod = mirrorSource();

const { Tilemap } = await import(mod('systems/tilemap.ts'));
const { PLAYGROUND } = await import(mod('levels/playground.ts'));
const { Player } = await import(mod('entities/player.ts'));
const { BulletPool } = await import(mod('entities/bullet.ts'));
const { SKIN_P1 } = await import(mod('entities/playerSprite.ts'));
const { Camera } = await import(mod('entities/../core/camera.ts'));
const { AIM_NAME } = await import(mod('entities/aim.ts'));
const T = await import(mod('tuning.ts'));

function blankInput() {
  return {
    left: false, right: false, up: false, down: false,
    fire: false, jump: false,
    firePressed: false, jumpPressed: false, jumpReleased: false, any: false,
  };
}

function world(col = 2, row = 11) {
  const map = new Tilemap(PLAYGROUND);
  const inp = blankInput();
  const bullets = new BulletPool(map);
  const p = new Player(0, inp, map, SKIN_P1, bullets);
  p.spawnAt(col * T.TILE + T.TILE / 2, (row + 1) * T.TILE);

  const cam = new Camera();
  cam.setBounds(0, 0, map.widthPx, map.heightPx);
  cam.snapTo(p.centerX - T.CAMERA_ANCHOR_X, 0);

  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      p.update();
      bullets.update(cam);
      inp.firePressed = false;
      inp.jumpPressed = false;
      inp.jumpReleased = false;
    }
  };

  /** One press-and-release of the fire button. */
  const tapFire = () => {
    inp.fire = true;
    inp.firePressed = true;
    tick(1);
    inp.fire = false;
  };

  tick(20); // settle on the floor
  return { map, inp, p, bullets, cam, tick, tapFire };
}

const live = (b) => b.items.filter((x) => x.active && x.spark === 0);

// ---------------------------------------------------------------------------
section('firing the rifle');
// ---------------------------------------------------------------------------
{
  const w = world();
  eq('starts with an empty field', w.bullets.activeCount, 0);

  const mx = w.p.muzzleX;
  const my = w.p.muzzleY;
  w.tapFire();

  eq('one press fires one bullet', live(w.bullets).length, 1);
  const b = live(w.bullets)[0];
  near('spawns at the muzzle X', b.centerX, mx, 1.01);
  near('spawns at the muzzle Y', b.centerY, my, 1.01);
  near('travels at the rifle speed', Math.hypot(b.vx, b.vy), T.RIFLE_BULLET_SPEED, 0.001);
  check('travels in the facing direction', b.vx > 0 && b.vy === 0);
  check('muzzle flash lit', w.p.muzzleFlash > 0);

  const x0 = b.x;
  w.tick(3);
  near('moves speed pixels per tick', b.x - x0, T.RIFLE_BULLET_SPEED * 3, 0.001);
}

// ---------------------------------------------------------------------------
section('one shot per press');
// ---------------------------------------------------------------------------
{
  const w = world();
  // Hold the button down for a long time without re-pressing it.
  w.inp.fire = true;
  w.inp.firePressed = true;
  w.tick(60);

  eq('holding fire does not autofire', w.p.shotsFired, 1);

  // Releasing and pressing again fires a second.
  w.inp.fire = false;
  w.tick(1);
  w.tapFire();
  eq('a second press fires again', w.p.shotsFired, 2);
}

// ---------------------------------------------------------------------------
section('the four-bullet cap');
// ---------------------------------------------------------------------------
{
  const w = world();
  // Fire as fast as the cooldown allows, aiming up so nothing hits a wall.
  w.inp.up = true;
  w.tick(1);
  for (let i = 0; i < 12; i++) {
    w.tapFire();
    w.tick(T.RIFLE_COOLDOWN_FRAMES);
  }

  check(
    'never more than four of your bullets are alive',
    live(w.bullets).length <= T.RIFLE_MAX_ONSCREEN,
    `${live(w.bullets).length} alive`,
  );
  check('the cap actually blocked shots', w.p.shotsFired < 12, `${w.p.shotsFired} of 12 attempts`);
}

{
  // Mashing faster than the cadence is also refused.
  const w = world();
  w.inp.up = true;
  w.tick(1);
  for (let i = 0; i < 5; i++) w.tapFire();
  eq('cooldown floors the fire rate', w.p.shotsFired, 1);
}

// ---------------------------------------------------------------------------
section('bullets die on geometry and off camera');
// ---------------------------------------------------------------------------
{
  // Stand next to the two-tile block at cols 40-41 and shoot into it.
  const w = world(38, 11);
  w.inp.right = true;
  w.tick(30); // run up against the wall
  w.tapFire();
  // Fired point-blank, the muzzle is already inside the wall tile, so the
  // bullet sparks on its first tick rather than travelling at all.
  const b = w.bullets.items.find((x) => x.active);
  check('bullet exists', !!b);
  check('it never travels into the wall', !!b && b.spark > 0);
  w.tick(20);
  check('a bullet stops at a wall', !b || !b.active || b.spark > 0 || b.dead);
  w.tick(T.BULLET_SPARK_FRAMES + 2);
  eq('and the slot returns to the pool', w.bullets.activeCount, 0);
}

{
  const w = world();
  w.tapFire();
  eq('bullet in flight', w.bullets.activeCount, 1);
  // Nothing to hit going right along open ground, so it must leave the screen.
  w.tick(200);
  eq('a bullet that flies off camera is recycled', w.bullets.activeCount, 0);
}

// ---------------------------------------------------------------------------
section('aim determines trajectory');
// ---------------------------------------------------------------------------
{
  const cases = [
    ['E', { up: false, down: false, right: true }, (b) => b.vx > 0 && b.vy === 0],
    ['N', { up: true }, (b) => b.vy < 0 && Math.abs(b.vx) < 0.001],
    ['NE', { up: true, right: true }, (b) => b.vx > 0 && b.vy < 0],
    ['W', { left: true }, (b) => b.vx < 0 && b.vy === 0],
    ['NW', { up: true, left: true }, (b) => b.vx < 0 && b.vy < 0],
  ];

  for (const [name, keys, predicate] of cases) {
    const w = world();
    Object.assign(w.inp, keys);
    w.tick(2);
    eq(`aim resolves to ${name}`, AIM_NAME[w.p.aim], name);
    w.tapFire();
    const b = live(w.bullets)[0];
    check(`${name} bullet flies the right way`, !!b && predicate(b),
      b ? `v ${b.vx.toFixed(2)},${b.vy.toFixed(2)}` : 'no bullet');
    if (b) near(`${name} speed is uniform`, Math.hypot(b.vx, b.vy), T.RIFLE_BULLET_SPEED, 0.001);
  }
}

{
  // Diagonals must not be faster than straight shots — the classic bug.
  const e = world();
  e.inp.right = true;
  e.tick(2);
  e.tapFire();
  const straight = live(e.bullets)[0];

  const d = world();
  d.inp.right = true;
  d.inp.up = true;
  d.tick(2);
  d.tapFire();
  const diagonal = live(d.bullets)[0];

  near(
    'a diagonal shot is not faster than a straight one',
    Math.hypot(diagonal.vx, diagonal.vy),
    Math.hypot(straight.vx, straight.vy),
    0.001,
  );
}

// ---------------------------------------------------------------------------
section('prone fire hugs the floor');
// ---------------------------------------------------------------------------
{
  const w = world();
  const standingMuzzle = w.p.muzzleY;
  w.inp.down = true;
  w.tick(2);
  eq('prone', w.p.state, 'prone');
  check('prone muzzle is lower than standing', w.p.muzzleY > standingMuzzle,
    `${w.p.muzzleY} vs ${standingMuzzle}`);

  w.tapFire();
  const b = live(w.bullets)[0];
  eq('prone shot is horizontal', b.vy, 0);
  const floor = 12 * T.TILE;
  check('and travels within a few pixels of the floor', floor - b.centerY < 8,
    `${(floor - b.centerY).toFixed(1)}px above the floor`);
}

// ---------------------------------------------------------------------------
section('the pool never grows');
// ---------------------------------------------------------------------------
{
  const w = world();
  const capacity = w.bullets.capacity;
  const identities = w.bullets.items.slice();

  w.inp.up = true;
  w.tick(1);
  for (let i = 0; i < 200; i++) {
    w.tapFire();
    w.tick(T.RIFLE_COOLDOWN_FRAMES + 2);
  }

  eq('capacity is unchanged after 200 shots', w.bullets.capacity, capacity);
  check(
    'every object is the same instance it started as',
    w.bullets.items.every((b, i) => b === identities[i]),
  );
  eq('no spawn was ever refused', w.bullets.overflow, 0);
  check('shots actually happened', w.p.shotsFired > 50, `${w.p.shotsFired} shots`);

  // A recycled bullet must not inherit the previous occupant's state.
  const before = w.bullets.activeCount;
  w.tick(400);
  eq('field drains completely when firing stops', w.bullets.activeCount, 0);
  check('field had bullets in it beforehand', before > 0);
}

{
  // Exhausting the pool must refuse cleanly rather than throw or allocate.
  const map = new Tilemap(PLAYGROUND);
  const pool = new BulletPool(map, 4);
  for (let i = 0; i < 4; i++) check(`slot ${i} spawns`, !!pool.spawn(100, 100, 1, 0, 'player', 0));
  eq('pool is full', pool.activeCount, 4);
  eq('an over-capacity spawn returns null', pool.spawn(100, 100, 1, 0, 'player', 0), null);
  eq('and is counted as overflow', pool.overflow, 1);

  pool.reset();
  eq('reset empties the pool', pool.activeCount, 0);
  check('and it can be used again', !!pool.spawn(100, 100, 1, 0, 'player', 0));
}

report();
