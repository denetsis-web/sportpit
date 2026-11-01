-- Кухня: зафиксированные сводки и партии производства (R08, R32, R33, R60).
-- Идентификатор холодильника — ТЕКСТ без внешнего ключа (как в orders и operator_fridges).
-- Время хранится в UTC (ISO 8601), день выдачи — календарная дата по Кишинёву (YYYY-MM-DD).

-- Закрытие приёма заказов: одна строка на холодильник и дату. Появляется, когда срок прошёл
-- (задача по расписанию или первое обращение к сводке) и больше не меняется.
CREATE TABLE kitchen_closures (
  date TEXT NOT NULL,
  fridge_id TEXT NOT NULL,
  -- момент срока приёма (UTC) и момент, когда сводку зафиксировали
  cutoff_at TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  PRIMARY KEY (date, fridge_id)
);

-- Снимок порций на момент закрытия: сколько каждого блюда нужно холодильнику.
-- Позднейшие изменения заказов (например, отмена при удалении аккаунта) сюда не попадают.
CREATE TABLE kitchen_closure_items (
  date TEXT NOT NULL,
  fridge_id TEXT NOT NULL,
  dish_id INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (date, fridge_id, dish_id),
  FOREIGN KEY (date, fridge_id) REFERENCES kitchen_closures (date, fridge_id) ON DELETE CASCADE
);

-- Партия блюда на дату выдачи: planned → confirmed → cooked.
-- В партию входят порции всех холодильников и запас на брак; разбивка по холодильникам
-- берётся из снимка закрытия. Название, состав, КБЖУ и срок хранения сохранены на партии,
-- чтобы этикетка не менялась, если блюдо потом поправили.
CREATE TABLE kitchen_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  dish_id INTEGER NOT NULL,
  seq INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'confirmed', 'cooked')),
  planned_qty INTEGER NOT NULL CHECK (planned_qty >= 0),
  buffer_qty INTEGER NOT NULL DEFAULT 0 CHECK (buffer_qty >= 0),
  -- JSON: имена и составы RU/RO, КБЖУ, вес, аллергены, срок хранения в часах
  dish_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  confirmed_by INTEGER,
  cooked_at TEXT,
  cooked_by INTEGER,
  eat_by TEXT,
  UNIQUE (date, dish_id, seq)
);

CREATE INDEX idx_kitchen_batches_date ON kitchen_batches (date, status);
