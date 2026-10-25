// Подсказка «Установить на экран Домой».
// Android/Chrome: ловим beforeinstallprompt и показываем кнопку «Установить».
// iOS Safari: такого события нет, показываем текстовую подсказку («Поделиться» → «На экран Домой»).
// Подсказка показывается один раз и только после того, как приложение её запросит
// (`useInstall().request()` — например, после первого успешного заказа).
import { useSyncExternalStore } from 'react';
import { Banner, Button } from '../ui/index.ts';
import { useT } from './i18n.tsx';
import { readStored, writeStored } from './storage.ts';

export const INSTALL_SHOWN_KEY = 'sportpit.install.shown';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallPlatform = 'android' | 'ios' | 'none';

interface NavigatorLike {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
}

/** iOS Safari в браузере (не в установленном приложении): подсказка нужна. */
export function isIosSafari(nav: NavigatorLike): boolean {
  const ua = nav.userAgent;
  const iosDevice =
    /iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(ua);
  return iosDevice && safari;
}

export function isStandalone(): boolean {
  const nav = window.navigator as NavigatorLike;
  return (
    nav.standalone === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches)
  );
}

interface InstallState {
  deferred: BeforeInstallPromptEvent | null;
  requested: boolean;
  visible: boolean;
}

let state: InstallState = { deferred: null, requested: false, visible: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<InstallState>) => {
  state = { ...state, ...patch };
  emit();
};

function platform(): InstallPlatform {
  if (isStandalone()) return 'none';
  if (state.deferred) return 'android';
  if (isIosSafari(window.navigator as NavigatorLike)) return 'ios';
  return 'none';
}

// Событие может прийти до того, как React смонтирует дерево, поэтому слушаем сразу при загрузке модуля.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    set({ deferred: event as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => set({ deferred: null, visible: false }));
}

/** Только для тестов: сбрасывает состояние между сценариями. */
export function resetInstallStore(): void {
  state = { deferred: null, requested: false, visible: false };
  emit();
}

/** Запросить показ подсказки; сработает один раз за всё время и не в установленном приложении. */
function request(): void {
  if (state.visible || readStored(INSTALL_SHOWN_KEY) !== null) return;
  if (platform() === 'none') return;
  writeStored(INSTALL_SHOWN_KEY, '1');
  set({ requested: true, visible: true });
}

function dismiss(): void {
  set({ visible: false });
}

async function install(): Promise<void> {
  const event = state.deferred;
  if (!event) return;
  await event.prompt();
  await event.userChoice;
  set({ deferred: null, visible: false });
}

export function useInstall() {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => state,
  );
  return { visible: state.visible, platform: platform(), request, dismiss, install };
}

export function InstallPrompt() {
  const { visible, platform: kind, dismiss: close, install: run } = useInstall();
  const t = useT();
  if (!visible || kind === 'none') return null;
  return (
    <Banner
      variant="info"
      role="region"
      aria-label={t('core.install.title')}
      action={
        kind === 'android' ? (
          <Button onClick={() => void run()}>{t('core.install.action')}</Button>
        ) : undefined
      }
    >
      <strong>{t('core.install.title')}</strong>
      <p>{t(kind === 'android' ? 'core.install.androidBody' : 'core.install.iosBody')}</p>
      <Button variant="secondary" onClick={close}>
        {t(kind === 'android' ? 'core.install.dismiss' : 'core.install.gotIt')}
      </Button>
    </Banner>
  );
}
