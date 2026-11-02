<!-- autopilot:start -->
# SportPit

PWA для заказа и выдачи сбалансированных боксов еды (КБЖУ) через холодильники в спортзалах Кишинёва; кафе-партнёры готовят, клиенты покупают пакеты боксов.

Монорепозиторий npm workspaces: `apps/server` (Fastify, SQLite `node:sqlite`), `apps/web` (React + Vite PWA), `packages/shared` (схемы zod, словари ru/ro, КБЖУ, форматы). Node ≥ 22.13, ESM, TypeScript strict.

## Команды (из корня, все проверены)

```bash
npm install
npm run seed                                               # демо-зал, 2 холодильника, 10 блюд, меню на 3 дня; повтор безопасен
npm run create-user -- --phone +37360000001 --role admin   # роли: client, kitchen, operator, admin
npm run dev                                                # сервер 127.0.0.1:3000 + клиент 127.0.0.1:5173 (/api проксируется)
curl localhost:3000/api/health                             # {"status":"ok",...}
npm run check                                              # typecheck + lint + test + check:bundle (каждый и отдельно); ~1,5 мин
npx vitest run <путь/к/файлу.test.ts>                      # один тест (проекты: packages/shared, apps/server, apps/web)
npx vitest run apps/server/tests/e2e                       # сквозной путь клиента, 11 тестов
npm run build && npm start                                 # боевой режим: сервер сам раздаёт apps/web/dist
```

## Где что

- Каркас сервера, подключение модулей, ошибки, заголовки: `apps/server/src/app.ts` (`buildApp`), вход — `apps/server/src/index.ts`.
- Новая серверная функция: папка `apps/server/src/modules/<имя>/` с `routes.ts` (`registerRoutes(app, deps)`) и/или `jobs.ts` (`registerJobs(scheduler, deps)`); публичный интерфейс — `index.ts`; реестров нет. Таблицы — `apps/server/migrations/NNN-имя.sql`.
- Клиентская функция: `apps/web/src/features/client/<имя>/routes.tsx` (экспорт `routes`, `nav`) или `features/admin/<имя>/routes.tsx` (админка — отдельный чанк, вход `apps/web/src/app/admin/AdminEntry.tsx`); весь доступ к серверу — `apps/web/src/api`.
- Общее для сервера и клиента: схемы API `packages/shared/src/schemas/<модуль>.ts`, строки `packages/shared/src/i18n/<пространство>/{ru,ro}.ts`, расчёт нормы `targets.ts`, деньги и даты `format.ts`, `time.ts`. Импорт — подпутём: `@sportpit/shared/schemas/orders` (общего `index.ts` нет).
- Бизнес-логика: кредиты и лоты — `apps/server/src/modules/billing/ledger.ts`; заказы и сроки — `.../orders/service.ts`; кухня — `.../kitchen/service.ts`; загрузка и выдача — `.../fulfillment/service.ts`.
- Внешние сервисы: `apps/server/src/modules/adapters/{payment,sms,storage}.ts` (интерфейсы и заглушки); конфигурация — `apps/server/src/modules/system/config.ts`; планировщик — `.../system/scheduler.ts`.
- Тесты: серверные — `apps/server/tests/<модуль>/` с `helpers.ts` (`makeFulfillmentApp` в `apps/server/tests/fulfillment/helpers.ts` — приложение с подменой часов, оплаты, SMS); веб — `apps/web/tests/<фича>/`; сквозной путь — `apps/server/tests/e2e/journey.ts`. Тестовые модули — `apps/server/tests/fixtures/`.

## Подводные камни

