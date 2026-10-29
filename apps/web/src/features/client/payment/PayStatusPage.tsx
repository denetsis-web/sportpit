import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PurchaseDto } from '@sportpit/shared/schemas/billing';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card } from '../../../ui/index.ts';
import { describeError } from '../auth/errors.ts';
import { RequireRole } from '../auth/guards.tsx';
import { cancelPurchase, fetchPurchase } from '../packages/api.ts';
import { destinationFor } from '../packages/PackagesPage.tsx';
import './payment.css';

/** Как часто спрашиваем статус, пока платёж ждёт ответа банка. */
export const POLL_MS = 2000;

function usePurchase(id: number) {
  const [purchase, setPurchase] = useState<PurchaseDto | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const { purchase: fresh } = await fetchPurchase(id);
        if (!alive) return;
        setPurchase(fresh);
        setFailed(false);
        if (fresh.status === 'pending') timer = setTimeout(() => void tick(), POLL_MS);
      } catch {
        if (!alive) return;
        setFailed(true);
        timer = setTimeout(() => void tick(), POLL_MS * 2);
      }
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [id]);
  return { purchase, failed, setPurchase };
}

function PayStatus() {
  const { t, money, date } = useI18n();
  const params = useParams();
  const id = Number(params.id);
  const { purchase, failed, setPurchase } = usePurchase(id);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCancel() {
    setCancelling(true);
    setError(null);
    try {
      setPurchase((await cancelPurchase(id)).purchase);
    } catch (e) {
      setError(describeError(t, e));
    } finally {
      setCancelling(false);
    }
  }

  if (!purchase) {
    return failed ? (
      <Banner variant="error">{t('billing.pay.loadError')}</Banner>
    ) : (
      <p role="status">{t('core.loading')}</p>
    );
  }

  const summary = t('billing.pay.summary', {
    count: purchase.boxes,
    price: money(purchase.totalBani),
  });
  const next = destinationFor(purchase);

  return (
    <div className="pay">
      <h1>{t('billing.pay.title')}</h1>
      <p>{summary}</p>
      {failed ? <Banner variant="warning">{t('billing.pay.loadError')}</Banner> : null}
      {error ? <Banner variant="error">{error}</Banner> : null}

      <div role="status" aria-live="polite">
        {purchase.status === 'pending' ? (
          <Card title={t('billing.pay.pending.title')}>
            <p>{t('billing.pay.pending.body')}</p>
            <div className="pay__actions">
              {next.internal ? (
                <Link className="ui-button ui-button--primary" to={next.to}>
                  {t('billing.pay.pending.continue')}
                </Link>
              ) : (
                <a className="ui-button ui-button--primary" href={next.to}>
                  {t('billing.pay.pending.continue')}
                </a>
              )}
              <Button variant="secondary" loading={cancelling} onClick={() => void onCancel()}>
                {t('billing.pay.cancel')}
              </Button>
            </div>
          </Card>
        ) : null}

        {purchase.status === 'paid' ? (
          <Card title={t('billing.pay.paid.title')}>
            <p>
              {t('billing.pay.paid.body', {
                count: purchase.boxes + purchase.carriedOver,
                date: purchase.expiresAt ? date(purchase.expiresAt) : '',
              })}
            </p>
            {purchase.carriedOver > 0 ? (
              <p>{t('billing.pay.paid.carried', { count: purchase.carriedOver })}</p>
            ) : null}
            <div className="pay__actions">
              <Link className="ui-button ui-button--primary" to="/menu">
                {t('billing.pay.toMenu')}
              </Link>
              <Link className="ui-button ui-button--secondary" to="/packages">
                {t('billing.pay.toPackages')}
              </Link>
            </div>
          </Card>
        ) : null}

        {purchase.status === 'failed' ? (
          <Card title={t('billing.pay.failed.title')}>
            <p>{t(`billing.pay.failed.${purchase.failureCode ?? 'error'}`)}</p>
            {purchase.failureReason ? (
              <p>{t('billing.pay.failed.reason', { reason: purchase.failureReason })}</p>
            ) : null}
            <div className="pay__actions">
              <Link
                className="ui-button ui-button--primary"
                to={`/packages?package=${purchase.packageId}`}
              >
                {t('billing.pay.retry')}
              </Link>
              <Link className="ui-button ui-button--secondary" to="/packages">
                {t('billing.pay.toPackages')}
              </Link>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export function PayStatusPage() {
  return (
    <RequireRole>
      <PayStatus />
    </RequireRole>
  );
}
