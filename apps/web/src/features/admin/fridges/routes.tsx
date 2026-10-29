// Админка: холодильники и QR-плакат холодильника.
import type { RouteObject } from 'react-router-dom';
import type { AdminNavItem } from '../shell/menu.ts';
import { FridgesPage } from './FridgesPage.tsx';
import { PosterPage } from './PosterPage.tsx';

export const routes: RouteObject[] = [
  { path: 'fridges', element: <FridgesPage /> },
  { path: 'fridges/:id/poster', element: <PosterPage /> },
];

export const nav: AdminNavItem[] = [
  { to: '/admin/fridges', labelKey: 'admin.nav.fridges', order: 31, roles: ['admin'] },
];
