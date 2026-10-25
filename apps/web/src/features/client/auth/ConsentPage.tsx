import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConsentsForm } from './ConsentsForm.tsx';
import { RequireRole } from './guards.tsx';
import { safeNext } from './LoginPage.tsx';

/** Условия и политика после первого входа. */
export function ConsentPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (
    <RequireRole>
      <ConsentsForm
        kinds={['terms', 'privacy']}
        required={['terms', 'privacy']}
        onSaved={() => navigate(safeNext(params.get('next')), { replace: true })}
      />
    </RequireRole>
  );
}
