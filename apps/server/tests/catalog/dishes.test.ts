import { describe, expect, it } from 'vitest';
import { auditRows } from '../admin/helpers.ts';
import {
  call,
  createDish,
  DISH,
  GIF_BYTES,
  JPEG_BYTES,
  makeAdminApp,
  PNG_BYTES,
  uploadPhoto,
} from './helpers.ts';

describe('блюда (R36, R19)', () => {
  it('создание: названия и составы RU/RO, КБЖУ, вес, аллергены, срок хранения; запись в журнале', async () => {
    const test = await makeAdminApp();
    const res = await call(test.app, 'POST', '/admin/dishes', test.admin, {
      ...DISH,
      proteinG: 42.5,
      allergens: ['gluten', 'eggs'],
      goals: ['lose', 'maintain'],
      vegetarian: true,
    });
    expect(res.statusCode).toBe(201);
    const dish = res.json();
    expect(dish).toMatchObject({
      name: { ru: 'Курица с рисом', ro: 'Pui cu orez' },
      composition: {
        ru: 'куриная грудка, рис, брокколи',
        ro: 'piept de pui, orez, broccoli',
      },
      calories: 520,
      proteinG: 42.5,
      fatG: 14,
      carbsG: 55,
      fiberG: 6,
      weightG: 380,
      allergens: ['gluten', 'eggs'],
      goals: ['lose', 'maintain'],
      vegetarian: true,
      shelfLifeHours: 72,
      photoUrl: null,
      active: true,
    });
    expect(Number.isInteger(dish.id)).toBe(true);

    const list = (await call(test.app, 'GET', '/admin/dishes', test.admin)).json();
    expect(list.items.map((d: { id: number }) => d.id)).toEqual([dish.id]);
    expect(auditRows(test.app).map((r) => [r.user_id, r.action, r.target])).toEqual([
      [test.adminId, 'dish.create', `dish:${dish.id}`],
    ]);
  });

  it('правка и отключение блюда: частичное изменение, остальные поля сохраняются, в журнал пишется каждое', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    const patched = await call(test.app, 'PATCH', `/admin/dishes/${dish.id}`, test.admin, {
      nameRu: 'Курица с булгуром',
      calories: 540,
      allergens: ['lactose'],
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({
      name: { ru: 'Курица с булгуром', ro: 'Pui cu orez' },
      calories: 540,
      allergens: ['lactose'],
      proteinG: 42,
    });
    const off = await call(test.app, 'PATCH', `/admin/dishes/${dish.id}`, test.admin, {
      active: false,
    });
    expect(off.json().active).toBe(false);
    expect(auditRows(test.app).map((r) => r.action)).toEqual([
      'dish.create',
      'dish.update',
      'dish.update',
    ]);
    expect(
      (await call(test.app, 'PATCH', '/admin/dishes/9999', test.admin, { nameRu: 'X' })).statusCode,
    ).toBe(404);
  });

  it('правка одного поля не сбрасывает цели, вегетарианность, аллергены и активность', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test, {
      goals: ['lose', 'gain'],
      vegetarian: true,
      allergens: ['eggs'],
      active: false,
    });
    const patched = await call(test.app, 'PATCH', `/admin/dishes/${dish.id}`, test.admin, {
      calories: 400,
    });
    expect(patched.json()).toMatchObject({
      calories: 400,
      goals: ['lose', 'gain'],
      vegetarian: true,
      allergens: ['eggs'],
      active: false,
    });
  });

  it('проверка полей: нет румынского названия, отрицательные граммы, неизвестный аллерген, нулевой вес и срок', async () => {
    const test = await makeAdminApp();
    const post = (body: Record<string, unknown>) =>
      call(test.app, 'POST', '/admin/dishes', test.admin, { ...DISH, ...body });
    const noRo = await post({ nameRo: '' });
    expect(noRo.statusCode).toBe(400);
    expect(noRo.json().error.fields.nameRo).toBe('catalog.error.name');
    const negative = await post({ proteinG: -1 });
    expect(negative.json().error.fields.proteinG).toBe('catalog.error.nutrition');
    expect((await post({ allergens: ['unicorn'] })).statusCode).toBe(400);
    expect((await post({ weightG: 0 })).json().error.fields.weightG).toBe('catalog.error.weight');
    expect((await post({ shelfLifeHours: 0 })).json().error.fields.shelfLifeHours).toBe(
      'catalog.error.shelfLife',
    );
    expect((await post({ goals: ['bulk'] })).statusCode).toBe(400);
    expect(auditRows(test.app)).toHaveLength(0);
  });

  it('только администратор: клиент — 403, без входа — 401', async () => {
    const test = await makeAdminApp();
    expect((await call(test.app, 'GET', '/admin/dishes', test.client)).statusCode).toBe(403);
    expect((await call(test.app, 'POST', '/admin/dishes', test.client, DISH)).statusCode).toBe(403);
    expect((await call(test.app, 'GET', '/admin/dishes')).statusCode).toBe(401);
  });
});

