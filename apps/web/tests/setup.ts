import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';
import { resetInstallStore } from '../src/app/install.tsx';
import { resetMediaMocks } from './helpers.tsx';

expect.extend(axeMatchers);

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
