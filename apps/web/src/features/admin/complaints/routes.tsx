// Админка: очередь жалоб (только администратор).
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { AdminComplaintsPage } from './AdminComplaintsPage.tsx';

export const routes: RouteObject[] = [{ path: 'complaints', element: <AdminComplaintsPage /> }];

export const nav: AdminNavItem[] = [
  {
    to: '/admin/complaints',
    labelKey: 'feedback.admin.nav.complaints',
    order: 50,
    roles: ['admin'],
  },
];
