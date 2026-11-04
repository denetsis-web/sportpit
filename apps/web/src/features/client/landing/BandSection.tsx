import { useT } from '../../../app/i18n.tsx';
import { scrollToSection } from './AnchorLink.tsx';

/** Полоса «любовь к себе»: главная мысль бренда в одной фразе и стрелка к листу ожидания. */
export function BandSection() {
  const t = useT();
  return (
    <section className="lp-band-wrap" aria-labelledby="lp-band-title">
      <div className="lp-container">
        <div className="lp-band">
          <h2 id="lp-band-title" className="lp-headline">
            {t('landing.band.title')}
          </h2>
          <a
            href="#join"
            className="lp-band__arrow"
            aria-label={t('landing.band.cta')}
            onClick={(event) => {
              event.preventDefault();
              scrollToSection('join');
            }}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
              <path
                d="M5 12h14M13 6l6 6-6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
