import { Link } from 'react-router-dom';
import { Card } from '../ui/index.ts';
import { useT } from './i18n.tsx';

/** Приветствие со слоганом. Функция, которой нужен корень сайта, объявляет свой маршрут `index` — он главнее. */
export function HomePage() {
  const t = useT();
  return (
    <>
      <h1>{t('core.home.welcome')}</h1>
      <Card>
        <p>
          <strong>{t('core.slogan')}</strong>
        </p>
        <p>{t('core.home.lead')}</p>
      </Card>
    </>
  );
}

export function NotFoundPage() {
  const t = useT();
  return (
    <>
      <h1>{t('core.notFound.title')}</h1>
      <p>{t('core.notFound.body')}</p>
      <Link to="/" className="ui-button ui-button--primary">
        {t('core.notFound.home')}
      </Link>
    </>
  );
}

/** Экран «Нет доступа» (код 403 от сервера): его показывают функции с проверкой роли. */
export function NoAccessPage() {
  const t = useT();
  return (
    <>
      <h1>{t('core.noAccess.title')}</h1>
      <p>{t('core.noAccess.body')}</p>
      <Link to="/" className="ui-button ui-button--secondary">
        {t('core.notFound.home')}
      </Link>
    </>
  );
}
