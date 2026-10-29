-- Анкета цели (R16, R29). Параметры тела — данные о здоровье: пишутся только при действующем
-- согласии `health_data` (проверка в модуле profile) и стираются вместе с аккаунтом.
-- Норма КБЖУ не хранится: она считается из анкеты (packages/shared/src/targets.ts).
CREATE TABLE profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  sex TEXT NOT NULL CHECK (sex IN ('female', 'male')),
  age INTEGER NOT NULL,
  height_cm INTEGER NOT NULL,
  weight_kg REAL NOT NULL,
  goal TEXT NOT NULL CHECK (goal IN ('lose', 'maintain', 'gain')),
  activity TEXT NOT NULL CHECK (activity IN ('sedentary', 'light', 'moderate', 'active')),
  has_condition INTEGER NOT NULL DEFAULT 0 CHECK (has_condition IN (0, 1)),
  updated_at TEXT NOT NULL
);
