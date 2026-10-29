import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  DEFAULT_CUTOFF_TIME,
  DEFAULT_PICKUP_FROM,
  DEFAULT_PICKUP_TO,
  fridgeListSchema,
  fridgeSchema,
  gymListSchema,
  type FridgeDto,
} from '@sportpit/shared/schemas/admin';
import { api } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField } from '../../../ui/index.ts';
import {
  AdminOnly,
  CheckField,
  errorText,
  fieldErrors,
  numberOrNull,
  SelectField,
  toNumber,
  useResource,
} from '../gyms/common.tsx';

interface Draft {
  id: string | null;
  newId: string;
  gymId: string;
  name: string;
  capacityBoxes: string;
  cutoffTime: string;
  pickupFrom: string;
  pickupTo: string;
  accessCode: string;
  active: boolean;
}

const EMPTY: Draft = {
  id: null,
  newId: '',
  gymId: '',
  name: '',
  capacityBoxes: '30',
  cutoffTime: DEFAULT_CUTOFF_TIME,
  pickupFrom: DEFAULT_PICKUP_FROM,
  pickupTo: DEFAULT_PICKUP_TO,
  accessCode: '',
  active: true,
};

function toDraft(fridge: FridgeDto): Draft {
  return {
    id: fridge.id,
    newId: '',
    gymId: fridge.gymId,
    name: fridge.name,
    capacityBoxes: String(fridge.capacityBoxes),
    cutoffTime: fridge.cutoffTime,
    pickupFrom: fridge.pickupFrom,
    pickupTo: fridge.pickupTo,
    accessCode: fridge.accessCode ?? '',
    active: fridge.active,
  };
}

function FridgeForm({
  draft,
  gyms,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  gyms: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<Draft>({ ...draft, gymId: draft.gymId || gyms[0]?.id || '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Draft>) => setForm({ ...form, ...patch });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFailure(null);
    const body = {
      ...(form.id === null && form.newId.trim() !== '' ? { id: form.newId.trim() } : {}),
      gymId: form.gymId,
      name: form.name,
      capacityBoxes: numberOrNull(toNumber(form.capacityBoxes)),
      cutoffTime: form.cutoffTime,
      pickupFrom: form.pickupFrom,
      pickupTo: form.pickupTo,
      accessCode: form.accessCode.trim(),
      active: form.active,
    };
    try {
      if (form.id) await api.patch(`/admin/fridges/${form.id}`, { body, schema: fridgeSchema });
      else await api.post('/admin/fridges', { body, schema: fridgeSchema });
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
    <Card title={form.id ? t('admin.fridges.edit') : t('admin.fridges.add')}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        {failure ? <Banner variant="error">{failure}</Banner> : null}
        <SelectField
          label={t('admin.fridges.gym')}
          value={form.gymId}
          error={errors.gymId}
          onChange={(gymId) => set({ gymId })}
          options={gyms.map((g) => ({ value: g.id, label: g.name }))}
        />
        <TextField
          label={t('admin.fridges.name')}
          value={form.name}
          error={errors.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        {form.id === null ? (
          <TextField
            label={t('admin.fridges.id')}
            hint={t('admin.fridges.id.hint')}
            value={form.newId}
            error={errors.id}
            onChange={(e) => set({ newId: e.target.value })}
          />
        ) : null}
        <TextField
          label={t('admin.fridges.capacity')}
          inputMode="numeric"
          value={form.capacityBoxes}
          error={errors.capacityBoxes}
          onChange={(e) => set({ capacityBoxes: e.target.value })}
        />
        <div className="admin-grid">
          <TextField
            label={t('admin.fridges.cutoff')}
            hint={t('admin.fridges.cutoff.hint')}
            type="time"
            value={form.cutoffTime}
            error={errors.cutoffTime}
            onChange={(e) => set({ cutoffTime: e.target.value })}
          />
          <TextField
            label={t('admin.fridges.pickupFrom')}
            type="time"
            value={form.pickupFrom}
            error={errors.pickupFrom}
            onChange={(e) => set({ pickupFrom: e.target.value })}
          />
          <TextField
            label={t('admin.fridges.pickupTo')}
            type="time"
            value={form.pickupTo}
            error={errors.pickupTo}
            onChange={(e) => set({ pickupTo: e.target.value })}
          />
        </div>
        <TextField
          label={t('admin.fridges.accessCode')}
          hint={t('admin.fridges.accessCode.hint')}
          value={form.accessCode}
          error={errors.accessCode}
          onChange={(e) => set({ accessCode: e.target.value })}
        />
        <CheckField
          label={t('admin.active')}
          checked={form.active}
          onChange={(active) => set({ active })}
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

export function FridgesPage() {
  const { t } = useI18n();
  const fridges = useResource(() => api.get('/admin/fridges', { schema: fridgeListSchema }));
  const gyms = useResource(() => api.get('/admin/gyms', { schema: gymListSchema }));
  const [draft, setDraft] = useState<Draft | null>(null);
  const gymOptions = gyms.data?.items.filter((g) => g.active) ?? [];

  return (
    <AdminOnly>
      <h2>{t('admin.fridges.title')}</h2>
      {fridges.error ? <Banner variant="error">{errorText(fridges.error, t)}</Banner> : null}
      {fridges.data && fridges.data.items.length === 0 ? <p>{t('admin.fridges.empty')}</p> : null}
      <ul className="admin-list">
        {fridges.data?.items.map((fridge) => (
          <li key={fridge.id} className="admin-list__item">
            <div className="admin-list__main">
              <p className="admin-list__title">
                {fridge.gymName} · {fridge.name}
              </p>
              <p className="admin-list__meta">
                {t('admin.fridges.summary', {
                  capacity: fridge.capacityBoxes,
                  cutoff: fridge.cutoffTime,
                  from: fridge.pickupFrom,
                  to: fridge.pickupTo,
                })}
              </p>
              {fridge.active ? null : <span className="admin-badge">{t('admin.inactive')}</span>}
            </div>
            <div className="admin-actions">
              <Button variant="secondary" onClick={() => setDraft(toDraft(fridge))}>
                {t('admin.edit')}
              </Button>
              <Link
                className="ui-button ui-button--secondary"
                to={`/admin/fridges/${encodeURIComponent(fridge.id)}/poster`}
                aria-label={t('admin.fridges.poster.openFor', { name: fridge.name })}
              >
                {t('admin.fridges.poster.open')}
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {draft ? (
        <FridgeForm
          key={draft.id ?? 'new'}
          draft={draft}
          gyms={gymOptions}
          onCancel={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            fridges.reload();
          }}
        />
      ) : gymOptions.length > 0 ? (
        <Button onClick={() => setDraft(EMPTY)}>{t('admin.fridges.add')}</Button>
      ) : (
        <p>{t('admin.fridges.needGym')}</p>
      )}
    </AdminOnly>
  );
}
