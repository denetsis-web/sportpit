// Заказ на завтра: выбор холодильника и даты, корзина, итоги КБЖУ, подтверждение.
// В заказ ведёт кнопка меню: /order?date=YYYY-MM-DD&dish=<id>; /order?move=<id> — перенос заказа.
import type { RouteObject } from 'react-router-dom';
import { OrderPage } from './OrderPage.tsx';

export const routes: RouteObject[] = [{ path: 'order', element: <OrderPage /> }];
