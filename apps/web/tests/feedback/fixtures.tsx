// Подключение функций таска 09 (оценки, поддержка, трекер, жалобы в админке) для тестов экранов.
import type { FeatureRoutesModule } from '../../src/app/routes.tsx';
import { renderApp } from '../helpers.tsx';
import { cleanUp } from '../auth/render.tsx';
import { adminUser } from '../admin-catalog/fake.ts';

export { cleanUp };
export { installFake } from '../admin-catalog/fake.ts';

export const clientModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/client/{auth,feedback,support,tracker}/routes.tsx'],
  { eager: true },
);
export const adminModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/admin/{shell,complaints}/routes.tsx'],
  { eager: true },
);

export function renderAt(path: string, lang: 'ru' | 'ro' = 'ru') {
  return renderApp({ initialEntries: [path], clientModules, adminModules }, { lang });
}

export const asClient = { 'GET /auth/me': () => ({ body: { user: adminUser('client') } }) };
export const asAdmin = { 'GET /auth/me': () => ({ body: { user: adminUser('admin') } }) };
