// Публичные данные для лендинга: меню ближайшего дня, пакеты, контакты. Всё без входа; схемы ответов — общие с сервером.
import { publicSettingsSchema } from '@sportpit/shared/schemas/admin';
import { packagesResponseSchema } from '@sportpit/shared/schemas/billing';
import { menuSchema } from '@sportpit/shared/schemas/catalog';
import { api } from '../../../api/index.ts';

/** Меню на завтра (без даты сервер отдаёт ближайший день предзаказа). */
export const fetchMenu = () => api.get('/menu', { schema: menuSchema });
export const fetchPackages = () => api.get('/packages', { schema: packagesResponseSchema });
export const fetchPublicSettings = () =>
  api.get('/settings/public', { schema: publicSettingsSchema });
