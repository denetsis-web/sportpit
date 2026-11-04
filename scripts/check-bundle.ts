// npm run check:bundle — собирает клиент и проверяет то, что нельзя проверить юнит-тестами:
//   1. начальный JS (то, что грузится на главном экране) ≤ 250 КБ gzip;
//   2. админка лежит в отдельном чанке и в начальный набор не входит;
//   3. PWA: манифест, иконки, метки iOS, service worker с кэшем оболочки и GET меню.
// Сборка идёт в node_modules/.cache, чтобы не оставлять папку dist в репозитории.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = join(root, 'apps', 'web');
const outDir = join(root, 'node_modules', '.cache', 'sportpit-web-check');
const LIMIT_BYTES = 250 * 1024;

const failures: string[] = [];
const check = (ok: boolean, message: string) => {
  if (!ok) failures.push(message);
};

await build({
  root: webRoot,
  logLevel: 'warn',
  build: { outDir, emptyOutDir: true, reportCompressedSize: false },
});

const read = (file: string) => readFileSync(join(outDir, file), 'utf8');
const html = read('index.html');

// ---- 1. Начальный JS: скрипт из index.html, modulepreload и их статические зависимости ----
const initial = new Set<string>();
const addFromHtml = (pattern: RegExp) => {
  for (const match of html.matchAll(pattern)) initial.add(match[1]!.replace(/^\//, ''));
};
addFromHtml(/<script[^>]*\ssrc="([^"]+\.js)"/g);
addFromHtml(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+\.js)"/g);

const queue = [...initial];
while (queue.length > 0) {
  const file = queue.pop()!;
  if (!existsSync(join(outDir, file))) continue;
  // Статический импорт: `from"./x.js"` или `import"./x.js"`; динамический `import("./x.js")` не считается.
  for (const m of read(file).matchAll(/(?:from|import)\s*["'](\.[^"']+\.js)["']/g)) {
    const dep = posix.normalize(posix.join(posix.dirname(file), m[1]!));
    if (!initial.has(dep)) {
      initial.add(dep);
      queue.push(dep);
    }
  }
}

let total = 0;
for (const file of [...initial].sort()) {
  const size = gzipSync(readFileSync(join(outDir, file)), { level: 9 }).length;
  total += size;
  console.log(`  начальный JS: ${file}  ${(size / 1024).toFixed(1)} КБ gzip`);
}
console.log(
  `Начальный JS всего: ${(total / 1024).toFixed(1)} КБ gzip (лимит ${LIMIT_BYTES / 1024} КБ)`,
);
check(initial.size > 0, 'в index.html не найден начальный скрипт');
check(
  total <= LIMIT_BYTES,
  `начальный JS ${(total / 1024).toFixed(1)} КБ gzip больше лимита ${LIMIT_BYTES / 1024} КБ`,
);

// ---- 2. Админка в отдельном чанке ----
const jsFiles = readdirSync(join(outDir, 'assets'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => `assets/${f}`);
const MARKER = 'core.admin.nav.label'; // строка из AdminEntry.tsx
const adminChunks = jsFiles.filter((f) => read(f).includes(MARKER));
check(
  adminChunks.length === 1,
  `код админки должен лежать ровно в одном чанке, найдено: ${adminChunks.length}`,
);
check(
  adminChunks.every((f) => !initial.has(f)),
  'чанк админки попал в начальный набор: он должен грузиться только на /admin',
);
console.log(`Админка: ${adminChunks.join(', ') || 'не найдена'}`);

// ---- 3. PWA ----
const manifest = JSON.parse(read('manifest.webmanifest')) as {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  theme_color?: string;
  background_color?: string;
  icons?: Array<{ src: string; sizes: string; purpose?: string }>;
};
check(Boolean(manifest.name && manifest.short_name), 'в манифесте нет name/short_name');
check(manifest.start_url === '/', 'start_url манифеста должен быть «/»');
check(manifest.display === 'standalone', 'display манифеста должен быть standalone');
check(
  Boolean(manifest.theme_color && manifest.background_color),
  'в манифесте нет theme_color/background_color',
);
const icons = manifest.icons ?? [];
check(
  icons.some((i) => i.sizes === '192x192'),
  'в манифесте нет иконки 192x192',
);
check(
  icons.some((i) => i.sizes === '512x512' && (i.purpose ?? 'any').includes('any')),
  'в манифесте нет иконки 512x512',
);
check(
  icons.some((i) => i.purpose === 'maskable'),
  'в манифесте нет maskable-иконки',
);
for (const icon of icons)
  check(existsSync(join(outDir, icon.src.replace(/^\//, ''))), `нет файла иконки ${icon.src}`);

check(/rel="manifest"/.test(html), 'в index.html нет ссылки на манифест');
check(/rel="apple-touch-icon"/.test(html), 'в index.html нет apple-touch-icon');
check(
  /name="apple-mobile-web-app-capable"\s+content="yes"/.test(html),
  'в index.html нет метки apple-mobile-web-app-capable',
);
check(
  /name="apple-mobile-web-app-title"/.test(html),
  'в index.html нет apple-mobile-web-app-title',
);
check(
  /name="viewport"[^>]*viewport-fit=cover/.test(html),
  'в index.html нет viewport с viewport-fit=cover',
);
check(existsSync(join(outDir, 'apple-touch-icon.png')), 'нет файла apple-touch-icon.png');

check(existsSync(join(outDir, 'sw.js')), 'service worker sw.js не собран');
if (existsSync(join(outDir, 'sw.js'))) {
  const sw = read('sw.js');
  check(
    /url:"index\.html"/.test(sw),
    'в кэше service worker нет index.html (оболочка не откроется без сети)',
  );
  check(
    /createHandlerBoundToURL\("\/index\.html"\)/.test(sw),
    'переходы по страницам без сети не отдаются из кэша оболочки',
  );
  for (const file of initial) {
    check(sw.includes(file), `начальный файл ${file} не попал в кэш service worker`);
  }
  check(
    sw.includes('sportpit-menu') && sw.includes('NetworkFirst'),
    'нет правила кэша для GET меню',
  );
  check(
    /api\\?\/v1\\?\/\(menu\|dishes\)/.test(sw),
    'правило кэша меню не нацелено на /api/v1/menu',
  );
  // Служебные файлы отдаёт сервер: service worker не должен подменять их оболочкой.
  check(
    /robots\\?\.txt/.test(sw) && /sitemap\\?\.xml/.test(sw),
    'robots.txt и sitemap.xml не добавлены в navigateFallbackDenylist service worker',
  );
  // Лендинг не должен лежать в предкэше установленного приложения: его чанки, стили и знаки бренда.
  // Чанки лендинга узнаём по классам `lp-`: они есть только в коде и стилях лендинга.
  const landingFiles = readdirSync(join(outDir, 'assets'))
    .filter((f) => /\.(js|css)$/.test(f))
    .map((f) => `assets/${f}`)
    .filter((f) => read(f).includes('lp-'));
  check(landingFiles.length > 0, 'не найден чанк лендинга (признак: классы lp-)');
  for (const file of landingFiles) {
    check(!initial.has(file), `код лендинга ${file} попал в начальный набор`);
    check(!sw.includes(file), `файл лендинга ${file} попал в предкэш service worker`);
  }
  check(!sw.includes('brand/'), 'знаки бренда лендинга (brand/) попали в предкэш service worker');
  console.log(`Лендинг вне предкэша: ${landingFiles.join(', ') || 'не найден'}`);
}

if (failures.length > 0) {
  console.error('\nПроверка сборки не пройдена:');
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
console.log(
  'Проверка сборки пройдена: размер, чанк админки, манифест, иконки, метки iOS, service worker.',
);
