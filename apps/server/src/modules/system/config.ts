// Единственное место, где сервер читает переменные окружения (правило линтера `no-restricted-properties`).
// Значения секретов остаются внутри объекта конфигурации и не попадают в журналы:
// для вывода используйте `redactedConfig`.
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Корень репозитория: apps/server/src/modules/system → вверх на пять уровней. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

/** Все имена переменных, которые читает конфигурация. Каждое должно стоять в .env.example и README. */
export const ENV_VARIABLES = [
  'NODE_ENV',
  'HOST',
  'PORT',
  'LOG_LEVEL',
  'PUBLIC_BASE_URL',
  'DATABASE_PATH',
  'BACKUP_DIR',
  'BACKUP_KEEP',
  'UPLOADS_DIR',
  'SESSION_SECRET',
  'PAYMENT_PROVIDER',
  'PAYMENT_API_KEY',
  'PAYMENT_WEBHOOK_SECRET',
  'STUB_PAYMENT_OUTCOME',
  'SMS_PROVIDER',
  'SMS_API_KEY',
  'SMS_SENDER_ID',
  'FILE_STORAGE',
  'ALLOW_STUB_IN_PRODUCTION',
  'TRUST_PROXY',
] as const;

export type EnvName = (typeof ENV_VARIABLES)[number];
export type Env = Record<string, string | undefined>;

/** Значение `trustProxy` Fastify: доверять ли заголовку X-Forwarded-For (и сколько прокси в цепочке). */
export type TrustProxy = boolean | number | string;

export type StubPaymentOutcome = 'paid' | 'failed' | 'pending';

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: string;
  publicBaseUrl: string;
  databasePath: string;
  backupDir: string;
  uploadsDir: string;
  /** Собранный клиент (apps/web/dist): если папка есть, сервер раздаёт его сам. */
  webDistDir: string;
  sessionSecret: string | undefined;
  payment: {
    provider: string;
    apiKey: string | undefined;
    webhookSecret: string | undefined;
    stubOutcome: StubPaymentOutcome;
  };
  sms: { provider: string; apiKey: string | undefined; senderId: string | undefined };
  storage: { provider: string };
  /** `ALLOW_STUB_IN_PRODUCTION=1`: осознанно пустить в production заглушки, http-адрес (демо, стенд). */
  allowStubInProduction: boolean;
  /** `TRUST_PROXY`: по умолчанию false — адрес клиента берётся из соединения, а не из заголовков. */
  trustProxy: TrustProxy;
  backup: { keep: number };
}

function pick(env: Env, name: EnvName): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function resolvePath(value: string | undefined, fallback: string): string {
  const path = value ?? fallback;
  return isAbsolute(path) ? path : resolve(REPO_ROOT, path);
}

