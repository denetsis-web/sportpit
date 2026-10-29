// Общие части карточки блюда в списке и на странице блюда: КБЖУ, аллергены, рейтинг, время приготовления.
import type { MenuItemDto, Rating } from '@sportpit/shared/schemas/catalog';
import { useI18n } from '../../../app/i18n.tsx';

/** Число в формате Молдовы: запятая, не больше одного знака. */
export function formatNumber(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',');
}

export function RatingLine({ rating }: { rating: Rating }) {
  const { t } = useI18n();
  if (rating.avg === null) return <p className="dish__rating">{t('catalog.rating.none')}</p>;
  return (
    <p className="dish__rating">
      <span aria-hidden="true">★ </span>
      {t('catalog.rating.value', { avg: formatNumber(rating.avg), count: rating.count })}
    </p>
  );
}

export function Nutrition({ dish }: { dish: MenuItemDto }) {
  const { t } = useI18n();
  const g = (value: number) => t('catalog.unit.grams', { value: formatNumber(value) });
  return (
    <>
      <p className="dish__kcal">{t('catalog.unit.kcal', { value: dish.calories })}</p>
      <dl className="dish__macros">
        <div>
          <dt>{t('catalog.nutrition.protein')}</dt>
          <dd>{g(dish.proteinG)}</dd>
        </div>
        <div>
          <dt>{t('catalog.nutrition.fat')}</dt>
          <dd>{g(dish.fatG)}</dd>
        </div>
        <div>
          <dt>{t('catalog.nutrition.carbs')}</dt>
          <dd>{g(dish.carbsG)}</dd>
        </div>
        <div>
          <dt>{t('catalog.nutrition.fiber')}</dt>
          <dd>{g(dish.fiberG)}</dd>
        </div>
      </dl>
    </>
  );
}

export function AllergensLine({ dish }: { dish: MenuItemDto }) {
  const { t } = useI18n();
  const list = dish.allergens.map((code) => t(`catalog.allergen.${code}`)).join(', ');
  return (
    <p className="dish__allergens">
      <strong>{t('catalog.allergens.title')}: </strong>
      {list || t('catalog.allergens.none')}
    </p>
  );
}

/**
 * «Приготовлено … в …» — если кухня уже отметила партию; для будущей даты вместо времени —
 * «приготовим накануне вечером»; нет данных на сегодня или прошлое — ничего не придумываем.
 */
export function CookedLine({
  dish,
  date,
  today,
}: {
  dish: MenuItemDto;
  date: string;
  today: string;
}) {
  const { t, date: formatDate, time, dateTime } = useI18n();
  if (date > today) return <p className="dish__cooked">{t('catalog.cooked.later')}</p>;
  if (!dish.cookedAt) return null;
  const eatBy = new Date(new Date(dish.cookedAt).getTime() + dish.shelfLifeHours * 3_600_000);
  return (
    <p className="dish__cooked">
      {t('catalog.cooked.at', { date: formatDate(dish.cookedAt), time: time(dish.cookedAt) })}
      {' · '}
      {t('catalog.cooked.eatBy', { datetime: dateTime(eatBy.toISOString()) })}
    </p>
  );
}

export function StockLine({ dish }: { dish: MenuItemDto }) {
  const { t } = useI18n();
  if (dish.soldOut) {
    return (
      <p className="dish__sold-out">
        <strong>{t('catalog.soldOut')}</strong>
      </p>
    );
  }
  return <p className="dish__left">{t('catalog.left', { count: dish.portionsLeft })}</p>;
}

/** Адрес входа в заказ для блюда на дату; его обрабатывает оформление заказа (таск 06). */
export function orderLink(date: string, dishId: number): string {
  return `/order?date=${encodeURIComponent(date)}&dish=${dishId}`;
}
