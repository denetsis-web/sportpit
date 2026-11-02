// Прогресс дня (R28): калории и БЖУ с клетчаткой против нормы из анкеты, выданные боксы и ручные записи.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDecimal } from '@sportpit/shared/format';
import {
  NUTRITION_KEYS,
  type Nutrition,
  type TrackerDayDto,
  type TrackerEntryDto,
} from '@sportpit/shared/schemas/tracker';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, Dialog } from '../../../ui/index.ts';
import { describeError } from '../auth/errors.ts';
import { removeEntry } from './api.ts';
import { EntryForm } from './EntryForm.tsx';

/** Число для показа: до одного знака, десятичная запятая. */
export const num = (value: number): string => formatDecimal(value, 1);

export function TargetNotice({ target, blocked }: { target: Nutrition | null; blocked: boolean }) {
  const { t } = useI18n();
  if (target) return null;
  return (
    <Banner variant="info">
      {blocked ? (
        t('tracker.blocked')
      ) : (
        <>
          {t('tracker.noTarget')} <Link to="/profile">{t('tracker.fillProfile')}</Link>
        </>
      )}
    </Banner>
  );
}

function Progress({
  field,
  total,
  target,
}: {
  field: keyof Nutrition;
  total: number;
  target: number | null;
}) {
  const { t } = useI18n();
  const unit = field === 'calories' ? t('tracker.unit.kcal') : t('tracker.unit.g');
  const name = t(`tracker.nutrient.${field}`);
  const value = `${num(total)} ${unit}`;
  return (
    <li className="progress-row">
      {target !== null ? (
        <>
          <span className="progress-row__text">
            {t('tracker.progress.label', { name, value, target: `${num(target)} ${unit}` })}
          </span>
          <progress
            className="progress-row__bar"
            max={target}
            value={Math.min(total, target)}
            aria-label={name}
          />
        </>
      ) : (
        <span className="progress-row__text">
          {t('tracker.progress.noTarget', { name, value })}
        </span>
      )}
    </li>
  );
}

export interface DayViewProps {
  day: TrackerDayDto;
  onChanged: () => void;
}

export function DayView({ day, onChanged }: DayViewProps) {
  const { t, lang } = useI18n();
  const [editing, setEditing] = useState<TrackerEntryDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TrackerEntryDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await removeEntry(deleting.id);
      setDeleting(null);
      onChanged();
    } catch (e) {
      setDeleteError(describeError(t, e));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="tracker-day">
      {day.empty && editing === null ? (
        <Card title={t('tracker.empty.title')}>
          <p>{t('tracker.empty.body')}</p>
          <div className="tracker-day__actions">
            <Link className="ui-button ui-button--primary" to="/menu">
              {t('tracker.empty.action')}
            </Link>
            <Button variant="secondary" onClick={() => setEditing('new')}>
              {t('tracker.entry.add')}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card title={t('tracker.progress.title')}>
            <TargetNotice target={day.target} blocked={day.targetBlocked} />
            <ul className="progress-list">
              {NUTRITION_KEYS.map((field) => (
                <Progress
                  key={field}
                  field={field}
                  total={day.total[field]}
                  target={day.target ? day.target[field] : null}
                />
              ))}
            </ul>
          </Card>

          <Card title={t('tracker.boxes.title')}>
            {day.boxes.length === 0 ? (
              <p>{t('tracker.boxes.none')}</p>
            ) : (
              <ul className="tracker-list">
                {day.boxes.map((box) => (
                  <li key={box.orderId}>
                    {box.items
                      .map((i) => t('tracker.boxes.line', { name: i.name[lang], count: i.qty }))
                      .join(', ')}
                    {' · '}
                    {t('tracker.boxes.summary', { calories: num(box.calories) })}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('tracker.entries.title')}>
            {day.entries.length === 0 ? (
              <p>{t('tracker.entries.none')}</p>
            ) : (
              <ul className="tracker-list">
                {day.entries.map((entry) => (
                  <li key={entry.id} className="tracker-list__entry">
                    <span>
                      <strong>{entry.name}</strong>
                      {' · '}
                      {t('tracker.boxes.summary', { calories: num(entry.calories) })}
                    </span>
                    <span className="tracker-list__actions">
                      <Button
                        variant="secondary"
                        aria-label={t('tracker.entry.editLabel', { name: entry.name })}
                        onClick={() => setEditing(entry)}
                      >
                        {t('tracker.entry.edit')}
                      </Button>
                      <Button
                        variant="danger"
                        aria-label={t('tracker.entry.deleteLabel', { name: entry.name })}
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(entry);
                        }}
                      >
                        {t('tracker.entry.delete')}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {editing === null ? (
              <Button onClick={() => setEditing('new')}>{t('tracker.entry.add')}</Button>
            ) : null}
          </Card>
        </>
      )}

      {editing !== null ? (
        <Card>
          <EntryForm
            key={editing === 'new' ? 'new' : editing.id}
            date={day.date}
            {...(editing === 'new' ? {} : { entry: editing })}
            onCancel={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              onChanged();
            }}
          />
        </Card>
      ) : null}

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('tracker.entry.delete')}
        closeLabel={t('tracker.entry.cancel')}
        actions={
          <Button variant="danger" loading={deleteBusy} onClick={() => void confirmDelete()}>
            {t('tracker.entry.delete')}
          </Button>
        }
      >
        {deleting ? <p>{t('tracker.entry.deleteConfirm', { name: deleting.name })}</p> : null}
        {deleteError ? <Banner variant="error">{deleteError}</Banner> : null}
      </Dialog>
    </div>
  );
}
