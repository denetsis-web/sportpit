// Меню и карточка блюда для клиента. Открытие приложения по QR или ссылке из зала (`?fridge=<id>`)
// запоминает холодильник сразу при загрузке приложения; заказ (таск 06) читает его через getSelectedFridge().
import type { RouteObject } from 'react-router-dom';
import type { NavItem } from '../../../app/routes.tsx';
import { DishPage } from './DishPage.tsx';
import { rememberFridgeFromUrl } from './fridge.ts';
import { MenuPage } from './MenuPage.tsx';

rememberFridgeFromUrl();

export const routes: RouteObject[] = [
  { path: 'menu', element: <MenuPage /> },
  { path: 'menu/dish/:id', element: <DishPage /> },
];

export const nav: NavItem[] = [{ to: '/menu', labelKey: 'catalog.nav.menu', order: 10 }];
