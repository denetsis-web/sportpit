-- Оценки блюд и жалобы (R26, R30, R38, R44). Время — UTC (ISO 8601).
-- Идентификаторы заказа и жалобы — ТЕКСТ. Ключи фото жалоб лежат в FileStorage под префиксом
-- `complaints/` и наружу публичным путём не отдаются (отдаёт только модуль feedback, с проверкой прав).

-- Один отзыв на блюдо в заказе: правка в течение 24 часов от created_at.
CREATE TABLE dish_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders (id),
  dish_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users (id),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  tag TEXT CHECK (tag IS NULL OR tag IN ('taste', 'freshness', 'portion', 'kbzhu')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (order_id, dish_id)
);
CREATE INDEX idx_dish_ratings_dish ON dish_ratings (dish_id, id);
CREATE INDEX idx_dish_ratings_user ON dish_ratings (user_id, id);

CREATE TABLE complaints (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id),
  order_id TEXT NOT NULL REFERENCES orders (id),
  dish_id INTEGER,
  reason TEXT NOT NULL CHECK (reason IN ('spoiled', 'wrong_dish', 'damaged', 'missing', 'kbzhu', 'other')),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('replacement', 'refund', 'reject')),
  -- комментарий администратора (при отказе обязателен)
  comment TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by INTEGER
);
CREATE INDEX idx_complaints_user ON complaints (user_id, created_at);
CREATE INDEX idx_complaints_status ON complaints (status, created_at);
CREATE INDEX idx_complaints_order ON complaints (order_id);

CREATE TABLE complaint_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id TEXT NOT NULL REFERENCES complaints (id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_complaint_photos_complaint ON complaint_photos (complaint_id);

-- История жалобы: подана → замена | возврат | отказ.
CREATE TABLE complaint_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id TEXT NOT NULL REFERENCES complaints (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('created', 'replacement', 'refund', 'rejected')),
  actor_id INTEGER,
  comment TEXT,
  at TEXT NOT NULL
);
CREATE INDEX idx_complaint_events_complaint ON complaint_events (complaint_id, id);

-- Файлы, которые нужно удалить из хранилища после фиксации транзакции (удаление аккаунта идёт
-- синхронным хуком, а хранилище файлов асинхронное): хук кладёт ключи сюда, затем их забирает чистка.
CREATE TABLE feedback_file_trash (
  storage_key TEXT PRIMARY KEY,
  queued_at TEXT NOT NULL
);
