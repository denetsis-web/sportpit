import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/ui/styles.css'),
  'utf8',
);

/** Содержимое блока `{ … }` после селектора (с учётом вложенных скобок). */
function blockAfter(selector: string, from = 0): string {
  const start = css.indexOf(selector, from);
  if (start < 0) throw new Error(`нет блока ${selector}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`блок ${selector} не закрыт`);
}

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

// Светлая тема и общие токены лежат в блоках «:root {» (их два: цвета и размеры).
const light = (() => {
  const merged: Record<string, string> = {};
  for (let at = css.indexOf(':root {'); at >= 0; at = css.indexOf(':root {', at + 1)) {
    Object.assign(merged, tokens(blockAfter(':root {', at)));
  }
  return merged;
})();
const darkBySystem = tokens(blockAfter(":root:not([data-theme='light'])"));
const darkByHand = tokens(blockAfter(":root[data-theme='dark']"));

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [текст или граница, фон, минимальный контраст, зачем]. AA: 4.5 для текста, 3 для границ и фокуса. */
const PAIRS: Array<[string, string, number]> = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['on-primary', 'primary', 4.5],
  ['on-primary', 'primary-hover', 4.5],
  ['on-danger', 'danger', 4.5],
  ['link', 'bg', 4.5],
  ['link', 'surface', 4.5],
  ['danger-text', 'surface', 4.5],
  ['danger-text', 'bg', 4.5],
  ['info-text', 'info-bg', 4.5],
  ['success-text', 'success-bg', 4.5],
  ['warning-text', 'warning-bg', 4.5],
  ['error-text', 'error-bg', 4.5],
  ['input-border', 'surface', 3],
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
  ['primary', 'surface', 3],
];

describe.each([
  ['светлая тема', light],
  ['тёмная тема (по системе)', darkBySystem],
  ['тёмная тема (переключатель)', darkByHand],
])('контраст AA: %s', (_name, theme) => {
  it.each(PAIRS)('%s на %s не меньше %s:1', (fg, bg, min) => {
    const palette = { ...light, ...theme };
    const [fgValue, bgValue] = [palette[`color-${fg}`]!, palette[`color-${bg}`]!];
    const ratio = contrast(fgValue, bgValue);
    expect(ratio, `${fg} ${fgValue} на ${bg} ${bgValue}`).toBeGreaterThanOrEqual(min);
  });
});

describe('тёмная тема', () => {
  it('значения по системе и по переключателю одинаковы', () => {
    expect(darkBySystem).toEqual(darkByHand);
  });

  it('перекрывает все цвета светлой темы (ни один токен не «залип»)', () => {
    const colorKeys = Object.keys(light).filter(
      (k) => k.startsWith('color-') && k !== 'color-scheme',
    );
    expect(Object.keys(darkByHand).filter((k) => k.startsWith('color-'))).toEqual(
      expect.arrayContaining(colorKeys),
    );
  });
});

describe('размер касания 44 px', () => {
  it('токен --tap-size равен 44px', () => {
    expect(light['tap-size']).toBe('44px');
  });

  it.each([
    '.ui-button {',
    '.ui-field__input {',
    '.shell__nav a {',
    '.theme-toggle {',
    '.shell__brand {',
  ])('%s имеет минимальную высоту --tap-size', (selector) => {
    expect(blockAfter(selector)).toMatch(/min-height:\s*var\(--tap-size\)/);
  });

  it('кнопки переключателя языка не меньше 44 px', () => {
    const block = blockAfter('.segmented button {');
    expect(block).toMatch(/min-height:\s*var\(--tap-size\)/);
    expect(block).toMatch(/min-width:\s*var\(--tap-size\)/);
  });
});
