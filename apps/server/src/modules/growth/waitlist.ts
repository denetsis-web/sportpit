// Лист ожидания: приём записи, список с фильтрами, удаление. Анонимный номер хранится в таблице,
// но в WaitlistEntryDto не попадает: наружу идут только отметки пути (`path`).
import {
  WAITLIST_CONSENT_VERSION,
  WAITLIST_PAGE_SIZE,
  type WaitlistEntryDto,
  type WaitlistJoin,
  type WaitlistList,
  type WaitlistListQuery,
} from '@sportpit/shared/schemas/growth';
import { cleanPhoneInput } from '@sportpit/shared/schemas/auth';
import { addDaysISO, localToUtc } from '@sportpit/shared/time';
import type { Clock } from '../clock/index.ts';
import type { Db } from '../db/index.ts';
import { AppError } from '../system/errors.ts';
import { recordEvent, resolveAttribution } from './events.ts';

/** Фильтры списка: те же для экрана и для CSV. */
export type WaitlistFilters = Omit<WaitlistListQuery, 'page'>;

const blank = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  return text ? text : null;
};

/**
 * Принимает запись. Возвращает `true`, если создана новая строка, и `false`, если номер уже есть:
 * дубль ничего не меняет и не пишет события. Согласие считается данным при первой записи.
 */
export function joinWaitlist(db: Db, clock: Pick<Clock, 'now'>, input: WaitlistJoin): boolean {
  const attribution = resolveAttribution(input.attribution);
  const name = blank(input.name);
  const gym = blank(input.gym);
  const now = clock.now().toISOString();
  return db.tx((tx) => {
    const { changes } = tx.run(
      `INSERT INTO waitlist_entries
         (phone, name, gym, name_key, gym_key, goal, lang, source, ref, campaign, anon_id,
          consent_version, consent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (phone) DO NOTHING`,
      [
        input.phone,
        name,
        gym,
        name?.toLowerCase() ?? null,
        gym?.toLowerCase() ?? null,
        input.goal ?? null,
        input.lang,
        attribution.source,
        attribution.ref,
        attribution.campaign,
        attribution.anonId,
        WAITLIST_CONSENT_VERSION,
        now,
        now,
      ],
    );
    if (changes === 0) return false;
    recordEvent(tx, clock, 'waitlist_join', attribution);
    return true;
  });
}

const badRange = () => new AppError(400, 'bad_range', 'growth.error.range');

function whereOf(filters: WaitlistFilters): { sql: string; params: Array<string | number> } {
  const parts: string[] = [];
  const params: Array<string | number> = [];
  if (filters.q) {
    const phone = cleanPhoneInput(filters.q);
    const text = filters.q.toLowerCase();
    if (phone) {
      parts.push('(instr(w.phone, ?) > 0 OR instr(w.name_key, ?) > 0)');
      params.push(phone, text);
    } else {
      parts.push('instr(w.name_key, ?) > 0');
      params.push(text);
    }
  }
  if (filters.gym) {
    parts.push('instr(w.gym_key, ?) > 0');
    params.push(filters.gym.toLowerCase());
  }
  if (filters.goal) {
    parts.push('w.goal = ?');
    params.push(filters.goal);
  }
  if (filters.lang) {
    parts.push('w.lang = ?');
    params.push(filters.lang);
  }
  if (filters.source) {
    parts.push('w.source = ?');
    params.push(filters.source);
  }
  if (filters.from && filters.to && filters.from > filters.to) throw badRange();
  // День записи — по Кишинёву, обе границы включительно.
  if (filters.from) {
    parts.push('w.created_at >= ?');
    params.push(localToUtc(filters.from, '00:00').toISOString());
  }
  if (filters.to) {
    parts.push('w.created_at < ?');
    params.push(localToUtc(addDaysISO(filters.to, 1), '00:00').toISOString());
  }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

interface Row {
  id: number;
  phone: string;
  name: string | null;
  gym: string | null;
  goal: WaitlistEntryDto['goal'];
  lang: WaitlistEntryDto['lang'];
  source: WaitlistEntryDto['source'];
  ref: string | null;
  campaign: string | null;
  created_at: string;
  has_anon: number;
  used_calc: number;
  signed_up: number;
  purchased: number;
}

// Отметки пути считаются по анонимному номеру: расчёт нормы (событие), регистрация (источник регистрации),
// покупка (оплаченная покупка зарегистрированного с этим номером). Без номера — NULL, то есть данных нет.
const SELECT = `
  SELECT w.id, w.phone, w.name, w.gym, w.goal, w.lang, w.source, w.ref, w.campaign, w.created_at,
    w.anon_id IS NOT NULL AS has_anon,
    EXISTS (SELECT 1 FROM funnel_events e
            WHERE e.anon_id = w.anon_id AND e.kind = 'calc_used') AS used_calc,
    EXISTS (SELECT 1 FROM signup_attribution s WHERE s.anon_id = w.anon_id) AS signed_up,
    EXISTS (SELECT 1 FROM signup_attribution s
            JOIN purchases p ON p.user_id = s.user_id AND p.status = 'paid'
            WHERE s.anon_id = w.anon_id) AS purchased
  FROM waitlist_entries w`;

const ORDER = 'ORDER BY w.created_at DESC, w.id DESC';

function toDto(row: Row): WaitlistEntryDto {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    gym: row.gym,
    goal: row.goal,
    lang: row.lang,
    source: row.source,
    ref: row.ref,
    campaign: row.campaign,
    createdAt: row.created_at,
    path: row.has_anon
      ? {
          usedCalc: row.used_calc === 1,
          signedUp: row.signed_up === 1,
          purchased: row.purchased === 1,
        }
      : null,
  };
}

export function listWaitlist(db: Db, query: WaitlistListQuery): WaitlistList {
  const { page, ...filters } = query;
  const { sql, params } = whereOf(filters);
  const total = db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM waitlist_entries w ${sql}`,
    params,
  )!.n;
  const rows = db.query<Row>(`${SELECT} ${sql} ${ORDER} LIMIT ? OFFSET ?`, [
    ...params,
    WAITLIST_PAGE_SIZE,
    (page - 1) * WAITLIST_PAGE_SIZE,
  ]);
  return { items: rows.map(toDto), total, page, pageSize: WAITLIST_PAGE_SIZE };
}

/** Все записи по фильтрам, без страниц: для выгрузки. */
export function allWaitlist(db: Db, filters: WaitlistFilters): WaitlistEntryDto[] {
  const { sql, params } = whereOf(filters);
  return db.query<Row>(`${SELECT} ${sql} ${ORDER}`, params).map(toDto);
}

/** Удаляет запись; `false`, если такой нет. */
export function deleteWaitlistEntry(db: Db, id: number): boolean {
  return db.run('DELETE FROM waitlist_entries WHERE id = ?', [id]).changes > 0;
}
