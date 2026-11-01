// «Мои заказы»: предстоящие и прошлые заказы с кодом получения, отмена и перенос до срока, пауза пакета.
import type { RouteObject } from 'react-router-dom';
import type { NavItem } from '../../../app/routes.tsx';
import { MyOrdersPage } from './MyOrdersPage.tsx';

export const routes: RouteObject[] = [{ path: 'orders', element: <MyOrdersPage /> }];

export const nav: NavItem[] = [{ to: '/orders', labelKey: 'orders.nav.orders', order: 20 }];
