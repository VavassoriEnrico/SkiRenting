import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { ReturnBooking } from './demo-data';
import { formatReturnDate } from './demo-data';

export function ReturnDetailsDialog({ booking, onClose }: { booking: ReturnBooking; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returned = booking.items.filter((item) => item.returned).length;

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  return (
    <dialog ref={dialogRef} className="sale-dialog" aria-labelledby="return-dialog-title" onClose={onClose} onCancel={onClose} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
      <div className="sale-dialog-header">
        <div><p className="sale-dialog-eyebrow">Scheda rientro · dati dimostrativi</p><h2 id="return-dialog-title">{booking.id}</h2><p className="page-description">{booking.customer}</p></div>
        <button type="button" className="icon-button" aria-label="Chiudi scheda rientro" onClick={onClose} autoFocus><X size={20} aria-hidden="true" /></button>
      </div>
      <div className="sale-dialog-body">
        <section className="sale-detail-section" aria-labelledby="return-booking-title">
          <h3 id="return-booking-title">Noleggio</h3>
          <dl className="sale-details-grid">
            <div><dt>Cliente</dt><dd>{booking.customer}</dd></div><div><dt>Email</dt><dd>{booking.email}</dd></div>
            <div><dt>Data inizio</dt><dd>{formatReturnDate(booking.start)}</dd></div><div><dt>Rientro previsto</dt><dd>{formatReturnDate(booking.end)}</dd></div>
          </dl>
        </section>
        <section className="sale-detail-section" aria-labelledby="return-items-title">
          <h3 id="return-items-title">Materiale · {returned} di {booking.items.length} rientrati</h3>
          <ul className="return-items-list">
            {booking.items.map((item) => <li key={item.code}><div><strong>{item.name}</strong><span>Codice {item.code}</span></div><span className={`rental-status ${item.returned ? 'status-active' : 'status-confirmed'}`}>{item.returned ? 'Rientrato' : 'Da restituire'}</span></li>)}
          </ul>
          <p className="return-registration-note" id="return-registration-note">Registrazione dei rientri in preparazione. Questa scheda è un’anteprima consultabile.</p>
        </section>
      </div>
      <div className="sale-dialog-footer"><button className="sales-button" type="button" onClick={onClose}>Chiudi</button><button className="sales-button sales-button-primary" type="button" disabled aria-describedby="return-registration-note">Registra rientro</button></div>
    </dialog>
  );
}
