/**
 * Brand assets, generated from the palette in `@nastech/design-tokens`.
 *
 * Every colour below comes from `raw.color`; nothing here invents a hex. The output is byte-stable
 * for a given palette (no timestamps, no randomness, fixed key order), so a rerun either changes
 * nothing or changes because a token changed. Run: `bun scripts/build-brand-assets.ts`.
 *
 * PNGs are encoded with `node:zlib` and a ~60-line encoder, which is why this repository can ship a
 * real apple-touch-icon and an og.png without pulling in a rasteriser.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { raw } from '@nastech/design-tokens';

const HEX = /^#[0-9a-fA-F]{6}$/;
const entries = Object.entries(raw.color);
const malformed = entries.filter(([, value]) => !HEX.test(value));
if (malformed.length > 0) {
  console.error(`brand-assets: malformed colour token(s): ${malformed.map(([name, value]) => `${name}=${value}`).join(', ')}`);
  process.exit(1);
}

/** Named palette, read once from the tokens so the template strings below have no free hexes. */
const C = {
  ink900: raw.color.ink900,
  ink500: raw.color.ink500,
  ink300: raw.color.ink300,
  ink100: raw.color.ink100,
  paper: raw.color.paper,
  paperWarm: raw.color.paperWarm,
  accent900: raw.color.accent900,
  accent600: raw.color.accent600,
  accent300: raw.color.accent300,
  positive: raw.color.signalPositive,
  caution: raw.color.signalCaution,
  negative: raw.color.signalNegative,
} as const;

const WORDMARK = 'Bantu Market';
const PROMISE = 'Second-hand, inspected';
const FEES = { listing: 'R0', success: '10%', capture: 'R270' } as const;
const FEE_LINE = `List ${FEES.listing} · ${FEES.success} success fee on completion · ${FEES.capture} optional 3D capture`;

interface AppBrand {
  readonly dir: string;
  readonly name: string;
  readonly shortName: string;
  readonly description: string;
  readonly ogTitle: string;
}

const APPS: readonly AppBrand[] = [
  {
    dir: 'apps/web-public',
    name: WORDMARK,
    shortName: 'Bantu Market',
    description: 'South African second-hand marketplace. Every listing is photographed and its condition disclosed in writing.',
    ogTitle: `${WORDMARK} — ${PROMISE.toLowerCase()}`,
  },
  {
    dir: 'apps/web-seller',
    name: `${WORDMARK} Seller`,
    shortName: 'Bantu Seller',
    description: 'List, capture and get paid. R0 to list; a 10% success fee is charged only when an order completes.',
    ogTitle: `${WORDMARK} Seller — list it, capture it, get paid`,
  },
  {
    dir: 'apps/web-staff',
    name: `${WORDMARK} Ops`,
    shortName: 'Bantu Ops',
    description: 'Operations console for Bantu Market: reconciliation, payout operations, disputes and audit.',
    ogTitle: `${WORDMARK} Ops — reconciliation and payouts`,
  },
];

/** The watch dial: a paper ring, two hands, and one hairline at 2 o'clock (the flaw, disclosed). */
function markSvg(size: number): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${WORDMARK}">`,
    `<rect width="64" height="64" rx="14" fill="${C.ink900}"/>`,
    `<circle cx="32" cy="32" r="20" fill="none" stroke="${C.paper}" stroke-width="4"/>`,
    `<path d="M32 20v12l8 7" fill="none" stroke="${C.paper}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="m41 16 7 7" fill="none" stroke="${C.accent300}" stroke-width="3" stroke-linecap="round"/>`,
    `</svg>`,
    ``,
  ].join('\n');
}

