import { useEffect, useState, type FormEvent } from 'react';
import {
  auditListSchema,
  PLACEHOLDER,
  settingsSchema,
  type SettingValues,
} from '@sportpit/shared/schemas/admin';
import { api } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField } from '../../../ui/index.ts';
import {
  AdminOnly,
  errorText,
  fieldErrors,
  numberOrNull,
  toNumber,
  useResource,
} from '../gyms/common.tsx';

interface Form {
  maxBoxesPerDay: string;
  stockBufferPercent: string;
  labelSize: string;
  toleranceRu: string;
  toleranceRo: string;
  phone: string;
  email: string;
  messenger: string;
}

const toForm = (s: SettingValues): Form => ({
  maxBoxesPerDay: String(s.maxBoxesPerDay),
  stockBufferPercent: String(s.stockBufferPercent),
  labelSize: s.labelSize,
  toleranceRu: s.toleranceNote.ru,
  toleranceRo: s.toleranceNote.ro,
  phone: s.supportContacts.phone,
  email: s.supportContacts.email,
  messenger: s.supportContacts.messenger,
});

function SettingsForm({ initial, onSaved }: { initial: SettingValues; onSaved: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState(toForm(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Form>) => setForm((prev) => ({ ...prev, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage(null);
    try {
      await api.put('/admin/settings', {
        body: {
          maxBoxesPerDay: numberOrNull(toNumber(form.maxBoxesPerDay)),
          stockBufferPercent: numberOrNull(toNumber(form.stockBufferPercent)),
          labelSize: form.labelSize,
          toleranceNote: { ru: form.toleranceRu, ro: form.toleranceRo },
          supportContacts: { phone: form.phone, email: form.email, messenger: form.messenger },
        },
        schema: settingsSchema,
      });
      setMessage({ kind: 'success', text: t('admin.settings.saved') });
      onSaved();
    } catch (error) {
      const fields = fieldErrors(error, t);
      setErrors(fields);
      setMessage({ kind: 'error', text: errorText(error, t) });
    } finally {
      setSaving(false);
    }
  }

  const placeholderHint = (value: string) =>
    value.includes(PLACEHOLDER) ? t('admin.settings.fillIn') : undefined;

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      {message ? <Banner variant={message.kind}>{message.text}</Banner> : null}
      <Card title={t('admin.settings.orders')}>
        <TextField
          label={t('admin.settings.maxBoxesPerDay')}
          hint={t('admin.settings.maxBoxesPerDay.hint')}
          inputMode="numeric"
          value={form.maxBoxesPerDay}
          error={errors.maxBoxesPerDay}
          onChange={(e) => set({ maxBoxesPerDay: e.target.value })}
        />
        <TextField
          label={t('admin.settings.stockBuffer')}
          hint={t('admin.settings.stockBuffer.hint')}
          inputMode="numeric"
          value={form.stockBufferPercent}
          error={errors.stockBufferPercent}
          onChange={(e) => set({ stockBufferPercent: e.target.value })}
        />
        <TextField
          label={t('admin.settings.labelSize')}
          hint={t('admin.settings.labelSize.hint')}
          value={form.labelSize}
          error={errors.labelSize}
          onChange={(e) => set({ labelSize: e.target.value })}
        />
      </Card>
      <Card title={t('admin.settings.tolerance')}>
        <TextField
          label={t('admin.settings.toleranceRu')}
          value={form.toleranceRu}
          error={errors['toleranceNote.ru']}
          onChange={(e) => set({ toleranceRu: e.target.value })}
        />
        <TextField
          label={t('admin.settings.toleranceRo')}
          value={form.toleranceRo}
          error={errors['toleranceNote.ro']}
          onChange={(e) => set({ toleranceRo: e.target.value })}
        />
      </Card>
      <Card title={t('admin.settings.support')}>
        <TextField
          label={t('admin.settings.phone')}
          hint={placeholderHint(form.phone)}
          value={form.phone}
          error={errors['supportContacts.phone']}
          onChange={(e) => set({ phone: e.target.value })}
        />
        <TextField
          label={t('admin.settings.email')}
          hint={placeholderHint(form.email)}
          value={form.email}
          error={errors['supportContacts.email']}
          onChange={(e) => set({ email: e.target.value })}
        />
        <TextField
          label={t('admin.settings.messenger')}
          hint={placeholderHint(form.messenger)}
          value={form.messenger}
          error={errors['supportContacts.messenger']}
          onChange={(e) => set({ messenger: e.target.value })}
        />
      </Card>
      <Button type="submit" loading={saving}>
        {t('admin.save')}
      </Button>
    </form>
  );
}

/** Журнал действий администратора: последние записи, новые первыми. */
function AuditLog({ version }: { version: number }) {
  const { t, dateTime } = useI18n();
  const log = useResource(
    () => api.get('/admin/audit', { query: { limit: 50 }, schema: auditListSchema }),
    [version],
  );
  return (
    <Card title={t('admin.audit.title')}>
      {log.error ? <Banner variant="error">{errorText(log.error, t)}</Banner> : null}
      {log.data && log.data.items.length === 0 ? <p>{t('admin.audit.empty')}</p> : null}
      {log.data && log.data.items.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="ui-field__hint">
              {t('admin.audit.total', { shown: log.data.items.length, total: log.data.total })}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.audit.time')}</th>
                <th scope="col">{t('admin.audit.user')}</th>
                <th scope="col">{t('admin.audit.action')}</th>
                <th scope="col">{t('admin.audit.target')}</th>
              </tr>
            </thead>
            <tbody>
              {log.data.items.map((entry) => (
                <tr key={entry.id}>
                  <td>{dateTime(entry.createdAt)}</td>
                  <td>{entry.userId ?? t('admin.audit.system')}</td>
                  <td>{entry.action}</td>
                  <td>{entry.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const settings = useResource(() => api.get('/admin/settings', { schema: settingsSchema }));
  const [version, setVersion] = useState(0);
  // форма строится один раз из загруженных значений: правки в полях не затираются перезагрузкой
  const [loaded, setLoaded] = useState<SettingValues | null>(null);
  useEffect(() => {
    if (settings.data && !loaded) setLoaded(settings.data);
  }, [settings.data, loaded]);

  return (
    <AdminOnly>
      <h2>{t('admin.settings.title')}</h2>
      {settings.error ? <Banner variant="error">{errorText(settings.error, t)}</Banner> : null}
      {loaded ? (
        <SettingsForm initial={loaded} onSaved={() => setVersion((n) => n + 1)} />
      ) : (
        <p role="status">{t('core.loading')}</p>
      )}
      <AuditLog version={version} />
    </AdminOnly>
  );
}
