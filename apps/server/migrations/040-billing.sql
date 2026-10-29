-- Пакеты, оплата и кредиты (R05, R09, R20, R21, R22, R41, R42, R47–R51).
-- Деньги — целые бани, время — UTC (ISO 8601). Данных карты в базе нет и быть не может.
--
-- Главное правило: баланс кредитов НЕ хранится. Он равен сумме credit_ledger.delta.
-- Журнал только добавляется (триггеры запрещают UPDATE и DELETE); исправление — новая
-- компенсирующая запись с причиной. Кредиты живут лотами (credit_lots): покупка создаёт лот
-- с ценой кредита и сроком; остаток лота — тоже сумма журнала по lot_id.

-- Пакеты: администратор меняет цену и состав без релиза. Купленное хранит снимок в purchases.
CREATE TABLE packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  boxes INTEGER NOT NULL CHECK (boxes BETWEEN 1 AND 1000),
  price_per_box_bani INTEGER NOT NULL CHECK (price_per_box_bani > 0),
  validity_days INTEGER NOT NULL DEFAULT 45 CHECK (validity_days BETWEEN 1 AND 365),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Стартовые пакеты 12 / 20 / 30 и разовый бокс: 119 / 109 / 99 / 129 лей за бокс.
INSERT INTO packages (boxes, price_per_box_bani, validity_days, active, sort_order, created_at, updated_at)
VALUES
  (12, 11900, 45, 1, 10, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  (20, 10900, 45, 1, 20, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  (30, 9900, 45, 1, 30, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  (1, 12900, 45, 1, 40, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

-- Промокоды: процент, фиксированная сумма (бани) или бесплатные кредиты.
-- Даты действия — календарные дни по Кишинёву, обе границы включительно.
CREATE TABLE promo_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed', 'free_credits')),
  value INTEGER NOT NULL CHECK (value > 0),
  owner_label TEXT,
  valid_from TEXT,
  valid_until TEXT,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  once_per_user INTEGER NOT NULL DEFAULT 1 CHECK (once_per_user IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (kind <> 'percent' OR value BETWEEN 1 AND 100)
);

-- Покупка = одна попытка оплаты. Повтор после отказа создаёт новую запись.
-- Цена, число боксов и срок — снимок на момент покупки: правка пакета на неё не влияет.
CREATE TABLE purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id),
  package_id INTEGER NOT NULL REFERENCES packages (id),
  boxes INTEGER NOT NULL CHECK (boxes > 0),
  validity_days INTEGER NOT NULL CHECK (validity_days > 0),
  list_price_per_box_bani INTEGER NOT NULL CHECK (list_price_per_box_bani > 0),
  -- цена кредита после скидки; total_bani = unit_price_bani * boxes
  unit_price_bani INTEGER NOT NULL CHECK (unit_price_bani >= 0),
  discount_bani INTEGER NOT NULL DEFAULT 0 CHECK (discount_bani >= 0),
  total_bani INTEGER NOT NULL CHECK (total_bani >= 0),
  promo_id INTEGER REFERENCES promo_codes (id),
  method TEXT NOT NULL CHECK (method IN ('card', 'mia')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  -- declined — отказ шлюза; cancelled — клиент отменил; expired — не дождались оплаты; error — шлюз недоступен
  failure_code TEXT CHECK (failure_code IS NULL OR failure_code IN ('declined', 'cancelled', 'expired', 'error')),
  failure_reason TEXT,
  idempotency_key TEXT NOT NULL,
  provider TEXT,
  provider_payment_id TEXT,
  redirect_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT,
  UNIQUE (user_id, idempotency_key),
  CHECK (total_bani = unit_price_bani * boxes),
  CHECK ((status = 'failed') = (failure_code IS NOT NULL))
);

CREATE UNIQUE INDEX idx_purchases_provider_payment ON purchases (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
CREATE INDEX idx_purchases_user ON purchases (user_id, id);
CREATE INDEX idx_purchases_status_created ON purchases (status, created_at);
CREATE INDEX idx_purchases_paid_at ON purchases (paid_at);

-- Применения промокода. reserved — покупка ещё не оплачена, redeemed — оплачена, released — отменена.
-- Лимит использований и «один раз на клиента» считают reserved + redeemed. purchase_id пуст
-- у бесплатных кредитов, которые зачисляются сразу.
CREATE TABLE promo_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promo_id INTEGER NOT NULL REFERENCES promo_codes (id),
  user_id INTEGER NOT NULL REFERENCES users (id),
  purchase_id INTEGER UNIQUE REFERENCES purchases (id),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'redeemed', 'released')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_promo_redemptions_promo ON promo_redemptions (promo_id, status);
CREATE INDEX idx_promo_redemptions_user ON promo_redemptions (promo_id, user_id, status);

-- Событие шлюза обрабатывается один раз: повторная доставка того же eventId ничего не меняет.
CREATE TABLE payment_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  purchase_id INTEGER NOT NULL REFERENCES purchases (id),
  received_at TEXT NOT NULL,
  PRIMARY KEY (provider, event_id)
);

-- Лот кредитов. Начальное число — credits; остаток считается по журналу.
-- expired_at ставит задача сгорания (пусто, пока лот не обработан); notified_at — уведомление за 7 дней.
-- origin_lot_id у перенесённых кредитов указывает на сгоревший лот, из которого они пришли.
CREATE TABLE credit_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id),
  purchase_id INTEGER REFERENCES purchases (id),
  source TEXT NOT NULL CHECK (source IN ('purchase', 'promo', 'carryover', 'complaint')),
  origin_lot_id INTEGER REFERENCES credit_lots (id),
  credits INTEGER NOT NULL CHECK (credits > 0),
  unit_price_bani INTEGER NOT NULL CHECK (unit_price_bani >= 0),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  expired_at TEXT,
  notified_at TEXT,
  CHECK ((source = 'carryover') = (origin_lot_id IS NOT NULL))
);

