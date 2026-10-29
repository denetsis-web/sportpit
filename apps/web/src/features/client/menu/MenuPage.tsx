import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicFridgeSchema, type PublicFridgeDto } from '@sportpit/shared/schemas/admin';
import {
  matchesFilters,
  menuSchema,
  type MenuDto,
  type MenuFilters,
} from '@sportpit/shared/schemas/catalog';
import { addDaysISO } from '@sportpit/shared/time';
import { api, ApiError } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card } from '../../../ui/index.ts';
import { DishCard } from './DishCard.tsx';
import { Filters } from './Filters.tsx';
import { clearSelectedFridge, getSelectedFridge, rememberFridgeFromUrl } from './fridge.ts';
import './menu.css';

const DAYS_SHOWN = 7;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; messageKey: string; message?: string }
  | { status: 'ready'; menu: MenuDto };

/** Холодильник, выбранный по QR или ссылке: подпись над меню. Неизвестный холодильник забывается. */
function SelectedFridge({ id }: { id: string }) {
  const { t } = useI18n();
  const [fridge, setFridge] = useState<PublicFridgeDto | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .get(`/fridges/${encodeURIComponent(id)}`, { schema: publicFridgeSchema })
      .then((found) => alive && setFridge(found))
      .catch((error: unknown) => {
        if (alive && error instanceof ApiError && error.status === 404) clearSelectedFridge();
      });
    return () => {
      alive = false;
    };
  }, [id]);
  if (!fridge) return null;
  return (
    <Banner variant="info" data-testid="selected-fridge">
      {t('catalog.fridge.selected', { gym: fridge.gymName, name: fridge.name })}
    </Banner>
  );
}

/** Экран меню: слоган, выбор дня, фильтры, карточки блюд. */
export function MenuPage() {
  const { t, lang, date: formatDate } = useI18n();
  const [params] = useSearchParams();
  const [date, setDate] = useState<string | undefined>(undefined);
  const [filters, setFilters] = useState<MenuFilters>({});
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [fridgeId, setFridgeId] = useState<string | null>(() => getSelectedFridge());

  const search = params.toString();
  useEffect(() => {
    const id = rememberFridgeFromUrl(`?${search}`);
    if (id) setFridgeId(id);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    api
      .get('/menu', { query: { date }, schema: menuSchema })
      .then((menu) => alive && setState({ status: 'ready', menu }))
      .catch((error: unknown) => {
        if (!alive) return;
        const messageKey = error instanceof ApiError ? error.messageKey : 'core.error.network';
        setState({ status: 'error', messageKey });
      });
    return () => {
      alive = false;
    };
  }, [date, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (state.status === 'loading') return <p role="status">{t('core.loading')}</p>;
  if (state.status === 'error') {
    return (
      <>
        <h1>{t('catalog.menu.title')}</h1>
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={retry}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {t(state.messageKey)}
        </Banner>
      </>
    );
  }

  const { menu } = state;
  const visible = menu.items.filter((item) => matchesFilters(item, filters));
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDaysISO(menu.today, i));

  return (
    <>
      <h1>{t('catalog.menu.title')}</h1>
      <p className="menu__slogan">
        <strong>{t('core.slogan')}</strong>
      </p>
      {fridgeId ? <SelectedFridge id={fridgeId} /> : null}

      <nav className="menu-days" aria-label={t('catalog.day.label')}>
        {days.map((day, index) => (
          <button
            key={day}
            type="button"
            className="menu-days__item"
            aria-pressed={day === menu.date}
            onClick={() => setDate(day)}
          >
            {index === 0
              ? t('catalog.day.today')
              : index === 1
                ? t('catalog.day.tomorrow')
                : formatDate(day).slice(0, 5)}
          </button>
        ))}
      </nav>

      {menu.published ? (
        <>
          <Filters value={filters} onChange={setFilters} count={visible.length} />
          {visible.length === 0 ? (
            <p>{t('catalog.menu.noMatches')}</p>
          ) : (
            <div className="menu-list">
              {visible.map((item) => (
                <DishCard key={item.id} dish={item} date={menu.date} today={menu.today} />
              ))}
            </div>
          )}
        </>
      ) : (
        <Card title={t('catalog.later.title')}>
          <p>{t('catalog.later.body', { date: formatDate(menu.date) })}</p>
          {menu.nextDate ? (
            <>
              <p>{t('catalog.later.next', { date: formatDate(menu.nextDate) })}</p>
              <Button variant="secondary" onClick={() => setDate(menu.nextDate ?? undefined)}>
                {t('catalog.later.show', { date: formatDate(menu.nextDate) })}
              </Button>
            </>
          ) : (
            <p>{t('catalog.later.noNext')}</p>
          )}
        </Card>
      )}

      <p className="menu__tolerance">{menu.toleranceNote[lang]}</p>
    </>
  );
}
