import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'shared',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // glob-импорты вычисляются при трансформации: кэш скрыл бы новые пространства словарей
    fsModuleCache: false,
  },
});
