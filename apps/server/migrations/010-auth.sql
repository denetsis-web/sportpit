-- Вход, роли, сессии и согласия (R13, R15, R55, R56). Время хранится в UTC (ISO 8601).

-- Пользователь. Телефон уникален; после удаления аккаунта он стирается (NULL), строка остаётся,
-- чтобы заказы и журналы ссылались на «анонимного» пользователя.
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'kitchen', 'operator', 'admin')),
  lang TEXT NOT NULL DEFAULT 'ru' CHECK (lang IN ('ru', 'ro')),
  created_at TEXT NOT NULL,
  last_login_at TEXT,
  deleted_at TEXT
);

CREATE INDEX idx_users_role ON users (role);

-- Холодильники оператора. Идентификатор холодильника — значение без внешнего ключа:
-- таблицу холодильников создаёт другой таск.
CREATE TABLE operator_fridges (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  fridge_id TEXT NOT NULL,
  PRIMARY KEY (user_id, fridge_id)
);

-- Коды входа. Хранится только хэш кода (HMAC), сам код нигде не лежит.
CREATE TABLE otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT
);

CREATE INDEX idx_otp_codes_phone_created ON otp_codes (phone, created_at);

-- Сессии. Хранится хэш токена; сам токен есть только в cookie у человека.
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- История согласий: записи только добавляются. Действует последняя запись по виду согласия.
CREATE TABLE consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('terms', 'privacy', 'health_data')),
  version TEXT NOT NULL,
  granted INTEGER NOT NULL CHECK (granted IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_consents_user_kind ON consents (user_id, kind, id);
