// Тестовая страница платёжного шлюза-заглушки. Настоящий шлюз принимает карту на своей странице;
// здесь данных карты нет вообще, только две кнопки результата.
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { PurchaseDto } from '@sportpit/shared/schemas/billing';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card } from '../../../ui/index.ts';
import { describeError } from '../auth/errors.ts';
import { RequireRole } from '../auth/guards.tsx';
import { fetchPurchase, stubPay } from '../packages/api.ts';
import './payment.css';

function StubPay() {
  const { t, money } = useI18n();
  const navigate = useNavigate();
  const id = Number(useParams().id);
  const [purchase, setPurchase] = useState<PurchaseDto | null>(null);
  const [busy, setBusy] = useState<'paid' | 'failed' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPurchase(id).then(
      (res) => {
        if (alive) setPurchase(res.purchase);
      },
      (e: unknown) => {
        if (alive) setError(describeError(t, e));
      },
    );
    return () => {
      alive = false;
    };
  }, [id, t]);

  async function answer(outcome: 'paid' | 'failed') {
    setBusy(outcome);
    setError(null);
    try {
      await stubPay(id, outcome);
      navigate(`/pay/${id}`, { replace: true });
    } catch (e) {
      setError(describeError(t, e));
      setBusy(null);
    }
  }

  if (error && !purchase) return <Banner variant="error">{error}</Banner>;
  if (!purchase) return <p role="status">{t('core.loading')}</p>;
  if (!purchase.stubGateway) return <Banner variant="info">{t('billing.stub.unavailable')}</Banner>;
  if (purchase.status !== 'pending') return <Navigate to={`/pay/${id}`} replace />;

  return (
    <div className="pay">
      <h1>{t('billing.stub.title')}</h1>
      <Card>
        <p>{t('billing.stub.note')}</p>
        <p>{t('billing.stub.amount', { price: money(purchase.totalBani) })}</p>
        {error ? <Banner variant="error">{error}</Banner> : null}
        <div className="pay__actions">
          <Button
            loading={busy === 'paid'}
            disabled={busy !== null}
            onClick={() => void answer('paid')}
          >
            {t('billing.stub.pay')}
          </Button>
          <Button
            variant="secondary"
            loading={busy === 'failed'}
            disabled={busy !== null}
            onClick={() => void answer('failed')}
          >
            {t('billing.stub.decline')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function StubPayPage() {
  return (
    <RequireRole>
      <StubPay />
    </RequireRole>
  );
}
