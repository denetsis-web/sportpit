// Каркас сервера. `buildApp` собирает Fastify, базу, часы, адаптеры, журнал событий и планировщик,
// затем подключает модули из src/modules/*/routes.ts и jobs.ts без какого-либо реестра.
// В тестах: `await buildApp({ clock, sms, payment, storage })` — база по умолчанию `:memory:`.
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import pino from 'pino';
import { ZodError } from 'zod';
import { t } from '@sportpit/shared/i18n';
import type { ApiErrorBody } from '@sportpit/shared/types';
import {
  createAdapters,
  instrumentAdapters,
  type FileStorage,
  type PaymentGateway,
  type SmsSender,
} from './modules/adapters/index.ts';
import { createSystemClock, type Clock } from './modules/clock/index.ts';
import { openDb, type Db } from './modules/db/index.ts';
import {
  AppError,
  createSystem,
  discoverModules,
  EVENT_KINDS,
  errorDetail,
  loadConfig,
  loadDictionaries,
  loadExport,
  MODULES_DIR,
  pickLang,
  type Config,
  type Scheduler,
  type SystemApi,
} from './modules/system/index.ts';
import { registerSeo } from './seo.ts';

/** Всё, что получает каждый модуль в `registerRoutes(app, deps)` и `registerJobs(scheduler, deps)`. */
export interface AppDeps {
  config: Config;
  db: Db;
  clock: Clock;
  /** Оплата с записью сбоев в журнал событий. */
  payment: PaymentGateway;
  /** SMS с записью сбоев в журнал событий. */
  sms: SmsSender;
  storage: FileStorage;
  system: SystemApi;
}

export type AppInstance = FastifyInstance & { deps: AppDeps };

export interface BuildAppOptions {
  /** Готовая конфигурация. По умолчанию — тестовая: заглушки, файлы в памяти, папки во временном каталоге. */
  config?: Config;
  /** `:memory:` по умолчанию. */
  databasePath?: string;
  backupDir?: string;
  /** Папка собранного клиента (по умолчанию apps/web/dist). */
  webDistDir?: string;
  migrationsDir?: string;
  clock?: Clock;
  payment?: PaymentGateway;
  sms?: SmsSender;
  storage?: FileStorage;
  /** Дополнительные папки с модулями (тестовые модули). */
  extraModulesDirs?: string[];
  /** Дополнительные папки со словарями (`<папка>/<пространство>/ru.ts`). */
  extraI18nDirs?: string[];
  /** Раздавать собранный клиент (apps/web/dist) и отдавать index.html для неизвестных путей. */
  serveWeb?: boolean;
  logger?: boolean | { level: string };
}

type RoutesFn = (app: AppInstance, deps: AppDeps) => void | Promise<void>;
type JobsFn = (scheduler: Scheduler, deps: AppDeps) => void;

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function testConfig(): Config {
  const base = join(tmpdir(), 'sportpit-test');
  return loadConfig({
    NODE_ENV: 'test',
    FILE_STORAGE: 'memory',
    BACKUP_DIR: join(base, 'backups'),
    UPLOADS_DIR: join(base, 'uploads'),
  });
}

function errorBody(
  lang: ReturnType<typeof pickLang>,
  code: string,
  messageKey: string,
  extra: Pick<ApiErrorBody['error'], 'params' | 'fields'> = {},
): ApiErrorBody {
  return {
    error: {
      code,
      messageKey,
      message: t(lang, messageKey, extra.params),
      ...(extra.params ? { params: extra.params } : {}),
      ...(extra.fields ? { fields: extra.fields } : {}),
    },
  };
}

