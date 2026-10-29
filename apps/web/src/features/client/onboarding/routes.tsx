// Анкета цели (R16): отдельный экран /onboarding; из профиля к нему ведёт «Заполнить анкету».
import type { RouteObject } from 'react-router-dom';
import { OnboardingPage } from './OnboardingPage.tsx';

export const routes: RouteObject[] = [{ path: 'onboarding', element: <OnboardingPage /> }];
