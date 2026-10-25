import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // модули подхватываются обходом папок: кэш не должен прятать новые файлы
    fsModuleCache: false,
  },
});
