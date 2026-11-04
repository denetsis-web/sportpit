import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '../../../app/i18n.tsx';
import { landingPath } from './useShowLanding.ts';
import { setAnalyticsConsent } from './tracker.ts';
import { useAnalyticsConsent } from './useAnalyticsConsent.ts';

/** Плашка согласия на аналитику: до выбора показана, после выбора пропадает. Меняется выбор на странице «Политика и согласия». */
export function AnalyticsNotice() {
  const { t, lang } = useI18n();
  const consent = useAnalyticsConsent();
  const { pathname } = useLocation();
  if (consent !== null) return null;
  // на самой странице политики ссылка «Подробнее» не нужна
  const onLegal = pathname.endsWith('/legal');
  return (
    <section className="lp-consent" aria-label={t('landing.consent.region')}>
      <h2 className="lp-consent__title">{t('landing.consent.title')}</h2>
      <p className="lp-consent__text">{t('landing.consent.text')}</p>
      <div className="lp-consent__actions">
        <button
          type="button"
          className="lp-btn lp-btn--lime"
          onClick={() => setAnalyticsConsent('yes')}
        >
          {t('landing.consent.accept')}
        </button>
        <button
          type="button"
          className="lp-btn lp-btn--ghost"
          onClick={() => setAnalyticsConsent('no')}
        >
          {t('landing.consent.necessary')}
        </button>
        {onLegal ? null : (
          <Link className="lp-consent__more" to={landingPath('legal', lang)}>
            {t('landing.consent.more')}
          </Link>
        )}
      </div>
    </section>
  );
}
