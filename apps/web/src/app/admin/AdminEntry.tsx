// Точка входа админки (/admin/*). Загружается лениво и попадает в отдельный чанок,
// поэтому клиентам, которые админку не открывают, она не стоит ни одного байта.
// Страницы админки: src/features/admin/<имя>/routes.tsx (пути — от /admin).
// Доступ: только сотрудники (кухня, оператор, администратор). Гость идёт на вход, клиент видит
// «Нет доступа». Меню показывает только разделы роли; раздел, закрытый для роли, тоже «Нет доступа».
// Колокольчик уведомлений стоит в шапке оболочки (Shell), которая окружает и админку.
import { NavLink, useLocation, useRoutes } from 'react-router-dom';
import type { Role } from '@sportpit/shared/types';
import { RequireRole } from '../../features/client/auth/guards.tsx';
import { useSession } from '../../features/client/auth/session.ts';
import {
  filterNavByRole,
  rolesFor,
  sortNav,
  type AdminNavItem,
} from '../../features/admin/shell/menu.ts';
import { useT } from '../i18n.tsx';
import { NoAccessPage } from '../pages.tsx';
import { collectFeatures, type FeatureRoutesModule } from '../routes.tsx';
import { Card } from '../../ui/index.ts';

const defaultModules = import.meta.glob<FeatureRoutesModule>('../../features/admin/**/routes.tsx', {
  eager: true,
});

const STAFF: readonly Role[] = ['kitchen', 'operator', 'admin'];

export interface AdminEntryProps {
  /** Подмена набора модулей (тесты). По умолчанию — всё из src/features/admin. */
  modules?: Record<string, FeatureRoutesModule>;
}

function AdminLayout({ modules }: { modules: Record<string, FeatureRoutesModule> }) {
  const t = useT();
  const { user } = useSession();
  const location = useLocation();
  const { routes, nav } = collectFeatures(modules);
  const allItems = nav as AdminNavItem[];
  const visible = user ? sortNav(filterNavByRole(allItems, user.role)) : [];
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

  // Адрес раздела, закрытого для роли, открывается как «Нет доступа» (сервер всё равно ответит 403).
  const section = allItems.find(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  );
  if (section && user && !rolesFor(section).includes(user.role)) return <NoAccessPage />;

  return (
    <div className="admin">
      <h1>{t('core.admin.title')}</h1>
      {visible.length > 0 ? (
        <nav className="admin__nav" aria-label={t('core.admin.nav.label')}>
          {visible.map((item) => (
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

export default function AdminEntry({ modules = defaultModules }: AdminEntryProps) {
  return (
    <RequireRole roles={STAFF}>
      <AdminLayout modules={modules} />
    </RequireRole>
  );
}
