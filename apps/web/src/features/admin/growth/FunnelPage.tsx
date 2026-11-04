// Воронка по источникам (R24, R22.4): события по этапам, доли перехода и уникальные люди за период.
import { useState, type FormEvent } from 'react';
import type { FunnelRow } from '@sportpit/shared/schemas/growth';
import { useI18n, type TFunction } from '../../../app/i18n.tsx';
import { Banner, Button, TextField, useResource } from '../../../ui/index.ts';
import { AdminOnly } from '../gyms/common.tsx';
import '../gyms/admin-forms.css';
import { fetchFunnel } from './api.ts';
import './growth.css';

type Stage = 'landingViews' | 'calcUsed' | 'waitlistJoins' | 'signups' | 'firstPurchases';
const STAGES: readonly Stage[] = [
  'landingViews',
  'calcUsed',
  'waitlistJoins',
  'signups',
  'firstPurchases',
];
const UNIQUE = ['visitors', 'calc', 'waitlist', 'signups', 'purchases'] as const;

/** Доля этапа от предыдущего шага в процентах с одним знаком; предыдущий шаг нулевой — прочерк. */
function conversion(value: number, previous: number): number | null {
  return previous > 0 ? Math.round((value / previous) * 1000) / 10 : null;
}

const sourceName = (t: TFunction, source: FunnelRow['source']) =>
  source === 'total' ? t('growth.funnel.row.total') : t(`growth.source.${source}`);

const isEmpty = (rows: readonly FunnelRow[]) =>
  rows.every(
    (row) =>
      STAGES.every((stage) => row[stage] === 0) && UNIQUE.every((key) => row.unique[key] === 0),
  );

function Funnel() {
  const { t, date } = useI18n();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ from: '', to: '' });
  const resource = useResource(() => fetchFunnel(applied), [applied]);
  const report = resource.data;

  function apply(event: FormEvent) {
    event.preventDefault();
    setApplied({ from, to });
  }

  const percent = (value: number, previous: number): string => {
    const share = conversion(value, previous);
    return share === null
      ? t('growth.funnel.conv.none')
      : t('growth.funnel.conv.value', { percent: String(share).replace('.', ',') });
  };

  return (
    <div className="growth">
      <h2>{t('growth.funnel.title')}</h2>
      <p className="growth__lead">{t('growth.funnel.lead')}</p>

      <form className="growth__period" onSubmit={apply}>
        <TextField
          type="date"
          label={t('growth.funnel.period.from')}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <TextField
          type="date"
          label={t('growth.funnel.period.to')}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Button type="submit">{t('growth.funnel.period.apply')}</Button>
      </form>

      {resource.error ? (
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={resource.reload}>
              {t('growth.funnel.retry')}
            </Button>
          }
        >
          {t('growth.funnel.loadError')}
        </Banner>
      ) : null}
      {resource.loading && !report ? <p role="status">{t('core.loading')}</p> : null}

      {report ? (
        <>
          <p className="growth__lead">
            {t('growth.funnel.period.shown', { from: date(report.from), to: date(report.to) })}
          </p>
          {isEmpty(report.rows) ? (
            <p>{t('growth.funnel.empty')}</p>
          ) : (
            <>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <caption className="growth__caption">{t('growth.funnel.title')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('growth.funnel.col.source')}</th>
                      {STAGES.map((stage) => (
                        <th key={stage} scope="col" className="growth__num">
                          {t(`growth.funnel.col.${stage}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr
                        key={row.source}
                        className={row.source === 'total' ? 'growth__total-row' : undefined}
                      >
                        <th scope="row">{sourceName(t, row.source)}</th>
                        {STAGES.map((stage, index) => (
                          <td key={stage} className="growth__num">
                            {index === 0
                              ? row[stage]
                              : `${row[stage]} (${percent(row[stage], row[STAGES[index - 1]!])})`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="growth__lead">{t('growth.funnel.conv.title')}</p>
              <p className="growth__lead">{t('growth.funnel.note.firstPurchase')}</p>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <caption className="growth__caption">{t('growth.funnel.unique.title')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('growth.funnel.col.source')}</th>
                      {UNIQUE.map((key) => (
                        <th key={key} scope="col" className="growth__num">
                          {t(`growth.funnel.unique.${key}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr
                        key={row.source}
                        className={row.source === 'total' ? 'growth__total-row' : undefined}
                      >
                        <th scope="row">{sourceName(t, row.source)}</th>
                        {UNIQUE.map((key) => (
                          <td key={key} className="growth__num">
                            {row.unique[key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="growth__lead">{t('growth.funnel.unique.note')}</p>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

export function FunnelPage() {
  return (
    <AdminOnly>
      <Funnel />
    </AdminOnly>
  );
}
