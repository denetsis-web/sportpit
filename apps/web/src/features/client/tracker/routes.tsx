// Трекер питания (R04, R28): итоги дня и недели, ручные записи.
import type { RouteObject } from 'react-router-dom';
import type { NavItem } from '../../../app/routes.tsx';
import { TrackerPage } from './TrackerPage.tsx';

export const routes: RouteObject[] = [{ path: 'tracker', element: <TrackerPage /> }];

export const nav: NavItem[] = [{ to: '/tracker', labelKey: 'tracker.nav.tracker', order: 40 }];
