import { useState, type FormEvent } from 'react';
import { formatDecimal } from '@sportpit/shared/format';
import { gymListSchema, gymSchema, type GymDto } from '@sportpit/shared/schemas/admin';
import { api } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField, useResource } from '../../../ui/index.ts';
import {
  AdminOnly,
  CheckField,
  errorText,
  fieldErrors,
  numberOrNull,
  toNumber,
} from './common.tsx';

interface Draft {
  id: string | null;
  name: string;
  address: string;
  sharePercent: string;
  active: boolean;
}

const EMPTY: Draft = { id: null, name: '', address: '', sharePercent: '0', active: true };

function toDraft(gym: GymDto): Draft {
  return {
    id: gym.id,
    name: gym.name,
    address: gym.address ?? '',
    sharePercent: formatDecimal(gym.sharePercent),
    active: gym.active,
  };
}

function GymForm({
  draft,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFailure(null);
    const body = {
      name: form.name,
      address: form.address.trim() === '' ? null : form.address,
      sharePercent: numberOrNull(toNumber(form.sharePercent)),
      active: form.active,
    };
    try {
      if (form.id) await api.patch(`/admin/gyms/${form.id}`, { body, schema: gymSchema });
      else await api.post('/admin/gyms', { body, schema: gymSchema });
      onSaved();
    } catch (error) {
      const fields = fieldErrors(error, t);
      setErrors(fields);
      if (Object.keys(fields).length === 0) setFailure(errorText(error, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={form.id ? t('admin.gyms.edit') : t('admin.gyms.add')}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        {failure ? <Banner variant="error">{failure}</Banner> : null}
        <TextField
          label={t('admin.gyms.name')}
          value={form.name}
          error={errors.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <TextField
          label={t('admin.gyms.address')}
          value={form.address}
          error={errors.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <TextField
          label={t('admin.gyms.share')}
          hint={t('admin.gyms.share.hint')}
          inputMode="decimal"
          value={form.sharePercent}
          error={errors.sharePercent}
          onChange={(e) => setForm({ ...form, sharePercent: e.target.value })}
        />
        <CheckField
          label={t('admin.active')}
          checked={form.active}
          onChange={(active) => setForm({ ...form, active })}
        />
        <div className="admin-actions">
          <Button type="submit" loading={saving}>
            {t('admin.save')}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            {t('core.action.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function GymsPage() {
  const { t } = useI18n();
  const gyms = useResource(() => api.get('/admin/gyms', { schema: gymListSchema }));
  const [draft, setDraft] = useState<Draft | null>(null);

  return (
    <AdminOnly>
      <h2>{t('admin.gyms.title')}</h2>
      {gyms.error ? <Banner variant="error">{errorText(gyms.error, t)}</Banner> : null}
      {gyms.data && gyms.data.items.length === 0 ? <p>{t('admin.gyms.empty')}</p> : null}
      <ul className="admin-list">
        {gyms.data?.items.map((gym) => (
          <li key={gym.id} className="admin-list__item">
            <div className="admin-list__main">
              <p className="admin-list__title">{gym.name}</p>
              <p className="admin-list__meta">
                {[
                  gym.address,
                  t('admin.gyms.share.value', {
                    value: formatDecimal(gym.sharePercent),
                  }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {gym.active ? null : <span className="admin-badge">{t('admin.inactive')}</span>}
            </div>
            <Button variant="secondary" onClick={() => setDraft(toDraft(gym))}>
              {t('admin.edit')}
            </Button>
          </li>
        ))}
      </ul>
      {draft ? (
        <GymForm
          key={draft.id ?? 'new'}
          draft={draft}
          onCancel={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            gyms.reload();
          }}
        />
      ) : (
        <Button onClick={() => setDraft(EMPTY)}>{t('admin.gyms.add')}</Button>
      )}
    </AdminOnly>
  );
}
