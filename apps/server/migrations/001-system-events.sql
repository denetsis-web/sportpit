-- События системы (R57): сбои оплаты и SMS, ошибки сервера, служебные записи.
-- Время хранится в UTC (ISO 8601), детали — JSON-строка.
CREATE TABLE system_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_system_events_created ON system_events (created_at);
CREATE INDEX idx_system_events_kind_created ON system_events (kind, created_at);
