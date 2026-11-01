// «Проблема с боксом» (R30): заказ, причина из списка, описание и фото JPEG/PNG до 5 МБ.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  COMPLAINT_REASONS,
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  type FeedbackOrderDto,
} from '@sportpit/shared/schemas/feedback';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card } from '../../../ui/index.ts';
import { describeError } from '../auth/errors.ts';
import { RequireRole } from '../auth/guards.tsx';
import { fetchComplaintOrders, sendComplaint } from './api.ts';
import './support.css';

type LoadState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; orders: FeedbackOrderDto[] };

function ComplaintForm({ orders }: { orders: FeedbackOrderDto[] }) {
  const { t, lang, date } = useI18n();
  const [params] = useSearchParams();
  const wanted = params.get('order') ?? '';
  const eligible = orders.filter((o) => o.canComplain);
  const [orderId, setOrderId] = useState(eligible.some((o) => o.orderId === wanted) ? wanted : '');
  const [dishId, setDishId] = useState('');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const order = eligible.find((o) => o.orderId === orderId);

  function onPhoto(file: File | null) {
    setPhoto(null);
    setErrors((prev) => {
      const { photo: _removed, ...rest } = prev;
      return rest;
    });
    if (!file) return;
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setErrors((prev) => ({ ...prev, photo: t('feedback.complaint.photo.type') }));
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setErrors((prev) => ({ ...prev, photo: t('feedback.complaint.photo.size') }));
      return;
    }
    setPhoto(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    if (!orderId) next.order = t('feedback.complaint.pickOrder');
    if (!reason) next.reason = t('feedback.complaint.pickReason');
    if (errors.photo) next.photo = errors.photo;
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length > 0) return;

    const form = new FormData();
    form.set('orderId', orderId);
    form.set('reason', reason);
    if (dishId) form.set('dishId', dishId);
    if (description.trim()) form.set('description', description.trim());
    if (photo) form.set('photo', photo);
    setBusy(true);
    try {
      await sendComplaint(form);
      setSent(true);
    } catch (e) {
      setFailure(describeError(t, e));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <>
        <Banner variant="success">{t('feedback.complaint.sent')}</Banner>
        <Link className="ui-button ui-button--primary" to="/support">
          {t('feedback.complaint.toSupport')}
        </Link>
      </>
    );
  }

  if (eligible.length === 0) {
    return (
      <Card>
        <p>{t('feedback.complaint.order.none')}</p>
        <Link className="ui-button ui-button--secondary" to="/support">
          {t('feedback.complaint.toSupport')}
        </Link>
      </Card>
    );
  }

  return (
    <form className="complaint-form" onSubmit={(event) => void submit(event)} noValidate>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor="complaint-order">
          {t('feedback.complaint.order.label')}
        </label>
        <select
          id="complaint-order"
          className="ui-field__input"
          value={orderId}
          aria-invalid={errors.order ? true : undefined}
          onChange={(e) => {
            setOrderId(e.target.value);
            setDishId('');
          }}
        >
          <option value="">{t('feedback.complaint.order.choose')}</option>
          {eligible.map((o) => (
            <option key={o.orderId} value={o.orderId}>
              {t('feedback.complaint.order.option', {
                date: date(o.date),
                fridge: o.fridgeName ?? '',
              })}
            </option>
          ))}
        </select>
        {errors.order ? (
          <p className="ui-field__error" role="alert">
            {errors.order}
          </p>
        ) : null}
      </div>

      {order ? (
        <div className="ui-field">
          <label className="ui-field__label" htmlFor="complaint-dish">
            {t('feedback.complaint.dish.label')}
          </label>
          <select
            id="complaint-dish"
            className="ui-field__input"
            value={dishId}
            onChange={(e) => setDishId(e.target.value)}
          >
            <option value="">{t('feedback.complaint.dish.any')}</option>
            {order.dishes.map((dish) => (
              <option key={dish.dishId} value={dish.dishId}>
                {dish.name[lang]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="ui-field">
        <label className="ui-field__label" htmlFor="complaint-reason">
          {t('feedback.complaint.reason.label')}
        </label>
        <select
          id="complaint-reason"
          className="ui-field__input"
          value={reason}
          aria-invalid={errors.reason ? true : undefined}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">{t('feedback.complaint.reason.choose')}</option>
          {COMPLAINT_REASONS.map((value) => (
            <option key={value} value={value}>
              {t(`feedback.reason.${value}`)}
            </option>
          ))}
        </select>
        {errors.reason ? (
          <p className="ui-field__error" role="alert">
            {errors.reason}
          </p>
        ) : null}
      </div>

      <div className="ui-field">
        <label className="ui-field__label" htmlFor="complaint-description">
          {t('feedback.complaint.description.label')}
        </label>
        <textarea
          id="complaint-description"
          className="ui-field__input"
          rows={4}
          maxLength={1000}
          value={description}
          aria-describedby="complaint-description-hint"
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="ui-field__hint" id="complaint-description-hint">
          {t('feedback.complaint.description.hint')}
        </p>
      </div>

      <div className="ui-field">
        <label className="ui-field__label" htmlFor="complaint-photo">
          {t('feedback.complaint.photo.label')}
        </label>
        <input
          id="complaint-photo"
          type="file"
          accept="image/jpeg,image/png"
          aria-describedby="complaint-photo-hint"
          aria-invalid={errors.photo ? true : undefined}
          onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
        />
        <p className="ui-field__hint" id="complaint-photo-hint">
          {t('feedback.complaint.photo.hint')}
        </p>
        {errors.photo ? (
          <p className="ui-field__error" role="alert">
            {errors.photo}
          </p>
        ) : null}
      </div>

      {failure ? <Banner variant="error">{failure}</Banner> : null}
      <Button type="submit" loading={busy}>
        {t('feedback.complaint.submit')}
      </Button>
    </form>
  );
}

function ComplaintContent() {
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    fetchComplaintOrders().then(
      ({ items }) => alive && setState({ status: 'ready', orders: items }),
      () => alive && setState({ status: 'error' }),
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="support">
      <h1>{t('feedback.complaint.title')}</h1>
      <p>{t('feedback.complaint.lead')}</p>
      {state.status === 'loading' ? <p role="status">{t('core.loading')}</p> : null}
      {state.status === 'error' ? (
        <Banner variant="error">{t('feedback.complaint.loadError')}</Banner>
      ) : null}
      {state.status === 'ready' ? <ComplaintForm orders={state.orders} /> : null}
    </div>
  );
}

export function ComplaintFormPage() {
  return (
    <RequireRole roles={['client', 'admin']}>
      <ComplaintContent />
    </RequireRole>
  );
}
