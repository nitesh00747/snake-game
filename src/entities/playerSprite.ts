/**
 * playerSprite.ts — the commando, drawn from primitives. No image files.
 *
 * Rather than authoring eight sprites for eight aim directions, the body is
 * drawn per stance and the gun arm is swung to the aim vector. That gives every
 * angle a distinct silhouette from four poses, and it means adding a weapon in
 * step 6 changes one function instead of a sprite sheet.
 *
 * The somersault is built the same way: a tucked body whose head and legs orbit
 * the centre. Rotating actual pixels would need either a transform (which
 * introduces antialiasing and breaks the pixel grid) or pre-baked frames.
 */

import type { Renderer } from '../core/renderer';
import { PAL } from '../core/palette';
import { AIM_VEC } from './aim';

export interface PlayerSkin {
  band: string;
  skin: string;
  shirt: string;
  shirtDark: string;
  pants: string;
  boots: string;
  gun: string;
}

export const SKIN_P1: PlayerSkin = {
  band: PAL.red2,
  skin: PAL.brown3,
  shirt: PAL.grey4,
  shirtDark: PAL.grey2,
  pants: PAL.blue,
  boots: PAL.grey1,
  gun: PAL.grey2,
};

export const SKIN_P2: PlayerSkin = {
  band: PAL.blue,
  skin: PAL.brown3,
  shirt: PAL.yellow,
  shirtDark: PAL.orange,
  pants: PAL.green1,
  boots: PAL.grey1,
  gun: PAL.grey2,
};

/** Everything the sprite needs, so this module never imports the Player class. */
export interface PlayerView {
  x: number;
  y: number;
  w: number;
  h: number;
  facing: 1 | -1;
  aim: number;
  state: 'stand' | 'run' | 'prone' | 'jump' | 'fall' | 'dying';
  runFrame: number;
  spin: number;
  skin: PlayerSkin;
  /** Ticks left on the muzzle flash; 0 when not firing. */
  muzzleFlash: number;
}

export function drawPlayer(r: Renderer, sx: number, sy: number, p: PlayerView): void {
  switch (p.state) {
    case 'prone':
      drawProne(r, sx, sy, p);
      break;
    case 'jump':
    // The death tumble is already a spinning body; the arc sells the rest.
    case 'dying':
      drawSomersault(r, sx, sy, p);
      break;
    case 'run':
      drawUpright(r, sx, sy, p, p.runFrame);
      break;
    case 'fall':
      drawUpright(r, sx, sy, p, 4);
      break;
    default:
      drawUpright(r, sx, sy, p, -1);
      break;
  }
}

/**
 * Standing / running / falling. `frame` is -1 for the idle stance, 0-3 for the
 * run cycle, and 4 for the airborne legs-apart fall pose.
 */
function drawUpright(r: Renderer, sx: number, sy: number, p: PlayerView, frame: number): void {
  const cx = sx + p.w / 2;
  const f = p.facing;
  const s = p.skin;

  // The run cycle lifts the body a pixel on the contact frames.
  const bob = frame === 1 || frame === 3 ? 1 : 0;
  const top = sy + bob;

  // --- legs -------------------------------------------------------------
  const legY = top + 14;
  const legH = p.h - 14 - bob;
  if (frame === -1) {
    // Idle: feet together, weight even.
    r.fillRect(cx - 3, legY, 3, legH, s.pants);
    r.fillRect(cx, legY, 3, legH, s.pants);
    r.fillRect(cx - 3, legY + legH - 2, 3, 2, s.boots);
    r.fillRect(cx, legY + legH - 2, 3, 2, s.boots);
  } else if (frame === 4) {
    // Airborne fall: trailing leg tucked, lead leg extended.
    r.fillRect(cx - 3 + f, legY, 3, legH, s.pants);
    r.fillRect(cx - 1 - f * 2, legY, 3, legH - 3, s.pants);
    r.fillRect(cx - 3 + f, legY + legH - 2, 3, 2, s.boots);
    r.fillRect(cx - 1 - f * 2, legY + legH - 5, 3, 2, s.boots);
  } else {
    // Run: a stride pair on frames 0/2, a passing pose on 1/3.
    const spread = frame === 0 ? 3 : frame === 2 ? -3 : 0;
    const lead = cx - 2 + (spread * f) / 2;
    const trail = cx - 2 - (spread * f) / 2;
    const leadH = spread === 0 ? legH : legH - 1;
    r.fillRect(lead, legY, 3, leadH, s.pants);
    r.fillRect(trail, legY, 3, legH, s.pants);
    r.fillRect(lead, legY + leadH - 2, 3, 2, s.boots);
    r.fillRect(trail, legY + legH - 2, 3, 2, s.boots);
  }

  // --- torso ------------------------------------------------------------
  r.fillRect(cx - 3, top + 6, 6, 8, s.shirt);
  r.fillRect(cx - 3, top + 12, 6, 2, s.shirtDark); // belt / webbing
  // Ammo strap across the chest, drawn leaning with the facing.
  r.px(cx - 1 + f, top + 7, s.shirtDark);
  r.px(cx + f, top + 9, s.shirtDark);

  // --- head -------------------------------------------------------------
  r.fillRect(cx - 3, top, 6, 6, s.skin);
  r.fillRect(cx - 3, top + 1, 6, 2, s.band); // headband
  r.fillRect(cx - 3 - f * 3, top + 1, 3, 1, s.band); // trailing tail
  r.px(cx + f * 2, top + 4, PAL.black); // eye

  // --- gun arm ----------------------------------------------------------
  drawGunArm(r, cx + f, top + 8, p, 8);
}

