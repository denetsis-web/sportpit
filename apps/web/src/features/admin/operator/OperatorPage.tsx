// Выдача для оператора (R34, R35, R25.1, R34.1): что положить в холодильник, «загружено», выдача по коду клиента,
// остаток и закрытие дня, температура. Сервер проверяет права, сроки и коды; страница только показывает.
import { useState, type FormEvent } from 'react';
import { WRITE_OFF_REASONS, type WriteOffReason } from '@sportpit/shared/types';
import {
  isOutOfRange,
  TEMPERATURE_SLOTS,
  type DayOverview,
  type TemperatureSlot,
} from '@sportpit/shared/schemas/fulfillment';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField, useResource } from '../../../ui/index.ts';
import { RequireRole } from '../../client/auth/guards.tsx';
import { errorText, SelectField } from '../gyms/common.tsx';
import '../gyms/admin-forms.css';
import {
  closeDay,
  fetchDay,
  fetchFridges,
  logTemperature,
  markLoaded,
  pickupByCode,
} from './api.ts';
import './operator.css';

interface SectionProps {
  day: DayOverview;
  onChanged: () => void;
}

// ---- что положить и «загружено» ----

function LoadSection({ day, onChanged }: SectionProps) {
  const { t, lang, time } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState(false);
  const canMark = day.cutoffPassed && day.blockedDishes.length === 0 && !day.closure;

  async function mark() {
    setBusy(true);
    setError(null);
    try {
      await markLoaded(day.fridge.id, day.date);
      setNotice(true);
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t('fulfillment.operator.load.title')} headingLevel={3}>
      {day.items.length === 0 ? <p>{t('fulfillment.operator.load.empty')}</p> : null}
      <ul className="operator__list">
        {day.items.map((item) => (
          <li key={item.dishId}>
            <strong>
              {t('fulfillment.operator.load.line', { qty: item.qty, name: item.name[lang] })}
            </strong>
            {' · '}
            {item.batch
              ? t('fulfillment.operator.load.batch', {
                  code: item.batch.code,
                  status: t(
                    item.cooked
                      ? 'fulfillment.operator.load.cooked'
                      : 'fulfillment.operator.load.notCooked',
                  ),
                })
              : t('fulfillment.operator.load.noBatch')}
          </li>
        ))}
      </ul>
      <p>
        {t('fulfillment.operator.load.totals', {
          boxes: day.totals.boxes,
          waiting: day.totals.waiting,
          pickedUp: day.totals.pickedUp,
          writtenOff: day.totals.writtenOff,
        })}
      </p>
      {error ? <Banner variant="error">{errorText(error, t)}</Banner> : null}
      {notice && !error ? (
        <Banner variant="success">{t('fulfillment.operator.load.success')}</Banner>
      ) : null}
      {day.loaded && day.loadedAt ? (
        <Banner variant="success">
          {t('fulfillment.operator.load.done', { time: time(day.loadedAt) })}
        </Banner>
      ) : day.closure ? null : (
        <>
          {!day.cutoffPassed ? (
            <Banner variant="info">{t('fulfillment.operator.load.cutoffOpen')}</Banner>
          ) : null}
          {day.blockedDishes.length > 0 ? (
            <Banner variant="warning">
              {t('fulfillment.operator.load.blocked', { dishes: day.blockedDishes.join(', ') })}
            </Banner>
          ) : null}
          <Button loading={busy} disabled={!canMark} onClick={() => void mark()}>
            {t('fulfillment.operator.load.button')}
          </Button>
        </>
      )}
    </Card>
  );
}

// ---- выдача по коду ----

function PickupSection({ day, onChanged }: SectionProps) {
  const { t, lang } = useI18n();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{
    boxes: number;
    again: boolean;
    items: string;
  } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await pickupByCode(day.fridge.id, day.date, code.trim());
      setResult({
        boxes: res.boxes,
        again: res.alreadyPickedUp,
        items: res.items.map((i) => `${i.qty} × ${i.name[lang]}`).join(', '),
      });
      setCode('');
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t('fulfillment.operator.pickup.title')} headingLevel={3}>
      <form className="operator-form" onSubmit={(e) => void submit(e)} noValidate>
        <TextField
          label={t('fulfillment.operator.pickup.code')}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        <Button type="submit" loading={busy} disabled={code.length !== 4}>
          {t('fulfillment.operator.pickup.submit')}
        </Button>
      </form>
      {error ? <Banner variant="error">{errorText(error, t)}</Banner> : null}
      {result ? (
        <Banner variant={result.again ? 'info' : 'success'}>
          {result.again
            ? t('fulfillment.operator.pickup.again')
            : t('fulfillment.operator.pickup.ok', { boxes: result.boxes })}{' '}
          {t('fulfillment.operator.pickup.items', { items: result.items })}
        </Banner>
      ) : null}
    </Card>
  );
}

