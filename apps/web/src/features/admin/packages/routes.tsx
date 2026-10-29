// Админка: пакеты и цены (только администратор).
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { AdminPackagesPage } from './AdminPackagesPage.tsx';

export const routes: RouteObject[] = [{ path: 'packages', element: <AdminPackagesPage /> }];

export const nav: AdminNavItem[] = [
  { to: '/admin/packages', labelKey: 'billing.admin.nav.packages', order: 40 },
];
