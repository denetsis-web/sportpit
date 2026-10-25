import type { HTMLAttributes, ReactNode } from 'react';

export type BannerVariant = 'info' | 'success' | 'warning' | 'error';

export interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BannerVariant;
  /** Кнопка или ссылка справа от текста. */
  action?: ReactNode;
}

/**
 * Сообщение над содержимым. Ошибка объявляется сразу (role="alert"),
 * остальное — вежливо (role="status"). Роль можно задать явно.
 */
export function Banner({
  variant = 'info',
  action,
  role,
  className,
  children,
  ...rest
}: BannerProps) {
  const effectiveRole = role ?? (variant === 'error' ? 'alert' : 'status');
  return (
    <div
      {...rest}
      role={effectiveRole}
      className={['ui-banner', `ui-banner--${variant}`, className ?? ''].filter(Boolean).join(' ')}
    >
      <div className="ui-banner__body">{children}</div>
      {action}
    </div>
  );
}
