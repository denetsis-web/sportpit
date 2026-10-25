// Модуль adapters: PaymentGateway, SmsSender, FileStorage — интерфейсы, заглушки и выбор по окружению.
// Другие модули получают готовые экземпляры через `deps.payment`, `deps.sms`, `deps.storage`.
import type { Config } from '../system/config.ts';
import type { EventLog } from '../system/events.ts';
import { EVENT_KINDS, errorDetail } from '../system/events.ts';
import { StubPaymentGateway, type PaymentGateway } from './payment.ts';
import { StubSmsSender, type SmsSender } from './sms.ts';
import { LocalFileStorage, MemoryFileStorage, type FileStorage } from './storage.ts';

export * from './payment.ts';
export * from './sms.ts';
export * from './storage.ts';

export interface Adapters {
  payment: PaymentGateway;
  sms: SmsSender;
  storage: FileStorage;
}

export interface CreateAdaptersOptions {
  /** Заглушка SMS не пишет сообщения в консоль. */
  silent?: boolean;
  log?: (line: string) => void;
}

// Реестры провайдеров: чтобы подключить боевой, добавьте сюда фабрику
// (она получает конфигурацию и читает ключи оттуда, а не из process.env).
const paymentProviders: Record<string, (config: Config) => PaymentGateway> = {
  stub: (config) => new StubPaymentGateway({ outcome: config.payment.stubOutcome }),
};

const smsProviders: Record<string, (config: Config, options: CreateAdaptersOptions) => SmsSender> =
  {
    stub: (_config, options) =>
      new StubSmsSender({
        silent: options.silent ?? false,
        ...(options.log ? { log: options.log } : {}),
      }),
  };

const storageProviders: Record<string, (config: Config) => FileStorage> = {
  local: (config) => new LocalFileStorage({ rootDir: config.uploadsDir }),
  memory: () => new MemoryFileStorage(),
};

function choose<T>(
  registry: Record<string, T>,
  provider: string,
  variable: string,
  hint: string,
): T {
  const factory = registry[provider];
  if (!factory) {
    throw new Error(
      `Провайдер «${provider}» из ${variable} не подключён. Доступны: ${Object.keys(registry).join(', ')}. ${hint}`,
    );
  }
  return factory;
}

export function createAdapters(config: Config, options: CreateAdaptersOptions = {}): Adapters {
  const payment = choose(
    paymentProviders,
    config.payment.provider,
    'PAYMENT_PROVIDER',
    'Боевой шлюз добавляется в paymentProviders (apps/server/src/modules/adapters/index.ts).',
  )(config);
  const sms = choose(
    smsProviders,
    config.sms.provider,
    'SMS_PROVIDER',
    'Боевой SMS-провайдер добавляется в smsProviders.',
  )(config, options);
  const storage = choose(
    storageProviders,
    config.storage.provider,
    'FILE_STORAGE',
    'Другое хранилище добавляется в storageProviders.',
  )(config);
  return { payment, sms, storage };
}

function maskPhone(phone: string): string {
  return phone.length <= 6 ? '***' : `${phone.slice(0, 4)}***${phone.slice(-2)}`;
}

/**
 * Оборачивает оплату и SMS: сбой вызова (исключение) пишется в журнал событий
 * (`sms_failed`, `payment_failed`) и пробрасывается дальше. Отказ банка по карте —
 * это штатный ответ, а не сбой системы, и событием не считается.
 */
export function instrumentAdapters(
  adapters: Pick<Adapters, 'payment' | 'sms'>,
  events: EventLog,
): Pick<Adapters, 'payment' | 'sms'> {
  const { payment, sms } = adapters;

  const sendSms: SmsSender['send'] = async (message) => {
    try {
      await sms.send(message);
    } catch (error) {
      events.log(EVENT_KINDS.smsFailed, {
        provider: sms.provider,
        to: maskPhone(message.to),
        ...errorDetail(error),
      });
      throw error;
    }
  };

  const guard = async <T>(operation: string, call: () => Promise<T>): Promise<T> => {
    try {
      return await call();
    } catch (error) {
      events.log(EVENT_KINDS.paymentFailed, {
        provider: payment.provider,
        operation,
        ...errorDetail(error),
      });
      throw error;
    }
  };

  return {
    sms: { provider: sms.provider, send: sendSms },
    payment: {
      provider: payment.provider,
      createPayment: (request) => guard('createPayment', () => payment.createPayment(request)),
      getPayment: (id) => guard('getPayment', () => payment.getPayment(id)),
      refund: (request) => guard('refund', () => payment.refund(request)),
      parseCallback: (input) => payment.parseCallback(input),
    },
  };
}
