// Экран «Пакеты»: баланс, срок кредитов, выбор пакета, промокод и оплата.
import type { RouteObject } from 'react-router-dom';
import type { NavItem } from '../../../app/routes.tsx';
import { PackagesPage } from './PackagesPage.tsx';

export const routes: RouteObject[] = [{ path: 'packages', element: <PackagesPage /> }];

export const nav: NavItem[] = [{ to: '/packages', labelKey: 'billing.nav.packages', order: 30 }];
