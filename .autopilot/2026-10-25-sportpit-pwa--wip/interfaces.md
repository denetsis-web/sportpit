# Границы и правила проекта

Читают все исполнители первым файлом. Имена — на английском. Этот файл обновляется после каждого завершённого таска раздела «Что построено».

## Правила проекта

1. Корень репозитория — `C:\Users\Admin\Documents\Claude\Projects\SportPit`. Код живёт в `apps/server`, `apps/web`, `packages/shared`. Файлы исследования (`01-…04-*.md`), `.autopilot/`, `AGENTS.md`, `CLAUDE.md` не трогать.
2. npm workspaces, TypeScript строго (`strict: true`), Node ≥ 22.13, ESM. Менеджер пакетов — npm. Тесты — Vitest. Линтер — ESLint, форматирование — Prettier.
3. Деньги — целые числа в банях (`priceBani`), валюта MDL. Время — UTC в базе, правила сроков по Europe/Chisinau через `Clock`.
4. Баланс кредитов вычисляется только из журнала `credit_ledger`. Прямых обновлений баланса нет, исправления — компенсирующие записи.
5. Любая проверка прав и сроков — на сервере. Интерфейс только отражает.
6. Все строки интерфейса — в словарях `ru` и `ro` в `packages/shared/src/i18n`; ключи в обоих словарях идентичны. Текст в компонентах не пишется.
7. Секреты: только имена в `.env.example`. Значения не читаются, не пишутся, не логируются.
8. Внешние сервисы только через адаптеры `PaymentGateway`, `SmsSender`, `FileStorage` с заглушками по умолчанию.
9. Миграции — упорядоченные SQL-файлы `apps/server/migrations/NNN-name.sql`; применяются при старте; существующие не редактируются.
10. Один коммит на таск; сообщение коммита — что и почему, трейлер `Requirements: R..`.
11. Договорённость с пользователем: «толко по предзаказу» — покупка и заказ в день выдачи без заказа накануне не поддерживаются.
12. Фоновые задачи (`jobs.ts`) идемпотентны и сами догоняют пропущенное (перезапуск процесса, занятость в нужную минуту): работают от состояния в базе, а не от «сейчас ровно 03:00».
13. `GET /api/v1/files/*` отдаёт только публичные файлы (фото блюд). Файлы с ограничением доступа (фото жалоб) выдаёт модуль-владелец своим маршрутом с проверкой прав; ключи хранятся в `FileStorage`.
14. Хуки Fastify (`addHook`) регистрируются внутри контекста своего модуля и не действуют на маршруты других модулей; права проверяются `preHandler`-ом на маршруте или в контексте модуля.

## Стек, версии и команды

Тир T3, ~28K строк. Установка и проверка:

| Команда | Что делает |
|---|---|
| `npm install` | поставить зависимости всех пакетов |
| `npm run dev` | сервер (порт 3000) и клиент (порт 5173) вместе |
| `npm run check` | типы, линтер и все тесты одной командой (создаёт таск 01) |
| `npx vitest run <путь/к/файлу>` | один тестовый файл |
| `npm run seed` · `npm run create-user -- --phone +373… --role admin` | стартовые данные и первый пользователь |

Зависимости ставит **таск 01**, остальные таски ничего не добавляют (иначе `BLOCKED`):
- корень: `typescript`, `tsx`, `vitest`, `eslint`, `typescript-eslint`, `prettier`, `concurrently`, `@types/node`;
- сервер: `fastify`, `@fastify/cookie`, `@fastify/multipart`, `@fastify/static`, `zod`, `pino`;
- клиент: `vite`, `@vitejs/plugin-react`, `react`, `react-dom`, `react-router-dom`, `vite-plugin-pwa`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `vitest-axe`, `qrcode`, `recharts`;
- общий пакет: `zod`.
Версии — последние стабильные на момент установки, `package-lock.json` коммитится. Playwright не ставим; сквозные проверки в Chromium/WebKit — только если окружение их уже имеет, иначе пункт в списке ручной проверки отчёта.

## Автообнаружение и зоны (чтобы параллельные таски не правили общие файлы)

