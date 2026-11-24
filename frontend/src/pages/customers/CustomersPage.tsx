import { Pencil, Search, Trash2, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { apiGet } from '../../lib/api';
import { normalizeCustomerText as normalize, customerBirthDate, customerSortOptions, sortCustomers } from './customer';
import { CustomerBookingsDialog } from './CustomerBookingsDialog';
import { CustomerDialog } from './CustomerDialog';
import type { Customer, CustomerSortField, CustomerSortDirection } from './customer';

function matches(customer: Customer, query: string) {
  const text = normalize([
    customer.first_name, customer.last_name, customer.email, customer.phone,
  ].filter(Boolean).join(' '));
  const phone = (customer.phone || '').replace(/\D/g, '');
  return normalize(query).trim().split(/\s+/).every((term) => {
    if (text.includes(term)) return true;
    const digits = term.replace(/\D/g, '');
    return /^[+\d().-]+$/.test(term) && digits.length > 0 && phone.includes(digits);
  });
}

export function CustomersPage() {
  const { session } = useAuth();
  return session
    ? <CustomersList key={session.access_token} token={session.access_token} />
    : <p role="status">Accedi per visualizzare i clienti.</p>;
}

function CustomersList({ token }: { token: string }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [query, setQuery] = useState('');
  const [sortField, setSortField] = useState<CustomerSortField>('last_name');
  const [sortDirection, setSortDirection] = useState<CustomerSortDirection>('asc');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(0);
  const [action, setAction] = useState<{ mode: 'edit' | 'delete'; customer: Customer } | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setCustomers(null);
    setError('');
    apiGet<Customer[]>('/customers', token, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setCustomers(result); })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Impossibile caricare i clienti.');
        }
      });
    return () => controller.abort();
  }, [token, attempt]);

  const filtered = sortCustomers(customers?.filter((customer) => matches(customer, query)) || [], sortField, sortDirection);

  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 50) - 1));
  const visible = filtered.slice(currentPage * 50, (currentPage + 1) * 50);

  return (
    <div className="dashboard-page customers-page">
      <div className="dashboard-heading">
        <div>
          <div className="page-heading">
            <span className="heading-icon"><Users size={21} aria-hidden="true" /></span>
            <h1>Clienti</h1>
          </div>
          <p className="page-description">Consulta l’anagrafica clienti condivisa tra tutte le sedi.</p>
        </div>
      </div>

      {notice && <p className="customer-action-notice" role="status">{notice}</p>}
      <section className="rentals-panel" aria-labelledby="customers-list-title">
        <div className="rentals-panel-heading">
          <h2 id="customers-list-title">Elenco clienti</h2>
          {customers && <span className="rentals-count" role="status">{filtered.length} di {customers.length} clienti</span>}
        </div>
        <div className="rentals-filters">
          <div className="rental-search">
            <Search size={17} aria-hidden="true" />
            <label className="sr-only" htmlFor="customer-search">Cerca per nome, cognome, email o telefono</label>
            <input id="customer-search" type="search" placeholder="Cerca nome, cognome, email o telefono…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
          </div>
          <label className="general-inventory-sort"><span>Ordina per</span><select value={sortField} onChange={event => { setSortField(event.target.value as CustomerSortField); setPage(0); }}>{Object.entries(customerSortOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="period-select"><span className="sr-only">Direzione ordinamento</span><select value={sortDirection} onChange={event => { setSortDirection(event.target.value as CustomerSortDirection); setPage(0); }}><option value="asc">Crescente ↑</option><option value="desc">Decrescente ↓</option></select></label>
          {query && <button className="reset-filters" type="button" onClick={() => { setQuery(''); setPage(0); }}><X size={14} aria-hidden="true" />Azzera ricerca</button>}
        </div>

        <div className="rentals-table-scroll" role="region" aria-label="Elenco clienti, scorrimento orizzontale" tabIndex={0}>
          <table className="rentals-table customers-table" aria-busy={!customers && !error}>
            <caption className="sr-only">Anagrafica clienti: nome, cognome, contatti, data di nascita, note e numero di prenotazioni</caption>
            <thead><tr><th scope="col">Nome</th><th scope="col">Cognome</th><th scope="col">Email</th><th scope="col">Telefono</th><th scope="col">Data di nascita</th><th scope="col">Note</th><th scope="col">Numero di prenotazioni</th><th scope="col" className="customer-actions-cell">Azioni</th></tr></thead>
            <tbody>
              {error ? <tr><td colSpan={8}><div className="rentals-empty"><p className="auth-error" role="alert">{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Riprova</button></div></td></tr>
                : !customers ? <tr><td colSpan={8}><div className="rentals-empty" role="status">Caricamento clienti…</div></td></tr>
                  : visible.map((customer) => (
                    <tr key={customer.id} className="inventory-clickable-row" onClick={(event) => { if (!(event.target as HTMLElement).closest('button,a')) setSelectedCustomer(customer); }}>
                      <th scope="row"><button type="button" className="sale-id-link" aria-haspopup="dialog" aria-label={`Apri cliente ${[customer.first_name,customer.last_name].filter(Boolean).join(' ').trim() || customer.id}`} onClick={() => setSelectedCustomer(customer)}>{customer.first_name || '—'}</button></th>
                      <td>{customer.last_name}</td>
                      <td className="customer-email">{customer.email?.trim() || '—'}</td>
                      <td>{customer.phone?.trim() || '—'}</td>
                      <td>{customerBirthDate(customer.birth_date)}</td>
                      <td className="customer-notes">{customer.notes?.trim() || '—'}</td>
                      <td>{customer.booking_count ?? '—'}</td>
                      <td className="customer-actions-cell"><div className="sales-row-actions"><button type="button" className="icon-button" title="Modifica cliente" aria-label={`Modifica cliente ${[customer.first_name,customer.last_name].filter(Boolean).join(' ').trim() || customer.id}`} onClick={() => { setNotice(''); setSelectedCustomer(null); setAction({ mode:'edit', customer }); }}><Pencil size={16} aria-hidden="true" /></button><button type="button" className="icon-button customer-delete-button" title="Elimina cliente" aria-label={`Elimina cliente ${[customer.first_name,customer.last_name].filter(Boolean).join(' ').trim() || customer.id}`} onClick={() => { setNotice(''); setSelectedCustomer(null); setAction({ mode:'delete', customer }); }}><Trash2 size={16} aria-hidden="true" /></button></div></td>
                    </tr>
                  ))}
              {!error && customers && filtered.length === 0 && <tr><td colSpan={8}><div className="rentals-empty">
                <Users size={25} aria-hidden="true" />
                <h3>{customers.length === 0 ? 'Nessun cliente registrato' : 'Nessun cliente trovato'}</h3>
                <p>{customers.length === 0 ? 'I clienti compariranno qui quando verranno registrati.' : 'Prova con un altro nome, cognome, indirizzo email o numero di telefono.'}</p>
                {query && <button type="button" onClick={() => { setQuery(''); setPage(0); }}>Mostra tutti i clienti</button>}
              </div></td></tr>}
            </tbody>
          </table>
        </div>
        {customers && !error && filtered.length > 50 && <div className="rental-equipment-pagination history-pagination"><span>{currentPage * 50 + 1}–{Math.min((currentPage + 1) * 50, filtered.length)} di {filtered.length}</span><div><button className="sales-button" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Precedenti</button><button className="sales-button" type="button" disabled={(currentPage + 1) * 50 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Successivi</button></div></div>}
      </section>
      {selectedCustomer && <CustomerBookingsDialog key={selectedCustomer.id} customer={selectedCustomer} token={token} onClose={() => setSelectedCustomer(null)} onBookingCountChange={count => setCustomers(current => current?.map(row => row.id === selectedCustomer.id ? { ...row, booking_count: count } : row) || null)} />}
      {action && <CustomerDialog key={`${action.mode}:${action.customer.id}`} {...action} token={token} onClose={() => setAction(null)} onSaved={(customer) => { setCustomers((current) => current?.map((row) => row.id === customer.id ? { ...row, ...customer } : row) || null); setAction(null); setNotice('Cliente aggiornato.'); }} onDeleted={(id) => { setCustomers((current) => current?.filter((row) => row.id !== id) || null); setAction(null); setNotice('Cliente eliminato dall’anagrafica.'); }} />}
    </div>
  );
}
