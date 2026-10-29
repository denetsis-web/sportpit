import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type {
  BalanceResponse,
  PackageDto,
  PaymentMethod,
  PromoApplyResponse,
  PurchaseDto,
} from '@sportpit/shared/schemas/billing';
import { NetworkError } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField } from '../../../ui/index.ts';
import { describeError } from '../auth/errors.ts';
import { RequireRole } from '../auth/guards.tsx';
import {
  applyPromo,
  fetchCredits,
  fetchPackages,
  fetchPurchases,
  newAttemptKey,
  startPurchase,
} from './api.ts';
import './packages.css';

interface Loaded {
  status: 'loading' | 'ready' | 'error';
  packages: PackageDto[];
  credits: BalanceResponse | null;
  purchases: PurchaseDto[];
}

type Notice = { variant: 'success' | 'error' | 'info'; text: string } | null;

/** Применённый промокод на скидку (проценты или сумма); бесплатные кредиты зачисляются сразу и здесь не хранятся. */
interface AppliedPromo {
  code: string;
  preview: PromoApplyResponse | null;
  /** Для какого пакета посчитан предпросмотр. */
  forPackageId: number | null;
}

/** Куда отправить клиента после создания покупки: страница шлюза или экран статуса. */
export function destinationFor(purchase: PurchaseDto): { internal: boolean; to: string } {
  const url = purchase.status === 'pending' ? purchase.redirectUrl : null;
  if (!url) return { internal: true, to: `/pay/${purchase.id}` };
  return { internal: url.startsWith('/') && !url.startsWith('//'), to: url };
}

