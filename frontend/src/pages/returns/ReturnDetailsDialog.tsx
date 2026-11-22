import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { returnState } from './returns';
import type { ReturnBooking } from './returns';
import { ReturnBookingDetails } from './ReturnBookingDetails';

export function ReturnDetailsDialog({ booking, onClose, onRegister, onPay }: { booking: ReturnBooking; onClose: () => void; onRegister: () => void; onPay: () => void }) {
  const state = returnState(booking);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returned = booking.items.filter((item) => item.returned_at).length;

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  return (
    <dialog ref={dialogRef} className={`sale-dialog return-dialog return-state-${state.color}`} aria-labelledby="return-dialog-title" onClose={onClose} onCancel={onClose} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
      <div className="sale-dialog-header">
        <div><p className="sale-dialog-eyebrow">Scheda rientro</p><h2 id="return-dialog-title">Noleggio n. {booking.booking_number}</h2><p className="page-description">{booking.customer.first_name} {booking.customer.last_name}</p></div>
        <button type="button" className="icon-button" aria-label="Chiudi scheda rientro" onClick={onClose} autoFocus><X size={20} aria-hidden="true" /></button>
      </div>
      <div className="sale-dialog-body">
        <ReturnBookingDetails booking={booking} />
      </div>
      <div className="sale-dialog-footer">{state.color === 'yellow' && <button className="sales-button sales-button-primary" type="button" onClick={onPay}>Registra pagamento</button>}{returned < booking.items.length && <button className="sales-button sales-button-primary" type="button" onClick={onRegister}>Registra un altro rientro</button>}<button className="sales-button" type="button" onClick={onClose}>Chiudi</button></div>
    </dialog>
  );
}
