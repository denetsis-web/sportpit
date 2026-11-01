// Админка: выдача для оператора (загрузка, выдача по коду, остаток и закрытие дня, температура)
// и список пропущенных замеров температуры для администратора.
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { MissedTemperaturePage } from './MissedTemperaturePage.tsx';
import { OperatorPage } from './OperatorPage.tsx';

export const routes: RouteObject[] = [
  { path: 'operator', element: <OperatorPage /> },
  { path: 'temperature', element: <MissedTemperaturePage /> },
];

export const nav: AdminNavItem[] = [
  {
    to: '/admin/operator',
    labelKey: 'fulfillment.operator.nav.operator',
    order: 15,
    roles: ['operator', 'admin'],
  },
  {
    to: '/admin/temperature',
    labelKey: 'fulfillment.operator.nav.temperature',
    order: 16,
    roles: ['admin'],
  },
];
