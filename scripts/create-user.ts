// npm run create-user -- --phone +373XXXXXXXX --role admin
// Заглушка: создание пользователя появится вместе с модулем auth (таск 02).
import { ROLES } from '@sportpit/shared/types';

const args = process.argv.slice(2);
const read = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const phone = read('phone');
const role = read('role') ?? 'client';

if (!phone || !/^\+373\d{8}$/.test(phone)) {
  console.error('Укажите номер: --phone +373XXXXXXXX');
  process.exit(1);
}
if (!(ROLES as readonly string[]).includes(role)) {
  console.error(`Роль должна быть одной из: ${ROLES.join(', ')}`);
  process.exit(1);
}
console.log('create-user: создание пользователей появится в таске 02 (auth). Ничего не изменено.');
