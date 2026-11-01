// Жалобы на бокс (R30, R38, R44): приём с фото, очередь администратора, три исхода решения.
//
// «Замена другим блюдом» и «возврат кредита» дают клиенту один кредит через billing.grantComplaintCredit
// (идемпотентно по номеру жалобы, запись журнала `complaint_credit`); отдельного заказа-замены нет,
// заказы только по предзаказу (D01). Разница исходов — пометка в истории жалобы и текст уведомления.
// «Отказ» требует комментария. Каждое решение пишется в журнал действий администратора.
import { randomUUID } from 'node:crypto';
import { t, type Lang } from '@sportpit/shared/i18n';
import {
  COMPLAINT_DESCRIPTION_MAX,
  PHOTO_MAX_BYTES,
  type AdminComplaintDto,
  type ComplaintDto,
  type ComplaintInput,
  type ResolveInput,
  type SupportDto,
} from '@sportpit/shared/schemas/feedback';
import type { AppDeps } from '../../app.ts';
import { adminFor } from '../admin/index.ts';
import { authFor } from '../auth/index.ts';
import { billingFor } from '../billing/index.ts';
import { notify } from '../notifications/index.ts';
import { ordersFor } from '../orders/index.ts';
import { AppError, errors } from '../system/errors.ts';
import { COMPLAINT_ORDER_STATUSES } from './ratings.ts';
import { COMPLAINT_KEY_PREFIX, sniffPhoto } from './photos.ts';

interface ComplaintRow {
  id: string;
  user_id: number;
  order_id: string;
  dish_id: number | null;
  reason: ComplaintDto['reason'];
  description: string;
  status: ComplaintDto['status'];
  outcome: ComplaintDto['outcome'];
  comment: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: number | null;
}

/** Адрес фото: отдаёт модуль обратной связи с проверкой прав, а не публичный путь файлов. */
export const photoUrl = (complaintId: string, photoId: number): string =>
  `/api/v1/feedback/complaints/${complaintId}/photos/${photoId}`;

const LIST_LIMIT = 200;