function readFlag(env: Env, name: EnvName): boolean {
  const raw = pick(env, name)?.toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/** `TRUST_PROXY`: `true`/`false`, число прокси в цепочке или адрес/подсеть (список через запятую). */
function readTrustProxy(env: Env): TrustProxy {
  const raw = pick(env, 'TRUST_PROXY');
  if (raw === undefined) return false;
  const lower = raw.toLowerCase();
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  if (lower === 'true' || lower === 'yes') return true;
  if (/^\d{1,2}$/.test(raw)) return Number(raw);
  return raw;
}

function readInt(env: Env, name: EnvName, fallback: number, min: number, max: number): number {
  const raw = pick(env, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Переменная ${name} должна быть целым числом от ${min} до ${max}.`);
  }
  return n;
}

export function loadConfig(env: Env = process.env): Config {
  const nodeEnv = pick(env, 'NODE_ENV');
  const stubOutcome = pick(env, 'STUB_PAYMENT_OUTCOME') ?? 'paid';
  if (stubOutcome !== 'paid' && stubOutcome !== 'failed' && stubOutcome !== 'pending') {
    throw new Error('Переменная STUB_PAYMENT_OUTCOME: paid, failed или pending.');
  }
  return {
    nodeEnv: nodeEnv === 'production' || nodeEnv === 'test' ? nodeEnv : 'development',
    host: pick(env, 'HOST') ?? '127.0.0.1',
    port: readInt(env, 'PORT', 3000, 1, 65535),
    logLevel: pick(env, 'LOG_LEVEL') ?? 'info',
    publicBaseUrl: pick(env, 'PUBLIC_BASE_URL') ?? 'http://localhost:5173',
    databasePath: resolvePath(pick(env, 'DATABASE_PATH'), join('data', 'sportpit.db')),
    backupDir: resolvePath(pick(env, 'BACKUP_DIR'), join('data', 'backups')),
    uploadsDir: resolvePath(pick(env, 'UPLOADS_DIR'), 'uploads'),
    webDistDir: resolve(REPO_ROOT, 'apps', 'web', 'dist'),
    sessionSecret: pick(env, 'SESSION_SECRET'),
    payment: {
      provider: pick(env, 'PAYMENT_PROVIDER') ?? 'stub',
      apiKey: pick(env, 'PAYMENT_API_KEY'),
      webhookSecret: pick(env, 'PAYMENT_WEBHOOK_SECRET'),
      stubOutcome,
    },
    sms: {
      provider: pick(env, 'SMS_PROVIDER') ?? 'stub',
      apiKey: pick(env, 'SMS_API_KEY'),
      senderId: pick(env, 'SMS_SENDER_ID'),
    },
    storage: { provider: pick(env, 'FILE_STORAGE') ?? 'local' },
    allowStubInProduction: readFlag(env, 'ALLOW_STUB_IN_PRODUCTION'),
    trustProxy: readTrustProxy(env),
    backup: { keep: readInt(env, 'BACKUP_KEEP', 14, 1, 365) },
  };
}

/** Описание конфигурации для журнала запуска: имена провайдеров и признак «ключ задан», без значений. */
export function redactedConfig(config: Config) {
  return {
    nodeEnv: config.nodeEnv,
    host: config.host,
    port: config.port,
    databasePath: config.databasePath,
    backupDir: config.backupDir,
    backupKeep: config.backup.keep,
    payment: {
      provider: config.payment.provider,
      hasApiKey: config.payment.apiKey !== undefined,
      hasWebhookSecret: config.payment.webhookSecret !== undefined,
    },
    sms: {
      provider: config.sms.provider,
      hasApiKey: config.sms.apiKey !== undefined,
    },
    storage: config.storage.provider,
    allowStubInProduction: config.allowStubInProduction,
    trustProxy: config.trustProxy,
    publicBaseUrlHttps: config.publicBaseUrl.startsWith('https://'),
    hasSessionSecret: config.sessionSecret !== undefined,
  };
}

/**
 * Чего не хватает для боевого запуска. Вне production — пусто.
 * SESSION_SECRET обязателен всегда; заглушки оплаты и SMS и адрес не на https:// допустимы только
 * с явным флагом `ALLOW_STUB_IN_PRODUCTION=1`. Значения секретов в тексты не попадают.
 */
export function productionProblems(config: Config): string[] {
  if (config.nodeEnv !== 'production') return [];
  const problems: string[] = [];
  if (!config.sessionSecret) {
    problems.push('SESSION_SECRET не задан: без него cookie сессии и коды входа не защищены.');
  }
  if (!config.allowStubInProduction) {
    if (config.payment.provider === 'stub') {
      problems.push('PAYMENT_PROVIDER=stub: оплата идёт через заглушку и не берёт денег.');
    }
    if (config.sms.provider === 'stub') {
      problems.push('SMS_PROVIDER=stub: SMS не уходят клиентам, войти по коду нельзя.');
    }
    if (!config.publicBaseUrl.startsWith('https://')) {
      problems.push('PUBLIC_BASE_URL должен начинаться с https://.');
    }
  }
  return problems;
}

/** Бросает ошибку со списком причин, если production запускается небезопасно. */
export function assertProductionConfig(config: Config): void {
  const problems = productionProblems(config);
  if (problems.length === 0) return;
  throw new Error(
    `Сервер не запущен: небезопасная конфигурация production.\n- ${problems.join('\n- ')}\n` +
      'Исправьте .env. Для демонстрации или стенда с заглушками задайте ALLOW_STUB_IN_PRODUCTION=1 ' +
      '(SESSION_SECRET нужен в любом случае).',
  );
}

/** Подгружает `.env` из корня репозитория (если файл есть); уже заданные переменные не перезаписывает. */
export function loadDotEnv(path = join(REPO_ROOT, '.env')): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}
