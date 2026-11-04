import type { MenuDto } from '@sportpit/shared/schemas/catalog';
import { useI18n } from '../../../app/i18n.tsx';
import type { Resource } from '../../../ui/index.ts';
import { MacroCard } from './MacroCard.tsx';

/** Блюда ближайшего опубликованного дня с КБЖУ. Нет меню или сбой — понятное сообщение, остальные секции на месте. */
export function BoxesSection({ menu }: { menu: Resource<MenuDto> }) {
  const { t, lang, date } = useI18n();
  const { data, error, loading, reload } = menu;
  let body;
  if (error !== undefined && data === undefined) {
    body = (
      <div className="lp-notice" role="alert">
        <p>{t('landing.boxes.error')}</p>
        <button type="button" className="lp-btn lp-btn--berry lp-btn--small" onClick={reload}>
          {t('landing.retry')}
        </button>
      </div>
    );
  } else if (loading && data === undefined) {
    body = <p role="status">{t('landing.loading')}</p>;
  } else if (!data || !data.published || data.items.length === 0) {
    body = (
      <div className="lp-notice">
        <h3 className="lp-card-title">{t('landing.boxes.emptyTitle')}</h3>
        <p>{t('landing.boxes.emptyText')}</p>
      </div>
    );
  } else {
    body = (
      <>
        <p className="lp-muted-text">{t('landing.boxes.date', { date: date(data.date) })}</p>
        <ul className="lp-cards" aria-label={t('landing.boxes.list')} tabIndex={0}>
          {data.items.map((dish) => (
            <li key={dish.id} className="lp-card">
              <article className="lp-dish">
                {dish.photoUrl ? (
                  <img
                    className="lp-dish__photo"
                    src={dish.photoUrl}
                    alt={dish.name[lang]}
                    loading="lazy"
                  />
                ) : (
                  <div className="lp-photo lp-photo--card">
                    <span>{t('landing.photo.placeholder')}</span>
                  </div>
                )}
                <h3 className="lp-card-title">{dish.name[lang]}</h3>
                <MacroCard macros={dish} layout="row" />
                <p className="lp-muted-text">
                  {t('landing.boxes.weight', { weight: dish.weightG })}
                </p>
              </article>
            </li>
          ))}
        </ul>
      </>
    );
  }
  return (
    <section id="boxes" className="lp-section" aria-labelledby="lp-boxes-title">
      <div className="lp-container">
        <p className="lp-label lp-label--muted">{t('landing.boxes.label')}</p>
        <h2 id="lp-boxes-title" className="lp-headline">
          {t('landing.boxes.title')}
        </h2>
        {body}
      </div>
    </section>
  );
}