describe('фото блюда: только JPEG и PNG до 5 МБ (Решения по реализации)', () => {
  it('JPEG принимается, ссылка ведёт на публичный файл, который отдаётся с верным типом', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    const res = await uploadPhoto(test, dish.id, JPEG_BYTES);
    expect(res.statusCode).toBe(200);
    const { photoUrl } = res.json();
    expect(photoUrl).toMatch(/^\/api\/v1\/files\/dishes\/[a-z0-9._-]+\.jpg$/);
    const file = await test.app.inject({ method: 'GET', url: photoUrl });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.from(file.rawPayload).equals(JPEG_BYTES)).toBe(true);
    expect(auditRows(test.app).map((r) => r.action)).toContain('dish.photo');
  });

  it('PNG принимается; новое фото заменяет старое, старый файл удаляется из хранилища', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    const first = (await uploadPhoto(test, dish.id, JPEG_BYTES)).json().photoUrl as string;
    const second = await uploadPhoto(test, dish.id, PNG_BYTES, 'photo.png', 'image/png');
    expect(second.statusCode).toBe(200);
    const url = second.json().photoUrl as string;
    expect(url).toMatch(/\.png$/);
    expect(url).not.toBe(first);
    expect((await test.app.inject({ method: 'GET', url })).statusCode).toBe(200);
    expect((await test.app.inject({ method: 'GET', url: first })).statusCode).toBe(404);
  });

  it('GIF, текст под видом JPEG и пустой файл отклоняются: проверяется содержимое, а не заявленный тип', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    const gif = await uploadPhoto(test, dish.id, GIF_BYTES, 'a.gif', 'image/gif');
    expect(gif.statusCode).toBe(415);
    expect(gif.json().error.code).toBe('photo_type');
    const fake = await uploadPhoto(
      test,
      dish.id,
      Buffer.from('это не картинка'),
      'a.jpg',
      'image/jpeg',
    );
    expect(fake.statusCode).toBe(415);
    const empty = await uploadPhoto(test, dish.id, Buffer.alloc(0), 'a.jpg', 'image/jpeg');
    expect(empty.statusCode).toBe(415);
    const dishes = (await call(test.app, 'GET', '/admin/dishes', test.admin)).json();
    expect(dishes.items[0].photoUrl).toBeNull();
  });

  it('файл больше 5 МБ отклоняется кодом 413, фото не меняется', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    const kept = (await uploadPhoto(test, dish.id, JPEG_BYTES)).json().photoUrl as string;
    const big = Buffer.concat([JPEG_BYTES, Buffer.alloc(5 * 1024 * 1024 + 1024)]);
    const res = await uploadPhoto(test, dish.id, big);
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('photo_too_large');
    const list = (await call(test.app, 'GET', '/admin/dishes', test.admin)).json();
    expect(list.items[0].photoUrl).toBe(kept);
  });

  it('удаление фото очищает ссылку и файл; для неизвестного блюда — 404; клиенту — 403', async () => {
    const test = await makeAdminApp();
    const dish = await createDish(test);
    const url = (await uploadPhoto(test, dish.id, PNG_BYTES, 'p.png', 'image/png')).json()
      .photoUrl as string;
    const removed = await call(test.app, 'DELETE', `/admin/dishes/${dish.id}/photo`, test.admin);
    expect(removed.statusCode).toBe(200);
    expect(removed.json().photoUrl).toBeNull();
    expect((await test.app.inject({ method: 'GET', url })).statusCode).toBe(404);
    expect((await uploadPhoto(test, 9999, JPEG_BYTES)).statusCode).toBe(404);
    const form = await call(test.app, 'DELETE', `/admin/dishes/${dish.id}/photo`, test.client);
    expect(form.statusCode).toBe(403);
  });
});
