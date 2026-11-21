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
  units?: { code: string; description: string }[];
};

export function InventoryDetailsDialog({ details, onClose }: { details: InventoryDetails; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  return (
    <dialog ref={dialogRef} className="sale-dialog" aria-labelledby="inventory-dialog-title" onClose={onClose} onCancel={onClose} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
      <div className="sale-dialog-header">
        <div><p className="sale-dialog-eyebrow">{details.warehouse}{details.demo !== false && ' · dati dimostrativi'}</p><h2 id="inventory-dialog-title">{details.title}</h2><p className="page-description">{details.category}</p></div>
        <button className="icon-button" type="button" aria-label="Chiudi scheda materiale" onClick={onClose} autoFocus><X size={20} aria-hidden="true" /></button>
      </div>
      <div className="sale-dialog-body">
        <section className="sale-detail-section" aria-labelledby="inventory-fields-title">
          <h3 id="inventory-fields-title">Scheda materiale</h3>
          <dl className="sale-details-grid">
            {details.fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
          </dl>
        </section>
        <section className="sale-detail-section" aria-labelledby="inventory-codes-title">
          <h3 id="inventory-codes-title">{details.codesLabel}</h3>
          <ul className="inventory-detail-codes">
            {(details.units || details.codes.map((code) => ({ code, description: '' }))).map((unit) => (
              <li key={unit.code}><Package size={15} aria-hidden="true" /><span className="unit-code">{unit.code}</span>{unit.description && <span className="rental-unit-description">{unit.description}</span>}</li>
            ))}
          </ul>
        </section>
      </div>
      <div className="sale-dialog-footer"><button className="sales-button" type="button" onClick={onClose}>Chiudi</button></div>
    </dialog>
  );
}
