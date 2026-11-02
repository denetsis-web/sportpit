// Админка: очередь жалоб (R38, R44.1). Три исхода: замена другим блюдом, возврат кредита, отказ с комментарием.
import { useState } from 'react';
import {
  adminComplaintResponseSchema,
  adminComplaintsSchema,
  type AdminComplaintDto,
  type AdminComplaintsDto,
  type ComplaintOutcome,
} from '@sportpit/shared/schemas/feedback';
import { api } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, Dialog, useResource } from '../../../ui/index.ts';
import { describeError } from '../../client/auth/errors.ts';
import { RequireRole } from '../../client/auth/guards.tsx';
import '../../client/support/support.css';

type Filter = 'open' | 'all';

const OUTCOMES: ComplaintOutcome[] = ['replacement', 'refund', 'reject'];

function ComplaintItem({
  complaint,
  onResolve,
}: {
  complaint: AdminComplaintDto;
  onResolve: (complaint: AdminComplaintDto, outcome: ComplaintOutcome) => void;
}) {
  const { t, lang, date } = useI18n();
  const reason = t(`feedback.reason.${complaint.reason}`);
  return (
    <article className="complaint" aria-label={t('feedback.admin.card.title', { reason })}>
      <header className="complaint__head">
        <h2>{t('feedback.admin.card.title', { reason })}</h2>
        <span className={`complaint__status complaint__status--${complaint.status}`}>
          {t(`feedback.support.status.${complaint.status}`)}
        </span>
      </header>
      <p className="complaint__meta">
        {complaint.orderDate
          ? t('feedback.admin.card.order', {
              date: date(complaint.orderDate),
              gym: complaint.gymName ?? '',
              fridge: complaint.fridgeName ?? '',
            })
          : null}
        {' · '}
        {t('feedback.admin.card.client', { id: complaint.userId })}
        {' · '}
        {t('feedback.support.created', { date: date(complaint.createdAt) })}
      </p>
      {complaint.items.length > 0 ? (
        <p>
          {t('feedback.admin.card.items', {
            items: complaint.items
              .map((i) => t('feedback.admin.card.item', { name: i.name[lang], count: i.qty }))
              .join(', '),
          })}
        </p>
      ) : null}
      {complaint.dishName ? (
        <p>{t('feedback.support.dish', { name: complaint.dishName[lang] })}</p>
      ) : null}
      {complaint.description ? <p>{complaint.description}</p> : null}
      {complaint.photos.length > 0 ? (
        <div className="complaint__photos">
          {complaint.photos.map((photo) => (
            <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
              <img src={photo.url} alt={t('feedback.support.photo.alt')} />
            </a>
          ))}
        </div>
      ) : null}
      {complaint.outcome ? <p>{t(`feedback.support.outcome.${complaint.outcome}`)}</p> : null}
      {complaint.comment ? (
        <p>{t('feedback.support.comment', { comment: complaint.comment })}</p>
      ) : null}
      <h3>{t('feedback.support.history.title')}</h3>
      <ol className="complaint__history">
        {complaint.history.map((event, index) => (
          <li key={index}>
            {date(event.at)} · {t(`feedback.support.history.${event.kind}`)}
            {event.comment ? ` · ${event.comment}` : ''}
          </li>
        ))}
      </ol>
      {complaint.status === 'open' ? (
        <div className="admin-complaint__actions">
          {OUTCOMES.map((outcome) => (
            <Button
              key={outcome}
              variant={outcome === 'reject' ? 'danger' : 'primary'}
              onClick={() => onResolve(complaint, outcome)}
            >
              {t(`feedback.admin.action.${outcome}`)}
            </Button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function AdminComplaintsContent() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('open');
  const {
    data,
    error: loadError,
    reload,
  } = useResource<AdminComplaintsDto>(
    () =>
      api.get('/admin/complaints', { query: { status: filter }, schema: adminComplaintsSchema }),
    [filter],
  );
  const loadFailed = loadError !== undefined;
  const [target, setTarget] = useState<{
    complaint: AdminComplaintDto;
    outcome: ComplaintOutcome;
  } | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);

  async function confirm() {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/complaints/${encodeURIComponent(target.complaint.id)}/resolve`, {
        body: { outcome: target.outcome, ...(comment.trim() ? { comment: comment.trim() } : {}) },
        schema: adminComplaintResponseSchema,
      });
      setTarget(null);
      setComment('');
      setNotice(true);
      reload();
    } catch (e) {
      setError(describeError(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="support">
      <h1>{t('feedback.admin.title')}</h1>
      <p>{t('feedback.admin.lead')}</p>
      {notice ? <Banner variant="success">{t('feedback.admin.done')}</Banner> : null}
      {loadFailed ? (
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={reload}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {t('feedback.admin.loadError')}
        </Banner>
      ) : null}

      <div
        role="group"
        aria-label={t('feedback.admin.filter.label')}
        className="admin-complaint__filter"
      >
        <Button
          variant={filter === 'open' ? 'primary' : 'secondary'}
          aria-pressed={filter === 'open'}
          onClick={() => setFilter('open')}
        >
          {t('feedback.admin.filter.open')}
        </Button>
        <Button
          variant={filter === 'all' ? 'primary' : 'secondary'}
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          {t('feedback.admin.filter.all')}
        </Button>
      </div>

      {data ? (
        <>
          <p>{t('feedback.admin.openCount', { count: data.openCount })}</p>
          {data.items.length === 0 ? (
            <Card>
              <p>{t('feedback.admin.empty')}</p>
            </Card>
          ) : (
            <div className="support__list">
              {data.items.map((complaint) => (
                <ComplaintItem
                  key={complaint.id}
                  complaint={complaint}
                  onResolve={(c, outcome) => {
                    setError(null);
                    setNotice(false);
                    setComment('');
                    setTarget({ complaint: c, outcome });
                  }}
                />
              ))}
            </div>
          )}
        </>
      ) : loadFailed ? null : (
        <p role="status">{t('core.loading')}</p>
      )}

      <Dialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target ? t(`feedback.admin.dialog.title.${target.outcome}`) : ''}
        closeLabel={t('core.action.cancel')}
        actions={
          <Button loading={busy} onClick={() => void confirm()}>
            {t('feedback.admin.dialog.confirm')}
          </Button>
        }
      >
        {target ? <p>{t(`feedback.admin.dialog.body.${target.outcome}`)}</p> : null}
        <div className="ui-field">
          <label className="ui-field__label" htmlFor="complaint-comment">
            {t('feedback.admin.dialog.comment')}
          </label>
          <textarea
            id="complaint-comment"
            className="ui-field__input"
            rows={3}
            maxLength={500}
            value={comment}
            aria-describedby="complaint-comment-hint"
            onChange={(e) => setComment(e.target.value)}
          />
          <p className="ui-field__hint" id="complaint-comment-hint">
            {t('feedback.admin.dialog.commentHint')}
          </p>
        </div>
        {error ? <Banner variant="error">{error}</Banner> : null}
      </Dialog>
    </div>
  );
}

export function AdminComplaintsPage() {
  return (
    <RequireRole roles={['admin']}>
      <AdminComplaintsContent />
    </RequireRole>
  );
}
