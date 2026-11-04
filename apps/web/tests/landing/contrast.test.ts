import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// В jsdom CSS не применяется, поэтому, как в tests/contrast.test.ts, читаем файлы стилей как текст.
const here = dirname(fileURLToPath(import.meta.url));
const landingDir = join(here, '../../src/features/client/landing');
const read = (path: string) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const FILES = [
  join(landingDir, 'landing.css'),
  join(landingDir, 'calculator/calculator.css'),
  join(landingDir, 'calculator/forms.css'),
];
const landingCss = read(FILES[0]!);
const brandTokens = read(join(here, '../../../../brand/landing/tokens.css'));

interface Rule {
  media: string | null;
  selector: string;
  body: string;
}

/** Плоский разбор правил, включая вложенные в @media. */
function parseRules(css: string, media: string | null = null): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    let depth = 0;
    let close = open;
    for (; close < css.length; close++) {
      if (css[close] === '{') depth++;
      if (css[close] === '}' && --depth === 0) break;
    }
    const head = css.slice(i, open).trim();
    const inner = css.slice(open + 1, close);
    if (head.startsWith('@media')) out.push(...parseRules(inner, head));
    else if (!head.startsWith('@')) out.push({ media, selector: head, body: inner });
    i = close + 1;
  }
  return out;
}

const rules = FILES.flatMap((file) => parseRules(read(file)));

