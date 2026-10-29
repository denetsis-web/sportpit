import { describe, expect, it } from 'vitest';
import {
  api,
  clientWithConsent,
  login,
  makeApp,
  OTHER_PHONE,
  PHONE,
  SAMPLE,
  setHealthConsent,
  type TestApp,
} from './helpers.ts';

const profileRows = (test: TestApp) =>
  test.app.deps.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM profiles')!.n;

describe('анкета: доступ и согласие на данные о здоровье', () => {
  it('без входа — 401; вошедший без анкеты видит пустой ответ', async () => {
    const test = await makeApp();
    expect((await api(test, 'GET', '/profile')).statusCode).toBe(401);
    const cookie = await login(test, PHONE);
    const res = await api(test, 'GET', '/profile', cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ profile: null, targets: null, healthConsent: false });
  });

  it('без согласия health_data параметры тела не сохраняются: 403 consent_required, в базе пусто', async () => {
    const test = await makeApp();
    const cookie = await login(test, PHONE);
    const res = await api(test, 'PUT', '/profile', cookie, SAMPLE);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('consent_required');
    expect(profileRows(test)).toBe(0);
  });

  it('отказ от согласия (granted: false) тоже не открывает сохранение', async () => {
    const test = await makeApp();
    const cookie = await login(test, PHONE);
    await setHealthConsent(test, cookie, false);
    expect((await api(test, 'PUT', '/profile', cookie, SAMPLE)).statusCode).toBe(403);
    expect(profileRows(test)).toBe(0);
  });

  it('согласия на условия и политику недостаточно: нужно именно health_data', async () => {
    const test = await makeApp();
    const cookie = await login(test, PHONE);
    await api(test, 'POST', '/auth/consents', cookie, {
      changes: [
        { kind: 'terms', granted: true, version: '2026-10-25' },
        { kind: 'privacy', granted: true, version: '2026-10-25' },
      ],
    });
    expect((await api(test, 'PUT', '/profile', cookie, SAMPLE)).statusCode).toBe(403);
  });
});

describe('анкета: сохранение и норма', () => {
  it('сохраняет анкету и возвращает норму, посчитанную вручную (2345 ккал, 160/65/280, клетчатка 33)', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    const saved = await api(test, 'PUT', '/profile', cookie, SAMPLE);
    expect(saved.statusCode).toBe(200);
    const expected = {
      kcal: 2345,
      proteinG: 160,
      proteinRangeG: { min: 128, max: 176 },
      fatG: 65,
      carbG: 280,
      fiberG: 33,
      floorApplied: false,
    };
    expect(saved.json().targets).toEqual(expected);
    expect(saved.json().profile).toMatchObject(SAMPLE);

    const read = await api(test, 'GET', '/profile', cookie);
    expect(read.json()).toMatchObject({ healthConsent: true, targets: expected });
    expect(read.json().profile).toMatchObject(SAMPLE);
    expect(read.headers['cache-control']).toBe('no-store');
  });

  it('повторное сохранение меняет цель в той же записи', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    await api(test, 'PUT', '/profile', cookie, SAMPLE);
    const res = await api(test, 'PUT', '/profile', cookie, { ...SAMPLE, goal: 'gain' });
    expect(res.statusCode).toBe(200);
    // набор: БМ 1780 × 1,55 = 2759; × 1,12 = 3090,08 → 3090; белок 1,8 × 80 = 144
    expect(res.json().targets).toMatchObject({ kcal: 3090, proteinG: 144 });
    expect(profileRows(test)).toBe(1);
  });

  it('флаг состояния: норма не считается, анкета сохраняется', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    const res = await api(test, 'PUT', '/profile', cookie, { ...SAMPLE, hasCondition: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().targets).toEqual({ blocked: 'medical_condition' });
    expect(res.json().profile.hasCondition).toBe(true);
  });

  it.each([17, 81])('возраст %i: норма не считается', async (age) => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    const res = await api(test, 'PUT', '/profile', cookie, { ...SAMPLE, age });
    expect(res.statusCode).toBe(200);
    expect(res.json().targets).toEqual({ blocked: 'age_out_of_range' });
  });

  it('минимум безопасного уровня: женщина 1200 ккал с пометкой', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    const res = await api(test, 'PUT', '/profile', cookie, {
      sex: 'female',
      age: 40,
      heightCm: 160,
      weightKg: 50,
      goal: 'lose',
      activity: 'sedentary',
    });
    expect(res.json().targets).toMatchObject({ kcal: 1200, floorApplied: true });
  });

  it.each([
    ['пол', { sex: 'other' }],
    ['вес', { weightKg: 5 }],
    ['рост', { heightCm: 400 }],
    ['возраст', { age: 30.5 }],
    ['цель', { goal: 'bulk' }],
    ['активность', { activity: 'extreme' }],
  ])('неверное поле «%s» — 400 validation_failed, ничего не сохранено', async (_name, patch) => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    const res = await api(test, 'PUT', '/profile', cookie, { ...SAMPLE, ...patch });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_failed');
    expect(profileRows(test)).toBe(0);
  });
});

