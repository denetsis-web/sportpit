// Логика команды `npm run seed`: стартовые данные для знакомства с приложением (R61i).
// Отдельно от scripts/seed.ts, чтобы проверяться тестами. Данные демонстрационные и так помечены:
// слово «ДЕМО» (на румынском «DEMO») стоит в названии зала, холодильников и блюд; КБЖУ условные.
// Повторный запуск ничего не дублирует: уже созданное находится по идентификатору или названию.
import type { DishInput } from '@sportpit/shared/schemas/catalog';
import { addDaysISO } from '@sportpit/shared/time';
import type { AppDeps } from '../../app.ts';
import { adminFor } from '../admin/index.ts';
import { billingFor } from '../billing/index.ts';
import { catalogFor } from '../catalog/index.ts';

export const DEMO_GYM_ID = 'demo-gym';
export const DEMO_FRIDGE_IDS = ['demo-fridge-1', 'demo-fridge-2'] as const;
/** Сколько ближайших дней получают опубликованное меню (начиная с завтрашнего). */
export const DEMO_MENU_DAYS = 3;
export const DEMO_PORTION_LIMIT = 20;
/** Стартовые пакеты из ТЗ: боксов → цена бокса в банях. */
export const START_PACKAGES: ReadonlyArray<{ boxes: number; pricePerBoxBani: number }> = [
  { boxes: 12, pricePerBoxBani: 11900 },
  { boxes: 20, pricePerBoxBani: 10900 },
  { boxes: 30, pricePerBoxBani: 9900 },
  { boxes: 1, pricePerBoxBani: 12900 },
];

const dish = (
  nameRu: string,
  nameRo: string,
  compositionRu: string,
  compositionRo: string,
  nutrition: [calories: number, protein: number, fat: number, carbs: number, fiber: number],
  weightG: number,
  extra: Partial<Pick<DishInput, 'allergens' | 'goals' | 'vegetarian' | 'shelfLifeHours'>> = {},
): DishInput => ({
  nameRu: `ДЕМО · ${nameRu}`,
  nameRo: `DEMO · ${nameRo}`,
  compositionRu,
  compositionRo,
  calories: nutrition[0],
  proteinG: nutrition[1],
  fatG: nutrition[2],
  carbsG: nutrition[3],
  fiberG: nutrition[4],
  weightG,
  allergens: extra.allergens ?? [],
  goals: extra.goals ?? ['maintain'],
  vegetarian: extra.vegetarian ?? false,
  shelfLifeHours: extra.shelfLifeHours ?? 72,
  active: true,
});

/** Десять демонстрационных блюд. КБЖУ условные, не результат анализа реальной кухни. */
export const DEMO_DISHES: readonly DishInput[] = [
  dish(
    'Курица с рисом и брокколи',
    'Pui cu orez și broccoli',
    'куриная грудка, рис, брокколи, оливковое масло',
    'piept de pui, orez, broccoli, ulei de măsline',
    [520, 42, 14, 55, 6],
    380,
    { goals: ['maintain', 'gain'] },
  ),
  dish(
    'Лосось с картофелем и спаржей',
    'Somon cu cartofi și sparanghel',
    'лосось, картофель, спаржа, лимон',
    'somon, cartofi, sparanghel, lămâie',
    [560, 38, 26, 38, 5],
    360,
    { allergens: ['fish'] },
  ),
  dish(
    'Индейка с гречкой',
    'Curcan cu hrișcă',
    'филе индейки, гречка, морковь, лук',
    'file de curcan, hrișcă, morcov, ceapă',
    [480, 40, 10, 54, 7],
    370,
    { goals: ['lose', 'maintain'] },
  ),
  dish(
    'Говядина с булгуром',
    'Vită cu bulgur',
    'говядина, булгур, перец, томаты',
    'carne de vită, bulgur, ardei, roșii',
    [590, 44, 20, 52, 8],
    390,
    { allergens: ['gluten'], goals: ['gain', 'maintain'] },
  ),
  dish(
    'Овсянка с ягодами и орехами',
    'Terci de ovăz cu fructe de pădure și nuci',
    'овсяные хлопья, молоко, ягоды, грецкий орех',
    'fulgi de ovăz, lapte, fructe de pădure, nuci',
    [420, 16, 14, 58, 9],
    320,
    { allergens: ['gluten', 'lactose', 'nuts'], vegetarian: true, shelfLifeHours: 48 },
  ),
  dish(
    'Творожная запеканка',
    'Budincă de brânză de vaci',
    'творог, яйцо, манная крупа, ванильный сахар',
    'brânză de vaci, ou, griș, zahăr vanilat',
    [380, 32, 9, 42, 3],
    300,
    { allergens: ['lactose', 'eggs', 'gluten'], vegetarian: true, shelfLifeHours: 48 },
  ),
  dish(
    'Овощное рагу с нутом',
    'Tocană de legume cu năut',
    'нут, кабачок, баклажан, томаты, зелень',
    'năut, dovlecel, vânătă, roșii, verdețuri',
    [440, 18, 12, 62, 14],
    400,
    { vegetarian: true, goals: ['lose', 'maintain'] },
  ),
  dish(
    'Паста с курицей и овощами',
    'Paste cu pui și legume',
    'паста, куриное филе, цуккини, перец',
    'paste, file de pui, dovlecel, ardei',
    [540, 38, 13, 70, 6],
    380,
    { allergens: ['gluten', 'eggs'], goals: ['gain', 'maintain'] },
  ),
  dish(
    'Салат с тунцом и киноа',
    'Salată cu ton și quinoa',
    'тунец, киноа, огурец, яйцо, листья салата',
    'ton, quinoa, castravete, ou, salată verde',
    [400, 36, 12, 34, 7],
    340,
    { allergens: ['fish', 'eggs'], goals: ['lose', 'maintain'], shelfLifeHours: 48 },
  ),
  dish(
    'Греческий салат с курицей',
    'Salată grecească cu pui',
    'куриная грудка, огурец, томаты, оливки, фета',
    'piept de pui, castravete, roșii, măsline, feta',
    [360, 34, 16, 14, 4],
    330,
    { allergens: ['lactose'], goals: ['lose'], shelfLifeHours: 48 },
  ),
];

