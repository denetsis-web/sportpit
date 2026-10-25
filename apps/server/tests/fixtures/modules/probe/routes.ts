// Тестовый модуль: подхватывается каркасом без правки общих файлов.
import { z } from 'zod';
import type { AppDeps, AppInstance } from '../../../../src/app.ts';
import { AppError, errors } from '../../../../src/modules/system/index.ts';

export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  app.get('/probe/hello', async () => ({
    hello: 'мир',
    smsProvider: deps.sms.provider,
    today: deps.clock.localDate(),
  }));

  app.post('/probe/echo', async (req) => ({ got: req.body }));

  app.post('/probe/sms', async () => {
    await deps.sms.send({ to: '+37360123456', text: 'Код 123456' });
    return { sent: true };
  });

  app.get('/probe/denied', async () => {
    throw new AppError(403, 'probe_denied', 'probe.denied');
  });
  app.get('/probe/forbidden', async () => {
    throw errors.forbidden();
  });
  app.get('/probe/slow-down', async () => {
    throw errors.rateLimited(30);
  });
  app.get('/probe/boom', async () => {
    throw new Error('внутренний сбой с деталями, которых клиенту видеть нельзя');
  });
  app.post('/probe/validate', async (req) => {
    return z.object({ phone: z.string().regex(/^\+373\d{8}$/, 'probe.badPhone') }).parse(req.body);
  });

  app.post('/webhooks/probe', async () => ({ received: true }));
}
