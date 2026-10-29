// Админка: меню на дни (состав, лимит порций, публикация, копирование).
import type { RouteObject } from 'react-router-dom';
import '../../client/menu/menu.css';
import type { AdminNavItem } from '../shell/menu.ts';
import { MenuAdminPage } from './MenuAdminPage.tsx';

export const routes: RouteObject[] = [{ path: 'menu', element: <MenuAdminPage /> }];

export const nav: AdminNavItem[] = [
  { to: '/admin/menu', labelKey: 'admin.nav.menu', order: 21, roles: ['admin'] },
];
