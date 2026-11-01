// Отчёты администратора (R37): продажи, выдано и списано, рейтинг блюд, доля зала, клиенты и отток.
// Период, вид отчёта, таблица по 50 строк, график и выгрузка в Excel (CSV).
import { useState, type FormEvent } from 'react';
import { REPORT_KINDS, type ReportKind } from '@sportpit/shared/schemas/reports';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, TextField } from '../../../ui/index.ts';
import { AdminOnly, errorText, useResource } from '../gyms/common.tsx';
import '../gyms/admin-forms.css';
import {
  csvUrl,
  fetchRatings,
  fetchRetention,
  fetchSales,
  fetchShare,
  fetchWaste,
  type ReportParams,
} from './api.ts';
import './reports.css';
import { RatingsView, RetentionView, SalesView, ShareView, WasteView } from './views.tsx';

const LOADERS = {
  sales: fetchSales,
  waste: fetchWaste,
  ratings: fetchRatings,
  share: fetchShare,
  retention: fetchRetention,
} as const;

type Loaded = {
  [K in ReportKind]: Awaited<ReturnType<(typeof LOADERS)[K]>>;
};

/** Один вид отчёта: загрузка, ошибка, период и сам отчёт. */
function ReportBody<K extends ReportKind>({
  kind,
  params,
  onPage,
}: {
  kind: K;
  params: ReportParams;
  onPage: (page: number) => void;
}) {
  const { t, date } = useI18n();
  const resource = useResource(
    () => (LOADERS[kind] as (p: ReportParams) => Promise<Loaded[K]>)(params),
    [kind, params.from, params.to, params.page],
  );
  const report = resource.data as Loaded[ReportKind] | undefined;
  return (
    <section aria-label={t(`reports.tab.${kind}`)} className="reports">
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
      {resource.loading && !report ? <p role="status">{t('core.loading')}</p> : null}
      {report ? (
        <>
          <p className="reports__lead">
            {t('reports.period.shown', {
              from: date(report.range.from),
              to: date(report.range.to),
            })}
          </p>
          {kind === 'sales' ? (
            <SalesView report={report as Loaded['sales']} onPage={onPage} />
          ) : null}
          {kind === 'waste' ? (
            <WasteView report={report as Loaded['waste']} onPage={onPage} />
          ) : null}
          {kind === 'ratings' ? (
            <RatingsView report={report as Loaded['ratings']} onPage={onPage} />
          ) : null}
          {kind === 'share' ? (
            <ShareView report={report as Loaded['share']} onPage={onPage} />
          ) : null}
          {kind === 'retention' ? (
            <RetentionView report={report as Loaded['retention']} onPage={onPage} />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Reports() {
  const { t, lang } = useI18n();
  const [kind, setKind] = useState<ReportKind>('sales');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);

  function apply(event: FormEvent) {
    event.preventDefault();
    setApplied({ from, to });
    setPage(1);
  }

  return (
    <div className="reports">
      <h2>{t('reports.title')}</h2>
      <p className="reports__lead">{t('reports.lead')}</p>

      <form className="reports__period" onSubmit={apply}>
        <TextField
          type="date"
          label={t('reports.period.from')}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <TextField
          type="date"
          label={t('reports.period.to')}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Button type="submit">{t('reports.period.apply')}</Button>
      </form>

      <div className="reports__tabs" role="group" aria-label={t('reports.tabs.label')}>
        {REPORT_KINDS.map((item) => (
          <Button
            key={item}
            variant={item === kind ? 'primary' : 'secondary'}
            aria-pressed={item === kind}
            onClick={() => {
              setKind(item);
              setPage(1);
            }}
          >
            {t(`reports.tab.${item}`)}
          </Button>
        ))}
      </div>

      <div className="reports__actions">
        <a className="reports__download" href={csvUrl(kind, applied, lang)} download>
          {t('reports.download')}
        </a>
      </div>

      <ReportBody key={kind} kind={kind} params={{ ...applied, page }} onPage={setPage} />
    </div>
  );
}

export function ReportsPage() {
  return (
    <AdminOnly>
      <Reports />
    </AdminOnly>
  );
}
