-- Индексы для отчётов (R37.2): период, холодильник и клиент выданных заказов читаются из индекса,
-- таблицы не меняются. Прежние индексы (orders по дате, по холодильнику и дате) остаются.

-- Выданные заказы за период: статус, день выдачи, затем холодильник (продажи по залам) и клиент (активные клиенты, отток).
CREATE INDEX idx_orders_report ON orders (status, date, fridge_id, user_id);

-- Оценки блюд за период.
CREATE INDEX idx_dish_ratings_created ON dish_ratings (created_at, dish_id);

-- Закрытие дней и списания по дате и холодильнику (рейтинги и «списано» в отчёте по выдаче).
CREATE INDEX idx_day_closures_date ON day_closures (date, fridge_id);

-- Оплаченные покупки за период, по размеру пакета.
CREATE INDEX idx_purchases_report ON purchases (status, paid_at, boxes);
