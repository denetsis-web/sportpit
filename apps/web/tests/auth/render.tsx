import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AppProviders } from '../../src/app/App.tsx';
import type { FeatureRoutesModule } from '../../src/app/routes.tsx';
import { resetSession } from '../../src/features/client/auth/session.ts';
import { registerRealDictionaries, renderApp, setStoredLang } from '../helpers.tsx';

// Настоящие функции этого таска, подключённые так же, как это делает оболочка.
export const clientModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/client/{auth,notifications}/routes.tsx'],
  { eager: true },
);
export const adminModules = import.meta.glob<FeatureRoutesModule>(
  ['../../src/features/admin/shell/routes.tsx'],
  { eager: true },
);

export function renderAt(path: string, lang: 'ru' | 'ro' = 'ru') {
  return renderApp({ initialEntries: [path], clientModules, adminModules }, { lang });
}

/** Отдельный компонент внутри провайдеров и маршрутизатора (без оболочки приложения). */
export function renderComponent(ui: ReactElement, path = '/', lang: 'ru' | 'ro' = 'ru') {
  registerRealDictionaries();
  setStoredLang(lang);
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </AppProviders>,
  );
}

export function cleanUp(): void {
  vi.unstubAllGlobals();
  resetSession();
}