- Git Bash превращает `/auth/...` в `C:/Program Files/Git/auth/...`: перед curl/скриптами с путями `export MSYS_NO_PATHCONV=1`.
- Vitest требует `fsModuleCache: false` в конфигах проектов — иначе `import.meta.glob` и обход папок модулей не видят новые файлы. Не убирать.
- В `npm run check` веб-тесты под нагрузкой иногда падают по таймауту; одиночный `npx vitest run <файл>` проходит — сначала перезапусти его отдельно.
- Заказ принимается только на завтра и позже, до срока приёма холодильника (по умолчанию 18:00 дня D−1, Кишинёв). Время запущенного приложения не подменить: сценарии с датами — только тестами с `createManualClock` (`apps/server/src/modules/clock/index.ts`), `buildApp({ clock })`. Покупка и заказ в день выдачи не поддерживаются намеренно (ADR 0004).
- Код входа SMS-заглушка пишет в журнал сервера строкой `[sms-stub] +373…: SportPit: код входа NNNNNN` — только при `NODE_ENV=development` (в тестах и production не пишется).
- Любая запись (POST/PUT/PATCH/DELETE) в `/api/v1` без заголовка `X-Requested-With` получает 403; исключение — `/api/v1/webhooks/*`.
- Миграции применяются при старте и сверяются по sha256: существующий файл править нельзя (старт упадёт). Новая — следующий свободный номер после `100-…`, повтор номера — ошибка.
- Баланс кредитов нигде не хранится: сумма `credit_ledger.delta`; исправления — компенсирующие записи. Деньги — целые бани (`priceBani`), валюта MDL. Партия кухни — одна на блюдо и дату, не на холодильник.
- `db.tx(fn)` синхронна: `async` внутри — ошибка. Хуки удаления аккаунта (`profile.registerDeletionHook`) тоже синхронные.
- Fastify-хуки (`addHook`) — только внутри контекста своего модуля; чужие маршруты они задевать не должны. Права — `preHandler` маршрута (`requireRole`, `requireFridgeAccess`).
- ESLint запрещает: `process.env` вне `apps/server/src/modules/system/config.ts` (берите `deps.config`); буквенный текст и `aria-label`/`title`/`placeholder`/`alt` литералами в `apps/web/src/**/*.tsx` (только `t(...)` из `useT()`). Ключи в `ru` и `ro` должны совпадать (проверяют тесты).
- `check:bundle` сам собирает клиент и держит начальный JS ≤ 250 КБ gzip: админку не тянуть в основной чанк.
- В production сервер не стартует без `SESSION_SECRET`, а с заглушками оплаты/SMS или без https в `PUBLIC_BASE_URL` — без `ALLOW_STUB_IN_PRODUCTION=1`.

## Окружение

Читает только `apps/server/src/modules/system/config.ts`; шаблон — `.env.example` (только имена, значения не читать и не писать). Без `.env` работают умолчания.

- `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`, `PUBLIC_BASE_URL`, `TRUST_PROXY` — режим, адрес, доверие к `X-Forwarded-For`.
- `DATABASE_PATH`, `BACKUP_DIR`, `BACKUP_KEEP`, `UPLOADS_DIR`, `FILE_STORAGE` — база, копии, файлы (пути от корня репозитория).
- `SESSION_SECRET` — подпись cookie; `ALLOW_STUB_IN_PRODUCTION` — осознанно пустить заглушки в production.
- `PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET`, `STUB_PAYMENT_OUTCOME` — оплата; `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID` — SMS (пусто или `stub` = заглушка).

Архитектура и правила модулей — `docs/architecture.md`; почему так решили — `docs/adr/`; словарь предметной области — `CONTEXT.md`.

## Как здесь работает Autopilot

Сборка ведётся навыком `/autopilot`. Требования, спецификация и таски — в `.autopilot/`.
Прогресс — `.autopilot/dashboard.html`. Требование из `manifest.md` может снять
только пользователь. Прерванную сборку продолжает «продолжи автопилот».

### Правка без автопилота

Мелкий баг или доводка после сборки — обычная сессия, без прогона.

Сначала прочитай:
1. `.autopilot/PROGRESS.md` — что не доделано, известные баги, о чём договорились с пользователем.
2. Что правили после последней сборки — первая строка таблицы в «История git».
3. Только если правка их касается: почему сделано так — `docs/adr/`; что значат слова — `CONTEXT.md`;
   что именно просили — `manifest.md` в папке сборки (указана в начале `PROGRESS.md`).

После правки:
- коммит — по правилам из «История git»;
- строка в «Правки без автопилота» в `PROGRESS.md`: дата — что — почему;
- починенный пункт из «Не доделано» или «Известные баги» — удали;
- договорились с пользователем о том, что следующая сборка не должна пересматривать, —
  строка в «Договорились», его словами.

### История git

Целиком не читай — бери срез под вопрос:

| Вопрос | Команда |
|---|---|
| что правили после последней сборки | `git log --oneline "$(git log -1 --format=%h --grep='^Autopilot: сборка сдана')"..HEAD -- . ':(exclude).autopilot'` |
| всё, что делали ради требования | `git log --oneline --grep="R02"` |
| история файла | `git log --oneline -10 -- <файл>` |
| когда появился или исчез код | `git log --oneline -S "<фрагмент>"` |
| почему строка такая | `git blame -L <с>,<по> <файл>`, затем `git show <sha>` |
| что внутри коммита | `git show --stat <sha>` |

Срез длиннее ~30 коммитов — отдай его субагенту и возьми выжимку в десять строк.

Коммит: заголовок — что (`fix: даты в одном формате`), тело — почему, трейлер
`--trailer "Requirements: R02"`, если правка касается требования из `manifest.md`.
Заголовок `Autopilot: сборка сдана` пишет только автопилот — по нему находят последнюю сборку.
<!-- autopilot:end -->
