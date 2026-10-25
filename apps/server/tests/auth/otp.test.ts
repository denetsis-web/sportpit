import { describe, expect, it } from 'vitest';
import {
  as,
  codeFromSms,
  login,
  makeApp,
  OTHER_PHONE,
  PHONE,
  productionConfig,
  requestCode,
  SESSION_COOKIE,
  verifyCode,
  WRITE,
} from './helpers.ts';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('запрос кода входа', () => {
  it('отправляет SMS с кодом из 6 цифр и не возвращает код в ответе', async () => {
    const test = await makeApp();
    const res = await requestCode(test);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, retryAfterSeconds: 60, expiresInSeconds: 300 });
    expect(test.sms.outbox).toHaveLength(1);
    expect(test.sms.outbox[0]!.to).toBe(PHONE);
    const code = codeFromSms(test.sms);
    expect(code).toMatch(/^\d{6}$/);
    expect(res.body).not.toContain(code);
    expect(JSON.stringify(res.headers)).not.toContain(code);
  });

  it('SMS на языке запроса', async () => {
    const test = await makeApp();
    await requestCode(test, PHONE, { 'accept-language': 'ro' });
    expect(test.sms.last()!.text).toContain('codul de autentificare');
  });

  it('в производственном режиме код нигде не возвращается, а в базе лежит только хэш', async () => {
    const test = await makeApp({ config: productionConfig() });
    const res = await requestCode(test);
    expect(res.statusCode).toBe(200);
    const code = codeFromSms(test.sms);
    expect(res.body).not.toContain(code);
    expect(JSON.stringify(res.headers)).not.toContain(code);
    const rows = JSON.stringify(test.app.deps.db.query('SELECT * FROM otp_codes'));
    expect(rows).not.toContain(code);
    const verified = await verifyCode(test, PHONE, code);
    expect(verified.statusCode).toBe(200);
    expect(verified.body).not.toContain(code);
  });

  it.each(['+37360', '060123456', '+3736012345a', '+37360123456789', '37360123456', ''])(
    'номер «%s» вне формата +373XXXXXXXX отклоняется понятным сообщением, SMS не уходит',
    async (phone) => {
      const test = await makeApp();
      const ru = await requestCode(test, phone);
      expect(ru.statusCode).toBe(400);
      expect(ru.json().error.message).toBe('Введите номер в формате +373XXXXXXXX.');
      expect(ru.json().error.fields).toEqual({ phone: 'auth.error.phone' });
      const ro = await requestCode(test, phone, { 'accept-language': 'ro' });
      expect(ro.json().error.message).toBe('Introduceți numărul în formatul +373XXXXXXXX.');
      expect(test.sms.outbox).toHaveLength(0);
    },
  );

  it('запрос без заголовка X-Requested-With отклоняется', async () => {
    const test = await makeApp();
    const res = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phone: PHONE },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('request_rejected');
    expect(test.sms.outbox).toHaveLength(0);
  });

  it('чаще раза в минуту нельзя: 429 с текстом «подождите N сек», через минуту можно', async () => {
    const test = await makeApp();
    expect((await requestCode(test)).statusCode).toBe(200);
    test.clock.advance(20 * SECOND);
    const early = await requestCode(test);
    expect(early.statusCode).toBe(429);
    expect(early.json().error.code).toBe('rate_limited');
    expect(early.json().error.message).toContain('подождите 40 сек');
    const ro = await requestCode(test, PHONE, { 'accept-language': 'ro' });
    expect(ro.json().error.message).toContain('așteptați 40 sec');
    expect(test.sms.outbox).toHaveLength(1);
    test.clock.advance(40 * SECOND);
    expect((await requestCode(test)).statusCode).toBe(200);
    expect(test.sms.outbox).toHaveLength(2);
  });

  it('не более 5 в час на номер: шестой запрос получает 429, другой номер не затронут', async () => {
    const test = await makeApp();
    for (let i = 0; i < 5; i++) {
      expect((await requestCode(test)).statusCode).toBe(200);
      test.clock.advance(MINUTE);
    }
    // прошло 5 минут с первого запроса: до конца часа осталось 55 минут
    const sixth = await requestCode(test);
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error.message).toContain('подождите 3300 сек');
    expect((await requestCode(test, OTHER_PHONE)).statusCode).toBe(200);
    test.clock.advance(55 * MINUTE);
    expect((await requestCode(test)).statusCode).toBe(200);
  });

  it('сбой SMS: сообщение «Не удалось отправить код…», событие sms_failed, повторить можно сразу', async () => {
    const test = await makeApp();
    test.sms.failNext();
    const res = await requestCode(test);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('sms_failed');
    expect(res.json().error.message).toBe('Не удалось отправить код, попробуйте ещё раз');
    const events = test.app.deps.system.events.list({ kind: 'sms_failed' });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(PHONE);
    // неотправленный код не мешает: лимит «раз в минуту» не сработал
    const retry = await requestCode(test);
    expect(retry.statusCode).toBe(200);
    expect(test.sms.outbox).toHaveLength(1);
  });
});

