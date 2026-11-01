// Экран «Заказ на завтра»: холодильник и дата, блюда меню, корзина, итоги КБЖУ, остаток кредитов и «Подтвердить».
// Все правила (срок, вместимость, лимиты, баланс) по-настоящему проверяет сервер; здесь они только
// отражены: кнопка отключается, а причина названа текстом. Корзина хранится на устройстве до отправки.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PublicFridgeDto } from '@sportpit/shared/schemas/admin';
import type { BalanceResponse } from '@sportpit/shared/schemas/billing';
import type { MenuDto } from '@sportpit/shared/schemas/catalog';
import type { Availability, OrderDto } from '@sportpit/shared/schemas/orders';
import type { TargetsResult } from '@sportpit/shared/targets';
import { addDaysISO } from '@sportpit/shared/time';
import { ApiError, NetworkError } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { useInstall } from '../../../app/install.tsx';
import { Banner, Button, Card } from '../../../ui/index.ts';
import { describeError } from '../auth/errors.ts';
import { RequireRole } from '../auth/guards.tsx';
import { getSelectedFridge, setSelectedFridge } from '../menu/fridge.ts';
import {
  confirmOrder,
  fetchAvailability,
  fetchCredits,
  fetchFridges,
  fetchMenu,
  fetchOrder,
  fetchProfile,
  moveOrder,
} from './api.ts';
import {
  cartBoxes,
  clearCart,
  EMPTY_CART,
  newOrderKey,
  readCart,
  writeCart,
  type Cart,
  type CartLine,
} from './cart.ts';
import { DishRow, OrderDone, sumNutrition, Totals } from './parts.tsx';
import './order.css';

const DAYS_AHEAD = 7;

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      fridges: PublicFridgeDto[];
      credits: BalanceResponse;
      targets: TargetsResult | null;
    };

interface Done {
  order: OrderDto;
  moved: boolean;
}

