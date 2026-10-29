import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  adminPurchasesResponseSchema,
  refundResponseSchema,
  refundsResponseSchema,
  type AdminPurchaseDto,
  type RefundDto,
} from '@sportpit/shared/schemas/billing';
import { api } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField } from '../../../ui/index.ts';
import { describeError } from '../../client/auth/errors.ts';
import { RequireRole } from '../../client/auth/guards.tsx';
import { fieldMessage } from '../packages/AdminPackagesPage.tsx';

function RefundForm({
  purchase,
  onDone,
}: {
  purchase: AdminPurchaseDto;
  onDone: () => Promise<void>;
}) {
  const { t, money } = useI18n();
  const [credits, setCredits] = useState(String(purchase.unusedCredits));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const count = Number(credits);
  const valid =
    Number.isInteger(count) &&
    count >= 1 &&
    count <= purchase.unusedCredits &&
    reason.trim().length >= 3;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/admin/refunds', {
        body: { purchaseId: purchase.id, credits: count, reason: reason.trim() },
        schema: refundResponseSchema,
      });
      await onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <TextField
        id={`refund-credits-${purchase.id}`}
        label={t('billing.admin.refunds.credits')}
        hint={t('billing.admin.refunds.creditsHint')}
        inputMode="numeric"
        value={credits}
        onChange={(e) => setCredits(e.target.value)}
      />
      <TextField
        id={`refund-reason-${purchase.id}`}
        label={t('billing.admin.refunds.reason')}
        value={reason}
        error={fieldMessage(t, error, 'reason')}
        onChange={(e) => setReason(e.target.value)}
      />
      {valid ? (
        <p>{t('billing.admin.refunds.amount', { price: money(count * purchase.unitPriceBani) })}</p>
      ) : null}
      {error ? <Banner variant="error">{describeError(t, error)}</Banner> : null}
      <Button type="submit" variant="danger" loading={busy} disabled={!valid}>
        {t('billing.admin.refunds.submit')}
      </Button>
    </form>
  );
}

function AdminRefunds() {
  const { t, money } = useI18n();
  const [query, setQuery] = useState('');
  const [purchases, setPurchases] = useState<AdminPurchaseDto[] | null>(null);
  const [refunds, setRefunds] = useState<RefundDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [retryError, setRetryError] = useState<unknown>(null);
  const [refundDone, setRefundDone] = useState(false);

  const load = useCallback(async (search: string) => {
    try {
      const [list, history] = await Promise.all([
        api.get('/admin/purchases', {
          query: { q: search.trim() || undefined },
          schema: adminPurchasesResponseSchema,
        }),
        api.get('/admin/refunds', { schema: refundsResponseSchema }),
      ]);
      setPurchases(list.items.filter((p) => p.status === 'paid'));
      setRefunds(history.items);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  async function retry(id: number) {
    setRetryError(null);
    try {
      await api.post(`/admin/refunds/${id}/retry`, { schema: refundResponseSchema });
    } catch (e) {
      setRetryError(e);
    }
    await load(query);
  }

  return (
    <>
      <h2>{t('billing.admin.refunds.title')}</h2>
      <p>{t('billing.admin.refunds.lead')}</p>
      {failed ? (
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={() => void load(query)}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {t('billing.admin.loadError')}
        </Banner>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load(query);
        }}
      >
        <TextField
          type="search"
          label={t('billing.admin.refunds.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>

      {refundDone ? <Banner variant="success">{t('billing.admin.refunds.done')}</Banner> : null}
      <h3>{t('billing.admin.refunds.purchases')}</h3>
      {purchases === null && !failed ? <p role="status">{t('core.loading')}</p> : null}
      {purchases && purchases.length === 0 ? <p>{t('billing.admin.refunds.none')}</p> : null}
      {purchases?.map((purchase) => (
        <Card key={purchase.id} headingLevel={4}>
          <p>
            {t('billing.admin.refunds.purchase', {
              id: purchase.id,
              phone: purchase.userPhone ?? '',
              count: purchase.boxes,
              price: money(purchase.totalBani),
            })}
          </p>
          <p>{t('billing.admin.refunds.unused', { count: purchase.unusedCredits })}</p>
          <p>{t('billing.admin.refunds.refundable', { price: money(purchase.refundableBani) })}</p>
          {purchase.refundedBani > 0 ? (
            <p>{t('billing.admin.refunds.refunded', { price: money(purchase.refundedBani) })}</p>
          ) : null}
          {purchase.unusedCredits > 0 && purchase.refundableBani > 0 ? (
            openId === purchase.id ? (
              <RefundForm
                purchase={purchase}
                onDone={async () => {
                  setRefundDone(true);
                  setOpenId(null);
                  await load(query);
                }}
              />
            ) : (
              <Button variant="secondary" onClick={() => setOpenId(purchase.id)}>
                {t('billing.admin.refunds.open')}
              </Button>
            )
          ) : null}
        </Card>
      ))}

      <h3>{t('billing.admin.refunds.history')}</h3>
      {retryError ? <Banner variant="error">{describeError(t, retryError)}</Banner> : null}
      {refunds && refunds.length === 0 ? <p>{t('billing.admin.refunds.historyEmpty')}</p> : null}
      {refunds?.map((refund) => (
        <Card key={refund.id} headingLevel={4}>
          <p>
            {t('billing.admin.refunds.row', {
              id: refund.id,
              purchaseId: refund.purchaseId,
              count: refund.credits,
              price: money(refund.amountBani),
            })}
          </p>
          <p>{refund.reason}</p>
          <p>{t(`billing.admin.refunds.status.${refund.status}`)}</p>
          {refund.status === 'pending' ? (
            <Button variant="secondary" onClick={() => void retry(refund.id)}>
              {t('billing.admin.refunds.retry', { id: refund.id })}
            </Button>
          ) : null}
        </Card>
      ))}
    </>
  );
}

export function AdminRefundsPage() {
  return (
    <RequireRole roles={['admin']}>
      <AdminRefunds />
    </RequireRole>
  );
}
