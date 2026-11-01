// Сквозной путь клиента для e2e-тестов: вход → анкета → пакет → оплата → заказ → кухня → загрузка →
// выдача клиентом → оценка, жалоба и ручная запись трекера. Всё через HTTP API, часы и оплата подменены.
// Время: приложение стартует 10 марта 2026, 12:00 по Кишинёву; заказ на 11 марта, срок приёма — 18:00.
import { SAMPLE_TARGET, addEntry } from '../tracker/helpers.ts';
import { codeFromSms, login } from '../auth/helpers.ts';
import { buy, gatewayCallback, providerPaymentIdOf } from '../billing/helpers.ts';
import { complain, jpegFile, rate } from '../feedback/helpers.ts';
import {
  call,
  clientWithCredits,
  closeIntake,
  cookAll,
  makeFulfillmentApp,
  markLoaded,
  PICKUP_MORNING,
  placeOk,
  TOMORROW,
  type FulfillmentTest,
} from '../fulfillment/helpers.ts';
import { SAMPLE, setHealthConsent } from '../profile/helpers.ts';

export { SAMPLE_TARGET };
export const E2E_PHONE = '+37369777001';
export const SECOND_PHONE = '+37369777002';
export const COMPLAINT_TEXT = 'Личное описание проблемы с боксом';
export const TRACKER_NAME = 'Греческий йогурт';

export interface Journey {
  test: FulfillmentTest;
  /** Cookie и идентификатор нашего клиента. */
  cookie: string;
  userId: number;
  /** Второй клиент: заказал и не забрал. */
  secondCookie: string;
  secondUserId: number;
  orderId: string;
  secondOrderId: string;
  complaintId: string;
  steps: {
    phoneShownAfterLogin: string | null;
    targets: { kcal: number } | null;
    paymentStatusBeforeCallback: string;
    balanceAfterPayment: number;
    orderStatusAfterPickup: string;
  };
}

/** Проходит весь путь клиента и возвращает то, что понадобится проверкам. */
export async function runJourney(): Promise<Journey> {
  const test = await makeFulfillmentApp({ credits: 0 });
  const [a, b] = test.dishes;

  // 1. вход по телефону и коду из SMS
  const cookie = await login(test, E2E_PHONE);
  const me = (await call(test, 'GET', '/auth/me', cookie)).json().user as {
    id: number;
    phone: string;
  };
  const smsCode = codeFromSms(test.sms, E2E_PHONE);
  if (!/^\d{6}$/.test(smsCode)) throw new Error('Код входа — не шесть цифр');

  // 2. анкета: согласие на данные о здоровье, затем параметры тела и норма
  const consent = await setHealthConsent(test, cookie);
  if (consent.statusCode !== 200) throw new Error(`Согласие не записано: ${consent.body}`);
  const profile = await call(test, 'PUT', '/profile', cookie, SAMPLE);
  if (profile.statusCode !== 200) throw new Error(`Анкета не сохранена: ${profile.body}`);

  // 3. пакет и оплата: платёж ждёт, затем шлюз подтверждает колбэком
  test.stub.setOutcome('pending');
  const { body } = await buy(test, cookie, 12);
  const pending = body.purchase.status;
  const paymentId = providerPaymentIdOf(test, body.purchase.id);
  test.stub.complete(paymentId, 'paid');
  const callback = await gatewayCallback(test, paymentId);
  if (callback.statusCode !== 200) throw new Error(`Колбэк не принят: ${callback.body}`);
  test.stub.setOutcome('paid'); // остальные клиенты платят сразу
  const balanceAfterPayment = (await call(test, 'GET', '/credits', cookie)).json()
    .balance as number;

  // 4. заказ на завтра; второй клиент тоже заказывает, третий заказывает и отменяет
  const order = await placeOk(test, cookie, {
    items: [
      { dishId: a, qty: 2 },
      { dishId: b, qty: 1 },
    ],
  });
  const secondCookie = await clientWithCredits(test, SECOND_PHONE, 12);
  const second = await placeOk(test, secondCookie, { items: [{ dishId: a, qty: 1 }] });
  const thirdCookie = await clientWithCredits(test, '+37369777003', 12);
  const third = await placeOk(test, thirdCookie, { items: [{ dishId: b, qty: 1 }] });
  const cancelled = await call(test, 'POST', `/orders/${third.id}/cancel`, thirdCookie);
  if (cancelled.statusCode !== 200) throw new Error(`Отмена не удалась: ${cancelled.body}`);

  // 5. срок приёма прошёл, кухня готовит, оператор загружает холодильник
  await closeIntake(test);
  await cookAll(test);
  const loaded = await markLoaded(test);
  if (loaded.statusCode !== 200) throw new Error(`Не загружено: ${loaded.body}`);

  // 6. утром клиент нажимает «Забрал»; второй клиент не приходит
  test.clock.set(PICKUP_MORNING);
  const picked = await call(test, 'POST', `/pickup/orders/${order.id}/pickup`, cookie);
  if (picked.statusCode !== 200)
    throw new Error(`Выдача не удалась: ${picked.statusCode} ${picked.body}`);

  // 7. оценка блюда, жалоба с фото и ручная запись трекера
  const rated = await rate(test, cookie, { orderId: order.id, dishId: a, stars: 5, tag: 'taste' });
  if (rated.statusCode !== 200) throw new Error(`Оценка не принята: ${rated.body}`);
  const complaint = await complain(test, cookie, {
    orderId: order.id,
    reason: 'spoiled',
    description: COMPLAINT_TEXT,
    file: jpegFile(),
  });
  if (complaint.statusCode !== 201) throw new Error(`Жалоба не принята: ${complaint.body}`);
  await addEntry(test, cookie, { name: TRACKER_NAME, date: TOMORROW });

  // 8. вечером автозакрытие дня списывает невыданный бокс второго клиента
  test.clock.set('2026-03-11T21:59:00Z');
  await test.app.deps.system.scheduler.runNow('fulfillment-close-day');

  const targets = (await call(test, 'GET', '/profile', cookie)).json().targets as {
    kcal: number;
  } | null;
  return {
    test,
    cookie,
    userId: me.id,
    secondCookie,
    secondUserId: test.deps.db.get<{ id: number }>('SELECT id FROM users WHERE phone = ?', [
      SECOND_PHONE,
    ])!.id,
    orderId: order.id,
    secondOrderId: second.id,
    complaintId: complaint.json().complaint.id as string,
    steps: {
      phoneShownAfterLogin: me.phone ?? null,
      targets,
      paymentStatusBeforeCallback: pending,
      balanceAfterPayment,
      orderStatusAfterPickup: test.deps.db.get<{ status: string }>(
        'SELECT status FROM orders WHERE id = ?',
        [order.id],
      )!.status,
    },
  };
}
