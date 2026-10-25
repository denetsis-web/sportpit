import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { NotificationsBell } from '../features/client/notifications/Bell.tsx';
import { OfflineBanner } from './connectivity.tsx';
import { useT } from './i18n.tsx';
import { InstallPrompt } from './install.tsx';
import { LanguageChoiceDialog, LanguageSwitcher } from './LanguageSwitcher.tsx';
import type { NavItem } from './routes.tsx';
import { ThemeToggle } from './theme.tsx';

/** Оболочка: шапка (язык, тема), баннер «Нет связи», содержимое, подсказка установки, нижнее меню функций. */
export function Shell({ nav }: { nav: NavItem[] }) {
  const t = useT();
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        {t('core.skipToContent')}
      </a>
      <header className="shell__header">
        <Link to="/" className="shell__brand">
          {t('core.appName')}
        </Link>
        <div className="shell__controls">
          <NotificationsBell />
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="shell__main" tabIndex={-1}>
        <OfflineBanner />
        <InstallPrompt />
        <Suspense fallback={<p role="status">{t('core.loading')}</p>}>
          <Outlet />
        </Suspense>
      </main>
      {nav.length > 0 ? (
        <nav className="shell__nav" aria-label={t('core.nav.label')}>
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
      ) : null}
      <LanguageChoiceDialog />
    </div>
  );
}
