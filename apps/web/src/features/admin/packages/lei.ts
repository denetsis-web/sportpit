// Лей в поле ввода ⇄ целые бани. Деньги внутри всегда целые бани (1 лей = 100 бань).

/** «119» или «119,50» (запятая или точка) → 11900 / 11950; не число → null. */
export function parseLei(text: string): number | null {
  const match = /^\s*(\d{1,7})(?:[.,](\d{1,2}))?\s*$/.exec(text);
  if (!match) return null;
  const lei = Number(match[1]);
  const rest = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
  return lei * 100 + rest;
}

/** 11900 → «119», 11950 → «119,50». */
export function formatLeiInput(bani: number): string {
  const lei = Math.floor(bani / 100);
  const rest = bani % 100;
  return rest === 0 ? String(lei) : `${lei},${String(rest).padStart(2, '0')}`;
}
