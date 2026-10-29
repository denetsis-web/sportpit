import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../../app/i18n.tsx';
import { Banner, Button, Card, Dialog } from '../../../ui/index.ts';
import { describeError } from '../auth/errors.ts';
import { setSessionUser } from '../auth/session.ts';
import { deleteAccount, exportData } from './api.ts';

/** Сохраняет JSON-файл через временную ссылку: данные остаются в браузере. */
function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Выгрузка своих данных: JSON с профилем, согласиями, заказами и оценками (R29.1). */
export function ExportSection() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | undefined>();

  async function run(): Promise<void> {
    setBusy(true);
    setMessage(undefined);
    try {
      downloadJson(await exportData(), t('profile.export.fileName'));
      setMessage({ ok: true, text: t('profile.export.done') });
    } catch (e) {
      setMessage({ ok: false, text: describeError(t, e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t('profile.export.title')} className="profile-section">
      <p>{t('profile.export.lead')}</p>
      <Button variant="secondary" loading={busy} onClick={() => void run()}>
        {t('profile.export.action')}
      </Button>
      {message ? <Banner variant={message.ok ? 'success' : 'error'}>{message.text}</Banner> : null}
    </Card>
  );
}

/** Удаление аккаунта: только после подтверждения в окне (R29). */
export function DeleteSection() {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await deleteAccount();
      setOpen(false);
      setSessionUser(null);
      navigate('/login', { replace: true });
    } catch (e) {
      setError(describeError(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t('profile.delete.title')} className="profile-section">
      <p>{t('profile.delete.lead')}</p>
      <Button variant="danger" onClick={() => setOpen(true)}>
        {t('profile.delete.action')}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('profile.delete.confirmTitle')}
        closeLabel={t('core.action.close')}
        actions={
          <Button variant="danger" loading={busy} onClick={() => void confirm()}>
            {t('profile.delete.confirm')}
          </Button>
        }
      >
        <p>{t('profile.delete.confirmBody')}</p>
        {error ? <Banner variant="error">{error}</Banner> : null}
      </Dialog>
    </Card>
  );
}
