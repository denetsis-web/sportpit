// Общие части страниц админки «Залы, холодильники, блюда, меню, настройки»: загрузка, ошибки сервера, поля форм.
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { ApiError, NetworkError } from '../../../api/index.ts';
import type { TFunction } from '../../../app/i18n.tsx';
import { RequireRole } from '../../client/auth/guards.tsx';
import './admin-forms.css';

/** Страница раздела: только администратор (сервер проверяет роль в любом случае). */
export function AdminOnly({ children }: { children: ReactNode }) {
  return <RequireRole roles={['admin']}>{children}</RequireRole>;
}

/** Текст ошибки запроса на языке интерфейса. */
export function errorText(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) return t(error.messageKey, error.params);
  if (error instanceof NetworkError) return t('core.error.network');
  return t('core.error.generic');
}

/** Ошибки по полям из ответа 400: имя поля → текст. */
export function fieldErrors(error: unknown, t: TFunction): Record<string, string> {
  if (!(error instanceof ApiError) || !error.fields) return {};
  return Object.fromEntries(Object.entries(error.fields).map(([name, key]) => [name, t(key)]));
}

export interface Resource<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/** Загружает данные при показе страницы и по требованию. */
export function useResource<T>(load: () => Promise<T>, deps: readonly unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((value) => {
        if (!alive) return;
        setData(value);
        setError(undefined);
      })
      .catch((e: unknown) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [version, ...deps]);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  return { data, error, loading, reload };
}

interface FieldProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  return (
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  );
}

function Wrap({
  id,
  label,
  hint,
  error,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="ui-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  value,
  onChange,
  options,
  disabled,
}: FieldProps & {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Wrap id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        className="ui-field__input"
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  value,
  onChange,
  rows = 3,
}: FieldProps & { value: string; onChange: (value: string) => void; rows?: number }) {
  const id = useId();
  return (
    <Wrap id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        className="ui-field__input admin-textarea"
        rows={rows}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        onChange={(e) => onChange(e.target.value)}
      />
    </Wrap>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="admin-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Число из поля ввода: пустая строка и нечисло дают `NaN`, чтобы сервер вернул понятную ошибку поля. */
export function toNumber(text: string): number {
  const normalized = text.trim().replace(',', '.');
  return normalized === '' ? Number.NaN : Number(normalized);
}

/** NaN не попадает в JSON (стал бы null): такое поле уходит как `null`, и проверка схемы отклонит его. */
export function numberOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
