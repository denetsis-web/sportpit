import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  consentsResponseSchema,
  type ConsentKind,
  type ConsentState,
} from '@sportpit/shared/schemas/auth';
import { api } from '../../../api/index.ts';
import { useT } from '../../../app/i18n.tsx';
import { Banner, Button, Card } from '../../../ui/index.ts';
import './auth.css';
import { describeError } from './errors.ts';

export interface ConsentsFormProps {
  /** Какие согласия показать, каждое отдельной галочкой. */
  kinds: readonly ConsentKind[];
  /** Без каких галочек нельзя продолжить. */
  required?: readonly ConsentKind[];
  /** Вызывается после успешного сохранения. */
  onSaved: (states: ConsentState[]) => void;
}

/**
 * Согласия отдельными галочками (R16.1, R56). Таск «Анкета» подключает форму с `health_data`
 * перед сохранением параметров тела; сервер без этого согласия вернёт 403 `consent_required`.
 */
export function ConsentsForm({ kinds, required = [], onSaved }: ConsentsFormProps) {
  const t = useT();
  const headingId = useId();
  const [states, setStates] = useState<ConsentState[] | null>(null);
  const [checked, setChecked] = useState<Partial<Record<ConsentKind, boolean>>>({});
  const [error, setError] = useState<string | undefined>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get('/auth/consents', { schema: consentsResponseSchema })
      .then(({ items }) => {
        if (!alive) return;
        setStates(items);
        setChecked(Object.fromEntries(items.map((item) => [item.kind, item.granted])));
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadFailed(true);
        setError(describeError(t, e));
      });
    return () => {
      alive = false;
    };
    // язык влияет только на текст ошибки; повторная загрузка при смене языка не нужна
  }, []);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!states) return;
    if (required.some((kind) => !checked[kind])) {
      setError(t('auth.consent.needed'));
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const changes = kinds.map((kind) => ({
        kind,
        granted: checked[kind] === true,
        version: states.find((s) => s.kind === kind)!.version,
      }));
      const saved = await api.post('/auth/consents', {
        body: { changes },
        schema: consentsResponseSchema,
      });
      onSaved(saved.items);
    } catch (e) {
      setError(describeError(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} aria-labelledby={headingId} noValidate>
      <h2 id={headingId}>{t('auth.consent.title')}</h2>
      <p>{t('auth.consent.lead')}</p>
      {states
        ? kinds.map((kind) => {
            const state = states.find((s) => s.kind === kind)!;
            const textId = `${headingId}-${kind}`;
            return (
              <Card key={kind} className="consent">
                <label className="consent__option">
                  <input
                    type="checkbox"
                    checked={checked[kind] === true}
                    aria-describedby={textId}
                    onChange={(e) => setChecked((c) => ({ ...c, [kind]: e.target.checked }))}
                  />
                  <span>{t(`auth.consent.${kind}.label`)}</span>
                </label>
                <p className="consent__text" id={textId}>
                  {t(`auth.consent.${kind}.text`)}
                </p>
                <p className="consent__version">
                  {t('auth.consent.version', { version: state.version })}
                </p>
              </Card>
            );
          })
        : null}
      {error ? (
        <Banner variant="error" role="alert">
          {error}
        </Banner>
      ) : null}
      {!loadFailed ? (
        <Button type="submit" loading={busy} disabled={!states}>
          {t('auth.consent.save')}
        </Button>
      ) : null}
    </form>
  );
}
