// Логика команды `npm run create-user -- --phone +373XXXXXXXX --role admin`.
// Отдельно от scripts/create-user.ts, чтобы проверяться тестами. Секреты не читаются и не печатаются.
import { PHONE_PATTERN } from '@sportpit/shared/schemas/auth';
import { ROLES } from '@sportpit/shared/types';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { isRole, upsertUserWithRole } from './users.ts';

export interface CreateUserContext {
  db: Db;
  clock: Clock;
  out: (line: string) => void;
  err: (line: string) => void;
}

function readOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

/** Возвращает код выхода процесса: 0 — готово, 1 — неверные аргументы. */
export function runCreateUser(argv: string[], { db, clock, out, err }: CreateUserContext): number {
  const phone = readOption(argv, 'phone')?.replace(/[\s().-]/g, '');
  const role = readOption(argv, 'role') ?? 'client';
  if (!phone || !PHONE_PATTERN.test(phone)) {
    err('Укажите номер: --phone +373XXXXXXXX');
    return 1;
  }
  if (!isRole(role)) {
    err(`Роль должна быть одной из: ${ROLES.join(', ')}`);
    return 1;
  }
  const { user, created } = upsertUserWithRole(db, clock, phone, role);
  out(
    created
      ? `Пользователь создан: ${user.phone}, роль ${user.role}, номер в базе ${user.id}.`
      : `Пользователь уже был: ${user.phone}, роль теперь ${user.role}, номер в базе ${user.id}.`,
  );
  if (role === 'operator') {
    out('Холодильники оператору назначаются в админке.');
  }
  out(
    'Войдите в приложение по этому номеру: код придёт по SMS (в разработке — в консоль сервера).',
  );
  return 0;
}
