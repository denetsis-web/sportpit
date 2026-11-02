import type { AppDeps, AppInstance } from '../../app.ts';
import { errors } from '../system/errors.ts';
import { assertValidKey } from './storage.ts';

/**
 * Публичны только перечисленные префиксы (фото блюд). Всё остальное, в том числе фото жалоб (`complaints/`)
 * и любые будущие приватные ключи, отсюда не отдаётся: их выдаёт модуль-владелец с проверкой прав (правило 13).
 * Регистр важен: `Dishes/` — не публичный префикс.
 */
const PUBLIC_PREFIXES = ['dishes/'];

/** GET /api/v1/files/<ключ> — отдаёт публичный файл из FileStorage (фото блюд). */
export function registerRoutes(app: AppInstance, deps: AppDeps): void {
  app.get('/files/*', async (req, reply) => {
    const key = (req.params as { '*': string })['*'];
    try {
      assertValidKey(key);
    } catch {
      throw errors.notFound();
    }
    if (!PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix))) throw errors.notFound();
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