function ogSvg(): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-labelledby="og-title og-desc">`,
    `<title id="og-title">${WORDMARK} — ${PROMISE}</title>`,
    `<desc id="og-desc">${FEE_LINE}.</desc>`,
    `<rect width="1200" height="630" fill="${C.ink900}"/>`,
    `<rect width="18" height="630" fill="${C.accent600}"/>`,
    `<g transform="translate(84 72)">`,
    `<circle cx="48" cy="48" r="33" fill="none" stroke="${C.paper}" stroke-width="7"/>`,
    `<path d="M48 28v20l14 12" fill="none" stroke="${C.paper}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="m63 21 12 12" fill="none" stroke="${C.accent300}" stroke-width="5" stroke-linecap="round"/>`,
    `</g>`,
    `<text x="84" y="292" font-family='${raw.type.familyDisplay}' font-size="94" font-weight="600" fill="${C.paper}">${WORDMARK}</text>`,
    `<text x="84" y="364" font-family='${raw.type.familyText}' font-size="42" fill="${C.paperWarm}">${PROMISE}</text>`,
    `<line x1="84" y1="412" x2="212" y2="412" stroke="${C.accent300}" stroke-width="4"/>`,
    `<text x="84" y="478" font-family='${raw.type.familyText}' font-size="30" fill="${C.paper}">List ${FEES.listing} · ${FEES.success} success fee on completion</text>`,
    `<text x="84" y="522" font-family='${raw.type.familyText}' font-size="30" fill="${C.paper}">${FEES.capture} optional 3D capture</text>`,
    `<text x="84" y="590" font-family='${raw.type.familyText}' font-size="20" fill="${C.ink300}">Every listing photographed. Condition disclosed in writing.</text>`,
    `<g transform="translate(1036 454)" opacity="0.9">`,
    `<circle r="116" fill="none" stroke="${C.accent900}" stroke-width="30"/>`,
    `<circle r="58" fill="none" stroke="${C.ink500}" stroke-width="3"/>`,
    `<path d="M0 -58V0l38 32" fill="none" stroke="${C.ink500}" stroke-width="3" stroke-linecap="round"/>`,
    `</g>`,
    `</svg>`,
    ``,
  ].join('\n');
}

interface IconDef {
  readonly id: string;
  readonly body: string;
}

