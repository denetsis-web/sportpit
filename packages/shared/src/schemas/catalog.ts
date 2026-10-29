// Схемы API блюд и меню (модуль catalog). Названия и составы хранятся парами RU/RO.
// Сообщения проверки — ключи словаря `catalog.error.*`.
import { z } from 'zod';
import { isDateISO } from '../time.ts';

export const GOALS = ['lose', 'maintain', 'gain'] as const;
export type Goal = (typeof GOALS)[number];
export const goalSchema = z.enum(GOALS);

/** Аллергены, которые можно отметить у блюда. Глютен и лактоза управляют фильтрами «без …». */
export const ALLERGENS = [
  'gluten',
  'lactose',
  'eggs',
  'nuts',
  'peanuts',
  'fish',
  'shellfish',
  'soy',
  'sesame',
  'celery',
  'mustard',
] as const;
export type Allergen = (typeof ALLERGENS)[number];
export const allergenSchema = z.enum(ALLERGENS);

/** Теги отзыва (R26): вкус, свежесть, порция, КБЖУ. */
export const REVIEW_TAGS = ['taste', 'freshness', 'portion', 'kbzhu'] as const;
export type ReviewTag = (typeof REVIEW_TAGS)[number];

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png'] as const;

export const dateSchema = z.string().refine(isDateISO, 'catalog.error.date');

const nonEmpty = (max: number, key: string) => z.string().trim().min(1, key).max(max, key);
const grams = z.number().min(0, 'catalog.error.nutrition').max(1000, 'catalog.error.nutrition');

/** Поля блюда без значений по умолчанию: от них строится и правка (PATCH не должен сбрасывать поля). */
const dishFields = z.object({
  nameRu: nonEmpty(120, 'catalog.error.name'),
  nameRo: nonEmpty(120, 'catalog.error.name'),
  compositionRu: nonEmpty(1000, 'catalog.error.composition'),
  compositionRo: nonEmpty(1000, 'catalog.error.composition'),
  calories: z
    .number()
    .int('catalog.error.nutrition')
    .min(0, 'catalog.error.nutrition')
    .max(5000, 'catalog.error.nutrition'),
  proteinG: grams,
  fatG: grams,
  carbsG: grams,
  fiberG: grams,
  /** Вес порции, г. */
  weightG: z
    .number()
    .int('catalog.error.weight')
    .min(1, 'catalog.error.weight')
    .max(3000, 'catalog.error.weight'),
  allergens: z.array(allergenSchema).max(ALLERGENS.length),
  /** Для каких целей блюдо подходит (фильтр «цель»). */
  goals: z.array(goalSchema).max(GOALS.length),
  vegetarian: z.boolean(),
  /** Срок хранения после приготовления, часов (по нему считается «съесть до»). */
  shelfLifeHours: z
    .number()
    .int('catalog.error.shelfLife')
    .min(1, 'catalog.error.shelfLife')
    .max(720, 'catalog.error.shelfLife'),
  active: z.boolean(),
});

export const dishInputSchema = dishFields.extend({
  allergens: dishFields.shape.allergens.default([]),
  goals: dishFields.shape.goals.default([]),
  vegetarian: dishFields.shape.vegetarian.default(false),
  active: dishFields.shape.active.default(true),
});
export type DishInput = z.infer<typeof dishInputSchema>;

export const dishPatchSchema = dishFields.partial();
export type DishPatch = z.infer<typeof dishPatchSchema>;

const bilingual = z.object({ ru: z.string(), ro: z.string() });

export const ratingSchema = z.object({
  avg: z.number().nullable(),
  count: z.number().int().nonnegative(),
});
export type Rating = z.infer<typeof ratingSchema>;

/** Блюдо для клиента: названия сразу на двух языках, чтобы кэш меню не зависел от языка. */
export const dishSchema = z.object({
  id: z.number().int(),
  name: bilingual,
  composition: bilingual,
  calories: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  fiberG: z.number(),
  weightG: z.number().int(),
  allergens: z.array(allergenSchema),
  goals: z.array(goalSchema),
  vegetarian: z.boolean(),
  shelfLifeHours: z.number().int(),
  photoUrl: z.string().nullable(),
});
export type DishDto = z.infer<typeof dishSchema>;

/** Блюдо для администратора: то же и признак активности. */
export const adminDishSchema = dishSchema.extend({ active: z.boolean() });
export type AdminDishDto = z.infer<typeof adminDishSchema>;
export const adminDishListSchema = z.object({ items: z.array(adminDishSchema) });