function PackagesContent() {
  const { t, money, date } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [loaded, setLoaded] = useState<Loaded>({
    status: 'loading',
    packages: [],
    credits: null,
    purchases: [],
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [promoInput, setPromoInput] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const [promoNotice, setPromoNotice] = useState<Notice>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const attemptKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [packages, credits, purchases] = await Promise.all([
        fetchPackages(),
        fetchCredits(),
        fetchPurchases(),
      ]);
      setLoaded({
        status: 'ready',
        packages: packages.items,
        credits,
        purchases: purchases.items,
      });
      const wanted = Number(params.get('package'));
      setSelectedId(
        (current) =>
          current ??
          (packages.items.some((p) => p.id === wanted) ? wanted : (packages.items[0]?.id ?? null)),
      );
    } catch {
      setLoaded((prev) => ({ ...prev, status: 'error' }));
    }
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  // Другой пакет, способ или промокод — это другая попытка оплаты: ключ идемпотентности новый.
  useEffect(() => {
    attemptKey.current = null;
  }, [selectedId, method, promo?.code]);

  // Скидка зависит от пакета: при смене пакета пересчитываем предпросмотр (деньги считает сервер).
  const promoCode = promo?.code;
  const previewFor = promo?.forPackageId;
  useEffect(() => {
    if (!promoCode || selectedId === null || previewFor === selectedId) return;
    let alive = true;
    void applyPromo(promoCode, selectedId)
      .then((preview) => {
        if (alive) setPromo({ code: promoCode, preview, forPackageId: selectedId });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setPromo(null);
        setPromoNotice({ variant: 'error', text: describeError(t, error) });
      });
    return () => {
      alive = false;
    };
  }, [promoCode, selectedId, previewFor]);

  async function onApplyPromo(event: FormEvent) {
    event.preventDefault();
    const code = promoInput.trim();
    if (!code || promoBusy) return;
    setPromoBusy(true);
    setPromoNotice(null);
    try {
      const result = await applyPromo(code, selectedId ?? undefined);
      if (result.kind === 'free_credits') {
        setPromoNotice({
          variant: 'success',
          text: t('billing.promo.freeCredits', { code: result.code, count: result.creditsGranted }),
        });
        setPromoInput('');
        setPromo(null);
        void load();
      } else {
        setPromo({ code: result.code, preview: result, forPackageId: selectedId });
        setPromoNotice({
          variant: 'success',
          text:
            result.totalBani === null
              ? t('billing.promo.appliedNoPackage', { code: result.code })
              : t('billing.promo.applied', {
                  code: result.code,
                  price: money(result.discountBani),
                }),
        });
      }
    } catch (error) {
      setPromo(null);
      setPromoNotice({ variant: 'error', text: describeError(t, error) });
    } finally {
      setPromoBusy(false);
    }
  }

  function removePromo() {
    setPromo(null);
    setPromoInput('');
    setPromoNotice(null);
  }

  async function onBuy() {
    if (selectedId === null || buying) return;
    setBuying(true);
    setBuyError(null);
    attemptKey.current ??= newAttemptKey();
    try {
      const { purchase } = await startPurchase({
        packageId: selectedId,
        method,
        ...(promo ? { promoCode: promo.code } : {}),
        idempotencyKey: attemptKey.current,
      });
      attemptKey.current = null;
      const target = destinationFor(purchase);
      if (target.internal) navigate(target.to);
      else window.location.assign(target.to);
    } catch (error) {
      // Нет связи: запрос мог дойти до сервера, поэтому повтор идёт с тем же ключом.
      if (!(error instanceof NetworkError)) attemptKey.current = null;
      setBuyError(describeError(t, error));
    } finally {
      setBuying(false);
    }
  }

  const nameOf = (p: PackageDto) =>
    p.boxes === 1 ? t('billing.package.single') : t('billing.package.title', { count: p.boxes });
  const selected = loaded.packages.find((p) => p.id === selectedId) ?? null;
  const preview = promo?.preview && selected ? promo.preview : null;

  if (loaded.status === 'loading') return <p role="status">{t('core.loading')}</p>;

  return (
    <div className="packages">
      <h1>{t('billing.title')}</h1>
      <p>{t('billing.lead')}</p>

      {loaded.status === 'error' ? (
        <Banner
          variant="error"
          action={
            <Button variant="secondary" onClick={() => void load()}>
              {t('core.action.retry')}
            </Button>
          }
        >
          {t('billing.loadError')}
        </Banner>
      ) : null}

      <Card title={t('billing.balance.title')}>
        {loaded.credits && loaded.credits.balance > 0 ? (
          <>
            <p role="status">{t('billing.balance.value', { count: loaded.credits.balance })}</p>
            <ul className="packages__lots" aria-label={t('billing.balance.lotsLabel')}>
              {loaded.credits.lots.map((lot) => (
                <li key={lot.id}>
                  {t('billing.balance.lot', { date: date(lot.expiresAt), count: lot.remaining })}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>{t('billing.balance.empty')}</p>
        )}
        <p>{t('billing.carryover.hint')}</p>
      </Card>

      {loaded.packages.length === 0 && loaded.status === 'ready' ? (
        <p>{t('billing.packages.none')}</p>
      ) : (
        <ul className="packages__grid">
          {loaded.packages.map((pack) => {
            const isSelected = pack.id === selectedId;
            const discounted = isSelected && preview !== null && preview.totalBani !== null;
            return (
              <li key={pack.id}>
                <Card
                  title={nameOf(pack)}
                  headingLevel={2}
                  className={isSelected ? 'package-card package-card--selected' : 'package-card'}
                >
                  <p>{t('billing.package.boxes', { count: pack.boxes })}</p>
                  <p>{t('billing.package.perBox', { price: money(pack.pricePerBoxBani) })}</p>
                  <p className="package-card__price">
                    {discounted ? (
                      <>
                        <span className="package-card__old">{money(pack.totalBani)}</span>{' '}
                        {t('billing.package.totalWithDiscount', {
                          price: money(preview!.totalBani!),
                        })}
                      </>
                    ) : (
                      t('billing.package.total', { price: money(pack.totalBani) })
                    )}
                  </p>
                  <p>{t('billing.package.validity', { days: pack.validityDays })}</p>
                  <Button
                    variant={isSelected ? 'primary' : 'secondary'}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedId(pack.id)}
                  >
                    {isSelected ? t('billing.package.selected') : t('billing.package.choose')}
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Card>
        <form className="packages__promo" onSubmit={(event) => void onApplyPromo(event)}>
          <TextField
            label={t('billing.promo.label')}
            hint={t('billing.promo.hint')}
            value={promoInput}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(event) => setPromoInput(event.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            loading={promoBusy}
            disabled={!promoInput.trim()}
          >
            {t('billing.promo.apply')}
          </Button>
        </form>
        {promoNotice ? <Banner variant={promoNotice.variant}>{promoNotice.text}</Banner> : null}
        {promo ? (
          <Button variant="ghost" onClick={removePromo}>
            {t('billing.promo.remove')}
          </Button>
        ) : null}
      </Card>

      <Card>
        <fieldset className="packages__methods">
          <legend>{t('billing.method.label')}</legend>
          {(['card', 'mia'] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="method"
                value={value}
                checked={method === value}
                onChange={() => setMethod(value)}
              />
              {t(`billing.method.${value}`)}
            </label>
          ))}
        </fieldset>
        <p>{t('billing.method.note')}</p>
        {buyError ? <Banner variant="error">{buyError}</Banner> : null}
        <Button
          fullWidth
          loading={buying}
          disabled={selected === null}
          aria-label={
            selected ? t('billing.package.buyLabel', { name: nameOf(selected) }) : undefined
          }
          onClick={() => void onBuy()}
        >
          {buying ? t('billing.purchase.starting') : t('billing.package.buy')}
        </Button>
      </Card>

      <Card title={t('billing.history.title')}>
        {loaded.purchases.length === 0 ? (
          <p>{t('billing.history.empty')}</p>
        ) : (
          <ul className="packages__history">
            {loaded.purchases.map((purchase) => (
              <li key={purchase.id}>
                <Link
                  to={`/pay/${purchase.id}`}
                  aria-label={t('billing.history.open', { id: purchase.id })}
                >
                  {t('billing.history.item', {
                    id: purchase.id,
                    count: purchase.boxes,
                    price: money(purchase.totalBani),
                  })}
                </Link>{' '}
                — {t(`billing.status.${purchase.status}`)}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function PackagesPage() {
  return (
    <RequireRole>
      <PackagesContent />
    </RequireRole>
  );
}
