// Словари billing: каждый ключ, который использует код, существует на RU и RO;
// в текстах нет обещаний автопродления (R05, R27, R49).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ro from '../../../../packages/shared/src/i18n/billing/ro.ts';
import ru from '../../../../packages/shared/src/i18n/billing/ru.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SOURCES = [
  'apps/server/src/modules/billing',
  'apps/web/src/features/client/packages',
  'apps/web/src/features/client/payment',
  'apps/web/src/features/admin/packages',
  'apps/web/src/features/admin/promos',
  'apps/web/src/features/admin/refunds',
  'packages/shared/src/schemas/billing.ts',
];

function files(path: string): string[] {
  const full = join(root, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

const code = SOURCES.flatMap(files)
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

describe('словарь billing', () => {
  it('ключи ru и ro совпадают', () => {
    expect(Object.keys(ro).sort()).toEqual(Object.keys(ru).sort());
  });

  it('все ключи billing.*, упомянутые в коде, заведены в словаре', () => {
    const literal = [...code.matchAll(/'billing\.([A-Za-z0-9_.]+)'/g)].map((m) => m[1]!);
    expect(literal.length).toBeGreaterThan(40);
    const missing = literal.filter((key) => !(key in ru));
    expect(missing).toEqual([]);
  });

  it('ключи, собираемые из шаблонов `billing.…${x}`, покрыты всеми значениями', () => {
    const expectations: Array<[string, string[]]> = [
      ['billing.status.', ['pending', 'paid', 'failed']],
      ['billing.pay.failed.', ['declined', 'cancelled', 'expired', 'error']],
      ['billing.method.', ['card', 'mia']],
      ['billing.admin.promos.kind.', ['percent', 'fixed', 'free_credits']],
      ['billing.admin.promos.value.', ['percent', 'fixed', 'free_credits']],
      ['billing.admin.promos.valueShort.', ['percent', 'fixed', 'free_credits']],
      ['billing.admin.refunds.status.', ['pending', 'done', 'failed']],
    ];
    for (const [prefix, values] of expectations) {
      expect(code, prefix).toContain(prefix);
      for (const value of values) {
        expect(`${prefix.slice('billing.'.length)}${value}` in ru, `${prefix}${value}`).toBe(true);
      }
    }
  });

  it('в текстах нет автопродления и подписки с автосписанием', () => {
    const all = [...Object.values(ru), ...Object.values(ro)].join('\n').toLowerCase();
    for (const bad of [
      'подписка продлевается',
      'автопродлен',
      'автосписан',
      'abonamentul se reînnoiește',
      'reînnoire automată',
    ]) {
      expect(all, bad).not.toContain(bad);
    }
  });
});