export function createComplaints(deps: AppDeps) {
  const { db, clock, storage } = deps;
  const orders = ordersFor(deps);
  const admin = adminFor(deps);
  const auth = authFor(deps);
  const billing = billingFor(deps);

  const rowOf = (id: string): ComplaintRow | undefined =>
    db.get<ComplaintRow>('SELECT * FROM complaints WHERE id = ?', [id]);

  function toDto(row: ComplaintRow): ComplaintDto {
    const order = orders.get(row.order_id);
    const dish =
      row.dish_id === null ? undefined : order?.items.find((i) => i.dishId === row.dish_id);
    return {
      id: row.id,
      orderId: row.order_id,
      orderDate: order?.date ?? null,
      dishId: row.dish_id,
      dishName: dish?.name ?? null,
      reason: row.reason,
      description: row.description,
      status: row.status,
      outcome: row.outcome,
      comment: row.comment,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      photos: db
        .query<{ id: number; content_type: string }>(
          'SELECT id, content_type FROM complaint_photos WHERE complaint_id = ? ORDER BY id',
          [row.id],
        )
        .map((p) => ({ id: p.id, url: photoUrl(row.id, p.id), contentType: p.content_type })),
      history: db
        .query<{
          kind: ComplaintDto['history'][number]['kind'];
          at: string;
          comment: string | null;
        }>('SELECT kind, at, comment FROM complaint_events WHERE complaint_id = ? ORDER BY id', [
          row.id,
        ])
        .map((e) => ({ kind: e.kind, at: e.at, comment: e.comment })),
    };
  }

  function toAdminDto(row: ComplaintRow): AdminComplaintDto {
    const order = orders.get(row.order_id);
    const fridge = order ? admin.getFridge(order.fridgeId) : undefined;
    return {
      ...toDto(row),
      userId: row.user_id,
      fridgeName: fridge?.name ?? null,
      gymName: fridge?.gymName ?? null,
      items: (order?.items ?? []).map((i) => ({ dishId: i.dishId, name: i.name, qty: i.qty })),
    };
  }

  /** На заказ уже есть открытая или решённая жалоба (после отказа можно подать новую). */
  const blocked = (orderId: string): boolean =>
    db.get(`SELECT 1 AS x FROM complaints WHERE order_id = ? AND status IN ('open', 'resolved')`, [
      orderId,
    ]) !== undefined;

  function noticeText(
    lang: Lang,
    outcome: ResolveInput['outcome'],
    comment: string | null,
  ): string {
    return t(lang, `feedback.notify.${outcome}`, { comment: comment ?? '' });
  }

  return {
    complaintBlocked: blocked,

    /** Принимает жалобу: заказ клиента, причина из списка, одно фото JPEG/PNG до 5 МБ (необязательно). */
    async createComplaint(
      userId: number,
      input: ComplaintInput,
      photo?: Uint8Array,
    ): Promise<ComplaintDto> {
      const order = orders.get(input.orderId);
      if (!order || order.userId !== userId) {
        throw new AppError(404, 'order_not_found', 'feedback.error.orderNotFound');
      }
      if (!(COMPLAINT_ORDER_STATUSES as readonly string[]).includes(order.status)) {
        throw new AppError(409, 'order_not_eligible', 'feedback.error.orderNotEligible');
      }
      if (input.dishId !== undefined && !order.items.some((i) => i.dishId === input.dishId)) {
        throw new AppError(404, 'dish_not_in_order', 'feedback.error.dishNotInOrder');
      }
      if (blocked(input.orderId)) {
        throw new AppError(409, 'complaint_exists', 'feedback.error.complaintExists');
      }
      let kind: ReturnType<typeof sniffPhoto>;
      if (photo) {
        if (photo.byteLength > PHOTO_MAX_BYTES) {
          throw new AppError(413, 'photo_too_large', 'feedback.error.photoTooLarge');
        }
        kind = sniffPhoto(photo);
        if (!kind) throw errors.validation({ photo: 'feedback.error.photoType' });
      }

      const id = randomUUID();
      const now = clock.now().toISOString();
      let key: string | undefined;
      if (photo && kind) {
        key = `${COMPLAINT_KEY_PREFIX}${randomUUID()}.${kind.ext}`;
        await storage.put(key, photo);
      }
      try {
        return db.tx((tx) => {
          if (blocked(input.orderId)) {
            throw new AppError(409, 'complaint_exists', 'feedback.error.complaintExists');
          }
          tx.run(
            `INSERT INTO complaints (id, user_id, order_id, dish_id, reason, description, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
            [
              id,
              userId,
              input.orderId,
              input.dishId ?? null,
              input.reason,
              input.description.slice(0, COMPLAINT_DESCRIPTION_MAX),
              now,
            ],
          );
          if (key && kind && photo) {
            tx.run(
              `INSERT INTO complaint_photos (complaint_id, storage_key, content_type, size, created_at)
               VALUES (?, ?, ?, ?, ?)`,
              [id, key, kind.contentType, photo.byteLength, now],
            );
          }
          tx.run(
            `INSERT INTO complaint_events (complaint_id, kind, actor_id, comment, at)
             VALUES (?, 'created', ?, NULL, ?)`,
            [id, userId, now],
          );
          return toDto(rowOf(id)!);
        });
      } catch (error) {
        if (key) await storage.delete(key).catch(() => false);
        throw error;
      }
    },

    /** «Поддержка»: контакты из настроек и обращения клиента, новые первыми. */
    support(userId: number): SupportDto {
      const rows = db.query<ComplaintRow>(
        'SELECT * FROM complaints WHERE user_id = ? ORDER BY created_at DESC, id LIMIT ?',
        [userId, LIST_LIMIT],
      );
      return { contacts: admin.getSetting('supportContacts'), complaints: rows.map(toDto) };
    },

    /** Очередь администратора: открытые (старые первыми) или все (новые первыми). */
    adminList(status: 'open' | 'all'): { items: AdminComplaintDto[]; openCount: number } {
      const rows =
        status === 'open'
          ? db.query<ComplaintRow>(
              `SELECT * FROM complaints WHERE status = 'open' ORDER BY created_at, id LIMIT ?`,
              [LIST_LIMIT],
            )
          : db.query<ComplaintRow>(
              'SELECT * FROM complaints ORDER BY created_at DESC, id LIMIT ?',
              [LIST_LIMIT],
            );
      const openCount = db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM complaints WHERE status = 'open'`,
      )!.n;
      return { items: rows.map(toAdminDto), openCount };
    },

    /** Решение по жалобе. Замена и возврат дают один кредит; отказ — только комментарий. */
    resolveComplaint(adminId: number, complaintId: string, input: ResolveInput): AdminComplaintDto {
      if (!rowOf(complaintId)) {
        throw new AppError(404, 'complaint_not_found', 'feedback.error.complaintNotFound');
      }
      const now = clock.now().toISOString();
      const comment = input.comment && input.comment.length > 0 ? input.comment : null;
      return db.tx((tx) => {
        const row = tx.get<ComplaintRow>('SELECT * FROM complaints WHERE id = ?', [complaintId])!;
        if (row.status !== 'open') {
          throw new AppError(409, 'complaint_closed', 'feedback.error.complaintClosed');
        }
        const grantsCredit = input.outcome !== 'reject';
        if (grantsCredit) billing.grantComplaintCredit(row.user_id, complaintId);
        tx.run(
          `UPDATE complaints SET status = ?, outcome = ?, comment = ?, resolved_at = ?, resolved_by = ?
            WHERE id = ?`,
          [
            grantsCredit ? 'resolved' : 'rejected',
            input.outcome,
            comment,
            now,
            adminId,
            complaintId,
          ],
        );
        tx.run(
          `INSERT INTO complaint_events (complaint_id, kind, actor_id, comment, at) VALUES (?, ?, ?, ?, ?)`,
          [complaintId, grantsCredit ? input.outcome : 'rejected', adminId, comment, now],
        );
        admin.audit(adminId, 'complaint.resolve', `complaint:${complaintId}`, {
          outcome: input.outcome,
          orderId: row.order_id,
          creditGranted: grantsCredit,
        });
        const lang = auth.getUser(row.user_id)?.lang ?? 'ru';
        notify({ db: tx, clock }, row.user_id, 'complaint_resolved', {
          complaintId,
          outcome: input.outcome,
          link: '/support',
          text: noticeText(lang, input.outcome, comment),
        });
        return toAdminDto(
          tx.get<ComplaintRow>('SELECT * FROM complaints WHERE id = ?', [complaintId])!,
        );
      });
    },

    /** Файл фото для владельца жалобы или администратора; остальным — `undefined` (404). */
    async readPhoto(
      viewer: { id: number; role: string },
      complaintId: string,
      photoId: number,
    ): Promise<{ data: Uint8Array; contentType: string } | undefined> {
      const row = db.get<{ storage_key: string; content_type: string; user_id: number }>(
        `SELECT p.storage_key, p.content_type, c.user_id
           FROM complaint_photos p JOIN complaints c ON c.id = p.complaint_id
          WHERE p.id = ? AND p.complaint_id = ?`,
        [photoId, complaintId],
      );
      if (!row) return undefined;
      if (viewer.role !== 'admin' && row.user_id !== viewer.id) return undefined;
      const file = await storage.get(row.storage_key);
      return file ? { data: file.data, contentType: row.content_type } : undefined;
    },

    /** Жалобы клиента для выгрузки данных (без содержимого фото: только сведения о них). */
    exportComplaints(userId: number) {
      return db
        .query<ComplaintRow>('SELECT * FROM complaints WHERE user_id = ? ORDER BY created_at, id', [
          userId,
        ])
        .map((row) => {
          const dto = toDto(row);
          return {
            id: dto.id,
            orderId: dto.orderId,
            dishId: dto.dishId,
            reason: dto.reason,
            description: dto.description,
            status: dto.status,
            outcome: dto.outcome,
            comment: dto.comment,
            createdAt: dto.createdAt,
            resolvedAt: dto.resolvedAt,
            photos: dto.photos.map((p) => ({ id: p.id, contentType: p.contentType })),
            history: dto.history,
          };
        });
    },

    /**
     * Удаление аккаунта (синхронно, в транзакции профиля): стирает текст жалоб и записи о фото,
     * ключи файлов кладёт в очередь на удаление из хранилища (оно асинхронное).
     */
    eraseUser(userId: number, tx: AppDeps['db']): void {
      const now = clock.now().toISOString();
      const keys = tx.query<{ storage_key: string }>(
        `SELECT p.storage_key FROM complaint_photos p JOIN complaints c ON c.id = p.complaint_id
          WHERE c.user_id = ?`,
        [userId],
      );
      for (const { storage_key } of keys) {
        tx.run('INSERT OR IGNORE INTO feedback_file_trash (storage_key, queued_at) VALUES (?, ?)', [
          storage_key,
          now,
        ]);
      }
      tx.run(
        `DELETE FROM complaint_photos WHERE complaint_id IN (SELECT id FROM complaints WHERE user_id = ?)`,
        [userId],
      );
      tx.run(`UPDATE complaints SET description = '' WHERE user_id = ?`, [userId]);
    },

    /** Удаляет из хранилища файлы очереди; то, что не удалось, остаётся до следующего прохода. */
    async sweepTrash(): Promise<number> {
      const rows = db.query<{ storage_key: string }>(
        'SELECT storage_key FROM feedback_file_trash ORDER BY queued_at LIMIT 200',
      );
      let removed = 0;
      for (const { storage_key } of rows) {
        try {
          await storage.delete(storage_key);
          db.run('DELETE FROM feedback_file_trash WHERE storage_key = ?', [storage_key]);
          removed += 1;
        } catch {
          // хранилище недоступно: ключ остаётся в очереди, повторим при следующем проходе
        }
      }
      return removed;
    },
  };
}

export type Complaints = ReturnType<typeof createComplaints>;
