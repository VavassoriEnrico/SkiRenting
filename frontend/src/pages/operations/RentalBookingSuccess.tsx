import { CalendarCheck } from 'lucide-react';
import type { Customer } from '../customers/customer';

export type SavedBooking = {
  id: string; booking_number: number; starts_on: string; ends_on: string; status: string;
  total: string; paid_amount: string; balance: string;
  notes?: string | null;
};
const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export function RentalBookingSuccess({ booking, customer, onNew }: { booking: SavedBooking; customer: Customer; onNew: () => void }) {
  return <div className="dashboard-page"><section className="operations-preview" aria-labelledby="booking-confirmed-title"><div className="page-heading"><span className="heading-icon"><CalendarCheck size={23} aria-hidden="true" /></span><h1 id="booking-confirmed-title">Noleggio n. {booking.booking_number} confermato</h1></div>
    <p className="page-description">La prenotazione di {customer.first_name} {customer.last_name} è stata salvata.</p>
    <dl className="sale-details-grid rental-recap-details"><div><dt>Inizio</dt><dd>{booking.starts_on.split('-').reverse().join('/')}</dd></div><div><dt>Rientro previsto</dt><dd>{booking.ends_on.split('-').reverse().join('/')}</dd></div><div><dt>Totale</dt><dd>{currency.format(Number(booking.total))}</dd></div><div><dt>Pagamento registrato</dt><dd>{currency.format(Number(booking.paid_amount))}</dd></div><div><dt>Da saldare</dt><dd>{currency.format(Number(booking.balance))}</dd></div></dl>
    {booking.notes && <div className="rental-booking-notes"><h3>Note prenotazione</h3><p>{booking.notes}</p></div>}
    <button className="sales-button sales-button-primary" type="button" onClick={onNew}>Nuovo noleggio</button>
  </section></div>;
}
