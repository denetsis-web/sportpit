// «Поддержка» (R30, R30.1): контакты, статусы обращений и форма «Проблема с боксом».
import type { RouteObject } from 'react-router-dom';
import type { NavItem } from '../../../app/routes.tsx';
import { ComplaintFormPage } from './ComplaintFormPage.tsx';
import { SupportPage } from './SupportPage.tsx';

export const routes: RouteObject[] = [
  { path: 'support', element: <SupportPage /> },
  { path: 'support/new', element: <ComplaintFormPage /> },
];

export const nav: NavItem[] = [{ to: '/support', labelKey: 'feedback.nav.support', order: 60 }];
