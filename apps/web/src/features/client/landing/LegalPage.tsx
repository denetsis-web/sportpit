// «Политика и согласия» (`/legal`, `/ro/legal`): четыре раздела-заготовки и переключатель выбора по аналитике.
// Юридические тексты пишут владелец и юрист; здесь везде `[ВПИШИ]`.
import { Link } from 'react-router-dom';
import { useI18n } from '../../../app/i18n.tsx';
import { LandingFrame } from './LandingFrame.tsx';
import { setAnalyticsConsent } from './tracker.ts';
import { useAnalyticsConsent } from './useAnalyticsConsent.ts';
import { landingPath } from './useShowLanding.ts';

const SECTIONS = ['terms', 'privacy', 'analytics', 'waitlist'] as const;

function AnalyticsChoice() {
  const { t } = useI18n();
  const consent = useAnalyticsConsent();
  return (
    <div className="lp-choice" role="group" aria-labelledby="lp-choice-title">
      <h3 id="lp-choice-title" className="lp-card-title">
        {t('landing.legal.analytics.choice')}
      </h3>
      <p role="status">
        {t(`landing.legal.analytics.state.${consent === null ? 'unset' : consent}`)}
      </p>
      <div className="lp-choice__actions">
        <button
          type="button"
          className="lp-btn lp-btn--berry"
          aria-pressed={consent === 'yes'}
          onClick={() => setAnalyticsConsent('yes')}
        >
          {t('landing.consent.accept')}
        </button>
        <button
          type="button"
          className="lp-btn lp-btn--ghost"
          aria-pressed={consent === 'no'}
          onClick={() => setAnalyticsConsent('no')}
        >
          {t('landing.consent.necessary')}
        </button>
      </div>
    </div>
  );
}

export default function LegalPage() {
  const { t, lang } = useI18n();
  return (
    <LandingFrame kind="legal">
      <div className="lp-section lp-legal">
        <div className="lp-container">
          <h1 className="lp-headline">{t('landing.legal.title')}</h1>
          <p className="lp-lead">{t('landing.legal.lead')}</p>
          {SECTIONS.map((section) => (
            <section
              key={section}
              className="lp-legal__section"
              aria-labelledby={`lp-legal-${section}`}
            >
              <h2 id={`lp-legal-${section}`} className="lp-card-title">
                {t(`landing.legal.${section}.title`)}
              </h2>
              <p>{t(`landing.legal.${section}.text`)}</p>
              {section === 'analytics' ? <AnalyticsChoice /> : null}
            </section>
          ))}
          <p>
            <Link to={landingPath('home', lang)} className="lp-link">
              {t('landing.legal.back')}
            </Link>
          </p>
        </div>
      </div>
    </LandingFrame>
  );
}
