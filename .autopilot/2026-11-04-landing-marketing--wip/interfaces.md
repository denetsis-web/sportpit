# Границы и правила сборки

Читать первым. Подробности по коду — `notes.md`; что строим — `spec.md`. Имена на английском, как в существующем коде.

## Правила проекта (из «Договорились» прошлой сборки, дословно)

- «На старте будем работать толко по предзаказу» — R10, R39: покупка и заказ в день выдачи не поддерживаются (ADR 0004)
- Режим «авто» для сборки; стратегия «пакеты боксов + холодильник в зале» зафиксирована владельцем
- Замена блюда по жалобе = кредит-замена (+1), отдельного заказа-замены нет — D01, ADR 0009
- Web Push и интеграция с электрозамком вне MVP; выдача по коду и кнопке «Забрал» (ADR 0005)

## Правила проекта (из `AGENTS.md`, коротко)

Миграции — следующий свободный номер после `100-…`, существующие файлы не править; ESLint запрещает буквенный текст и `aria-label/title/placeholder/alt/label` литералами в `apps/web/src/**/*.tsx` (только `t(...)` из `useT()`); ключи ru и ro совпадают; `process.env` только в `system/config.ts`; `db.tx` синхронна; Fastify-хуки только в контексте своего модуля; права — `preHandler` (`requireRole`); записи в `/api/v1` требуют `X-Requested-With`; деньги — целые бани; `fsModuleCache: false` в vitest не убирать; импорт общего — подпутём `@sportpit/shared/...`. Заметки о запуске: на машине нет Python и Docker; npm-скрипты вызывать через `cmd` или Git Bash, не через PowerShell `npm.ps1`.

## Стек и команды

Node ≥ 22.13 (локально 24), ESM, TypeScript strict; Fastify 5, `node:sqlite`; React + Vite + vite-plugin-pwa; Vitest, ESLint, Prettier; zod. Установка: `npm install` (из корня). Одна проверка на всё: `npm run check` (типы + линтер + тесты + `check:bundle`, ~1,5 мин). Один тестовый файл: `npx vitest run <путь/к/файлу.test.ts>`. Сквозной тест клиента: `npx vitest run apps/server/tests/e2e`. Только размер бандла: `npm run check:bundle`. Запуск вручную: `npm run seed`, `npm run dev` (сервер 127.0.0.1:3000, клиент 127.0.0.1:5173). Веб-тесты под нагрузкой иногда падают по таймауту — сначала перезапусти файл отдельно. Нельзя трогать: существующие миграции, `fsModuleCache: false`, маркер `core.admin.nav.label` в `check-bundle.ts`, ключи `localStorage` `sportpit.lang`/`sportpit.theme`/`sportpit.fridge`/`sportpit.cart`/`sportpit.install.shown`. Новые ключи `localStorage` лендинга: `sportpit.aid`, `sportpit.analytics`, `sportpit.src`.

## Принятые в этой сборке правила

1. **Поверхности без вошедшего**: лендинг и его API не требуют входа, не ставят cookie, не вызывают сторонние домены.
2. **Персональные данные**: телефон, имя, зал, цель из листа ожидания; `anonId` аналитики. Ввод калькулятора персональным не хранится нигде. Согласие на аналитику — плашка и `localStorage`; согласие на лист — галочка в форме, версия `WAITLIST_CONSENT_VERSION`.
3. **Публичные ответы не раскрывают** наличие номера в листе ожидания.
4. **Тексты**: не придумывать ответы FAQ, юридические тексты, контакты; заглушка `[ВПИШИ]` (константа `PLACEHOLDER` из `schemas/admin.ts`). Никаких медицинских обещаний, «минус N кг», сравнений с конкурентами.

## Границы, решённые в спецификации

### packages/shared (общее)

