// Корзина заказа хранится на устройстве до отправки (R10.2): при обрыве связи или перезагрузке страницы
// выбранные блюда остаются. Вместе с корзиной живёт ключ идемпотентности подтверждения: пока корзина не
// менялась, повторное нажатие «Подтвердить» (в том числе после обновления страницы) идёт с тем же ключом,
// и сервер не создаёт второй заказ.
import { readStored, writeStored } from '../../../app/storage.ts';

export const CART_STORAGE_KEY = 'sportpit.cart';

export interface CartLine {
  dishId: number;
  qty: number;
}

export interface Cart {
  fridgeId: string | null;
  date: string | null;
  items: CartLine[];
  /** Ключ подтверждения этой корзины; пусто, пока заказ не отправляли. */
  key: string | null;
}

export const EMPTY_CART: Cart = { fridgeId: null, date: null, items: [], key: null };

function isLine(value: unknown): value is CartLine {
  const line = value as Partial<CartLine> | null;
  return (
    typeof line === 'object' &&
    line !== null &&
    Number.isInteger(line.dishId) &&
    Number.isInteger(line.qty) &&
    (line.qty as number) > 0
  );
}

export function readCart(): Cart {
  const raw = readStored(CART_STORAGE_KEY);
  if (raw === null) return EMPTY_CART;
  try {
    const parsed = JSON.parse(raw) as Partial<Cart> | null;
    if (!parsed || typeof parsed !== 'object') return EMPTY_CART;
    return {
      fridgeId: typeof parsed.fridgeId === 'string' ? parsed.fridgeId : null,
      date: typeof parsed.date === 'string' ? parsed.date : null,
      items: Array.isArray(parsed.items) ? parsed.items.filter(isLine) : [],
      key: typeof parsed.key === 'string' ? parsed.key : null,
    };
  } catch {
    return EMPTY_CART;
  }
}

export function writeCart(cart: Cart): void {
  if (cart.items.length === 0 && cart.key === null) {
    clearCart();
    return;
  }
  writeStored(CART_STORAGE_KEY, JSON.stringify(cart));
}

export function clearCart(): void {
  try {
    window.localStorage.removeItem(CART_STORAGE_KEY);
  } catch {
    // хранилище недоступно: корзина живёт до перезагрузки страницы
  }
}

export const cartBoxes = (items: readonly CartLine[]): number =>
  items.reduce((sum, line) => sum + line.qty, 0);

/** Ключ подтверждения: один заказ — один ключ, повтор после сбоя сети идёт с тем же. */
export function newOrderKey(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `o-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