function declaration(body: string, prop: string): string | undefined {
  return new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+)`).exec(body)?.[1]?.trim();
}

function ruleFor(selector: string, media: string | null = null): Rule {
  const found = rules.find(
    (r) => r.media === media && r.selector.split(',').some((s) => s.trim() === selector),
  );
  if (!found) throw new Error(`нет правила ${selector}`);
  return found;
}

// Токены: из landing.css (блок `.lp {`), с проверкой, что они равны brand/landing/tokens.css.
function colorTokens(css: string): Record<string, string> {
  const block = parseRules(css).find((r) => r.selector === '.lp' && r.media === null)!.body;
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--lp-([a-z-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]!] = m[2]!;
  return out;
}
const T = colorTokens(landingCss);

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = ([r, g, b]: Rgb) => {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const mix = (top: Rgb, bottom: Rgb, alpha: number): Rgb =>
  top.map((v, i) => v * alpha + bottom[i]! * (1 - alpha)) as Rgb;
const bright = (c: Rgb, k: number): Rgb => c.map((v) => Math.min(255, v * k)) as Rgb;
const token = (value: string | undefined): Rgb => {
  const name = /var\(--lp-([a-z-]+)\)/.exec(value ?? '')?.[1];
  if (!name || !T[name]) throw new Error(`не токен: ${value}`);
  return rgb(T[name]!);
};

describe('токены лендинга', () => {
  it('цвета в landing.css совпадают с brand/landing/tokens.css', () => {
    expect(Object.keys(T).length).toBeGreaterThanOrEqual(10);
    expect(colorTokens(brandTokens)).toEqual(T);
  });
});

describe('кнопки: подпись и фон', () => {
  // Цвета берём из самих правил, не из головы: если правило поменяют, тест посчитает новую пару.
  const variants = ['lime', 'berry'] as const;
  const pair = (variant: (typeof variants)[number]) => {
    const body = ruleFor(`.lp-btn--${variant}`).body;
    return { fg: token(declaration(body, 'color')), bg: token(declaration(body, 'background')) };
  };

  it.each(variants)('.lp-btn--%s: подпись на фоне не меньше 4,5:1', (variant) => {
    const { fg, bg } = pair(variant);
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('лайм: тёмный лесной текст (DESIGN.md, button-primary-on-dark)', () => {
    expect(declaration(ruleFor('.lp-btn--lime').body, 'color')).toBe('var(--lp-primary)');
    expect(declaration(ruleFor('.lp-btn--lime').body, 'background')).toBe('var(--lp-tertiary)');
  });

  it.each(variants)('.lp-btn--%s: наведение и нажатие (filter) не роняют контраст', (variant) => {
    const { fg, bg } = pair(variant);
    const hover = /brightness\(([\d.]+)\)/.exec(
      declaration(ruleFor('.lp-btn--lime:hover').body, 'filter')!,
    )![1]!;
    const active = /brightness\(([\d.]+)\)/.exec(
      declaration(ruleFor(`.lp-btn--lime:active`).body, 'filter')!,
    )![1]!;
    for (const k of [Number(hover), Number(active)]) {
      expect(ratio(bright(fg, k), bright(bg, k))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('выключенная кнопка (opacity) остаётся читаемой на любом фоне, где она встречается', () => {
    const opacity = Number(declaration(ruleFor('.lp-btn:disabled').body, 'opacity'));
    expect(opacity).toBeGreaterThan(0);
    const onBackgrounds: Record<(typeof variants)[number], string[]> = {
      lime: ['primary', 'forest-raised'],
      berry: ['surface', 'neutral'],
    };
    for (const variant of variants) {
      const { fg, bg } = pair(variant);
      for (const under of onBackgrounds[variant]) {
        const base = rgb(T[under]!);
        expect(
          ratio(mix(fg, base, opacity), mix(bg, base, opacity)),
          `${variant} выключена на ${under}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('прозрачная кнопка: подпись цвета окружения читается на нём и при наведении', () => {
    const hover = declaration(ruleFor('.lp-btn--ghost:hover').body, 'background')!;
    const [r, g, b, a] = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(hover)!.slice(1).map(Number);
    const overlay: Rgb = [r!, g!, b!];
    // [цвет текста, фон: плашка аналитики, тёмные секции, кремовые секции]
    for (const [fg, bg] of [
      ['neutral', 'forest-raised'],
      ['neutral', 'primary'],
      ['neutral', 'secondary'],
      ['primary', 'neutral'],
      ['primary', 'surface'],
    ] as const) {
      const base = rgb(T[bg]!);
      expect(ratio(rgb(T[fg]!), base)).toBeGreaterThanOrEqual(4.5);
      expect(
        ratio(rgb(T[fg]!), mix(overlay, base, a!)),
        `${fg} на ${bg} при наведении`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('прозрачная кнопка в выбранном состоянии не рисует лайм по крему', () => {
    expect(
      declaration(ruleFor(".lp-btn--ghost[aria-pressed='true']").body, 'box-shadow'),
    ).toContain('currentColor');
  });
});

describe('ссылка-кнопка не теряет цвет кнопки', () => {
  /** Специфичность селектора как число: id*10000 + классы/атрибуты/псевдоклассы*100 + теги. `:where()` даёт 0. */
  function specificity(selector: string): number {
    const s = selector.replace(/:where\([^)]*\)/g, '');
    const ids = (s.match(/#[\w-]+/g) ?? []).length;
    const classes = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+(?:\([^)]*\))?/g) ?? []).length;
    const tags = (s.replace(/\[[^\]]*\]|\([^)]*\)/g, '').match(/(?:^|[\s>+~])[a-z][\w-]*/g) ?? [])
      .length;
    return ids * 10000 + classes * 100 + tags;
  }

  it('правило цвета для голого `a` не сильнее одного класса (иначе перебьёт .lp-btn--lime на <a>)', () => {
    const offenders = rules.filter((r) => {
      if (declaration(r.body, 'color') === undefined) return false;
      return r.selector.split(',').some((sel) => {
        const last = sel
          .trim()
          .split(/[\s>+~]+/)
          .pop()!;
        // последняя часть — голый тег `a` (без класса), возможно с псевдоклассом
        return /^a(?::[\w-]+(?:\([^)]*\))?)*$/.test(last) && specificity(sel.trim()) >= 100;
      });
    });
    expect(offenders.map((r) => r.selector)).toEqual([]);
  });

  it('наследование цвета ссылкой есть (`a` берёт цвет секции)', () => {
    const rule = rules.find((r) => r.selector === ':where(.lp) a')!;
    expect(declaration(rule.body, 'color')).toBe('inherit');
  });
});

