import { formatDecimal } from '@sportpit/shared/format';
import { useT } from '../../../app/i18n.tsx';

export interface Macros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Карточка КБЖУ — лицо бренда: калории, белки, углеводы, жиры в одном виде.
 * `column` — вертикальная поверх фото первого экрана, `row` — компактная строка в карточке блюда.
 */
export function MacroCard({ macros, layout }: { macros: Macros; layout: 'column' | 'row' }) {
  const t = useT();
  const unit = t('landing.macro.unit');
  const cells = [
    { key: 'kcal', value: String(Math.round(macros.calories)), caption: t('landing.macro.kcal') },
    {
      key: 'protein',
      value: formatDecimal(macros.proteinG, 1),
      caption: `${t('landing.macro.protein')}, ${unit}`,
    },
    {
      key: 'carbs',
      value: formatDecimal(macros.carbsG, 1),
      caption: `${t('landing.macro.carbs')}, ${unit}`,
    },
    {
      key: 'fat',
      value: formatDecimal(macros.fatG, 1),
      caption: `${t('landing.macro.fat')}, ${unit}`,
    },
  ];
  return (
    <dl className={`lp-macro lp-macro--${layout}`}>
      {cells.map((cell) => (
        <div key={cell.key} className={`lp-macro__cell lp-macro__cell--${cell.key}`}>
          <dd className="lp-macro__value">{cell.value}</dd>
          <dt className="lp-macro__caption">{cell.caption}</dt>
        </div>
      ))}
    </dl>
  );
}
