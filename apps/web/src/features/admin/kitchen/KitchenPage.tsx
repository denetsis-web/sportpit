// Кухня: сводка на день по блюдам и холодильникам, подтверждение производства, «приготовлена», печать этикеток.
// Всё считает и проверяет сервер; страница только показывает и отправляет действия.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  batchResponseSchema,
  productionSummarySchema,
  type BatchDto,
  type ProductionSummary,
} from '@sportpit/shared/schemas/kitchen';
import { api } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField } from '../../../ui/index.ts';
import { describeError } from '../../client/auth/errors.ts';
import { RequireRole } from '../../client/auth/guards.tsx';
import '../gyms/admin-forms.css';
import './kitchen.css';

type Action = 'confirm' | 'cooked';

function BatchBlock({
  batch,
  dishName,
  onAction,
  busy,
}: {
  batch: BatchDto;
  dishName: string;
  onAction: (batch: BatchDto, action: Action) => void;
  busy: boolean;
}) {
  const { t, dateTime } = useI18n();
  return (
    <div className="kitchen-batch">
      <p>
        <strong>{t(`kitchen.batch.status.${batch.status}`)}</strong>
      </p>
      <p>{t('kitchen.batch.code', { code: batch.code })}</p>
      <p>{t('kitchen.batch.qty', { count: batch.totalQty })}</p>
      {batch.cookedAt ? (
        <p>{t('kitchen.batch.cookedAt', { time: dateTime(batch.cookedAt) })}</p>
      ) : null}
      {batch.eatBy ? <p>{t('kitchen.batch.eatBy', { time: dateTime(batch.eatBy) })}</p> : null}
      <div className="admin-actions">
        {batch.status === 'planned' ? (
          <Button
            loading={busy}
            aria-label={t('kitchen.batch.confirmLabel', { name: dishName })}
            onClick={() => onAction(batch, 'confirm')}
          >
            {t('kitchen.batch.confirm')}
          </Button>
        ) : null}
        {batch.status === 'confirmed' ? (
          <Button
            loading={busy}
            aria-label={t('kitchen.batch.cookedLabel', { name: dishName })}
            onClick={() => onAction(batch, 'cooked')}
          >
            {t('kitchen.batch.cooked')}
          </Button>
        ) : null}
        {batch.status === 'cooked' ? (
          <Link
            className="ui-button ui-button--secondary"
            to={`/admin/kitchen/label/${batch.id}`}
            aria-label={t('kitchen.batch.printLabel', { name: dishName })}
          >
            {t('kitchen.batch.print')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Kitchen() {
  const { t, lang, time, date: formatDate } = useI18n();
  const [date, setDate] = useState<string | null>(null);
  const [summary, setSummary] = useState<ProductionSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (day: string | null) => {
    try {
      const data = await api.get('/kitchen/summary', {
        ...(day ? { query: { date: day } } : {}),
        schema: productionSummarySchema,
      });
      setSummary(data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [load, date]);

  async function act(batch: BatchDto, action: Action) {
    setBusyId(batch.id);
    setActionError(null);
    try {
      await api.post(`/kitchen/batches/${batch.id}/${action}`, { schema: batchResponseSchema });
      await load(date);
    } catch (error) {
      setActionError(error);
    } finally {
      setBusyId(null);
    }
  }

  const anyClosed = summary?.fridges.some((f) => f.closed) ?? false;
  const stateKey = summary?.closed ? 'closed' : anyClosed ? 'partial' : 'open';
  const fridgeName = (id: string) => summary?.fridges.find((f) => f.id === id)?.name ?? id;

  return (
    <>
      <h2>{t('kitchen.title')}</h2>
      <p>{t('kitchen.lead')}</p>
      <TextField
        id="kitchen-date"
        type="date"
        label={t('kitchen.date.label')}
        value={date ?? summary?.date ?? ''}
        onChange={(e) => setDate(e.target.value || null)}
      />
      {failed ? (
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={() => void load(date)}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {t('kitchen.loadError')}
        </Banner>
      ) : null}
      {actionError ? <Banner variant="error">{describeError(t, actionError)}</Banner> : null}

      {summary ? (
        <>
          <Banner variant={summary.closed ? 'success' : 'info'}>
            {t(`kitchen.state.${stateKey}`)} ({formatDate(summary.date)})
          </Banner>
          <p>{t('kitchen.buffer.note', { percent: summary.bufferPercent })}</p>

          <h3>{t('kitchen.dishes.title')}</h3>
          {summary.dishes.length === 0 ? <p>{t('kitchen.empty')}</p> : null}
          {summary.dishes.map((dish) => (
            <Card key={dish.dishId} title={dish.name[lang]} headingLevel={4}>
              <p>
                {t('kitchen.dishes.planned')}: {dish.planned} · {t('kitchen.dishes.buffer')}:{' '}
                {dish.buffer} ·{' '}
                <strong>
                  {t('kitchen.dishes.total')}: {dish.total}
                </strong>
              </p>
              <ul className="kitchen-list" aria-label={t('kitchen.dishes.fridges')}>
                {dish.fridges.map((f) => (
                  <li key={f.fridgeId}>
                    {t('kitchen.dishes.fridgeQty', { name: fridgeName(f.fridgeId), count: f.qty })}
                  </li>
                ))}
              </ul>
              {dish.batch ? (
                <BatchBlock
                  batch={dish.batch}
                  dishName={dish.name[lang]}
                  busy={busyId === dish.batch.id}
                  onAction={(batch, action) => void act(batch, action)}
                />
              ) : (
                <p>{t('kitchen.dishes.noBatch')}</p>
              )}
            </Card>
          ))}
          {summary.dishes.length > 0 ? (
            <p>
              <strong>
                {t('kitchen.totals.row', {
                  planned: summary.totals.planned,
                  buffer: summary.totals.buffer,
                  total: summary.totals.total,
                })}
              </strong>
            </p>
          ) : null}

          <h3>{t('kitchen.fridges.title')}</h3>
          <ul className="kitchen-list">
            {summary.fridges.map((fridge) => (
              <li key={fridge.id}>
                <strong>
                  {t('kitchen.fridges.row', { gym: fridge.gymName, name: fridge.name })}
                </strong>
                {' · '}
                {t('kitchen.fridges.boxes', { count: fridge.boxes })}
                {' · '}
                {fridge.closed
                  ? t('kitchen.fridges.closed', { time: time(fridge.cutoffAt) })
                  : t('kitchen.fridges.open', { time: time(fridge.cutoffAt) })}
              </li>
            ))}
          </ul>
        </>
      ) : failed ? null : (
        <p role="status">{t('core.loading')}</p>
      )}
    </>
  );
}

export function KitchenPage() {
  return (
    <RequireRole roles={['kitchen', 'admin']}>
      <Kitchen />
    </RequireRole>
  );
}
