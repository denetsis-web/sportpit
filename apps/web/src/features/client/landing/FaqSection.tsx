import { useT } from '../../../app/i18n.tsx';

const QUESTIONS = [1, 2, 3, 4] as const;

/** Вопросы и ответы: раскрываются с клавиатуры (родные `details`/`summary`). Ответы пишет владелец — пока `[ВПИШИ]`. */
export function FaqSection() {
  const t = useT();
  return (
    <section id="faq" className="lp-section" aria-labelledby="lp-faq-title">
      <div className="lp-container lp-faq">
        <p className="lp-label lp-label--muted">{t('landing.faq.label')}</p>
        <h2 id="lp-faq-title" className="lp-headline">
          {t('landing.faq.title')}
        </h2>
        <div>
          {QUESTIONS.map((n) => (
            <details key={n} className="lp-faq__item">
              <summary>
                <span>{t(`landing.faq.q${n}`)}</span>
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  aria-hidden="true"
                  focusable="false"
                  className="lp-faq__arrow"
                >
                  <path
                    d="M6 9l6 6 6-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>
              <p className="lp-faq__answer">{t(`landing.faq.a${n}`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
