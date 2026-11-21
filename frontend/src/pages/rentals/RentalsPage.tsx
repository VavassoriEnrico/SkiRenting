import { CalendarCheck, CalendarDays, ChevronDown, Search, X } from 'lucide-react';
import { useState } from 'react';

import { StatCard } from '../../components/ui/StatCard';
import { demoRentals, rentalStatuses } from './demo-data';
import type { RentalStatus } from './demo-data';

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const date = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const formatDate = (value: string) => date.format(new Date(`${value}T00:00:00Z`));
const pastRentals = demoRentals.filter((rental) => rental.status === 'completed' || rental.status === 'cancelled');
const pastStatuses = { completed: rentalStatuses.completed, cancelled: rentalStatuses.cancelled };

export function RentalsPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<RentalStatus | 'all'>('all');
  const normalizedQuery = query.trim().toLocaleLowerCase('it-IT');
  const filteredRentals = pastRentals.filter((rental) => (
    (status === 'all' || rental.status === status)
    && `${rental.id} ${rental.customer} ${rental.email} ${rental.equipment}`
      .toLocaleLowerCase('it-IT').includes(normalizedQuery)
  ));

  function resetFilters() {
    setQuery('');
    setStatus('all');
  }

  return (
    <div className="dashboard-page rentals-page">
      <div className="dashboard-heading">
        <div>
          <div className="page-heading">
            <span className="heading-icon"><CalendarDays size={21} aria-hidden="true" /></span>
            <h1>Storico noleggi</h1>
          </div>
          <p className="page-description">Consulta e filtra i noleggi conclusi e le prenotazioni annullate.</p>
        </div>
        <span className="demo-badge"><span aria-hidden="true" />Dati dimostrativi</span>
      </div>

      <section className="stats-section tone-indigo rentals-summary" aria-label="Riepilogo delle prenotazioni dimostrative">
        <div className="stats-grid">
          <StatCard label="Prenotazioni passate" value={String(pastRentals.length)} detail="Tutto lo storico dimostrativo" icon={CalendarDays} />
          <StatCard label="Completate" value={String(pastRentals.filter((rental) => rental.status === 'completed').length)} detail="Noleggi conclusi" icon={CalendarCheck} />
          <StatCard label="Annullate" value={String(pastRentals.filter((rental) => rental.status === 'cancelled').length)} detail="Prenotazioni annullate" icon={X} />
        </div>
      </section>

      <section className="rentals-panel" aria-labelledby="bookings-title">
        <div className="rentals-panel-heading">
          <h2 id="bookings-title">Prenotazioni passate</h2>
          <span className="rentals-count" role="status">{filteredRentals.length} di {pastRentals.length}</span>
        </div>
        <div className="rentals-filters">
          <div className="rental-search">
            <Search size={17} aria-hidden="true" />
            <label className="sr-only" htmlFor="rental-search">Cerca per cliente, email, codice o attrezzatura</label>
            <input id="rental-search" type="search" placeholder="Cerca cliente, codice o attrezzatura…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="period-select rental-status-filter">
            <label className="sr-only" htmlFor="rental-status">Filtra per stato</label>
            <select id="rental-status" value={status} onChange={(event) => setStatus(event.target.value as RentalStatus | 'all')}>
              <option value="all">Tutti gli stati</option>
              {Object.entries(pastStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </div>
          {(query || status !== 'all') && <button className="reset-filters" type="button" onClick={resetFilters}><X size={14} aria-hidden="true" />Azzera filtri</button>}
        </div>

        <div className="rentals-table-scroll" role="region" aria-label="Elenco prenotazioni, scorrimento orizzontale" tabIndex={0}>
          <table className="rentals-table">
            <caption className="sr-only">Prenotazioni di noleggio dimostrative</caption>
            <thead><tr><th scope="col">Codice</th><th scope="col">Cliente</th><th scope="col">Attrezzatura</th><th scope="col">Periodo</th><th scope="col">Stato</th><th scope="col" className="rental-amount">Totale</th></tr></thead>
            <tbody>
              {filteredRentals.map((rental) => (
                <tr key={rental.id}>
                  <th scope="row" className="rental-code">{rental.id}</th>
                  <td><span className="rental-primary">{rental.customer}</span><span className="rental-secondary">{rental.email}</span></td>
                  <td><span className="rental-primary">{rental.equipment}</span><span className="rental-secondary">{rental.equipmentDetail}</span></td>
                  <td className="rental-period"><span className="rental-primary">{formatDate(rental.start)}</span><span className="rental-secondary">al {formatDate(rental.end)}</span></td>
                  <td><span className={`rental-status status-${rental.status}`}><span aria-hidden="true" />{rentalStatuses[rental.status]}</span></td>
                  <td className="rental-amount">{currency.format(rental.total)}</td>
                </tr>
              ))}
              {filteredRentals.length === 0 && <tr><td colSpan={6}><div className="rentals-empty"><Search size={25} aria-hidden="true" /><h3>Nessuna prenotazione trovata</h3><p>Prova con un altro termine di ricerca o modifica lo stato.</p><button type="button" onClick={resetFilters}>Azzera filtri</button></div></td></tr>}
            </tbody>
          </table>
        </div>
        <p className="rentals-panel-footer">Prenotazioni di esempio per l’anteprima della pagina.</p>
      </section>
    </div>
  );
}
