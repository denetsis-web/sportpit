// Расчёт цены покупки. Чистые функции: деньги — целые бани, дробных копеек нет (R3 проекта).
// Цена кредита после скидки целая, а итог = цена кредита × число боксов: поэтому возврат
// «кредиты × цена кредита лота» всегда совпадает с тем, что заплатил клиент, до одной бани.
import type { PromoKind } from '@sportpit/shared/schemas/billing';

export interface Price {
  /** Цена одного бокса (кредита) после скидки. */
  unitPriceBani: number;
  totalBani: number;
  discountBani: number;
}

export function priceFor(input: {
  boxes: number;
  listPricePerBoxBani: number;
  promo?: { kind: PromoKind; value: number } | undefined;
}): Price {
  const { boxes, listPricePerBoxBani: list } = input;
  let unit = list;
  const promo = input.promo;
  if (promo?.kind === 'percent') {
    // округление к ближайшей бане, половина вверх: в пользу магазина при ровно половине
    unit = Math.floor((list * (100 - promo.value) + 50) / 100);
  } else if (promo?.kind === 'fixed') {
    // скидка делится поровну на боксы с округлением вниз: клиент получает не больше обещанного
    unit = Math.max(0, list - Math.floor(promo.value / boxes));
  }
  return { unitPriceBani: unit, totalBani: unit * boxes, discountBani: (list - unit) * boxes };
}
