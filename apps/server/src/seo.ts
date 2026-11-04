// SEO и шаринг: мета-теги в HTML для адресов лендинга, robots.txt и sitemap.xml.
// Боты соцсетей и поисковиков JavaScript не исполняют, поэтому теги подставляет сервер:
// `index.html` читается с диска один раз, на нужных адресах в него вставляются теги, остальные адреса не трогаем.
// Тексты берутся из словаря `landing` (`meta.*`), абсолютные адреса — из `config.publicBaseUrl`.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Lang } from '@sportpit/shared/i18n';
import type { Config } from './modules/system/index.ts';

export interface SeoOptions {
  config: Pick<Config, 'publicBaseUrl'>;
  /** Собранный `index.html`; читается один раз при первом обращении. */
  indexHtmlPath: string;
  /** Перевод по языку и полному ключу (`t` из `@sportpit/shared/i18n` после загрузки словарей). */
  dictionaries: (lang: Lang, key: string) => string;
  /** Папка раздачи клиента: по наличию `og.png` в ней решается, выводить ли картинку превью. */
  webDistDir: string;
  /** Подменять `index.html` на адресах лендинга (нет — только служебные файлы). По умолчанию да. */
  servePages?: boolean;
}

interface LandingPage {
  path: string;
  lang: Lang;
  /** Префикс ключей `landing.meta.*`. */
  metaKey: 'landing.meta' | 'landing.meta.legal';
  /** Адреса той же страницы на ru, ro и x-default (для `hreflang`). */
  alternates: { ru: string; ro: string; xDefault: string };
  indexable: boolean;
}

const LANDING = { ru: '/', ro: '/ro' } as const;
const LEGAL = { ru: '/legal', ro: '/ro/legal' } as const;

const PAGES: LandingPage[] = [
  {
    path: '/',
    lang: 'ru',
    metaKey: 'landing.meta',
    alternates: { ...LANDING, xDefault: LANDING.ru },
    indexable: true,
  },
  {
    path: '/ro',
    lang: 'ro',
    metaKey: 'landing.meta',
    alternates: { ...LANDING, xDefault: LANDING.ru },
    indexable: true,
  },
  {
    path: '/legal',
    lang: 'ru',
    metaKey: 'landing.meta.legal',
    alternates: { ...LEGAL, xDefault: LEGAL.ru },
    indexable: false,
  },
  {
    path: '/ro/legal',
    lang: 'ro',
    metaKey: 'landing.meta.legal',
    alternates: { ...LEGAL, xDefault: LEGAL.ru },
    indexable: false,
  },
];

/** Разделы, которые поисковикам не нужны: служебные, вход и личный кабинет. */
const DISALLOWED = [
  '/api/',
  '/admin',
  '/login',
  '/consent',
  '/onboarding',
  '/profile',
  '/orders',
  '/order',
  '/pay/',
  '/pickup',
  '/notifications',
  '/rate',
  '/support',
  '/tracker',
];

const LOCALES: Record<Lang, string> = { ru: 'ru_RU', ro: 'ro_RO' };

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Адрес сайта без конечных слэшей и переводов строк (значение идёт и в текстовый robots.txt). */
function baseUrlOf(config: Pick<Config, 'publicBaseUrl'>): string {
  return config.publicBaseUrl.replace(/[\r\n]/g, '').replace(/\/+$/, '');
}

