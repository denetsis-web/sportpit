import { defineConfig } from 'vitest/config';

// Каждый пакет описывает свой проект тестов: у сервера и общего пакета среда node,
// у клиента jsdom (настройка лежит в apps/web/vite.config.ts).
export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/server', 'apps/web'],
    // Три проекта делят процессор: вдвое меньше воркеров — тесты jsdom не упираются в таймауты от нехватки ядер
    maxWorkers: '50%',
  },
});
