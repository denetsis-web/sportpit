import { describe, expect, it } from 'vitest';
import {
  filterNavByRole,
  sortNav,
  type AdminNavItem,
} from '../../src/features/admin/shell/menu.ts';
import { nav as dishes } from '../../src/features/admin/dishes/routes.tsx';
import { nav as fridges } from '../../src/features/admin/fridges/routes.tsx';
import { nav as gyms } from '../../src/features/admin/gyms/routes.tsx';
import { nav as menu } from '../../src/features/admin/menu/routes.tsx';
import { nav as settings } from '../../src/features/admin/settings/routes.tsx';
import { nav as clientMenu } from '../../src/features/client/menu/routes.tsx';

const items: AdminNavItem[] = [...gyms, ...fridges, ...dishes, ...menu, ...settings];

describe('пункты меню админки каталога', () => {
  it('администратор видит все пять разделов в порядке: блюда, меню, залы, холодильники, настройки', () => {
    expect(sortNav(filterNavByRole(items, 'admin')).map((i) => i.to)).toEqual([
      '/admin/dishes',
      '/admin/menu',
      '/admin/gyms',
      '/admin/fridges',
      '/admin/settings',
    ]);
  });

  it('кухня, оператор и клиент не видят ни одного из них', () => {
    for (const role of ['kitchen', 'operator', 'client'] as const) {
      expect(filterNavByRole(items, role), role).toEqual([]);
    }
  });

  it('у каждого пункта есть подпись в словаре админки, а клиентское меню ведёт на /menu', () => {
    expect(items.every((i) => i.labelKey.startsWith('admin.nav.'))).toBe(true);
    expect(clientMenu).toEqual([{ to: '/menu', labelKey: 'catalog.nav.menu', order: 10 }]);
  });
});
