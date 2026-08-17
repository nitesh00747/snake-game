/**
 * palette.ts — a restricted, NES-flavoured colour set.
 *
 * Sticking to a fixed palette is what makes procedurally-drawn shapes read as
 * a coherent 8-bit game rather than as coloured rectangles. Every draw call in
 * the project should pull from here.
 */

export const PAL = {
  black: '#000000',
  white: '#fcfcfc',

  // Greys / metal
  grey0: '#1c1c1c',
  grey1: '#3c3c3c',
  grey2: '#6c6c6c',
  grey3: '#a4a4a4',
  grey4: '#d8d8d8',

  // Sky
  sky0: '#0c1a3c',
  sky1: '#1c3c8c',
  sky2: '#3c78d8',
  sky3: '#7cb8f8',

  // Jungle
  green0: '#0c3c0c',
  green1: '#1c6c1c',
  green2: '#38a038',
  green3: '#78d878',

  // Earth
  brown0: '#3c2c0c',
  brown1: '#6c4c1c',
  brown2: '#a87c38',
  brown3: '#d8b878',

  // Hot
  red0: '#6c0c0c',
  red1: '#a81c1c',
  red2: '#e83c3c',
  orange: '#f87c1c',
  yellow: '#fcd83c',

  // Cool accents
  cyan: '#3cd8f8',
  blue: '#3c5cf8',
  purple: '#8c3cf8',
  magenta: '#f83cd8',

  // Debug
  hitbox: '#f83cd8',
  debugGreen: '#7cf07c',
} as const;

export type PaletteColor = (typeof PAL)[keyof typeof PAL];
