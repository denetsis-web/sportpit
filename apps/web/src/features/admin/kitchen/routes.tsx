// Админка: кухня (сводка, партии) и печать этикеток. Раздел видят роли «кухня» и «администратор».
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { KitchenPage } from './KitchenPage.tsx';
import { LabelPage } from './LabelPage.tsx';

export const routes: RouteObject[] = [
  { path: 'kitchen', element: <KitchenPage /> },
  { path: 'kitchen/label/:id', element: <LabelPage /> },
];

export const nav: AdminNavItem[] = [
  { to: '/admin/kitchen', labelKey: 'kitchen.nav.kitchen', order: 10, roles: ['kitchen', 'admin'] },
];