Файл `packages/shared/src/schemas/growth.ts` (экспорт; импорт `@sportpit/shared/schemas/growth`):
- `ATTRIBUTION_SOURCES = ['gym','trainer','tg','ig','direct','other'] as const`; `type AttributionSource`.
- `attributionSchema` = `{ source: z.enum(ATTRIBUTION_SOURCES), ref?: string | null (^[a-z0-9_-]{1,40}$), campaign?: string | null (^[a-z0-9_-]{1,40}$), anonId?: string | null (uuid) }`; `type Attribution`.
- `waitlistJoinSchema` = `{ phone: phoneSchema, name?: string (trim, ≤60), gym?: string (trim, ≤80), goal?: Goal, lang: 'ru'|'ro', consent: z.literal(true), website?: string, attribution?: attributionSchema }`; `type WaitlistJoin`.
- `trackEventSchema` = `{ kind: 'landing_view' | 'calc_used', attribution: attributionSchema }`; `TRACK_KINDS`.
- `waitlistEntrySchema` (`id, phone, name|null, gym|null, goal|null, lang, source, ref|null, campaign|null, createdAt, path: { usedCalc: boolean, signedUp: boolean, purchased: boolean } | null` — `null`, если у записи нет `anonId`; хранится `anon_id` в таблице, наружу не отдаётся), `waitlistListQuerySchema` (`q?, gym?, goal?, lang?, source?, from?, to?, page`), `waitlistListSchema` (`items, total, page, pageSize`).
- `funnelRowSchema` = `{ source: AttributionSource | 'total', landingViews, calcUsed, waitlistJoins, signups, firstPurchases, unique: { visitors, calc, waitlist, signups, purchases } }` (число разных `anonId` на этапе; без согласия людей в `unique` нет), `funnelReportSchema` = `{ from, to, rows }`.
- `WAITLIST_CONSENT_VERSION = '2026-11-04'`; `ANALYTICS_STORAGE_KEYS` не нужен в shared (ключи живут в клиенте).
- Словари: `packages/shared/src/i18n/landing/{ru,ro}.ts` (публичные тексты лендинга, калькулятора, формы, плашки, `/legal`, `meta.*`) и `packages/shared/src/i18n/growth/{ru,ro}.ts` (админ-экраны листа и воронки, серверные сообщения).

### Сервер: модуль `apps/server/src/modules/growth/`

Владеет: таблицами `waitlist_entries`, `funnel_events`, `signup_attribution` (миграция `101-growth.sql`), лимитерами записи в лист и событий.
Публичный интерфейс (`index.ts`):
- `recordSignup(db, clock, userId, attribution | undefined): void` — синхронная, вызывается внутри `db.tx` создания нового пользователя (вставляет `signup_attribution` и событие `signup`); без атрибуции пишет источник `direct`.
- `registerRoutes` (автообнаружение), `registerDeletionHook` на удаление аккаунта стирает строку `signup_attribution` пользователя.
Маршруты (`routes.ts`):
- `POST /api/v1/waitlist` (публичный) → 200 `{ ok: true }` во всех «хороших» и дублирующих случаях; 400 при невалидных данных/без согласия; 429 при лимите.
- `POST /api/v1/track` (публичный) → 204; 400 при неверном теле; 429 при лимите.
- `GET /api/v1/admin/waitlist`, `GET /api/v1/admin/waitlist/csv`, `DELETE /api/v1/admin/waitlist/:id` (204, пишет `admin_audit` через `writeAudit`), `GET /api/v1/admin/funnel?from&to` — `preHandler: requireRole('admin')`.
Скрывает: SQL, лимитеры, разбор дубликатов, формулу воронки (регистрации и первые покупки считаются по `signup_attribution` и `purchases`, у которых `status='paid'`, `MIN(paid_at)` по пользователю).

### Сервер: связь с `auth`

`otpVerifySchema` (`schemas/auth.ts`) получает необязательное поле `attribution` (`attributionSchema`). `AuthApi.verifyOtp` принимает его; в ветке создания нового пользователя вызывает `recordSignup` в той же транзакции. Существующему пользователю ничего не пишется. Ответ API не меняется.

### Сервер: лимит входа (G01)

`LOGIN_RATE_MAX` в `system/ratelimit`-экспорте (`system/index.ts`) становится 60; окно 10 минут. Тесты `tests/auth/ratelimit.test.ts` обновляются (61-й запрос → 429).

### Сервер: SEO

`apps/server/src/seo.ts`: `registerSeo(app, { config, indexHtmlPath, dictionaries, webDistDir })` — регистрирует `GET /robots.txt`, `GET /sitemap.xml` и подмену `index.html` для `/`, `/ro`, `/legal`, `/ro/legal`; вызывается из `app.ts` до `setNotFoundHandler`. Абсолютный адрес — `config.publicBaseUrl`. Скрывает: шаблон тегов и список адресов. Для остальных адресов поведение раздачи не меняется.

### Клиент: лендинг `apps/web/src/features/client/landing/`

