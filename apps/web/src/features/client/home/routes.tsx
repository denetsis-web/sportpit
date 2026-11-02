// Главная страница клиента (корень сайта): карточки-ссылки на разделы. Маршрут `index` главнее
// запасного приветствия оболочки (app/pages.tsx).
import type { RouteObject } from 'react-router-dom';
import { HomePage } from './HomePage.tsx';

export const routes: RouteObject[] = [{ index: true, element: <HomePage /> }];
