import { describe, expect, it, vi } from 'vitest';
import { billingFor } from '../../src/modules/billing/index.ts';
import { AppError } from '../../src/modules/system/errors.ts';
import { addClient } from '../billing/helpers.ts';
import {
  call,
  clientWithCredits,
  closeIntake,
  cookAll,
  loadedDay,
  makeFulfillmentApp,
  markLoaded,
  OTHER_OPERATOR_PHONE,
  pickupByCode,
  PICKUP_MORNING,
  PICKUP_NIGHT,
  placeOk,
  statusOf,
  THIRD_CLIENT_PHONE,
  TOMORROW,
  type FulfillmentTest,
} from './helpers.ts';
import { authFor } from '../../src/modules/auth/index.ts';
import { login, setRole, userId } from '../auth/helpers.ts';
import { addFridge } from '../kitchen/helpers.ts';

const clientPickup = (test: FulfillmentTest, orderId: string, cookie = test.client) =>
  call(test, 'POST', `/pickup/orders/${orderId}/pickup`, cookie);
const view = (test: FulfillmentTest, orderId: string, cookie = test.client) =>
  call(test, 'GET', `/pickup/orders/${orderId}`, cookie);

const consumeRows = (test: FulfillmentTest, orderId: string) =>
  test.deps.db.query("SELECT 1 FROM credit_ledger WHERE order_id = ? AND reason = 'consume'", [
    orderId,
  ]).length;