export interface SeedResult {
  gym: 'created' | 'exists';
  fridges: { created: number; existing: number };
  dishes: { created: number; existing: number };
  menuDays: { published: string[]; skipped: string[] };
  packages: { present: number[]; created: number[] };
}

/**
 * Создаёт недостающее и сообщает по строке на шаг. Секретов не читает и не печатает.
 * Меню на день, которое уже есть (своё или чужое), не трогает.
 */
export function runSeed(deps: AppDeps, out: (line: string) => void = () => undefined): SeedResult {
  const admin = adminFor(deps);
  const catalog = catalogFor(deps);
  const billing = billingFor(deps);
  const result: SeedResult = {
    gym: 'exists',
    fridges: { created: 0, existing: 0 },
    dishes: { created: 0, existing: 0 },
    menuDays: { published: [], skipped: [] },
    packages: { present: [], created: [] },
  };

  // ---- зал и холодильники ----
  if (admin.getGym(DEMO_GYM_ID)) {
    out('Зал «ДЕМО»: уже есть.');
  } else {
    admin.createGym({ id: DEMO_GYM_ID, name: 'Зал «ДЕМО»', address: null, sharePercent: 10 }, null);
    result.gym = 'created';
    out('Зал «ДЕМО»: создан (доля зала 10 % — условное значение, правится в админке).');
  }

  const fridges = [
    {
      id: DEMO_FRIDGE_IDS[0],
      name: 'ДЕМО · Холодильник у входа',
      capacityBoxes: 30,
      cutoffTime: '18:00',
      pickupFrom: '07:00',
      pickupTo: '22:00',
    },
    {
      id: DEMO_FRIDGE_IDS[1],
      name: 'ДЕМО · Холодильник у раздевалки',
      capacityBoxes: 20,
      cutoffTime: '20:00',
      pickupFrom: '09:00',
      pickupTo: '21:00',
    },
  ];
  for (const fridge of fridges) {
    if (admin.getFridge(fridge.id)) {
      result.fridges.existing += 1;
      out(`Холодильник ${fridge.id}: уже есть.`);
      continue;
    }
    admin.createFridge({ ...fridge, gymId: DEMO_GYM_ID, accessCode: null }, null);
    result.fridges.created += 1;
    out(
      `Холодильник ${fridge.id}: создан (приём заказов до ${fridge.cutoffTime}, выдача ${fridge.pickupFrom}–${fridge.pickupTo}, мест ${fridge.capacityBoxes}).`,
    );
  }

  // ---- блюда ----
  const existing = new Map(catalog.listDishes().map((d) => [d.name.ru, d.id]));
  const dishIds: number[] = [];
  for (const input of DEMO_DISHES) {
    const known = existing.get(input.nameRu);
    if (known !== undefined) {
      result.dishes.existing += 1;
      dishIds.push(known);
      continue;
    }
    dishIds.push(catalog.upsertDish(input, null).id);
    result.dishes.created += 1;
  }
  out(
    `Блюда «ДЕМО»: создано ${result.dishes.created}, уже было ${result.dishes.existing} (КБЖУ условные).`,
  );

  // ---- меню на ближайшие дни ----
  const today = deps.clock.localDate();
  for (let offset = 1; offset <= DEMO_MENU_DAYS; offset += 1) {
    const date = addDaysISO(today, offset);
    if (catalog.listMenuDays(date, date).some((day) => day.itemCount > 0 || day.published)) {
      result.menuDays.skipped.push(date);
      continue;
    }
    catalog.saveMenu(
      date,
      dishIds.map((dishId) => ({ dishId, portionLimit: DEMO_PORTION_LIMIT })),
      null,
    );
    catalog.publishMenu(date, null);
    result.menuDays.published.push(date);
  }
  out(
    `Меню: опубликовано ${result.menuDays.published.length} дн. (${result.menuDays.published.join(', ') || 'нет новых'}), уже было на ${result.menuDays.skipped.length} дн.`,
  );

  // ---- стартовые пакеты ----
  const known = new Set(billing.listPackages({ includeInactive: true }).map((p) => p.boxes));
  for (const pack of START_PACKAGES) {
    if (known.has(pack.boxes)) {
      result.packages.present.push(pack.boxes);
      continue;
    }
    billing.createPackage(pack);
    result.packages.created.push(pack.boxes);
  }
  out(
    `Пакеты 12/20/30/1: на месте ${result.packages.present.length}, добавлено ${result.packages.created.length}.`,
  );
  out('Готово. Дальше: npm run create-user -- --phone +373XXXXXXXX --role admin');
  return result;
}