CREATE INDEX idx_credit_lots_user_expiry ON credit_lots (user_id, expires_at);
CREATE INDEX idx_credit_lots_due ON credit_lots (expired_at, expires_at);
CREATE INDEX idx_credit_lots_origin ON credit_lots (origin_lot_id);
CREATE UNIQUE INDEX idx_credit_lots_purchase ON credit_lots (purchase_id) WHERE source = 'purchase';

-- Возвраты. Кредиты списываются записью журнала до обращения к шлюзу; при отказе шлюза
-- они возвращаются компенсирующей записью adjustment.
CREATE TABLE refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases (id),
  lot_id INTEGER NOT NULL REFERENCES credit_lots (id),
  user_id INTEGER NOT NULL REFERENCES users (id),
  admin_id INTEGER,
  credits INTEGER NOT NULL CHECK (credits > 0),
  unit_price_bani INTEGER NOT NULL CHECK (unit_price_bani > 0),
  amount_bani INTEGER NOT NULL CHECK (amount_bani = credits * unit_price_bani),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'done', 'failed')),
  provider_refund_id TEXT,
  failure_detail TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_refunds_purchase ON refunds (purchase_id);
CREATE INDEX idx_refunds_created ON refunds (id DESC);

-- Журнал кредитов. delta — изменение баланса: покупка, перенос, возврат резерва и кредит по жалобе
-- положительны; резерв, сгорание и возврат денег отрицательны; adjustment — компенсация любого знака.
-- consume — отметка «зарезервированные кредиты заказа использованы» (баланс не меняет, lot_id пуст):
-- сами кредиты ушли из баланса при резерве. По какому лоту сколько ушло, видно по записям reserve/release заказа.
-- idem_key защищает от двойной записи одной и той же операции (покупка, сгорание лота, возврат…).
CREATE TABLE credit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (id),
  lot_id INTEGER REFERENCES credit_lots (id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'purchase', 'reserve', 'release', 'consume', 'expire', 'carryover', 'refund', 'complaint_credit', 'adjustment'
  )),
  order_id TEXT,
  purchase_id INTEGER REFERENCES purchases (id),
  complaint_id TEXT,
  refund_id INTEGER REFERENCES refunds (id),
  memo TEXT,
  idem_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  CHECK (
    (reason = 'consume' AND delta = 0 AND lot_id IS NULL AND order_id IS NOT NULL)
    OR (reason <> 'consume' AND delta <> 0 AND lot_id IS NOT NULL)
  ),
  CHECK (reason NOT IN ('purchase', 'release', 'carryover', 'complaint_credit') OR delta > 0),
  CHECK (reason NOT IN ('reserve', 'expire', 'refund') OR delta < 0),
  CHECK (reason NOT IN ('reserve', 'release') OR order_id IS NOT NULL)
);

CREATE INDEX idx_credit_ledger_user ON credit_ledger (user_id, id);
CREATE INDEX idx_credit_ledger_lot ON credit_ledger (lot_id);
CREATE INDEX idx_credit_ledger_order ON credit_ledger (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_credit_ledger_reason_created ON credit_ledger (reason, created_at);

-- Записи журнала не правятся и не удаляются.
CREATE TRIGGER credit_ledger_no_update BEFORE UPDATE ON credit_ledger
BEGIN
  SELECT RAISE(ABORT, 'credit_ledger is append-only');
END;

CREATE TRIGGER credit_ledger_no_delete BEFORE DELETE ON credit_ledger
BEGIN
  SELECT RAISE(ABORT, 'credit_ledger is append-only');
END;

-- Остаток лота не может уйти в минус (возврат больше остатка, двойное списание).
CREATE TRIGGER credit_ledger_lot_not_overdrawn BEFORE INSERT ON credit_ledger
WHEN NEW.lot_id IS NOT NULL AND NEW.delta < 0
BEGIN
  SELECT RAISE(ABORT, 'lot_overdrawn')
  WHERE (SELECT COALESCE(SUM(delta), 0) FROM credit_ledger WHERE lot_id = NEW.lot_id) + NEW.delta < 0;
END;

-- Возврат резерва не может превысить то, что заказ по этому лоту зарезервировал
-- (двойное «release» одного заказа не создаёт кредитов из воздуха).
CREATE TRIGGER credit_ledger_release_not_over_reserved BEFORE INSERT ON credit_ledger
WHEN NEW.reason = 'release'
BEGIN
  SELECT RAISE(ABORT, 'release_exceeds_reserve')
  WHERE (
    SELECT COALESCE(-SUM(delta), 0) FROM credit_ledger
    WHERE order_id = NEW.order_id AND lot_id = NEW.lot_id AND reason IN ('reserve', 'release')
  ) - NEW.delta < 0;
END;
