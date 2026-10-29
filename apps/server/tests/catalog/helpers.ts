// Помощники тестов блюд и меню: блюда-образцы, загрузка фото, меню на день.
import { call, type AdminTest } from '../admin/helpers.ts';

export { call, makeAdminApp, type AdminTest } from '../admin/helpers.ts';

/** Блюдо-образец; поля можно переопределить в тесте. */
export const DISH = {
  nameRu: 'Курица с рисом',
  nameRo: 'Pui cu orez',
  compositionRu: 'куриная грудка, рис, брокколи',
  compositionRo: 'piept de pui, orez, broccoli',
  calories: 520,
  proteinG: 42,
  fatG: 14,
  carbsG: 55,
  fiberG: 6,
  weightG: 380,
  allergens: [] as string[],
  goals: ['maintain'] as string[],
  vegetarian: false,
  shelfLifeHours: 72,
} as const;

export interface CreatedDish {
  id: number;
  name: { ru: string; ro: string };
  active: boolean;
  photoUrl: string | null;
}

export async function createDish(
  test: AdminTest,
  overrides: Record<string, unknown> = {},
): Promise<CreatedDish> {
  const res = await call(test.app, 'POST', '/admin/dishes', test.admin, { ...DISH, ...overrides });
  if (res.statusCode !== 201) throw new Error(`Блюдо не создано: ${res.statusCode} ${res.body}`);
  return res.json();
}

/** Сохраняет меню на день и (по умолчанию) публикует его. */
export async function setMenu(
  test: AdminTest,
  date: string,
  items: Array<{ dishId: number; portionLimit: number }>,
  publish = true,
): Promise<void> {
  const saved = await call(test.app, 'PUT', `/admin/menu/${date}`, test.admin, { items });
  if (saved.statusCode !== 200)
    throw new Error(`Меню не сохранено: ${saved.statusCode} ${saved.body}`);
  if (!publish) return;
  const published = await call(test.app, 'POST', `/admin/menu/${date}/publish`, test.admin);
  if (published.statusCode !== 200) {
    throw new Error(`Меню не опубликовано: ${published.statusCode} ${published.body}`);
  }
}

/** Тело multipart с одним файлом `photo`. */
export function multipart(file: Uint8Array, filename: string, contentType: string) {
  const boundary = '----sportpit-test-boundary';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, Buffer.from(file), tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** Минимальные заголовки настоящих файлов: JPEG и PNG. */
export const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
export const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
export const GIF_BYTES = Buffer.from('GIF89a\u0001\u0000\u0001\u0000', 'latin1');

export async function uploadPhoto(
  test: AdminTest,
  dishId: number,
  file: Uint8Array,
  filename = 'photo.jpg',
  contentType = 'image/jpeg',
) {
  const form = multipart(file, filename, contentType);
  return test.app.inject({
    method: 'POST',
    url: `/api/v1/admin/dishes/${dishId}/photo`,
    headers: {
      cookie: test.admin,
      'x-requested-with': 'sportpit',
      'content-type': form.contentType,
    },
    payload: form.payload,
  });
}
