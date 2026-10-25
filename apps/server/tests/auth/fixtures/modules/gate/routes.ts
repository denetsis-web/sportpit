// Тестовый модуль: закрытые маршруты за requireRole / requireFridgeAccess / requireConsent.
// Так другие модули ставят проверки на свои маршруты.
import type { AppDeps, AppInstance } from '../../../../../src/app.ts';
import {
  assertFridgeAccess,
  requireConsent,
  requireFridgeAccess,
  requireRole,
} from '../../../../../src/modules/auth/index.ts';

export function registerRoutes(app: AppInstance, _deps: AppDeps): void {
  app.get('/gate/any', { preHandler: requireRole() }, async () => ({ ok: true }));
  app.get('/gate/admin', { preHandler: requireRole('admin') }, async () => ({ ok: true }));
  app.get('/gate/staff', { preHandler: requireRole('kitchen', 'operator') }, async () => ({
    ok: true,
  }));
  app.post(
    '/gate/fridges/:fridgeId/load',
    {
      preHandler: [
        requireRole('operator', 'admin'),
        requireFridgeAccess((req) => (req.params as { fridgeId: string }).fridgeId),
      ],
    },
    async () => ({ loaded: true }),
  );
  app.post('/gate/by-body', { preHandler: requireRole('operator', 'admin') }, async (req) => {
    assertFridgeAccess(req, (req.body as { fridgeId: string }).fridgeId);
    return { loaded: true };
  });
  app.get('/gate/fixed-fridge', { preHandler: requireFridgeAccess(7) }, async () => ({ ok: true }));
  app.post('/gate/profile', { preHandler: requireConsent('health_data') }, async () => ({
    saved: true,
  }));
}
