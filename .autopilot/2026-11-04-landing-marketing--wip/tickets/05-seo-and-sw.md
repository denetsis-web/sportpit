# 05 — SEO: мета-теги, hreflang, sitemap, robots, служебные файлы и service worker

**Требования:** R26, R27, R28, R31
**Зависит от:** 02
**Зона:** `apps/server/src/seo.ts` · `apps/server/src/app.ts` · `apps/web/vite.config.ts` · `scripts/check-bundle.ts` · `apps/server/tests/seo/`
**Волна:** 3
**Ревью:** нет
**Модель:** обычная

## Что должно заработать

Ссылка на сайт в Telegram и Instagram показывает превью: сервер подставляет в `index.html` для `/`, `/ro`, `/legal`, `/ro/legal` заголовок, описание, Open Graph, Twitter-карточку, `canonical`, `hreflang` ru/ro/x-default и `lang`. `GET /robots.txt` и `GET /sitemap.xml` отдают правильный текст. Service worker не перехватывает эти файлы и не кладёт чанк лендинга в предкэш.

## Из брифа, дословно

> «Основы SEO и шаринга: мета, Open Graph, hreflang ru/ro, sitemap, robots, быстрый первый экран (бюджет начального JS из check:bundle не ломать — лендинг лучше отдельным чанком).»

## Разделы спецификации

Истории 41–43, 44; «Решения по реализации» (подстановка мета-тегов, предкэш); `interfaces.md` — сервер: SEO.

## Критерии приёмки

- [ ] `GET /` (с `webDistDir` из теста) отдаёт HTML с русскими `title`, `description`, `og:title`, `og:description`, `og:url`, `og:locale`, `twitter:card`, `canonical` на `/`, тремя `hreflang` и `lang="ru"`; тексты берутся из словаря `landing` (`meta.*`)
- [ ] `GET /ro` отдаёт то же на румынском с `canonical` на `/ro`, `lang="ro"`
- [ ] `/legal` и `/ro/legal` получают свои теги (с `noindex`); остальные адреса отдаются как раньше, без изменений
- [ ] `og:image` выводится только когда файл `og.png` есть в раздаче; без него тега нет
- [ ] Абсолютные адреса строятся из `config.publicBaseUrl`; значение не вставляется в HTML без экранирования
- [ ] `GET /robots.txt` отдаёт `text/plain`: запрет `/api/`, `/admin`, `/login`, `/consent` и личных разделов, строка `Sitemap:`; `GET /sitemap.xml` — `application/xml` с адресами `/` и `/ro` и взаимными `hreflang`; ни тот, ни другой не возвращает `index.html`
- [ ] В `vite.config.ts` `/robots.txt` и `/sitemap.xml` добавлены в `navigateFallbackDenylist`, чанк лендинга и его ресурсы исключены из предкэша (`globIgnores`); существующие проверки `check:bundle` остаются зелёными
- [ ] `npm run check:bundle` проходит; тест раздачи `tests/app.test.ts` не сломан

## Ограничения

Не менять поведение раздачи для остальных адресов. Картинку `og.png` не создавать.
