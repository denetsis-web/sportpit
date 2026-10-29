import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ConsentState } from '@sportpit/shared/schemas/auth';
import type { ProfileInput, ProfileResponse } from '@sportpit/shared/schemas/profile';
import { calcTargets, type TargetsResult } from '@sportpit/shared/targets';
import { useT } from '../../../app/i18n.tsx';
import { Banner } from '../../../ui/index.ts';
import { ConsentsForm } from '../auth/ConsentsForm.tsx';
import { describeError } from '../auth/errors.ts';
import { RequireRole } from '../auth/guards.tsx';
import { loadProfile, saveProfile } from '../profile/api.ts';
import { GoalForm } from '../profile/GoalForm.tsx';
import { TargetsView } from '../profile/TargetsView.tsx';

interface Outcome {
  targets: TargetsResult;
  saved: boolean;
}

function Onboarding() {
  const t = useT();
  const [loaded, setLoaded] = useState<ProfileResponse | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [consent, setConsent] = useState<boolean | undefined>();
  const [consentDone, setConsentDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [outcome, setOutcome] = useState<Outcome | undefined>();

  useEffect(() => {
    let alive = true;
    loadProfile()
      .then((response) => {
        if (!alive) return;
        setLoaded(response);
        setConsent(response.healthConsent);
        setConsentDone(response.healthConsent);
      })
      .catch((e: unknown) => {
        if (alive) setLoadError(describeError(t, e));
      });
    return () => {
      alive = false;
    };
    // язык влияет только на текст ошибки
  }, []);

  async function submit(input: Required<ProfileInput>): Promise<void> {
    setError(undefined);
    setBusy(true);
    try {
      if (consent) {
        const response = await saveProfile(input);
        // норму показываем ту, что посчитал сервер
        setOutcome({ targets: response.targets ?? calcTargets(input), saved: true });
      } else {
        // без согласия параметры не уходят на сервер: расчёт делается здесь и не сохраняется
        setOutcome({ targets: calcTargets(input), saved: false });
      }
    } catch (e) {
      setError(describeError(t, e));
    } finally {
      setBusy(false);
    }
  }

  function onConsent(states: ConsentState[]): void {
    setConsent(states.find((s) => s.kind === 'health_data')?.granted === true);
    setConsentDone(true);
  }

  if (loadError) return <Banner variant="error">{loadError}</Banner>;
  if (!loaded) return <p role="status">{t('profile.onboarding.loading')}</p>;

  if (outcome) {
    return (
      <>
        <h1>{t('profile.onboarding.resultStep')}</h1>
        <TargetsView result={outcome.targets} />
        <Banner variant={outcome.saved ? 'success' : 'warning'}>
          {outcome.saved ? t('profile.form.saved') : t('profile.form.notSaved')}
        </Banner>
        <div className="profile-actions">
          <Link to="/">{t('profile.onboarding.toMenu')}</Link>
          <Link to="/profile">{t('profile.onboarding.toProfile')}</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>{t('profile.onboarding.title')}</h1>
      <p>{t('profile.onboarding.lead')}</p>
      <p>
        <Link to="/">{t('profile.onboarding.skip')}</Link> {t('profile.onboarding.skipHint')}
      </p>
      {!consentDone ? (
        <section>
          <h2>{t('profile.onboarding.consentStep')}</h2>
          <p>{t('profile.onboarding.consentLead')}</p>
          <ConsentsForm kinds={['health_data']} onSaved={onConsent} />
        </section>
      ) : (
        <section>
          <h2>{t('profile.onboarding.formStep')}</h2>
          {error ? <Banner variant="error">{error}</Banner> : null}
          <GoalForm initial={loaded.profile} busy={busy} onSubmit={(input) => void submit(input)} />
        </section>
      )}
    </>
  );
}

/** Анкета цели после входа: её можно пропустить и вернуться из профиля (R16, R16.1). */
export function OnboardingPage() {
  return (
    <RequireRole>
      <Onboarding />
    </RequireRole>
  );
}
