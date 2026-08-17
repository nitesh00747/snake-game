/**
 * softcanvas.mjs — a tiny software Canvas2D, enough to run the real renderer.
 *
 * This is a test double, not a second renderer: it implements only fillRect and
 * drawImage over an RGBA byte buffer. Every pixel it produces comes from the
 * actual Renderer / scene / debug-overlay code, which means the PNG it writes
 * is a true screenshot of the game — useful for checking font legibility and
 * overlay layout without a browser.
 */

import { deflateSync } from 'node:zlib';

function parseColor(css) {
  if (typeof css !== 'string') return [255, 0, 255, 255];
  let s = css.trim();
  if (s[0] === '#') {
    s = s.slice(1);
    if (s.length === 3) s = [...s].map((c) => c + c).join('');
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    const a = s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255;
    return [r, g, b, a];
  }
  return [255, 0, 255, 255];
}

export class SoftCanvas {
  constructor(w = 0, h = 0) {
    this.style = {};
    this._ctx = new SoftCtx(this);
    this.width = w;
    this.height = h;
  }

  get width() {
    return this._w;
  }
  set width(v) {
    this._w = v | 0;
    this._alloc();
  }
  get height() {
    return this._h;
  }
  set height(v) {
    this._h = v | 0;
    this._alloc();
  }

  _alloc() {
    const n = Math.max(0, (this._w | 0) * (this._h | 0) * 4);
    this.data = new Uint8ClampedArray(n); // transparent black
  }

  getContext() {
    return this._ctx;
  }

  addEventListener() {}
}

class SoftCtx {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000000';
    this.globalAlpha = 1;
    this.imageSmoothingEnabled = false;
    this.calls = { fillRect: 0, drawImage: 0, clearRect: 0 };
  }

  _blend(x, y, r, g, b, a) {
    const cv = this.canvas;
    if (x < 0 || y < 0 || x >= cv._w || y >= cv._h) return;
    const i = (y * cv._w + x) * 4;
    const d = cv.data;
    if (a >= 255) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
      return;
    }
    if (a <= 0) return;
    const t = a / 255;
    d[i] = d[i] * (1 - t) + r * t;
    d[i + 1] = d[i + 1] * (1 - t) + g * t;
    d[i + 2] = d[i + 2] * (1 - t) + b * t;
    d[i + 3] = Math.max(d[i + 3], a);
  }

  fillRect(x, y, w, h) {
    this.calls.fillRect++;
    const [r, g, b, ca] = parseColor(this.fillStyle);
    const a = ca * this.globalAlpha;
    x |= 0;
    y |= 0;
    w |= 0;
    h |= 0;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this._blend(xx, yy, r, g, b, a);
    }
  }

  clearRect(x, y, w, h) {
    this.calls.clearRect++;
    const cv = this.canvas;
    for (let yy = y | 0; yy < (y | 0) + (h | 0); yy++) {
      for (let xx = x | 0; xx < (x | 0) + (w | 0); xx++) {
        if (xx < 0 || yy < 0 || xx >= cv._w || yy >= cv._h) continue;
        const i = (yy * cv._w + xx) * 4;
        cv.data[i] = cv.data[i + 1] = cv.data[i + 2] = cv.data[i + 3] = 0;
      }
    }
  }

  /** Supports drawImage(src, dx, dy) and the full 9-argument form. */
  drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh) {
    this.calls.drawImage++;
    if (arguments.length === 3) {
      dx = sx;
      dy = sy;
      sx = 0;
      sy = 0;
      sw = dw = src.width;
      sh = dh = src.height;
    }
    const alpha = this.globalAlpha;
    // Nearest-neighbour, matching imageSmoothingEnabled = false.
    for (let y = 0; y < dh; y++) {
      const syy = (sy + Math.floor((y * sh) / dh)) | 0;
      for (let x = 0; x < dw; x++) {
        const sxx = (sx + Math.floor((x * sw) / dw)) | 0;
        if (sxx < 0 || syy < 0 || sxx >= src._w || syy >= src._h) continue;
        const i = (syy * src._w + sxx) * 4;
        const a = src.data[i + 3] * alpha;
        if (a <= 0) continue;
        this._blend((dx + x) | 0, (dy + y) | 0, src.data[i], src.data[i + 1], src.data[i + 2], a);
      }
    }
  }

  save() {}
  restore() {}
}

// --- PNG encoding (no dependencies) ----------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePNG(canvas) {
  const w = canvas.width;
  const h = canvas.height;

  // Filter type 0 (None) per scanline, RGB (alpha flattened onto black).
  const raw = Buffer.alloc(h * (1 + w * 3));
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = canvas.data[i + 3] / 255;
      raw[p++] = canvas.data[i] * a;
      raw[p++] = canvas.data[i + 1] * a;
      raw[p++] = canvas.data[i + 2] * a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
