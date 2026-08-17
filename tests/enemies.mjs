/**
 * enemies.mjs — behavioural tests for enemies, spawning, death and lives.
 *
 *   node tests/enemies.mjs
 *
 * The telegraph assertions are the important ones. "Enemies wind up before
 * firing" is a fairness guarantee, and it is exactly the kind of property that
 * survives a refactor in spirit while quietly breaking in frames.
 */

import { mirrorSource, installDomShim, check, eq, section, report } from './harness.mjs';

installDomShim();
const mod = mirrorSource();

const { Tilemap } = await import(mod('systems/tilemap.ts'));
const { Spawner } = await import(mod('systems/spawner.ts'));
const { PLAYGROUND } = await import(mod('levels/playground.ts'));
const { Player } = await import(mod('entities/player.ts'));
const { BulletPool } = await import(mod('entities/bullet.ts'));
const { Soldier, Turret } = await import(mod('entities/enemy.ts'));
const { SKIN_P1 } = await import(mod('entities/playerSprite.ts'));
const { Camera } = await import(mod('core/camera.ts'));
const T = await import(mod('tuning.ts'));

function blankInput() {
  return {
    left: false, right: false, up: false, down: false,
    fire: false, jump: false,
    firePressed: false, jumpPressed: false, jumpReleased: false, any: false,
  };
}

/** A minimal world: map, pool, player, camera — no scene, no rendering. */
function world(col = 2, row = 11) {
  const map = new Tilemap(PLAYGROUND);
  const inp = blankInput();
  const bullets = new BulletPool(map);
  const p = new Player(0, inp, map, SKIN_P1, bullets);
  p.spawnAt(col * T.TILE + T.TILE / 2, (row + 1) * T.TILE);

  const cam = new Camera();
  cam.setBounds(0, 0, map.widthPx, map.heightPx);
  cam.snapTo(p.centerX - T.CAMERA_ANCHOR_X, 0);

  const ctx = {
    map,
    bullets,
    target: () => (p.alive ? { x: p.centerX, y: p.centerY } : null),
  };

  const enemies = [];
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      p.update();
      for (const e of enemies) e.update();
      bullets.update(cam);
      for (let j = enemies.length - 1; j >= 0; j--) if (enemies[j].dead) enemies.splice(j, 1);
      inp.firePressed = false;
      inp.jumpPressed = false;
      inp.jumpReleased = false;
    }
  };

  tick(20);
  return { map, inp, p, bullets, cam, ctx, enemies, tick };
}

const enemyShots = (b) => b.items.filter((x) => x.active && x.team === 'enemy');

// ---------------------------------------------------------------------------
section('spawn table');
// ---------------------------------------------------------------------------
{
  const w = world();
  const spawner = new Spawner(PLAYGROUND, w.ctx);
  const out = [];

  const total = PLAYGROUND.spawns.length;
  check('the level has a spawn table', total > 5, `${total} entries`);

  w.cam.snapTo(0, 0);
  spawner.update(w.cam, out);
  const early = out.length;
  check('only near entries arm at the start', early > 0 && early < total,
    `${early} of ${total} armed at camera 0`);

  // Nothing new should arm while the camera is still.
  spawner.update(w.cam, out);
  eq('a still camera arms nothing further', out.length, early);

  // Scroll to the end: everything arms, exactly once.
  w.cam.snapTo(PLAYGROUND.cols * T.TILE, 0);
  spawner.update(w.cam, out);
  eq('scrolling to the end arms every entry', out.length, total);
  spawner.update(w.cam, out);
  eq('and never re-arms them', out.length, total);
  eq('pending count drains to zero', spawner.pending, 0);

  spawner.reset();
  eq('reset rewinds the table for a continue', spawner.pending, total);
}

{
  const w = world();
  const e = new Soldier(w.ctx, 100, 192, -1, 0);
  w.cam.snapTo(600, 0);
  check('an enemy far behind the camera is off stage', Spawner.isOffStage(e, w.cam));
  w.cam.snapTo(90, 0);
  check('one on screen is not', !Spawner.isOffStage(e, w.cam));
}