const ICONS: readonly IconDef[] = [
  { id: 'search', body: '<circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4.5 4.5"/>' },
  { id: 'camera', body: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>' },
  { id: 'chevron', body: '<path d="m9 5 7 7-7 7"/>' },
  { id: 'shield', body: '<path d="M12 3 5 6v6c0 4.4 3 7.4 7 9 4-1.6 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/>' },
  { id: 'truck', body: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>' },
  { id: 'wallet', body: '<path d="M3 7h16v12H3z"/><path d="M3 7V5h13"/><circle cx="17" cy="13" r="1.2"/>' },
  { id: 'message', body: '<path d="M4 4h16v12H9l-5 4z"/><path d="M8 9h8M8 12h5"/>' },
  { id: 'flag', body: '<path d="M6 21V4"/><path d="M6 5h12l-2.5 4L18 13H6"/>' },
  { id: 'check', body: '<path d="m5 12 4.5 4.5L19 7"/>' },
  { id: 'alert', body: '<path d="M12 3 2.5 20h19z"/><path d="M12 9v5"/><circle cx="12" cy="17.5" r="0.8" fill="currentColor" stroke="none"/>' },
  { id: 'spinner', body: '<path d="M12 3a9 9 0 1 0 9 9" stroke-dasharray="42 15"/>' },
  { id: 'close', body: '<path d="m6 6 12 12M18 6 6 18"/>' },
  { id: 'arrow-left', body: '<path d="M20 12H4"/><path d="m10 6-6 6 6 6"/>' },
  { id: 'plus', body: '<path d="M12 5v14M5 12h14"/>' },
];

function spriteSvg(): string {
  const symbols = ICONS.map(
    (icon) =>
      `  <symbol id="${icon.id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon.body}</symbol>`,
  );
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute">`,
    `  <title>${WORDMARK} icon sprite — use &lt;use href="./icons.svg#search"&gt;</title>`,
    ...symbols,
    `</svg>`,
    ``,
  ].join('\n');
}

function manifest(app: AppBrand): string {
  const value = {
    name: app.name,
    short_name: app.shortName,
    description: app.description,
    id: './',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'en-ZA',
    dir: 'ltr',
    theme_color: C.ink900,
    background_color: C.paper,
    categories: ['shopping', 'lifestyle'],
    icons: [
      { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: './icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: './favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
  return `${JSON.stringify(value, null, 2)}\n`;
}

// --- PNG encoder (<80 lines): RGBA, one zlib IDAT, no ancillary chunks. -------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4;
  const scanlines = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) scanlines.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

// --- Minimal rasteriser ------------------------------------------------------------------------

const rgbCache = new Map<string, readonly [number, number, number]>();
function rgb(hex: string): readonly [number, number, number] {
  const cached = rgbCache.get(hex);
  if (cached !== undefined) return cached;
  const value = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  rgbCache.set(hex, value);
  return value;
}

class Raster {
  readonly px: Uint8Array;
  constructor(readonly width: number, readonly height: number, background: string) {
    this.px = new Uint8Array(width * height * 4);
    this.rect(0, 0, width, height, background);
  }

  blend(x: number, y: number, hex: string, coverage: number): void {
    if (coverage <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const [r, g, b] = rgb(hex);
    const i = (y * this.width + x) * 4;
    const keep = 1 - coverage;
    this.px[i] = Math.round(this.px[i]! * keep + r * coverage);
    this.px[i + 1] = Math.round(this.px[i + 1]! * keep + g * coverage);
    this.px[i + 2] = Math.round(this.px[i + 2]! * keep + b * coverage);
    this.px[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, hex: string): void {
    const [r, g, b] = rgb(hex);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y1 = Math.min(this.height, Math.floor(y + h));
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        const i = (py * this.width + px) * 4;
        this.px[i] = r;
        this.px[i + 1] = g;
        this.px[i + 2] = b;
        this.px[i + 3] = 255;
      }
    }
  }

  ring(cx: number, cy: number, radius: number, width: number, hex: string): void {
    const half = width / 2;
    const x0 = Math.max(0, Math.floor(cx - radius - half - 1));
    const x1 = Math.min(this.width, Math.ceil(cx + radius + half + 1));
    const y0 = Math.max(0, Math.floor(cy - radius - half - 1));
    const y1 = Math.min(this.height, Math.ceil(cy + radius + half + 1));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const distance = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - radius);
        this.blend(x, y, hex, Math.min(1, Math.max(0, half + 0.5 - distance)));
      }
    }
  }

  line(x1: number, y1: number, x2: number, y2: number, width: number, hex: string): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = Math.max(1, dx * dx + dy * dy);
    const half = width / 2;
    const x0 = Math.max(0, Math.floor(Math.min(x1, x2) - half - 1));
    const xEnd = Math.min(this.width, Math.ceil(Math.max(x1, x2) + half + 1));
    const y0 = Math.max(0, Math.floor(Math.min(y1, y2) - half - 1));
    const yEnd = Math.min(this.height, Math.ceil(Math.max(y1, y2) + half + 1));
    for (let y = y0; y < yEnd; y += 1) {
      for (let x = x0; x < xEnd; x += 1) {
        const t = Math.min(1, Math.max(0, ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / lengthSq));
        const distance = Math.hypot(x + 0.5 - (x1 + t * dx), y + 0.5 - (y1 + t * dy));
        this.blend(x, y, hex, Math.min(1, Math.max(0, half + 0.5 - distance)));
      }
    }
  }

  text(x: number, y: number, text: string, scale: number, hex: string): void {
    let cursor = x;
    for (const char of text.toUpperCase()) {
      const glyph = FONT[char] ?? FONT['?'];
      if (glyph !== undefined) {
        glyph.split('/').forEach((row, ry) => {
          for (let rx = 0; rx < 5; rx += 1) {
            if (row[rx] === '1') this.rect(cursor + rx * scale, y + ry * scale, scale, scale, hex);
          }
        });
      }
      cursor += 6 * scale;
    }
  }
}

