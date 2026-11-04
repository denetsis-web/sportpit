import { Link } from 'react-router-dom';
import { useI18n } from '../../../app/i18n.tsx';
import { useResource } from '../../../ui/index.ts';
import { fetchPublicSettings } from './data.ts';
import { httpsLink, isFilled, mailLink, telLink } from './links.ts';
import { landingPath } from './useShowLanding.ts';

function Contacts() {
  const { t } = useI18n();
  // Контакты поддержки заполняет владелец в админке; пока там заглушка или сервер недоступен — блока нет.
  const { data } = useResource(() => fetchPublicSettings().catch(() => null));
  const contacts = data?.supportContacts;
  if (!contacts) return null;
  const items: Array<{ key: string; text: string; href: string | null }> = [];
  if (isFilled(contacts.phone)) {
    items.push({ key: 'phone', text: contacts.phone, href: telLink(contacts.phone) });
  }
  if (isFilled(contacts.email)) {
    items.push({ key: 'email', text: contacts.email, href: mailLink(contacts.email) });
  }
  if (isFilled(contacts.messenger)) {
    items.push({
      key: 'messenger',
      text: contacts.messenger,
      href: httpsLink(contacts.messenger),
    });
  }
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className="lp-footer__title">{t('landing.footer.contacts')}</h2>
      <ul className="lp-footer__list">
        {items.map((item) => (
          <li key={item.key}>{item.href ? <a href={item.href}>{item.text}</a> : item.text}</li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const { t, lang } = useI18n();
  const social = [
    {
      key: 'telegram',
      href: httpsLink(t('landing.links.telegram')),
      label: t('landing.links.telegram.label'),
    },
    {
      key: 'instagram',
      href: httpsLink(t('landing.links.instagram')),
      label: t('landing.links.instagram.label'),
    },
  ].filter((item): item is { key: string; href: string; label: string } => item.href !== null);
  return (
    <footer className="lp-footer lp-dark">
      <div className="lp-container lp-footer__grid">
        <div>
          <p className="lp-footer__brand">
            <img
              src="/brand/symbol-on-dark.svg"
              alt={t('landing.brand.logoAlt')}
              width={32}
              height={32}
            />
            <span>{t('landing.brand.name')}</span>
          </p>
          <p className="lp-muted">{t('landing.brand.tagline')}</p>
        </div>
        {social.length > 0 ? (
          <div>
            <h2 className="lp-footer__title">{t('landing.footer.social')}</h2>
            <ul className="lp-footer__list">
              {social.map((item) => (
                <li key={item.key}>
                  <a href={item.href} target="_blank" rel="noopener noreferrer">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Contacts />
        <div>
          <ul className="lp-footer__list">
            <li>
              <Link to={landingPath('legal', lang)}>{t('landing.footer.legal')}</Link>
            </li>
            <li>
              <Link to="/login">{t('landing.nav.login')}</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="lp-container">
        <p className="lp-footer__note lp-muted">{t('landing.footer.note')}</p>
      </div>
    </footer>
  );
}