describe('анкета: чужая и отозванная', () => {
  it('другой пользователь чужую анкету не видит', async () => {
    const test = await makeApp();
    const mine = await clientWithConsent(test, PHONE);
    const other = await clientWithConsent(test, OTHER_PHONE);
    await api(test, 'PUT', '/profile', mine, SAMPLE);
    const res = await api(test, 'GET', '/profile', other);
    expect(res.json()).toEqual({ profile: null, targets: null, healthConsent: true });
  });

  it('после отзыва согласия анкета и норма не показываются, сохранение закрыто', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    await api(test, 'PUT', '/profile', cookie, SAMPLE);
    await setHealthConsent(test, cookie, false);
    const read = await api(test, 'GET', '/profile', cookie);
    expect(read.json()).toEqual({ profile: null, targets: null, healthConsent: false });
    expect((await api(test, 'PUT', '/profile', cookie, SAMPLE)).statusCode).toBe(403);
  });

  it('DELETE /profile стирает сохранённые параметры тела', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    await api(test, 'PUT', '/profile', cookie, SAMPLE);
    expect(profileRows(test)).toBe(1);
    const res = await api(test, 'DELETE', '/profile', cookie);
    expect(res.statusCode).toBe(200);
    expect(profileRows(test)).toBe(0);
    expect((await api(test, 'GET', '/profile', cookie)).json().profile).toBeNull();
  });
});

describe('анкета: отзыв согласия стирает параметры тела', () => {
  const stored = (test: TestApp) => profileRows(test);

  it('явный отказ: при первом же чтении анкета стирается из базы и не возвращается после нового согласия', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    await api(test, 'PUT', '/profile', cookie, SAMPLE);
    await setHealthConsent(test, cookie, false);

    expect((await api(test, 'GET', '/profile', cookie)).json().profile).toBeNull();
    expect(stored(test)).toBe(0);

    await setHealthConsent(test, cookie, true);
    expect((await api(test, 'GET', '/profile', cookie)).json()).toEqual({
      profile: null,
      targets: null,
      healthConsent: true,
    });
  });

  it('выгрузка данных после отзыва тоже не отдаёт стёртую анкету', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    await api(test, 'PUT', '/profile', cookie, SAMPLE);
    await setHealthConsent(test, cookie, false);
    expect((await api(test, 'GET', '/profile/export', cookie)).json().profile).toBeNull();
    expect(stored(test)).toBe(0);
  });

  it('новая версия текста согласия без отказа: анкета скрыта, но не стёрта', async () => {
    const test = await makeApp();
    const cookie = await clientWithConsent(test, PHONE);
    await api(test, 'PUT', '/profile', cookie, SAMPLE);
    test.app.deps.db.run("UPDATE consents SET version = '2020-01-01' WHERE kind = 'health_data'");

    expect((await api(test, 'GET', '/profile', cookie)).json()).toEqual({
      profile: null,
      targets: null,
      healthConsent: false,
    });
    expect(stored(test)).toBe(1);
    expect((await api(test, 'PUT', '/profile', cookie, SAMPLE)).statusCode).toBe(403);
  });

  it('ночная задача стирает анкеты отозвавших согласие, даже если те не заходили; чужие и согласных не трогает', async () => {
    const test = await makeApp();
    const revoked = await clientWithConsent(test, PHONE);
    const agreed = await clientWithConsent(test, OTHER_PHONE);
    await api(test, 'PUT', '/profile', revoked, SAMPLE);
    await api(test, 'PUT', '/profile', agreed, SAMPLE);
    await setHealthConsent(test, revoked, false);
    expect(stored(test)).toBe(2);

    expect(test.app.deps.system.scheduler.list().map((j) => j.name)).toContain(
      'profile-purge-revoked',
    );
    await test.app.deps.system.scheduler.runNow('profile-purge-revoked');
    expect(stored(test)).toBe(1);
    expect((await api(test, 'GET', '/profile', agreed)).json().profile).toMatchObject(SAMPLE);
  });
});
