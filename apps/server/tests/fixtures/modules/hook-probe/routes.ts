// Тестовый модуль с собственным хуком: он не должен действовать на маршруты других модулей.
// Имя папки идёт раньше «probe» по алфавиту, поэтому при общем контексте хук задел бы чужие маршруты.
import type { AppDeps, AppInstance } from '../../../../src/app.ts';

export function registerRoutes(app: AppInstance, _deps: AppDeps): void {
  app.addHook('onRequest', async (_req, reply) => {
    reply.header('x-hook-probe', 'applied');
  });
  app.get('/hook-probe/ping', async () => ({ pong: true }));
}
