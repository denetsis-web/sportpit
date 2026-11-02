// Точка входа сервера: `npm run dev -w @sportpit/server` или `npm start`.
import { buildApp } from './app.ts';
import {
  assertProductionConfig,
  loadConfig,
  loadDotEnv,
  redactedConfig,
} from './modules/system/index.ts';

loadDotEnv();
const config = loadConfig();
// production с заглушками, без https или без SESSION_SECRET не стартует (если нет ALLOW_STUB_IN_PRODUCTION=1)
assertProductionConfig(config);

const app = await buildApp({
  config,
  databasePath: config.databasePath,
  serveWeb: true,
  logger: true,
});

app.log.info(redactedConfig(config), 'конфигурация');
if (config.nodeEnv === 'production' && config.allowStubInProduction) {
  app.log.warn('ALLOW_STUB_IN_PRODUCTION=1: заглушки и http разрешены явно, это не боевой режим');
  if (config.payment.provider === 'stub')
    app.log.warn('PAYMENT_PROVIDER=stub: боевая оплата не подключена');
  if (config.sms.provider === 'stub') app.log.warn('SMS_PROVIDER=stub: SMS не уходят клиентам');
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
