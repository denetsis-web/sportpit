// Тонкая входная точка лендинга: решает «лендинг или приложение» и лениво грузит тяжёлый код лендинга.
// Сам файл лёгкий и входит в начальный набор, поэтому тексты и вёрстка лендинга сюда не попадают.
import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useT } from '../../../app/i18n.tsx';
import { useShowLanding } from './useShowLanding.ts';

const LandingEntry = lazy(() => import('./LandingEntry.tsx'));
const LegalPage = lazy(() => import('./LegalPage.tsx'));

function Neutral() {
  const t = useT();
  return <p role="status">{t('core.loading')}</p>;
}

/** Главная `/`: лендинг гостю в браузере, иначе то, что передано в `app`. */
export function HomeGate({ app }: { app: ReactNode }) {
  const { showLanding, pending } = useShowLanding();
  if (pending) return <Neutral />;
  if (!showLanding) return <>{app}</>;
  return (
    <Suspense fallback={<Neutral />}>
      <LandingEntry />
    </Suspense>
  );
}

/** `/ro`: лендинг на румынском; вошедшего и гостя в установленном приложении переносит на `/`. */
export function RoGate() {
  const { showLanding, pending } = useShowLanding();
  if (pending) return <Neutral />;
  if (!showLanding) return <Navigate to="/" replace />;
  return (
    <Suspense fallback={<Neutral />}>
      <LandingEntry />
    </Suspense>
  );
}

/** `/legal`, `/ro/legal`: страница нужна и гостю, и вошедшему; вошедшему она открывается внутри приложения. */
export function LegalGate() {
  return (
    <Suspense fallback={<Neutral />}>
      <LegalPage />
    </Suspense>
  );
}
