// Какие разделы админки видит какая роль. Это отражение для интерфейса: настоящую проверку
// делает сервер (requireRole), чужой запрос получит 403 в любом случае.
import type { Role } from '@sportpit/shared/types';
import type { NavItem } from '../../../app/routes.tsx';

/** Пункт меню админки. `roles` — кому показывать; не задано — по первой части пути (см. ниже). */
export interface AdminNavItem extends NavItem {
  roles?: readonly Role[];
}

/**
 * Роли по умолчанию, по первой части пути после /admin: кухня (сводка, этикетки) и оператор выдачи.
 * Всё остальное — только администратору. Другой набор ролей функция задаёт полем `roles` у своего пункта.
 */
export const DEFAULT_SECTION_ROLES: Readonly<Record<string, readonly Role[]>> = {
  kitchen: ['kitchen', 'admin'],
  operator: ['operator', 'admin'],
};

const ADMIN_ONLY: readonly Role[] = ['admin'];

export function sectionOf(to: string): string {
  return to.replace(/^\/admin\/?/, '').split(/[/?#]/)[0] ?? '';
}

export function rolesFor(item: AdminNavItem): readonly Role[] {
  return item.roles ?? DEFAULT_SECTION_ROLES[sectionOf(item.to)] ?? ADMIN_ONLY;
}

export function filterNavByRole<T extends AdminNavItem>(items: readonly T[], role: Role): T[] {
  return items.filter((item) => rolesFor(item).includes(role));
}

export function sortNav<T extends AdminNavItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}
