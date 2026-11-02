# Архитектура SportPit

Модульный монолит: один процесс Fastify, одна база SQLite (`node:sqlite`), клиент React/Vite PWA. Решения и их причины — `docs/adr/`, словарь предметной области — `CONTEXT.md`. Здесь: как устроено и какие правила нельзя нарушать.

## Состав

- `packages/shared` — типы домена, схемы zod запросов/ответов, словари ru/ro, `calcTargets` (норма КБЖУ), форматы денег и дат. Без общего `index.ts`: импорт подпутём (`@sportpit/shared/schemas/billing`, `.../i18n`, `.../targets`); `package.json` экспортирует `./*` → `src/*.ts`.
- `apps/server/src/app.ts` — `buildApp(options) → AppInstance` с `.deps` (`AppDeps`: `config, db, clock, payment, sms, storage, system`). Тот же `buildApp` — и в тестах (база `:memory:`, заглушки), и в `apps/server/src/index.ts` (боевой запуск).
- `apps/web` — оболочка `apps/web/src/app`, клиент API `apps/web/src/api`, фичи `apps/web/src/features/{client,admin}/*`, общие компоненты `apps/web/src/ui`. Админка (`/admin`) грузится лениво отдельным чанком.

## Поток данных

1. Вход: `auth` — SMS-код (OTP) → cookie-сессия `sp_session`; роли `client`, `kitchen`, `operator`, `admin`; оператору холодильники назначает админ. Анкета и норма КБЖУ — `profile` (нужно согласие `health_data`, отзыв стирает анкету).
2. Покупка пакета: `billing` создаёт покупку → `PaymentGateway.createPayment` → колбэк `POST /webhooks/payment` (или `stub-pay` в заглушке) → зачисляется лот кредитов (кредиты, цена кредита, срок сгорания 45 дней). Расхождение суммы или валюты — кредиты не зачисляются, покупка остаётся `pending` и истекает.
3. Кредиты: баланс = сумма `credit_ledger.delta`, прямых обновлений нет. Тратятся сначала из лота, что сгорает раньше. Операции: `reserve(userId, count, orderId)` → `release(orderId)` | `consume(orderId)`; возврат — `refund`, замена по жалобе — `grantComplaintCredit` (идемпотентно).
4. Предзаказ: `orders.confirmOrder` проверяет срок приёма холодильника (`admin.cutoffAt`, D−1 по Кишинёву), вместимость, остаток порций блюда (`catalog.portionsLeft`), лимит боксов в день, паузу; резервирует кредиты и выдаёт 4-значный код получения. Статусы: `confirmed → loaded → picked_up`, `confirmed|loaded → written_off`, `confirmed → cancelled`; все переходы — только через `orders.transition`.
5. Кухня: `kitchen` по закрытию приёма всех активных холодильников даты строит сводку производства (запас на брак — `stockBufferPercent`) и партии (одна на блюдо и дату); задача `kitchen-close`, `markCooked`, этикетки.
6. Загрузка и выдача: `fulfillment` — оператор отмечает холодильник загруженным (только после срока приёма, на сегодня/завтра), выдаёт по коду либо клиент забирает сам по заказу. Выдача = `billing.consume` + `transition picked_up` в одной транзакции; списание тоже тратит кредит (возврат — только `grantComplaintCredit`). Задача `fulfillment-close-day` закрывает день и списывает остаток. Температура холодильника — `temperature_logs`, выход из диапазона → событие `temperature_out_of_range`.
7. После выдачи: `notifications` → `rate_dish`; `feedback` — оценки (только `picked_up`; звёзды идут в `catalog.applyRating`) и жалобы (на `loaded|picked_up|written_off`, фото приватно); `tracker` — дневные/недельные итоги питания из выданных заказов и ручных записей; `reports` — продажи, списания, рейтинги, доли залов, удержание, CSV; читают данные других модулей только на чтение.

## Модули сервера

Каждый модуль — папка `apps/server/src/modules/<имя>/`: публичный интерфейс в `index.ts`, остальное внутреннее. Соседи импортируют только из `index.ts`; зависят так: `orders → billing, catalog, admin, clock`; `fulfillment → orders, billing`; `kitchen → orders, fulfillment, catalog`; `reports` читает всё; `auth`, `system` ни от кого. Циклов нет. Межмодульные связи, которые иначе дали бы цикл, идут через регистрацию поставщиков при старте:

- `catalog.registerReservedProvider` (занятые порции, ставит `orders`), `registerCookedAtProvider` (`kitchen`), `registerReviewsProvider` (`feedback`);
- `profile.registerExportProvider(name, fn)` и `registerDeletionHook(name, fn)`; `notifications.registerPrivacy(deps)`;
- `billing.setAuditSink` (по умолчанию `admin.audit`).

## Правила

