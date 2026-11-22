import type { ReactNode } from 'react';

export function RentalSection({ id, title, children, className = '' }: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rental-section ${className}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <div id={`${id}-body`}>{children}</div>
    </section>
  );
}
