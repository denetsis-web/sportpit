import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  PROMO_KINDS,
  promoResponseSchema,
  promosResponseSchema,
  type PromoDto,
  type PromoKind,
} from '@sportpit/shared/schemas/billing';
import { api } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField } from '../../../ui/index.ts';
import { describeError } from '../../client/auth/errors.ts';
import { RequireRole } from '../../client/auth/guards.tsx';
import { fieldMessage } from '../packages/AdminPackagesPage.tsx';
import { formatLeiInput, parseLei } from '../packages/lei.ts';

interface Draft {
  code: string;
  kind: PromoKind;
  value: string;
  ownerLabel: string;
  validFrom: string;
  validUntil: string;
  maxUses: string;
  oncePerUser: boolean;
}

const EMPTY: Draft = {
  code: '',
  kind: 'percent',
  value: '',
  ownerLabel: '',
  validFrom: '',
  validUntil: '',
  maxUses: '',
  oncePerUser: true,
};

/** Значение из поля в то, что ждёт сервер: проценты и кредиты — целые, сумма — в банях. */
function valueFromDraft(draft: Draft): number | null {
  if (draft.kind === 'fixed') return parseLei(draft.value);
  return /^\d{1,7}$/.test(draft.value.trim()) ? Number(draft.value.trim()) : null;
}

function AdminPromos() {
  const { t, date } = useI18n();
  const [items, setItems] = useState<PromoDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api.get('/admin/promos', { schema: promosResponseSchema })).items);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = valueFromDraft(draft);
  const valid = draft.code.trim().length >= 3 && value !== null && value > 0;

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!valid || value === null) return;
    setBusy(true);
    setError(null);
    setCreated(false);
    try {
      await api.post('/admin/promos', {
        body: {
          code: draft.code.trim(),
          kind: draft.kind,
          value,
          ownerLabel: draft.ownerLabel.trim() || null,
          validFrom: draft.validFrom || null,
          validUntil: draft.validUntil || null,
          maxUses: draft.maxUses.trim() ? Number(draft.maxUses) : null,
          oncePerUser: draft.oncePerUser,
        },
        schema: promoResponseSchema,
      });
      setDraft(EMPTY);
      setCreated(true);
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(promo: PromoDto) {
    try {
      await api.patch(`/admin/promos/${promo.id}`, {
        body: { active: !promo.active },
        schema: promoResponseSchema,
      });
    } catch (e) {
      setError(e);
    }
    await load();
  }

  const shortValue = (promo: PromoDto) =>
    t(`billing.admin.promos.valueShort.${promo.kind}`, {
      value: promo.kind === 'fixed' ? formatLeiInput(promo.value) : promo.value,
    });

  return (
    <>
      <h2>{t('billing.admin.promos.title')}</h2>
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

      <Card title={t('billing.admin.promos.create')} headingLevel={3}>
        <form onSubmit={(event) => void onCreate(event)}>
          <TextField
            label={t('billing.admin.promos.code')}
            value={draft.code}
            autoComplete="off"
            error={fieldMessage(t, error, 'code')}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          />
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="promo-kind">
              {t('billing.admin.promos.kind')}
            </label>
            <select
              id="promo-kind"
              className="ui-field__input"
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as PromoKind })}
            >
              {PROMO_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`billing.admin.promos.kind.${kind}`)}
                </option>
              ))}
            </select>
          </div>
          <TextField
            label={t(`billing.admin.promos.value.${draft.kind}`)}
            inputMode="decimal"
            value={draft.value}
            error={fieldMessage(t, error, 'value')}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          />
          <TextField
            label={t('billing.admin.promos.owner')}
            value={draft.ownerLabel}
            onChange={(e) => setDraft({ ...draft, ownerLabel: e.target.value })}
          />
          <TextField
            type="date"
            label={t('billing.admin.promos.validFrom')}
            value={draft.validFrom}
            error={fieldMessage(t, error, 'validFrom')}
            onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })}
          />
          <TextField
            type="date"
            label={t('billing.admin.promos.validUntil')}
            value={draft.validUntil}
            error={fieldMessage(t, error, 'validUntil')}
            onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })}
          />
          <TextField
            label={t('billing.admin.promos.maxUses')}
            hint={t('billing.admin.promos.maxUsesHint')}
            inputMode="numeric"
            value={draft.maxUses}
            onChange={(e) => setDraft({ ...draft, maxUses: e.target.value })}
          />
          <label className="ui-field__label">
            <input
              type="checkbox"
              checked={draft.oncePerUser}
              onChange={(e) => setDraft({ ...draft, oncePerUser: e.target.checked })}
            />{' '}
            {t('billing.admin.promos.oncePerUser')}
          </label>
          {error ? <Banner variant="error">{describeError(t, error)}</Banner> : null}
          {created ? <Banner variant="success">{t('billing.admin.promos.created')}</Banner> : null}
          <Button type="submit" loading={busy} disabled={!valid}>
            {t('billing.admin.promos.create')}
          </Button>
        </form>
      </Card>

      {items === null && !failed ? <p role="status">{t('core.loading')}</p> : null}
      {items && items.length === 0 ? <p>{t('billing.admin.promos.empty')}</p> : null}
      {items?.map((promo) => (
        <Card key={promo.id} title={promo.code} headingLevel={3}>
          <p>
            {t(`billing.admin.promos.kind.${promo.kind}`)}: {shortValue(promo)}
            {promo.ownerLabel ? ` · ${promo.ownerLabel}` : ''}
          </p>
          <p>
            {promo.validFrom ? `${date(promo.validFrom)} – ` : ''}
            {promo.validUntil ? date(promo.validUntil) : ''}
          </p>
          <p>
            {t('billing.admin.promos.used', { count: promo.usedCount })}
            {promo.maxUses !== null ? ` / ${promo.maxUses}` : ''}
          </p>
          <Button variant="secondary" onClick={() => void toggle(promo)}>
            {t(promo.active ? 'billing.admin.promos.toggleOff' : 'billing.admin.promos.toggleOn', {
              code: promo.code,
            })}
          </Button>
        </Card>
      ))}
    </>
  );
}

export function AdminPromosPage() {
  return (
    <RequireRole roles={['admin']}>
      <AdminPromos />
    </RequireRole>
  );
}
