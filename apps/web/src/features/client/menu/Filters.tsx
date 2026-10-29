import { GOALS, type Goal, type MenuFilters } from '@sportpit/shared/schemas/catalog';
import { useI18n } from '../../../app/i18n.tsx';
import { Button } from '../../../ui/index.ts';

/** Фильтры меню: цель, белок от X г, без глютена, без лактозы, вегетарианское. Меняются сразу, без кнопки «применить». */
export function Filters({
  value,
  onChange,
  count,
}: {
  value: MenuFilters;
  onChange: (next: MenuFilters) => void;
  count: number;
}) {
  const { t } = useI18n();
  const set = (patch: Partial<MenuFilters>) => {
    const next: MenuFilters = { ...value, ...patch };
    // пустое значение убираем совсем, чтобы фильтр не сидел в состоянии «выключенным»
    for (const key of Object.keys(next) as Array<keyof MenuFilters>) {
      if (next[key] === undefined || next[key] === false) delete next[key];
    }
    onChange(next);
  };
  const active = Object.keys(value).length > 0;
  return (
    <form
      className="menu-filters"
      aria-label={t('catalog.filter.title')}
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="filter-goal">
          {t('catalog.filter.goal')}
        </label>
        <select
          id="filter-goal"
          className="ui-field__input"
          value={value.goal ?? ''}
          onChange={(e) => {
            const goal = e.target.value as Goal | '';
            set({ goal: goal === '' ? undefined : goal });
          }}
        >
          <option value="">{t('catalog.filter.goal.any')}</option>
          {GOALS.map((goal) => (
            <option key={goal} value={goal}>
              {t(`catalog.filter.goal.${goal}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="filter-protein">
          {t('catalog.filter.protein')}
        </label>
        <input
          id="filter-protein"
          className="ui-field__input"
          type="number"
          inputMode="numeric"
          min={0}
          max={200}
          value={value.proteinMin ?? ''}
          onChange={(e) => {
            const n = e.target.value === '' ? NaN : Number(e.target.value);
            set({ proteinMin: Number.isFinite(n) && n > 0 ? n : undefined });
          }}
        />
      </div>
      <div className="menu-filters__checks">
        {(
          [
            ['glutenFree', 'catalog.filter.glutenFree'],
            ['lactoseFree', 'catalog.filter.lactoseFree'],
            ['vegetarian', 'catalog.filter.vegetarian'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="menu-filters__check">
            <input
              type="checkbox"
              checked={value[key] === true}
              onChange={(e) => set({ [key]: e.target.checked })}
            />
            {t(label)}
          </label>
        ))}
      </div>
      <p role="status" className="menu-filters__count">
        {t('catalog.filter.count', { count })}
      </p>
      {active ? (
        <Button variant="secondary" onClick={() => onChange({})}>
          {t('catalog.filter.reset')}
        </Button>
      ) : null}
    </form>
  );
}
