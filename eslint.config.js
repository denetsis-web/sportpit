import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Буквы кириллицы, латиницы и румынские диакритики: любой «живой» текст в разметке.
const LETTER = '[A-Za-zА-Яа-яЁёĂÂÎȘȚăâîșț]';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.d.ts',
      'data/**',
      'uploads/**',
      '.autopilot/**',
      '.claude/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Секреты и настройки читаются только в конфигурации (modules/system/config.ts).
    files: ['apps/server/src/**/*.ts', 'packages/shared/src/**/*.ts', 'scripts/**/*.ts'],
    ignores: ['apps/server/src/modules/system/config.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Переменные окружения читаются только в apps/server/src/modules/system/config.ts: берите значение из deps.config.',
        },
      ],
    },
  },
  {
    // Тексты интерфейса — только через словарь (правило проекта 6): в разметке компонентов букв нет.
    files: ['apps/web/src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `JSXText[value=/${LETTER}/]`,
          message:
            'Текст не пишется в компоненте: заведите ключ в словаре и берите t(...) из useT().',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(aria-label|title|placeholder|alt|label)$/] > Literal',
          message: 'Подпись не пишется в компоненте: берите её из словаря через t(...).',
        },
      ],
    },
  },
);