1. **Маршруты сервера.** Каждый модуль экспортирует `routes.ts` с `registerRoutes(app, deps)`; каркас (`apps/server/src/app.ts`, таск 01) подключает все `src/modules/*/routes.ts` автоматически. Общие файлы реестров таски не правят.
2. **Маршруты клиента.** Каждая фича экспортирует `routes.tsx`; оболочка собирает `src/features/**/routes.tsx` через `import.meta.glob`.
3. **Словари.** Строки лежат по пространствам имён: `packages/shared/src/i18n/<namespace>/ru.ts` и `ro.ts`; каркас собирает все пространства автоматически. Каждый таск добавляет только свои пространства.
4. **Схемы API.** `packages/shared/src/schemas/<namespace>.ts`, один файл на модуль.
5. **Миграции.** Номера блоками по таскам: 01 — 001–009, 02 — 010–019, 03 — 020–029, 04 — 030–039, 05 — 040–049, 06 — 050–059, 07 — 060–069, 08 — 070–079, 09 — 080–089, 10 — 090–099. Таски более поздней волны могут добавлять миграции только в свой блок.
7. **Общий пакет без центрального индекса.** `packages/shared/package.json` экспортирует подпути (`"./*": "./src/*.ts"`); потребители импортируют `@sportpit/shared/targets`, `@sportpit/shared/schemas/billing`, `@sportpit/shared/i18n`. Общий `index.ts` таски не правят.
6. **Планировщик.** Модуль, которому нужна фоновая задача, регистрирует её через `scheduler.register(name, cron, fn)` в своём `jobs.ts`; каркас подключает `src/modules/*/jobs.ts` автоматически.

## Границы, решённые в спецификации

### packages/shared
Владеет: типами домена, схемами валидации (zod), словарями i18n, расчётом нормы КБЖУ (`calcTargets`), форматированием денег и дат.
Отдаёт: `calcTargets(profile): Targets | { blocked: Reason }`, `formatMoney(bani, lang)`, `formatDate(iso, lang)`, `t(lang, key, params)`, схемы запросов и ответов API (`schemas.*`), перечисления (`Role`, `OrderStatus`, `WriteOffReason`, `LedgerReason`).
Скрывает: детали библиотек валидации.

### apps/server — модули (каждый в своей папке `src/modules/<name>`, публичный интерфейс в `index.ts`)

| Модуль | Владеет | Отдаёт | Скрывает |
|---|---|---|---|
| `db` | подключением SQLite, миграциями, транзакциями | `db.tx(fn)`, `db.query` | драйвер `node:sqlite` |
| `clock` | текущим временем и поясом | `Clock.now()`, `Clock.localDate()`, `Clock.cutoffFor(dateISO, cutoff)` | системные часы |
| `auth` | OTP, сессиями, ролями, согласиями | `requestOtp(phone)`, `verifyOtp(phone, code)`, `requireRole(...roles)`, `currentUser(req)` | хранение кодов, лимиты |
| `profile` | анкетой, нормой, удалением аккаунта, выгрузкой данных | `saveProfile`, `getTargets`, `deleteAccount`, `exportData` | формулы (в shared) |
| `catalog` | блюдами, меню на дни, лимитами порций, рейтингами блюд | `listMenu(date, filters)`, `getDish(id)`, `upsertDish`, `publishMenu`, `portionsLeft(date, dishId)` | подсчёт рейтинга |
| `billing` | пакетами, покупками, лотами кредитов, журналом, промокодами, возвратами, платёжным адаптером | `listPackages`, `startPurchase`, `handleGatewayCallback`, `balance(userId)`, `reserve`, `release`, `consume`, `refund`, `applyPromo` | выбор лота, идемпотентность |
| `orders` | заказами, сроками, вместимостью, кодами выдачи | `confirmOrder`, `cancelOrder`, `moveOrder`, `listOrders`, `capacityLeft(fridgeId, date)` | правила срока и лимитов |
| `fulfillment` | партиями, загрузкой, выдачей, списаниями, закрытием дня, температурой | `markCooked`, `markLoaded`, `pickupByClient`, `pickupByCode`, `closeDay`, `logTemperature` | статусы партий |
| `kitchen` | сводкой производства и этикетками | `productionSummary(date)`, `labelData(batchId)` | расчёт запаса |
| `feedback` | оценками, жалобами, решениями | `rateDish`, `createComplaint`, `resolveComplaint` | загрузка фото (через `FileStorage`) |
| `tracker` | дневными итогами питания и ручными записями | `dayTotals(userId, date)`, `weekTotals`, `addEntry`, `deleteEntry` | — |
| `reports` | отчётами и выгрузкой CSV | `salesReport`, `wasteReport`, `ratingsReport`, `shareReport`, `retentionReport`, `toCsv` | SQL-запросы |
| `admin` | залами, холодильниками, настройками, пользователями, журналом действий | CRUD, `audit(userId, action, target)`, `getSetting`, `setSetting` | — |
| `notifications` | внутренними уведомлениями | `notify(userId, type, payload)`, `list`, `markRead` | — |
| `system` | событиями системы, здоровьем, задачами по расписанию, резервными копиями | `logEvent(kind, detail)`, `scheduler.start()`, `backup()` | планировщик |
| `adapters` | `PaymentGateway`, `SmsSender`, `FileStorage` и их заглушками | интерфейсы и фабрики | выбор по переменным окружения |

