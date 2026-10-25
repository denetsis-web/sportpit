// Вход по телефону и коду, согласия. Для других функций экспортируются:
//   RequireRole (guards.tsx)   — обёртка страницы «только для вошедших / только для ролей»;
//   ConsentsForm               — галочки согласий (для анкеты: health_data);
//   useSession (session.ts)    — кто вошёл.
import type { RouteObject } from 'react-router-dom';
import type { NavItem } from '../../../app/routes.tsx';
import { ConsentPage } from './ConsentPage.tsx';
import { LoginPage } from './LoginPage.tsx';

export const routes: RouteObject[] = [
  { path: 'login', element: <LoginPage /> },
  { path: 'consent', element: <ConsentPage /> },
];

export const nav: NavItem[] = [{ to: '/login', labelKey: 'auth.nav.account', order: 90 }];
