import { describe, expect, it } from 'vitest';
import {
  api,
  codeFromSms,
  login,
  makeApp,
  NEW_PHONE,
  OTHER_PHONE,
  PHONE,
  userId,
  type TestApp,
} from './helpers.ts';

const meOf = async (test: TestApp, cookie: string) =>
  (await api(test, 'GET', '/auth/me', cookie)).json().user as { id: number; phone: string };

describe('смена телефона (R29.2)', () => {
  it('без входа — 401', async () => {
    const test = await makeApp();
    expect(
      (await api(test, 'POST', '/profile/phone/request', undefined, { phone: NEW_PHONE }))
        .statusCode,
    ).toBe(401);
    expect(
      (await api(test, 'POST', '/profile/phone', undefined, { phone: NEW_PHONE, code: '123456' }))
        .statusCode,
    ).toBe(401);
  });

  it('код уходит на НОВЫЙ номер, а номер меняется только после ввода кода', async () => {
    const test = await makeApp();
    const cookie = await login(test, PHONE);
    const id = userId(test.app, PHONE);
    const smsToOld = test.sms.outbox.filter((m) => m.to === PHONE).length;

    const requested = await api(test, 'POST', '/profile/phone/request', cookie, {
      phone: NEW_PHONE,
    });
    expect(requested.statusCode).toBe(200);
    expect(test.sms.last(NEW_PHONE)).toBeTruthy();
    expect(test.sms.outbox.filter((m) => m.to === PHONE)).toHaveLength(smsToOld);
    // пока код не введён, номер прежний
    expect((await meOf(test, cookie)).phone).toBe(PHONE);

    const confirmed = await api(test, 'POST', '/profile/phone', cookie, {
      phone: NEW_PHONE,
      code: codeFromSms(test.sms, NEW_PHONE),
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().user).toMatchObject({ id, phone: NEW_PHONE });
    expect(await meOf(test, cookie)).toMatchObject({ id, phone: NEW_PHONE });
  });

  it('неверный код: 400, номер не меняется', async () => {
    const test = await makeApp();
    const cookie = await login(test, PHONE);
    await api(test, 'POST', '/profile/phone/request', cookie, { phone: NEW_PHONE });
    const real = codeFromSms(test.sms, NEW_PHONE);
    const wrong = real === '000000' ? '111111' : '000000';
    const res = await api(test, 'POST', '/profile/phone', cookie, {
      phone: NEW_PHONE,
      code: wrong,
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect((await meOf(test, cookie)).phone).toBe(PHONE);
  });

  it('без запроса кода подтвердить нельзя; номер прежний', async () => {
    const test = await makeApp();
    const cookie = await login(test, PHONE);
    const res = await api(test, 'POST', '/profile/phone', cookie, {
      phone: NEW_PHONE,
      code: '123456',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect((await meOf(test, cookie)).phone).toBe(PHONE);
  });

  it('код, присланный на старый номер, новый номер не подтверждает', async () => {
    const test = await makeApp();
    const cookie = await login(test, PHONE);
    const oldCode = codeFromSms(test.sms, PHONE);
    test.clock.advance(2 * 60 * 1000);
    await api(test, 'POST', '/profile/phone/request', cookie, { phone: NEW_PHONE });
    // код нового номера мог совпасть со старым с вероятностью 1 к миллиону: такой запуск пропускаем
    if (codeFromSms(test.sms, NEW_PHONE) === oldCode) return;
    const res = await api(test, 'POST', '/profile/phone', cookie, {
      phone: NEW_PHONE,
      code: oldCode,
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect((await meOf(test, cookie)).phone).toBe(PHONE);
  });

  it('запрос кода не выдаёт, занят ли номер: на занятый номер код уходит так же, как на свободный', async () => {
    const test = await makeApp();
    await login(test, OTHER_PHONE);
    test.clock.advance(2 * 60 * 1000);
    const cookie = await login(test, PHONE);
    const before = test.sms.outbox.filter((m) => m.to === OTHER_PHONE).length;
    const taken = await api(test, 'POST', '/profile/phone/request', cookie, { phone: OTHER_PHONE });
    const free = await api(test, 'POST', '/profile/phone/request', cookie, { phone: NEW_PHONE });
    expect(taken.statusCode).toBe(200);
    expect(free.statusCode).toBe(200);
    expect(taken.json()).toEqual(free.json());
    expect(test.sms.outbox.filter((m) => m.to === OTHER_PHONE)).toHaveLength(before + 1);
  });

  it('занятый номер: сначала проверяется код, и только потом «номер занят» (нет перебора занятости)', async () => {
    const test = await makeApp();
    await login(test, OTHER_PHONE);
    test.clock.advance(2 * 60 * 1000);
    const cookie = await login(test, PHONE);
    const id = userId(test.app, PHONE);
    await api(test, 'POST', '/profile/phone/request', cookie, { phone: OTHER_PHONE });
    const real = codeFromSms(test.sms, OTHER_PHONE);
    const wrong = real === '000000' ? '111111' : '000000';

    // чужой код не знаем: ответ тот же, что и для свободного номера, — «неверный код», а не 409
    const guess = await api(test, 'POST', '/profile/phone', cookie, {
      phone: OTHER_PHONE,
      code: wrong,
    });
    expect(guess.statusCode).toBe(400);
    expect(guess.json().error.code).toBe('otp_invalid');

    // верный код на занятый номер: теперь 409, номер прежний
    const taken = await api(test, 'POST', '/profile/phone', cookie, {
      phone: OTHER_PHONE,
      code: real,
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe('phone_taken');
    expect((await meOf(test, cookie)).phone).toBe(PHONE);
    expect(userId(test.app, PHONE)).toBe(id);
  });

  it('тот же номер: 400, неверный формат: 400', async () => {
    const test = await makeApp();
    const cookie = await login(test, PHONE);
    expect(
      (await api(test, 'POST', '/profile/phone/request', cookie, { phone: PHONE })).statusCode,
    ).toBe(400);
    expect(
      (await api(test, 'POST', '/profile/phone/request', cookie, { phone: '12345' })).statusCode,
    ).toBe(400);
  });
});
