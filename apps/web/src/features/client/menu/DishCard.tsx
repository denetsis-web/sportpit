import { Link } from 'react-router-dom';
import type { MenuItemDto } from '@sportpit/shared/schemas/catalog';
import { useI18n } from '../../../app/i18n.tsx';
import { Button } from '../../../ui/index.ts';
import {
  AllergensLine,
  CookedLine,
  Nutrition,
  orderLink,
  RatingLine,
  StockLine,
} from './parts.tsx';

/** Карточка блюда в меню: фото, название, КБЖУ, аллергены, время приготовления, рейтинг, «в заказ». */
export function DishCard({
  dish,
  date,
  today,
}: {
  dish: MenuItemDto;
  date: string;
  today: string;
}) {
  const { t, lang } = useI18n();
  const name = dish.name[lang];
  const headingId = `dish-${dish.id}`;
  return (
    <article className="ui-card dish" aria-labelledby={headingId}>
      {dish.photoUrl ? (
        <img className="dish__photo" src={dish.photoUrl} alt={name} loading="lazy" />
      ) : (
        <div className="dish__photo dish__photo--empty" aria-hidden="true" />
      )}
      <h2 id={headingId} className="dish__name">
        <Link to={`/menu/dish/${dish.id}?date=${date}`}>{name}</Link>
      </h2>
      {dish.vegetarian ? <p className="dish__tag">{t('catalog.vegetarian')}</p> : null}
      <Nutrition dish={dish} />
      <AllergensLine dish={dish} />
      <CookedLine dish={dish} date={date} today={today} />
      <RatingLine rating={dish.rating} />
      <StockLine dish={dish} />
      {dish.soldOut ? (
        <Button disabled fullWidth>
          {t('catalog.add')}
        </Button>
      ) : (
        <Link
          className="ui-button ui-button--primary ui-button--full"
          to={orderLink(date, dish.id)}
        >
          {t('catalog.add')}
        </Link>
      )}
    </article>
  );
}
