// Страница «События системы» (R57): сбои оплаты и SMS, счётчики за 24 часа, постраничный журнал.
import { REPORT_PAGE_SIZE, type SystemEventsResponse } from '@sportpit/shared/schemas/reports';
import type { AppDeps } from '../../app.ts';
import { fulfillmentFor } from '../fulfillment/index.ts';
import { ALERT_KINDS, ALERT_THRESHOLD } from '../notifications/alerts.ts';

export function systemEvents(
  deps: AppDeps,
  options: { kind?: string | undefined; page?: number | undefined } = {},
): SystemEventsResponse {
  const { db, system } = deps;
  const page = options.page ?? 1;
  const kind = options.kind;
  const total = db.get<{ n: number }>(
    kind === undefined
      ? 'SELECT COUNT(*) AS n FROM system_events'
      : 'SELECT COUNT(*) AS n FROM system_events WHERE kind = ?',
    kind === undefined ? [] : [kind],
  )!.n;
  const items = system.events.list({
    ...(kind === undefined ? {} : { kind }),
    limit: REPORT_PAGE_SIZE,
    offset: (page - 1) * REPORT_PAGE_SIZE,
  });
  return {
    counts24h: system.events.counts24h(),
    alertKinds: [...ALERT_KINDS],
    alertThreshold: ALERT_THRESHOLD,
    missedTemperature: fulfillmentFor(deps).missedTemperature().items.length,
    items: items.map((e) => ({ id: e.id, createdAt: e.createdAt, kind: e.kind, detail: e.detail })),
    page: {
      number: page,
      size: REPORT_PAGE_SIZE,
      total,
      pages: Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE)),
    },
  };
}