describe('проверка кода и сессия', () => {
  it('верный код создаёт пользователя-клиента и сессию на 30 дней в cookie HttpOnly; SameSite=Lax', async () => {
    const test = await makeApp();
    await requestCode(test);
    const res = await verifyCode(test, PHONE, codeFromSms(test.sms));
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ phone: PHONE, role: 'client', lang: 'ru' });
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
    expect(setCookie).not.toContain('Secure'); // локальный http
    // токен в cookie не попадает в тело ответа
    const token = res.cookies.find((c) => c.name === SESSION_COOKIE)!.value;
    expect(res.body).not.toContain(token);
  });

  it('на https-хостинге cookie помечается Secure', async () => {
    const test = await makeApp({ config: productionConfig() });
    await requestCode(test);
    const res = await verifyCode(test, PHONE, codeFromSms(test.sms));
    expect(String(res.headers['set-cookie'])).toContain('Secure');
  });

  it('сессия живёт 30 дней: на 29-й день работает, на 31-й нет', async () => {
    const test = await makeApp();
    const cookie = await login(test);
    test.clock.advance(29 * DAY);
    const alive = await test.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: as(cookie),
    });
    expect(alive.json().user.phone).toBe(PHONE);
    test.clock.advance(2 * DAY);
    const dead = await test.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: as(cookie),
    });
    expect(dead.statusCode).toBe(200);
    expect(dead.json()).toEqual({ user: null });
  });

  it('в базе лежит хэш токена, а не сам токен', async () => {
    const test = await makeApp();
    const cookie = await login(test);
    const token = cookie.split('=')[1]!;
    const rows = JSON.stringify(test.app.deps.db.query('SELECT * FROM sessions'));
    expect(rows).not.toContain(token);
    expect(test.app.deps.db.query('SELECT 1 FROM sessions')).toHaveLength(1);
  });

  it('код живёт 5 минут: на 4:59 подходит, на 5:01 уже нет', async () => {
    const fresh = await makeApp();
    await requestCode(fresh);
    fresh.clock.advance(4 * MINUTE + 59 * SECOND);
    expect((await verifyCode(fresh, PHONE, codeFromSms(fresh.sms))).statusCode).toBe(200);

    const stale = await makeApp();
    await requestCode(stale);
    stale.clock.advance(5 * MINUTE + SECOND);
    const res = await verifyCode(stale, PHONE, codeFromSms(stale.sms));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('otp_expired');
    expect(res.json().error.message).toBe('Код не найден или его срок истёк. Запросите новый.');
  });

  it('код одноразовый', async () => {
    const test = await makeApp();
    await requestCode(test);
    const code = codeFromSms(test.sms);
    expect((await verifyCode(test, PHONE, code)).statusCode).toBe(200);
    const again = await verifyCode(test, PHONE, code);
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe('otp_expired');
  });

  it('неверный код: сообщение на выбранном языке с числом оставшихся попыток', async () => {
    const test = await makeApp();
    await requestCode(test);
    const code = codeFromSms(test.sms);
    const wrong = code === '000000' ? '111111' : '000000';
    const ru = await verifyCode(test, PHONE, wrong);
    expect(ru.statusCode).toBe(400);
    expect(ru.json().error.code).toBe('otp_invalid');
    expect(ru.json().error.message).toBe('Неверный код. Осталось попыток: 4.');
    const ro = await verifyCode(test, PHONE, wrong, {}, { 'accept-language': 'ro' });
    expect(ro.json().error.message).toBe('Cod greșit. Încercări rămase: 3.');
  });

  it('код не из 6 цифр отклоняется как ошибка формата и попытку не тратит', async () => {
    const test = await makeApp();
    await requestCode(test);
    const res = await verifyCode(test, PHONE, '12ab');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe('Код состоит из 6 цифр.');
    expect(
      test.app.deps.db.get<{ attempts: number }>('SELECT attempts FROM otp_codes')!.attempts,
    ).toBe(0);
  });

  it('не более 5 попыток: после пятой неверной даже верный код не принимается', async () => {
    const test = await makeApp();
    await requestCode(test);
    const code = codeFromSms(test.sms);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await verifyCode(test, PHONE, wrong)).statusCode).toBe(400);
    const locked = await verifyCode(test, PHONE, code);
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.code).toBe('otp_attempts_exceeded');
    expect(locked.json().error.message).toBe(
      'Слишком много неверных попыток. Запросите новый код.',
    );
    // новый код (через минуту) снова даёт пять попыток
    test.clock.advance(MINUTE);
    await requestCode(test);
    expect((await verifyCode(test, PHONE, codeFromSms(test.sms))).statusCode).toBe(200);
  });

  it('четыре неверные попытки не мешают верной пятой', async () => {
    const test = await makeApp();
    await requestCode(test);
    const code = codeFromSms(test.sms);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) await verifyCode(test, PHONE, wrong);
    expect((await verifyCode(test, PHONE, code)).statusCode).toBe(200);
  });

  it('код, запрошенный для другого номера, не подходит', async () => {
    const test = await makeApp();
    await requestCode(test);
    const res = await verifyCode(test, OTHER_PHONE, codeFromSms(test.sms));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('otp_expired');
  });

  it('повторный вход под тем же номером — тот же пользователь, роль сохраняется', async () => {
    const test = await makeApp();
    await login(test);
    test.app.deps.db.run("UPDATE users SET role = 'admin' WHERE phone = ?", [PHONE]);
    test.clock.advance(2 * MINUTE);
    await requestCode(test);
    const res = await verifyCode(test, PHONE, codeFromSms(test.sms));
    expect(res.json().user.role).toBe('admin');
    expect(test.app.deps.db.query('SELECT id FROM users')).toHaveLength(1);
  });

  it('язык с устройства сохраняется в профиле, его можно сменить через PATCH /auth/me', async () => {
    const test = await makeApp();
    await requestCode(test);
    const res = await verifyCode(test, PHONE, codeFromSms(test.sms), { lang: 'ro' });
    expect(res.json().user.lang).toBe('ro');
    const cookie = `${SESSION_COOKIE}=${res.cookies.find((c) => c.name === SESSION_COOKIE)!.value}`;
    const patched = await test.app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      payload: { lang: 'ru' },
      headers: as(cookie, WRITE),
    });
    expect(patched.json().user.lang).toBe('ru');
    const anon = await test.app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      payload: { lang: 'ru' },
      headers: WRITE,
    });
    expect(anon.statusCode).toBe(401);
  });

  it('выход закрывает сессию: старая cookie больше не работает', async () => {
    const test = await makeApp();
    const cookie = await login(test);
    const out = await test.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: as(cookie, WRITE),
    });
    expect(out.statusCode).toBe(200);
    expect(String(out.headers['set-cookie'])).toContain(`${SESSION_COOKIE}=;`);
    const me = await test.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: as(cookie),
    });
    expect(me.json()).toEqual({ user: null });
  });

  it('подделанная или чужая cookie даёт «не вошёл», а не ошибку', async () => {
    const test = await makeApp();
    const me = await test.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: as(`${SESSION_COOKIE}=not-a-real-token`),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ user: null });
  });
});