describe('получение клиентом: кнопка «Забрал» (R25, R45)', () => {
  it('до отметки «загружено» и в другой день кнопка недоступна, сервер отказывает', async () => {
    const test = await makeFulfillmentApp();
    const { orderId } = await loadedDay(test, { load: false });

    // накануне: заказ ещё не «сегодняшний»
    expect((await view(test, orderId)).json().order).toMatchObject({
      canPickup: false,
      blockedReason: 'not_today',
    });

    test.clock.set(PICKUP_MORNING); // 11 марта, 07:30: день заказа, но холодильник не загружен
    const blocked = await view(test, orderId);
    expect(blocked.json().order).toMatchObject({
      canPickup: false,
      blockedReason: 'not_loaded',
      loaded: false,
    });
    const refused = await clientPickup(test, orderId);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('not_loaded');
    expect(statusOf(test, orderId)).toBe('confirmed');
  });

  it('окно выдачи 07:00–22:00 по Кишинёву: границы проверяются на сервере', async () => {
    const test = await makeFulfillmentApp();
    const { orderId } = await loadedDay(test);

    test.clock.set('2026-03-11T04:59:00Z'); // 06:59
    expect((await view(test, orderId)).json().order).toMatchObject({
      canPickup: false,
      blockedReason: 'before_window',
    });
    const early = await clientPickup(test, orderId);
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('window_closed');
    expect(early.json().error.message).toContain('07:00');
    expect(statusOf(test, orderId)).toBe('loaded');

    test.clock.set('2026-03-11T05:00:00Z'); // 07:00 ровно: окно открылось
    expect((await view(test, orderId)).json().order.canPickup).toBe(true);

    test.clock.set('2026-03-11T19:59:00Z'); // 21:59
    expect((await view(test, orderId)).json().order.canPickup).toBe(true);

    test.clock.set('2026-03-11T20:00:00Z'); // 22:00: окно закрыто
    expect((await view(test, orderId)).json().order).toMatchObject({
      canPickup: false,
      blockedReason: 'after_window',
    });
    expect((await clientPickup(test, orderId)).statusCode).toBe(409);
    expect(statusOf(test, orderId)).toBe('loaded');
  });

  it('окно выдачи берётся из настроек холодильника, а не из констант', async () => {
    const test = await makeFulfillmentApp();
    const patched = await call(test, 'PATCH', `/admin/fridges/${test.fridgeId}`, test.admin, {
      pickupFrom: '09:00',
      pickupTo: '12:00',
    });
    expect(patched.statusCode).toBe(200);
    const { orderId } = await loadedDay(test);
    test.clock.set(PICKUP_MORNING); // 07:30 — раньше окна
    expect((await view(test, orderId)).json().order.blockedReason).toBe('before_window');
    test.clock.set('2026-03-11T08:00:00Z'); // 10:00
    expect((await view(test, orderId)).json().order.canPickup).toBe(true);
  });

  it('«Забрал» выдаёт заказ: кредит использован, уведомление «Как блюдо?» со ссылкой на оценку; повтор безопасен', async () => {
    const test = await makeFulfillmentApp();
    const { orderId } = await loadedDay(test);
    const balanceBefore = (await call(test, 'GET', '/credits', test.client)).json().balance;
    test.clock.set(PICKUP_MORNING);

    const res = await clientPickup(test, orderId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ alreadyPickedUp: false, order: { status: 'picked_up' } });
    expect(statusOf(test, orderId)).toBe('picked_up');
    expect(consumeRows(test, orderId)).toBe(1);
    // баланс не меняется: кредиты ушли при резерве
    expect((await call(test, 'GET', '/credits', test.client)).json().balance).toBe(balanceBefore);

    const notes = (await call(test, 'GET', '/notifications', test.client)).json().items as Array<{
      type: string;
      payload: { link?: string; orderId?: string };
    }>;
    const rate = notes.filter((n) => n.type === 'rate_dish');
    expect(rate).toHaveLength(1);
    expect(rate[0]!.payload).toMatchObject({ orderId, link: `/rate/${orderId}` });

    // повторное нажатие: статус, журнал и уведомления не меняются
    const again = await clientPickup(test, orderId);
    expect(again.statusCode).toBe(200);
    expect(again.json().alreadyPickedUp).toBe(true);
    expect(statusOf(test, orderId)).toBe('picked_up');
    expect(consumeRows(test, orderId)).toBe(1);
    const notesAfter = (await call(test, 'GET', '/notifications', test.client)).json()
      .items as Array<{ type: string }>;
    expect(notesAfter.filter((n) => n.type === 'rate_dish')).toHaveLength(1);
  });

  it('если списание кредита не удалось, заказ остаётся «загружен»: переход и consume атомарны', async () => {
    const test = await makeFulfillmentApp();
    const { orderId } = await loadedDay(test);
    test.clock.set(PICKUP_MORNING);
    const spy = vi.spyOn(billingFor(test.deps), 'consume').mockImplementation(() => {
      throw new AppError(409, 'nothing_reserved', 'billing.error.orderConflict');
    });
    const res = await clientPickup(test, orderId);
    spy.mockRestore();
    expect(res.statusCode).toBe(409);
    expect(statusOf(test, orderId)).toBe('loaded');
    const notes = (await call(test, 'GET', '/notifications', test.client)).json().items as Array<{
      type: string;
    }>;
    expect(notes.filter((n) => n.type === 'rate_dish')).toHaveLength(0);
    // и после сбоя выдача по-прежнему возможна
    expect((await clientPickup(test, orderId)).statusCode).toBe(200);
  });

  it('чужой заказ клиент не видит и не выдаёт: 404; гость — 401; оператор — 403', async () => {
    const test = await makeFulfillmentApp();
    const { orderId } = await loadedDay(test);
    test.clock.set(PICKUP_MORNING);
    const { cookie: stranger } = await addClient(test, THIRD_CLIENT_PHONE);
    expect((await view(test, orderId, stranger)).statusCode).toBe(404);
    expect((await clientPickup(test, orderId, stranger)).statusCode).toBe(404);
    expect(statusOf(test, orderId)).toBe('loaded');
    expect((await call(test, 'GET', '/pickup/orders')).statusCode).toBe(401);
    expect((await clientPickup(test, orderId, test.operator)).statusCode).toBe(403);
    // у постороннего на сегодня заказов нет
    expect((await call(test, 'GET', '/pickup/orders', stranger)).json().items).toEqual([]);
  });
});

describe('код замка холодильника (R34.3)', () => {
  async function withLock(test: FulfillmentTest) {
    await call(test, 'PATCH', `/admin/fridges/${test.fridgeId}`, test.admin, {
      accessCode: '4821',
    });
  }

  it('виден только клиенту с заказом на сегодня после загрузки и в окно выдачи', async () => {
    const test = await makeFulfillmentApp();
    await withLock(test);
    const { orderId, code } = await loadedDay(test, { load: false });

    // до загрузки код замка не отдаётся ни накануне, ни утром
    expect((await view(test, orderId)).json().order.accessCode).toBeNull();
    test.clock.set(PICKUP_MORNING);
    expect((await view(test, orderId)).json().order.accessCode).toBeNull();

    expect((await markLoaded(test)).statusCode).toBe(200);
    const shown = (await view(test, orderId)).json().order;
    expect(shown.accessCode).toBe('4821');
    // код получения виден клиенту крупно (в ответе), оператор его не получает
    expect(shown.code).toBe(code);

    // вне окна выдачи — не показывается
    test.clock.set(PICKUP_NIGHT);
    expect((await view(test, orderId)).json().order.accessCode).toBeNull();

    // после выдачи тоже
    test.clock.set(PICKUP_MORNING);
    await clientPickup(test, orderId);
    expect((await view(test, orderId)).json().order.accessCode).toBeNull();
  });

  it('если код замка у холодильника не задан, поле пустое', async () => {
    const test = await makeFulfillmentApp();
    const { orderId } = await loadedDay(test);
    test.clock.set(PICKUP_MORNING);
    expect((await view(test, orderId)).json().order).toMatchObject({
      canPickup: true,
      accessCode: null,
    });
  });
});

