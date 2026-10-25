// Сборка маршрутов из модулей функций. Каждая функция кладёт `routes.tsx` в свою папку
// (src/features/client/<имя>/ или src/features/admin/<имя>/) и экспортирует:
//   export const routes: RouteObject[]   — маршруты (пути клиента — от корня сайта, админки — от /admin)
//   export const nav: NavItem[]          — необязательно: пункты нижнего меню (клиент) или меню админки
// Оболочка находит такие файлы сама (см. modules.ts), общие файлы править не нужно.
import type { RouteObject } from 'react-router-dom';

export interface NavItem {
  /** Адрес ссылки: у клиента от корня сайта (`/menu`), у админки полный (`/admin/kitchen`). */
  to: string;
  /** Ключ словаря с подписью: `<пространство>.<ключ>`. */
  labelKey: string;
  /** Порядок в меню: меньше — левее. По умолчанию 100. */
  order?: number;
}

export interface FeatureRoutesModule {
  routes?: RouteObject[];
  nav?: NavItem[];
}

export interface CollectedFeatures {
  routes: RouteObject[];
  nav: NavItem[];
}

function routeKey(route: RouteObject): string | null {
  if (route.index) return '(index)';
  return route.path ?? null;
}

/**
 * Собирает маршруты и пункты меню из набора модулей `{ путь_к_файлу: модуль }`.
 * Порядок не зависит от порядка загрузки: модули сортируются по пути к файлу.
 * Один и тот же путь в двух модулях — ошибка интеграции, о ней сообщаем сразу.
 */
export function collectFeatures(modules: Record<string, FeatureRoutesModule>): CollectedFeatures {
  const routes: RouteObject[] = [];
  const nav: NavItem[] = [];
  const owners = new Map<string, string>();
  for (const file of Object.keys(modules).sort()) {
    const mod = modules[file]!;
    for (const route of mod.routes ?? []) {
      const key = routeKey(route);
      if (key !== null) {
        const owner = owners.get(key);
        if (owner) throw new Error(`Маршрут «${key}» объявлен дважды: ${owner} и ${file}`);
        owners.set(key, file);
      }
      routes.push(route);
    }
    nav.push(...(mod.nav ?? []));
  }
  nav.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  return { routes, nav };
}
