// Виды отчётов: у каждого своя таблица, график и итоги. Тексты — из словаря `reports`.
import type { ReactNode } from 'react';
import { formatDecimal } from '@sportpit/shared/format';
import type { Lang } from '@sportpit/shared/i18n';
import type {
  PageInfo,
  RatingsReport,
  RetentionReport,
  SalesReport,
  ShareReport,
  WasteReport,
} from '@sportpit/shared/schemas/reports';
import { useI18n, type TFunction } from '../../../app/i18n.tsx';
import { Button } from '../../../ui/index.ts';
import { BarList, ColumnChart } from './charts.tsx';

/** Процент с запятой и знаком; нет данных — подпись из словаря. */
export function percentText(value: number | null, t: TFunction): string {
  return value === null ? t('reports.waste.percent.none') : `${formatDecimal(value)} %`;
}

const numberText = (value: number): string => formatDecimal(value);

export function Pager({ page, onPage }: { page: PageInfo; onPage: (next: number) => void }) {
  const { t } = useI18n();
  if (page.pages <= 1) return null;
  return (
    <nav className="reports__pager" aria-label={t('reports.page.label')}>
      <Button
        variant="secondary"
        disabled={page.number <= 1}
        onClick={() => onPage(page.number - 1)}
      >
        {t('reports.page.prev')}
      </Button>
      <span role="status">{t('reports.page.of', { page: page.number, pages: page.pages })}</span>
      <Button
        variant="secondary"
        disabled={page.number >= page.pages}
        onClick={() => onPage(page.number + 1)}
      >
        {t('reports.page.next')}
      </Button>
    </nav>
  );
}