Зависимости: `orders` → `billing`, `catalog`, `admin`, `clock`; `fulfillment` → `orders`, `billing`; `kitchen` → `orders`, `fulfillment`, `catalog`; `reports` → всё читает только на чтение; `auth` и `system` ни от кого не зависят. Циклов нет.

### apps/web — модули
`src/app` — оболочка, маршруты, тема, переключатель языка, PWA и service worker.
`src/api` — клиент API, один модуль, весь доступ к серверу здесь.
`src/features/client/*` — вход, анкета, меню, пакеты, заказ, мои заказы, выдача, оценка и жалоба, трекер, профиль.
`src/features/admin/*` — кухня, оператор, администратор (меню, цены, залы, холодильники, промокоды, жалобы, отчёты, события).
`src/ui` — общие компоненты (кнопка, поле, карточка, диалог) с доступностью.
Админка грузится отдельным чанком.

## Контракты между тасками

Решены заранее, чтобы параллельные и последовательные таски не расходились:

1. **Рейтинг блюда.** Таск 03 создаёт таблицу `dish_rating_stats` и отдаёт `catalog.getDishRating(dishId): { avg: number | null, count: number }` и `catalog.applyRating(dishId, newStars, previousStars | null)`. Таск 09 вызывает только `applyRating`, таблицу не трогает.
2. **Остаток порций.** `catalog.listMenu` принимает зарегистрированный поставщик занятых порций: `catalog.registerReservedProvider(fn(date, dishId) => number)`, по умолчанию 0. Таск 06 регистрирует его при старте; в ответ меню попадает `portionsLeft`.
3. **Кредиты.** Таск 05 отдаёт `billing.balance(userId)`, `billing.reserve(userId, count, orderId)`, `billing.release(orderId)`, `billing.consume(orderId)`, `billing.grantComplaintCredit(userId, complaintId)`. Таск 06 пользуется ими, а `billing/pause.ts` добавляет сам.
4. **Статусы заказа.** Перечисление в `@sportpit/shared/schemas/orders`: `confirmed`, `cancelled`, `loaded`, `picked_up`, `written_off`. Таск 06 создаёт и отменяет, таск 08 ставит `loaded`, `picked_up`, `written_off` через `orders.transition(orderId, to, actor)`.
5. **Партии.** Таск 07 отдаёт `kitchen.batchesFor(fridgeId, date)` и `kitchen.markCooked`; таск 08 читает их при загрузке холодильника.
6. **Уведомления.** Таск 02 отдаёт `notifications.notify(userId, type, payload)`; типы: `credits_expiring`, `rate_dish`, `complaint_resolved`, `system_alert`. Остальные таски только вызывают.
7. **Сроки и вместимость.** Таск 03 хранит параметры холодильника (`capacityBoxes`, `cutoffTime`, `pickupFrom`, `pickupTo`, `accessCode`) и настройки (`maxBoxesPerDay`, `toleranceNote`, `stockBufferPercent`, `labelSize`, `supportContacts`); таск 06 читает их через `admin.getFridge`, `admin.getSetting` и сам применяет правила.
8. **Журнал действий администратора.** Таск 03 отдаёт `admin.audit(userId, action, target)`; таски 05 и 09 вызывают его для возвратов, цен и решений по жалобам.

9. **Выгрузка и удаление данных клиента.** Таск 04 отдаёт `profile.registerExportProvider(name, fn(userId) => object)` и `profile.registerDeletionHook(name, fn(userId, db) => void)`; модули с данными пользователя (заказы — 06, оценки, жалобы и трекер — 09, уведомления — отдельная правка) регистрируют провайдер и хук при старте. Хук **синхронный** и выполняется в той же транзакции, что удаление: функция, вернувшая промис, считается ошибкой. Имя: `^[a-z][a-z0-9_]{0,39}$`, повтор отвергается. Профиль собирает выгрузку из провайдеров.
   Решение за владельцем (пока не принято, в concerns.md): что делать с неиспользованными кредитами и активными заказами при удалении аккаунта. Сейчас: активные заказы на будущее отменяются хуком таска 06, неиспользованные кредиты сгорают вместе с аккаунтом.
