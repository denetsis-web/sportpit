// Пауза пакета (R27.1): до 14 дней, один раз на пакет; срок кредитов сдвигается на дни паузы.
import { useId, useState, type FormEvent } from 'react';
import type { LotDto } from '@sportpit/shared/schemas/billing';
import { PAUSE_MAX_DAYS, type PauseDto } from '@sportpit/shared/schemas/orders';
import { addDaysISO, localDateISO } from '@sportpit/shared/time';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField } from '../../../ui/index.ts';
import { describeError } from '../auth/errors.ts';
import { pauseLot } from './api.ts';

type Notice = { variant: 'success' | 'error'; text: string } | null;

function LotPause({
  lot,
  pause,
  onPaused,
}: {
  lot: LotDto;
  pause: PauseDto | undefined;
  onPaused: (pause: PauseDto) => void;
}) {
  const { t, date } = useI18n();
  const idPrefix = useId();
  const [from, setFrom] = useState(() => addDaysISO(localDateISO(new Date()), 1));
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { pause: created } = await pauseLot({ lotId: lot.id, from, days: Number(days) });
      setNotice({
        variant: 'success',
        text: t('orders.pause.done', {
          from: date(created.from),
          until: date(created.until),
          date: date(created.expiresAt),
        }),
      });
      onPaused(created);
    } catch (error) {
      setNotice({ variant: 'error', text: describeError(t, error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="pause__lot">
      <p>{t('orders.pause.lot', { count: lot.remaining, date: date(lot.expiresAt) })}</p>
      {pause ? (
        <p>
          {t('orders.pause.active', {
            from: date(pause.from),
            until: date(pause.until),
            date: date(pause.expiresAt),
          })}
        </p>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} noValidate>
          <TextField
            id={`${idPrefix}-from`}
            label={t('orders.pause.from')}
            type="date"
            value={from}
            min={localDateISO(new Date())}
            onChange={(e) => setFrom(e.target.value)}
          />
          <TextField
            id={`${idPrefix}-days`}
            label={t('orders.pause.days')}
            type="number"
            inputMode="numeric"
            min={1}
            max={PAUSE_MAX_DAYS}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <Button
            type="submit"
            loading={busy}
            aria-label={t('orders.pause.submitLabel', { date: date(lot.expiresAt) })}
          >
            {t('orders.pause.submit')}
          </Button>
        </form>
      )}
      {notice ? <Banner variant={notice.variant}>{notice.text}</Banner> : null}
    </li>
  );
}

export function PauseSection({
  lots,
  pauses,
  onPaused,
}: {
  lots: LotDto[];
  pauses: PauseDto[];
  onPaused: (pause: PauseDto) => void;
}) {
  const { t } = useI18n();
  return (
    <Card title={t('orders.pause.title')}>
      <p>{t('orders.pause.lead')}</p>
      {lots.length === 0 ? (
        <p>{t('orders.pause.none')}</p>
      ) : (
        <ul className="pause__lots">
          {lots.map((lot) => (
            <LotPause
              key={lot.id}
              lot={lot}
              pause={pauses.find((p) => p.lotId === lot.id)}
              onPaused={onPaused}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
