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
] as const;

export type EnvName = (typeof ENV_VARIABLES)[number];
export type Env = Record<string, string | undefined>;

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
    hasSessionSecret: config.sessionSecret !== undefined,
  };
}

/** Подгружает `.env` из корня репозитория (если файл есть); уже заданные переменные не перезаписывает. */
export function loadDotEnv(path = join(REPO_ROOT, '.env')): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}
