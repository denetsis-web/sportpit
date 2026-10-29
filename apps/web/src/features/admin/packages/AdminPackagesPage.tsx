import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  packageResponseSchema,
  packagesResponseSchema,
  type PackageDto,
} from '@sportpit/shared/schemas/billing';
import { api, ApiError } from '../../../api/index.ts';
import { useI18n, type TFunction } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField } from '../../../ui/index.ts';
import { describeError } from '../../client/auth/errors.ts';
import { RequireRole } from '../../client/auth/guards.tsx';
import { formatLeiInput, parseLei } from './lei.ts';

/** Текст ошибки поля от сервера (ключ словаря) или общий текст. */
export function fieldMessage(t: TFunction, error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiError) || !error.fields?.[field]) return undefined;
  return t(error.fields[field]);
}

interface Draft {
  boxes: string;
  price: string;
  sortOrder: string;
  active: boolean;
}

const toDraft = (p: PackageDto): Draft => ({
  boxes: String(p.boxes),
  price: formatLeiInput(p.pricePerBoxBani),
  sortOrder: String(p.sortOrder),
  active: p.active,
});

function PackageForm({
  idPrefix,
  initial,
  submitLabel,
  title,
  onSubmit,
}: {
  idPrefix: string;
  initial: Draft;
  submitLabel: string;
  title: string;
  onSubmit: (body: {
    boxes: number;
    pricePerBoxBani: number;
    sortOrder: number;
    active: boolean;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const price = parseLei(draft.price);
  const boxes = Number(draft.boxes);
  const sortOrder = Number(draft.sortOrder);
  const valid =
    price !== null &&
    price > 0 &&
    Number.isInteger(boxes) &&
    boxes >= 1 &&
    Number.isInteger(sortOrder);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || price === null) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await onSubmit({ boxes, pricePerBoxBani: price, sortOrder, active: draft.active });
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={title} headingLevel={3}>
      <form onSubmit={(event) => void submit(event)}>
        <TextField
          id={`${idPrefix}-boxes`}
          label={t('billing.admin.packages.boxes')}
          inputMode="numeric"
          value={draft.boxes}
          error={fieldMessage(t, error, 'boxes')}
          onChange={(e) => setDraft({ ...draft, boxes: e.target.value })}
        />
        <TextField
          id={`${idPrefix}-price`}
          label={t('billing.admin.packages.price')}
          hint={t('billing.admin.packages.priceHint')}
          inputMode="decimal"
          value={draft.price}
          error={fieldMessage(t, error, 'pricePerBoxBani')}
          onChange={(e) => setDraft({ ...draft, price: e.target.value })}
        />
        <TextField
          id={`${idPrefix}-sort`}
          label={t('billing.admin.packages.sort')}
          inputMode="numeric"
          value={draft.sortOrder}
          onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
        />
        <label className="ui-field__label">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />{' '}
          {t('billing.admin.packages.active')}
        </label>
        {error ? <Banner variant="error">{describeError(t, error)}</Banner> : null}
        {saved ? <Banner variant="success">{t('billing.admin.packages.saved')}</Banner> : null}
        <Button type="submit" loading={busy} disabled={!valid}>
          {submitLabel}
        </Button>
      </form>
    </Card>
  );
}

function AdminPackages() {
  const { t } = useI18n();
  const [items, setItems] = useState<PackageDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api.get('/admin/packages', { schema: packagesResponseSchema })).items);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <h2>{t('billing.admin.packages.title')}</h2>
      <p>{t('billing.admin.packages.lead')}</p>
      {failed ? (
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={() => void load()}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {t('billing.admin.loadError')}
        </Banner>
      ) : null}
      {items === null && !failed ? <p role="status">{t('core.loading')}</p> : null}
      {items?.map((pack) => (
        <PackageForm
          key={pack.id}
          idPrefix={`package-${pack.id}`}
          title={t('billing.admin.packages.row', { count: pack.boxes })}
          submitLabel={t('billing.admin.packages.save')}
          initial={toDraft(pack)}
          onSubmit={async (body) => {
            await api.patch(`/admin/packages/${pack.id}`, {
              body,
              schema: packageResponseSchema,
            });
            await load();
          }}
        />
      ))}
      <PackageForm
        key={`new-${items?.length ?? 0}`}
        idPrefix="package-new"
        title={t('billing.admin.packages.newTitle')}
        submitLabel={t('billing.admin.packages.add')}
        initial={{ boxes: '', price: '', sortOrder: '100', active: true }}
        onSubmit={async (body) => {
          await api.post('/admin/packages', { body, schema: packageResponseSchema });
          await load();
        }}
      />
    </>
  );
}

export function AdminPackagesPage() {
  return (
    <RequireRole roles={['admin']}>
      <AdminPackages />
    </RequireRole>
  );
}
