// Отчёт «Доля зала» (R37.3): процент зала × выручка выданных боксов за период.
// Выручка бокса — цена кредита лота на момент выдачи; невыданные и списанные боксы в неё не входят.
import type { ReportRange, ShareReport } from '@sportpit/shared/schemas/reports';
import type { AppDeps } from '../../app.ts';
import { adminFor } from '../admin/index.ts';
import { loadDelivered } from './delivered.ts';
import { paginate } from './range.ts';
import { totalsByGym } from './sales.ts';

/**
 * Доля зала в банях: процент × выручка, округление до бани (половина — вверх).
 * Целочисленно через сотые доли процента, чтобы 12,5 % от 129 лей дали ровно 16,13, а не 16,12.
 */
export function shareOf(revenueBani: number, percent: number): number {
  const basisPoints = Math.round(percent * 100);
  return Math.floor((revenueBani * basisPoints + 5000) / 10000);
}

export function shareReport(deps: AppDeps, range: ReportRange, page?: number): ShareReport {
  const gyms = adminFor(deps).listGyms();
  const byGym = totalsByGym(loadDelivered(deps, range.from, range.to));

  const rows = gyms
    .filter((gym) => gym.active || byGym.has(gym.id))
    .map((gym) => {
      const sums = byGym.get(gym.id) ?? { boxes: 0, revenueBani: 0 };
      return {
        gymId: gym.id,
        gymName: gym.name,
        sharePercent: gym.sharePercent,
        boxes: sums.boxes,
        revenueBani: sums.revenueBani,
        shareBani: shareOf(sums.revenueBani, gym.sharePercent),
      };
    })
    .sort((a, b) => a.gymName.localeCompare(b.gymName, 'ru') || a.gymId.localeCompare(b.gymId));

  const totals = rows.reduce(
    (sum, row) => ({
      boxes: sum.boxes + row.boxes,
      revenueBani: sum.revenueBani + row.revenueBani,
      shareBani: sum.shareBani + row.shareBani,
    }),
    { boxes: 0, revenueBani: 0, shareBani: 0 },
  );
  const paged = paginate(rows, page);
  return { range, totals, rows: paged.rows, page: paged.page };
}
