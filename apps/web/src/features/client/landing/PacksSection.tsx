import { useI18n } from '../../../app/i18n.tsx';
import { useResource } from '../../../ui/index.ts';
import { fetchPackages } from './data.ts';

type PluralForm = 'one' | 'few' | 'many';

/** Форма слова по числу: у русского и румынского правила свои, их знает Intl. */
function pluralForm(lang: string, count: number): PluralForm {
  const rule = new Intl.PluralRules(lang).select(count);
  return rule === 'one' ? 'one' : rule === 'few' ? 'few' : 'many';
}

/** Пакеты боксов: число боксов, цена за бокс, итог, срок действия. Данные и деньги — из системы. */
export function PacksSection() {
  const { t, lang, money } = useI18n();
  const { data, error, loading, reload } = useResource(fetchPackages);
  let body;
  if (error !== undefined && data === undefined) {
    body = (
      <div className="lp-notice" role="alert">
        <p>{t('landing.packs.error')}</p>
        <button type="button" className="lp-btn lp-btn--berry lp-btn--small" onClick={reload}>
          {t('landing.retry')}
        </button>
      </div>
    );
  } else if (loading && data === undefined) {
    body = <p role="status">{t('landing.loading')}</p>;
  } else if (!data || data.items.length === 0) {
    body = (
      <div className="lp-notice">
        <h3 className="lp-card-title">{t('landing.packs.emptyTitle')}</h3>
        <p>{t('landing.packs.emptyText')}</p>
      </div>
    );
  } else {
    body = (
      <ul className="lp-packs" aria-label={t('landing.packs.list')}>
        {data.items.map((pack) => (
          <li key={pack.id} className="lp-pack">
            <p className="lp-pack__boxes">
              <span className="lp-figure">{pack.boxes}</span>{' '}
              {t(`landing.packs.boxes.${pluralForm(lang, pack.boxes)}`)}
            </p>
            <p className="lp-pack__price">
              {t('landing.packs.perBox', { price: money(pack.pricePerBoxBani) })}
            </p>
            <p className="lp-pack__total">
              {t('landing.packs.total', { total: money(pack.totalBani) })}
            </p>
            <p className="lp-muted-text">
              {t(`landing.packs.days.${pluralForm(lang, pack.validityDays)}`, {
                days: pack.validityDays,
              })}
            </p>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section id="packs" className="lp-section" aria-labelledby="lp-packs-title">
      <div className="lp-container">
        <p className="lp-label lp-label--muted">{t('landing.packs.label')}</p>
        <h2 id="lp-packs-title" className="lp-headline">
          {t('landing.packs.title')}
        </h2>
        {body}
      </div>
    </section>
  );
}
