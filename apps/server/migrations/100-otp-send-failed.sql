-- Неудавшаяся отправка SMS остаётся в таблице и занимает квоту «5 кодов в час» на номер (F1.4),
-- но не мешает повторить запрос сразу и не считается действующим кодом.
ALTER TABLE otp_codes ADD COLUMN send_failed INTEGER NOT NULL DEFAULT 0;
