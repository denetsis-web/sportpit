import { useT } from '../../../app/i18n.tsx';
import { AnchorLink } from './AnchorLink.tsx';
import { MacroCard, type Macros } from './MacroCard.tsx';

const PERK_ICONS = [
  // цифры: график-столбики
  'M5 20V11M12 20V4M19 20v-6',
  // холодильник
  'M7 3h10v18H7zM7 10h10M10 6v1M10 13v3',
  // часы
  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  // пакет
  'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
];

/** Первый экран: что это, две кнопки, четыре плюса. Карточка КБЖУ — с первого блюда меню, если оно загружено. */
export function Hero({ macros }: { macros: Macros | null }) {
  const t = useT();
  return (
    <section className="lp-hero lp-dark" aria-labelledby="lp-hero-title">
      <div className="lp-container lp-hero__grid">
        <div className="lp-hero__text">
          <p className="lp-label">{t('landing.hero.eyebrow')}</p>
          <h1 id="lp-hero-title" className="lp-display">
            {t('landing.hero.title')}
          </h1>
          <p className="lp-lead">{t('landing.hero.lead')}</p>
          <div className="lp-hero__actions">
            <AnchorLink target="join" className="lp-btn lp-btn--lime">
              {t('landing.hero.ctaJoin')}
            </AnchorLink>
            <AnchorLink target="calc" className="lp-btn lp-btn--ghost">
              {t('landing.hero.ctaCalc')}
            </AnchorLink>
          </div>
        </div>
        <div className="lp-hero__visual">
          <div className="lp-photo" role="img" aria-label={t('landing.photo.placeholder')}>
            <span aria-hidden="true">{t('landing.photo.placeholder')}</span>
          </div>
          {macros ? (
            <div className="lp-hero__macro">
              <MacroCard macros={macros} layout="column" />
            </div>
          ) : null}
        </div>
      </div>
      <div className="lp-container">
        <ul className="lp-perks" aria-label={t('landing.hero.perks')}>
          {PERK_ICONS.map((icon, index) => (
            <li key={icon}>
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
                <path
                  d={icon}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{t(`landing.hero.perk${index + 1}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
