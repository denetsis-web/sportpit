// «Поддержка» (R30.1): контакты из настроек, кнопка «Проблема с боксом» и статусы обращений.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ComplaintDto, SupportDto } from '@sportpit/shared/schemas/feedback';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card } from '../../../ui/index.ts';
import { RequireRole } from '../auth/guards.tsx';
import { fetchSupport } from './api.ts';
import './support.css';

function ComplaintCard({ complaint }: { complaint: ComplaintDto }) {
  const { t, lang, date } = useI18n();
  const title = t(`feedback.reason.${complaint.reason}`);
  return (
    <article className="complaint" aria-label={title}>
      <header className="complaint__head">
        <h3>{title}</h3>
        <span className={`complaint__status complaint__status--${complaint.status}`}>
          {t(`feedback.support.status.${complaint.status}`)}
        </span>
      </header>
      <p className="complaint__meta">
        {complaint.orderDate
          ? t('feedback.support.order', { date: date(complaint.orderDate) })
          : null}
        {' · '}
        {t('feedback.support.created', { date: date(complaint.createdAt) })}
      </p>
      {complaint.dishName ? (
        <p>{t('feedback.support.dish', { name: complaint.dishName[lang] })}</p>
      ) : null}
      {complaint.description ? (
        <p>{t('feedback.support.description', { text: complaint.description })}</p>
      ) : null}
      {complaint.outcome ? <p>{t(`feedback.support.outcome.${complaint.outcome}`)}</p> : null}
      {complaint.comment ? (
        <p>{t('feedback.support.comment', { comment: complaint.comment })}</p>
      ) : null}
      {complaint.photos.length > 0 ? (
        <div className="complaint__photos">
          {complaint.photos.map((photo) => (
            <img key={photo.id} src={photo.url} alt={t('feedback.support.photo.alt')} />
          ))}
        </div>
      ) : null}
      <h4>{t('feedback.support.history.title')}</h4>
      <ol className="complaint__history">
        {complaint.history.map((event, index) => (
          <li key={index}>
            {date(event.at)} · {t(`feedback.support.history.${event.kind}`)}
          </li>
        ))}
      </ol>
    </article>
  );
}

function SupportContent() {
  const { t } = useI18n();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: SupportDto }
  >({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', data: await fetchSupport() });
    } catch {
      setState((prev) => (prev.status === 'ready' ? prev : { status: 'error' }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') return <p role="status">{t('core.loading')}</p>;
  if (state.status === 'error') {
    return (
      <>
        <h1>{t('feedback.support.title')}</h1>
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={() => void load()}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {t('feedback.support.loadError')}
        </Banner>
      </>
    );
  }

  const { contacts, complaints } = state.data;
  return (
    <div className="support">
      <h1>{t('feedback.support.title')}</h1>
      <p>{t('feedback.support.lead')}</p>

      <Card title={t('feedback.support.contacts.title')}>
        <dl className="support__contacts">
          <dt>{t('feedback.support.contacts.phone')}</dt>
          <dd>{contacts.phone}</dd>
          <dt>{t('feedback.support.contacts.email')}</dt>
          <dd>{contacts.email}</dd>
          <dt>{t('feedback.support.contacts.messenger')}</dt>
          <dd>{contacts.messenger}</dd>
        </dl>
      </Card>

      <Link className="ui-button ui-button--primary" to="/support/new">
        {t('feedback.support.new')}
      </Link>

      <section aria-labelledby="support-complaints">
        <h2 id="support-complaints">{t('feedback.support.complaints.title')}</h2>
        {complaints.length === 0 ? (
          <p>{t('feedback.support.complaints.empty')}</p>
        ) : (
          <div className="support__list">
            {complaints.map((complaint) => (
              <ComplaintCard key={complaint.id} complaint={complaint} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function SupportPage() {
  return (
    <RequireRole roles={['client', 'admin']}>
      <SupportContent />
    </RequireRole>
  );
}
