import { Eye } from 'lucide-react';
import { useState } from 'react';

import { historyDate, historyMoney } from '../rentals/rental-history';
import { pendingItems } from './returns';
import type { ReturnBooking } from './returns';

export function ReturnBookingsSection({ color, title, bookings, onSelect, onPay }: {
  color: string; title: string; bookings: ReturnBooking[]; onSelect: (booking: ReturnBooking) => void; onPay: (booking: ReturnBooking) => void;
}) {
  const [page, setPage] = useState(0);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(bookings.length / 20) - 1));
  const visible = bookings.slice(currentPage * 20, (currentPage + 1) * 20);
  return <section className={`rentals-panel return-bookings-section return-section-${color}`} aria-labelledby={`returns-${color}-title`}>
    <div className="rentals-panel-heading"><h2 id={`returns-${color}-title`}>{title}</h2><span className="rentals-count">{bookings.length} noleggi</span></div>
    <div className="rentals-table-scroll" role="region" aria-label={`${title}, scorrimento orizzontale`} tabIndex={0}><table className="rentals-table"><caption className="sr-only">{title}: noleggi con rientro previsto oggi</caption><thead><tr><th scope="col">Noleggio</th><th scope="col">Cliente</th><th scope="col">Rientro previsto</th><th scope="col">Materiale</th><th scope="col">Da saldare</th><th scope="col">Azioni</th></tr></thead><tbody>
      {visible.map((booking) => <tr key={booking.id} className="inventory-clickable-row" onClick={(event) => { if (!(event.target as HTMLElement).closest('button')) onSelect(booking); }}>
        <th scope="row">N° {booking.booking_number}</th><td><span className="rental-primary">{booking.customer.first_name} {booking.customer.last_name}</span><span className="rental-secondary">{booking.customer.email || booking.customer.phone || '—'}</span></td><td>{historyDate(booking.ends_on)}</td><td><span className="rental-primary">{pendingItems(booking) ? `${pendingItems(booking)} da restituire` : 'Tutto rientrato'}</span><span className="rental-secondary">{booking.items.length - pendingItems(booking)} di {booking.items.length} rientrati</span>{pendingItems(booking) > 0 && pendingItems(booking) < booking.items.length && <span className="rental-secondary">Rientro parziale</span>}</td><td>{historyMoney(booking.balance)}</td><td><div className="sales-row-actions"><button className="icon-button" type="button" aria-label={`Apri scheda rientro ${booking.booking_number}`} aria-haspopup="dialog" onClick={() => onSelect(booking)}><Eye size={17} aria-hidden="true" /></button>{color === 'yellow' && <button className="sales-button" type="button" aria-label={`Registra pagamento noleggio ${booking.booking_number}`} onClick={() => onPay(booking)}>Registra pagamento</button>}</div></td>
      </tr>)}
      {bookings.length === 0 && <tr><td colSpan={6}><p className="rentals-empty">Nessuna prenotazione in questa sezione.</p></td></tr>}
    </tbody></table></div>
    {bookings.length > 20 && <div className="rental-equipment-pagination history-pagination"><span>{currentPage * 20 + 1}–{Math.min((currentPage + 1) * 20, bookings.length)} di {bookings.length}</span><div><button type="button" className="sales-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Precedenti</button><button type="button" className="sales-button" disabled={(currentPage + 1) * 20 >= bookings.length} onClick={() => setPage(currentPage + 1)}>Successivi</button></div></div>}
  </section>;
}
