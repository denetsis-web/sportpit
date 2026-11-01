-- Выдача: загрузка холодильников, закрытие дня, списания и температура (R11, R25, R34, R35, R40, R45).
-- Идентификатор холодильника — ТЕКСТ без внешнего ключа (как в orders и operator_fridges).
-- Время хранится в UTC (ISO 8601), день выдачи — календарная дата по Кишинёву (YYYY-MM-DD).

-- Отметка «загружено»: одна строка на холодильник и дату. Открывает клиентам получение.
CREATE TABLE fridge_loads (
  fridge_id TEXT NOT NULL,
  date TEXT NOT NULL,
  loaded_at TEXT NOT NULL,
  loaded_by INTEGER,
  PRIMARY KEY (fridge_id, date)
);

-- Закрытие дня по холодильнику. Появляется один раз и больше не меняется.
-- remaining_boxes — фактический остаток, названный оператором (NULL при автозакрытии);
-- expected_boxes — сколько боксов должно было остаться по заказам («загружен», но не выдан).
CREATE TABLE day_closures (
  fridge_id TEXT NOT NULL,
  date TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  closed_by INTEGER,
  source TEXT NOT NULL CHECK (source IN ('operator', 'system')),
  remaining_boxes INTEGER CHECK (remaining_boxes IS NULL OR remaining_boxes >= 0),
  expected_boxes INTEGER NOT NULL DEFAULT 0 CHECK (expected_boxes >= 0),
  PRIMARY KEY (fridge_id, date)
);

-- Списание заказа при закрытии дня. Кредит заказа остаётся потраченным (billing.consume):
-- вернуть его можно только решением по жалобе.
CREATE TABLE order_write_offs (
  order_id TEXT PRIMARY KEY REFERENCES orders (id),
  fridge_id TEXT NOT NULL,
  date TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('not_picked_up', 'defect', 'expired', 'other')),
  source TEXT NOT NULL CHECK (source IN ('operator', 'system')),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_order_write_offs_date ON order_write_offs (date, fridge_id);

-- Списание бокса без заказа (лишний бокс в холодильнике): блюдо может быть неизвестно.
CREATE TABLE write_offs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fridge_id TEXT NOT NULL,
  date TEXT NOT NULL,
  dish_id INTEGER,
  reason TEXT NOT NULL CHECK (reason IN ('not_picked_up', 'defect', 'expired', 'other')),
  qty INTEGER NOT NULL CHECK (qty > 0),
  source TEXT NOT NULL CHECK (source IN ('operator', 'system')),
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_write_offs_date ON write_offs (date, fridge_id);

-- Журнал температуры: два замера в день (утро, вечер); повторный ввод того же замера исправляет значение.
CREATE TABLE temperature_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fridge_id TEXT NOT NULL,
  date TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('morning', 'evening')),
  celsius REAL NOT NULL,
  out_of_range INTEGER NOT NULL CHECK (out_of_range IN (0, 1)),
  recorded_at TEXT NOT NULL,
  recorded_by INTEGER,
  UNIQUE (fridge_id, date, slot)
);

CREATE INDEX idx_temperature_logs_date ON temperature_logs (date, fridge_id);
