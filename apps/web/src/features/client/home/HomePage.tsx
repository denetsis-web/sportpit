import { Link } from 'react-router-dom';
import { useT } from '../../../app/i18n.tsx';
import { Card } from '../../../ui/index.ts';
import { useSession } from '../auth/session.ts';
import './home.css';

interface Section {
  to: string;
  /** Подпись — ключ раздела в нижнем меню; пояснение — в словаре `core`. */
  titleKey: string;
  hintKey: string;
}

const MENU: Section = { to: '/menu', titleKey: 'catalog.nav.menu', hintKey: 'core.home.menu' };

const SIGNED_IN: readonly Section[] = [
  MENU,
  { to: '/packages', titleKey: 'billing.nav.packages', hintKey: 'core.home.packages' },
  { to: '/orders', titleKey: 'orders.nav.orders', hintKey: 'core.home.orders' },
  { to: '/pickup', titleKey: 'fulfillment.nav.pickup', hintKey: 'core.home.pickup' },
  { to: '/tracker', titleKey: 'tracker.nav.tracker', hintKey: 'core.home.tracker' },
  { to: '/profile', titleKey: 'profile.nav.profile', hintKey: 'core.home.profile' },
  { to: '/support', titleKey: 'feedback.nav.support', hintKey: 'core.home.support' },
];

const GUEST: readonly Section[] = [
  { to: '/login', titleKey: 'core.home.login', hintKey: 'core.home.loginHint' },
  MENU,
];

const ADMIN_SECTION: Section = {
  to: '/admin',
  titleKey: 'core.admin.title',
  hintKey: 'core.home.admin',
};

/** Главная: приветствие и ссылки на разделы. Гость видит вход и меню, вошедший — все свои разделы. */
export function HomePage() {
  const t = useT();
  const { status, user } = useSession();
  const sections = !user
    ? GUEST
    : user.role === 'client'
      ? SIGNED_IN
      : [...SIGNED_IN, ADMIN_SECTION];
  return (
    <>
      <h1>{t('core.home.welcome')}</h1>
      <Card>
        <p>
          <strong>{t('core.slogan')}</strong>
        </p>
        <p>{t('core.home.lead')}</p>
      </Card>
      {status === 'loading' ? (
        <p role="status">{t('core.loading')}</p>
      ) : (
        <nav aria-label={t('core.home.sections')}>
          <ul className="home-sections">
            {sections.map((section) => (
              <li key={section.to}>
                <Link to={section.to} className="home-link">
                  <span className="home-link__title">{t(section.titleKey)}</span>
                  <span className="home-link__hint">{t(section.hintKey)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
