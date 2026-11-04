// Каркас страницы лендинга: шапка, подвал, плашка аналитики, язык по адресу, мета страницы, учёт просмотра.
// Шрифты подключаются здесь — только в чанке лендинга (в офлайн-предкэш приложения они не входят).
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/montserrat/wght.css';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LANGS, type Lang } from '@sportpit/shared/i18n';
import { useI18n } from '../../../app/i18n.tsx';
import { AnalyticsNotice } from './AnalyticsNotice.tsx';
import { AnchorLink } from './AnchorLink.tsx';
import { Footer } from './Footer.tsx';
import './landing.css';
import { captureAttribution, trackLandingView } from './tracker.ts';
import {
  landingPath,
  parseLandingPath,
  useShowLanding,
  type LandingKind,
} from './useShowLanding.ts';

/** Цвет строки состояния телефона на странице лендинга (Лес). */
const THEME_COLOR = '#26301f';

function Header({ kind }: { kind: LandingKind }) {
  const { t, lang, setLang } = useI18n();
  const { search } = useLocation();
  return (
    <header className="lp-header lp-dark">
      <div className="lp-container lp-header__bar">
        <Link to={landingPath('home', lang)} className="lp-brand">
          <img
            className="lp-brand__mark"
            src="/brand/symbol-on-dark.svg"
            alt={t('landing.brand.logoAlt')}
            width={32}
            height={32}
          />
          <span className="lp-brand__name">{t('landing.brand.name')}</span>
        </Link>
        {kind === 'home' ? (
          <nav className="lp-header__nav" aria-label={t('landing.nav.label')}>
            <AnchorLink target="how">{t('landing.nav.how')}</AnchorLink>
            <AnchorLink target="boxes">{t('landing.nav.boxes')}</AnchorLink>
            <AnchorLink target="faq">{t('landing.nav.faq')}</AnchorLink>
          </nav>
        ) : null}
        <div className="lp-header__tools">
          <div className="lp-lang" role="group" aria-label={t('landing.lang.label')}>
            {LANGS.map((code: Lang) => (
              <Link
                key={code}
                to={{ pathname: landingPath(kind, code), search }}
                lang={code}
                aria-current={lang === code ? 'true' : undefined}
                aria-label={t('landing.lang.switchTo', {
                  language: t(`landing.lang.${code}.name`),
                })}
                onClick={() => setLang(code)}
              >
                {t(`landing.lang.${code}.short`)}
              </Link>
            ))}
          </div>
          <Link to="/login" className="lp-header__login">
            {t('landing.nav.login')}
          </Link>
          {kind === 'home' ? (
            <AnchorLink target="join" className="lp-btn lp-btn--lime lp-btn--small">
              {t('landing.cta.join')}
            </AnchorLink>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/**
 * Страница лендинга целиком. `embedded` (страница политики у вошедшего клиента, внутри оболочки приложения):
 * только содержимое в оформлении лендинга, без шапки, подвала и плашки.
 */
export function LandingFrame({ kind, children }: { kind: LandingKind; children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { showLanding, pending } = useShowLanding();
  const embedded = !showLanding && !pending;
  const pathLang = parseLandingPath(pathname)?.lang ?? lang;
  const [synced, setSynced] = useState(embedded || pathLang === lang);
  const first = useRef(true);
  // Идёт перенос на /ro: страница, с которой уходим, просмотром не считается — его учтёт /ro.
  const redirecting = useRef(false);

  // Язык по адресу: /ro — румынский; русский адрес у румынского посетителя при первом заходе переносит на /ro.
  useEffect(() => {
    redirecting.current = false;
    if (embedded) return;
    const isFirst = first.current;
    first.current = false;
    if (pathLang !== lang) {
      if (pathLang === 'ro') setLang('ro');
      else if (isFirst) {
        redirecting.current = true;
        navigate({ pathname: landingPath(kind, 'ro'), search }, { replace: true });
        return;
      } else setLang('ru');
    }
    setSynced(true);
  }, [pathname]);

  // Источник из адреса и один просмотр за вкладку на адрес.
  useEffect(() => {
    if (embedded) return;
    captureAttribution(`${pathname}${search}`);
    if (!redirecting.current) trackLandingView(pathname);
  }, [embedded, pathname]);

  // Название вкладки и цвет строки состояния телефона; при уходе возвращаем прежние.
  useEffect(() => {
    if (embedded) return;
    const previousTitle = document.title;
    document.title = t(kind === 'legal' ? 'landing.meta.legal.title' : 'landing.meta.title');
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const previous = metas.map((meta) => meta.content);
    metas.forEach((meta) => {
      meta.content = THEME_COLOR;
    });
    return () => {
      document.title = previousTitle;
      metas.forEach((meta, index) => {
        meta.content = previous[index] ?? meta.content;
      });
    };
  }, [embedded, kind, lang]);

  if (embedded) {
    return (
      <div className="lp lp--embedded">
        <div className="lp-container">{children}</div>
      </div>
    );
  }
  if (!synced) return null;
  return (
    <div className="lp">
      <a className="lp-skip" href="#lp-main">
        {t('landing.skip.label')}
      </a>
      <Header kind={kind} />
      <main id="lp-main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
      <AnalyticsNotice />
    </div>
  );
}
