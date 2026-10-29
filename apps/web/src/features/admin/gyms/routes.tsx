// Админка: залы. Общие части страниц каталога (common.tsx, admin-forms.css) лежат здесь же.
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { GymsPage } from './GymsPage.tsx';

export const routes: RouteObject[] = [{ path: 'gyms', element: <GymsPage /> }];

export const nav: AdminNavItem[] = [
  { to: '/admin/gyms', labelKey: 'admin.nav.gyms', order: 30, roles: ['admin'] },
];