function OrderContent() {
  const { t, lang, date: formatDate, time } = useI18n();
  const install = useInstall();
  const [params, setParams] = useSearchParams();
  const moveId = params.get('move');
  const dishParam = Number(params.get('dish'));

  const [base, setBase] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [cart, setCart] = useState<Cart>(() => (moveId ? EMPTY_CART : readCart()));
  const [fridgeId, setFridgeId] = useState<string | null>(null);
  const [date, setDate] = useState<string | undefined>(
    () => params.get('date') ?? (moveId ? undefined : (readCart().date ?? undefined)),
  );
  const [menu, setMenu] = useState<MenuDto | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [moving, setMoving] = useState<OrderDto | null>(null);
  const [moveFailed, setMoveFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const busyRef = useRef(false);
  const dishApplied = useRef(false);
  const cartReady = useRef(false);

  // ---- первичная загрузка: холодильники, кредиты, норма дня, переносимый заказ ----
  useEffect(() => {
    let alive = true;
    setBase({ status: 'loading' });
    (async () => {
      try {
        const [fridges, credits, profile, old] = await Promise.all([
          fetchFridges(),
          fetchCredits(),
          fetchProfile().catch(() => null),
          moveId ? fetchOrder(moveId).catch(() => null) : Promise.resolve(null),
        ]);
        if (!alive) return;
        const list = fridges.items;
        if (moveId) {
          const order = old?.order ?? null;
          if (!order || !order.canChange) {
            setMoveFailed(true);
          } else {
            setMoving(order);
            setCart({
              fridgeId: order.fridgeId,
              date: order.date,
              items: order.items.map((i) => ({ dishId: i.dishId, qty: i.qty })),
              key: null,
            });
            setDate((current) => current ?? order.date);
          }
        }
        const known = (id: string | null | undefined) =>
          id && list.some((f) => f.id === id) ? id : null;
        setFridgeId(
          (current) =>
            current ??
            known(old?.order.fridgeId) ??
            known(readCart().fridgeId) ??
            known(getSelectedFridge()) ??
            list[0]?.id ??
            null,
        );
        setBase({ status: 'ready', fridges: list, credits, targets: profile?.targets ?? null });
      } catch {
        if (alive) setBase({ status: 'error' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [moveId, attempt]);

  // ---- меню выбранного дня ----
  const baseReady = base.status === 'ready';
  useEffect(() => {
    if (!baseReady) return;
    let alive = true;
    fetchMenu(date)
      .then((loaded) => {
        if (!alive) return;
        setMenu(loaded);
        if (date === undefined) setDate(loaded.date);
      })
      .catch(() => alive && setBase({ status: 'error' }));
    return () => {
      alive = false;
    };
  }, [baseReady, date, attempt]);

  // ---- свободные места и срок ----
  const menuDate = menu?.date ?? null;
  const [availabilityTick, setAvailabilityTick] = useState(0);
  useEffect(() => {
    if (!fridgeId || !menuDate) return;
    let alive = true;
    setAvailability(null);
    fetchAvailability(fridgeId, menuDate)
      .then((loaded) => alive && setAvailability(loaded))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [fridgeId, menuDate, availabilityTick]);

  // ---- корзина: убираем блюда, которых нет в меню дня, и подрезаем количество по остатку порций ----
  useEffect(() => {
    if (!menu) return;
    setCart((prev) => {
      const items = prev.items
        .map((line) => {
          const dish = menu.items.find((d) => d.id === line.dishId);
          if (!dish) return null;
          const held = moving && moving.date === menu.date ? heldBy(moving, line.dishId) : 0;
          const qty = Math.min(line.qty, dish.portionsLeft + held);
          return qty > 0 ? { dishId: line.dishId, qty } : null;
        })
        .filter((line): line is CartLine => line !== null);
      const same =
        items.length === prev.items.length &&
        items.every((l, i) => l.dishId === prev.items[i]!.dishId && l.qty === prev.items[i]!.qty);
      return same ? prev : { ...prev, items, key: null };
    });
  }, [menu, moving]);

  // ---- блюдо из ссылки меню (/order?dish=<id>) кладём в корзину один раз ----
  useEffect(() => {
    if (!menu || dishApplied.current || moveId) return;
    dishApplied.current = true;
    if (!Number.isInteger(dishParam) || dishParam <= 0) return;
    const dish = menu.items.find((d) => d.id === dishParam);
    if (dish && !dish.soldOut) {
      setCart((prev) =>
        prev.items.some((l) => l.dishId === dishParam)
          ? prev
          : {
              ...prev,
              items: [...prev.items, { dishId: dishParam, qty: 1 }].sort(byDish),
              key: null,
            },
      );
    }
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('dish');
        return next;
      },
      { replace: true },
    );
  }, [menu, moveId, dishParam, setParams]);

  // корзина на устройстве: пишем после каждого изменения (кроме режима переноса)
  useEffect(() => {
    if (!cartReady.current) {
      cartReady.current = true;
      return;
    }
    if (!moveId && !done) writeCart({ ...cart, fridgeId, date: menuDate ?? cart.date });
  }, [cart, fridgeId, menuDate, moveId, done]);

  const refresh = useCallback(() => {
    setAvailabilityTick((n) => n + 1);
    setAttempt((n) => n + 1);
  }, []);

  if (done) return <OrderDone order={done.order} moved={done.moved} />;

  if (base.status === 'loading') return <p role="status">{t('core.loading')}</p>;
  if (base.status === 'error') {
    return (
      <>
        <h1>{t('orders.order.titleTomorrow')}</h1>
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={refresh}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {t('orders.order.loadError')}
        </Banner>
      </>
    );
  }
  if (moveId && moveFailed) {
    return (
      <>
        <h1>{t('orders.order.move.title')}</h1>
        <Banner variant="error">{t('orders.order.move.notFound')}</Banner>
        <Link className="ui-button ui-button--secondary" to="/orders">
          {t('orders.order.done.my')}
        </Link>
      </>
    );
  }

  const { fridges, credits, targets } = base;
  const today = menu?.today ?? null;
  const tomorrow = today ? addDaysISO(today, 1) : null;

  // ---- что уже занято самим переносимым заказом: после переноса он освободится ----
  const sameDay = moving !== null && menuDate === moving.date;
  const heldBoxes = moving ? moving.boxes : 0;
  const boxes = cartBoxes(cart.items);
  const creditsAvailable = credits.balance + heldBoxes;
  const seatsLeft = availability
    ? availability.boxesLeft + (sameDay && moving?.fridgeId === fridgeId ? heldBoxes : 0)
    : 0;
  const limitLeft = availability
    ? availability.maxBoxesPerDay - (availability.userBoxes - (sameDay ? heldBoxes : 0))
    : 0;
  const closed = availability?.closedReason ?? null;
  const open = availability !== null && closed === null;
  const canGrow = open && boxes < creditsAvailable && boxes < limitLeft && boxes < seatsLeft;
  const canConfirm =
    open && boxes > 0 && boxes <= creditsAvailable && boxes <= limitLeft && boxes <= seatsLeft;

  const qtyOf = (dishId: number) => cart.items.find((l) => l.dishId === dishId)?.qty ?? 0;
  const setQty = (dishId: number, qty: number) =>
    setCart((prev) => {
      const rest = prev.items.filter((l) => l.dishId !== dishId);
      return {
        ...prev,
        items: qty > 0 ? [...rest, { dishId, qty }].sort(byDish) : rest,
        key: null,
      };
    });
  const allowedFor = (dishId: number): number => {
    const dish = menu?.items.find((d) => d.id === dishId);
    return dish ? dish.portionsLeft + (sameDay && moving ? heldBy(moving, dishId) : 0) : 0;
  };

  async function onConfirm() {
    if (busyRef.current || !canConfirm || !fridgeId || !menuDate) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    // ключ живёт вместе с корзиной: повтор после обрыва или перезагрузки идёт с тем же ключом
    const key = cart.key ?? newOrderKey();
    if (cart.key === null) {
      const withKey = { ...cart, key };
      setCart(withKey);
      if (!moveId) writeCart({ ...withKey, fridgeId, date: menuDate });
    }
    const input = { fridgeId, date: menuDate, items: cart.items, idempotencyKey: key };
    try {
      if (moveId) {
        const moved = await moveOrder(moveId, input);
        clearCart();
        setDone({ order: moved.order, moved: true });
      } else {
        const created = await confirmOrder(input);
        clearCart();
        setDone({ order: created.order, moved: false });
        if (created.firstOrder) install.request();
      }
    } catch (error) {
      setNotice(
        error instanceof NetworkError ? t('orders.order.notSent') : describeError(t, error),
      );
      // остатки и места могли измениться: перечитываем, блюда в корзине остаются
      if (error instanceof ApiError) refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const dayOptions = tomorrow
    ? Array.from({ length: DAYS_AHEAD }, (_, i) => addDaysISO(tomorrow, i))
    : [];
  if (menuDate && !dayOptions.includes(menuDate)) dayOptions.push(menuDate);

  const title =
    menuDate && menuDate === tomorrow
      ? t('orders.order.titleTomorrow')
      : t('orders.order.titleDate', { date: menuDate ? formatDate(menuDate) : '' });

  return (
    <div className="order">
      <h1>{moving ? t('orders.order.move.title') : title}</h1>
      <p>{moving ? t('orders.order.move.hint') : t('orders.order.lead')}</p>

      <div className="ui-field">
        <label className="ui-field__label" htmlFor="order-fridge">
          {t('orders.order.fridge.label')}
        </label>
        <select
          id="order-fridge"
          className="ui-field__input"
          value={fridgeId ?? ''}
          onChange={(e) => {
            const next = e.target.value;
            setFridgeId(next);
            setSelectedFridge(next);
            setCart((prev) => ({ ...prev, key: null }));
          }}
        >
          {fridgeId === null ? <option value="">{t('orders.order.fridge.choose')}</option> : null}
          {fridges.map((f) => (
            <option key={f.id} value={f.id}>
              {t('orders.order.fridge.option', { gym: f.gymName, name: f.name })}
            </option>
          ))}
        </select>
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="order-date">
          {t('orders.order.date.label')}
        </label>
        <select
          id="order-date"
          className="ui-field__input"
          value={menuDate ?? ''}
          onChange={(e) => {
            setDate(e.target.value);
            setCart((prev) => ({ ...prev, key: null }));
          }}
        >
          {dayOptions.map((day) => (
            <option key={day} value={day}>
              {day === tomorrow
                ? t('orders.order.date.tomorrow', { date: formatDate(day) })
                : t('orders.order.date.option', { date: formatDate(day) })}
            </option>
          ))}
        </select>
      </div>

      {availability ? (
        <div className="order__status">
          {closed === null ? (
            <p>
              {t('orders.order.cutoff', {
                time: time(availability.cutoffAt),
                date: formatDate(availability.cutoffAt),
              })}
            </p>
          ) : (
            <Banner variant="warning">
              {t(`orders.order.closed.${closed}`, { time: availability.cutoffTime })}
            </Banner>
          )}
          <p className={seatsLeft <= 0 ? 'order__seats order__seats--none' : 'order__seats'}>
            {seatsLeft <= 0
              ? t('orders.order.seats.none')
              : t('orders.order.seats.left', { count: seatsLeft })}
          </p>
        </div>
      ) : null}

      <section aria-labelledby="order-menu-title">
        <h2 id="order-menu-title">{t('orders.order.menu.title')}</h2>
        {menu && !menu.published ? (
          <Card>
            <p>{t('orders.order.menu.empty')}</p>
            <p>{t('orders.order.menu.later')}</p>
          </Card>
        ) : (
          <div className="order__dishes">
            {(menu?.items ?? []).map((dish) => {
              const qty = qtyOf(dish.id);
              return (
                <DishRow
                  key={dish.id}
                  dish={dish}
                  qty={qty}
                  canAdd={canGrow && qty < allowedFor(dish.id) && !dish.soldOut}
                  onAdd={() => setQty(dish.id, qty + 1)}
                  onRemove={() => setQty(dish.id, qty - 1)}
                />
              );
            })}
          </div>
        )}
      </section>

      <Card title={t('orders.order.cart.title')}>
        {cart.items.length === 0 ? (
          <p>{t('orders.order.cart.empty')}</p>
        ) : (
          <ul className="order__lines">
            {cart.items.map((line) => {
              const dish = menu?.items.find((d) => d.id === line.dishId);
              return dish ? (
                <li key={line.dishId}>
                  {t('orders.order.cart.line', { qty: line.qty, name: dish.name[lang] })}
                </li>
              ) : null;
            })}
          </ul>
        )}
        <p>
          <strong>{t('orders.order.cart.boxes', { count: boxes })}</strong>
        </p>
      </Card>

      <Totals sums={sumNutrition(cart.items, menu?.items ?? [])} targets={targets} />

      <Card>
        <p>{t('orders.order.credits.balance', { count: credits.balance })}</p>
        <p>{t('orders.order.credits.after', { count: Math.max(0, creditsAvailable - boxes) })}</p>
        {boxes > creditsAvailable ? (
          <Banner variant="warning">
            {t('orders.order.credits.short', { need: boxes, have: creditsAvailable })}
          </Banner>
        ) : null}
        {creditsAvailable <= boxes ? (
          <p>
            <Link to="/packages">{t('orders.order.credits.buy')}</Link>
          </p>
        ) : null}
        {availability && closed === null && boxes >= limitLeft ? (
          <p>
            {t('orders.order.limit', {
              max: availability.maxBoxesPerDay,
              used: availability.userBoxes - (sameDay ? heldBoxes : 0),
            })}
          </p>
        ) : null}
      </Card>

      {notice ? <Banner variant="error">{notice}</Banner> : null}

      <Button fullWidth disabled={!canConfirm} loading={busy} onClick={() => void onConfirm()}>
        {moving ? t('orders.order.confirmMove') : t('orders.order.confirm')}
      </Button>
    </div>
  );
}

const byDish = (a: CartLine, b: CartLine) => a.dishId - b.dishId;

const heldBy = (order: OrderDto, dishId: number): number =>
  order.items.find((i) => i.dishId === dishId)?.qty ?? 0;

export function OrderPage() {
  return (
    <RequireRole roles={['client', 'admin']}>
      <OrderContent />
    </RequireRole>
  );
}