10. **Фото блюд — публичные** (`/api/v1/files/*`), фото жалоб — приватные: их отдаёт модуль `feedback` своим маршрутом с проверкой прав.

## Швы для тестов

1. HTTP API целиком через `fastify.inject` с базой в памяти (`:memory:`) — основной шов для серверных тестов.
2. `Clock` — подмена времени для сроков, сгорания и закрытия дня.
3. `PaymentGateway` — управляемая заглушка (успех, отказ, повтор колбэка).
4. `SmsSender` — перехват отправленных кодов.
5. Компоненты web — Testing Library; сквозные сценарии — Playwright (если браузеры доступны).

## Что построено

### Таск 01 — каркас (коммит смотри `git log --grep="T01"`)

Версии: TypeScript 6, Vitest 5, ESLint 10, Vite 8, vite-plugin-pwa 2. Vitest требует `fsModuleCache:false` (иначе `import.meta.glob` не видит новые файлы) — настроено в проектах, не менять. `npm run check` = типы + eslint + vitest + `check:bundle` (размер начального JS ≤ 250 КБ gzip, чанк админки, манифест, иконки, iOS-метки, service worker). Начальный JS сейчас 103,5 КБ.

**Сервер.** `buildApp({config?, databasePath=':memory:', clock?, payment?, sms?, storage?, extraModulesDirs?, extraI18nDirs?, backupDir?, webDistDir?, serveWeb?, logger?}) → AppInstance` с `.deps`; `AppDeps{config, db, clock, payment, sms, storage, system}`. Модуль: `src/modules/<name>/routes.ts` с `registerRoutes(app, deps)` (маршруты под `/api/v1`; запись требует `X-Requested-With`, кроме `/api/v1/webhooks/*`) и `jobs.ts` с `registerJobs(scheduler, deps)`. `/api/health`. `Db{query, get, run, exec, tx(sync), migrationsApplied}`. `Clock{now, localDate, cutoffFor(dateISO, 'HH:MM')}` (срок = D−1 в это время по Кишинёву), `createManualClock`. `PaymentGateway{createPayment, getPayment, parseCallback, refund}` и `StubPaymentGateway(setOutcome, complete, callbackFor, failNext)`. `SmsSender{send}` и `StubSmsSender(outbox, failNext, last)`. `FileStorage{put, get, delete, urlFor}`, `GET /api/v1/files/*`. Система: `AppError`/`errors.*`, `EventLog(log, list, counts24h, subscribe)`, `Scheduler(register, tick, start, runNow)`, `createBackup`, `loadConfig`/`ENV_VARIABLES`.

**Общий пакет.** `@sportpit/shared/i18n` (`t`, `registerDictionaries`, `DictionaryOf`, `LANG_STORAGE_KEY`), `@sportpit/shared/format` (`formatMoney`, `formatDate`, `formatTime`, `formatDateTime`), `@sportpit/shared/time`, `@sportpit/shared/types` (`Role`, `WriteOffReason`, `LedgerReason`, `ApiErrorBody`). `OrderStatus` оставлен таску 06.

**Клиент.** Фича экспортирует из `routes.tsx` `routes` и `nav`. `useT`/`useI18n`, `useTheme`, `useInstall().request()` (вызвать после первого успешного заказа), `NoAccessPage`, `api/{api, ApiError, NetworkError}`, `ui/{Button, TextField, Card, Dialog, Banner}`. Язык сохраняется в `localStorage`; сохранение в профиле — таск 02/04 через `onLangChange`.

### Таск 02 — вход, роли, уведомления

