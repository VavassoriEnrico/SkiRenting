import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

export function RentalSection({ id, step, title, children, className = '', complete = false }: {
  id: string;
  step: number;
  title: string;
  children: ReactNode;
  className?: string;
  complete?: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section className={`rentals-panel rental-section ${className}${complete && !open ? ' is-complete' : ''}`} aria-labelledby={`${id}-title`}>
      <div className="rentals-panel-heading">
        <h2 id={`${id}-title`}>
          <button className="rental-section-toggle" type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((value) => !value)}>
            <span className="rental-customer-step" aria-hidden="true">{step}</span>
            <span>{title}</span>
            <ChevronDown size={20} aria-hidden="true" />
          </button>
        </h2>
      </div>
      <div id={`${id}-body`} hidden={!open}>{children}</div>
    </section>
  );
}
