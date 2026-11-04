import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '@sportpit/shared/i18n';
import { buildApp, type AppInstance } from '../../src/app.ts';
import { loadConfig } from '../../src/modules/system/index.ts';

const SHELL =
  '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="UTF-8" />\n<title>SportPit</title>\n' +
  '<meta name="description" content="Вкусно. Свежо. Чётко по КБЖУ" />\n</head>\n<body><div id="root"></div></body>\n</html>';

const open: AppInstance[] = [];
const cleanup: Array<() => void> = [];
afterEach(async () => {
  while (open.length) await open.pop()!.close();
  while (cleanup.length) cleanup.pop()!();
});

interface Setup {
  publicBaseUrl?: string;
  ogImage?: boolean;
  serveWeb?: boolean;
}

async function make({
  publicBaseUrl = 'https://sportpit.example',
  ogImage = false,
  serveWeb = true,
}: Setup = {}) {
  const dist = mkdtempSync(join(tmpdir(), 'sportpit-seo-'));
  cleanup.push(() => rmSync(dist, { recursive: true, force: true }));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), SHELL);
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'export {}');
  if (ogImage) writeFileSync(join(dist, 'og.png'), 'png');
  const base = join(tmpdir(), 'sportpit-test');
  const config = loadConfig({
    NODE_ENV: 'test',
    FILE_STORAGE: 'memory',
    BACKUP_DIR: join(base, 'backups'),
    UPLOADS_DIR: join(base, 'uploads'),
    PUBLIC_BASE_URL: publicBaseUrl,
  });
  const app = await buildApp({ config, webDistDir: dist, serveWeb });
  open.push(app);
  return app;
}

const get = (app: AppInstance, url: string) => app.inject({ method: 'GET', url });

describe('мета-теги в HTML для ботов соцсетей и поисковиков', () => {
  it('русская главная: заголовок, описание, Open Graph, Twitter, canonical, hreflang, lang', async () => {
    const app = await make();
    const res = await get(app, '/');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.headers['cache-control']).toBe('no-cache');
    const html = res.body;
    const title = t('ru', 'landing.meta.title');
    const description = t('ru', 'landing.meta.description');
    expect(html).toContain('<html lang="ru">');
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).not.toContain('<title>SportPit</title>');
    expect(html).toContain(`<meta name="description" content="${description}" />`);
    expect(html).not.toContain('Вкусно. Свежо.');
    expect(html).toContain(`<meta property="og:title" content="${title}" />`);
    expect(html).toContain(`<meta property="og:description" content="${description}" />`);
    expect(html).toContain('<meta property="og:url" content="https://sportpit.example/" />');
    expect(html).toContain('<meta property="og:locale" content="ru_RU" />');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect(html).toContain('<link rel="canonical" href="https://sportpit.example/" />');
    expect(html).toContain(
      '<link rel="alternate" hreflang="ru" href="https://sportpit.example/" />',
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="ro" href="https://sportpit.example/ro" />',
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://sportpit.example/" />',
    );
    expect(html).not.toContain('noindex');
    expect(html).toContain('<div id="root">');
  });

  it('румынская версия: свои тексты, canonical на /ro, lang="ro"', async () => {
    const app = await make();
    const html = (await get(app, '/ro')).body;
    expect(html).toContain('<html lang="ro">');
    expect(html).toContain(`<title>${t('ro', 'landing.meta.title')}</title>`);
    expect(html).toContain('<meta property="og:locale" content="ro_RO" />');
    expect(html).toContain('<meta property="og:url" content="https://sportpit.example/ro" />');
    expect(html).toContain('<link rel="canonical" href="https://sportpit.example/ro" />');
    expect(html).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://sportpit.example/" />',
    );
    expect(html).not.toContain('Вкусно. Свежо.');
  });

  it('страницы политики: свои тексты, noindex, canonical на себя', async () => {
    const app = await make();
    const ru = (await get(app, '/legal')).body;
    expect(ru).toContain(`<title>${t('ru', 'landing.meta.legal.title')}</title>`);
    expect(ru).toContain('<meta name="robots" content="noindex, follow" />');
    expect(ru).toContain('<link rel="canonical" href="https://sportpit.example/legal" />');
    const ro = (await get(app, '/ro/legal')).body;
    expect(ro).toContain('<html lang="ro">');
    expect(ro).toContain(`<title>${t('ro', 'landing.meta.legal.title')}</title>`);
    expect(ro).toContain('<meta name="robots" content="noindex, follow" />');
    expect(ro).toContain('<link rel="canonical" href="https://sportpit.example/ro/legal" />');
  });

  it('остальные адреса отдаются как раньше, без подстановки', async () => {
    const app = await make();
    for (const url of ['/menu', '/login', '/admin/kitchen']) {
      const res = await get(app, url);
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).toBe(SHELL);
    }
  });

  it('параметры адреса (utm, src) не мешают подстановке', async () => {
    const app = await make();
    const res = await get(app, '/ro?src=tg&utm_source=telegram');
    expect(res.body).toContain('<link rel="canonical" href="https://sportpit.example/ro" />');
  });

  it('og:image и twitter:image только когда og.png лежит в раздаче', async () => {
    const without = (await get(await make(), '/')).body;
    expect(without).not.toContain('og:image');
    expect(without).not.toContain('twitter:image');
    const withImage = (await get(await make({ ogImage: true }), '/')).body;
    expect(withImage).toContain(
      '<meta property="og:image" content="https://sportpit.example/og.png" />',
    );
    expect(withImage).toContain(
      '<meta name="twitter:image" content="https://sportpit.example/og.png" />',
    );
    expect(withImage).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('адрес из PUBLIC_BASE_URL экранируется и не ломает разметку', async () => {
    const app = await make({ publicBaseUrl: 'https://x.example/"><script>alert(1)</script>/' });
    const html = (await get(app, '/')).body;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('https://x.example/&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;/ro');
    const sitemap = (await get(app, '/sitemap.xml')).body;
    expect(sitemap).not.toContain('<script>');
  });

  it('без раздачи клиента главная по-прежнему 404, а служебные файлы отдаются', async () => {
    const app = await make({ serveWeb: false });
    expect((await get(app, '/')).statusCode).toBe(404);
    expect((await get(app, '/robots.txt')).statusCode).toBe(200);
  });
});

describe('robots.txt и sitemap.xml', () => {
  it('robots.txt: text/plain, запрет служебных и личных разделов, ссылка на sitemap', async () => {
    const app = await make();
    const res = await get(app, '/robots.txt');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    const lines = res.body.split('\n');
    for (const path of ['/api/', '/admin', '/login', '/consent', '/profile', '/pay/', '/pickup']) {
      expect(lines, path).toContain(`Disallow: ${path}`);
    }
    expect(lines).toContain('User-agent: *');
    expect(lines).toContain('Sitemap: https://sportpit.example/sitemap.xml');
    expect(res.body).not.toContain('<html');
  });

  it('sitemap.xml: application/xml, адреса / и /ro с взаимными hreflang', async () => {
    const app = await make();
    const res = await get(app, '/sitemap.xml');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/xml/);
    const xml = res.body;
    expect(xml).toContain('<loc>https://sportpit.example/</loc>');
    expect(xml).toContain('<loc>https://sportpit.example/ro</loc>');
    const blocks = xml.split('<url>').slice(1);
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block).toContain('hreflang="ru" href="https://sportpit.example/"');
      expect(block).toContain('hreflang="ro" href="https://sportpit.example/ro"');
    }
    expect(xml).not.toContain('<html');
    expect(xml).not.toContain('/legal');
  });
});