function buildTags(
  page: LandingPage,
  base: string,
  t: SeoOptions['dictionaries'],
  hasImage: boolean,
): string {
  const abs = (path: string) => escapeHtml(`${base}${path}`);
  const title = escapeHtml(t(page.lang, `${page.metaKey}.title`));
  const description = escapeHtml(t(page.lang, `${page.metaKey}.description`));
  const siteName = escapeHtml(t(page.lang, 'landing.brand.name'));
  const url = abs(page.path);
  const otherLang: Lang = page.lang === 'ru' ? 'ro' : 'ru';
  const image = abs('/og.png');
  const lines = [
    `<meta name="description" content="${description}" />`,
    ...(page.indexable ? [] : ['<meta name="robots" content="noindex, follow" />']),
    `<link rel="canonical" href="${url}" />`,
    `<link rel="alternate" hreflang="ru" href="${abs(page.alternates.ru)}" />`,
    `<link rel="alternate" hreflang="ro" href="${abs(page.alternates.ro)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${abs(page.alternates.xDefault)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${siteName}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:locale" content="${LOCALES[page.lang]}" />`,
    `<meta property="og:locale:alternate" content="${LOCALES[otherLang]}" />`,
    ...(hasImage ? [`<meta property="og:image" content="${image}" />`] : []),
    `<meta name="twitter:card" content="${hasImage ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    ...(hasImage ? [`<meta name="twitter:image" content="${image}" />`] : []),
  ];
  return lines.join('\n    ');
}

/**
 * Подставляет теги страницы в оболочку: заголовок, описание и язык заменяются, остальное добавляется в <head>.
 * Без <head> (не собранная Vite-страница) вставлять некуда — оболочка отдаётся как есть.
 */
function applyTags(shell: string, page: LandingPage, tags: string, title: string): string {
  if (!/<\/head>/i.test(shell)) return shell;
  const html = shell
    .replace(/<title>[\s\S]*?<\/title>/i, () => '')
    .replace(/<meta\s+name=["']description["'][^>]*>\s*/i, () => '')
    .replace(/<html\b([^>]*)>/i, (_whole, attrs: string) => {
      const rest = attrs.replace(/\s+lang=(?:"[^"]*"|'[^']*')/i, '');
      return `<html lang="${page.lang}"${rest}>`;
    });
  return html.replace(/<\/head>/i, () => `<title>${title}</title>\n    ${tags}\n  </head>`);
}

function robotsTxt(base: string): string {
  return [
    'User-agent: *',
    ...DISALLOWED.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

function sitemapXml(base: string): string {
  const abs = (path: string) => escapeHtml(`${base}${path}`);
  const alternates = [
    `<xhtml:link rel="alternate" hreflang="ru" href="${abs(LANDING.ru)}"/>`,
    `<xhtml:link rel="alternate" hreflang="ro" href="${abs(LANDING.ro)}"/>`,
    `<xhtml:link rel="alternate" hreflang="x-default" href="${abs(LANDING.ru)}"/>`,
  ];
  const entry = (path: string) =>
    `  <url>\n    <loc>${abs(path)}</loc>\n${alternates.map((line) => `    ${line}\n`).join('')}  </url>\n`;
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    entry(LANDING.ru) +
    entry(LANDING.ro) +
    '</urlset>\n'
  );
}

/** Регистрирует `GET /robots.txt`, `GET /sitemap.xml` и подмену `index.html` на `/`, `/ro`, `/legal`, `/ro/legal`. */
export function registerSeo(app: FastifyInstance, options: SeoOptions): void {
  const base = baseUrlOf(options.config);

  app.get('/robots.txt', async (_req, reply) => {
    return reply
      .header('cache-control', 'no-cache')
      .type('text/plain; charset=utf-8')
      .send(robotsTxt(base));
  });
  app.get('/sitemap.xml', async (_req, reply) => {
    return reply
      .header('cache-control', 'no-cache')
      .type('application/xml; charset=utf-8')
      .send(sitemapXml(base));
  });

  if (options.servePages === false) return;
  let shell: string | undefined;
  for (const page of PAGES) {
    app.get(page.path, async (_req, reply) => {
      shell ??= readFileSync(options.indexHtmlPath, 'utf8');
      const hasImage = existsSync(join(options.webDistDir, 'og.png'));
      const title = escapeHtml(options.dictionaries(page.lang, `${page.metaKey}.title`));
      const tags = buildTags(page, base, options.dictionaries, hasImage);
      return reply
        .header('cache-control', 'no-cache')
        .type('text/html; charset=utf-8')
        .send(applyTags(shell, page, tags, title));
    });
  }
}
