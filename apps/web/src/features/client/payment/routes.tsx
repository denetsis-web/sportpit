// Оплата: экран статуса /pay/:id (обновляется сам) и тестовая страница заглушки шлюза /pay/stub/:id.
import type { RouteObject } from 'react-router-dom';
import { PayStatusPage } from './PayStatusPage.tsx';
import { StubPayPage } from './StubPayPage.tsx';

export const routes: RouteObject[] = [
  { path: 'pay/stub/:id', element: <StubPayPage /> },
  { path: 'pay/:id', element: <PayStatusPage /> },
];
