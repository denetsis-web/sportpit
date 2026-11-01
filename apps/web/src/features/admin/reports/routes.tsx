// Админка: отчёты (только администратор).
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { ReportsPage } from './ReportsPage.tsx';

export const routes: RouteObject[] = [{ path: 'reports', element: <ReportsPage /> }];

export const nav: AdminNavItem[] = [
  { to: '/admin/reports', labelKey: 'reports.nav.reports', order: 60, roles: ['admin'] },
];
