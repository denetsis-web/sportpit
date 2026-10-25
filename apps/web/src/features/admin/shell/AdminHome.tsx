import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Role } from '@sportpit/shared/types';
import { useT } from '../../../app/i18n.tsx';
import { RequireRole } from '../../client/auth/guards.tsx';
import { useSession } from '../../client/auth/session.ts';
import { Card } from '../../../ui/index.ts';
import './admin.css';
import { filterNavByRole, sortNav, type AdminNavItem } from './menu.ts';

const STAFF: readonly Role[] = ['kitchen', 'operator', 'admin'];

// Пункты меню всех остальных разделов админки: каждый раздел экспортирует `nav` из своего routes.tsx.
// Загружаются лениво уже внутри чанка админки; сам каркас в список не входит.
const navLoaders = import.meta.glob<AdminNavItem[]>(['../*/routes.tsx', '!../shell/**'], {
  import: 'nav',
});

function useSectionItems(given: AdminNavItem[] | undefined): AdminNavItem[] {
  const [loaded, setLoaded] = useState<AdminNavItem[]>([]);
  useEffect(() => {
    if (given) return;
    let alive = true;
    void Promise.all(Object.values(navLoaders).map((load) => load())).then((lists) => {
      if (alive) setLoaded(lists.flatMap((list) => list ?? []));
    });
    return () => {
      alive = false;
    };
  }, [given]);
  return given ?? loaded;
}

function AdminMenu({ items }: { items?: AdminNavItem[] }) {
  const t = useT();
  const { user } = useSession();
  const all = useSectionItems(items);
  const visible = user ? sortNav(filterNavByRole(all, user.role)) : [];
  return (
    <>
      <p>{t('auth.admin.home.lead')}</p>
      {visible.length > 0 ? (
        <nav aria-label={t('auth.admin.menu.label')}>
          <ul className="admin-menu">
            {visible.map((item) => (
              <li key={item.to}>
                <Link className="ui-button ui-button--secondary" to={item.to}>
                  {t(item.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <Card>
          <p>{t('auth.admin.home.empty')}</p>
        </Card>
      )}
    </>
  );
}

/**
 * Главная админки (/admin): только для сотрудников, меню показывает разделы роли.
 * Клиент видит «Нет доступа», не вошедший — экран входа.
 * `items` — подмена списка разделов (тесты); по умолчанию собираются из features/admin.
 */
export function AdminHome({ items }: { items?: AdminNavItem[] }) {
  return (
    <RequireRole roles={STAFF}>
      <AdminMenu {...(items ? { items } : {})} />
    </RequireRole>
  );
}
