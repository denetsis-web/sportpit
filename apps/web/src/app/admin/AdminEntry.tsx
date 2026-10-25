// Точка входа админки (/admin/*). Загружается лениво и попадает в отдельный чанок,
// поэтому клиентам, которые админку не открывают, она не стоит ни одного байта.
// Страницы админки: src/features/admin/<имя>/routes.tsx (пути — от /admin).
import { NavLink, useRoutes } from 'react-router-dom';
import { useT } from '../i18n.tsx';
import { collectFeatures, type FeatureRoutesModule } from '../routes.tsx';
import { Card } from '../../ui/index.ts';

const defaultModules = import.meta.glob<FeatureRoutesModule>('../../features/admin/**/routes.tsx', {
  eager: true,
});

export interface AdminEntryProps {
  /** Подмена набора модулей (тесты). По умолчанию — всё из src/features/admin. */
  modules?: Record<string, FeatureRoutesModule>;
}

export default function AdminEntry({ modules = defaultModules }: AdminEntryProps) {
  const t = useT();
  const { routes, nav } = collectFeatures(modules);
  const element = useRoutes([
    ...routes,
    {
      path: '*',
      element: (
        <Card>
          <p>{t('core.admin.empty')}</p>
        </Card>
      ),
    },
  ]);
  return (
    <div className="admin">
      <h1>{t('core.admin.title')}</h1>
      {nav.length > 0 ? (
        <nav className="admin__nav" aria-label={t('core.admin.nav.label')}>
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
      ) : null}
      {element}
    </div>
  );
}