- `routes.tsx`: `export const routes` для `ro`, `legal`, `ro/legal` (страницы ленивые). Главная `/` остаётся за `features/client/home` (`HomePage` ветвится: `useShowLanding()` истинно → ленивый `LandingEntry`, иначе прежний контент).
- `useShowLanding.ts`: `useShowLanding(): { showLanding: boolean; pending: boolean }` — истинно на адресах лендинга, когда сессия готова, пользователя нет и приложение не в `standalone` (`isStandalone()` из `app/install.tsx`); `pending` — пока `useSession().status === 'loading'` на этих адресах. Единственное место решения.
- `Shell` (`app/Shell.tsx`) при `showLanding || pending` на адресах лендинга рендерит только `<Outlet/>` (без шапки, меню, баннеров, `LanguageChoiceDialog`).
- `tracker.ts` (без React): `captureAttribution(url, storage)`, `getAttribution(): Attribution`, `getAnalyticsConsent(): 'yes'|'no'|null`, `setAnalyticsConsent(v)`, `track(kind)`; ключи `localStorage`: `sportpit.analytics`, `sportpit.aid`, `sportpit.src`; `sessionStorage`: `sportpit.src`. Все чтения/записи в `try/catch`.
- `api.ts`: `joinWaitlist(input)`, `sendTrack(kind, attribution)`; через `api`.
- Секции лендинга — компоненты в этой папке; тексты — только `t('landing.…')`.
- Вход (`LoginPage`) передаёт `getAttribution()` в `/auth/otp/verify`.

### Клиент: админка `apps/web/src/features/admin/growth/`

`routes.tsx` (`routes`, `nav` для `admin/waitlist` и `admin/funnel`, `roles: ['admin']`, `order` свободный, не 35 и не 60), `WaitlistPage.tsx`, `FunnelPage.tsx`, `api.ts`, стили рядом.

### Швы для тестов

- HTTP: `app.inject` на `POST /api/v1/waitlist`, `POST /api/v1/track`, `GET /api/v1/admin/waitlist|funnel`, `POST /api/v1/auth/otp/verify` с атрибуцией.
- SEO: `app.inject` на `/`, `/ro`, `/robots.txt`, `/sitemap.xml` с временным `webDistDir` (образец `tests/app.test.ts:255-300`).
- Клиент: `renderApp({ initialEntries, clientModules, adminModules })` с фейковым сервером `installFake`.
- Время: `createManualClock`, `buildApp({ clock })`.

## Что построено (заполняется по ходу сборки)

### T01 — сервер growth (коммит ниже в истории, «T01: …»)

- `growth/index.ts`: `recordSignup(db, clock, userId, attribution|undefined): void`; `AuthApi.verifyOtp(phone, code, lang?, attribution?)`.
- `@sportpit/shared/schemas/growth`: `ATTRIBUTION_SOURCES`, `attributionSchema` (определена в `schemas/auth.ts` из-за цикла импорта, реэкспортируется), `waitlistJoinSchema`, `trackEventSchema`, `TRACK_KINDS`, `waitlistEntrySchema`, `waitlistListQuerySchema`, `waitlistListSchema`, `waitlistCsvQuerySchema`, `funnelQuerySchema`, `funnelRowSchema`, `funnelReportSchema`, `WAITLIST_CONSENT_VERSION`, `WAITLIST_PAGE_SIZE = 50`.
- HTTP: `POST /waitlist` (200 `{ok:true}`), `POST /track` (204), `GET /admin/waitlist`, `GET /admin/waitlist/csv` (язык заголовков — параметр `labels=ru|ro`, потому что `lang` занят фильтром), `DELETE /admin/waitlist/:id` (204), `GET /admin/funnel` → `{from,to,rows}`: 6 источников в порядке `ATTRIBUTION_SOURCES` + `total`, всегда все строки.
- Словарь `growth` (готов для таска 03): `nav.waitlist`, `nav.funnel`, `waitlist.*`, `funnel.*`, `goal.*`, `lang.*`, `source.*`, `csv.*`, `error.*`.
- Лимит входа по IP: `LOGIN_IP_RATE_MAX = 60` в `system/index.ts` (`LOGIN_RATE_MAX = 10` остался для смены телефона).
- Шрифты `@fontsource-variable/montserrat` и `@fontsource-variable/manrope` установлены в `apps/web`. ADR 0010 записан.
### T03 — админка листа ожидания и воронки

- `features/admin/growth/routes.tsx`: `routes` (`admin/waitlist`, `admin/funnel`), `nav` (`growth.nav.waitlist` order 70, `growth.nav.funnel` order 71, `roles: ['admin']`); `api.ts`: `fetchWaitlist`, `deleteWaitlistEntry`, `waitlistCsvUrl(filters, labels)`, `fetchFunnel`. Доли перехода считаются по событиям и могут быть больше 100 %.

- Оговорки T01: регистрации в воронке считаются по `signup_attribution` (удалённый аккаунт из счёта уходит); запись листа ожидания при удалении аккаунта не стирается, стирает админ.
