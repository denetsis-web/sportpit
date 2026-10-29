import { useState, type FormEvent } from 'react';
import {
  cleanPhoneInput,
  OTP_LENGTH,
  otpCodeSchema,
  PHONE_PATTERN,
} from '@sportpit/shared/schemas/auth';
import { useT } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField } from '../../../ui/index.ts';
import { describeError } from '../auth/errors.ts';
import { setSessionUser, useSession } from '../auth/session.ts';
import { confirmPhone, requestPhoneCode } from './api.ts';

type Step = 'idle' | 'phone' | 'code';

/** Смена телефона: код приходит на НОВЫЙ номер, номер меняется только после его ввода (R29.2). */
export function PhoneSection() {
  const t = useT();
  const { user } = useSession();
  const [step, setStep] = useState<Step>('idle');
  const [phone, setPhone] = useState('+373');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const clean = cleanPhoneInput(phone);

  async function request(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!PHONE_PATTERN.test(clean)) return setError(t('auth.error.phone'));
    setError(undefined);
    setBusy(true);
    try {
      await requestPhoneCode(clean);
      setCode('');
      setDone(undefined);
      setStep('code');
    } catch (e) {
      setError(describeError(t, e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!otpCodeSchema.safeParse(code).success) return setError(t('auth.error.codeFormat'));
    setError(undefined);
    setBusy(true);
    try {
      const { user: updated } = await confirmPhone(clean, code.trim());
      setSessionUser(updated);
      setDone(t('profile.phone.changed', { phone: updated.phone }));
      setStep('idle');
    } catch (e) {
      setError(describeError(t, e));
    } finally {
      setBusy(false);
    }
  }

  function cancel(): void {
    setStep('idle');
    setError(undefined);
  }

  return (
    <Card title={t('profile.phone.title')} className="profile-section">
      <p>{t('profile.phone.current', { phone: user?.phone ?? '' })}</p>
      {done ? <Banner variant="success">{done}</Banner> : null}
      {step === 'idle' ? (
        <Button variant="secondary" onClick={() => setStep('phone')}>
          {t('profile.phone.change')}
        </Button>
      ) : null}
      {step === 'phone' ? (
        <form onSubmit={(e) => void request(e)} noValidate>
          <TextField
            label={t('profile.phone.new')}
            hint={t('profile.phone.newHint')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={error}
          />
          <div className="profile-actions">
            <Button type="submit" loading={busy}>
              {t('profile.phone.sendCode')}
            </Button>
            <Button variant="ghost" onClick={cancel}>
              {t('profile.phone.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
      {step === 'code' ? (
        <form onSubmit={(e) => void confirm(e)} noValidate>
          <Banner variant="info">{t('profile.phone.sent', { phone: clean })}</Banner>
          <TextField
            label={t('profile.phone.code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={error}
          />
          <div className="profile-actions">
            <Button type="submit" loading={busy}>
              {t('profile.phone.confirm')}
            </Button>
            <Button variant="ghost" onClick={cancel}>
              {t('profile.phone.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
