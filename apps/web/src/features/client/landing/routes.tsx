// Лендинг: румынская версия и страница «Политика и согласия». Русская главная `/` остаётся за `features/client/home`
// (там HomePage ветвится через HomeGate). Код страниц грузится лениво и в начальный набор не входит.
import type { RouteObject } from 'react-router-dom';
import { LegalGate, RoGate } from './LandingGate.tsx';

export const routes: RouteObject[] = [
  { path: 'ro', element: <RoGate /> },
  { path: 'legal', element: <LegalGate /> },
  { path: 'ro/legal', element: <LegalGate /> },
];
