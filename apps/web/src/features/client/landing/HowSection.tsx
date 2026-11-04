import { useT } from '../../../app/i18n.tsx';

const STEPS = [1, 2, 3, 4] as const;

/** Четыре шага: выбрать, оплатить пакет, забрать, есть. Заказ — на завтра и позже, до вечера накануне. */
export function HowSection() {
  const t = useT();
  return (
    <section id="how" className="lp-section" aria-labelledby="lp-how-title">
      <div className="lp-container">
        <p className="lp-label lp-label--muted">{t('landing.how.label')}</p>
        <h2 id="lp-how-title" className="lp-headline">
          {t('landing.how.title')}
        </h2>
        <ol className="lp-steps">
          {STEPS.map((step) => (
            <li key={step} className="lp-step">
              <span className="lp-step__num" aria-hidden="true">
                {step}
              </span>
              <h3 className="lp-card-title">{t(`landing.how.s${step}.title`)}</h3>
              <p>{t(`landing.how.s${step}.text`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
