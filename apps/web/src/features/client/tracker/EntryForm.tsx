// Форма ручной записи: название, ккал, белки, жиры, углеводы, клетчатка. Отрицательные числа не принимаются.
import { useState, type FormEvent } from 'react';
import {
  MAX_ENTRY_GRAMS,
  MAX_ENTRY_KCAL,
  type EntryInput,
  type TrackerEntryDto,
} from '@sportpit/shared/schemas/tracker';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, TextField } from '../../../ui/index.ts';
import { describeError } from '../auth/errors.ts';
import { createEntry, updateEntry } from './api.ts';

const NUMBER_FIELDS = ['calories', 'proteinG', 'fatG', 'carbsG', 'fiberG'] as const;
type NumberField = (typeof NUMBER_FIELDS)[number];

export interface EntryFormProps {
  date: string;
  /** Правка существующей записи; не задана — новая. */
  entry?: TrackerEntryDto;
  onDone: () => void;
  onCancel: () => void;
}

/** Число из поля: пусто — 0 для необязательных; минус, буквы и выход за предел — `null`. */
function toNumber(text: string, max: number, requiredField: boolean): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return requiredField ? null : 0;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= max ? value : null;
}

export function EntryForm({ date, entry, onDone, onCancel }: EntryFormProps) {
  const { t } = useI18n();
  const [name, setName] = useState(entry?.name ?? '');
  const [values, setValues] = useState<Record<NumberField, string>>({
    calories: entry ? String(entry.calories) : '',
    proteinG: entry ? String(entry.proteinG) : '',
    fatG: entry ? String(entry.fatG) : '',
    carbsG: entry ? String(entry.carbsG) : '',
    fiberG: entry ? String(entry.fiberG) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    if (name.trim() === '') next.name = t('tracker.entry.invalidName');
    const parsed: Partial<Record<NumberField, number>> = {};
    for (const field of NUMBER_FIELDS) {
      const max = field === 'calories' ? MAX_ENTRY_KCAL : MAX_ENTRY_GRAMS;
      const value = toNumber(values[field], max, field === 'calories');
      if (value === null) next[field] = t('tracker.entry.invalidNumber');
      else parsed[field] = value;
    }
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length > 0) return;

    const input = { date, name: name.trim(), ...parsed } as EntryInput;
    setBusy(true);
    try {
      if (entry) await updateEntry(entry.id, input);
      else await createEntry(input);
      onDone();
    } catch (e) {
      setFailure(describeError(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="entry-form" onSubmit={(event) => void submit(event)} noValidate>
      <h3>{entry ? t('tracker.entry.formTitleEdit') : t('tracker.entry.formTitleAdd')}</h3>
      <TextField
        label={t('tracker.entry.name')}
        value={name}
        maxLength={100}
        error={errors.name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="entry-form__grid">
        {NUMBER_FIELDS.map((field) => (
          <TextField
            key={field}
            label={t(`tracker.entry.${field}`)}
            inputMode="decimal"
            value={values[field]}
            error={errors[field]}
            onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
          />
        ))}
      </div>
      {failure ? <Banner variant="error">{failure}</Banner> : null}
      <div className="entry-form__actions">
        <Button type="submit" loading={busy}>
          {t('tracker.entry.save')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('tracker.entry.cancel')}
        </Button>
      </div>
    </form>
  );
}
