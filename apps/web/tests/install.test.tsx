import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { I18nProvider } from '../src/app/i18n.tsx';
import { INSTALL_SHOWN_KEY, InstallPrompt, isIosSafari, useInstall } from '../src/app/install.tsx';
import { registerRealDictionaries, setMedia, setStoredLang } from './helpers.tsx';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

function Harness() {
  const install = useInstall();
  return (
    <>
      <button onClick={install.request}>запросить</button>
      <InstallPrompt />
    </>
  );
}

function mount() {
  registerRealDictionaries();
  setStoredLang('ru');
  return render(
    <I18nProvider>
      <Harness />
    </I18nProvider>,
  );
}

function fireInstallEvent() {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return { event, prompt };
}

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

describe('определение iOS Safari', () => {
  it('iPhone Safari — да', () => {
    expect(isIosSafari({ userAgent: IPHONE_SAFARI })).toBe(true);
  });
  it('Chrome на iPhone и Android Chrome — нет (там свой механизм установки)', () => {
    expect(isIosSafari({ userAgent: IPHONE_CHROME })).toBe(false);
    expect(isIosSafari({ userAgent: ANDROID_CHROME })).toBe(false);
  });
  it('iPad в режиме «как компьютер» (MacIntel с сенсорным экраном) — да', () => {
    expect(
      isIosSafari({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });
});

describe('подсказка установки на экран «Домой»', () => {
  it('Android: ловит beforeinstallprompt, показывает кнопку и вызывает системное окно установки', async () => {
    const user = userEvent.setup();
    mount();
    const { event, prompt } = fireInstallEvent();
    expect(event.defaultPrevented).toBe(true); // браузерный мини-баннер подавлен, решаем мы
    expect(screen.queryByRole('region')).toBeNull(); // сам по себе не появляется

    await user.click(screen.getByRole('button', { name: 'запросить' }));
    const region = screen.getByRole('region', { name: 'Установите приложение' });
    expect(region.textContent).toContain('Добавьте SportPit на главный экран');

    await user.click(screen.getByRole('button', { name: 'Установить' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('iOS Safari: показывает инструкцию «Поделиться → На экран Домой» без кнопки установки', async () => {
    const user = userEvent.setup();
    setUserAgent(IPHONE_SAFARI);
    mount();
    await user.click(screen.getByRole('button', { name: 'запросить' }));
    expect(screen.getByRole('region').textContent).toContain('Поделиться');
    expect(screen.queryByRole('button', { name: 'Установить' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(screen.queryByRole('region')).toBeNull();
    setUserAgent(ANDROID_CHROME);
  });

  it('показывается один раз: повторный запрос после показа ничего не делает', async () => {
    const user = userEvent.setup();
    mount();
    fireInstallEvent();
    await user.click(screen.getByRole('button', { name: 'запросить' }));
    expect(window.localStorage.getItem(INSTALL_SHOWN_KEY)).toBe('1');
    await user.click(screen.getByRole('button', { name: 'Не сейчас' }));
    expect(screen.queryByRole('region')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'запросить' }));
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('уже установленное приложение (display-mode: standalone) подсказку не показывает', async () => {
    const user = userEvent.setup();
    setMedia('(display-mode: standalone)', true);
    mount();
    fireInstallEvent();
    await user.click(screen.getByRole('button', { name: 'запросить' }));
    expect(screen.queryByRole('region')).toBeNull();
    expect(window.localStorage.getItem(INSTALL_SHOWN_KEY)).toBeNull();
  });

  it('если установить нельзя (нет ни события, ни iOS Safari), запрос ничего не делает и не «тратит» показ', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'запросить' }));
    expect(screen.queryByRole('region')).toBeNull();
    expect(window.localStorage.getItem(INSTALL_SHOWN_KEY)).toBeNull();
  });

  it('подсказка доступна (axe) и переведена на румынский', async () => {
    const user = userEvent.setup();
    registerRealDictionaries();
    setStoredLang('ro');
    const { container } = render(
      <I18nProvider>
        <Harness />
      </I18nProvider>,
    );
    fireInstallEvent();
    await user.click(screen.getByRole('button', { name: 'запросить' }));
    expect(screen.getByRole('button', { name: 'Instalează' })).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });
});
