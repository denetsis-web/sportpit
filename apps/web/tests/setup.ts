import { cleanup, configure } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';
import { resetInstallStore } from '../src/app/install.tsx';
import { resetMediaMocks } from './helpers.tsx';

expect.extend(axeMatchers);

// Под нагрузкой полного прогона jsdom-тесты медленнее: ожидания `findBy*`/`waitFor` с запасом (по умолчанию 1 с).
configure({ asyncUtilTimeout: 8000 });

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.lang = 'ru';
  resetMediaMocks();
  resetInstallStore();
});

// axe пробует canvas для проверки значков-лигатур; в jsdom его нет, и это только шум в выводе.
HTMLCanvasElement.prototype.getContext = (() => null) as never;