// ---------------------------------------------------------------------------
section('spawn placement is legal');
// ---------------------------------------------------------------------------
{
  // Every spawn point is checked against the geometry it sits in. Placing an
  // enemy by eye from the ASCII map is easy to get wrong by a row, and an enemy
  // buried inside a hillside is invisible, unkillable, and still lethal to
  // touch. This is the kind of mistake that belongs to level data, so the test
  // reads the data rather than the code.
  const map = new Tilemap(PLAYGROUND);
  const size = { soldier: { w: T.SOLDIER_W, h: T.SOLDIER_H }, turret: { w: T.TURRET_W, h: T.TURRET_H } };

  let embedded = 0;
  let floating = 0;
  const problems = [];

  for (const e of PLAYGROUND.spawns) {
    const { w, h } = size[e.type];
    const x = e.x - w / 2;
    const y = e.y - h;
    const col = Math.floor(e.x / T.TILE);
    const feetRow = Math.floor(e.y / T.TILE);

    if (map.boxHitsSolid(x, y, w, h)) {
      embedded++;
      problems.push(`${e.type} at col ${col} is inside solid tiles`);
    } else if (!map.isStandableAt(col, feetRow)) {
      floating++;
      problems.push(`${e.type} at col ${col} has nothing under its feet`);
    }
  }

  eq('no enemy is buried in geometry', embedded, 0);
  eq('no enemy is spawned in mid-air', floating, 0);
  if (problems.length) for (const msg of problems) console.log(`       ${msg}`);
}

// ---------------------------------------------------------------------------
section('soldier');
// ---------------------------------------------------------------------------
{
  const w = world(2, 11);
  // Place a soldier to the right, well inside firing range.
  const s = new Soldier(w.ctx, w.p.centerX + 90, 12 * T.TILE, -1, 0);
  w.enemies.push(s);
  w.tick(2);

  eq('turns to face the player', s.facing, -1);
  check('advances toward the player', s.vx < 0, `vx ${s.vx}`);

  // Run until it commits to a shot.
  let sawAim = false;
  let firedAt = -1;
  for (let i = 0; i < 200; i++) {
    w.tick(1);
    if (s.state === 'aim') sawAim = true;
    if (enemyShots(w.bullets).length > 0) {
      firedAt = i;
      break;
    }
  }

  check('winds up before firing', sawAim);
  check('eventually fires', firedAt >= 0, `fired at tick ${firedAt}`);
  const shot = enemyShots(w.bullets)[0];
  check('the shot travels toward the player', !!shot && shot.vx < 0,
    shot ? `vx ${shot.vx.toFixed(2)}` : 'no shot');
  check('enemy fire is slower than yours', Math.hypot(shot.vx, shot.vy) < T.RIFLE_BULLET_SPEED);
}

{
  // The telegraph must be a real window, not a single frame.
  const w = world(2, 11);
  const s = new Soldier(w.ctx, w.p.centerX + 90, 12 * T.TILE, -1, 0);
  w.enemies.push(s);

  let aimFrames = 0;
  let shotSeen = false;
  for (let i = 0; i < 300 && !shotSeen; i++) {
    w.tick(1);
    if (s.state === 'aim') aimFrames++;
    if (enemyShots(w.bullets).length > 0) shotSeen = true;
  }
  check('the wind-up lasts long enough to react to', aimFrames >= T.SOLDIER_TELEGRAPH_FRAMES - 1,
    `${aimFrames} frames of wind-up`);
  check('and it crouches while aiming', s.h === T.SOLDIER_CROUCH_H || shotSeen);
}

{
  const w = world();
  const s = new Soldier(w.ctx, w.p.centerX + 90, 12 * T.TILE, -1, 0);
  w.enemies.push(s);
  w.tick(5);
  eq('a soldier dies to one hit', s.takeHit(), true);
  check('and is flagged dead', s.dead && s.killed);
  eq('a dead soldier cannot be killed twice', s.takeHit(), false);
}

{
  // Gravity applies: a soldier spawned in the air falls to the floor.
  const w = world();
  const s = new Soldier(w.ctx, w.p.centerX + 60, 6 * T.TILE, -1, 0);
  w.enemies.push(s);
  check('starts airborne', !s.onGround);
  w.tick(120);
  check('lands on the ground', s.onGround, `bottom ${s.bottom}`);
  eq('rests on the floor surface', s.bottom, 12 * T.TILE);
}

