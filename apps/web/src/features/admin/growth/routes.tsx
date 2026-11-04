// Админка: «Лист ожидания» и «Воронка» (только администратор).
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { FunnelPage } from './FunnelPage.tsx';
import { WaitlistPage } from './WaitlistPage.tsx';

export const routes: RouteObject[] = [
  { path: 'waitlist', element: <WaitlistPage /> },
  { path: 'funnel', element: <FunnelPage /> },
];

export const nav: AdminNavItem[] = [
  { to: '/admin/waitlist', labelKey: 'growth.nav.waitlist', order: 70, roles: ['admin'] },
  { to: '/admin/funnel', labelKey: 'growth.nav.funnel', order: 71, roles: ['admin'] },
];
