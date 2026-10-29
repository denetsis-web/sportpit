// Админка: промокоды (только администратор).
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { AdminPromosPage } from './AdminPromosPage.tsx';

export const routes: RouteObject[] = [{ path: 'promos', element: <AdminPromosPage /> }];

export const nav: AdminNavItem[] = [
  { to: '/admin/promos', labelKey: 'billing.admin.nav.promos', order: 41 },
];
