// Каркас админки: главная /admin с меню по ролям. Для остальных разделов админки:
//   — пункт меню: `export const nav: AdminNavItem[]` (поле `roles` необязательно, см. menu.ts);
//   — страницу оберните в <RequireRole roles={[...]}> из features/client/auth/guards.tsx.
import type { RouteObject } from 'react-router-dom';
import { AdminHome } from './AdminHome.tsx';

export const routes: RouteObject[] = [{ index: true, element: <AdminHome /> }];
