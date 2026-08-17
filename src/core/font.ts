/**
 * font.ts — a 3x5 pixel font defined entirely in code (zero asset files).
 *
 * Glyphs are written as five 3-character rows separated by '/', so the shape is
 * readable in source and a malformed glyph is caught at load time instead of
 * showing up as garbage on screen.
 *
 * Each requested colour is rasterised once into a cached atlas canvas, so
 * drawing text costs one drawImage per character rather than 15 fillRects.
 */

export const GLYPH_W = 3;
export const GLYPH_H = 5;
/** Advance per character, including the 1px inter-letter gap. */
export const CHAR_ADVANCE = GLYPH_W + 1;
/** Baseline-to-baseline distance for multi-line text. */
export const LINE_HEIGHT = GLYPH_H + 2;

// prettier-ignore
const GLYPHS: Record<string, string> = {
  'A': '.#./#.#/###/#.#/#.#',
  'B': '##./#.#/##./#.#/##.',
  'C': '.##/#../#../#../.##',
  'D': '##./#.#/#.#/#.#/##.',
  'E': '###/#../##./#../###',
  'F': '###/#../##./#../#..',
  'G': '.##/#../#.#/#.#/.##',
  'H': '#.#/#.#/###/#.#/#.#',
  'I': '###/.#./.#./.#./###',
  'J': '..#/..#/..#/#.#/.#.',
  'K': '#.#/##./#../##./#.#',
  'L': '#../#../#../#../###',
  'M': '#.#/###/###/#.#/#.#',
  'N': '#.#/##./###/.##/#.#',
  'O': '.#./#.#/#.#/#.#/.#.',
  'P': '##./#.#/##./#../#..',
  'Q': '.#./#.#/#.#/##./.##',
  'R': '##./#.#/##./#.#/#.#',
  'S': '.##/#../.#./..#/##.',
  'T': '###/.#./.#./.#./.#.',
  'U': '#.#/#.#/#.#/#.#/###',
  'V': '#.#/#.#/#.#/#.#/.#.',
  'W': '#.#/#.#/###/###/#.#',
  'X': '#.#/#.#/.#./#.#/#.#',
  'Y': '#.#/#.#/.#./.#./.#.',
  'Z': '###/..#/.#./#../###',
  '0': '###/#.#/#.#/#.#/###',
  '1': '.#./##./.#./.#./###',
  '2': '##./..#/.#./#../###',
  '3': '##./..#/.##/..#/##.',
  '4': '#.#/#.#/###/..#/..#',
  '5': '###/#../##./..#/##.',
  '6': '.##/#../###/#.#/###',
  '7': '###/..#/.#./#../#..',
  '8': '.#./#.#/.#./#.#/.#.',
  '9': '###/#.#/###/..#/##.',
  ' ': '.../.../.../.../...',
  '.': '.../.../.../.../.#.',
  ',': '.../.../.../.#./#..',
  ':': '.../.#./.../.#./...',
  ';': '.../.#./.../.#./#..',
  '-': '.../.../###/.../...',
  '_': '.../.../.../.../###',
  '+': '.../.#./###/.#./...',
  '=': '.../###/.../###/...',
  '*': '.../#.#/.#./#.#/...',
  '/': '..#/..#/.#./#../#..',
  '\\': '#../#../.#./..#/..#',
  '!': '.#./.#./.#./.../.#.',
  '?': '##./..#/.#./.../.#.',
  '<': '..#/.#./#../.#./..#',
  '>': '#../.#./..#/.#./#..',
  '(': '..#/.#./.#./.#./..#',
  ')': '#../.#./.#./.#./#..',
  '[': '###/#../#../#../###',
  ']': '###/..#/..#/..#/###',
  '%': '#.#/..#/.#./#../#.#',
  '#': '#.#/###/#.#/###/#.#',
  "'": '.#./.#./.../.../...',
  '"': '#.#/#.#/.../.../...',
  '|': '.#./.#./.#./.#./.#.',
  '@': '###/#.#/###/#../.##',
  '^': '.#./#.#/.../.../...',
  '~': '.../..#/###/#../...',
};

/** Flattened bitmaps, validated at load. Index = row * GLYPH_W + col. */
const BITS = new Map<string, string>();

for (const [ch, spec] of Object.entries(GLYPHS)) {
  const rows = spec.split('/');
  if (rows.length !== GLYPH_H) {
    throw new Error(`font: glyph "${ch}" has ${rows.length} rows, expected ${GLYPH_H}`);
  }
  for (const row of rows) {
    if (row.length !== GLYPH_W || /[^#.]/.test(row)) {
      throw new Error(`font: glyph "${ch}" has a malformed row "${row}"`);
    }
  }
  BITS.set(ch, rows.join(''));
}

/** Ordered list of characters present in the atlas. */
const CHARSET = [...BITS.keys()];
const CHAR_INDEX = new Map<string, number>(CHARSET.map((c, i) => [c, i]));
const FALLBACK_INDEX = CHAR_INDEX.get('?') ?? 0;

const atlasCache = new Map<string, HTMLCanvasElement>();

function buildAtlas(color: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = CHARSET.length * GLYPH_W;
  cv.height = GLYPH_H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = color;

  CHARSET.forEach((ch, i) => {
    const bits = BITS.get(ch)!;
    const ox = i * GLYPH_W;
    for (let y = 0; y < GLYPH_H; y++) {
      for (let x = 0; x < GLYPH_W; x++) {
        if (bits[y * GLYPH_W + x] === '#') ctx.fillRect(ox + x, y, 1, 1);
      }
    }
  });

  return cv;
}

/** Atlas for a colour, built on first use and cached thereafter. */
export function getAtlas(color: string): HTMLCanvasElement {
  let a = atlasCache.get(color);
  if (!a) {
    a = buildAtlas(color);
    atlasCache.set(color, a);
  }
  return a;
}

/** Column of a character within the atlas. Unknown characters fall back to '?'. */
export function glyphIndex(ch: string): number {
  const i = CHAR_INDEX.get(ch);
  if (i !== undefined) return i;
  const upper = CHAR_INDEX.get(ch.toUpperCase());
  if (upper !== undefined) return upper;
  return FALLBACK_INDEX;
}

/** Rendered width of a single line, in virtual pixels. */
export function measure(text: string): number {
  return text.length === 0 ? 0 : text.length * CHAR_ADVANCE - 1;
}

/** Exposed for the font self-test. */
export function glyphCount(): number {
  return CHARSET.length;
}
