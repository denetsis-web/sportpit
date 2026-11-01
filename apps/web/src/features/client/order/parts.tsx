// Части экрана заказа: строка блюда, итоги КБЖУ, экран «Заказ подтверждён».
import { Link } from 'react-router-dom';
import type { MenuItemDto } from '@sportpit/shared/schemas/catalog';
import type { OrderDto } from '@sportpit/shared/schemas/orders';
import type { Targets, TargetsResult } from '@sportpit/shared/targets';
import { isBlocked } from '@sportpit/shared/targets';
import { useI18n } from '../../../app/i18n.tsx';
import { Button, Card } from '../../../ui/index.ts';
import { formatNumber } from '../menu/parts.tsx';
import type { CartLine } from './cart.ts';

/** Строка блюда меню: название, ккал, сколько уже в заказе, «Добавить» и «Убрать». */
export function DishRow({
  dish,
  qty,
  canAdd,
  onAdd,
  onRemove,
}: {
  dish: MenuItemDto;
  qty: number;
  canAdd: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const { t, lang } = useI18n();
  const name = dish.name[lang];
  const headingId = `order-dish-${dish.id}`;
  return (
    <article className="ui-card order-dish" aria-labelledby={headingId}>
      <h3 id={headingId} className="order-dish__name">
        {name}
      </h3>
      <p className="order-dish__kcal">{t('catalog.unit.kcal', { value: dish.calories })}</p>
      {dish.soldOut && qty === 0 ? (
        <p className="order-dish__sold-out">
          <strong>{t('orders.order.dish.soldOut')}</strong>
        </p>
      ) : (
        <p className="order-dish__left">
          {t('orders.order.dish.left', { count: dish.portionsLeft })}
        </p>
      )}
      {qty > 0 ? (
        <p className="order-dish__qty">{t('orders.order.dish.inOrder', { count: qty })}</p>
      ) : null}
      <div className="order-dish__actions">
        <Button
          variant="primary"
          disabled={!canAdd}
          onClick={onAdd}
          aria-label={t('orders.order.dish.addLabel', { name })}
        >
          {t('orders.order.dish.add')}
        </Button>
        {qty > 0 ? (
          <Button
            variant="secondary"
            onClick={onRemove}
            aria-label={t('orders.order.dish.removeLabel', { name })}
          >
            {t('orders.order.dish.remove')}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

interface Sums {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
}

export function sumNutrition(lines: readonly CartLine[], dishes: readonly MenuItemDto[]): Sums {
  const sums: Sums = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
  for (const line of lines) {
    const dish = dishes.find((d) => d.id === line.dishId);
    if (!dish) continue;
    sums.kcal += dish.calories * line.qty;
    sums.protein += dish.proteinG * line.qty;
    sums.fat += dish.fatG * line.qty;
    sums.carbs += dish.carbsG * line.qty;
    sums.fiber += dish.fiberG * line.qty;
  }
  return sums;
}

/** Итоги КБЖУ заказа; если норма дня известна, рядом «из N». */
export function Totals({ sums, targets }: { sums: Sums; targets: TargetsResult | null }) {
  const { t } = useI18n();
  const norm: Targets | null = targets && !isBlocked(targets) ? targets : null;
  const row = (label: string, value: string, target: string | null) => (
    <div key={label}>
      <dt>{label}</dt>
      <dd>{target === null ? value : t('orders.order.totals.of', { value, target })}</dd>
    </div>
  );
  const grams = (n: number) => t('catalog.unit.grams', { value: formatNumber(n) });
  return (
    <Card title={t('orders.order.totals.title')}>
      <dl className="order-totals">
        {row(
          t('orders.order.totals.kcal'),
          t('catalog.unit.kcal', { value: Math.round(sums.kcal) }),
          norm ? t('catalog.unit.kcal', { value: norm.kcal }) : null,
        )}
        {row(
          t('catalog.nutrition.protein'),
          grams(sums.protein),
          norm ? grams(norm.proteinG) : null,
        )}
        {row(t('catalog.nutrition.fat'), grams(sums.fat), norm ? grams(norm.fatG) : null)}
        {row(t('catalog.nutrition.carbs'), grams(sums.carbs), norm ? grams(norm.carbG) : null)}
        {row(t('catalog.nutrition.fiber'), grams(sums.fiber), norm ? grams(norm.fiberG) : null)}
      </dl>
      {targets === null ? (
        <p>
          {t('orders.order.totals.noTarget')}{' '}
          <Link to="/onboarding">{t('orders.order.totals.fillProfile')}</Link>
        </p>
      ) : null}
      {targets !== null && isBlocked(targets) ? <p>{t('orders.order.totals.blocked')}</p> : null}
    </Card>
  );
}

/** Подтверждённый (или перенесённый) заказ: код получения крупно и что делать дальше. */
export function OrderDone({ order, moved }: { order: OrderDto; moved: boolean }) {
  const { t, date } = useI18n();
  return (
    <div className="order-done">
      <h1>{t(moved ? 'orders.order.done.moved' : 'orders.order.done.title')}</h1>
      <Card>
        <p>
          {t('orders.order.done.where', {
            gym: order.gymName,
            fridge: order.fridgeName,
            date: date(order.date),
          })}
        </p>
        <p>{t('orders.order.done.window', { from: order.pickupFrom, to: order.pickupTo })}</p>
        <p className="order-done__label">{t('orders.order.done.code')}</p>
        <p className="order-done__code">{order.code}</p>
        <p>{t('orders.order.done.hint')}</p>
      </Card>
      <p className="order-done__links">
        <Link className="ui-button ui-button--primary" to="/orders">
          {t('orders.order.done.my')}
        </Link>{' '}
        <Link className="ui-button ui-button--secondary" to="/menu">
          {t('orders.order.done.more')}
        </Link>
      </p>
    </div>
  );
}
