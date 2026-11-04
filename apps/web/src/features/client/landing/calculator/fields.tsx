// Поля форм лендинга (калькулятор и лист ожидания): вид по brand/landing/DESIGN.md, «Field».
// Подпись всегда над полем, ошибка под полем с иконкой и текстом, цели нажатия не меньше 44 px.
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import './forms.css';

/** Сообщение об ошибке: иконка и текст, не один цвет. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="lp-field__error" role="alert">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 7.5v5.5M12 16.2v.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <span>{children}</span>
    </p>
  );
}

function describe(...ids: Array<string | false | undefined>): string | undefined {
  const used = ids.filter(Boolean).join(' ');
  return used === '' ? undefined : used;
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>;

export interface TextFieldProps extends InputProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

export function TextField({ label, error, hint, ...input }: TextFieldProps) {
  const id = useId();
  return (
    <div className="lp-field">
      <label className="lp-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        {...input}
        id={id}
        className="lp-field__control"
        aria-invalid={error ? true : undefined}
        aria-describedby={describe(hint && `${id}-hint`, error && `${id}-error`)}
      />
      {hint ? (
        <p id={`${id}-hint`} className="lp-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}

export interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Первый пункт без значения («Выберите», «Не выбрана»). */
  placeholder: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  error?: string | undefined;
}

export function SelectField({
  label,
  value,
  onChange,
  placeholder,
  options,
  error,
}: SelectFieldProps) {
  const id = useId();
  return (
    <div className="lp-field">
      <label className="lp-field__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="lp-field__control"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe(error && `${id}-error`)}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}

export interface ChoiceFieldProps {
  legend: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  error?: string | undefined;
}

/** Выбор одного из нескольких коротких вариантов (пол): круглые «чипы» с радиокнопками. */
export function ChoiceField({ legend, name, value, onChange, options, error }: ChoiceFieldProps) {
  const id = useId();
  return (
    <fieldset className="lp-choices" aria-describedby={describe(error && `${id}-error`)}>
      <legend className="lp-field__label">{legend}</legend>
      <div className="lp-choices__row">
        {options.map((option) => (
          <label key={option.value} className="lp-chip">
            <input
              type="radio"
              name={`${id}-${name}`}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </fieldset>
  );
}

export interface CheckFieldProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | undefined;
  /** Что стоит рядом после подписи (ссылка), чтобы клик по ней не переключал галочку. */
  after?: ReactNode;
}

export function CheckField({ label, checked, onChange, error, after }: CheckFieldProps) {
  const id = useId();
  return (
    <div className="lp-field">
      <label className="lp-check" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-invalid={error ? true : undefined}
          aria-describedby={describe(error && `${id}-error`)}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      {after}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}
