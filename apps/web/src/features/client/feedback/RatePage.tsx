// «Оценить блюда» (R26): выданные заказы, оценка каждого блюда, переход к жалобе «Проблема с боксом».
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { FeedbackOrderDto, RatingDto } from '@sportpit/shared/schemas/feedback';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card } from '../../../ui/index.ts';
import { RequireRole } from '../auth/guards.tsx';
import { fetchFeedbackOrders } from './api.ts';
import { DishRating } from './DishRating.tsx';
import './feedback.css';

type LoadState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; orders: FeedbackOrderDto[] };

function OrderRating({ order, onSaved }: { order: FeedbackOrderDto; onSaved: () => void }) {
  const { t, lang, date } = useI18n();
  return (
    <Card
      className="rate-order"
      title={t('feedback.rate.order', { date: date(order.date) })}
      aria-label={t('feedback.rate.order', { date: date(order.date) })}
    >
      <p className="rate-order__where">
        {t('feedback.rate.where', { gym: order.gymName ?? '', fridge: order.fridgeName ?? '' })}
      </p>
      {order.dishes.map((dish) => (
        <section key={dish.dishId} className="rate-order__dish">
          <h3>{t('feedback.rate.dish.qty', { name: dish.name[lang], count: dish.qty })}</h3>
          <DishRating
            orderId={order.orderId}
            dishId={dish.dishId}
            dishName={dish.name[lang]}
            rating={dish.rating}
            onSaved={(_: RatingDto) => onSaved()}
          />
        </section>
      ))}
      {order.canComplain ? (
        <Link
          className="ui-button ui-button--secondary"
          to={`/support/new?order=${encodeURIComponent(order.orderId)}`}
        >
          {t('feedback.rate.problem')}
        </Link>
      ) : null}
    </Card>
  );
}

function RateContent() {
  const { t } = useI18n();
  const { orderId } = useParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const { items } = await fetchFeedbackOrders();
      setState({ status: 'ready', orders: items });
    } catch {
      setState((prev) => (prev.status === 'ready' ? prev : { status: 'error' }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') return <p role="status">{t('core.loading')}</p>;
  if (state.status === 'error') {
    return (
      <>
        <h1>{t('feedback.rate.title')}</h1>
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={() => void load()}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {t('feedback.rate.loadError')}
        </Banner>
      </>
    );
  }

  const orders = state.orders.filter((o) => o.canRate && (!orderId || o.orderId === orderId));
  return (
    <div className="feedback">
      <h1>{t('feedback.rate.title')}</h1>
      <p>{t('feedback.rate.lead')}</p>
      {orders.length === 0 ? (
        <Card title={t('feedback.rate.empty.title')}>
          <p>{t('feedback.rate.empty.body')}</p>
          <Link className="ui-button ui-button--primary" to="/menu">
            {t('feedback.rate.empty.action')}
          </Link>
        </Card>
      ) : (
        orders.map((order) => (
          <OrderRating key={order.orderId} order={order} onSaved={() => void load()} />
        ))
      )}
    </div>
  );
}

export function RatePage() {
  return (
    <RequireRole roles={['client', 'admin']}>
      <RateContent />
    </RequireRole>
  );
}
