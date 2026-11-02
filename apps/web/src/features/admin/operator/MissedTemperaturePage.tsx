// Пропущенные замеры температуры (R34.2): слоты, срок которых прошёл, а записи нет. Только администратор.
import { useState } from 'react';
import { TEMPERATURE_DEADLINES } from '@sportpit/shared/schemas/fulfillment';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Card, TextField, useResource } from '../../../ui/index.ts';
import { AdminOnly, errorText } from '../gyms/common.tsx';
import '../gyms/admin-forms.css';
import { fetchMissed } from './api.ts';
import './operator.css';

function Missed() {
  const { t, date: formatDate } = useI18n();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const missed = useResource(() => fetchMissed(from, to), [from, to]);
  const data = missed.data;

  return (
    <div className="operator">
      <h2>{t('fulfillment.missed.title')}</h2>
      <p>
        {t('fulfillment.missed.lead', {
          morning: TEMPERATURE_DEADLINES.morning,
          evening: TEMPERATURE_DEADLINES.evening,
        })}
      </p>
      <TextField
        type="date"
        label={t('fulfillment.missed.from')}
        value={from ?? data?.from ?? ''}
        onChange={(e) => setFrom(e.target.value || null)}
      />
      <TextField
        type="date"
        label={t('fulfillment.missed.to')}
        value={to ?? data?.to ?? ''}
        onChange={(e) => setTo(e.target.value || null)}
      />
      {missed.error ? <Banner variant="error">{errorText(missed.error, t)}</Banner> : null}
      {data && data.items.length === 0 ? (
        <Banner variant="success">{t('fulfillment.missed.empty')}</Banner>
      ) : null}
      {data && data.items.length > 0 ? (
        <Card headingLevel={3}>
          <ul className="operator__list">
            {data.items.map((item) => (
              <li key={`${item.fridgeId}|${item.date}|${item.slot}`}>
                {t('fulfillment.missed.row', {
                  date: formatDate(item.date),
                  slot: t(`fulfillment.slot.${item.slot}`),
                  gym: item.gymName,
                  fridge: item.fridgeName,
                })}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {missed.loading && !data ? <p role="status">{t('core.loading')}</p> : null}
    </div>
  );
}

export function MissedTemperaturePage() {
  return (
    <AdminOnly>
      <Missed />
    </AdminOnly>
  );
}
