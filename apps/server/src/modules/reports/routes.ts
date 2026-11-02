// Маршруты reports (под /api/v1), только для администратора:
//   GET /admin/reports/:kind?from&to&page      — отчёт за период, таблица по 50 строк (kind: sales, waste, ratings, share, retention);
//   GET /admin/reports/:kind/csv?from&to       — тот же отчёт целиком файлом для Excel (UTF-8 с BOM, «;»);
//   GET /admin/system/events?kind&page         — события системы: счётчики за 24 часа и журнал.
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  eventsQuerySchema,
  reportKindSchema,
  reportQuerySchema,
  type ReportKind,
} from '@sportpit/shared/schemas/reports';
import type { AppDeps, AppInstance } from '../../app.ts';
import { requireRole } from '../auth/index.ts';
import { errors, pickLang } from '../system/index.ts';
import { noStore, parseWith } from '../system/http.ts';
import { reportsFor } from './index.ts';

const parse = <S extends z.ZodType>(schema: S, body: unknown) => parseWith(schema, body, 'reports');

export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  const reports = reportsFor(deps);
  const adminGuard = { preHandler: requireRole('admin') };

  const kindOf = (req: FastifyRequest): ReportKind => {
    const result = reportKindSchema.safeParse((req.params as { kind: string }).kind);
    if (!result.success) throw errors.notFound('reports.error.kind');
    return result.data;
  };

  app.get('/admin/system/events', adminGuard, async (req, reply) => {
    noStore(reply);
    const query = parse(eventsQuerySchema, req.query);
    return reports.systemEvents({ kind: query.kind, page: query.page });
  });

  app.get('/admin/reports/:kind', adminGuard, async (req, reply) => {
    noStore(reply);
    const kind = kindOf(req);
    const query = parse(reportQuerySchema, req.query);
    const range = reports.range(query.from, query.to);
    switch (kind) {
      case 'sales':
        return reports.salesReport(range, query.page ?? 1);
      case 'waste':
        return reports.wasteReport(range, query.page ?? 1);
      case 'ratings':
        return reports.ratingsReport(range, query.page ?? 1);
      case 'share':
        return reports.shareReport(range, query.page ?? 1);
      case 'retention':
        return reports.retentionReport(range, query.page ?? 1);
    }
  });

  app.get('/admin/reports/:kind/csv', adminGuard, async (req, reply) => {
    noStore(reply);
    const kind = kindOf(req);
    const query = parse(reportQuerySchema, req.query);
    const range = reports.range(query.from, query.to);
    const lang = pickLang(req.headers['accept-language'], (req.query as { lang?: string }).lang);
    const file = reports.csv(kind, range, lang);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${file.filename}"`)
      .send(file.body);
  });
}
