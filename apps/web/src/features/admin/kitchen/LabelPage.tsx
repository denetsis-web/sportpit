// Печать этикеток партии: название на русском и румынском, ккал, БЖУ, состав, аллергены,
// дата и время приготовления, «съесть до», код партии. Размер этикетки — из настроек (labelSize).
// На печать уходят только этикетки: остальное скрыто правилами @media print.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDateTime } from '@sportpit/shared/format';
import { t as translate, type Lang } from '@sportpit/shared/i18n';
import { labelSchema, MAX_LABEL_COPIES, type LabelData } from '@sportpit/shared/schemas/kitchen';
import { api } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, TextField, useResource } from '../../../ui/index.ts';
import { describeError } from '../../client/auth/errors.ts';
import { RequireRole } from '../../client/auth/guards.tsx';
import '../gyms/admin-forms.css';
import './kitchen.css';

const LANGS: readonly Lang[] = ['ru', 'ro'];

/** Одна этикетка: каждая строка на двух языках, потому что клиенты зала читают на любом из них. */
export function LabelSheet({ label }: { label: LabelData }) {
  const { dish } = label;
  const both = (key: string, params?: Record<string, string | number>) =>
    LANGS.map((lang) => translate(lang, `kitchen.${key}`, params)).join(' / ');
  const slash = (key: string) => LANGS.map((lang) => translate(lang, `kitchen.${key}`)).join('/');
  const allergens = dish.allergens.length
    ? dish.allergens
        .map((a) => LANGS.map((lang) => translate(lang, `catalog.allergen.${a}`)).join('/'))
        .join(', ')
    : both('label.allergensNone');
  return (
    <article
      className="label-sheet"
      data-testid="label"
      style={{ width: `${label.size.widthMm}mm`, height: `${label.size.heightMm}mm` }}
    >
      <h3 className="label-sheet__name">{dish.name.ru}</h3>
      <h3 className="label-sheet__name label-sheet__name--ro" lang="ro">
        {dish.name.ro}
      </h3>
      <p>
        <strong>
          {Math.round(dish.calories)} {slash('label.kcal')}
        </strong>
        {' · '}
        {slash('label.protein')} {dish.proteinG} · {slash('label.fat')} {dish.fatG} ·{' '}
        {slash('label.carbs')} {dish.carbsG}
        {dish.fiberG === null ? null : ` · ${slash('label.fiber')} ${dish.fiberG}`} (
        {both('label.perServing', { weight: dish.weightG })})
      </p>
      <p>
        <strong>{both('label.composition')}:</strong> {dish.composition.ru} / {dish.composition.ro}
      </p>
      <p>
        <strong>{both('label.allergens')}:</strong> {allergens}
      </p>
      <p>
        <strong>{both('label.cooked')}:</strong> {formatDateTime(label.cookedAt, 'ru')}
      </p>
      <p>
        <strong>{both('label.eatBy')}:</strong> {formatDateTime(label.eatBy, 'ru')}
      </p>
      <p className="label-sheet__code">
        {both('label.batch')}: <strong>{label.code}</strong>
      </p>
    </article>
  );
}

function Labels({ id }: { id: string }) {
  const { t } = useI18n();
  const { data: label, error } = useResource(
    () => api.get(`/kitchen/batches/${encodeURIComponent(id)}/label`, { schema: labelSchema }),
    [id],
  );
  // пока число копий не введено вручную, показываем то, что назначила кухня
  const [typedCopies, setTypedCopies] = useState<string | null>(null);

  if (error) {
    return (
      <>
        <Banner variant="error">{describeError(t, error)}</Banner>
        <Link className="ui-button ui-button--secondary" to="/admin/kitchen">
          {t('kitchen.label.back')}
        </Link>
      </>
    );
  }
  if (!label) return <p role="status">{t('core.loading')}</p>;

  const copies = typedCopies ?? String(label.copies);
  const count = Math.min(MAX_LABEL_COPIES, Math.max(1, Math.floor(Number(copies)) || 1));
  return (
    <>
      {/* размер страницы печати = размер этикетки: принтер этикеток режет по ней */}
      <style>{`@media print { @page { size: ${label.size.widthMm}mm ${label.size.heightMm}mm; margin: 0; } }`}</style>
      <div className="no-print">
        <h2>{t('kitchen.label.title', { code: label.code })}</h2>
        <p>{t('kitchen.label.size', { width: label.size.widthMm, height: label.size.heightMm })}</p>
        <TextField
          id="label-copies"
          type="number"
          min={1}
          max={MAX_LABEL_COPIES}
          inputMode="numeric"
          label={t('kitchen.label.copies')}
          hint={t('kitchen.label.copies.hint')}
          value={copies}
          onChange={(e) => setTypedCopies(e.target.value)}
        />
        <div className="admin-actions">
          <Button onClick={() => window.print()}>{t('kitchen.label.print')}</Button>
          <Link className="ui-button ui-button--secondary" to="/admin/kitchen">
            {t('kitchen.label.back')}
          </Link>
        </div>
      </div>
      <div className="label-sheets">
        {Array.from({ length: count }, (_, i) => (
          <LabelSheet key={i} label={label} />
        ))}
      </div>
    </>
  );
}

/** Печатная страница этикеток партии: /admin/kitchen/label/:id. */
export function LabelPage() {
  const { id } = useParams();
  return <RequireRole roles={['kitchen', 'admin']}>{id ? <Labels id={id} /> : null}</RequireRole>;
}
