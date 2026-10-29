// Админка: возвраты (только администратор).
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { AdminRefundsPage } from './AdminRefundsPage.tsx';

export const routes: RouteObject[] = [{ path: 'refunds', element: <AdminRefundsPage /> }];

export const nav: AdminNavItem[] = [
  { to: '/admin/refunds', labelKey: 'billing.admin.nav.refunds', order: 42 },
];
