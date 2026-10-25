import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../../app/i18n.tsx';
import { useSession } from '../auth/session.ts';
import './notifications.css';
import { refreshNotifications, resetNotifications, useNotifications } from './store.ts';

const POLL_MS = 60_000;

/**
 * Колокольчик со счётчиком непрочитанных. Ведёт к списку /notifications.
 * Показывается только вошедшему; раз в минуту и при возврате на вкладку спрашивает сервер.
 * Подключается в шапку оболочки (см. Shell).
 */
export function NotificationsBell() {
  const t = useT();
  const { user } = useSession();
  const { unreadCount } = useNotifications();
  const signedIn = user !== null;

  useEffect(() => {
    if (!signedIn) {
      resetNotifications();
      return;
    }
    void refreshNotifications();
    const timer = setInterval(() => void refreshNotifications(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshNotifications();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn]);

  if (!signedIn) return null;
  const label =
    unreadCount > 0
      ? t('notifications.bell.labelUnread', { count: unreadCount })
      : t('notifications.bell.label');
  return (
    <Link to="/notifications" className="bell" aria-label={label}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <path
          d="M12 3a6 6 0 0 0-6 6v3.5L4 16v1h16v-1l-2-3.5V9a6 6 0 0 0-6-6zm-2 15a2 2 0 0 0 4 0z"
          fill="currentColor"
        />
      </svg>
      {unreadCount > 0 ? (
        <span className="bell__badge" aria-hidden="true">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
