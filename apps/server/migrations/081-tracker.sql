-- Ручные записи трекера питания (R28.1). Выданные боксы в таблицу не копируются: дневные итоги
-- считаются из заказов в статусе «выдан». Время — UTC, день — календарная дата по Кишинёву.
CREATE TABLE tracker_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id),
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  calories REAL NOT NULL CHECK (calories >= 0),
  protein_g REAL NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  fat_g REAL NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  carbs_g REAL NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fiber_g REAL NOT NULL DEFAULT 0 CHECK (fiber_g >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_tracker_entries_user_date ON tracker_entries (user_id, date);
