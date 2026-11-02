import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENV_VARIABLES } from '../src/modules/system/config.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const envExample = readFileSync(join(root, '.env.example'), 'utf8');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const configSource = readFileSync(
  join(root, 'apps', 'server', 'src', 'modules', 'system', 'config.ts'),
  'utf8',
);

const assignments = envExample
  .split(/\r?\n/)
  .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));

describe('.env.example: только имена, значений нет', () => {
  it('каждая строка — ИМЯ= с пустым значением', () => {
    expect(assignments.length).toBeGreaterThan(0);
    for (const line of assignments) expect(line, line).toMatch(/^[A-Z][A-Z0-9_]*=$/);
  });

  it('содержит все переменные, которые читает конфигурация, без повторов', () => {
    const names = assignments.map((line) => line.slice(0, -1));
    for (const name of ENV_VARIABLES) expect(names, name).toContain(name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('README.md описывает установку, запуск, переменные и проверку', () => {
  it('перечисляет каждую переменную окружения конфигурации', () => {
    for (const name of ENV_VARIABLES) expect(readme, name).toContain(`\`${name}\``);
  });

  it.each([
    'npm install',
    'npm run dev',
    'npm run check',
    'npm run seed',
    'npm run create-user',
    'npm run backup',
    '.env.example',
  ])('упоминает «%s»', (phrase) => {
    expect(readme).toContain(phrase);
  });
});

describe('безопасный запуск в production описан везде, где его ищет владелец (F1.1)', () => {
  it('флаг ALLOW_STUB_IN_PRODUCTION описан в config.ts, .env.example и README', () => {
    expect(configSource).toContain('ALLOW_STUB_IN_PRODUCTION');
    expect(envExample).toMatch(/^# .*ALLOW_STUB_IN_PRODUCTION|ALLOW_STUB_IN_PRODUCTION=/m);
    expect(envExample).toContain('ALLOW_STUB_IN_PRODUCTION=');
    expect(readme).toContain('ALLOW_STUB_IN_PRODUCTION=1');
  });

  it('README говорит, что сервер отказывается стартовать, и называет все три причины', () => {
    expect(readme).toMatch(/не стартует/);
    for (const needle of [
      'PAYMENT_PROVIDER',
      'SMS_PROVIDER',
      'https://',
      'SESSION_SECRET',
      'TRUST_PROXY',
    ]) {
      expect(readme, needle).toContain(needle);
    }
  });

  it('README: HOST по умолчанию 127.0.0.1 и для боевого запуска задаётся явно', () => {
    expect(readme).toMatch(/`HOST`[^\n]*127\.0\.0\.1[^\n]*явно/);
  });
});
