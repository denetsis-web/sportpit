// Секция «Лист ожидания» (`#join`): форма записи, ошибки у полей, подтверждение после успеха.
// Обёртка `<section id="join">` с фокусом и фоном — в LandingEntry; здесь содержимое и заголовок с id `lp-join-title`.
// Согласие обязательно и не отмечено заранее; текст согласия и страница `/legal` — заготовки владельца и юриста.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { cleanPhoneInput, PHONE_PATTERN } from '@sportpit/shared/schemas/auth';
import type { WaitlistJoin } from '@sportpit/shared/schemas/growth';
import { GOALS, type Goal } from '@sportpit/shared/targets';
import { ApiError } from '../../../../api/index.ts';
import { useI18n } from '../../../../app/i18n.tsx';
import { joinWaitlist } from '../api.ts';
import { CheckField, FieldError, SelectField, TextField } from '../calculator/fields.tsx';
import { getAttribution } from '../tracker.ts';
import { landingPath } from '../useShowLanding.ts';
import { usePrefill } from './prefill.ts';

/** Телефон в поле начинается с кода страны, как на странице входа. */
const PHONE_START = '+373';

type JoinField = 'phone' | 'consent' | 'name' | 'gym' | 'goal';

/** Какой текст показать у поля по ответу 400 (`error.fields`: поле → ключ словаря сервера). */
const FIELD_KEYS: Record<JoinField, string> = {
  phone: 'landing.join.error.phone',
  consent: 'landing.join.error.consent',
  name: 'landing.join.error.invalid',
  gym: 'landing.join.error.invalid',
  goal: 'landing.join.error.invalid',
};

type FieldErrors = Partial<Record<JoinField, string>>;

const isJoinField = (name: string): name is JoinField =>
  Object.prototype.hasOwnProperty.call(FIELD_KEYS, name);

export default function JoinSection() {
  const { t, lang } = useI18n();
  const [phone, setPhone] = useState(PHONE_START);
  const [name, setName] = useState('');
  const [gym, setGym] = useState('');
  const [goal, setGoal] = useState('');
  const [consent, setConsent] = useState(false);
  const [bait, setBait] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const sending = useRef(false);
  const doneRef = useRef<HTMLDivElement>(null);
  const baitId = useId();

  // цель, переданная калькулятором, подставляется в поле (и повторно при новом расчёте)
  const prefill = usePrefill();
  useEffect(() => {
    if (prefill.goal) setGoal(prefill.goal);
  }, [prefill]);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (sending.current) return;
    const clean = cleanPhoneInput(phone);
    const found: FieldErrors = {};
    if (!PHONE_PATTERN.test(clean)) found.phone = t('landing.join.error.phone');
    if (!consent) found.consent = t('landing.join.error.consent');
    setErrors(found);
    setFormError(undefined);
    if (Object.keys(found).length > 0) return;

    const body: WaitlistJoin = {
      phone: clean,
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(gym.trim() ? { gym: gym.trim() } : {}),
      ...((GOALS as readonly string[]).includes(goal) ? { goal: goal as Goal } : {}),
      lang,
      consent: true,
      website: bait,
      attribution: getAttribution(),
    };
    sending.current = true;
    setBusy(true);
    try {
      await joinWaitlist(body);
      setDone(true);
    } catch (error) {
      showError(error);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  function showError(error: unknown): void {
    if (error instanceof ApiError) {
      if (error.status === 429) {
        setFormError(t('landing.join.error.rate'));
        return;
      }
      if (error.status === 400 && error.fields) {
        const bound: FieldErrors = {};
        for (const field of Object.keys(error.fields)) {
          if (isJoinField(field)) bound[field] = t(FIELD_KEYS[field]);
        }
        if (Object.keys(bound).length > 0) {
          setErrors(bound);
          return;
        }
      }
      setFormError(t('landing.join.error.generic'));
      return;
    }
    // нет ответа сервера: обрыв, нет сети, таймаут
    setFormError(t('landing.join.error.network'));
  }

  return (
    <>
      <p className="lp-label">{t('landing.join.label')}</p>
      <h2 id="lp-join-title" className="lp-headline">
        {t('landing.join.title')}
      </h2>
      <p className="lp-lead">{t('landing.join.text')}</p>
      {done ? (
        <div ref={doneRef} tabIndex={-1} role="status" className="lp-formcard lp-join">
          <h3 className="lp-card-title">{t('landing.join.success.title')}</h3>
          <p>{t('landing.join.success.text')}</p>
        </div>
      ) : (
        <form
          className="lp-formcard lp-join"
          onSubmit={(event) => void submit(event)}
          noValidate
          aria-labelledby="lp-join-title"
        >
          <TextField
            label={t('landing.join.phone')}
            hint={t('landing.join.phone.hint')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setErrors((current) => ({ ...current, phone: undefined }));
            }}
            error={errors.phone}
          />
          <TextField
            label={t('landing.join.name')}
            autoComplete="given-name"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
          />
          <TextField
            label={t('landing.join.gym')}
            autoComplete="off"
            maxLength={80}
            value={gym}
            onChange={(event) => setGym(event.target.value)}
            error={errors.gym}
          />
          <SelectField
            label={t('landing.join.goal')}
            placeholder={t('landing.join.goal.none')}
            value={goal}
            onChange={setGoal}
            options={GOALS.map((value) => ({ value, label: t(`landing.join.goal.${value}`) }))}
            error={errors.goal}
          />
          <CheckField
            label={t('landing.join.consent')}
            checked={consent}
            onChange={(checked) => {
              setConsent(checked);
              setErrors((current) => ({ ...current, consent: undefined }));
            }}
            error={errors.consent}
            after={
              <Link className="lp-field__link" to={landingPath('legal', lang)}>
                {t('landing.join.consent.read')}
              </Link>
            }
          />
          {/* Приманка для ботов: человек её не видит, не достаёт клавиатурой и не слышит скринридер. */}
          <div className="lp-trap" aria-hidden="true">
            <label htmlFor={baitId}>{t('landing.join.website')}</label>
            <input
              id={baitId}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={bait}
              onChange={(event) => setBait(event.target.value)}
            />
          </div>
          {formError ? <FieldError>{formError}</FieldError> : null}
          <button type="submit" className="lp-btn lp-btn--berry" disabled={busy} aria-busy={busy}>
            {busy ? t('landing.join.sending') : t('landing.join.submit')}
          </button>
        </form>
      )}
    </>
  );
}

export { JoinSection };
