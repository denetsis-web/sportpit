// Платёжный шлюз: интерфейс и управляемая заглушка.
// Боевые maib/Paynet подключает владелец: класс с тем же интерфейсом + запись в `paymentProviders`.
import { randomUUID } from 'node:crypto';

export type PaymentMethod = 'card' | 'mia';
export type PaymentStatus = 'pending' | 'paid' | 'failed';

export interface CreatePaymentRequest {
  /** Наш идентификатор покупки (например, id записи purchases). */
  reference: string;
  /** Сумма в банях, целое положительное число. */
  amountBani: number;
  currency: 'MDL';
  method: PaymentMethod;
  /** Куда шлюз вернёт клиента после оплаты. */
  returnUrl: string;
  /** Одинаковый ключ → один и тот же платёж (защита от двойного нажатия). */
  idempotencyKey: string;
  description?: string;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  /** Страница шлюза, на которую отправляем клиента; данные карты приложение не видит. */
  redirectUrl: string;
  status: PaymentStatus;
}

export interface PaymentState {
  providerPaymentId: string;
  status: PaymentStatus;
  failureReason?: string;
}

export interface PaymentCallback {
  providerPaymentId: string;
  status: PaymentStatus;
  /** Идентификатор события шлюза: у повторной доставки он тот же. */
  eventId: string;
  failureReason?: string;
}

export interface RefundRequest {
  providerPaymentId: string;
  amountBani: number;
  reason: string;
  idempotencyKey: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: 'done' | 'pending' | 'failed';
}

export interface CallbackInput {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

export class InvalidCallbackError extends Error {
  constructor(message = 'Неверный колбэк платёжного шлюза') {
    super(message);
    this.name = 'InvalidCallbackError';
  }
}

export interface PaymentGateway {
  readonly provider: string;
  createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResult>;
  getPayment(providerPaymentId: string): Promise<PaymentState>;
  /** Проверяет подпись и разбирает колбэк; при неверной подписи бросает InvalidCallbackError. */
  parseCallback(input: CallbackInput): PaymentCallback;
  refund(request: RefundRequest): Promise<RefundResult>;
}

export interface StubPaymentOptions {
  outcome?: PaymentStatus;
}

interface StubPayment {
  providerPaymentId: string;
  status: PaymentStatus;
  failureReason?: string;
  request: CreatePaymentRequest;
  eventSeq: number;
}

const STUB_SIGNATURE_HEADER = 'x-stub-signature';
const STUB_SIGNATURE = 'stub';

/**
 * Управляемая заглушка: исход задаётся из теста или переменной STUB_PAYMENT_OUTCOME.
 * `complete` меняет исход платежа, `callbackFor` выдаёт колбэк, как будто его прислал шлюз
 * (его можно доставить повторно), `failNext` имитирует недоступность шлюза.
 */
export class StubPaymentGateway implements PaymentGateway {
  readonly provider = 'stub';
  readonly payments = new Map<string, StubPayment>();
  readonly refunds: Array<RefundRequest & RefundResult> = [];
  private outcome: PaymentStatus;
  private readonly byKey = new Map<string, string>();
  private nextFailure: Error | undefined;

  constructor(options: StubPaymentOptions = {}) {
    this.outcome = options.outcome ?? 'paid';
  }

  setOutcome(outcome: PaymentStatus): void {
    this.outcome = outcome;
  }

  failNext(error: Error = new Error('Платёжный шлюз недоступен (заглушка)')): void {
    this.nextFailure = error;
  }

  private maybeFail(): void {
    const error = this.nextFailure;
    if (error) {
      this.nextFailure = undefined;
      throw error;
    }
  }

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResult> {
    this.maybeFail();
    if (!Number.isSafeInteger(request.amountBani) || request.amountBani <= 0) {
      throw new RangeError('Сумма платежа — целое положительное число бань');
    }
    const existingId = this.byKey.get(request.idempotencyKey);
    const existing = existingId ? this.payments.get(existingId) : undefined;
    const payment: StubPayment = existing ?? {
      providerPaymentId: `stub_${randomUUID()}`,
      status: this.outcome,
      ...(this.outcome === 'failed' ? { failureReason: 'Отклонено заглушкой' } : {}),
      request,
      eventSeq: 0,
    };
    if (!existing) {
      this.payments.set(payment.providerPaymentId, payment);
      this.byKey.set(request.idempotencyKey, payment.providerPaymentId);
    }
    const separator = request.returnUrl.includes('?') ? '&' : '?';
    return {
      providerPaymentId: payment.providerPaymentId,
      redirectUrl: `${request.returnUrl}${separator}stubPayment=${payment.providerPaymentId}`,
      status: payment.status,
    };
  }

  async getPayment(providerPaymentId: string): Promise<PaymentState> {
    this.maybeFail();
    const payment = this.require(providerPaymentId);
    return {
      providerPaymentId,
      status: payment.status,
      ...(payment.failureReason ? { failureReason: payment.failureReason } : {}),
    };
  }

  /** Завершает ожидающий платёж: paid или failed. */
  complete(providerPaymentId: string, status: 'paid' | 'failed', failureReason?: string): void {
    const payment = this.require(providerPaymentId);
    payment.status = status;
    payment.eventSeq += 1;
    if (status === 'failed') payment.failureReason = failureReason ?? 'Отклонено заглушкой';
    else delete payment.failureReason;
  }

  /** Колбэк в том виде, в каком его принимает `parseCallback`; повторный вызов даёт тот же eventId. */
  callbackFor(providerPaymentId: string): CallbackInput {
    const payment = this.require(providerPaymentId);
    return {
      headers: { [STUB_SIGNATURE_HEADER]: STUB_SIGNATURE },
      body: {
        providerPaymentId,
        status: payment.status,
        eventId: `${providerPaymentId}:${payment.eventSeq}`,
        ...(payment.failureReason ? { failureReason: payment.failureReason } : {}),
      },
    };
  }

  parseCallback({ body, headers }: CallbackInput): PaymentCallback {
    if (headers[STUB_SIGNATURE_HEADER] !== STUB_SIGNATURE) throw new InvalidCallbackError();
    if (!body || typeof body !== 'object') throw new InvalidCallbackError();
    const b = body as Record<string, unknown>;
    const status = b.status;
    if (
      typeof b.providerPaymentId !== 'string' ||
      typeof b.eventId !== 'string' ||
      (status !== 'paid' && status !== 'failed' && status !== 'pending')
    ) {
      throw new InvalidCallbackError();
    }
    return {
      providerPaymentId: b.providerPaymentId,
      status,
      eventId: b.eventId,
      ...(typeof b.failureReason === 'string' ? { failureReason: b.failureReason } : {}),
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    this.maybeFail();
    this.require(request.providerPaymentId);
    const result: RefundResult = {
      providerRefundId: `stub_refund_${randomUUID()}`,
      status: 'done',
    };
    this.refunds.push({ ...request, ...result });
    return result;
  }

  private require(providerPaymentId: string): StubPayment {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) throw new Error(`Платёж не найден: ${providerPaymentId}`);
    return payment;
  }
}
