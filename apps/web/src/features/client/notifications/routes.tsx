// Внутренние уведомления: страница /notifications и пункт нижнего меню.
// Колокольчик со счётчиком — компонент NotificationsBell (Bell.tsx) для шапки оболочки.
import type { RouteObject } from 'react-router-dom';
import type { NavItem } from '../../../app/routes.tsx';
import { NotificationsPage } from './NotificationsPage.tsx';

export const routes: RouteObject[] = [{ path: 'notifications', element: <NotificationsPage /> }];

export const nav: NavItem[] = [
  { to: '/notifications', labelKey: 'notifications.nav.label', order: 80 },
];
