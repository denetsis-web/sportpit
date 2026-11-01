// Помощники тестов обратной связи: клиент с выданным заказом, форма жалобы с фото, оценка блюда.
import { ordersFor } from '../../src/modules/orders/index.ts';
import { as, WRITE } from '../auth/helpers.ts';
import { JPEG_BYTES, PNG_BYTES } from '../catalog/helpers.ts';
import {
  call,
  makeOrdersApp,
  placeOk,
  type OrderBody,
  type OrdersTest,
  type PlacedOrder,
} from '../orders/helpers.ts';

export { call, makeOrdersApp, placeOk, JPEG_BYTES, PNG_BYTES };
export type { OrdersTest, PlacedOrder };

export const HOUR = 60 * 60 * 1000;

/** Заказ клиента, доведённый до выдачи: confirmed → loaded → picked_up. */
export async function pickedUpOrder(
  test: OrdersTest,
  cookie: string = test.client,
  overrides: OrderBody = {},
): Promise<PlacedOrder> {
  const order = await placeOk(test, cookie, overrides);
  const orders = ordersFor(test.deps);
  orders.transition(order.id, 'loaded', { kind: 'system' });
  orders.transition(order.id, 'picked_up', { kind: 'system' });
  return { ...order, status: 'picked_up' };
}

export const rate = (
  test: OrdersTest,
  cookie: string,
  body: { orderId: string; dishId: number; stars: number; tag?: string | null },
) => call(test, 'PUT', '/feedback/ratings', cookie, body);

export interface ComplaintForm {
  orderId?: string;
  dishId?: number;
  reason?: string;
  description?: string;
  file?: { bytes: Uint8Array; filename: string; contentType: string } | null;
}

/** Тело multipart: текстовые поля и (необязательно) один файл `photo`. */
export function complaintMultipart(form: ComplaintForm) {
  const boundary = '----sportpit-complaint-boundary';
  const chunks: Buffer[] = [];
  const fields: Record<string, string | undefined> = {
    orderId: form.orderId,
    dishId: form.dishId === undefined ? undefined : String(form.dishId),
    reason: form.reason,
    description: form.description,
  };
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        'utf8',
      ),
    );
  }
  if (form.file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${form.file.filename}"\r\nContent-Type: ${form.file.contentType}\r\n\r\n`,
      ),
      Buffer.from(form.file.bytes),
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export function complain(test: OrdersTest, cookie: string, form: ComplaintForm) {
  const body = complaintMultipart(form);
  return test.app.inject({
    method: 'POST',
    url: '/api/v1/feedback/complaints',
    headers: { ...as(cookie, WRITE), 'content-type': body.contentType },
    payload: body.payload,
  });
}

export const jpegFile = (filename = 'box.jpg') => ({
  bytes: JPEG_BYTES,
  filename,
  contentType: 'image/jpeg',
});

export const pngFile = (filename = 'box.png') => ({
  bytes: PNG_BYTES,
  filename,
  contentType: 'image/png',
});