export async function buildApp(options: BuildAppOptions = {}): Promise<AppInstance> {
  const config: Config = {
    ...(options.config ?? testConfig()),
    ...(options.backupDir ? { backupDir: options.backupDir } : {}),
    ...(options.webDistDir ? { webDistDir: options.webDistDir } : {}),
  };
  const logLevel =
    options.logger === true
      ? config.logLevel
      : typeof options.logger === 'object'
        ? options.logger.level
        : 'silent';

  const logger = pino({
    level: logLevel,
    redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["set-cookie"]'],
  });
  const app = Fastify({
    loggerInstance: logger,
    // адрес клиента из X-Forwarded-For берётся, только если владелец сказал, что стоит свой прокси (TRUST_PROXY)
    // (число прокси в цепочке Fastify поддерживает, но не описывает в типах)
    trustProxy: config.trustProxy as boolean | string,
  }) as unknown as AppInstance;

  const clock = options.clock ?? createSystemClock();
  const db = openDb(options.databasePath ?? ':memory:', {
    ...(options.migrationsDir ? { migrationsDir: options.migrationsDir } : {}),
  });
  const system = createSystem({ db, clock, config, logger });
  // заглушка SMS пишет коды в консоль только в разработке: в тестах шум, в production утечка кодов в журнал
  const adapters = createAdapters(config, { silent: config.nodeEnv !== 'development' });
  const instrumented = instrumentAdapters(
    {
      payment: options.payment ?? adapters.payment,
      sms: options.sms ?? adapters.sms,
    },
    system.events,
  );
  const deps: AppDeps = {
    config,
    db,
    clock,
    payment: instrumented.payment,
    sms: instrumented.sms,
    storage: options.storage ?? adapters.storage,
    system,
  };
  app.decorate('deps', deps);

  app.addHook('onClose', async () => {
    system.scheduler.stop();
    db.close();
  });

  // Словари: общие пространства из packages/shared + тестовые.
  await loadDictionaries();
  for (const dir of options.extraI18nDirs ?? []) await loadDictionaries(dir);

  // Общие заголовки безопасности.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'same-origin');
    reply.header('x-frame-options', 'DENY');
  });

  await app.register(fastifyCookie, config.sessionSecret ? { secret: config.sessionSecret } : {});
  await app.register(fastifyMultipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  const langOf = (req: { headers: Record<string, unknown>; query: unknown }) =>
    pickLang(
      req.headers['accept-language'] as string | undefined,
      (req.query as { lang?: unknown } | undefined)?.lang,
    );

  app.setErrorHandler((error, req, reply) => {
    const lang = langOf(req);
    if (error instanceof AppError) {
      return reply.code(error.status).send(
        errorBody(lang, error.code, error.messageKey, {
          ...(error.params ? { params: error.params } : {}),
          ...(error.fields ? { fields: error.fields } : {}),
        }),
      );
    }
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) fields[issue.path.join('.') || '_'] = issue.message;
      return reply
        .code(400)
        .send(errorBody(lang, 'validation_failed', 'core.error.validation', { fields }));
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.code(status).send(errorBody(lang, 'bad_request', 'core.error.badRequest'));
    }
    req.log.error({ err: errorDetail(error) }, 'необработанная ошибка');
    system.logEvent(EVENT_KINDS.serverError, {
      method: req.method,
      url: req.url.split('?')[0],
      ...errorDetail(error),
    });
    return reply.code(500).send(errorBody(lang, 'internal_error', 'core.error.generic'));
  });

  const webIndex = join(config.webDistDir, 'index.html');
  const serveWeb = options.serveWeb === true && existsSync(webIndex);

  registerSeo(app, {
    config,
    indexHtmlPath: webIndex,
    dictionaries: t,
    webDistDir: config.webDistDir,
    servePages: serveWeb,
  });

  app.setNotFoundHandler((req, reply) => {
    if (serveWeb && req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.header('cache-control', 'no-cache').type('text/html').sendFile('index.html');
    }
    return reply.code(404).send(errorBody(langOf(req), 'not_found', 'core.error.notFound'));
  });

  app.get('/api/health', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    try {
      db.get('SELECT 1 AS ok');
    } catch (error) {
      app.log.error({ err: errorDetail(error) }, 'проверка базы для /api/health не прошла');
      return reply.code(503).send({ status: 'degraded', db: 'error' });
    }
    return {
      status: 'ok',
      time: clock.now().toISOString(),
      db: 'ok',
      events24h: system.events.counts24h(),
    };
  });

  // Модули: маршруты под /api/v1, задачи в планировщик.
  const modules = discoverModules([MODULES_DIR, ...(options.extraModulesDirs ?? [])]);
  await app.register(
    async (v1) => {
      v1.addHook('onRequest', async (req, reply) => {
        const path = req.url.split('?')[0] ?? '';
        const needsHeader = WRITE_METHODS.has(req.method) && !path.startsWith('/api/v1/webhooks/');
        if (needsHeader && !req.headers['x-requested-with']) {
          return reply
            .code(403)
            .send(errorBody(langOf(req), 'request_rejected', 'core.error.badRequest'));
        }
      });
      for (const mod of modules) {
        if (!mod.routesFile) continue;
        const registerRoutes = await loadExport<RoutesFn>(mod.routesFile, 'registerRoutes');
        // Каждый модуль в своём изолированном контексте: его хуки и декораторы чужие маршруты не задевают.
        // Общий хук X-Requested-With, добавленный выше, наследуется всеми.
        await v1.register(async (scope) => {
          await registerRoutes(scope as unknown as AppInstance, deps);
        });
      }
    },
    { prefix: '/api/v1' },
  );
  for (const mod of modules) {
    if (!mod.jobsFile) continue;
    const registerJobs = await loadExport<JobsFn>(mod.jobsFile, 'registerJobs');
    registerJobs(system.scheduler, deps);
  }

  if (serveWeb) {
    await app.register(fastifyStatic, {
      root: config.webDistDir,
      cacheControl: false,
      setHeaders(res, path) {
        // Долгий кэш только у файлов сборки с хэшем в имени (/assets/*). Всё остальное — оболочка,
        // service worker, манифест, иконки без хэша — перепроверяется при каждом открытии.
        const relative = path
          .slice(config.webDistDir.length)
          .replaceAll('\\', '/')
          .replace(/^\/+/, '');
        res.header(
          'cache-control',
          relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  }

  await app.ready();
  return app;
}
