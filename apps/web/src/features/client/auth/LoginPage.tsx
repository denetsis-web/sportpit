import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  cleanPhoneInput,
  consentsResponseSchema,
  OTP_LENGTH,
  otpCodeSchema,
  PHONE_PATTERN,
  verifyResponseSchema,
} from '@sportpit/shared/schemas/auth';
import { api } from '../../../api/index.ts';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card, TextField } from '../../../ui/index.ts';
import './auth.css';
import { describeError } from './errors.ts';
import { logout, setSessionUser, useSession } from './session.ts';

/** Куда вернуться после входа: только путь внутри приложения. */
export function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function AccountView() {
  const { t } = useI18n();
  const { user } = useSession();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  return (
    <>
      <h1>{t('auth.account.title')}</h1>
      <Card>
        <p>{t('auth.account.signedInAs', { phone: user.phone })}</p>
        <p>{t('auth.account.role', { role: t(`auth.role.${user.role}`) })}</p>
        <Button
          variant="secondary"
          loading={busy}
          onClick={() => {
            setBusy(true);
            void logout().finally(() => setBusy(false));
          }}
        >
          {t('auth.action.logout')}
        </Button>
      </Card>
    </>
  );
}

type Step = 'phone' | 'code';

function LoginForm() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('+373');
  const [code, setCode] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [codeError, setCodeError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  /** Запрашивает код. Возвращает true, если SMS отправлена. */
  async function requestCode(): Promise<boolean> {
    const clean = cleanPhoneInput(phone);
    if (!PHONE_PATTERN.test(clean)) {
      setPhoneError(t('auth.error.phone'));
      return false;
    }
    setPhoneError(undefined);
    setBusy(true);
    try {
      await api.post('/auth/otp/request', { body: { phone: clean } });
      return true;
    } catch (error) {
      setPhoneError(describeError(t, error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onPhoneSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (await requestCode()) {
      setCode('');
      setCodeError(undefined);
      setStep('code');
    }
  }

  async function onResend(): Promise<void> {
    setCodeError(undefined);
    if (!(await requestCode())) {
      // причина (лимит, сбой SMS) показывается там, где человек сейчас смотрит
      setCodeError(phoneError);
    }
  }

  async function onCodeSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const clean = cleanPhoneInput(phone);
    if (!otpCodeSchema.safeParse(code).success) {
      setCodeError(t('auth.error.codeFormat'));
      return;
    }
    setCodeError(undefined);
    setBusy(true);
    try {
      const { user } = await api.post('/auth/otp/verify', {
        body: { phone: clean, code: code.trim(), lang },
        schema: verifyResponseSchema,
      });
      const next = safeNext(params.get('next'));
      // Условия и политика нужны до начала работы: если их ещё нет, сначала экран согласий.
      let destination = next;
      try {
        const { items } = await api.get('/auth/consents', { schema: consentsResponseSchema });
        const missing = items.some(
          (i) => (i.kind === 'terms' || i.kind === 'privacy') && !i.granted,
        );
        if (missing) destination = `/consent?next=${encodeURIComponent(next)}`;
      } catch {
        // без списка согласий вход всё равно состоялся
      }
      setSessionUser(user);
      navigate(destination, { replace: true });
    } catch (error) {
      setCodeError(describeError(t, error));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'phone') {
    return (
      <form onSubmit={(e) => void onPhoneSubmit(e)} noValidate>
        <TextField
          label={t('auth.phone.label')}
          hint={t('auth.phone.hint')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={phoneError}
        />
        <Button type="submit" fullWidth loading={busy}>
          {t('auth.action.sendCode')}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void onCodeSubmit(e)} noValidate>
      <Banner variant="info">{t('auth.code.sent', { phone: cleanPhoneInput(phone) })}</Banner>
      <TextField
        label={t('auth.code.label')}
        hint={t('auth.code.hint')}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={codeError}
      />
      <div className="auth-actions">
        <Button type="submit" loading={busy}>
          {t('auth.action.verify')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void onResend()}>
          {t('auth.action.resend')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setStep('phone')}>
          {t('auth.action.changePhone')}
        </Button>
      </div>
    </form>
  );
}

/** Вход по номеру и коду из SMS; для вошедшего — экран аккаунта с кнопкой «Выйти». */
export function LoginPage() {
  const { t } = useI18n();
  const { status, user } = useSession();
  if (status === 'loading') return <p role="status">{t('auth.account.loading')}</p>;
  if (user) return <AccountView />;
  return (
    <>
      <h1>{t('auth.title')}</h1>
      <LoginForm />
    </>
  );
}