- **Автообнаружение.** `app.ts` сам подключает `modules/*/routes.ts` (`registerRoutes(app, deps)`, префикс `/api/v1`) и `modules/*/jobs.ts` (`registerJobs(scheduler, deps)`); клиент собирает `features/**/routes.tsx` через `import.meta.glob` (экспорт `routes`, `nav`; дубль пути — ошибка); словари — `packages/shared/src/i18n/<пространство>/{ru,ro}.ts` (сервер обходит папки, клиент — glob). Реестров нет: чтобы добавить функцию, положите файл в свою папку.
- **Изоляция хуков.** Каждый модуль регистрируется в своём контексте Fastify: его `addHook` не видит чужих маршрутов. Общий хук один — в `/api/v1` требует `X-Requested-With` на записи (кроме `/api/v1/webhooks/*`). Права — `preHandler` на маршруте: `requireRole`, `requireFridgeAccess`, `requireConsent`.
- **Права и сроки только на сервере.** Интерфейс лишь отражает; ошибки — `AppError`/`errors.*` с кодом и ключом словаря, тело `{error: {code, messageKey, message, params?, fields?}}`.
- **Миграции.** `apps/server/migrations/NNN-имя.sql`, применяются при старте по порядку, хранятся с sha256 — существующие не редактируются, номер не повторяется. Блоки номеров по модулям: `001` система, `010–011` auth/уведомления, `020` каталог/админ, `030` профиль, `040` billing, `050` заказы, `060` кухня, `070` выдача, `080–081` feedback/трекер, `090` отчёты, `100` правка OTP.
- **Транзакции.** `db.tx(fn)` синхронна (без `await`), вложенный `tx` — savepoint. Денежные и статусные изменения (выдача, резерв, возврат) идут одной транзакцией.
- **Время.** В базе UTC; сроки и «день» считаются по Europe/Chisinau через `Clock` (`now`, `localDate`, `cutoffFor`). В тестах — `createManualClock`.
- **Адаптеры внешнего мира** — `apps/server/src/modules/adapters`: `PaymentGateway` (`createPayment, getPayment, parseCallback, refund`), `SmsSender` (`send`), `FileStorage` (`put, get, delete, urlFor`). Выбор по `PAYMENT_PROVIDER`, `SMS_PROVIDER`, `FILE_STORAGE`; по умолчанию заглушки (`StubPaymentGateway`, `StubSmsSender`, локальные файлы или память в тестах). Сбои адаптеров пишутся в журнал событий. В production заглушки без `ALLOW_STUB_IN_PRODUCTION=1` не стартуют.
- **Файлы.** `GET /api/v1/files/*` отдаёт только публичный префикс `dishes/`; приватные файлы (фото жалоб) выдаёт модуль-владелец своим маршрутом с проверкой прав.
- **Фоновые задачи.** `deps.system.scheduler.register(name, cron, fn)`, cron по времени Кишинёва, внутри процесса, без библиотек. Задача идемпотентна и догоняет пропущенное от состояния в базе, а не от «ровно сейчас»; сбой уходит в журнал событий. Заданы: `billing-expire` (02:30), `billing-pending` (каждые 10 минут), `kitchen-close` и `fulfillment-close-day` (каждую минуту), `feedback-trash`, резервная копия базы (03:00, хранится `BACKUP_KEEP`), чистка `auth-cleanup` (03:20) и `profile-purge-revoked` (03:40).
- **Конфигурация.** Переменные окружения читает только `apps/server/src/modules/system/config.ts` (`loadConfig`, `productionProblems`, `assertProductionConfig`); остальной код берёт `deps.config`. Значения секретов не логируются (`redactedConfig`).
- **Журналы.** `system` — события (`logEvent`, `EventLog`), здоровье `/api/health`; `admin.audit` — действия администратора (цены, роли, возвраты, решения по жалобам).
- **Лимит запросов.** `createRateLimiter` на вход по IP и на смену телефона по пользователю; адрес клиента из `X-Forwarded-For` только при `TRUST_PROXY`.

## Клиент

- Весь доступ к серверу — `apps/web/src/api` (`api`, `ApiError`, `NetworkError`); загрузка данных — `useResource` из `apps/web/src/ui`.
- Строки только через `useT()`/`t(...)`, язык в `localStorage` (`LANG_STORAGE_KEY`) и в профиле; ESLint запрещает текст в JSX.
- Состояние на клиенте: `sportpit.fridge` (выбранный холодильник, QR ведёт на `/menu?fridge=<id>`), `sportpit.cart` (корзина); остальное — на сервере.
- PWA: service worker кэширует оболочку и GET меню/блюд (NetworkFirst); `/api/*` в навигационный fallback не попадает. Бюджет начального JS и наличие манифеста проверяет `scripts/check-bundle.ts`.
- Меню админки собирают `nav`-пункты с `roles`; пункт без `roles` виден только admin.

## Соглашения

- Имена в коде английские, тексты и комментарии русские; деньги — целые бани (`priceBani`), валюта MDL; идентификаторы холодильников — текстовые.
- Схемы запросов и ответов лежат в `packages/shared/src/schemas/<модуль>.ts`, по одному файлу на модуль; сервер валидирует запросы ими через `parseWith`, клиент берёт из них типы.
- Тесты: серверные идут через `fastify.inject` с базой в памяти; подмена `Clock`, управляемые `PaymentGateway`/`SmsSender`; веб — Testing Library и `vitest-axe`; сквозной путь — `apps/server/tests/e2e`. Хелперы модуля — `apps/server/tests/<модуль>/helpers.ts`.
- Режимы, которые выбраны сознательно: заказ только накануне (ADR 0004), выдача по коду без интеграции с замком (ADR 0005), пакеты вместо подписки (ADR 0003), SQLite вместо PostgreSQL (ADR 0001).
