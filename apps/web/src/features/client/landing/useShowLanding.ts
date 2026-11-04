// Единственное место решения «лендинг или приложение». Им пользуются оболочка (Shell), главная и маршруты лендинга.
// Лендинг показываем на его адресах, когда сессия готова, пользователя нет и приложение открыто в браузере
// (в установленном PWA гость видит прежнюю главную: вход и меню).
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Lang } from '@sportpit/shared/i18n';
import { isStandalone } from '../../../app/install.tsx';
import { getSession, refreshSession, useSession } from '../auth/session.ts';

export type LandingKind = 'home' | 'legal';

const PATHS: Record<string, { kind: LandingKind; lang: Lang }> = {
  '/': { kind: 'home', lang: 'ru' },
  '/ro': { kind: 'home', lang: 'ro' },
  '/legal': { kind: 'legal', lang: 'ru' },
  '/ro/legal': { kind: 'legal', lang: 'ro' },
};

/** Адрес страницы лендинга нужного вида и языка. */
export function landingPath(kind: LandingKind, lang: Lang): string {
  if (kind === 'home') return lang === 'ro' ? '/ro' : '/';
  return lang === 'ro' ? '/ro/legal' : '/legal';
}

/** Страница лендинга по адресу (`null` — это адрес приложения). */
export function parseLandingPath(pathname: string): { kind: LandingKind; lang: Lang } | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PATHS[clean] ?? null;
}

export interface ShowLanding {
  showLanding: boolean;
  /** Вход ещё проверяется: ни лендинг, ни шапку приложения показывать нельзя. */
  pending: boolean;
}

export function useShowLanding(): ShowLanding {
  const { pathname } = useLocation();
  const { status, user } = useSession();
  const [failed, setFailed] = useState(false);

  // Ошибка проверки входа (не сбой сети) оставила бы сессию в «loading» навсегда: считаем человека гостем.
  useEffect(() => {
    if (getSession().status === 'loading') refreshSession().catch(() => setFailed(true));
  }, []);

  if (!parseLandingPath(pathname)) return { showLanding: false, pending: false };
  // Установленное приложение лендинг не показывает никому: ждать ответа о входе незачем.
  if (isStandalone()) return { showLanding: false, pending: false };
  const ready = status === 'ready' || failed;
  if (!ready) return { showLanding: false, pending: true };
  return { showLanding: !user, pending: false };
}
