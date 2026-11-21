import { CalendarPlus, Check, Plus, Search, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { apiGet, apiPost } from '../../lib/api';
import { normalizeCustomerText } from '../customers/customer';
import type { Customer } from '../customers/customer';
import { RentalPeriodFields } from './RentalPeriodFields';
import type { RentalPeriod } from './RentalPeriodFields';
import { RentalSection } from './RentalSection';
import { RentalEquipmentSection } from './RentalEquipmentSection';
import type { RentalItem } from '../inventory/rental-inventory';

type CustomerValues = { first_name: string; last_name: string; email: string; phone: string; notes: string };
const emptyValues: CustomerValues = { first_name: '', last_name: '', email: '', phone: '', notes: '' };

export function RentalCustomerPage() {
  const { session, location } = useAuth();
  return session
    ? <RentalCustomerForm key={`${session.access_token}:${location?.id}`} token={session.access_token} locationId={location?.id} locationName={location?.name} />
    : <p role="status">Accedi per iniziare un noleggio.</p>;
}

function RentalCustomerForm({ token, locationId, locationName }: { token: string; locationId?: string; locationName?: string }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [values, setValues] = useState<CustomerValues>(emptyValues);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [registered, setRegistered] = useState(false);
  const [period, setPeriod] = useState<RentalPeriod>({ starts_on: '', ends_on: '', hotel: '' });
  const [equipment, setEquipment] = useState<RentalItem[]>([]);
  const submitting = useRef(false);
  const saveRequest = useRef<AbortController | null>(null);
  const firstNameInput = useRef<HTMLInputElement>(null);
  const lastNameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    apiGet<Customer[]>('/customers', token, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setCustomers(result); })
      .catch((cause) => {
        if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Impossibile cercare i clienti.');
      });
    return () => controller.abort();
  }, [token, attempt]);

  useEffect(() => () => saveRequest.current?.abort(), []);
  useEffect(() => { if (isNew) firstNameInput.current?.focus(); }, [isNew]);

  const surname = normalizeCustomerText(values.last_name.trim());
  const matches = surname && customers
    ? customers.filter((customer) => normalizeCustomerText(customer.last_name).includes(surname))
    : [];

  function selectCustomer(customer: Customer, wasRegistered = false) {
    setSelected(customer);
    setValues({ first_name: customer.first_name, last_name: customer.last_name, email: customer.email || '', phone: customer.phone || '', notes: customer.notes || '' });
    setIsNew(false); setRegistered(wasRegistered); setSaveError('');
  }

  function searchAgain() {
    setSelected(null); setIsNew(false); setRegistered(false); setSaveError('');
    setValues({ ...emptyValues, last_name: values.last_name });
    lastNameInput.current?.focus();
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !isNew || !customers) return;
    submitting.current = true; setSaving(true); setSaveError('');
    const controller = new AbortController();
    saveRequest.current = controller;
    try {
      const customer = await apiPost<Customer>('/customers', token, {
        first_name: values.first_name.trim(), last_name: values.last_name.trim(),
        email: values.email.trim() || null, phone: values.phone.trim() || null, notes: values.notes.trim() || null,
      }, controller.signal);
      if (!controller.signal.aborted) {
        setCustomers((current) => [...(current || []), customer]);
        selectCustomer(customer, true);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setSaveError(cause instanceof Error ? cause.message : 'Impossibile salvare il cliente.');
    } finally {
      if (!controller.signal.aborted) { submitting.current = false; setSaving(false); }
    }
  }

  return (
    <div className="dashboard-page rental-customer-page">
      <div className="dashboard-heading"><div>
        <div className="page-heading"><span className="heading-icon"><CalendarPlus size={21} aria-hidden="true" /></span><h1>Nuovo noleggio</h1></div>
        <p className="page-description">Inizia dal cliente: cerca una persona già registrata oppure aggiungine una nuova.</p>
      </div></div>

      <RentalSection id="rental-customer" step={1} title="Dati del cliente" complete={!!selected}>
        <form className="rental-customer-body" onSubmit={saveCustomer}>
          <div className="rental-form-grid">
            <label className="rental-form-wide">Cognome *
              <input ref={lastNameInput} required maxLength={200} autoComplete="family-name" value={values.last_name} readOnly={!!selected} disabled={saving} onChange={(event) => { setValues({ ...values, last_name: event.target.value }); setSaveError(''); }} aria-describedby={!selected && !isNew ? 'rental-customer-search-hint' : undefined} />
            </label>

            {!selected && !isNew && <div className="rental-form-wide rental-customer-search">
              <p id="rental-customer-search-hint" className="rental-form-hint">Scrivi il cognome per trovare i clienti esistenti. Puoi registrare una nuova persona anche se ci sono omonimi.</p>
              {loadError ? <div className="auth-error" role="alert">{loadError}<div><button className="sales-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Riprova ricerca</button></div></div>
                : !customers ? <p role="status">Caricamento clienti…</p>
                  : surname && <>
                    <p className="rental-customer-results-count" role="status">{matches.length ? `${matches.length} clienti trovati` : 'Nessun cliente trovato con questo cognome.'}</p>
                    {matches.length > 0 && <ul className="rental-customer-results" aria-label="Clienti con questo cognome">
                      {matches.map((customer) => <li key={customer.id}><button type="button" className="rental-customer-result" onClick={() => selectCustomer(customer)}>
                        <UserRound size={18} aria-hidden="true" /><span><strong>{customer.last_name} {customer.first_name}</strong><span>{[customer.email, customer.phone].filter(Boolean).join(' · ') || 'Nessun recapito registrato'}</span></span><span className="rental-customer-select">Seleziona</span>
                      </button></li>)}
                    </ul>}
                    <button className="sales-button" type="button" onClick={() => { setValues({ ...emptyValues, last_name: values.last_name }); setSaveError(''); setIsNew(true); }}><Plus size={16} aria-hidden="true" />Registra un nuovo cliente</button>
                  </>}
            </div>}

            {(selected || isNew) && <>
              <label>Nome *<input ref={firstNameInput} required maxLength={200} autoComplete="given-name" readOnly={!!selected} disabled={saving} value={values.first_name} onChange={(event) => setValues({ ...values, first_name: event.target.value })} /></label>
              <label>Cellulare<input type="tel" maxLength={100} autoComplete="tel" readOnly={!!selected} disabled={saving} value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} /></label>
              <label className="rental-form-wide">Email<input type="email" maxLength={254} autoComplete="email" readOnly={!!selected} disabled={saving} value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></label>
              <label className="rental-form-wide">Note cliente<textarea maxLength={5000} readOnly={!!selected} disabled={saving} value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} /></label>
            </>}
          </div>

          {saveError && <p className="auth-error" role="alert">{saveError}</p>}
          {selected && <div className="rental-customer-selected" role="status"><Check size={20} aria-hidden="true" /><div><strong>{registered ? 'Cliente registrato e selezionato' : 'Cliente selezionato'}</strong><p>{selected.first_name} {selected.last_name}</p></div></div>}
          {(selected || isNew) && <div className="rental-customer-actions">
            <button className="sales-button" type="button" disabled={saving} onClick={searchAgain}><Search size={16} aria-hidden="true" />{selected ? 'Cambia cliente' : 'Torna alla ricerca'}</button>
            {isNew && <button className="sales-button sales-button-primary" type="submit" disabled={saving}>{saving ? 'Salvataggio…' : 'Salva nuovo cliente'}</button>}
          </div>}
        </form>
      </RentalSection>
      <RentalPeriodFields value={period} onChange={setPeriod} />
      <RentalEquipmentSection token={token} locationId={locationId} locationName={locationName} selected={equipment} onAdd={(item) => setEquipment((current) => current.some((entry) => entry.id === item.id) ? current : [...current, item])} onRemove={(id) => setEquipment((current) => current.filter((item) => item.id !== id))} />
    </div>
  );
}
