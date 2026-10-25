// npm run icons — рисует нейтральные иконки PWA (без брендов) в apps/web/public.
// Знак: белое «блюдо» (кольцо с точкой) на зелёном фоне. Содержимое лежит в центральных 70%,
// поэтому те же рисунки годятся как «maskable». Внешних зависимостей нет: PNG собирается вручную.
import { crc32, deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public');
mkdirSync(outDir, { recursive: true });

const BG = [0x1f, 0x6f, 0x4a];
const FG = [0xff, 0xff, 0xff];
const RING_OUT = 0.34;
const RING_IN = 0.26;
const DOT = 0.12;

/** Доля «белого» в точке (x, y) ∈ [-0.5, 0.5]². */
function ink(x, y) {
  const d = Math.hypot(x, y);
  return (d <= RING_OUT && d >= RING_IN) || d <= DOT ? 1 : 0;
}

function renderRgba(size) {
  const samples = 4;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    const row = py * (size * 4 + 1);
    raw[row] = 0; // фильтр «без фильтра»
    for (let px = 0; px < size; px++) {
      let covered = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size - 0.5;
          const y = (py + (sy + 0.5) / samples) / size - 0.5;
          covered += ink(x, y);
        }
      }
      const a = covered / (samples * samples);
      const o = row + 1 + px * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] + (FG[c] - BG[c]) * a);
      raw[o + 3] = 255;
    }
  }
  return raw;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function png(size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // глубина
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(renderRgba(size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const files = {
  'icon-192.png': 192,
  'icon-512.png': 512,
  'icon-maskable-512.png': 512,
  'apple-touch-icon.png': 180,
};
for (const [name, size] of Object.entries(files)) {
  writeFileSync(join(outDir, name), png(size));
  console.log(`${name} (${size}x${size})`);
}

const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${hex(BG)}"/>
  <circle cx="256" cy="256" r="${((RING_OUT + RING_IN) / 2) * 512}" fill="none" stroke="${hex(FG)}" stroke-width="${(RING_OUT - RING_IN) * 512}"/>
  <circle cx="256" cy="256" r="${DOT * 512}" fill="${hex(FG)}"/>
</svg>
`;
writeFileSync(join(outDir, 'icon.svg'), svg);
console.log('icon.svg');
