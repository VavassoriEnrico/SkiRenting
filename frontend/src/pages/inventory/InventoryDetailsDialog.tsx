import { Package, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export type InventoryDetails = {
  title: string;
  category: string;
  warehouse: string;
  fields: { label: string; value: ReactNode }[];
  codes: string[];
  codesLabel: string;
  demo?: boolean;
  units?: { code: string; description?: string; action?: ReactNode }[];
};

export function InventoryDetailsDialog({ details, onClose, children, tariffSection, busy = false }: { details: InventoryDetails; onClose: () => void; children?: ReactNode; tariffSection?: ReactNode; busy?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const units: NonNullable<InventoryDetails['units']> = details.units || details.codes.map((code) => ({ code, description: '' }));

  return (
    <dialog ref={dialogRef} className="sale-dialog" aria-labelledby="inventory-dialog-title" onClose={() => { if (!busy) onClose(); }} onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }} onClick={(event) => {
      if (busy) return;
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
      <div className="sale-dialog-header">
        <div><p className="sale-dialog-eyebrow">{details.warehouse}{details.demo !== false && ' · dati dimostrativi'}</p><h2 id="inventory-dialog-title">{details.title}</h2><p className="page-description">{details.category}</p></div>
        <button className="icon-button" type="button" disabled={busy} aria-label="Chiudi scheda materiale" onClick={onClose} autoFocus><X size={20} aria-hidden="true" /></button>
      </div>
      <div className="sale-dialog-body">
        <section className="sale-detail-section" aria-labelledby="inventory-fields-title">
          <h3 id="inventory-fields-title">Scheda materiale</h3>
          <dl className="sale-details-grid">
            {details.fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
          </dl>
        </section>
        {tariffSection}
        {details.codesLabel && <section className="sale-detail-section" aria-labelledby="inventory-codes-title">
          <h3 id="inventory-codes-title">{details.codesLabel}</h3>
          {units.length === 0 && <p className="rental-form-hint">Nessun esemplare presente nel magazzino.</p>}
          <ul className="inventory-detail-codes">
            {units.map((unit) => (
              <li key={unit.code}><Package size={15} aria-hidden="true" /><span className="unit-code">{unit.code}</span>{unit.description && <span className="rental-unit-description">{unit.description}</span>}{unit.action}</li>
            ))}
          </ul>
        </section>}
        {children}
      </div>
      <div className="sale-dialog-footer"><button className="sales-button" type="button" disabled={busy} onClick={onClose}>Chiudi</button></div>
    </dialog>
  );
}
