// Страница «События системы» (R57): счётчики сбоев за 24 часа, журнал по 50 строк, ссылка на пропуски температуры.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { hasKey } from '@sportpit/shared/i18n';
import type { SystemEventDto } from '@sportpit/shared/schemas/reports';
import { useI18n, type TFunction } from '../../../app/i18n.tsx';
import { Banner, Button } from '../../../ui/index.ts';
import { AdminOnly, errorText, SelectField, useResource } from '../gyms/common.tsx';
import '../gyms/admin-forms.css';
import { fetchSystemEvents } from '../reports/api.ts';
import '../reports/reports.css';
import { Pager } from '../reports/views.tsx';

/** Подпись вида события: из словаря, а неизвестный вид показывается как есть. */
function kindLabel(kind: string, t: TFunction): string {
  const key = `reports.events.kind.${kind}`;
  return hasKey(key) ? t(key) : kind;
}

/** Короткое описание события: главное из подробностей, без секретов (сервер их уже скрыл). */
function describe(detail: SystemEventDto['detail']): string {
  return Object.entries(detail)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`,
    )
    .join(', ')
    .slice(0, 300);
}

function Events() {
  const { t, dateTime } = useI18n();
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const resource = useResource(() => fetchSystemEvents(kind || null, page), [kind, page]);
  const data = resource.data;

  const counts = data ? Object.entries(data.counts24h) : [];
  const kinds = data
    ? [...new Set([...data.alertKinds, ...Object.keys(data.counts24h), ...(kind ? [kind] : [])])]
    : [];

  return (
    <div className="reports">
      <h2>{t('reports.events.title')}</h2>
      <p className="reports__lead">{t('reports.events.lead')}</p>
      {resource.error ? (
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={resource.reload}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {errorText(resource.error, t)}
        </Banner>
      ) : null}
      {resource.loading && !data ? <p role="status">{t('core.loading')}</p> : null}
      {data ? (
        <>
          <section aria-label={t('reports.events.counts.title')}>
            <h3>{t('reports.events.counts.title')}</h3>
            {counts.length === 0 ? (
              <p>{t('reports.events.counts.none')}</p>
            ) : (
              <ul className="reports__list">
                {counts.map(([name, count]) => (
                  <li key={name}>
                    {t('reports.events.counts.row', { kind: kindLabel(name, t), count })}
                  </li>
                ))}
              </ul>
            )}
            <p className="reports__lead">
              {t('reports.events.alert', { count: data.alertThreshold })}
            </p>
            <p>
              {t('reports.events.missed', { count: data.missedTemperature })}{' '}
              <Link to="/admin/temperature">{t('reports.events.missed.link')}</Link>
            </p>
          </section>

          <SelectField
            label={t('reports.events.filter')}
            value={kind}
            onChange={(value) => {
              setKind(value);
              setPage(1);
            }}
            options={[
              { value: '', label: t('reports.events.filter.all') },
              ...kinds.map((name) => ({ value: name, label: kindLabel(name, t) })),
            ]}
          />

          {data.items.length === 0 ? (
            <p>{t('reports.events.empty')}</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption className="reports__lead">{t('reports.events.title')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('reports.events.col.time')}</th>
                    <th scope="col">{t('reports.events.col.kind')}</th>
                    <th scope="col">{t('reports.events.col.detail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((event) => (
                    <tr key={event.id}>
                      <td>{dateTime(event.createdAt)}</td>
                      <td>{kindLabel(event.kind, t)}</td>
                      <td>{describe(event.detail)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={data.page} onPage={setPage} />
        </>
      ) : null}
    </div>
  );
}

export function SystemEventsPage() {
  return (
    <AdminOnly>
      <Events />
    </AdminOnly>
  );
}
