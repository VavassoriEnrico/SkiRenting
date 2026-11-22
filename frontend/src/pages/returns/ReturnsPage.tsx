import { CalendarCheck, Package, RotateCcw, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { StatCard } from '../../components/ui/StatCard';
import { apiGet } from '../../lib/api';
import { normalizeCustomerText } from '../customers/customer';
import { historyDate } from '../rentals/rental-history';
import { ReturnPaymentDialog } from './ReturnPaymentDialog';
import { ReturnRegistrationDialog } from './ReturnRegistrationDialog';
import { ReturnBookingsSection } from './ReturnBookingsSection';
import { ReturnDetailsDialog } from './ReturnDetailsDialog';
import { pendingItems, todayInRome, returnState } from './returns';
import type { ReturnBooking, TodayReturns } from './returns';

export function ReturnsPage() {
  const { session, location } = useAuth();
  const [day, setDay] = useState(todayInRome);
  useEffect(() => {
    const updateDay = () => setDay(todayInRome());
    const timer = window.setInterval(updateDay, 60_000);
    window.addEventListener('focus', updateDay);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', updateDay); };
  }, []);
  return session && location
    ? <TodayReturnsPage key={`${location.id}:${session.access_token}:${day}`} token={session.access_token} locationId={location.id} locationName={location.name} />
    : <p role="status">Seleziona una sede per consultare i rientri.</p>;
}

function TodayReturnsPage({ token, locationId, locationName }: { token: string; locationId: string; locationName: string }) {
  const [data, setData] = useState<TodayReturns | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReturnBooking | null>(null);
  const [paying, setPaying] = useState<ReturnBooking | null>(null);
  const [registering, setRegistering] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    apiGet<TodayReturns>(`/locations/${locationId}/rental-returns`, token, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile caricare i rientri.'); });
    return () => controller.abort();
  }, [token, locationId, attempt]);
  const bookings = data?.bookings || [];
  const terms = normalizeCustomerText(query).trim().split(/\s+/);
  const visible = bookings.filter((booking) => {
    const text = normalizeCustomerText([booking.booking_number, booking.customer.first_name, booking.customer.last_name,
      booking.customer.email, booking.customer.phone, ...booking.items.flatMap((item) => [item.code_snapshot, item.brand_snapshot, item.model_snapshot])].join(' '));
    const phone = (booking.customer.phone || '').replace(/\D/g, '');
    return terms.every((term) => text.includes(term) || (/^[+\d().-]+$/.test(term) && term.replace(/\D/g, '').length > 0 && phone.includes(term.replace(/\D/g, ''))));
  });
  const groups = [
    { color: 'red', title: 'Materiale da restituire' },
    { color: 'yellow', title: 'Da saldare' },
    { color: 'green', title: 'Tutto completato' },
  ];

  return <div className="dashboard-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><RotateCcw size={21} aria-hidden="true" /></span><h1>Rientri</h1></div><p className="page-description">Le riconsegne previste oggi a {locationName}, divise per materiale e saldo.</p></div><div className="sales-page-actions"><button type="button" className="sales-button" onClick={() => setAttempt((value) => value + 1)}>Aggiorna</button><button type="button" className="sales-button sales-button-primary" onClick={() => { setSelected(null); setRegistering(true); }}>Registra rientro</button></div></div>
    {data && <>
      <p className="returns-reference-date">Rientri del <strong>{historyDate(data.due_on)}</strong></p>
      <section className="stats-section tone-indigo rentals-summary" aria-label="Riepilogo rientri di oggi"><div className="stats-grid">
        <StatCard label="Previsti oggi" value={String(bookings.length)} detail="Tutti i noleggi con rientro previsto oggi" icon={CalendarCheck} />
        <StatCard label="Articoli da rientrare" value={String(bookings.reduce((sum, booking) => sum + pendingItems(booking), 0))} detail="Esemplari ancora da restituire nei rientri di oggi" icon={Package} />
        <StatCard label="Rientri parziali" value={String(bookings.filter((booking) => pendingItems(booking) > 0 && pendingItems(booking) < booking.items.length).length)} detail="Noleggi di oggi con alcuni articoli già rientrati" icon={RotateCcw} />
      </div></section>
    </>}
    <section className="rentals-panel" aria-labelledby="returns-title">
      <div className="rentals-panel-heading"><h2 id="returns-title">Rientri di oggi</h2>{data && <span className="rentals-count" role="status">{visible.length} di {bookings.length}</span>}</div>
      <div className="rentals-filters"><div className="rental-search"><Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor="returns-search">Cerca cliente, email, telefono, numero noleggio o materiale</label><input id="returns-search" type="search" placeholder="Cliente, noleggio o codice materiale…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>{query && <button className="reset-filters" type="button" onClick={() => setQuery('')}><X size={14} aria-hidden="true" />Azzera ricerca</button>}</div>
      {error ? <div className="rentals-empty"><p className="auth-error" role="alert">{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Riprova</button></div> : !data ? <p className="rentals-empty" role="status">Caricamento rientri…</p> : <>
        {visible.length === 0 && <div className="rentals-empty"><Search size={25} aria-hidden="true" /><h3>{bookings.length ? 'Nessun rientro corrisponde alla ricerca' : 'Nessun rientro previsto oggi'}</h3></div>}

      </>}
      <p className="rentals-panel-footer">Apri una scheda per consultare il materiale. Usa Registra rientro per riconsegnare un esemplare tramite il suo codice.</p>
    </section>
    {data && !error && groups.map((group) => <ReturnBookingsSection key={`${group.color}:${query}`} {...group} bookings={visible.filter((booking) => returnState(booking).color === group.color)} onSelect={setSelected} onPay={(booking) => { setSelected(null); setPaying(booking); }} />)}
    {paying && <ReturnPaymentDialog key={paying.id} booking={paying} token={token} locationId={locationId} onClose={() => setPaying(null)} onSaved={(booking) => { setPaying(null); setSelected(booking); setAttempt((value) => value + 1); }} />}
    {registering && <ReturnRegistrationDialog token={token} locationId={locationId} onClose={() => setRegistering(false)} onSaved={() => { setAttempt((value) => value + 1); }} />}
    {selected && <ReturnDetailsDialog key={selected.id} booking={selected} onClose={() => setSelected(null)} onPay={() => { setPaying(selected); setSelected(null); }} onRegister={() => { setSelected(null); setRegistering(true); }} />}
  </div>;
}
