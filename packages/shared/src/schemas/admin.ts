// Схемы API залов, холодильников, настроек и журнала действий администратора (модуль admin).
// Сообщения проверки — ключи словаря `admin.error.*`: сервер отдаёт их в `fields`.
import { z } from 'zod';
import { isTimeHHMM } from '../time.ts';

// ---- залы ----

/** Идентификаторы залов и холодильников — текст (в QR-плакате они попадают в адрес). */
export const ENTITY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const entityIdSchema = z.string().trim().regex(ENTITY_ID_PATTERN, 'admin.error.id');

const nameSchema = z.string().trim().min(1, 'admin.error.name').max(100, 'admin.error.name');

export const gymInputSchema = z.object({
  /** Необязателен: без него сервер выдаёт идентификатор сам. */
  id: entityIdSchema.optional(),
  name: nameSchema,
  address: z.string().trim().max(200, 'admin.error.address').nullable().optional(),
  /** Доля зала в процентах от выручки выданных боксов (R37.3). */
  sharePercent: z.number().min(0, 'admin.error.percent').max(100, 'admin.error.percent'),
  active: z.boolean().optional(),
});
export type GymInput = z.infer<typeof gymInputSchema>;

export const gymPatchSchema = gymInputSchema.omit({ id: true }).partial();
export type GymPatch = z.infer<typeof gymPatchSchema>;

export const gymSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  sharePercent: z.number(),
  active: z.boolean(),
});
export type GymDto = z.infer<typeof gymSchema>;

export const gymListSchema = z.object({ items: z.array(gymSchema) });

// ---- холодильники ----

export const DEFAULT_CUTOFF_TIME = '18:00';
export const DEFAULT_PICKUP_FROM = '07:00';
export const DEFAULT_PICKUP_TO = '22:00';
export const MAX_FRIDGE_CAPACITY = 1000;

const timeSchema = z.string().trim().refine(isTimeHHMM, 'admin.error.time');

const accessCodeSchema = z
  .string()
  .trim()
  .max(32, 'admin.error.accessCode')
  .nullable()
  .transform((value) => (value === '' ? null : value));

export const fridgeInputSchema = z.object({
  id: entityIdSchema.optional(),
  gymId: z.string().trim().min(1, 'admin.error.gym'),
  name: nameSchema,
  capacityBoxes: z
    .number()
    .int('admin.error.capacity')
    .min(0, 'admin.error.capacity')
    .max(MAX_FRIDGE_CAPACITY, 'admin.error.capacity'),
  /** До какого времени дня D−1 принимаются заказы на день D. */
  cutoffTime: timeSchema.default(DEFAULT_CUTOFF_TIME),
  /** Окно выдачи. */
  pickupFrom: timeSchema.default(DEFAULT_PICKUP_FROM),
  pickupTo: timeSchema.default(DEFAULT_PICKUP_TO),
  /** Необязательный код замка: клиент видит его в окно выдачи. */
  accessCode: accessCodeSchema.default(null),
  active: z.boolean().optional(),
});
export type FridgeInput = z.infer<typeof fridgeInputSchema>;

export const fridgePatchSchema = z.object({
  gymId: fridgeInputSchema.shape.gymId.optional(),
  name: nameSchema.optional(),
  capacityBoxes: fridgeInputSchema.shape.capacityBoxes.optional(),
  cutoffTime: timeSchema.optional(),
  pickupFrom: timeSchema.optional(),
  pickupTo: timeSchema.optional(),
  accessCode: accessCodeSchema.optional(),
  active: z.boolean().optional(),
});
export type FridgePatch = z.infer<typeof fridgePatchSchema>;

/** Холодильник целиком: для администратора и для других модулей (`admin.getFridge`). */
export const fridgeSchema = z.object({
  id: z.string(),
  gymId: z.string(),
  gymName: z.string(),
  /** Доля зала в процентах (хранится у зала). */
  gymSharePercent: z.number(),
  name: z.string(),
  capacityBoxes: z.number().int(),
  cutoffTime: z.string(),
  pickupFrom: z.string(),
  pickupTo: z.string(),
  accessCode: z.string().nullable(),
  active: z.boolean(),
});
export type FridgeDto = z.infer<typeof fridgeSchema>;

export const fridgeListSchema = z.object({ items: z.array(fridgeSchema) });