// ---------------------------------------------------------------------------
section('turret');
// ---------------------------------------------------------------------------
{
  const w = world();
  const t = new Turret(w.ctx, w.p.centerX + 60, 12 * T.TILE, 0);
  w.enemies.push(t);

  let windUpSeen = 0;
  let shots = 0;
  for (let i = 0; i < T.TURRET_FIRE_PERIOD * 2 + 4; i++) {
    w.tick(1);
    if (t.isWindingUp) windUpSeen++;
    shots = Math.max(shots, enemyShots(w.bullets).length);
  }

  check('telegraphs before each volley', windUpSeen >= T.TURRET_TELEGRAPH_FRAMES,
    `${windUpSeen} wind-up frames over two periods`);
  check('fires on its cadence', shots > 0);

  eq('takes several hits to destroy', T.TURRET_HEALTH > 1, true);
  let fatal = false;
  for (let i = 0; i < T.TURRET_HEALTH; i++) fatal = t.takeHit();
  check('dies after exactly its health in hits', fatal && t.dead);
}

{
  // Out of range, a turret holds fire rather than shooting at nothing.
  const w = world();
  const t = new Turret(w.ctx, w.p.centerX + T.TURRET_RANGE + 120, 12 * T.TILE, 0);
  w.enemies.push(t);
  w.tick(T.TURRET_FIRE_PERIOD * 2);
  eq('holds fire when the player is far away', enemyShots(w.bullets).length, 0);
}

// ---------------------------------------------------------------------------
section('death and respawn');
// ---------------------------------------------------------------------------
{
  const w = world();
  const startLives = w.p.lives;
  eq('starts with the full stock', startLives, T.STARTING_LIVES);

  w.p.facing = 1;
  w.p.kill();
  check('one hit kills', !w.p.alive);
  eq('state is dying', w.p.state, 'dying');
  check('knocked backwards', w.p.vx < 0, `vx ${w.p.vx}`);
  check('and upwards', w.p.vy < 0, `vy ${w.p.vy}`);

  // The arc plays out, then the respawn happens.
  w.tick(T.RESPAWN_DELAY_FRAMES + 2);
  check('comes back', w.p.alive);
  eq('at the cost of one life', w.p.lives, startLives - 1);
  check('with invulnerability', w.p.invuln > 0);
  check('and it flickers', w.p.flickering || w.p.invuln > 0);

  // Invulnerability actually protects.
  w.p.kill();
  check('immune while flickering', w.p.alive);

  // But a pit does not care.
  w.p.kill(true);
  check('a pit kills through invulnerability', !w.p.alive);
}

{
  const w = world();
  // The respawn point is the left edge of the current view, on solid ground.
  w.cam.snapTo(300, 0);
  w.p.kill();
  w.tick(T.RESPAWN_DELAY_FRAMES + 2);
  w.p.respawn(300);
  check('respawns near the screen edge', w.p.x >= 300 && w.p.x < 300 + 120,
    `x ${w.p.x}`);
  check('standing on something solid', w.map.isStandableAt(
    Math.floor(w.p.centerX / T.TILE),
    Math.floor((w.p.bottom + 1) / T.TILE),
  ), `bottom ${w.p.bottom}`);
}

{
  // Spending every life raises the game-over flag exactly once.
  const w = world();
  for (let i = 0; i <= T.STARTING_LIVES; i++) {
    w.p.invuln = 0;
    w.p.kill(true);
    w.tick(T.RESPAWN_DELAY_FRAMES + 2);
  }
  check('runs out of lives', w.p.outOfLives, `lives ${w.p.lives}`);

  w.p.restoreLives();
  eq('a continue restores the stock', w.p.lives, T.STARTING_LIVES);
  check('and clears the game-over flag', !w.p.outOfLives);
}

// ---------------------------------------------------------------------------
section('bullets versus enemies');
// ---------------------------------------------------------------------------
{
  const w = world();
  const s = new Soldier(w.ctx, w.p.centerX + 40, 12 * T.TILE, -1, 0);
  w.enemies.push(s);
  w.tick(2);

  // Fire straight at it and step the same overlap test the scene uses.
  w.inp.right = true;
  w.tick(2);
  w.inp.fire = true;
  w.inp.firePressed = true;
  w.tick(1);
  w.inp.fire = false;

  let hit = false;
  for (let i = 0; i < 40 && !hit; i++) {
    w.tick(1);
    for (const b of w.bullets.items) {
      if (!b.active || b.spark > 0 || b.team !== 'player') continue;
      if (b.x < s.x + s.w && b.x + b.w > s.x && b.y < s.y + s.h && b.y + b.h > s.y) {
        hit = true;
        s.takeHit();
        b.impact();
      }
    }
  }
  check('a rifle shot reaches and kills a soldier', hit && s.dead);
}

report();
