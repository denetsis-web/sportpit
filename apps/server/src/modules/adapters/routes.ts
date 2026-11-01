import type { AppDeps, AppInstance } from '../../app.ts';
import { errors } from '../system/errors.ts';
import { assertValidKey } from './storage.ts';

/** Ключи с этим префиксом (фото жалоб) приватные: их отдаёт только модуль-владелец с проверкой прав (правило 13). */
const PRIVATE_PREFIXES = ['complaints/'];

/** GET /api/v1/files/<ключ> — отдаёт публичный файл из FileStorage (фото блюд). */
export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  app.get('/files/*', async (req, reply) => {
    const key = (req.params as { '*': string })['*'];
    try {
      assertValidKey(key);
    } catch {
      throw errors.notFound();
    }
    if (PRIVATE_PREFIXES.some((prefix) => key.toLowerCase().startsWith(prefix))) throw errors.notFound();
    const file = await deps.storage.get(key);
    if (!file) throw errors.notFound();
    const inline = file.contentType.startsWith('image/');
    return reply
      .header('content-type', file.contentType)
      .header('cache-control', 'private, max-age=3600')
      .header('content-disposition', inline ? 'inline' : 'attachment')
      .send(Buffer.from(file.data));
  });
}
