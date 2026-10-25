// Автообнаружение клиентских функций: любой src/features/**/routes.tsx, кроме админки
// (админка грузится отдельным чанком, см. admin/AdminEntry.tsx).
import type { FeatureRoutesModule } from './routes.tsx';

export const clientModules = import.meta.glob<FeatureRoutesModule>(
  ['../features/**/routes.tsx', '!../features/admin/**'],
  { eager: true },
);
