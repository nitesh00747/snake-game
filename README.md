# OPERATION FALCON

An original run-and-gun action platformer in the spirit of the 1987 arcade
classics. TypeScript + Vite, raw Canvas 2D, no game engine, no external assets —
every sprite is drawn procedurally and every sound is synthesised at runtime.

- Internal resolution: **256x224** (NES-native), integer-scaled with
  `image-rendering: pixelated`
- Logic: **fixed 60Hz**, decoupled from rendering via an accumulator
- Dependencies: **Vite and TypeScript only**

## Running

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run test         # headless verification suite (no browser, no deps)
npm run screenshots  # render real frames to screenshots/*.png
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production bundle
```

## Build status

| Step | Scope | State |
| ---- | ----- | ----- |
| 1 | Scaffold, scaled canvas, fixed-timestep loop, debug overlay | **done** |
| 2 | Player movement: run, jump arc, prone, 8-way aim, tilemap collision | next |
| 3 | Shooting, default rifle, bullet pooling | |
| 4 | Enemies, spawn tables, death/respawn, lives and continues | |
| 5 | Level 1 jungle end-to-end with boss | |
| 6 | Weapons and power-up drops | |
| 7 | Levels 2 and 3 | |
| 8 | Two-player co-op | |
| 9 | Audio, title screen, polish | |

## Controls (step 1)

| Key | Action |
| --- | ------ |
| `F1` | Toggle debug overlay |
| `F2` | Cycle overlay detail (compact -> full -> off) |
| `\` | Toggle hitbox rendering |
| `Enter` | Pause |
| `.` | Single-step one logic tick while paused |
| `Space` | Toggle auto-scroll in the test scene |
| Arrows | Pan the camera when auto-scroll is off |

Final control scheme, for reference: P1 arrows + `Z` fire + `X` jump,
P2 `WASD` + `F` fire + `G` jump.

## Layout

```
src/
  main.ts              entry point
  game.ts              wiring: renderer + loop + active scene
  tuning.ts            EVERY gameplay constant lives here
  core/
    loop.ts            fixed-timestep accumulator, pause, single-step, stats
    renderer.ts        256x224 framebuffer, integer upscale, draw primitives
    font.ts            3x5 bitmap font defined in code, cached per colour
    palette.ts         restricted NES-flavoured colour set
    camera.ts          viewport, clamping, no-backtrack, render interpolation
    keyboard.ts        raw key state with separate tick / frame edge channels
    debug.ts           F1 overlay and development flags
  scenes/
    loopTest.ts        TEMPORARY step-1 harness — deleted in step 2
tests/
  run.mjs              verification suite
  harness.mjs          source mirror + DOM shim
  softcanvas.mjs       software Canvas2D + PNG encoder for screenshots
```

### Notes on the core

**The loop** ticks logic at exactly 60Hz and renders once per animation frame
with an `alpha` blend factor, so a 144Hz display gets smooth motion from 60Hz
simulation. Frame deltas are clamped at both ends: an upper clamp stops a
stalled tab from queueing hundreds of catch-up ticks, and a lower clamp handles
the browser handing `requestAnimationFrame` a timestamp that predates the
`performance.now()` sampled at start.

**Rendering** goes into an offscreen 256x224 buffer and is blitted once with
smoothing disabled. That guarantees true nearest-neighbour upscaling regardless
of CSS or device pixel ratio, and makes full-screen effects (shake, flash)
trivial later.

**Input** keeps two independent edge channels because logic consumes edges per
60Hz *tick* while system hotkeys are polled per rendered *frame* — different
rates, and while paused no ticks run at all. Edges are recorded from events
rather than diffed from snapshots, so a press-and-release inside one frame is
never dropped.

## Testing

`npm run test` runs 68 assertions with no browser and no dependencies: Node
executes the TypeScript sources directly (type stripping) against a DOM shim.
It covers tick pacing at 30/60/144Hz, stall clamping, pause and single-step,
hook ordering, camera clamping and interpolation, font data integrity, renderer
scaling including hi-DPI, input edge channels, and a full boot smoke test.

`npm run screenshots` renders the real render pipeline into a software canvas
and writes PNGs — a way to check pixel output without opening a browser.