/** Холодильник для клиента: без кода замка. */
export const publicFridgeSchema = fridgeSchema.omit({
  accessCode: true,
  gymSharePercent: true,
  active: true,
});
export type PublicFridgeDto = z.infer<typeof publicFridgeSchema>;
export const publicFridgeListSchema = z.object({ items: z.array(publicFridgeSchema) });

// ---- настройки ----

export const SETTING_KEYS = [
  'maxBoxesPerDay',
  'toleranceNote',
  'stockBufferPercent',
  'labelSize',
  'supportContacts',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** Метка для данных, которые знает только владелец (контакты, реквизиты). */
export const PLACEHOLDER = '[ВПИШИ]';

const contactSchema = z.string().trim().min(1, 'admin.error.text').max(120, 'admin.error.text');

export const settingSchemas = {
  /** Сколько боксов в день может заказать один клиент (R43). */
  maxBoxesPerDay: z
    .number()
    .int('admin.error.number')
    .min(1, 'admin.error.number')
    .max(50, 'admin.error.number'),
  /** Допуск КБЖУ, текст на двух языках (R03): по умолчанию ±5% по белку. */
  toleranceNote: z.object({
    ru: z.string().trim().min(1, 'admin.error.text').max(200, 'admin.error.text'),
    ro: z.string().trim().min(1, 'admin.error.text').max(200, 'admin.error.text'),
  }),
  /** Запас на брак при расчёте производства, % (R32.2). */
  stockBufferPercent: z
    .number()
    .int('admin.error.percent')
    .min(0, 'admin.error.percent')
    .max(100, 'admin.error.percent'),
  /** Размер этикетки в миллиметрах «ширина×высота», например `70x50` (R33). */
  labelSize: z
    .string()
    .trim()
    .regex(/^\d{2,3}x\d{2,3}$/, 'admin.error.labelSize'),
  /** Контакты поддержки (R30.1). */
  supportContacts: z.object({
    phone: contactSchema,
    email: contactSchema,
    messenger: contactSchema,
  }),
} as const satisfies Record<SettingKey, z.ZodType>;

export type SettingValues = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> };

/** Значения по умолчанию: числа и тексты из спецификации, остальное — пометка `[ВПИШИ]`. */
export const SETTING_DEFAULTS: SettingValues = {
  maxBoxesPerDay: 3,
  toleranceNote: {
    ru: 'Допуск КБЖУ: ±5% по белку',
    ro: 'Toleranță KBJU: ±5% la proteine',
  },
  stockBufferPercent: 0,
  labelSize: '70x50',
  supportContacts: { phone: PLACEHOLDER, email: PLACEHOLDER, messenger: PLACEHOLDER },
};

export function isSettingKey(value: string): value is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(value);
}

export const settingsSchema = z.object({
  maxBoxesPerDay: settingSchemas.maxBoxesPerDay,
  toleranceNote: settingSchemas.toleranceNote,
  stockBufferPercent: settingSchemas.stockBufferPercent,
  labelSize: settingSchemas.labelSize,
  supportContacts: settingSchemas.supportContacts,
});

/** Изменение настроек: любое подмножество ключей. */
export const settingsPatchSchema = settingsSchema.partial().strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/** Настройки, которые видит любой посетитель: допуск КБЖУ и контакты поддержки. */
export const publicSettingsSchema = z.object({
  maxBoxesPerDay: settingSchemas.maxBoxesPerDay,
  toleranceNote: settingSchemas.toleranceNote,
  supportContacts: settingSchemas.supportContacts,
});
export type PublicSettings = z.infer<typeof publicSettingsSchema>;

// ---- журнал действий ----

export const auditEntrySchema = z.object({
  id: z.number().int(),
  userId: z.number().int().nullable(),
  /** Действие вида `gym.create`, `dish.update`, `menu.publish`, `settings.update`. */
  action: z.string(),
  /** Над чем: `gym:<id>`, `fridge:<id>`, `dish:<id>`, `menu:<дата>`, `setting:<ключ>`. */
  target: z.string(),
  detail: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});
export type AuditEntryDto = z.infer<typeof auditEntrySchema>;
export const auditListSchema = z.object({
  items: z.array(auditEntrySchema),
  total: z.number().int(),
});
