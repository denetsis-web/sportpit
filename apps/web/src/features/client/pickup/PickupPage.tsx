// Получение бокса (R25, R34.3, R45): код заказа крупно и QR, код замка холодильника, кнопка «Забрал».
// Когда кнопка доступна, решает сервер (загружено, день заказа, окно выдачи); страница только показывает.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PickupView } from '@sportpit/shared/schemas/fulfillment';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card } from '../../../ui/index.ts';
import { describeError } from '../auth/errors.ts';
import { RequireRole } from '../auth/guards.tsx';
import { fetchPickupOrders, pickUp } from './api.ts';
import { pickupQrText, useQrImage } from './qr.ts';
import './pickup.css';

/** Как часто страница сама спрашивает сервер: окно выдачи открывается, оператор отмечает загрузку. */
const REFRESH_MS = 30_000;

function PickupCard({
  order,
  busy,
  onPickup,
}: {
  order: PickupView;
  busy: boolean;
  onPickup: (order: PickupView) => void;
}) {
  const { t, lang, date } = useI18n();
  const headingId = `pickup-${order.orderId}`;
  const day = date(order.date);
  const showCode = order.code !== null && order.status !== 'cancelled';
  const pending = order.status === 'confirmed' || order.status === 'loaded';
  const qr = useQrImage(
    showCode && pending ? pickupQrText(order.fridgeId, order.date, order.code!) : null,
  );
  return (
    <article className="ui-card pickup-card" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('fulfillment.pickup.card.title', { date: day })}</h2>
      <p className="pickup-card__status">{t(`fulfillment.pickup.status.${order.status}`)}</p>
      <p>{t('fulfillment.pickup.card.where', { gym: order.gymName, fridge: order.fridgeName })}</p>
      <p>{t('fulfillment.pickup.card.window', { from: order.pickupFrom, to: order.pickupTo })}</p>

      {showCode ? (
        <>
          <p className="pickup-card__label">{t('fulfillment.pickup.card.code')}</p>
          <p className="pickup-card__code" data-testid="pickup-code">
            {order.code}
          </p>
          {qr ? (
            <img
              className="pickup-card__qr"
              src={qr}
              alt={t('fulfillment.pickup.card.qr', { code: order.code! })}
            />
          ) : null}
        </>
      ) : null}

      {order.accessCode ? (
        <>
          <p className="pickup-card__label">{t('fulfillment.pickup.card.lock')}</p>
          <p className="pickup-card__lock" data-testid="pickup-lock">
            {order.accessCode}
          </p>
          <p>{t('fulfillment.pickup.card.lockHint')}</p>
        </>
      ) : null}

      <p className="pickup-card__label">{t('fulfillment.pickup.card.items')}</p>
      <ul className="pickup-card__items">
        {order.items.map((item) => (
          <li key={item.dishId}>
            {t('fulfillment.pickup.card.line', { qty: item.qty, name: item.name[lang] })}
          </li>
        ))}
      </ul>

      {order.canPickup ? (
        <Button
          loading={busy}
          fullWidth
          aria-label={t('fulfillment.pickup.buttonLabel', { date: day })}
          onClick={() => onPickup(order)}
        >
          {t('fulfillment.pickup.button')}
        </Button>
      ) : order.blockedReason ? (
        <p data-testid="pickup-blocked">
          {t(`fulfillment.pickup.blocked.${order.blockedReason}`, {
            from: order.pickupFrom,
            to: order.pickupTo,
          })}
        </p>
      ) : null}
    </article>
  );
}

type LoadState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: PickupView[] };

function PickupContent() {
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { items } = await fetchPickupOrders();
      setState({ status: 'ready', items });
    } catch {
      setState((prev) => (prev.status === 'ready' ? prev : { status: 'error' }));
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function onPickup(order: PickupView) {
    if (busyId) return;
    setBusyId(order.orderId);
    setError(null);
    setNotice(null);
    try {
      await pickUp(order.orderId);
      setNotice(t('fulfillment.pickup.done'));
    } catch (e) {
      setError(describeError(t, e));
    } finally {
      setBusyId(null);
      await load();
    }
  }

  if (state.status === 'loading') return <p role="status">{t('core.loading')}</p>;
  return (
    <div className="pickup">
      <h1>{t('fulfillment.pickup.title')}</h1>
      <p>{t('fulfillment.pickup.lead')}</p>
      {state.status === 'error' ? (
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={() => void load()}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {t('fulfillment.pickup.loadError')}
        </Banner>
      ) : null}
      {notice ? <Banner variant="success">{notice}</Banner> : null}
      {error ? <Banner variant="error">{error}</Banner> : null}
      {state.status === 'ready' && state.items.length === 0 ? (
        <Card title={t('fulfillment.pickup.empty')} headingLevel={2}>
          <Link className="ui-button ui-button--secondary" to="/orders">
            {t('fulfillment.pickup.empty.action')}
          </Link>
        </Card>
      ) : null}
      {state.status === 'ready' ? (
        <div className="pickup__list">
          {state.items.map((order) => (
            <PickupCard
              key={order.orderId}
              order={order}
              busy={busyId === order.orderId}
              onPickup={(o) => void onPickup(o)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PickupPage() {
  return (
    <RequireRole roles={['client']}>
      <PickupContent />
    </RequireRole>
  );
}
