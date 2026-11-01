// Админка: события системы (только администратор).
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { SystemEventsPage } from './SystemEventsPage.tsx';

export const routes: RouteObject[] = [{ path: 'events', element: <SystemEventsPage /> }];

export const nav: AdminNavItem[] = [
  { to: '/admin/events', labelKey: 'reports.nav.events', order: 61, roles: ['admin'] },
];
