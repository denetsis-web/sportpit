import { useId, type HTMLAttributes, type ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  /** Уровень заголовка, чтобы не ломать иерархию на странице. */
  headingLevel?: 2 | 3 | 4;
}

/** Карточка-секция. С заголовком получает имя для вспомогательных технологий. */
export function Card({ title, headingLevel = 2, className, children, ...rest }: CardProps) {
  const titleId = useId();
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return (
    <section
      {...rest}
      className={['ui-card', className ?? ''].filter(Boolean).join(' ')}
      aria-labelledby={title ? titleId : undefined}
    >
      {title ? (
        <Heading id={titleId} className="ui-card__title">
          {title}
        </Heading>
      ) : null}
      {children}
    </section>
  );
}
