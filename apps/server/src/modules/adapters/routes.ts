import type { AppDeps, AppInstance } from '../../app.ts';
import { errors } from '../system/errors.ts';
import { assertValidKey } from './storage.ts';

/** GET /api/v1/files/<ключ> — отдаёт файл из FileStorage (фото блюд и жалоб). */
export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  app.get('/files/*', async (req, reply) => {
    const key = (req.params as { '*': string })['*'];
    try {
      assertValidKey(key);
    } catch {
      throw errors.notFound();
    }
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
