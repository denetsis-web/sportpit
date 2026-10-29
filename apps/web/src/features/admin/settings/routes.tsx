// Админка: настройки (максимум боксов в день, допуск КБЖУ, запас, этикетка, контакты) и журнал действий.
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { SettingsPage } from './SettingsPage.tsx';

export const routes: RouteObject[] = [{ path: 'settings', element: <SettingsPage /> }];

export const nav: AdminNavItem[] = [
  { to: '/admin/settings', labelKey: 'admin.nav.settings', order: 40, roles: ['admin'] },
];
