import { CalendarCheck, ChevronDown, Clock3, Eye, Package, RotateCcw, Search, X } from 'lucide-react';
import { useState } from 'react';

import { StatCard } from '../../components/ui/StatCard';
import { demoReferenceDate, demoReturns, filterReturns, formatReturnDate, returnLabels, returnTiming } from './demo-data';
import type { ReturnBooking, ReturnFilter } from './demo-data';
import { ReturnDetailsDialog } from './ReturnDetailsDialog';

export function ReturnsPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ReturnFilter>('all');
  const [selected, setSelected] = useState<ReturnBooking | null>(null);
  const visibleReturns = filterReturns(demoReturns, query, filter, demoReferenceDate);
  const dueToday = demoReturns.filter((booking) => returnTiming(booking.end, demoReferenceDate) === 'today').length;
  const overdue = demoReturns.filter((booking) => returnTiming(booking.end, demoReferenceDate) === 'overdue').length;
  const pendingItems = demoReturns.reduce((total, booking) => total + booking.items.filter((item) => !item.returned).length, 0);

  function resetFilters() { setQuery(''); setFilter('all'); }

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div><div className="page-heading"><span className="heading-icon"><RotateCcw size={21} aria-hidden="true" /></span><h1>Rientri</h1></div><p className="page-description">I noleggi da restituire e il materiale ancora in consegna.</p></div>
        <span className="demo-badge"><span aria-hidden="true" />Dati dimostrativi</span>
      </div>
      <p className="returns-reference-date">Data di riferimento dell’anteprima: <strong>{formatReturnDate(demoReferenceDate)}</strong></p>
      <section className="stats-section tone-indigo rentals-summary" aria-label="Riepilogo rientri dimostrativi">
        <div className="stats-grid">
          <StatCard label="Previsti oggi" value={String(dueToday)} detail="Noleggi con rientro nella data di riferimento" icon={CalendarCheck} />
          <StatCard label="In ritardo" value={String(overdue)} detail="Noleggi con materiale ancora da restituire" icon={Clock3} />
          <StatCard label="Articoli da rientrare" value={String(pendingItems)} detail="Esemplari ancora in consegna, su tutti i noleggi" icon={Package} />
        </div>
      </section>
      <section className="rentals-panel" aria-labelledby="returns-title">
        <div className="rentals-panel-heading"><h2 id="returns-title">Noleggi da rientrare</h2><span className="rentals-count" role="status">{visibleReturns.length} di {demoReturns.length}</span></div>
        <div className="rentals-filters">
          <div className="rental-search"><Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor="returns-search">Cerca cliente, email, codice noleggio o materiale</label><input id="returns-search" type="search" placeholder="Cerca cliente, noleggio o codice materiale…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <div className="period-select rental-status-filter"><label className="sr-only" htmlFor="returns-filter">Filtra i rientri</label><select id="returns-filter" value={filter} onChange={(event) => setFilter(event.target.value as ReturnFilter)}><option value="all">Tutti i rientri</option><option value="today">Previsti oggi</option><option value="overdue">In ritardo</option><option value="upcoming">Prossimi giorni</option><option value="partial">Rientri parziali</option></select><ChevronDown size={14} aria-hidden="true" /></div>
          {(query || filter !== 'all') && <button className="reset-filters" type="button" onClick={resetFilters}><X size={14} aria-hidden="true" />Azzera filtri</button>}
        </div>
        <div className="rentals-table-scroll" role="region" aria-label="Elenco rientri, scorrimento orizzontale" tabIndex={0}>
          <table className="rentals-table">
            <caption className="sr-only">Noleggi con articoli ancora da restituire, ordinati per data di rientro</caption>
            <thead><tr><th scope="col">Noleggio</th><th scope="col">Cliente</th><th scope="col">Rientro previsto</th><th scope="col">Stato</th><th scope="col">Materiale</th><th scope="col">Scheda</th></tr></thead>
            <tbody>
              {visibleReturns.map((booking) => {
                const timing = returnTiming(booking.end, demoReferenceDate);
                const returned = booking.items.filter((item) => item.returned).length;
                return <tr key={booking.id}>
                  <th scope="row"><button className="sale-id-link" type="button" onClick={() => setSelected(booking)} aria-label={`Apri scheda rientro ${booking.id}`}>{booking.id}</button></th>
                  <td><span className="rental-primary">{booking.customer}</span><span className="rental-secondary">{booking.email}</span></td>
                  <td className="rental-period">{formatReturnDate(booking.end)}</td>
                  <td><span className={`rental-status ${timing === 'overdue' ? 'status-cancelled' : 'status-confirmed'}`}><span aria-hidden="true" />{returnLabels[timing]}</span>{returned > 0 && <span className="rental-secondary">Rientro parziale</span>}</td>
                  <td><span className="rental-primary">{booking.items.length - returned} da restituire</span><span className="rental-secondary">{returned} di {booking.items.length} rientrati</span></td>
                  <td><button className="icon-button" type="button" title="Apri scheda rientro" aria-label={`Apri scheda rientro ${booking.id}`} onClick={() => setSelected(booking)}><Eye size={17} aria-hidden="true" /></button></td>
                </tr>;
              })}
              {!visibleReturns.length && <tr><td colSpan={6}><div className="rentals-empty"><Search size={25} aria-hidden="true" /><h3>Nessun rientro trovato</h3><p>Modifica la ricerca o il filtro selezionato.</p><button type="button" onClick={resetFilters}>Azzera filtri</button></div></td></tr>}
            </tbody>
          </table>
        </div>
        <p className="rentals-panel-footer">Apri una scheda per consultare i singoli codici e lo stato del materiale. La registrazione dei rientri sarà disponibile in seguito.</p>
      </section>
      {selected && <ReturnDetailsDialog key={selected.id} booking={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
