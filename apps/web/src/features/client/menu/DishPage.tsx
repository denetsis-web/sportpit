import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { dishCardSchema, REVIEW_TAGS, type DishCardDto } from '@sportpit/shared/schemas/catalog';
import { api, ApiError } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card } from '../../../ui/index.ts';
import './menu.css';
import {
  AllergensLine,
  CookedLine,
  formatNumber,
  Nutrition,
  orderLink,
  RatingLine,
  StockLine,
} from './parts.tsx';

type State =
  | { status: 'loading' }
  | { status: 'error'; notFound: boolean; messageKey: string }
  | { status: 'ready'; card: DishCardDto };

function reviewTag(tag: string | null, t: (key: string) => string): string | null {
  return tag && (REVIEW_TAGS as readonly string[]).includes(tag) ? t(`catalog.tag.${tag}`) : null;
}

/** Карточка блюда: состав, вес порции, КБЖУ, рейтинг и отзывы (без автора), кнопка «в заказ». */
export function DishPage() {
  const { t, lang, date: formatDate } = useI18n();
  const { id } = useParams();
  const [params] = useSearchParams();
  const date = params.get('date') ?? undefined;
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    api
      .get(`/dishes/${encodeURIComponent(id ?? '')}`, { query: { date }, schema: dishCardSchema })
      .then((card) => alive && setState({ status: 'ready', card }))
      .catch((error: unknown) => {
        if (!alive) return;
        setState({
          status: 'error',
          notFound: error instanceof ApiError && error.status === 404,
          messageKey: error instanceof ApiError ? error.messageKey : 'core.error.network',
        });
      });
    return () => {
      alive = false;
    };
  }, [id, date]);

  const back = (
    <Link to="/menu" className="ui-button ui-button--secondary">
      {t('catalog.dish.back')}
    </Link>
  );

  if (state.status === 'loading') return <p role="status">{t('core.loading')}</p>;
  if (state.status === 'error') {
    return (
      <>
        <Banner variant="error">
          {state.notFound ? t('catalog.error.dishNotFound') : t(state.messageKey)}
        </Banner>
        {back}
      </>
    );
  }

  const { card } = state;
  const { dish } = card;
  const name = dish.name[lang];
  return (
    <article aria-labelledby="dish-title">
      <p>{back}</p>
      {dish.photoUrl ? (
        <img className="dish__photo dish__photo--large" src={dish.photoUrl} alt={name} />
      ) : null}
      <h1 id="dish-title">{name}</h1>
      {dish.vegetarian ? <p className="dish__tag">{t('catalog.vegetarian')}</p> : null}

      <Card title={t('catalog.dish.composition')} headingLevel={2}>
        <p>{dish.composition[lang]}</p>
        <p>{t('catalog.dish.weight', { value: formatNumber(dish.weightG) })}</p>
        <AllergensLine dish={dish} />
      </Card>

      <Card title={t('catalog.dish.nutrition')} headingLevel={2}>
        <Nutrition dish={dish} />
        {date ? <CookedLine dish={dish} date={date} today={card.today} /> : null}
        <RatingLine rating={dish.rating} />
      </Card>

      <Card title={t('catalog.dish.reviews')} headingLevel={2}>
        {card.reviews.length === 0 ? (
          <p>{t('catalog.dish.reviews.empty')}</p>
        ) : (
          <ul className="dish__reviews">
            {card.reviews.map((review, index) => (
              <li key={`${review.createdAt}-${index}`}>
                <span aria-label={t('catalog.review.stars', { stars: review.stars })}>
                  {'★'.repeat(review.stars)}
                  {'☆'.repeat(5 - review.stars)}
                </span>{' '}
                {reviewTag(review.tag, t) ? <strong>{reviewTag(review.tag, t)} </strong> : null}
                <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {date && dish.onMenu ? (
        <>
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
        </>
      ) : (
        <>
          <p>{t('catalog.dish.notOnMenu')}</p>
          <Button disabled fullWidth>
            {t('catalog.add')}
          </Button>
        </>
      )}

      <p className="menu__tolerance">{card.toleranceNote[lang]}</p>
    </article>
  );
}
