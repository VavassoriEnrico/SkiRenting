import { historyDate, historyTime, historyMoney } from '../rentals/rental-history';
import { returnState } from './returns';
import type { ReturnBooking } from './returns';

export function ReturnBookingDetails({ booking }: { booking: ReturnBooking }) {
  const state = returnState(booking);
  const returned = booking.items.filter((item) => item.returned_at).length;
  return <>
        <div className={`return-state-banner return-state-${state.color}`} role="status"><strong>{state.label}</strong><p>{returned} di {booking.items.length} articoli rientrati</p></div>
        <dl className="sale-details-grid"><div><dt>Totale noleggio</dt><dd>{historyMoney(booking.total)}</dd></div><div><dt>Pagato</dt><dd>{historyMoney(booking.paid_amount)}</dd></div><div><dt>Da saldare</dt><dd>{historyMoney(booking.balance)}</dd></div></dl>
        <section className="sale-detail-section" aria-labelledby="return-booking-title">
          <h3 id="return-booking-title">Noleggio</h3>
          <dl className="sale-details-grid">
            <div><dt>Cliente</dt><dd>{booking.customer.first_name} {booking.customer.last_name}</dd></div><div><dt>Email</dt><dd>{booking.customer.email || '—'}</dd></div><div><dt>Cellulare</dt><dd>{booking.customer.phone || '—'}</dd></div>
            <div><dt>Data inizio</dt><dd>{historyDate(booking.starts_on)}</dd></div><div><dt>Rientro previsto</dt><dd>{historyDate(booking.ends_on)}</dd></div>
          </dl>
        </section>
        {booking.notes && <section className="sale-detail-section"><h3>Note prenotazione</h3><p className="history-notes">{booking.notes}</p></section>}
        <section className="sale-detail-section" aria-labelledby="return-items-title">
          <h3 id="return-items-title">Materiale · {returned} di {booking.items.length} rientrati</h3>
          <ul className="return-items-list">
            {booking.items.map((item) => <li key={item.id}><div><strong>{item.brand_snapshot} {item.model_snapshot} · {item.size_snapshot || '—'}</strong><span>Codice {item.code_snapshot}</span></div><span className={`rental-status ${item.returned_at ? 'status-active' : 'status-confirmed'}`}>{item.returned_at ? `Rientrato · ${historyTime(item.returned_at)}` : 'Da restituire'}</span></li>)}
          </ul>
          <p className="return-registration-note" id="return-registration-note">Il rientro aggiorna la disponibilità del singolo esemplare. I pagamenti restano registrazioni separate.</p>
        </section>
  </>;
}
