// Оценка блюд после выдачи (R26): список выданных заказов и оценка одного заказа (ссылка из уведомления).
import type { RouteObject } from 'react-router-dom';
import type { NavItem } from '../../../app/routes.tsx';
import { RatePage } from './RatePage.tsx';

export const routes: RouteObject[] = [
  { path: 'rate', element: <RatePage /> },
  { path: 'rate/:orderId', element: <RatePage /> },
];

export const nav: NavItem[] = [{ to: '/rate', labelKey: 'feedback.nav.rate', order: 50 }];
