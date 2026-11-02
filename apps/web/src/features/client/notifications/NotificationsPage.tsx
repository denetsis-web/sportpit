import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { NotificationDto } from '@sportpit/shared/schemas/notifications';
import { hasKey } from '@sportpit/shared/i18n';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button } from '../../../ui/index.ts';
import { RequireRole } from '../auth/guards.tsx';
import './notifications.css';
import { markAllRead, markRead, refreshNotifications, useNotifications } from './store.ts';

/** Ссылка из данных уведомления: только путь внутри приложения, наружу не ведём. */
function internalLink(payload: NotificationDto['payload']): string | null {
  const link = payload.link;
  return typeof link === 'string' && link.startsWith('/') && !link.startsWith('//') ? link : null;
}

function NotificationCard({ item }: { item: NotificationDto }) {
  const { t, dateTime } = useI18n();
  const unread = item.readAt === null;
  const link = internalLink(item.payload);
  const kindKey = `notifications.alert.kind.${String(item.payload.kind ?? '')}`;
  const params = {
    count: String(item.payload.count ?? ''),
    kind: hasKey(kindKey) ? t(kindKey) : String(item.payload.kind ?? ''),
  };
  const titleId = `notification-${item.id}`;
  return (
    <article
      className={`ui-card notification${unread ? ' notification--unread' : ''}`}
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="notification__title">
        {t(`notifications.type.${item.type}.title`)}
        {unread ? <span className="notification__new">{t('notifications.unread')}</span> : null}
      </h2>
      <p>{t(`notifications.type.${item.type}.body`, params)}</p>
      {item.type === 'complaint_resolved' &&
      typeof item.payload.text === 'string' &&
      item.payload.text !== '' ? (
        <p className="notification__text">{item.payload.text}</p>
      ) : null}
      {item.type === 'credits_expiring' && item.payload.count !== undefined ? (
        <p>{t('notifications.type.credits_expiring.detail', params)}</p>
      ) : null}
      <p className="notification__time">
        <time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time>
      </p>
      <div className="notification__actions">
        {link ? (
          <Link
            className="ui-button ui-button--primary"
            to={link}
            onClick={() => void markRead(item.id)}
          >
            {t('notifications.open')}
          </Link>
        ) : null}
        {unread ? (
          <Button variant="secondary" onClick={() => void markRead(item.id)}>
            {t('notifications.markRead')}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function NotificationsList() {
  const { t } = useI18n();
  const { status, items, unreadCount } = useNotifications();
  useEffect(() => {
    void refreshNotifications();
  }, []);
  return (
    <>
      <h1>{t('notifications.title')}</h1>
      {status === 'error' ? (
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={() => void refreshNotifications()}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {t('notifications.loadError')}
        </Banner>
      ) : null}
      {status === 'ready' && items.length === 0 ? <p>{t('notifications.empty')}</p> : null}
      {items.length > 0 ? (
        <div className="notification__toolbar">
          <p role="status">{t('notifications.unread.summary', { count: unreadCount })}</p>
          {unreadCount > 0 ? (
            <Button variant="secondary" onClick={() => void markAllRead()}>
              {t('notifications.markAll')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {items.map((item) => (
        <NotificationCard key={item.id} item={item} />
      ))}
    </>
  );
}

export function NotificationsPage() {
  return (
    <RequireRole>
      <NotificationsList />
    </RequireRole>
  );
}
