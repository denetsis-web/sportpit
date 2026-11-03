# Стенд sport.tenderguru.io: что нужно для запуска

Тестовый стенд SportPit (PWA для заказа боксов еды). Оплата и SMS на заглушках, деньги не берутся, реальные клиенты не заходят. Версия образа: тег, не `latest` (предлагаем `0.1.1-stand1`).

## Образ
- Сборка из исходников: `Dockerfile` в корне архива. `docker build -t sportpit:0.1.1-stand1 .` (внутри `npm ci` и сборка клиента, ~3–5 минут, нужен доступ в интернет для npm).
- Порт внутри контейнера: **5020** (`PORT`), слушает `0.0.0.0`.
- Пользователь внутри: `node` (uid 1000). Том **`/data`** монтируется с хоста (`/srv/sport/data`), права на запись для uid 1000.
- Проверка здоровья: `GET /api/health` → `{"status":"ok",...}` (в образе есть `HEALTHCHECK`). Корень `/` отдаёт клиент.

## Переменные окружения (только имена)
Заданы в образе: `NODE_ENV=production`, `HOST`, `PORT`, `DATABASE_PATH=/data/sportpit.db`, `BACKUP_DIR=/data/backups`, `UPLOADS_DIR=/data/uploads`, `FILE_STORAGE=local`.
Нужно задать в `/srv/sport/.env`: `PUBLIC_BASE_URL`, `ALLOW_STUB_IN_PRODUCTION`, `TRUST_PROXY`, `DEMO_OTP_PHONES`, `LOG_LEVEL`, `BACKUP_KEEP` (значения несекретные — в `deploy/stand.env.example`) и два секрета: `SESSION_SECRET`, `DEMO_OTP_CODE` (передаются отдельным защищённым каналом).
Без `SESSION_SECRET` сервер в production не стартует.

## Первый запуск (данные)
База создаётся при первом старте. Демо-данные и 4 демо-пользователя (админ, клиент, кухня, оператор):
```
docker compose exec app npm run seed
docker compose exec app npm run create-user -- --phone +37360000001 --role admin
docker compose exec app npm run create-user -- --phone +37360000002 --role client
docker compose exec app npm run create-user -- --phone +37360000003 --role kitchen
docker compose exec app npm run create-user -- --phone +37360000004 --role operator
```
Команды повторять безопасно. Вход по SMS-коду: для номеров из `DEMO_OTP_PHONES` код всегда `DEMO_OTP_CODE` (отправка SMS не нужна); остальным номерам код не приходит.

## nginx
- Проксировать на `127.0.0.1:5020`, передавать `X-Forwarded-For` (`$proxy_add_x_forwarded_for`) и `X-Forwarded-Proto`; `TRUST_PROXY=1` — один прокси перед контейнером.
- Рекомендуем закрыть сайт паролем (`auth_basic`) или списком IP: на стенде фиксированный код входа, админ-экраны открыты тому, кто вошёл.
- Загрузка файлов (фото жалоб): `client_max_body_size 10m`.

## Резервные копии
`npm run backup` внутри контейнера пишет в `/data/backups` (то же место, что и база; на другой диск не копируется). Для стенда достаточно копии каталога `/srv/sport/data`.
