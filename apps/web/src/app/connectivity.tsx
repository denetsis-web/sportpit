// Состояние сети: браузер сообщает «онлайн/офлайн», а клиент API — удалось ли достучаться до сервера.
import { useSyncExternalStore } from 'react';
import { subscribeNetworkStatus, getNetworkStatus } from '../api/index.ts';
import { Banner } from '../ui/index.ts';
import { useT } from './i18n.tsx';

function subscribeBrowser(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  const unsubscribeApi = subscribeNetworkStatus(callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
    unsubscribeApi();
  };
}

/** Есть ли связь: браузер онлайн и последний запрос к серверу не провалился по сети. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeBrowser,
    () => navigator.onLine && getNetworkStatus() !== 'unreachable',
    () => true,
  );
}

/** Баннер «Нет связи»: показывается, пока связи нет; меню и оболочка при этом открываются из кэша. */
export function OfflineBanner() {
  const online = useOnline();
  const t = useT();
  if (online) return null;
  return (
    <Banner variant="warning" role="status">
      {t('core.offline.banner')}
    </Banner>
  );
}
