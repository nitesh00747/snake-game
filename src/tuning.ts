/**
 * tuning.ts — the single source of truth for every gameplay constant.
 *
 * Rule for the whole codebase: no magic numbers in systems or entities.
 * If a value affects how the game *feels*, it lives here.
 *
 * Units: positions are in virtual pixels, velocities in pixels-per-tick
 * (one tick = 1/60s), so `vy += GRAVITY` once per tick is correct.
 */

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** NES-native internal resolution. Everything is authored against this. */
export const SCREEN_W = 256;
export const SCREEN_H = 224;

/** Tile grid. 16px tiles => 16 x 14 tiles per screen. */
export const TILE = 16;
export const TILES_X = SCREEN_W / TILE; // 16
export const TILES_Y = SCREEN_H / TILE; // 14

/** Upper bound on integer upscale, so 8K monitors don't render a 30x screen. */
export const MAX_SCALE = 8;

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/** Logic runs at a fixed 60Hz regardless of display refresh rate. */
export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
export const TICK_S = 1 / TICK_HZ;

/**
 * Largest real-time slice we will consume in one animation frame. Prevents the
 * "spiral of death" after a tab stall: we drop simulation time instead of
 * trying to catch up with hundreds of ticks.
 */
export const MAX_FRAME_MS = 100; // at most 6 catch-up ticks per frame

// ---------------------------------------------------------------------------
// Player movement  (wired up in step 2 — listed here so tuning stays central)
// ---------------------------------------------------------------------------

export const GRAVITY = 0.46;
/** Terminal fall speed, so long drops stay readable. */
export const MAX_FALL_SPEED = 6.5;

export const RUN_SPEED = 1.55;

/**
 * Jump arc. With the values below:
 *   tapped  -> ~25px apex (1.6 tiles), ~15 frames airborne
 *   held    -> ~40px apex (2.5 tiles), ~28 frames airborne
 *
 * The hold does not add impulse; it *lowers gravity* for the first few rising
 * frames. That keeps the arc shape fixed and arcade-like — holding stretches
 * the same curve rather than producing a floaty second jump.
 */
export const JUMP_VELOCITY = -4.8;
/** Gravity while the jump button is held and the player is still rising. */
export const JUMP_HOLD_GRAVITY = 0.26;
/** Max frames the reduced-gravity window lasts. */
export const JUMP_HOLD_FRAMES = 11;

/** Late-jump forgiveness after walking off a ledge. */
export const COYOTE_FRAMES = 4;
/** Jump presses are remembered this long before landing. */
export const JUMP_BUFFER_FRAMES = 5;

/** Somersault: full rotations across the airborne arc. */
export const SOMERSAULT_SPINS = 2;
/** Frames of one-way-platform pass-through after a drop-through input. */
export const DROP_THROUGH_FRAMES = 12;

// ---------------------------------------------------------------------------
// Hitboxes
// ---------------------------------------------------------------------------

export const PLAYER_W = 8;
export const PLAYER_H = 22;
/** Prone fits a 16px gap; standing does not. That is the whole point of it. */
export const PLAYER_PRONE_H = 9;
/** The somersault tucks, so the airborne box is shorter than the standing one. */
export const PLAYER_JUMP_H = 14;

/** Run cycle: frames per leg swap. */
export const RUN_ANIM_FRAMES = 5;

// ---------------------------------------------------------------------------
// Combat  (steps 3-6)
// ---------------------------------------------------------------------------

export const RIFLE_BULLET_SPEED = 4.0;
/**
 * The genre's signature constraint: only four of your bullets may exist at
 * once. It is what stops the default gun from trivialising the game and what
 * makes every power-up feel like a real upgrade. Enforced per player.
 */
export const RIFLE_MAX_ONSCREEN = 4;
/** Floor on the fire rate, so mashing cannot exceed the gun's cadence. */
export const RIFLE_COOLDOWN_FRAMES = 8;

/** Projectile hitbox. Small and square: generous enough to hit, not to cheat. */
export const BULLET_W = 3;
export const BULLET_H = 3;
/** Ticks the impact flash lingers after a bullet stops. */
export const BULLET_SPARK_FRAMES = 3;
/** How far off screen a bullet travels before being recycled. */
export const BULLET_CULL_MARGIN = 24;
/**
 * Pool capacity. Sized for the worst case the game will ever ask for — two
 * players holding spread guns — so the pool is allocated once at boot and
 * never grows during play.
 */
export const BULLET_POOL_SIZE = 96;

/** Ticks the gun's muzzle flash is drawn for. */
export const MUZZLE_FLASH_FRAMES = 3;

export const DEATH_KNOCKBACK_X = -1.2;
export const DEATH_KNOCKBACK_Y = -3.4;
export const RESPAWN_DELAY_FRAMES = 60;
export const INVULN_FRAMES = 120;
export const INVULN_FLICKER_PERIOD = 4;

export const STARTING_LIVES = 3;
/** Seconds on the continue countdown before the run is over for good. */
export const CONTINUE_SECONDS = 10;

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

/** Enemy fire is slower than yours: readable, dodgeable, still lethal. */
export const ENEMY_BULLET_SPEED = 2.2;
/** Ticks an enemy flashes white after taking a hit it survived. */
export const ENEMY_HIT_FLASH = 4;
/** How far behind the camera an enemy gets before it is recycled. */
export const ENEMY_DESPAWN_MARGIN = 64;

export const SOLDIER_W = 8;
export const SOLDIER_H = 20;
/**
 * Crouched height. Sized so a standing player's chest-height shot still
 * connects: a 12px crouch let soldiers duck under the rifle by two pixels,
 * which reads as a broken gun rather than as a clever dodge.
 */
export const SOLDIER_CROUCH_H = 14;
export const SOLDIER_RUN_SPEED = 0.85;
/** Distance at which a soldier stops running and commits to a shot. */
export const SOLDIER_FIRE_RANGE = 150;
/** Ticks between the end of one shot and the start of the next attempt. */
export const SOLDIER_FIRE_COOLDOWN = 64;
/**
 * The telegraph. An enemy that shoots the instant it decides to is
 * indistinguishable from an unfair one, so every attack has a wind-up the
 * player can read and react to. This is the single most important number for
 * whether the game feels tough or cheap.
 */
export const SOLDIER_TELEGRAPH_FRAMES = 16;
/** Ticks the soldier holds still after firing before it moves again. */
export const SOLDIER_RECOVER_FRAMES = 12;
export const SOLDIER_ROLL_SPEED = 2.1;
export const SOLDIER_ROLL_FRAMES = 26;
/** Minimum ticks between dive-rolls, so they read as punctuation not panic. */
export const SOLDIER_ROLL_INTERVAL = 150;
export const SOLDIER_JUMP_VELOCITY = -3.6;

export const TURRET_W = 16;
export const TURRET_H = 16;
export const TURRET_HEALTH = 4;
/** Ticks between turret volleys. */
export const TURRET_FIRE_PERIOD = 96;
export const TURRET_TELEGRAPH_FRAMES = 20;
/** Range beyond which a turret holds fire rather than shooting at nothing. */
export const TURRET_RANGE = 200;

/** Ticks an explosion is drawn for. */
export const EXPLOSION_FRAMES = 14;

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/** Horizontal position the camera tries to keep the lead player at. */
export const CAMERA_ANCHOR_X = 96;
/** Camera lerp factor per tick. 1 = rigid lock, lower = lazier follow. */
export const CAMERA_FOLLOW = 0.18;
/** The camera never scrolls backwards in side-scrolling levels. */
export const CAMERA_NO_BACKTRACK = true;
