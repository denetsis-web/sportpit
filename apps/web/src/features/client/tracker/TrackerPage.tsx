// «Трекер питания» (R04, R28): вкладки «День» и «Неделя», переход по датам.
import { useCallback, useEffect, useState } from 'react';
import type { TrackerDayDto, TrackerWeekDto } from '@sportpit/shared/schemas/tracker';
import { addDaysISO } from '@sportpit/shared/time';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, TextField } from '../../../ui/index.ts';
import { RequireRole } from '../auth/guards.tsx';
import { fetchDay, fetchWeek } from './api.ts';
import { DayView } from './DayView.tsx';
import { WeekView } from './WeekView.tsx';
import './tracker.css';

type View = 'day' | 'week';
type Loaded =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; day: TrackerDayDto }
  | { status: 'ready-week'; week: TrackerWeekDto };

function TrackerContent() {
  const { t } = useI18n();
  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState<string | undefined>(undefined);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [today, setToday] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      if (view === 'day') {
        const day = await fetchDay(date);
        setToday(day.today);
        setLoaded({ status: 'ready', day });
      } else {
        const week = await fetchWeek(date);
        setToday(week.today);
        setLoaded({ status: 'ready-week', week });
      }
    } catch {
      setLoaded((prev) => (prev.status === 'loading' ? { status: 'error' } : prev));
    }
  }, [view, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown =
    loaded.status === 'ready'
      ? loaded.day.date
      : loaded.status === 'ready-week'
        ? loaded.week.from
        : date;
  const step = view === 'day' ? 1 : 7;
  const go = (days: number) => {
    if (shown) setDate(addDaysISO(shown, days));
  };

  return (
    <div className="tracker">
      <h1>{t('tracker.title')}</h1>
      <p>{t('tracker.lead')}</p>

      <div className="tracker__bar">
        <div role="group" aria-label={t('tracker.view.label')} className="tracker__views">
          <Button
            variant={view === 'day' ? 'primary' : 'secondary'}
            aria-pressed={view === 'day'}
            onClick={() => setView('day')}
          >
            {t('tracker.view.day')}
          </Button>
          <Button
            variant={view === 'week' ? 'primary' : 'secondary'}
            aria-pressed={view === 'week'}
            onClick={() => setView('week')}
          >
            {t('tracker.view.week')}
          </Button>
        </div>
        <div className="tracker__dates">
          <Button variant="secondary" onClick={() => go(-step)}>
            {t('tracker.date.prev')}
          </Button>
          <TextField
            type="date"
            label={t('tracker.date.label')}
            value={shown ?? ''}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
          <Button variant="secondary" onClick={() => go(step)}>
            {t('tracker.date.next')}
          </Button>
          <Button variant="ghost" onClick={() => setDate(today)} disabled={!today}>
            {t('tracker.date.today')}
          </Button>
        </div>
      </div>

      {loaded.status === 'loading' ? <p role="status">{t('core.loading')}</p> : null}
      {loaded.status === 'error' ? (
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={() => void load()}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {t('tracker.loadError')}
        </Banner>
      ) : null}
      {loaded.status === 'ready' && view === 'day' ? (
        <DayView day={loaded.day} onChanged={() => void load()} />
      ) : null}
      {loaded.status === 'ready-week' && view === 'week' ? (
        <WeekView
          week={loaded.week}
          onOpenDay={(day) => {
            setDate(day);
            setView('day');
          }}
        />
      ) : null}
    </div>
  );
}

export function TrackerPage() {
  return (
    <RequireRole roles={['client', 'admin']}>
      <TrackerContent />
    </RequireRole>
  );
}
