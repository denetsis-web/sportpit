// Админка: пользователи — роли и холодильники операторов. Раздел только для администратора.
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { UsersPage } from './UsersPage.tsx';

export const routes: RouteObject[] = [{ path: 'users', element: <UsersPage /> }];

export const nav: AdminNavItem[] = [
  { to: '/admin/users', labelKey: 'users.nav.users', order: 35, roles: ['admin'] },
];