function OrdersSection({ day }: { day: DayOverview }) {
  const { t, lang } = useI18n();
  if (day.orders.length === 0) return null;
  return (
    <Card title={t('fulfillment.operator.orders.title')} headingLevel={3}>
      <ul className="operator__list">
        {day.orders.map((order) => (
          <li key={order.id}>
            {t('fulfillment.operator.orders.row', {
              boxes: order.boxes,
              items: order.items.map((i) => `${i.qty} × ${i.name[lang]}`).join(', '),
            })}
            {' — '}
            {t(`fulfillment.pickup.status.${order.status}`)}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---- остаток и закрытие дня ----

function CloseSection({ day, onChanged }: SectionProps) {
  const { t, lang, time } = useI18n();
  const [remaining, setRemaining] = useState('');
  const [reason, setReason] = useState<WriteOffReason>('not_picked_up');
  const [dishId, setDishId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (day.closure) {
    const c = day.closure;
    return (
      <Card title={t('fulfillment.operator.close.title')} headingLevel={3}>
        <Banner variant="success">
          {c.source === 'system'
            ? t('fulfillment.operator.close.system', { time: time(c.closedAt) })
            : t('fulfillment.operator.close.byOperator', {
                time: time(c.closedAt),
                remaining: c.remaining ?? 0,
              })}{' '}
          {t('fulfillment.operator.close.done', {
            orders: c.writtenOffOrders,
            extra: c.writtenOffExtra,
          })}
        </Banner>
      </Card>
    );
  }

  const expected = day.orders.filter((o) => o.status === 'loaded').reduce((n, o) => n + o.boxes, 0);
  const typed = remaining === '' ? null : Number(remaining);
  const surplus = typed !== null && Number.isInteger(typed) ? Math.max(0, typed - expected) : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (typed === null || !Number.isInteger(typed) || typed < 0) return;
    setBusy(true);
    setError(null);
    try {
      await closeDay(day.fridge.id, {
        date: day.date,
        remaining: typed,
        reason,
        ...(surplus > 0 && dishId
          ? { extras: [{ dishId: Number(dishId), qty: surplus, reason }] }
          : {}),
      });
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t('fulfillment.operator.close.title')} headingLevel={3}>
      <p>{t('fulfillment.operator.close.lead')}</p>
      <form className="operator-form" onSubmit={(e) => void submit(e)} noValidate>
        <TextField
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          label={t('fulfillment.operator.close.remaining')}
          value={remaining}
          onChange={(e) => setRemaining(e.target.value)}
        />
        <SelectField
          label={t('fulfillment.operator.close.reason')}
          value={reason}
          onChange={(v) => setReason(v as WriteOffReason)}
          options={WRITE_OFF_REASONS.map((r) => ({
            value: r,
            label: t(`fulfillment.reason.${r}`),
          }))}
        />
        {surplus > 0 ? (
          <SelectField
            label={t('fulfillment.operator.close.dish')}
            value={dishId}
            onChange={setDishId}
            options={[
              { value: '', label: t('fulfillment.operator.close.dish.unknown') },
              ...day.items.map((i) => ({ value: String(i.dishId), label: i.name[lang] })),
            ]}
          />
        ) : null}
        <Button type="submit" variant="danger" loading={busy} disabled={typed === null}>
          {t('fulfillment.operator.close.submit')}
        </Button>
      </form>
      {error ? <Banner variant="error">{errorText(error, t)}</Banner> : null}
    </Card>
  );
}

// ---- температура ----

function TemperatureSection({ day, onChanged }: SectionProps) {
  const { t } = useI18n();
  const [slot, setSlot] = useState<TemperatureSlot>('morning');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<{ out: boolean } | null>(null);
  const celsius = value.trim() === '' ? null : Number(value.replace(',', '.'));
  const valid = celsius !== null && Number.isFinite(celsius);
  // ввод и список относятся к сегодняшнему дню: замер всегда пишется на сегодня
  const isToday = day.date === day.today;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const { entry } = await logTemperature(day.fridge.id, { slot, celsius });
      setSaved({ out: entry.outOfRange });
      setValue('');
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t('fulfillment.operator.temp.title')} headingLevel={3}>
      <p>{t('fulfillment.operator.temp.lead')}</p>
      <ul className="operator-temp__list">
        {TEMPERATURE_SLOTS.map((s) => {
          const entry = day.temperature[s];
          const out = entry ? isOutOfRange(entry.celsius) : false;
          return (
            <li key={s} className={out ? 'operator-temp--out' : undefined}>
              {entry
                ? t('fulfillment.operator.temp.row', {
                    slot: t(`fulfillment.slot.${s}`),
                    value: entry.celsius,
                  })
                : `${t(`fulfillment.slot.${s}`)}: ${t('fulfillment.operator.temp.none')}`}
              {out ? ` — ${t('fulfillment.operator.temp.out')}` : ''}
            </li>
          );
        })}
      </ul>
      {isToday ? (
        <form className="operator-form" onSubmit={(e) => void submit(e)} noValidate>
          <SelectField
            label={t('fulfillment.operator.temp.slot')}
            value={slot}
            onChange={(v) => setSlot(v as TemperatureSlot)}
            options={TEMPERATURE_SLOTS.map((s) => ({
              value: s,
              label: t(`fulfillment.slot.${s}`),
            }))}
          />
          <TextField
            type="number"
            step={0.1}
            inputMode="decimal"
            label={t('fulfillment.operator.temp.value')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" loading={busy} disabled={!valid}>
            {t('fulfillment.operator.temp.save')}
          </Button>
        </form>
      ) : null}
      {error ? <Banner variant="error">{errorText(error, t)}</Banner> : null}
      {saved ? (
        saved.out ? (
          <Banner variant="warning">{t('fulfillment.operator.temp.warn')}</Banner>
        ) : (
          <Banner variant="success">{t('fulfillment.operator.temp.saved')}</Banner>
        )
      ) : null}
    </Card>
  );
}

// ---- страница ----

function Operator() {
  const { t } = useI18n();
  const fridges = useResource(fetchFridges);
  const [chosen, setChosen] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const items = fridges.data?.items ?? [];
  const fridgeId = chosen ?? items[0]?.id ?? null;
  const day = useResource(
    () => (fridgeId ? fetchDay(fridgeId, date) : Promise.resolve(null)),
    [fridgeId, date],
  );
  const overview = day.data ?? null;

  if (fridges.loading) return <p role="status">{t('core.loading')}</p>;
  if (fridges.error) return <Banner variant="error">{errorText(fridges.error, t)}</Banner>;

  return (
    <div className="operator">
      <h2>{t('fulfillment.operator.title')}</h2>
      <p>{t('fulfillment.operator.lead')}</p>
      {items.length === 0 ? (
        <Banner variant="warning">{t('fulfillment.operator.noFridges')}</Banner>
      ) : (
        <>
          <SelectField
            label={t('fulfillment.operator.fridge.label')}
            value={fridgeId ?? ''}
            onChange={(v) => {
              setChosen(v);
              setDate(null);
            }}
            options={items.map((f) => ({
              value: f.id,
              label: t('fulfillment.operator.fridge.option', { gym: f.gymName, name: f.name }),
            }))}
          />
          <TextField
            type="date"
            label={t('fulfillment.operator.date.label')}
            value={date ?? overview?.date ?? ''}
            onChange={(e) => setDate(e.target.value || null)}
          />
          {day.error ? <Banner variant="error">{errorText(day.error, t)}</Banner> : null}
          {overview ? (
            <>
              <p>
                {t('fulfillment.operator.window', {
                  from: overview.fridge.pickupFrom,
                  to: overview.fridge.pickupTo,
                })}
              </p>
              <LoadSection day={overview} onChanged={day.reload} />
              <PickupSection day={overview} onChanged={day.reload} />
              <OrdersSection day={overview} />
              <CloseSection day={overview} onChanged={day.reload} />
              <TemperatureSection day={overview} onChanged={day.reload} />
            </>
          ) : day.loading ? (
            <p role="status">{t('core.loading')}</p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function OperatorPage() {
  return (
    <RequireRole roles={['operator', 'admin']}>
      <Operator />
    </RequireRole>
  );
}
