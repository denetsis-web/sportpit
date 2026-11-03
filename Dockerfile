# Стенд SportPit: один контейнер, Fastify раздаёт и API, и собранный клиент.
# Данные (SQLite, резервные копии, файлы) — в томе /data; работает от пользователя node (uid 1000).
FROM node:24-bookworm-slim

WORKDIR /app
COPY . .
# dev-зависимости нужны и для сборки клиента, и для запуска сервера (tsx)
RUN npm ci && npm run build && mkdir -p /data && chown -R node:node /data /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5020 \
    DATABASE_PATH=/data/sportpit.db \
    BACKUP_DIR=/data/backups \
    UPLOADS_DIR=/data/uploads \
    FILE_STORAGE=local

USER node
VOLUME /data
EXPOSE 5020

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5020/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/tsx", "apps/server/src/index.ts"]
