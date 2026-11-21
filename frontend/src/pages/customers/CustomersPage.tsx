import { Search, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { apiGet } from '../../lib/api';
import { normalizeCustomerText as normalize } from './customer';
import type { Customer } from './customer';

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
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

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

  const filtered = customers?.filter((customer) => matches(customer, query)) || [];

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

      <section className="rentals-panel" aria-labelledby="customers-list-title">
        <div className="rentals-panel-heading">
          <h2 id="customers-list-title">Elenco clienti</h2>
          {customers && <span className="rentals-count" role="status">{filtered.length} di {customers.length} clienti</span>}
        </div>
        <div className="rentals-filters">
          <div className="rental-search">
            <Search size={17} aria-hidden="true" />
            <label className="sr-only" htmlFor="customer-search">Cerca per nome, cognome, email o telefono</label>
            <input id="customer-search" type="search" placeholder="Cerca nome, cognome, email o telefono…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          {query && <button className="reset-filters" type="button" onClick={() => setQuery('')}><X size={14} aria-hidden="true" />Azzera ricerca</button>}
        </div>

        <div className="rentals-table-scroll" role="region" aria-label="Elenco clienti, scorrimento orizzontale" tabIndex={0}>
          <table className="rentals-table customers-table" aria-busy={!customers && !error}>
            <caption className="sr-only">Anagrafica clienti: nome, cognome, email, telefono e note</caption>
            <thead><tr><th scope="col">Nome</th><th scope="col">Cognome</th><th scope="col">Email</th><th scope="col">Telefono</th><th scope="col">Note</th></tr></thead>
            <tbody>
              {error ? <tr><td colSpan={5}><div className="rentals-empty"><p className="auth-error" role="alert">{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Riprova</button></div></td></tr>
                : !customers ? <tr><td colSpan={5}><div className="rentals-empty" role="status">Caricamento clienti…</div></td></tr>
                  : filtered.map((customer) => (
                    <tr key={customer.id}>
                      <th scope="row"><span className="rental-primary">{customer.first_name}</span></th>
                      <td>{customer.last_name}</td>
                      <td className="customer-email">{customer.email?.trim() || '—'}</td>
                      <td>{customer.phone?.trim() || '—'}</td>
                      <td className="customer-notes">{customer.notes?.trim() || '—'}</td>
                    </tr>
                  ))}
              {!error && customers && filtered.length === 0 && <tr><td colSpan={5}><div className="rentals-empty">
                <Users size={25} aria-hidden="true" />
                <h3>{customers.length === 0 ? 'Nessun cliente registrato' : 'Nessun cliente trovato'}</h3>
                <p>{customers.length === 0 ? 'I clienti compariranno qui quando verranno registrati.' : 'Prova con un altro nome, cognome, indirizzo email o numero di telefono.'}</p>
                {query && <button type="button" onClick={() => setQuery('')}>Mostra tutti i clienti</button>}
              </div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
