-- Залы, холодильники, настройки, журнал действий, блюда, меню и рейтинги (R03, R07, R14, R18, R19, R36, R43, R45, R46).
-- Время хранится в UTC (ISO 8601), деньги в этом модуле не участвуют.
-- Идентификаторы залов и холодильников — ТЕКСТ без внешнего ключа в чужих таблицах
-- (operator_fridges.fridge_id из 010-auth.sql хранит тот же идентификатор).

CREATE TABLE gyms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  -- доля зала в процентах от выручки выданных боксов
  share_percent REAL NOT NULL DEFAULT 0 CHECK (share_percent >= 0 AND share_percent <= 100),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE fridges (
  id TEXT PRIMARY KEY,
  gym_id TEXT NOT NULL REFERENCES gyms (id),
  name TEXT NOT NULL,
  capacity_boxes INTEGER NOT NULL CHECK (capacity_boxes >= 0),
  -- время дня D-1, до которого принимаются заказы на день D (HH:MM, Europe/Chisinau)
  cutoff_time TEXT NOT NULL DEFAULT '18:00',
  -- окно выдачи (HH:MM, Europe/Chisinau)
  pickup_from TEXT NOT NULL DEFAULT '07:00',
  pickup_to TEXT NOT NULL DEFAULT '22:00',
  -- необязательный код замка; физический замок не интегрируется
  access_code TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_fridges_gym ON fridges (gym_id);

-- Настройки одним местом: ключ → значение в JSON. Нет строки — действует значение по умолчанию.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Журнал действий администратора (R55): записи только добавляются.
CREATE TABLE admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_admin_audit_created ON admin_audit (id DESC);

-- Блюда. Названия и составы парами RU/RO; граммы — вещественные числа (32,5 г белка).
CREATE TABLE dishes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ru TEXT NOT NULL,
  name_ro TEXT NOT NULL,
  composition_ru TEXT NOT NULL,
  composition_ro TEXT NOT NULL,
  calories INTEGER NOT NULL CHECK (calories >= 0),
  protein_g REAL NOT NULL CHECK (protein_g >= 0),
  fat_g REAL NOT NULL CHECK (fat_g >= 0),
  carbs_g REAL NOT NULL CHECK (carbs_g >= 0),
  fiber_g REAL NOT NULL CHECK (fiber_g >= 0),
  weight_g INTEGER NOT NULL CHECK (weight_g > 0),
  -- JSON-массивы кодов: аллергены и цели (lose, maintain, gain)
  allergens TEXT NOT NULL DEFAULT '[]',
  goals TEXT NOT NULL DEFAULT '[]',
  vegetarian INTEGER NOT NULL DEFAULT 0 CHECK (vegetarian IN (0, 1)),
  shelf_life_hours INTEGER NOT NULL CHECK (shelf_life_hours > 0),
  -- ключ файла в FileStorage; публичный адрес даёт storage.urlFor(ключ)
  photo_key TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Меню на день D: опубликованный день виден клиентам.
CREATE TABLE menu_days (
  date TEXT PRIMARY KEY,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  published_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_menu_days_published ON menu_days (published, date);

CREATE TABLE menu_items (
  date TEXT NOT NULL REFERENCES menu_days (date) ON DELETE CASCADE,
  dish_id INTEGER NOT NULL REFERENCES dishes (id),
  portion_limit INTEGER NOT NULL CHECK (portion_limit >= 0),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, dish_id)
);

CREATE INDEX idx_menu_items_dish ON menu_items (dish_id);

-- Рейтинг блюда: сумма звёзд и число оценок. Пишет только catalog.applyRating (его зовёт модуль feedback).
CREATE TABLE dish_rating_stats (
  dish_id INTEGER PRIMARY KEY REFERENCES dishes (id),
  rating_sum INTEGER NOT NULL DEFAULT 0 CHECK (rating_sum >= 0),
  rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0)
);
