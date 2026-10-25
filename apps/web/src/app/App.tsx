import { lazy, Suspense, useState, type ReactNode } from 'react';
import {
  createBrowserRouter,
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom';
import { clientModules } from './modules.ts';
import { I18nProvider, useT } from './i18n.tsx';
import { HomePage, NotFoundPage } from './pages.tsx';
import { collectFeatures, type FeatureRoutesModule } from './routes.tsx';
import { Shell } from './Shell.tsx';
import { ThemeProvider } from './theme.tsx';

// Админка — отдельный чанк: клиентам он не загружается.
const AdminEntry = lazy(() => import('./admin/AdminEntry.tsx'));

function AdminLoading() {
  const t = useT();
  return <p role="status">{t('core.loading')}</p>;
}

export interface AppRoutesOptions {
  /** Функции клиента (по умолчанию — найденные по src/features/**\/routes.tsx). */
  clientModules?: Record<string, FeatureRoutesModule>;
  /** Модули админки (по умолчанию — найденные по src/features/admin/**\/routes.tsx). */
  adminModules?: Record<string, FeatureRoutesModule>;
}

/** Таблица маршрутов оболочки: функции клиента, `/admin/*`, приветствие на корне, 404. */
export function createAppRoutes(options: AppRoutesOptions = {}): RouteObject[] {
  const { routes, nav } = collectFeatures(options.clientModules ?? clientModules);
  return [
    {
      element: <Shell nav={nav} />,
      children: [
        ...routes,
        {
          path: 'admin/*',
          element: (
            <Suspense fallback={<AdminLoading />}>
              <AdminEntry {...(options.adminModules ? { modules: options.adminModules } : {})} />
            </Suspense>
          ),
        },
        { index: true, element: <HomePage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </I18nProvider>
  );
}

export interface AppProps extends AppRoutesOptions {
  /** Тесты и превью: маршрутизатор в памяти с заданными адресами. */
  initialEntries?: string[];
}

export function App({ initialEntries, ...options }: AppProps) {
  // Маршрутизатор создаётся один раз на всё время жизни приложения.
  const [router] = useState(() => {
    const routes = createAppRoutes(options);
    return initialEntries
      ? createMemoryRouter(routes, { initialEntries })
      : createBrowserRouter(routes);
  });
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
