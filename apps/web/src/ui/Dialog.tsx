import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button.tsx';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Подпись кнопки «Закрыть» (текст приходит из словаря). */
  closeLabel: string;
  children?: ReactNode;
  /** Кнопки действий внизу окна. */
  actions?: ReactNode;
  /** Можно ли закрыть окно клавишей Esc и щелчком по фону. По умолчанию да. */
  dismissible?: boolean;
  /** Скрыть кнопку «Закрыть» (когда закрытие — одно из действий). */
  hideClose?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Модальное окно: фокус не уходит за его пределы, Esc закрывает, после закрытия фокус возвращается. */
export function Dialog({
  open,
  onClose,
  title,
  closeLabel,
  children,
  actions,
  dismissible = true,
  hideClose = false,
}: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && dismissible) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="ui-dialog__backdrop"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className="ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
        <div className="ui-dialog__actions">
          {actions}
          {hideClose ? null : (
            <Button variant="secondary" onClick={onClose}>
              {closeLabel}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
