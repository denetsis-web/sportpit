-- Рост: лист ожидания, события лендинга и источник регистраций (модуль growth, ADR 0010).
-- Время — UTC (ISO 8601). Персональные данные здесь: телефон, имя, зал и анонимный номер браузера.
-- Ввод калькулятора нормы не хранится нигде: событие `calc_used` не несёт цифр.

-- Лист ожидания: одна запись на телефон. Повтор того же номера новую строку не создаёт.
CREATE TABLE waitlist_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  gym TEXT,
  -- имя и зал в нижнем регистре: поиск по ним не зависит от регистра (в SQLite он работает только для латиницы)
  name_key TEXT,
  gym_key TEXT,
  goal TEXT CHECK (goal IS NULL OR goal IN ('lose', 'maintain', 'gain')),
  lang TEXT NOT NULL CHECK (lang IN ('ru', 'ro')),
  source TEXT NOT NULL DEFAULT 'direct'
    CHECK (source IN ('gym', 'trainer', 'tg', 'ig', 'direct', 'other')),
  ref TEXT,
  campaign TEXT,
  -- анонимный номер браузера: только если человек принял аналитику; наружу в ответах API не отдаётся
  anon_id TEXT,
  -- согласие на обработку данных для листа: версия текста и момент
  consent_version TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_waitlist_created ON waitlist_entries (created_at);
CREATE INDEX idx_waitlist_anon ON waitlist_entries (anon_id) WHERE anon_id IS NOT NULL;

-- События воронки. Отдельно от system_events: тот журнал про сбои и питает алерты и /api/health.
-- Вид `signup` пишется при создании нового пользователя, `waitlist_join` — при приёме новой записи.
-- К пользователю и телефону событие не привязано.
CREATE TABLE funnel_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('landing_view', 'calc_used', 'waitlist_join', 'signup')),
  source TEXT NOT NULL DEFAULT 'direct'
    CHECK (source IN ('gym', 'trainer', 'tg', 'ig', 'direct', 'other')),
  ref TEXT,
  campaign TEXT,
  anon_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_funnel_events_period ON funnel_events (created_at, kind, source);
CREATE INDEX idx_funnel_events_anon ON funnel_events (anon_id, kind) WHERE anon_id IS NOT NULL;

-- Источник регистрации: одна строка на пользователя, пишется при создании. При удалении аккаунта
-- строку стирает хук модуля (пользователь в таблице users только обезличивается, каскад не сработает).
CREATE TABLE signup_attribution (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'direct'
    CHECK (source IN ('gym', 'trainer', 'tg', 'ig', 'direct', 'other')),
  ref TEXT,
  campaign TEXT,
  anon_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_signup_attribution_created ON signup_attribution (created_at, source);
CREATE INDEX idx_signup_attribution_anon ON signup_attribution (anon_id) WHERE anon_id IS NOT NULL;
