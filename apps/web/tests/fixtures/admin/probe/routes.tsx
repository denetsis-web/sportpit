// Тестовый модуль админки: пути — от /admin.
import type { RouteObject } from 'react-router-dom';
import { useT } from '../../../../src/app/i18n.tsx';
import type { NavItem } from '../../../../src/app/routes.tsx';

function ProbeAdminPage() {
  const t = useT();
  return <h2>{t('probe.adminTitle')}</h2>;
}

export const routes: RouteObject[] = [{ path: 'probe-admin', element: <ProbeAdminPage /> }];
export const nav: NavItem[] = [{ to: '/admin/probe-admin', labelKey: 'probe.adminNav' }];
