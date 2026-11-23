import { CalendarCheck, CalendarDays, Eye, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { StatCard } from '../../components/ui/StatCard';
import { apiGet } from '../../lib/api';
import { normalizeCustomerText } from '../customers/customer';
import { ReturnPaymentDialog } from '../returns/ReturnPaymentDialog';
import { RentalHistoryDialog } from './RentalHistoryDialog';
import { historyDate, historyMoney, historyStatuses, historyStatus } from './rental-history';
import type { HistoryBooking, HistoryDisplayStatus } from './rental-history';

type RentalView = 'all' | 'current' | 'history';

export function RentalsPage({ view = 'all', seasonId, seasonName }: { view?: RentalView; seasonId?:string; seasonName?:string }) {
  const { session, location } = useAuth();
  return session && location ? <RentalHistory key={`${view}:${seasonId}:${location.id}:${session.access_token}`} view={view} seasonId={seasonId} seasonName={seasonName} token={session.access_token} locationId={location.id} locationName={location.name} /> : <p role="status">Seleziona una sede per consultare i noleggi.</p>;
}

function RentalHistory({ token, locationId, locationName, view, seasonId, seasonName }: { token: string; locationId: string; locationName: string; view: RentalView; seasonId?:string; seasonName?:string }) {
  const isSeasonal = !!seasonId;
  const [bookings, setBookings] = useState<HistoryBooking[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<HistoryDisplayStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [paying, setPaying] = useState<HistoryBooking | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(''); setBookings(null);
    apiGet<HistoryBooking[]>(isSeasonal?`/locations/${locationId}/seasonal-bookings?season_id=${seasonId}`:`/locations/${locationId}/rental-bookings?scope=all`, token, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setBookings(result); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile caricare i noleggi.'); });
    return () => controller.abort();
  }, [token, locationId, attempt, view, seasonId, isSeasonal]);

  const terms = normalizeCustomerText(query).trim().split(/\s+/);
  const invalidPeriod = !!(from && to && to < from);
  const isClosed = (booking: HistoryBooking) => ['completed', 'awaiting_payment', 'cancelled'].includes(historyStatus(booking));
  const scopedBookings = (bookings || []).filter(booking => (isSeasonal || booking.rental_kind !== 'seasonal')
    && (view === 'all' || (view === 'history' ? isClosed(booking) : !isClosed(booking))));
  const statusOptions = Object.entries(historyStatuses).filter(([value]) => view === 'all' || (view === 'history' ? ['completed','awaiting_payment','cancelled'].includes(value) : ['confirmed','preparing','active'].includes(value)));
  const filtered = scopedBookings.filter((booking) => {
    const text = normalizeCustomerText([booking.booking_number, booking.customer.first_name, booking.customer.last_name, booking.customer.email, booking.customer.phone].join(' '));
    const phone = (booking.customer.phone || '').replace(/\D/g, '');
    return !invalidPeriod && (!status || historyStatus(booking) === status) && (!from || booking.ends_on >= from) && (!to || booking.starts_on <= to)
      && terms.every((term) => text.includes(term) || (/^[+\d().-]+$/.test(term) && term.replace(/\D/g, '').length > 0 && phone.includes(term.replace(/\D/g, ''))));
  });
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 20) - 1));
  const visible = filtered.slice(currentPage * 20, (currentPage + 1) * 20);
  const hasFilters = !!(query || status || from || to);
  function reset() { setQuery(''); setStatus(''); setFrom(''); setTo(''); setPage(0); }

  return <div className="dashboard-page rentals-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><CalendarDays size={21} aria-hidden="true" /></span><h1>{isSeasonal ? (view === 'history' ? 'Storico noleggi stagionali' : 'Noleggi stagionali attuali') : view === 'current' ? 'Noleggi attuali' : view === 'history' ? 'Storico noleggi' : 'Storico noleggi'}</h1></div><p className="page-description">{isSeasonal ? `Stagione ${seasonName} · Noleggi stagionali ${view === 'history' ? 'conclusi, da saldare e annullati' : 'prenotati, in preparazione e da riconsegnare'} di ${locationName}.` : view === 'current' ? `Noleggi prenotati, in preparazione e da riconsegnare di ${locationName}.` : view === 'history' ? `Noleggi conclusi, da saldare e annullati di ${locationName}.` : `Tutti i noleggi di ${locationName}, dalle prenotazioni ai noleggi conclusi.`}</p></div><button className="sales-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Aggiorna</button></div>
    {bookings && <section className="stats-section tone-indigo rentals-summary" aria-label="Riepilogo dei noleggi filtrati"><div className="stats-grid"><StatCard label="Noleggi" value={String(filtered.length)} detail="Nella selezione corrente" icon={CalendarDays} /><StatCard label="Conclusi" value={String(filtered.filter((booking) => ['completed', 'awaiting_payment'].includes(historyStatus(booking))).length)} detail="Noleggi conclusi nella selezione" icon={CalendarCheck} /><StatCard label="Annullati" value={String(filtered.filter((booking) => booking.status === 'cancelled').length)} detail="Prenotazioni annullate nella selezione" icon={X} /></div></section>}
    <section className="rentals-panel" aria-labelledby="history-list-title"><div className="rentals-panel-heading"><h2 id="history-list-title">Elenco noleggi</h2>{bookings && <span className="rentals-count" role="status">{filtered.length} di {scopedBookings.length}</span>}</div>
      <div className="rentals-filters history-filters"><div className="rental-search"><Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor="rental-history-search">Cerca cliente, email, telefono o numero noleggio</label><input id="rental-history-search" type="search" placeholder="Cliente, email, telefono o numero…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></div><label className="period-select"><span className="sr-only">Stato noleggio</span><select value={status} onChange={(event) => { setStatus(event.target.value as HistoryDisplayStatus | ''); setPage(0); }}><option value="">Tutti gli stati</option>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="history-date-filter">Dal<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(0); }} /></label><label className="history-date-filter">Al<input type="date" min={from || undefined} value={to} onChange={(event) => { setTo(event.target.value); setPage(0); }} /></label>{hasFilters && <button className="reset-filters" type="button" onClick={reset}><X size={14} aria-hidden="true" />Azzera filtri</button>}</div>
      {invalidPeriod && <p className="auth-error hotels-error" role="alert">La fine del filtro non può precedere l’inizio.</p>}
      {error ? <div className="rentals-empty"><p className="auth-error" role="alert">{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Riprova</button></div> : !bookings ? <div className="rentals-empty" role="status">Caricamento noleggi…</div> : <>
        <div className="rentals-table-scroll" role="region" aria-label="Elenco noleggi della sede" tabIndex={0}><table className="rentals-table history-bookings-table"><caption className="sr-only">Noleggi della sede attiva con prezzi e pagamenti registrati</caption><thead><tr><th scope="col">Numero</th><th scope="col">Cliente</th><th scope="col">Periodo</th><th scope="col">Stato</th><th scope="col">Articoli</th><th scope="col">Formula</th><th scope="col">Totale</th><th scope="col">Pagato</th><th scope="col">Residuo</th><th scope="col">Azioni</th></tr></thead><tbody>
          {visible.map((booking) => <tr className="inventory-clickable-row" key={booking.id} onClick={(event) => { if (!(event.target as HTMLElement).closest('button')) setSelectedId(booking.id); }}><th scope="row">N° {booking.booking_number}{booking.rental_kind==='seasonal'&&<span className="rental-secondary">Stagionale</span>}</th><td><span className="rental-primary">{booking.customer.first_name} {booking.customer.last_name}</span><span className="rental-secondary">{booking.customer.email || booking.customer.phone || '—'}</span></td><td><span className="rental-primary">{historyDate(booking.starts_on)}</span><span className="rental-secondary">al {historyDate(booking.ends_on)}</span></td><td><span className={`rental-status history-status-${historyStatus(booking)}`}>{historyStatuses[historyStatus(booking)]}</span></td><td>{booking.item_count}</td><td>{booking.rental_formula==='mixed'?'Pack + singoli':booking.rental_formula==='pack'?'Pack':'Singolo'}</td><td>{historyMoney(booking.total)}</td><td>{historyMoney(booking.paid_amount)}</td><td>{historyMoney(booking.balance)}</td><td><div className="sales-row-actions"><button className="icon-button" type="button" aria-label={`Apri noleggio ${booking.booking_number}`} aria-haspopup="dialog" onClick={() => setSelectedId(booking.id)}><Eye size={17} aria-hidden="true" /></button>{historyStatus(booking) === 'awaiting_payment' && <button className="sales-button" type="button" aria-label={`Registra pagamento noleggio ${booking.booking_number}`} onClick={() => { setSelectedId(null); setPaying(booking); }}>Registra pagamento</button>}</div></td></tr>)}
          {filtered.length === 0 && <tr><td colSpan={10}><div className="rentals-empty"><Search size={25} aria-hidden="true" /><h3>{bookings.length === 0 ? 'Nessun noleggio registrato in questa sede' : 'Nessun noleggio corrisponde ai filtri'}</h3>{hasFilters && <button type="button" onClick={reset}>Azzera filtri</button>}</div></td></tr>}
        </tbody></table></div>
        <div className="rental-equipment-pagination history-pagination"><span>{filtered.length ? `${currentPage * 20 + 1}–${Math.min((currentPage + 1) * 20, filtered.length)} di ${filtered.length}` : '0 noleggi'}</span><div><button className="sales-button" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Precedenti</button><button className="sales-button" type="button" disabled={(currentPage + 1) * 20 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Successivi</button></div></div>
      </>}
    </section>
    {paying && <ReturnPaymentDialog key={paying.id} booking={paying} token={token} locationId={locationId} onClose={() => setPaying(null)} onSaved={(booking) => {
      setPaying(null);
      setBookings((current) => current?.map((row) => row.id === booking.id ? booking : row) || null);
      setSelectedId(booking.id);
    }} />}
    {selectedId && <RentalHistoryDialog key={selectedId} id={selectedId} token={token} locationId={locationId} locationName={locationName} onClose={() => setSelectedId(null)} onPay={(booking) => { setSelectedId(null); setPaying(booking); }} />}
  </div>;
}
