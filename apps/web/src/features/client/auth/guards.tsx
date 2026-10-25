import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@sportpit/shared/types';
import { useT } from '../../../app/i18n.tsx';
import { NoAccessPage } from '../../../app/pages.tsx';
import { useSession } from './session.ts';

export interface RequireRoleProps {
  /** Допустимые роли. Не заданы — достаточно войти. */
  roles?: readonly Role[];
  children: ReactNode;
}

/**
 * Страница только для вошедших (и, если указаны, только для этих ролей).
 * Без входа ведёт на /login и после входа возвращает обратно; с чужой ролью показывает «Нет доступа».
 * Это лишь отражение: права по-настоящему проверяет сервер (403).
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { status, user } = useSession();
  const location = useLocation();
  const t = useT();
  if (status === 'loading') return <p role="status">{t('auth.account.loading')}</p>;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (roles && roles.length > 0 && !roles.includes(user.role)) return <NoAccessPage />;
  return <>{children}</>;
}
