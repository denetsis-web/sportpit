// Профиль клиента (R29): данные цели, язык, телефон, согласия, выгрузка данных, удаление аккаунта.
import type { RouteObject } from 'react-router-dom';
import type { NavItem } from '../../../app/routes.tsx';
import { ProfilePage } from './ProfilePage.tsx';

export const routes: RouteObject[] = [{ path: 'profile', element: <ProfilePage /> }];

export const nav: NavItem[] = [{ to: '/profile', labelKey: 'profile.nav.profile', order: 80 }];
