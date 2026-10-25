// Отправка SMS: интерфейс и заглушка. Заглушка кладёт сообщения в outbox и пишет их в журнал процесса
// (так в разработке виден код входа). Боевой провайдер подключает владелец.

export interface SmsMessage {
  /** Номер в формате +373XXXXXXXX. */
  to: string;
  text: string;
}

export class SmsSendError extends Error {
  constructor(message = 'Не удалось отправить SMS') {
    super(message);
    this.name = 'SmsSendError';
  }
}

export interface SmsSender {
  readonly provider: string;
  /** Бросает SmsSendError, если сообщение не ушло. */
  send(message: SmsMessage): Promise<void>;
}

export interface StubSmsOptions {
  /** Не писать сообщения в журнал процесса (для тестов). */
  silent?: boolean;
  log?: (line: string) => void;
}

export class StubSmsSender implements SmsSender {
  readonly provider = 'stub';
  readonly outbox: SmsMessage[] = [];
  private nextFailure: Error | undefined;
  private readonly log: ((line: string) => void) | undefined;

  constructor(options: StubSmsOptions = {}) {
    this.log = options.silent ? undefined : (options.log ?? ((line) => console.log(line)));
  }

  failNext(error: Error = new SmsSendError('Сбой SMS-провайдера (заглушка)')): void {
    this.nextFailure = error;
  }

  /** Последнее сообщение на номер (или последнее вообще). */
  last(to?: string): SmsMessage | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i--) {
      if (to === undefined || this.outbox[i]!.to === to) return this.outbox[i];
    }
    return undefined;
  }

  clear(): void {
    this.outbox.length = 0;
  }

  async send(message: SmsMessage): Promise<void> {
    const error = this.nextFailure;
    if (error) {
      this.nextFailure = undefined;
      throw error;
    }
    this.outbox.push({ ...message });
    this.log?.(`[sms-stub] ${message.to}: ${message.text}`);
  }
}