function drawProne(r: Renderer, sx: number, sy: number, p: PlayerView): void {
  const cx = sx + p.w / 2;
  const f = p.facing;
  const s = p.skin;

  // Lying down: legs trail behind, head and gun lead.
  r.fillRect(cx - f * 9, sy + 4, 7, 4, s.pants);
  r.fillRect(cx - f * 10, sy + 5, 3, 3, s.boots);
  r.fillRect(cx - f * 4, sy + 3, 8, 5, s.shirt);
  r.fillRect(cx - f * 4, sy + 6, 8, 2, s.shirtDark);

  r.fillRect(cx + f * 2, sy + 1, 5, 5, s.skin);
  r.fillRect(cx + f * 2, sy + 1, 5, 2, s.band);
  r.px(cx + f * 5, sy + 4, PAL.black);

  // Barrel along the floor — the entire point of the stance.
  // Rects are built left-edge-first so the width is never negative.
  const gy = sy + 5;
  const barrelX = f === 1 ? cx + 4 : cx - 10;
  r.fillRect(barrelX, gy, 6, 2, s.gun);
  const tipX = f === 1 ? barrelX + 6 : barrelX - 2;
  r.fillRect(tipX, gy, 2, 2, PAL.grey3);
  if (p.muzzleFlash > 0) drawFlash(r, tipX + f, gy + 1);
}

function drawSomersault(r: Renderer, sx: number, sy: number, p: PlayerView): void {
  const cx = sx + p.w / 2;
  const cy = sy + p.h / 2;
  const s = p.skin;

  // Forward flip: rotation follows the direction of travel.
  const a = p.spin * Math.PI * 2 * p.facing;
  const ca = Math.cos(a);
  const sa = Math.sin(a);

  const headX = cx + ca * 5;
  const headY = cy + sa * 5;
  const legX = cx - ca * 5;
  const legY = cy - sa * 5;

  // Tucked torso.
  r.fillRect(cx - 3, cy - 3, 7, 7, s.shirt);
  r.fillRect(cx - 3, cy, 7, 3, s.shirtDark);

  // Legs opposite the head, knees pulled in.
  r.fillRect(legX - 2, legY - 2, 5, 4, s.pants);
  r.fillRect(legX - 2, legY + 1, 4, 2, s.boots);

  // Head, with the band always facing outward from the tuck.
  r.circle(headX, headY, 2.5, s.skin);
  r.fillRect(headX - 2, headY - 2, 5, 2, s.band);

  // Arm holding the weapon across the tuck.
  const gx = cx + sa * 6;
  const gy = cy - ca * 6;
  r.line(cx, cy, gx, gy, s.skin);
  r.fillRect(gx - 1, gy - 1, 3, 2, s.gun);
}

/**
 * The gun arm, swung to the aim vector. `len` is the reach from the shoulder;
 * the muzzle block at the end is where bullets spawn.
 */
function drawGunArm(r: Renderer, shx: number, shy: number, p: PlayerView, len: number): void {
  const v = AIM_VEC[p.aim];
  const ex = shx + v.x * len;
  const ey = shy + v.y * len;

  // Two offset lines give a 2px-thick arm without any diagonal gaps.
  r.line(shx, shy, ex, ey, p.skin.skin);
  r.line(shx, shy + 1, ex, ey + 1, p.skin.skin);

  // Muzzle, pushed one step further along the aim.
  r.fillRect(ex + v.x * 2 - 1, ey + v.y * 2 - 1, 3, 3, p.skin.gun);
  r.px(ex + v.x * 3, ey + v.y * 3, PAL.grey3);

  if (p.muzzleFlash > 0) drawFlash(r, ex + v.x * 4, ey + v.y * 4);
}

/** A four-point star at the barrel tip. Sells the shot without hiding the aim. */
function drawFlash(r: Renderer, x: number, y: number): void {
  r.hline(x - 2, y, 5, PAL.yellow);
  r.vline(x, y - 2, 5, PAL.yellow);
  r.px(x, y, PAL.white);
  r.px(x - 1, y - 1, PAL.orange);
  r.px(x + 1, y + 1, PAL.orange);
}