describe('контраст текста лендинга (WCAG AA, 4,5:1)', () => {
  // [текст, фон, где встречается]
  const PAIRS: Array<[string, string, string]> = [
    ['primary', 'neutral', 'основной текст на креме'],
    ['primary', 'surface', 'карточки, поля, формы'],
    ['neutral', 'primary', 'тёмные секции, шапка, подвал'],
    ['neutral', 'secondary', 'полоса, секция формы'],
    ['neutral', 'forest-raised', 'карточка КБЖУ, плашка аналитики, результат калькулятора'],
    ['tertiary', 'primary', 'лайм на лесу (значки, цифры)'],
    ['tertiary', 'forest-raised', 'калории в карточках'],
    ['tertiary', 'secondary', 'лайм на бордо'],
    ['muted', 'neutral', 'второстепенный текст на креме'],
    ['muted', 'surface', 'подсказки и ответы на карточке'],
    ['muted-on-dark', 'primary', 'подписи на лесу'],
    ['muted-on-dark', 'forest-raised', 'подписи в карточках на лесу, заглушки фото'],
    ['error', 'surface', 'ошибка формы'],
    ['error', 'neutral', 'ошибка на креме'],
    ['secondary', 'neutral', 'номера шагов'],
    ['primary', 'tertiary', 'ссылка «к основному содержимому»'],
  ];
  it.each(PAIRS)('%s на %s (%s)', (fg, bg) => {
    expect(ratio(rgb(T[fg]!), rgb(T[bg]!))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('кольцо фокуса (3:1)', () => {
  it.each([
    ['secondary', 'neutral'],
    ['secondary', 'surface'],
    ['tertiary', 'primary'],
    ['tertiary', 'forest-raised'],
    ['tertiary', 'secondary'],
  ])('%s на %s', (ring, bg) => {
    expect(ratio(rgb(T[ring]!), rgb(T[bg]!))).toBeGreaterThanOrEqual(3);
  });

  it('на тёмном, бордовом и в плашке кольцо лаймовое, на кремовой карточке формы бордовое', () => {
    expect(declaration(ruleFor('.lp-consent :focus-visible').body, 'outline-color')).toBe(
      'var(--lp-tertiary)',
    );
    expect(declaration(ruleFor('.lp .lp-formcard :focus-visible').body, 'outline-color')).toBe(
      'var(--lp-secondary)',
    );
  });
});

describe('плашка аналитики на телефоне', () => {
  const MEDIA = '@media (max-width: 480px)';
  const consent = () => ruleFor('.lp-consent', MEDIA).body;
  const buttons = () => ruleFor('.lp-consent__actions .lp-btn', MEDIA).body;
  const more = () => ruleFor('.lp-consent__more', MEDIA).body;

  it('кнопки и «Подробнее» не переносятся на отдельные строки', () => {
    expect(declaration(ruleFor('.lp-consent__actions', MEDIA).body, 'flex-wrap')).toBe('nowrap');
  });

  it('отступы и текст меньше, чем на широком экране (там 16px и 0.9375rem)', () => {
    expect(declaration(consent(), 'padding')).toBe('12px');
    expect(declaration(ruleFor('.lp-consent__text', MEDIA).body, 'font-size')).toBe('0.8125rem');
    expect(declaration(ruleFor('.lp-consent__text').body, 'font-size')).toBe('0.9375rem');
  });

  it('цели нажатия остаются не меньше 44 px', () => {
    expect(declaration(buttons(), 'min-height')).toBe('var(--lp-tap)');
    expect(declaration(more(), 'padding-inline')).toBeDefined();
    expect(declaration(ruleFor('.lp-consent__more').body, 'min-height')).toBe('var(--lp-tap)');
    expect(landingCss).toMatch(/--lp-tap:\s*44px/);
  });
});
