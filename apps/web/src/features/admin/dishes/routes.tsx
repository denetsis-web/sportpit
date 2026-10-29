// Админка: блюда (названия RU/RO, КБЖУ, состав, аллергены, фото, срок хранения).
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { DishesPage } from './DishesPage.tsx';

export const routes: RouteObject[] = [{ path: 'dishes', element: <DishesPage /> }];

export const nav: AdminNavItem[] = [
  { to: '/admin/dishes', labelKey: 'admin.nav.dishes', order: 20, roles: ['admin'] },
];
