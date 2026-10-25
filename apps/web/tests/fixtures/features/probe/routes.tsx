// Тестовая функция клиента: подхватывается оболочкой без правки общих файлов.
import type { RouteObject } from 'react-router-dom';
import { useT } from '../../../../src/app/i18n.tsx';
import type { NavItem } from '../../../../src/app/routes.tsx';

function ProbePage() {
  const t = useT();
  return <h1>{t('probe.title')}</h1>;
}

export const routes: RouteObject[] = [{ path: 'probe', element: <ProbePage /> }];
export const nav: NavItem[] = [{ to: '/probe', labelKey: 'probe.nav', order: 5 }];
