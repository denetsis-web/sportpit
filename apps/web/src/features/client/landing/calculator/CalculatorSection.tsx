// Секция «Калькулятор нормы» (`#calc`): поля как в анкете, расчёт той же `calcTargets`, результат на странице.
// Обёртка `<section id="calc">` с фокусом и фоном — в LandingEntry; здесь содержимое и заголовок с id `lp-calc-title`.
// Ввод считается только в браузере: в сеть, `localStorage` и `sessionStorage` он не попадает (R14).
// Наружу уходит только событие `calc_used` (вид и источник, без введённого).
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { formatDecimal } from '@sportpit/shared/format';
import {
  ACTIVITY_LEVELS,
  GOALS,
  isBlocked,
  SEXES,
  type Goal,
  type TargetsResult,
} from '@sportpit/shared/targets';
import { useT } from '../../../../app/i18n.tsx';
import { scrollToSection } from '../AnchorLink.tsx';
import { prefillGoal } from '../join/prefill.ts';
import { track } from '../tracker.ts';
import {
  computeNorm,
  EMPTY_CALC,
  validateCalc,
  type CalcErrors,
  type CalcField,
  type CalcFieldError,
  type CalcValues,
} from './calc.ts';
import './calculator.css';
import { CheckField, ChoiceField, SelectField, TextField } from './fields.tsx';

interface Outcome {
  targets: TargetsResult;
  goal: Goal;
}

function NormView({ outcome, onJoin }: { outcome: Outcome; onJoin: () => void }) {
  const t = useT();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [outcome]);
  const { targets } = outcome;

  if (isBlocked(targets)) {
    return (
      <section className="lp-norm" aria-labelledby={headingId}>
        <h3 id={headingId} ref={headingRef} tabIndex={-1} className="lp-card-title">
          {t('profile.targets.blocked.title')}
        </h3>
        <p>{t(`profile.targets.blocked.${targets.blocked}`)}</p>
      </section>
    );
  }

  const unit = t('landing.macro.unit');
  const cells = [
    { key: 'kcal', value: String(targets.kcal), caption: t('landing.macro.kcal') },
    {
      key: 'protein',
      value: formatDecimal(targets.proteinG, 1),
      caption: `${t('landing.macro.protein')}, ${unit}`,
    },
    {
      key: 'carbs',
      value: formatDecimal(targets.carbG, 1),
      caption: `${t('landing.macro.carbs')}, ${unit}`,
    },
    {
      key: 'fat',
      value: formatDecimal(targets.fatG, 1),
      caption: `${t('landing.macro.fat')}, ${unit}`,
    },
    {
      key: 'fiber',
      value: formatDecimal(targets.fiberG, 1),
      caption: `${t('landing.calc.fiber')}, ${unit}`,
    },
  ];
  return (
    <section className="lp-norm" aria-labelledby={headingId}>
      <h3 id={headingId} ref={headingRef} tabIndex={-1} className="lp-card-title">
        {t('landing.calc.result.title')}
      </h3>
      <dl className="lp-norm__list">
        {cells.map((cell) => (
          <div key={cell.key} className={`lp-norm__cell lp-norm__cell--${cell.key}`}>
            <dt className="lp-norm__caption">{cell.caption}</dt>
            <dd className="lp-norm__value">{cell.value}</dd>
          </div>
        ))}
      </dl>
      <p className="lp-norm__note">
        {t('landing.calc.proteinRange', {
          min: targets.proteinRangeG.min,
          max: targets.proteinRangeG.max,
        })}
      </p>
      {targets.floorApplied ? (
        <p className="lp-norm__note">{t('landing.calc.floorNote', { kcal: targets.kcal })}</p>
      ) : null}
      <a
        href="#join"
        className="lp-btn lp-btn--lime"
        onClick={(event) => {
          event.preventDefault();
          onJoin();
        }}
      >
        {t('landing.calc.toJoin')}
      </a>
    </section>
  );
}

