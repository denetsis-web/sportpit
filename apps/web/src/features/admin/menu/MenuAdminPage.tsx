import { useEffect, useMemo, useState } from 'react';
import {
  adminDishListSchema,
  adminMenuDaySchema,
  menuDayListSchema,
  type AdminMenuDayDto,
} from '@sportpit/shared/schemas/catalog';
import { addDaysISO, localDateISO } from '@sportpit/shared/time';
import { api } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField, useResource } from '../../../ui/index.ts';
import { AdminOnly, errorText, fieldErrors, SelectField, toNumber } from '../gyms/common.tsx';

interface Row {
  dishId: number;
  limit: string;
  reserved: number;
}

const toRows = (day: AdminMenuDayDto): Row[] =>
  day.items.map((i) => ({ dishId: i.dishId, limit: String(i.portionLimit), reserved: i.reserved }));

/** Редактор меню одного дня: состав, лимиты порций, сохранение, публикация, копирование (ротация). */
function DayEditor({ date, onChanged }: { date: string; onChanged: () => void }) {
  const { t, lang, date: formatDate } = useI18n();
  const dishes = useResource(() => api.get('/admin/dishes', { schema: adminDishListSchema }));
  const day = useResource(
    () => api.get(`/admin/menu/${date}`, { schema: adminMenuDaySchema }),
    [date],
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [add, setAdd] = useState('');
  const [copyFrom, setCopyFrom] = useState(addDaysISO(date, -1));
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (day.data) {
      setRows(toRows(day.data));
      setDirty(false);
    }
  }, [day.data]);
  useEffect(() => {
    setMessage(null);
    setFieldError(undefined);
    setCopyFrom(addDaysISO(date, -1));
  }, [date]);

  const active = useMemo(() => (dishes.data?.items ?? []).filter((d) => d.active), [dishes.data]);
  const nameOf = (id: number) => {
    const dish = dishes.data?.items.find((d) => d.id === id);
    return dish ? dish.name[lang] : `#${id}`;
  };
  const free = active.filter((d) => !rows.some((r) => r.dishId === d.id));
  const published = day.data?.published === true;

  function body() {
    return {
      items: rows.map((r) => ({ dishId: r.dishId, portionLimit: toNumber(r.limit) })),
    };
  }

  async function run(action: () => Promise<AdminMenuDayDto>, success: string) {
    setBusy(true);
    setMessage(null);
    setFieldError(undefined);
    try {
      await action();
      setMessage({ kind: 'success', text: success });
      day.reload();
      onChanged();
    } catch (error) {
      const fields = fieldErrors(error, t);
      setFieldError(fields.items);
      setMessage({ kind: 'error', text: errorText(error, t) });
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(
      () => api.put(`/admin/menu/${date}`, { body: body(), schema: adminMenuDaySchema }),
      t('admin.menu.saved'),
    );

  const publish = () =>
    run(async () => {
      if (dirty || !day.data) {
        await api.put(`/admin/menu/${date}`, { body: body(), schema: adminMenuDaySchema });
      }
      return api.post(`/admin/menu/${date}/publish`, { schema: adminMenuDaySchema });
    }, t('admin.menu.published'));

  const copy = () =>
    run(
      () =>
        api.post(`/admin/menu/${date}/copy`, {
          body: { fromDate: copyFrom },
          schema: adminMenuDaySchema,
        }),
      t('admin.menu.copied'),
    );

  return (
    <Card title={t('admin.menu.day', { date: formatDate(date) })}>
      {day.error ? <Banner variant="error">{errorText(day.error, t)}</Banner> : null}
      <p>
        <span className="admin-badge">
          {published ? t('admin.menu.status.published') : t('admin.menu.status.draft')}
        </span>
      </p>
      {message ? <Banner variant={message.kind}>{message.text}</Banner> : null}
      {rows.length === 0 ? <p>{t('admin.menu.empty')}</p> : null}
      <ul className="admin-list">
        {rows.map((row, index) => (
          <li key={row.dishId} className="admin-list__item">
            <div className="admin-list__main">
              <p className="admin-list__title">{nameOf(row.dishId)}</p>
              <p className="admin-list__meta">
                {t('admin.menu.reserved', { count: row.reserved })}
              </p>
            </div>
            <TextField
              label={t('admin.menu.limit')}
              inputMode="numeric"
              value={row.limit}
              error={index === 0 ? fieldError : undefined}
              onChange={(e) => {
                setRows(
                  rows.map((r) => (r.dishId === row.dishId ? { ...r, limit: e.target.value } : r)),
                );
                setDirty(true);
              }}
            />
            <Button
              variant="secondary"
              aria-label={t('admin.menu.removeDish', { name: nameOf(row.dishId) })}
              onClick={() => {
                setRows(rows.filter((r) => r.dishId !== row.dishId));
                setDirty(true);
              }}
            >
              {t('admin.menu.remove')}
            </Button>
          </li>
        ))}
      </ul>

      {free.length > 0 ? (
        <div className="admin-actions">
          <SelectField
            label={t('admin.menu.addDish')}
            value={add}
            onChange={setAdd}
            options={[
              { value: '', label: t('admin.menu.chooseDish') },
              ...free.map((d) => ({ value: String(d.id), label: d.name[lang] })),
            ]}
          />
          <Button
            variant="secondary"
            disabled={add === ''}
            onClick={() => {
              setRows([...rows, { dishId: Number(add), limit: '10', reserved: 0 }]);
              setAdd('');
              setDirty(true);
            }}
          >
            {t('admin.menu.add')}
          </Button>
        </div>
      ) : null}

      <div className="admin-actions">
        <Button loading={busy} onClick={() => void save()}>
          {t('admin.save')}
        </Button>
        <Button
          variant="secondary"
          loading={busy}
          disabled={rows.length === 0 || (published && !dirty)}
          onClick={() => void publish()}
        >
          {published ? t('admin.menu.publishChanges') : t('admin.menu.publish')}
        </Button>
      </div>

      {!published ? (
        <div className="admin-actions">
          <TextField
            label={t('admin.menu.copyFrom')}
            type="date"
            value={copyFrom}
            onChange={(e) => setCopyFrom(e.target.value)}
          />
          <Button variant="secondary" loading={busy} onClick={() => void copy()}>
            {t('admin.menu.copy')}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export function MenuAdminPage() {
  const { t, date: formatDate } = useI18n();
  const today = localDateISO(new Date());
  const [date, setDate] = useState(addDaysISO(today, 1));
  const days = useResource(
    () =>
      api.get('/admin/menu', {
        query: { from: today, to: addDaysISO(today, 13) },
        schema: menuDayListSchema,
      }),
    [today],
  );
  const known = new Map((days.data?.items ?? []).map((d) => [d.date, d]));

  return (
    <AdminOnly>
      <h2>{t('admin.menu.title')}</h2>
      <nav className="menu-days" aria-label={t('admin.menu.days')}>
        {Array.from({ length: 14 }, (_, i) => addDaysISO(today, i)).map((day) => {
          const info = known.get(day);
          return (
            <button
              key={day}
              type="button"
              className="menu-days__item"
              aria-pressed={day === date}
              onClick={() => setDate(day)}
            >
              {formatDate(day).slice(0, 5)}
              {info ? (info.published ? ' ✓' : ' …') : ''}
            </button>
          );
        })}
      </nav>
      <p className="ui-field__hint">{t('admin.menu.legend')}</p>
      <TextField
        label={t('admin.menu.otherDate')}
        type="date"
        min={today}
        value={date}
        onChange={(e) => e.target.value && setDate(e.target.value)}
      />
      <DayEditor date={date} onChanged={days.reload} />
    </AdminOnly>
  );
}
