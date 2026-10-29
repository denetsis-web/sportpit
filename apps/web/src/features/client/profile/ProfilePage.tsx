import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LANGS, type Lang } from '@sportpit/shared/i18n';
import type { ConsentState } from '@sportpit/shared/schemas/auth';
import type { ProfileResponse } from '@sportpit/shared/schemas/profile';
import { useI18n } from '../../../app/i18n.tsx';
import { Banner, Button, Card } from '../../../ui/index.ts';
import { ConsentsForm } from '../auth/ConsentsForm.tsx';
import { describeError } from '../auth/errors.ts';
import { RequireRole } from '../auth/guards.tsx';
import { DeleteSection, ExportSection } from './AccountSections.tsx';
import { loadProfile } from './api.ts';
import { PhoneSection } from './PhoneSection.tsx';
import { TargetsView } from './TargetsView.tsx';
import './profile.css';

function GoalSection({ data }: { data: ProfileResponse }) {
  const { t } = useI18n();
  const { profile, targets, healthConsent } = data;
  return (
    <Card title={t('profile.goal.title')} className="profile-section">
      {profile ? (
        <>
          <p>
            {t('profile.goal.summary', {
              sex: t(`profile.form.sex.${profile.sex}`),
              age: profile.age,
              height: profile.heightCm,
              weight: profile.weightKg,
            })}
          </p>
          <p>
            {t(`profile.form.goal.${profile.goal}`)};{' '}
            {t(`profile.form.activity.${profile.activity}`)}
          </p>
          {targets ? <TargetsView result={targets} /> : null}
        </>
      ) : (
        <>
          <p>{t('profile.goal.empty')}</p>
          {!healthConsent ? <p>{t('profile.goal.needConsent')}</p> : null}
        </>
      )}
      <Link to="/onboarding">{profile ? t('profile.goal.edit') : t('profile.goal.fill')}</Link>
    </Card>
  );
}

function LangSection() {
  const { t, lang, setLang } = useI18n();
  return (
    <Card title={t('profile.lang.title')} className="profile-section">
      <p>{t('profile.lang.lead')}</p>
      <div className="profile-actions" role="group" aria-label={t('profile.lang.title')}>
        {LANGS.map((code: Lang) => (
          <Button
            key={code}
            lang={code}
            variant={lang === code ? 'primary' : 'secondary'}
            aria-pressed={lang === code}
            onClick={() => setLang(code)}
          >
            {t(`core.language.${code}`)}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function Profile() {
  const { t } = useI18n();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [revoked, setRevoked] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await loadProfile());
      setError(undefined);
    } catch (e) {
      setError(describeError(t, e));
    }
  }, [t]);

  useEffect(() => {
    void load();
    // повторно — только после действий на странице
  }, []);

  function onConsentsSaved(states: ConsentState[]): void {
    setRevoked(states.find((s) => s.kind === 'health_data')?.granted === false);
    // сервер стирает анкету при отказе от согласия: перечитываем, чтобы показать актуальное
    void load();
  }

  return (
    <>
      <h1>{t('profile.title')}</h1>
      {error ? <Banner variant="error">{error}</Banner> : null}
      {data ? <GoalSection data={data} /> : error ? null : <p role="status">{t('core.loading')}</p>}
      <LangSection />
      <PhoneSection />
      <Card title={t('profile.consents.title')} className="profile-section">
        <p>{t('profile.consents.lead')}</p>
        <ConsentsForm
          kinds={['terms', 'privacy', 'health_data']}
          required={['terms', 'privacy']}
          onSaved={onConsentsSaved}
        />
        {revoked ? <Banner variant="info">{t('profile.consents.healthRevoked')}</Banner> : null}
      </Card>
      <ExportSection />
      <DeleteSection />
    </>
  );
}

/** Профиль: данные цели, язык, телефон, согласия, выгрузка и удаление аккаунта (R29). */
export function ProfilePage() {
  return (
    <RequireRole>
      <Profile />
    </RequireRole>
  );
}
