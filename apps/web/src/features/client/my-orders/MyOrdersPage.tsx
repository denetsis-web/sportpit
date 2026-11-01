// Экран «Мои заказы» (R24): предстоящие и прошлые заказы, код получения, отмена до срока, пауза пакета.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BalanceResponse } from '@sportpit/shared/schemas/billing';
import type { OrderDto, OrdersList, PauseDto } from '@sportpit/shared/schemas/orders';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, Dialog } from '../../../ui/index.ts';
import { describeError } from '../auth/errors.ts';
import { RequireRole } from '../auth/guards.tsx';
import { cancelOrder, fetchCredits, fetchOrders, fetchPauses } from './api.ts';
import { OrderCard } from './OrderCard.tsx';
import { PauseSection } from './PauseSection.tsx';
import './my-orders.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; orders: OrdersList; credits: BalanceResponse; pauses: PauseDto[] };

function MyOrdersContent() {
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [cancelTarget, setCancelTarget] = useState<OrderDto | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [orders, credits, pauses] = await Promise.all([
        fetchOrders(),
        fetchCredits(),
        fetchPauses(),
      ]);
      setState({ status: 'ready', orders, credits, pauses: pauses.items });
    } catch {
      setState((prev) => (prev.status === 'ready' ? prev : { status: 'error' }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onConfirmCancel() {
    if (!cancelTarget || cancelBusy) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      await cancelOrder(cancelTarget.id);
      setCancelTarget(null);
      setNotice(t('orders.my.cancelled'));
      await load();
    } catch (error) {
      setCancelError(describeError(t, error));
    } finally {
      setCancelBusy(false);
    }
  }

  if (state.status === 'loading') return <p role="status">{t('core.loading')}</p>;
  if (state.status === 'error') {
    return (
      <>
        <h1>{t('orders.my.title')}</h1>
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={() => void load()}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {t('orders.my.loadError')}
        </Banner>
      </>
    );
  }

  const { orders, credits, pauses } = state;
  const empty = orders.upcoming.length === 0 && orders.past.length === 0;

  return (
    <div className="my-orders">
      <h1>{t('orders.my.title')}</h1>
      {notice ? <Banner variant="success">{notice}</Banner> : null}

      {empty ? (
        <Card title={t('orders.my.empty.title')}>
          <p>{t('orders.my.empty.body')}</p>
          <Link className="ui-button ui-button--primary" to="/menu">
            {t('orders.my.empty.action')}
          </Link>
        </Card>
      ) : (
        <>
          <section aria-labelledby="my-orders-upcoming">
            <h2 id="my-orders-upcoming">{t('orders.my.upcoming')}</h2>
            {orders.upcoming.length === 0 ? (
              <p>{t('orders.my.noUpcoming')}</p>
            ) : (
              <div className="my-orders__list">
                {orders.upcoming.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onCancel={(target) => {
                      setCancelError(null);
                      setCancelTarget(target);
                    }}
                  />
                ))}
              </div>
            )}
          </section>
          <section aria-labelledby="my-orders-past">
            <h2 id="my-orders-past">{t('orders.my.past')}</h2>
            {orders.past.length === 0 ? (
              <p>{t('orders.my.noPast')}</p>
            ) : (
              <div className="my-orders__list">
                {orders.past.map((order) => (
                  <OrderCard key={order.id} order={order} onCancel={setCancelTarget} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <PauseSection
        lots={credits.lots}
        pauses={pauses}
        onPaused={() => {
          void load();
        }}
      />

      <Dialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title={t('orders.my.cancel.title')}
        closeLabel={t('orders.my.cancel.keep')}
        actions={
          <Button variant="danger" loading={cancelBusy} onClick={() => void onConfirmCancel()}>
            {t('orders.my.cancel.yes')}
          </Button>
        }
      >
        {cancelTarget ? <p>{t('orders.my.cancel.body', { count: cancelTarget.boxes })}</p> : null}
        {cancelError ? <Banner variant="error">{cancelError}</Banner> : null}
      </Dialog>
    </div>
  );
}

export function MyOrdersPage() {
  return (
    <RequireRole roles={['client', 'admin']}>
      <MyOrdersContent />
    </RequireRole>
  );
}
