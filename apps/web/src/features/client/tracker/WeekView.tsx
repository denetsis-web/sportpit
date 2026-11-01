// Недельная картина (R04): калории по дням против цели из анкеты, таблица с цифрами.
import type { TrackerWeekDto } from '@sportpit/shared/schemas/tracker';
import { useI18n } from '../../../app/i18n.tsx';
import { Button, Card } from '../../../ui/index.ts';
import { num, TargetNotice } from './DayView.tsx';

export interface WeekViewProps {
  week: TrackerWeekDto;
  onOpenDay: (date: string) => void;
}

export function WeekView({ week, onOpenDay }: WeekViewProps) {
  const { t, date } = useI18n();
  const target = week.target?.calories ?? null;
  const top = Math.max(target ?? 0, ...week.days.map((d) => d.total.calories), 1);
  const withData = week.days.filter((d) => d.total.calories > 0);
  const average =
    withData.length === 0
      ? 0
      : withData.reduce((sum, d) => sum + d.total.calories, 0) / withData.length;

  return (
    <div className="tracker-week">
      <TargetNotice target={week.target} blocked={week.targetBlocked} />
      <Card title={t('tracker.week.title')}>
        <p>{t('tracker.week.range', { from: date(week.from), to: date(week.to) })}</p>
        {target !== null ? <p>{t('tracker.week.target', { value: num(target) })}</p> : null}
        {withData.length > 0 ? <p>{t('tracker.week.average', { value: num(average) })}</p> : null}

        {/* График: столбцы по дням; точные цифры — в таблице ниже, поэтому сам график скрыт от чтения с экрана */}
        <div className="week-chart" aria-hidden="true">
          {target !== null ? (
            <div className="week-chart__target" style={{ bottom: `${(target / top) * 100}%` }} />
          ) : null}
          {week.days.map((day) => (
            <div key={day.date} className="week-chart__col">
              <div
                className="week-chart__bar"
                data-over={target !== null && day.total.calories > target ? 'true' : 'false'}
                style={{ height: `${(day.total.calories / top) * 100}%` }}
              />
              <span className="week-chart__label">{date(day.date).slice(0, 5)}</span>
            </div>
          ))}
        </div>

        <table className="week-table">
          <caption className="sr-only">{t('tracker.week.chart')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('tracker.week.day')}</th>
              <th scope="col">{t('tracker.nutrient.calories')}</th>
              <th scope="col">{t('tracker.week.boxes')}</th>
              <th scope="col">{t('tracker.week.entries')}</th>
              <th scope="col">
                <span className="sr-only">{t('tracker.week.open', { date: '' })}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {week.days.map((day) => (
              <tr key={day.date} aria-current={day.date === week.today ? 'date' : undefined}>
                <th scope="row">{date(day.date)}</th>
                <td>{t('tracker.value.kcal', { value: num(day.total.calories) })}</td>
                <td>{day.boxes}</td>
                <td>{day.entries}</td>
                <td>
                  <Button
                    variant="ghost"
                    aria-label={t('tracker.week.open', { date: date(day.date) })}
                    onClick={() => onOpenDay(day.date)}
                  >
                    {t('tracker.view.day')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