/** 5×7 bitmap glyphs; only the characters the social card and icons need. */
const FONT: Readonly<Record<string, string>> = {
  ' ': '00000/00000/00000/00000/00000/00000/00000',
  A: '01110/10001/10001/11111/10001/10001/10001',
  B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01110/10001/10000/10000/10000/10001/01110',
  D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111',
  F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01110/10001/10000/10111/10001/10001/01110',
  H: '10001/10001/10001/11111/10001/10001/10001',
  I: '11111/00100/00100/00100/00100/00100/11111',
  J: '00111/00010/00010/00010/00010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001',
  N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101',
  R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110',
  T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110',
  V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/10101/01010',
  X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100',
  Z: '11111/00001/00010/00100/01000/10000/11111',
  '0': '01110/10001/10001/10001/10001/10001/01110',
  '1': '00100/01100/00100/00100/00100/00100/01110',
  '2': '01110/10001/00001/00010/00100/01000/11111',
  '3': '11110/00001/00001/01110/00001/00001/11110',
  '4': '00010/00110/01010/10010/11111/00010/00010',
  '5': '11111/10000/11110/00001/00001/10001/01110',
  '6': '01110/10000/10000/11110/10001/10001/01110',
  '7': '11111/00001/00010/00100/01000/01000/01000',
  '8': '01110/10001/10001/01110/10001/10001/01110',
  '9': '01110/10001/10001/01111/00001/00001/01110',
  '%': '11001/11010/00010/00100/01000/01011/10011',
  '.': '00000/00000/00000/00000/00000/01100/01100',
  ',': '00000/00000/00000/00000/01100/00100/01000',
  '-': '00000/00000/00000/11111/00000/00000/00000',
  '·': '00000/00000/00100/00000/00100/00000/00000',
  '?': '01110/10001/00001/00010/00100/00000/00100',
};

function drawMark(canvas: Raster, cx: number, cy: number, radius: number): void {
  canvas.ring(cx, cy, radius, radius * 0.2, C.paper);
  canvas.line(cx, cy - radius * 0.6, cx, cy, radius * 0.2, C.paper);
  canvas.line(cx, cy, cx + radius * 0.4, cy + radius * 0.35, radius * 0.2, C.paper);
  canvas.line(cx + radius * 0.45, cy - radius * 0.85, cx + radius * 0.8, cy - radius * 0.5, radius * 0.15, C.accent300);
}

function iconPng(size: number, safe: boolean): Uint8Array {
  const canvas = new Raster(size, size, C.ink900);
  if (safe) canvas.rect(0, 0, size, size, C.ink900);
  drawMark(canvas, size / 2, size / 2, size * (safe ? 0.25 : 0.32));
  return encodePng(size, size, canvas.px);
}

function ogPng(): Uint8Array {
  const canvas = new Raster(1200, 630, C.ink900);
  canvas.rect(0, 0, 18, 630, C.accent600);
  drawMark(canvas, 132, 120, 48);
  canvas.text(84, 238, WORDMARK, 8, C.paper);
  canvas.text(84, 322, PROMISE, 4, C.paperWarm);
  canvas.rect(84, 390, 128, 4, C.accent300);
  canvas.text(84, 432, `LIST ${FEES.listing}`, 3, C.paper);
  canvas.text(84, 474, `${FEES.success} SUCCESS FEE ON COMPLETION`, 3, C.paper);
  canvas.text(84, 516, `${FEES.capture} OPTIONAL 3D CAPTURE`, 3, C.paper);
  canvas.text(84, 586, 'EVERY LISTING PHOTOGRAPHED. CONDITION DISCLOSED IN WRITING.', 2, C.ink300);
  canvas.ring(1040, 454, 116, 30, C.accent900);
  canvas.ring(1040, 454, 58, 3, C.ink500);
  canvas.line(1040, 396, 1040, 454, 3, C.ink500);
  canvas.line(1040, 454, 1078, 486, 3, C.ink500);
  return encodePng(1200, 630, canvas.px);
}

// --- Emit --------------------------------------------------------------------------------------

const root = resolve(import.meta.dir, '..');

function emit(app: AppBrand): void {
  const publicDir = resolve(root, app.dir, 'public');
  mkdirSync(resolve(publicDir, 'icons'), { recursive: true });
  const sprite = spriteSvg();
  const social = ogSvg();
  const files: ReadonlyArray<readonly [string, string | Uint8Array]> = [
    ['favicon.svg', markSvg(32)],
    ['favicon-32.png', iconPng(32, false)],
    ['apple-touch-icon.png', iconPng(180, false)],
    ['icons/icon-192.png', iconPng(192, false)],
    ['icons/icon-512.png', iconPng(512, false)],
    ['icons/maskable-512.png', iconPng(512, true)],
    ['icons.svg', sprite],
    ['og.svg', social],
    ['og.png', ogPng()],
    ['site.webmanifest', manifest(app)],
  ];
  for (const [name, contents] of files) {
    writeFileSync(resolve(publicDir, name), contents);
  }
  process.stdout.write(`ok ${app.dir}/public — ${files.length} files\n`);
}

for (const app of APPS) emit(app);
