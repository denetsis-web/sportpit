// Отчёт «Рейтинг блюд»: оценки, поставленные за период, и рейтинг блюда за всё время (как в меню).
import type { RatingsReport, ReportRange } from '@sportpit/shared/schemas/reports';
import type { AppDeps } from '../../app.ts';
import { catalogFor } from '../catalog/index.ts';
import { paginate, utcBounds } from './range.ts';

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function ratingsReport(deps: AppDeps, range: ReportRange, page?: number): RatingsReport {
  const catalog = catalogFor(deps);
  const { start, end } = utcBounds(range);
  const found = deps.db.query<{ dish_id: number; n: number; stars: number }>(
    `SELECT dish_id, COUNT(*) AS n, SUM(stars) AS stars FROM dish_ratings
      WHERE created_at >= ? AND created_at < ? GROUP BY dish_id`,
    [start, end],
  );
  const names = new Map(catalog.listDishes().map((d) => [d.id, d.name]));

  let ratings = 0;
  let stars = 0;
  const rows = found
    .map((row) => {
      ratings += row.n;
      stars += row.stars;
      const allTime = catalog.getDishRating(row.dish_id);
      return {
        dishId: row.dish_id,
        name: names.get(row.dish_id) ?? { ru: String(row.dish_id), ro: String(row.dish_id) },
        count: row.n,
        avg: round2(row.stars / row.n),
        allTimeAvg: allTime.avg,
        allTimeCount: allTime.count,
      };
    })
    .sort((a, b) => b.avg - a.avg || b.count - a.count || a.dishId - b.dishId);

  const paged = paginate(rows, page);
  return {
    range,
    totals: { ratings, avg: ratings > 0 ? round2(stars / ratings) : null },
    rows: paged.rows,
    page: paged.page,
  };
}
