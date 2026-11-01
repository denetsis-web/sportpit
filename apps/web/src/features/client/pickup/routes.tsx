// Получение бокса: код заказа крупно и QR, код замка холодильника, кнопка «Забрал» (R25, R34.3, R45).
import type { RouteObject } from 'react-router-dom';
import type { NavItem } from '../../../app/routes.tsx';
import { PickupPage } from './PickupPage.tsx';

export const routes: RouteObject[] = [{ path: 'pickup', element: <PickupPage /> }];

export const nav: NavItem[] = [{ to: '/pickup', labelKey: 'fulfillment.nav.pickup', order: 25 }];