**Сервер `auth`.** `requireRole(...roles)` (401 без входа, 403 без роли; без аргументов — любой вошедший), `requireFridgeAccess(id | (req)=>id)`, `assertFridgeAccess(req, id)`, `requireConsent('health_data'|…)` (403 `consent_required`), `currentUser(req)`, `authFor(deps)` → `requestOtp`, `verifyOtp`, `setRole`, `setOperatorFridges`, `listUsers`, `userIdsByRole`, `consents`, `hasConsent`, `recordConsents`, `changePhone(userId, newPhone, code)`, `anonymizeUser(userId)`, `purgeExpired`. Все ставятся в `preHandler` маршрута, глобальных хуков нет.
**Сервер `notifications`.** `notify(deps, userId, type, payload)` и `notificationsFor(deps)` → `notify`, `list`, `markRead`, `markAllRead`, `unreadCount`. Payload плоский; поле `link` («/путь») даёт кнопку «Открыть».
**API `/api/v1`.** `POST auth/otp/request`, `auth/otp/verify {phone, code, lang?}`, `auth/logout`; `GET|PATCH auth/me`; `GET|POST auth/consents ({changes:[{kind, granted, version}]})`; админ: `GET auth/users`, `PUT auth/users/:id/role`, `PUT auth/users/:id/fridges`; `GET notifications?limit&unread`, `POST notifications/:id/read`, `notifications/read-all`. Cookie `sp_session` (Secure, только если `PUBLIC_BASE_URL` начинается с https). Таблицы: `users`, `operator_fridges` (`fridge_id TEXT` без внешнего ключа — идентификаторы холодильников **текстовые**), `otp_codes`, `sessions`, `consents`, `notifications`.
**Клиент.** `RequireRole` (`features/client/auth/guards.tsx`), `ConsentsForm` (для анкеты `kinds=['health_data']`), `useSession`, `NotificationsBell`, `AdminNavItem{to, labelKey, order, roles?}` и `filterNavByRole` (`admin/shell/menu.ts`); пункт админки без `roles` виден только admin (`kitchen/` и `operator/` — своим ролям).
**Оговорки.** Колокольчик не встроен в шапку Shell и AdminEntry не фильтрует меню по роли (правки файлов таска 01) — в `concerns.md`. Роли и выдача прав без записи в журнал действий (нужен `admin.audit` из таска 03).

### Таск 04 — профиль и норма КБЖУ

`profileFor(deps)` → `saveProfile`, `getProfile`, `getTargets`, `deleteProfile`, `purgeRevoked`, `deleteAccount`, `exportData`, `registerExportProvider(name, fn(userId))`, `registerDeletionHook(name, fn(userId, db))` (синхронный, в той же транзакции). API `/api/v1`: `GET|PUT|DELETE profile`, `POST profile/phone/request {phone}`, `POST profile/phone {phone, code}`, `GET profile/export` (JSON-вложение), `POST profile/account/delete {confirm:true}`. Схемы `@sportpit/shared/schemas/profile`; `calcTargets`, `isBlocked` и константы — `@sportpit/shared/targets`. Клиент: `/profile` (nav order 80), `/onboarding`. Таблица `profiles`. Отзыв согласия `health_data` стирает анкету.

### Таск 05 — пакеты, оплата, кредиты

`billingFor(deps)` и функции `balance`, `reserve`, `release`, `consume`, `grantComplaintCredit`, `refund`, `applyPromo` (`(deps, …)`). `reserve(userId, count, orderId)` → доли по лотам, 409 `insufficient_credits`; повтор того же числа безопасен; после `release` заказ можно резервировать снова, после `consume` нельзя. `release(orderId)` → `{released, expired}`. `consume(orderId)` → `{credits, lots[{lotId, credits, unitPriceBani}]}` — цена кредита лота для выручки в отчётах (07, 10); то же даёт `orderCredits(orderId)`. `grantComplaintCredit` → `{granted, lotId}`, повтор по тому же id не удваивает. `setAuditSink(deps, sink)` (по умолчанию подключается `admin.audit`, если модуль есть). Задачи `billing-expire` (02:30) и `billing-pending` (каждые 10 минут). API `/api/v1`: `GET /packages`, `/credits`, `/credits/history`, `/purchases`, `/purchases/:id`; `POST /promo/apply`, `/purchases`, `/purchases/:id/cancel`, `/purchases/:id/stub-pay`, `/webhooks/payment`; админ: `/admin/{packages,promos,purchases,refunds}` и `/admin/refunds/:id/retry`. Клиент: `/packages`, `/pay/:id`, `/pay/stub/:id`; админка: packages, promos, refunds. Провайдер выгрузки «billing».

**Известные оговорки таска 01.** Cron 03:00 не сработает в единственную пропущенную минуту весеннего перевода часов. Chromium/WebKit не прогонялись (R58), пункт ручной проверки — в `README.md`. Скорость на 4G не замерена. Название SportPit — рабочее, бренд/юрлицо/контакты не вписаны.