function Table({
  caption,
  head,
  children,
}: {
  caption: string;
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <caption className="reports__lead">{caption}</caption>
        <thead>
          <tr>
            {head.map((name, index) => (
              <th key={name} scope="col" className={index === 0 ? undefined : 'reports__num'}>
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const Num = ({ children }: { children: ReactNode }) => <td className="reports__num">{children}</td>;

const dishName = (name: { ru: string; ro: string } | null, lang: Lang, fallback: string) =>
  name ? name[lang] : fallback;

// ---- продажи ----

export function SalesView({
  report,
  onPage,
}: {
  report: SalesReport;
  onPage: (n: number) => void;
}) {
  const { t, money, date } = useI18n();
  return (
    <>
      <p className="reports__lead">{t('reports.sales.lead')}</p>
      <p className="reports__totals">
        {t('reports.sales.totals', {
          boxes: report.totals.boxes,
          orders: report.totals.orders,
          revenue: money(report.totals.revenueBani),
        })}
      </p>
      <ColumnChart
        label={t('reports.sales.chart')}
        points={report.daily.map((d) => ({
          key: d.date,
          values: [d.revenueBani],
          title: `${date(d.date)}: ${money(d.revenueBani)}`,
        }))}
      />
      {report.rows.length === 0 ? (
        <p>{t('reports.empty')}</p>
      ) : (
        <Table
          caption={t('reports.sales.chart')}
          head={[
            t('reports.sales.col.gym'),
            t('reports.sales.col.package'),
            t('reports.sales.col.boxes'),
            t('reports.sales.col.revenue'),
          ]}
        >
          {report.rows.map((row) => (
            <tr key={`${row.gymId}|${row.packageBoxes ?? ''}`}>
              <td>{row.gymName}</td>
              <Num>
                {row.packageBoxes === null
                  ? t('reports.sales.noPackage')
                  : t('reports.sales.package', { count: row.packageBoxes })}
              </Num>
              <Num>{row.boxes}</Num>
              <Num>{money(row.revenueBani)}</Num>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={report.page} onPage={onPage} />
      <h3>{t('reports.sales.purchases.title')}</h3>
      {report.purchases.length === 0 ? (
        <p>{t('reports.sales.purchases.empty')}</p>
      ) : (
        <ul className="reports__list">
          {report.purchases.map((p) => (
            <li key={p.packageBoxes}>
              {t('reports.sales.purchases.row', {
                boxes: p.packageBoxes,
                count: p.count,
                total: money(p.totalBani),
              })}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---- выдано и списано ----

export function WasteView({
  report,
  onPage,
}: {
  report: WasteReport;
  onPage: (n: number) => void;
}) {
  const { t, lang, date } = useI18n();
  const { totals } = report;
  return (
    <>
      <p className="reports__lead">{t('reports.waste.lead')}</p>
      <p className="reports__totals">
        {t('reports.waste.totals', {
          cooked: totals.cooked,
          delivered: totals.delivered,
          writtenOff: totals.writtenOff,
          percent: percentText(totals.wastePercent, t),
        })}
      </p>
      <ColumnChart
        label={t('reports.waste.chart')}
        legend={[t('reports.waste.legend.delivered'), t('reports.waste.legend.writtenOff')]}
        points={report.daily.map((d) => ({
          key: d.date,
          values: [d.delivered, d.writtenOff],
          title: `${date(d.date)}: ${d.delivered} / ${d.writtenOff}`,
        }))}
      />
      {report.rows.length === 0 ? (
        <p>{t('reports.empty')}</p>
      ) : (
        <Table
          caption={t('reports.waste.chart')}
          head={[
            t('reports.waste.col.dish'),
            t('reports.waste.col.cooked'),
            t('reports.waste.col.delivered'),
            t('reports.waste.col.writtenOff'),
            t('reports.waste.col.percent'),
          ]}
        >
          {report.rows.map((row) => (
            <tr key={row.dishId ?? 'none'}>
              <td>{dishName(row.name, lang, t('reports.waste.noDish'))}</td>
              <Num>{row.cooked}</Num>
              <Num>{row.delivered}</Num>
              <Num>{row.writtenOff}</Num>
              <Num>{percentText(row.wastePercent, t)}</Num>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={report.page} onPage={onPage} />
      <h3>{t('reports.waste.byFridge.title')}</h3>
      <ul className="reports__list">
        {report.byFridge.map((f) => (
          <li key={f.fridgeId ?? 'reserve'}>
            {f.fridgeId === null
              ? t('reports.waste.byFridge.reserve', { cooked: f.cooked })
              : t('reports.waste.byFridge.row', {
                  gym: f.gymName ?? '',
                  fridge: f.fridgeName ?? f.fridgeId,
                  cooked: f.cooked,
                  delivered: f.delivered,
                  writtenOff: f.writtenOff,
                  percent: percentText(f.wastePercent, t),
                })}
          </li>
        ))}
      </ul>
      <h3>{t('reports.waste.byReason.title')}</h3>
      <ul className="reports__list">
        {report.byReason.map((r) => (
          <li key={r.reason}>
            {t('reports.waste.byReason.row', {
              reason: t(`fulfillment.reason.${r.reason}`),
              qty: r.qty,
            })}
          </li>
        ))}
      </ul>
    </>
  );
}

// ---- рейтинг блюд ----

export function RatingsView({
  report,
  onPage,
}: {
  report: RatingsReport;
  onPage: (n: number) => void;
}) {
  const { t, lang } = useI18n();
  return (
    <>
      <p className="reports__lead">{t('reports.ratings.lead')}</p>
      <p className="reports__totals">
        {t('reports.ratings.totals', {
          count: report.totals.ratings,
          avg: report.totals.avg === null ? '—' : numberText(report.totals.avg),
        })}
      </p>
      {report.rows.length === 0 ? (
        <p>{t('reports.empty')}</p>
      ) : (
        <>
          <BarList
            label={t('reports.ratings.chart')}
            scaleMax={5}
            items={report.rows.map((row) => ({
              key: String(row.dishId),
              label: row.name[lang],
              value: row.avg,
              text: numberText(row.avg),
            }))}
          />
          <Table
            caption={t('reports.ratings.chart')}
            head={[
              t('reports.ratings.col.dish'),
              t('reports.ratings.col.count'),
              t('reports.ratings.col.avg'),
              t('reports.ratings.col.allTime'),
            ]}
          >
            {report.rows.map((row) => (
              <tr key={row.dishId}>
                <td>{row.name[lang]}</td>
                <Num>{row.count}</Num>
                <Num>{numberText(row.avg)}</Num>
                <Num>
                  {row.allTimeAvg === null
                    ? '—'
                    : t('reports.ratings.allTime', {
                        avg: numberText(row.allTimeAvg),
                        count: row.allTimeCount,
                      })}
                </Num>
              </tr>
            ))}
          </Table>
        </>
      )}
      <Pager page={report.page} onPage={onPage} />
    </>
  );
}

// ---- доля зала ----

export function ShareView({
  report,
  onPage,
}: {
  report: ShareReport;
  onPage: (n: number) => void;
}) {
  const { t, money } = useI18n();
  return (
    <>
      <p className="reports__lead">{t('reports.share.lead')}</p>
      <p className="reports__totals">
        {t('reports.share.totals', {
          revenue: money(report.totals.revenueBani),
          share: money(report.totals.shareBani),
        })}
      </p>
      {report.rows.length === 0 ? (
        <p>{t('reports.empty')}</p>
      ) : (
        <>
          <BarList
            label={t('reports.share.chart')}
            items={report.rows.map((row) => ({
              key: row.gymId,
              label: row.gymName,
              value: row.shareBani,
              text: money(row.shareBani),
            }))}
          />
          <Table
            caption={t('reports.share.chart')}
            head={[
              t('reports.share.col.gym'),
              t('reports.share.col.percent'),
              t('reports.share.col.boxes'),
              t('reports.share.col.revenue'),
              t('reports.share.col.share'),
              t('reports.share.col.formula'),
            ]}
          >
            {report.rows.map((row) => (
              <tr key={row.gymId}>
                <td>{row.gymName}</td>
                <Num>{percentText(row.sharePercent, t)}</Num>
                <Num>{row.boxes}</Num>
                <Num>{money(row.revenueBani)}</Num>
                <Num>{money(row.shareBani)}</Num>
                <Num>
                  {t('reports.share.formula', {
                    percent: numberText(row.sharePercent),
                    revenue: money(row.revenueBani),
                    share: money(row.shareBani),
                  })}
                </Num>
              </tr>
            ))}
          </Table>
        </>
      )}
      <Pager page={report.page} onPage={onPage} />
    </>
  );
}

// ---- активные клиенты и отток ----

export function RetentionView({
  report,
  onPage,
}: {
  report: RetentionReport;
  onPage: (n: number) => void;
}) {
  const { t, date } = useI18n();
  const { totals } = report;
  const cards: Array<[string, string]> = [
    [t('reports.retention.card.active'), String(totals.active)],
    [t('reports.retention.card.previousActive'), String(totals.previousActive)],
    [t('reports.retention.card.retained'), String(totals.retained)],
    [t('reports.retention.card.fresh'), String(totals.fresh)],
    [t('reports.retention.card.churned'), String(totals.churned)],
    [t('reports.retention.card.churnPercent'), percentText(totals.churnPercent, t)],
  ];
  return (
    <>
      <p className="reports__lead">{t('reports.retention.lead')}</p>
      <p className="reports__lead">
        {t('reports.retention.previous', {
          from: date(report.previous.from),
          to: date(report.previous.to),
        })}
      </p>
      <dl className="reports__cards">
        {cards.map(([name, value]) => (
          <div key={name} className="reports__card">
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <BarList
        label={t('reports.retention.chart')}
        items={[
          {
            key: 'previous',
            label: t('reports.retention.card.previousActive'),
            value: totals.previousActive,
            text: String(totals.previousActive),
          },
          {
            key: 'active',
            label: t('reports.retention.card.active'),
            value: totals.active,
            text: String(totals.active),
          },
          {
            key: 'retained',
            label: t('reports.retention.card.retained'),
            value: totals.retained,
            text: String(totals.retained),
          },
          {
            key: 'churned',
            label: t('reports.retention.card.churned'),
            value: totals.churned,
            text: String(totals.churned),
          },
        ]}
      />
      {report.rows.length === 0 ? (
        <p>{t('reports.empty')}</p>
      ) : (
        <Table
          caption={t('reports.retention.chart')}
          head={[
            t('reports.retention.col.gym'),
            t('reports.retention.col.active'),
            t('reports.retention.col.previous'),
            t('reports.retention.col.churned'),
          ]}
        >
          {report.rows.map((row) => (
            <tr key={row.gymId}>
              <td>{row.gymName}</td>
              <Num>{row.active}</Num>
              <Num>{row.previousActive}</Num>
              <Num>{row.churned}</Num>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={report.page} onPage={onPage} />
    </>
  );
}