describe('выдача оператором по коду клиента (R25.1)', () => {
  it('неверный код даёт понятную ошибку, верный — выдачу; повтор не меняет статус', async () => {
    const test = await makeFulfillmentApp();
    const { orderId, code } = await loadedDay(test);
    test.clock.set(PICKUP_MORNING);

    const wrong = code === '0000' ? '0001' : '0000';
    const bad = await pickupByCode(test, wrong, test.operator, test.fridgeId, TOMORROW);
    expect(bad.statusCode).toBe(404);
    expect(bad.json().error.code).toBe('invalid_code');
    expect(bad.json().error.message).toContain('Неверный код');
    const malformed = await pickupByCode(test, '12a');
    expect(malformed.statusCode).toBe(400);
    expect(statusOf(test, orderId)).toBe('loaded');

    const ok = await pickupByCode(test, code);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ orderId, status: 'picked_up', alreadyPickedUp: false });
    expect(consumeRows(test, orderId)).toBe(1);
    const notes = (await call(test, 'GET', '/notifications', test.client)).json().items as Array<{
      type: string;
    }>;
    expect(notes.filter((n) => n.type === 'rate_dish')).toHaveLength(1);

    const again = await pickupByCode(test, code);
    expect(again.statusCode).toBe(200);
    expect(again.json().alreadyPickedUp).toBe(true);
    expect(statusOf(test, orderId)).toBe('picked_up');
    expect(consumeRows(test, orderId)).toBe(1);

    // клиент после выдачи оператором: «Забрал» тоже безопасен
    expect((await clientPickup(test, orderId)).json().alreadyPickedUp).toBe(true);
  });

  it('заказ, который ещё не загружен, по коду не выдаётся; завтрашний день — тоже', async () => {
    const test = await makeFulfillmentApp();
    const { code } = await loadedDay(test, { load: false });
    test.clock.set(PICKUP_MORNING);
    const early = await pickupByCode(test, code);
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('not_loaded');

    const test2 = await makeFulfillmentApp();
    const loaded = await loadedDay(test2); // время всё ещё 10 марта, вечер
    const future = await pickupByCode(test2, loaded.code);
    expect(future.statusCode).toBe(409);
    expect(future.json().error.code).toBe('pickup_not_today');
  });

  it('оператор чужого холодильника не выдаёт: 403; код другого холодильника не подходит', async () => {
    const test = await makeFulfillmentApp();
    const { orderId, code } = await loadedDay(test);
    test.clock.set(PICKUP_MORNING);
    const second = await addFridge(test);
    const other = await login(test, OTHER_OPERATOR_PHONE);
    setRole(test.app, OTHER_OPERATOR_PHONE, 'operator');
    authFor(test.app.deps).setOperatorFridges(userId(test.app, OTHER_OPERATOR_PHONE), [second]);

    expect((await pickupByCode(test, code, other)).statusCode).toBe(403);
    // тот же код в другом холодильнике — заказа нет
    const wrongFridge = await pickupByCode(test, code, other, second);
    expect(wrongFridge.statusCode).toBe(404);
    expect(statusOf(test, orderId)).toBe('loaded');
  });
});

describe('несколько клиентов и холодильников', () => {
  it('отметка загрузки переводит заказы только своего холодильника', async () => {
    const test = await makeFulfillmentApp();
    const second = await addFridge(test);
    const secondClient = await clientWithCredits(test, '+37360555103');
    const mine = await placeOk(test);
    const theirs = await placeOk(test, secondClient, { fridgeId: second });
    await closeIntake(test);
    await cookAll(test);
    expect((await markLoaded(test)).statusCode).toBe(200);
    expect(statusOf(test, mine.id)).toBe('loaded');
    expect(statusOf(test, theirs.id)).toBe('confirmed');
  });
});
