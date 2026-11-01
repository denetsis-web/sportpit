-- Заказы на завтра и пауза пакета (R02, R10, R23, R24, R27, R39, R43, R46, R59).
-- Время хранится в UTC (ISO 8601), день выдачи — календарная дата по Кишинёву (YYYY-MM-DD).
-- Идентификатор холодильника — ТЕКСТ без внешнего ключа (как в operator_fridges и fridges);
-- идентификатор заказа — ТЕКСТ (его же хранит credit_ledger.order_id).

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id),
  fridge_id TEXT NOT NULL,
  -- день выдачи
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'loaded', 'picked_up', 'written_off')),
  -- одноразовый код получения из 4 цифр
  code TEXT NOT NULL CHECK (length(code) = 4 AND code NOT GLOB '*[^0-9]*'),
  -- число боксов = сумма количеств позиций
  boxes INTEGER NOT NULL CHECK (boxes > 0),
  -- ключ идемпотентности подтверждения: повтор с тем же ключом не создаёт второй заказ
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, idempotency_key)
);

-- Код уникален на холодильник и дату среди действующих заказов: отменённый заказ код освобождает.
CREATE UNIQUE INDEX idx_orders_code ON orders (fridge_id, date, code) WHERE status <> 'cancelled';
CREATE INDEX idx_orders_fridge_date ON orders (fridge_id, date, status);
CREATE INDEX idx_orders_user_date ON orders (user_id, date, status);
CREATE INDEX idx_orders_date_status ON orders (date, status);

-- Позиции заказа. Название и КБЖУ одной порции сохранены на момент заказа:
-- история заказов не меняется, даже если блюдо потом отключили или поправили.
CREATE TABLE order_items (
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  dish_id INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  name_ru TEXT NOT NULL,
  name_ro TEXT NOT NULL,
  calories INTEGER NOT NULL,
  protein_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fiber_g REAL NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (order_id, dish_id)
);

CREATE INDEX idx_order_items_dish ON order_items (dish_id);

-- История переходов статуса: кто и когда перевёл заказ. Только добавляется.
CREATE TABLE order_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_user_id INTEGER,
  at TEXT NOT NULL
);

CREATE INDEX idx_order_transitions_order ON order_transitions (order_id, id);

-- Пауза пакета (R27.1): один раз на лот кредитов, до 14 дней. Срок лота (credit_lots.expires_at)
-- сдвигается на дни паузы; прежний срок сохранён здесь, чтобы сдвиг был виден и проверяем.
CREATE TABLE lot_pauses (
  lot_id INTEGER PRIMARY KEY REFERENCES credit_lots (id),
  user_id INTEGER NOT NULL REFERENCES users (id),
  -- первый и последний день паузы (календарные дни по Кишинёву)
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  days INTEGER NOT NULL CHECK (days BETWEEN 1 AND 14),
  previous_expires_at TEXT NOT NULL,
  new_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (ends_on >= starts_on)
);

CREATE INDEX idx_lot_pauses_user ON lot_pauses (user_id, starts_on);
