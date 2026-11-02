// Коды входа (OTP): выпуск, лимиты запросов, проверка. Хранится только HMAC-хэш кода;
// сам код есть лишь в SMS. Коды и токены не пишутся ни в журналы, ни в ответы API.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { t, type Lang } from '@sportpit/shared/i18n';
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_HOUR,
  OTP_RESEND_SECONDS,
  OTP_TTL_SECONDS,
} from '@sportpit/shared/schemas/auth';
import type { SmsSender } from '../adapters/index.ts';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { AppError } from '../system/errors.ts';

const HOUR_MS = 60 * 60 * 1000;

interface OtpRow {
  id: number;
  code_hash: string;
  created_at: string;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
}

export interface OtpDeps {
  db: Db;
  clock: Clock;
  sms: SmsSender;
  /** Секрет для хэша кодов. Не задан — на время работы процесса берётся случайный. */
  secret: string | undefined;
}

export interface OtpService {
  /** Выпускает код и отправляет SMS. Бросает 429 при превышении лимитов, 502 при сбое SMS. */
  request(
    phone: string,
    lang: Lang,
  ): Promise<{ retryAfterSeconds: number; expiresInSeconds: number }>;
  /** Проверяет код; при успехе гасит его. Бросает 400/429 с понятным текстом. */
  check(phone: string, code: string): void;
  /** Удаляет старые коды (задача очистки). */
  purge(olderThanHours?: number): number;
}

export function createOtpService({ db, clock, sms, secret }: OtpDeps): OtpService {
  const key = secret ?? randomBytes(32).toString('hex');
  const hash = (phone: string, code: string): Buffer =>
    createHmac('sha256', key).update(`otp:${phone}:${code}`).digest();

  /** Сколько секунд ждать до следующего запроса (0 — можно). Вызывается внутри транзакции. */
  function waitSeconds(tx: Db, phone: string, now: Date): number {
    const hourAgo = new Date(now.getTime() - HOUR_MS).toISOString();
    const rows = tx.query<{ created_at: string; send_failed: number }>(
      'SELECT created_at, send_failed FROM otp_codes WHERE phone = ? AND created_at > ? ORDER BY created_at DESC',
      [phone, hourAgo],
    );
    // квоту «в час» занимают и неудавшиеся отправки; «раз в минуту» считается только по ушедшим кодам
    const recent = rows.map((r) => new Date(r.created_at).getTime());
    const lastSent = rows.find((r) => r.send_failed === 0);
    let waitMs = 0;
    if (lastSent) {
      waitMs = Math.max(
        waitMs,
        new Date(lastSent.created_at).getTime() + OTP_RESEND_SECONDS * 1000 - now.getTime(),
      );
    }
    if (recent.length >= OTP_MAX_PER_HOUR) {
      // окно освободится, когда самый старый из последних пяти запросов выйдет за час
      const oldestInWindow = recent[OTP_MAX_PER_HOUR - 1]!;
      waitMs = Math.max(waitMs, oldestInWindow + HOUR_MS - now.getTime());
    }
    return waitMs > 0 ? Math.ceil(waitMs / 1000) : 0;
  }

  return {
    async request(phone, lang) {
      const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
      // Проверка лимита и запись строки — одна транзакция, поэтому два одновременных запроса
      // не обойдут лимит; SMS уходит уже после записи.
      const rowId = db.tx((tx) => {
        const now = clock.now();
        const wait = waitSeconds(tx, phone, now);
        if (wait > 0) {
          throw new AppError(429, 'rate_limited', 'auth.error.rateLimited', {
            params: { seconds: wait },
          });
        }
        const expires = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
        const { lastInsertRowid } = tx.run(
          'INSERT INTO otp_codes (phone, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?)',
          [phone, hash(phone, code).toString('hex'), now.toISOString(), expires.toISOString()],
        );
        return Number(lastInsertRowid);
      });
      try {
        await sms.send({ to: phone, text: t(lang, 'auth.sms.text', { code }) });
      } catch {
        // Сбой уже записан в журнал событий обёрткой адаптера (sms_failed). Код не ушёл: строка остаётся
        // только как расход квоты «в час» (иначе сбойный провайдер позволил бы слать без счёта),
        // но повторить можно сразу и проверяться по ней нельзя.
        db.run('UPDATE otp_codes SET send_failed = 1 WHERE id = ?', [rowId]);
        throw new AppError(502, 'sms_failed', 'auth.error.smsFailed');
      }
      return { retryAfterSeconds: OTP_RESEND_SECONDS, expiresInSeconds: OTP_TTL_SECONDS };
    },

    check(phone, code) {
      const failure = db.tx((tx): AppError | undefined => {
        const now = clock.now().toISOString();
        const row = tx.get<OtpRow>(
          'SELECT id, code_hash, created_at, expires_at, attempts, consumed_at FROM otp_codes WHERE phone = ? AND send_failed = 0 ORDER BY id DESC LIMIT 1',
          [phone],
        );
        if (!row || row.consumed_at !== null || row.expires_at <= now) {
          return new AppError(400, 'otp_expired', 'auth.error.codeExpired');
        }
        if (row.attempts >= OTP_MAX_ATTEMPTS) {
          return new AppError(429, 'otp_attempts_exceeded', 'auth.error.codeAttempts');
        }
        const stored = Buffer.from(row.code_hash, 'hex');
        const given = hash(phone, code);
        // сравнение постоянное по времени
        const same = stored.length === given.length && timingSafeEqual(stored, given);
        const attempts = row.attempts + 1;
        if (same) {
          tx.run('UPDATE otp_codes SET attempts = ?, consumed_at = ? WHERE id = ?', [
            attempts,
            now,
            row.id,
          ]);
          return undefined;
        }
        tx.run('UPDATE otp_codes SET attempts = ? WHERE id = ?', [attempts, row.id]);
        return new AppError(400, 'otp_invalid', 'auth.error.codeWrong', {
          params: { attemptsLeft: OTP_MAX_ATTEMPTS - attempts },
        });
      });
      if (failure) throw failure;
    },

    purge(olderThanHours = 24) {
      const cutoff = new Date(clock.now().getTime() - olderThanHours * HOUR_MS).toISOString();
      return db.run('DELETE FROM otp_codes WHERE created_at < ?', [cutoff]).changes;
    },
  };
}
