import type { ReactNode } from 'react';

/** Прокручивает к секции страницы и переводит на неё фокус; при `prefers-reduced-motion` без анимации. */
export function scrollToSection(target: string): void {
  const element = document.getElementById(target);
  if (!element) return;
  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  element.focus({ preventScroll: true });
}

export function AnchorLink({
  target,
  className,
  children,
}: {
  target: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={`#${target}`}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        scrollToSection(target);
      }}
    >
      {children}
    </a>
  );
}