export const menuItemSchema = dishSchema.extend({
  rating: ratingSchema,
  /** Сколько порций ещё можно заказать. */
  portionsLeft: z.number().int().nonnegative(),
  /** Порции закончились: в заказ добавить нельзя. */
  soldOut: z.boolean(),
  /** Когда приготовлено (момент UTC) — если кухня уже отметила партию. */
  cookedAt: z.string().nullable(),
});
export type MenuItemDto = z.infer<typeof menuItemSchema>;

export const menuSchema = z.object({
  date: z.string(),
  /** Сегодняшняя дата по Кишинёву: от неё клиент строит выбор дня. */
  today: z.string(),
  published: z.boolean(),
  /** Ближайший опубликованный день после запрошенного (для текста «Меню появится позже»). */
  nextDate: z.string().nullable(),
  items: z.array(menuItemSchema),
  toleranceNote: bilingual,
});
export type MenuDto = z.infer<typeof menuSchema>;

export const reviewSchema = z.object({
  stars: z.number().int().min(1).max(5),
  tag: z.string().nullable(),
  /** Момент UTC. Имени и телефона автора здесь нет. */
  createdAt: z.string(),
});
export type ReviewDto = z.infer<typeof reviewSchema>;

export const dishCardSchema = z.object({
  dish: menuItemSchema.extend({ onMenu: z.boolean() }),
  reviews: z.array(reviewSchema),
  today: z.string(),
  toleranceNote: bilingual,
});
export type DishCardDto = z.infer<typeof dishCardSchema>;

// ---- меню на день (администратор) ----

export const MAX_PORTION_LIMIT = 1000;
export const MAX_MENU_ITEMS = 30;

export const menuEntrySchema = z.object({
  dishId: z.number().int(),
  portionLimit: z
    .number()
    .int('catalog.error.portionLimit')
    .min(0, 'catalog.error.portionLimit')
    .max(MAX_PORTION_LIMIT, 'catalog.error.portionLimit'),
});
export type MenuEntry = z.infer<typeof menuEntrySchema>;

export const saveMenuSchema = z.object({
  items: z.array(menuEntrySchema).max(MAX_MENU_ITEMS, 'catalog.error.menuSize'),
});

export const copyMenuSchema = z.object({ fromDate: dateSchema });

export const adminMenuDaySchema = z.object({
  date: z.string(),
  published: z.boolean(),
  publishedAt: z.string().nullable(),
  items: z.array(
    z.object({
      dishId: z.number().int(),
      portionLimit: z.number().int(),
      /** Сколько порций уже занято заказами. */
      reserved: z.number().int(),
    }),
  ),
});
export type AdminMenuDayDto = z.infer<typeof adminMenuDaySchema>;

export const menuDaySummarySchema = z.object({
  date: z.string(),
  published: z.boolean(),
  itemCount: z.number().int(),
});
export type MenuDaySummary = z.infer<typeof menuDaySummarySchema>;
export const menuDayListSchema = z.object({ items: z.array(menuDaySummarySchema) });

// ---- фильтры меню (R18.1) ----

export interface MenuFilters {
  goal?: Goal;
  /** Белка в порции не меньше, г. */
  proteinMin?: number;
  glutenFree?: boolean;
  lactoseFree?: boolean;
  vegetarian?: boolean;
}

type Filterable = Pick<DishDto, 'goals' | 'proteinG' | 'allergens' | 'vegetarian'>;

/** Одно правило фильтров для сервера и клиента: условия сочетаются по «И». */
export function matchesFilters(dish: Filterable, filters: MenuFilters): boolean {
  if (filters.goal && !dish.goals.includes(filters.goal)) return false;
  if (filters.proteinMin !== undefined && dish.proteinG < filters.proteinMin) return false;
  if (filters.glutenFree && dish.allergens.includes('gluten')) return false;
  if (filters.lactoseFree && dish.allergens.includes('lactose')) return false;
  if (filters.vegetarian && !dish.vegetarian) return false;
  return true;
}

const flag = z
  .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
  .transform((value) => value === '1' || value === 'true');

/** Строка запроса `GET /menu`: все параметры необязательны. */
export const menuQuerySchema = z.object({
  date: dateSchema.optional(),
  goal: goalSchema.optional(),
  proteinMin: z.coerce.number().min(0).max(1000).optional(),
  glutenFree: flag.optional(),
  lactoseFree: flag.optional(),
  vegetarian: flag.optional(),
});

export const dishQuerySchema = z.object({ date: dateSchema.optional() });
