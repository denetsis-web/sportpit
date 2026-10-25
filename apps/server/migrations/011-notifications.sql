-- Внутренние уведомления (колокольчик). Web Push вне рамок.
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credits_expiring', 'rate_dish', 'complaint_resolved', 'system_alert')),
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE INDEX idx_notifications_user ON notifications (user_id, id);
CREATE INDEX idx_notifications_type_created ON notifications (type, created_at);