export default function CalculatorSection() {
  const t = useT();
  const [values, setValues] = useState<CalcValues>(EMPTY_CALC);
  const [errors, setErrors] = useState<CalcErrors>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // событие о расчёте — один раз за открытие страницы, чтобы повторные нажатия не раздували воронку
  const reported = useRef(false);

  function change<K extends keyof CalcValues>(key: K, value: CalcValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
    // старые цифры при правке полей не показываем
    setOutcome(null);
    if (key in errors) setErrors((current) => ({ ...current, [key as CalcField]: undefined }));
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const check = validateCalc(values);
    if (!check.ok) {
      setErrors(check.errors);
      setOutcome(null);
      return;
    }
    setErrors({});
    const targets = computeNorm(check.input);
    setOutcome({ targets, goal: check.input.goal });
    if (!isBlocked(targets) && !reported.current) {
      reported.current = true;
      void track('calc_used');
    }
  }

  const message = (error: CalcFieldError | undefined): string | undefined => {
    if (!error) return undefined;
    if (error.kind === 'range') {
      return t('landing.calc.error.range', { min: error.min, max: error.max });
    }
    return t(`landing.calc.error.${error.kind}`);
  };

  const options = <T extends string>(values: readonly T[], prefix: string) =>
    values.map((value) => ({ value, label: t(`${prefix}.${value}`) }));

  return (
    <>
      <p className="lp-label">{t('landing.calc.label')}</p>
      <h2 id="lp-calc-title" className="lp-headline">
        {t('landing.calc.title')}
      </h2>
      <p className="lp-lead">{t('landing.calc.text')}</p>
      <div className={outcome ? 'lp-calc lp-calc--result' : 'lp-calc'}>
        <form className="lp-formcard" onSubmit={submit} noValidate aria-labelledby="lp-calc-title">
          <ChoiceField
            legend={t('profile.form.sex')}
            name="sex"
            value={values.sex}
            onChange={(value) => change('sex', value)}
            options={options(SEXES, 'profile.form.sex')}
            error={message(errors.sex)}
          />
          <div className="lp-calc__numbers">
            <TextField
              label={t('profile.form.age')}
              inputMode="numeric"
              autoComplete="off"
              value={values.age}
              onChange={(event) => change('age', event.target.value)}
              error={message(errors.age)}
            />
            <TextField
              label={t('profile.form.height')}
              inputMode="numeric"
              autoComplete="off"
              value={values.height}
              onChange={(event) => change('height', event.target.value)}
              error={message(errors.height)}
            />
            <TextField
              label={t('profile.form.weight')}
              inputMode="decimal"
              autoComplete="off"
              value={values.weight}
              onChange={(event) => change('weight', event.target.value)}
              error={message(errors.weight)}
            />
          </div>
          <SelectField
            label={t('profile.form.goal')}
            placeholder={t('profile.form.select')}
            value={values.goal}
            onChange={(value) => change('goal', value)}
            options={options(GOALS, 'profile.form.goal')}
            error={message(errors.goal)}
          />
          <SelectField
            label={t('profile.form.activity')}
            placeholder={t('profile.form.select')}
            value={values.activity}
            onChange={(value) => change('activity', value)}
            options={options(ACTIVITY_LEVELS, 'profile.form.activity')}
            error={message(errors.activity)}
          />
          <CheckField
            label={t('profile.form.condition')}
            checked={values.hasCondition}
            onChange={(checked) => change('hasCondition', checked)}
          />
          <button type="submit" className="lp-btn lp-btn--berry">
            {t('landing.calc.button')}
          </button>
          <p className="lp-field__hint">{t('landing.calc.privacy')}</p>
        </form>
        {outcome ? (
          <NormView
            outcome={outcome}
            onJoin={() => {
              prefillGoal(outcome.goal);
              scrollToSection('join');
            }}
          />
        ) : null}
      </div>
      <p className="lp-muted">{t('landing.calc.disclaimer')}</p>
    </>
  );
}

export { CalculatorSection };
