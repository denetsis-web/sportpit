// Точка входа сервера: `npm run dev -w @sportpit/server` или `npm start`.
import { buildApp } from './app.ts';
import { loadConfig, loadDotEnv, redactedConfig } from './modules/system/index.ts';

loadDotEnv();
const config = loadConfig();

const app = await buildApp({
  config,
  databasePath: config.databasePath,
  serveWeb: true,
  logger: true,
});

app.log.info(redactedConfig(config), 'конфигурация');
if (config.nodeEnv === 'production') {
  if (config.payment.provider === 'stub')
    app.log.warn('PAYMENT_PROVIDER=stub: боевая оплата не подключена');
  if (config.sms.provider === 'stub') app.log.warn('SMS_PROVIDER=stub: SMS не уходят клиентам');
  if (!config.sessionSecret) app.log.warn('SESSION_SECRET не задан');
}

app.deps.system.scheduler.start();

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  app.log.info(`получен ${signal}, останавливаюсь`);
  await app.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.host, port: config.port });
