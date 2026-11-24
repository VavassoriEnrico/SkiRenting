import { CalendarDays, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { apiGet } from '../../lib/api';
import { RentalHistoryDialog } from '../rentals/RentalHistoryDialog';
import { historyDate, historyDuration, historyMoney } from '../rentals/rental-history';
import { customerBirthDate, skillLevels, type Customer } from './customer';

type CustomerBookings = {
  customer: Customer; booking_count: number;
  bookings: { id: string; booking_number: number; location_id: string; location_name: string;
    starts_on: string; ends_on: string; total: string | null; paid_amount: string; is_legacy?:boolean; legacy_code?:string|null }[];
};

export function CustomerBookingsDialog({ customer, token, onClose }: {
  customer: Customer; token: string; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<CustomerBookings | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedBooking, setSelectedBooking] = useState<CustomerBookings['bookings'][number] | null>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(''); setPage(0);
    apiGet<CustomerBookings>(`/customers/${customer.id}/bookings`, token, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile caricare le prenotazioni.'); });
    return () => controller.abort();
  }, [token, customer.id, attempt]);
  const profile = data?.customer || customer;
  const name = [profile.first_name,profile.last_name].filter(Boolean).join(' ').trim() || 'Cliente senza nome';
  const bookings = data?.bookings || [];
  const currentPage = Math.min(page, Math.max(0, Math.ceil(bookings.length / 20) - 1));
  const visible = bookings.slice(currentPage * 20, (currentPage + 1) * 20);
  return <><dialog ref={dialog} className="sale-dialog customer-bookings-dialog" aria-labelledby="customer-bookings-title" onClose={onClose} onCancel={onClose} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    <div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">{name}</p><h2 id="customer-bookings-title">Prenotazioni del cliente</h2><p className="page-description">{[profile.email,profile.phone].filter(Boolean).join(' · ') || 'Nessun recapito registrato'}</p></div><button type="button" className="icon-button" aria-label="Chiudi prenotazioni cliente" autoFocus onClick={onClose}><X size={20} aria-hidden="true" /></button></div>
    <div className="sale-dialog-body">
      <section className="sale-detail-section" aria-labelledby="customer-profile-title">
        <h3 id="customer-profile-title">Dati del cliente</h3>
        <dl className="sale-details-grid">
          {[
            ['Nome', profile.first_name], ['Cognome', profile.last_name],
            ['Email', profile.email], ['Telefono', profile.phone],
            ['Data di nascita', customerBirthDate(profile.birth_date)],
            ['Livello', profile.skill_level ? skillLevels[profile.skill_level] : null],
            ['Lingua', profile.language], ['Paese', profile.country_code], ['Note', profile.notes],
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{value || '—'}</dd></div>)}
        </dl>
      </section>
      <section className="sale-detail-section" aria-label="Storico prenotazioni">
        <h3>Prenotazioni</h3>
      {error ? <div className="rentals-empty"><p className="auth-error" role="alert">{error}</p><button type="button" className="sales-button" onClick={() => setAttempt((value) => value + 1)}>Riprova prenotazioni</button></div> : !data ? <p role="status">Caricamento prenotazioni…</p> : <>
        <div className="customer-bookings-summary"><CalendarDays size={22} aria-hidden="true" /><strong role="status">{data.booking_count} {data.booking_count === 1 ? 'prenotazione' : 'prenotazioni'}</strong><span>Dalla più recente alla più vecchia</span></div>
        <div className="rentals-table-scroll" role="region" aria-label="Prenotazioni del cliente, scorrimento orizzontale" tabIndex={0}><table className="rentals-table"><caption className="sr-only">Prenotazioni in ordine di data di inizio decrescente, con totale e importo pagato</caption><thead><tr><th scope="col">Noleggio</th><th scope="col">Data inizio</th><th scope="col">Data fine</th><th scope="col">Durata</th><th scope="col">Sede</th><th scope="col">Totale</th><th scope="col">Pagato</th></tr></thead><tbody>
          {visible.map((booking) => <tr key={booking.id} className="inventory-clickable-row" onClick={(event) => { if (!(event.target as HTMLElement).closest('button,a')) setSelectedBooking(booking); }}><th scope="row"><button type="button" className="sale-id-link" aria-haspopup="dialog" aria-label={`Apri noleggio ${booking.is_legacy ? booking.legacy_code : booking.booking_number}`} onClick={() => setSelectedBooking(booking)}>{booking.is_legacy?`Cod. ${booking.legacy_code}`:`N° ${booking.booking_number}`}</button>{booking.is_legacy&&<span className="rental-secondary">Storico importato</span>}</th><td>{historyDate(booking.starts_on)}</td><td>{historyDate(booking.ends_on)}</td><td>{historyDuration(booking.starts_on, booking.ends_on)}</td><td>{booking.location_name}</td><td>{historyMoney(booking.total)}</td><td>{historyMoney(booking.paid_amount)}</td></tr>)}
          {bookings.length === 0 && <tr><td colSpan={7}><div className="rentals-empty"><h3>Nessuna prenotazione registrata per questo cliente</h3></div></td></tr>}
        </tbody></table></div>
        {bookings.length > 20 && <div className="rental-equipment-pagination"><span>{currentPage * 20 + 1}–{Math.min((currentPage + 1) * 20, bookings.length)} di {bookings.length}</span><div><button type="button" className="sales-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Precedenti</button><button type="button" className="sales-button" disabled={(currentPage + 1) * 20 >= bookings.length} onClick={() => setPage(currentPage + 1)}>Successivi</button></div></div>}
        <p className="rental-form-hint">Il conteggio comprende le prenotazioni registrate nelle sedi a cui hai accesso.</p>
      </>}
      </section>
    </div>
    <div className="sale-dialog-footer"><button type="button" className="sales-button" onClick={onClose}>Chiudi</button></div>
  </dialog>
    {selectedBooking && <RentalHistoryDialog key={selectedBooking.id} id={selectedBooking.id} locationId={selectedBooking.location_id} locationName={selectedBooking.location_name} token={token} onClose={() => setSelectedBooking(null)} />}
  </>;
}
