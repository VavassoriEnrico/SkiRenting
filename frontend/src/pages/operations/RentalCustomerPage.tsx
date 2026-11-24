import { CalendarPlus, Check, Plus, Search, UserRound } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { apiGet, apiPatch, apiPost } from '../../lib/api';
import { normalizeCustomerText } from '../customers/customer';
import { CustomerDocument } from '../customers/CustomerDocument';
import { skillLevels } from '../customers/customer';
import type { Customer, SkillLevel } from '../customers/customer';
import { RentalPeriodFields } from './RentalPeriodFields';
import type { RentalPeriod } from './RentalPeriodFields';
import { RentalSection } from './RentalSection';
import { RentalEquipmentSection } from './RentalEquipmentSection';
import type { RentalItem } from '../inventory/rental-inventory';
import { RentalRecapSection } from './RentalRecapSection';
import type { RentalQuote } from './RentalRecapSection';
import { RentalPaymentSection } from './RentalPaymentSection';
import { emptyPayment, paymentSummary } from './rental-payment';
import type { RentalPaymentDraft } from './rental-payment';
import { SeasonalPeriodFields } from '../seasonal/SeasonalPeriodFields';
import { SeasonalRecapSection } from '../seasonal/SeasonalRecapSection';
import { defaultRentalStartDate } from './rental-dates';
import type { SeasonalSettings, RentalSeason, SeasonalQuote } from '../seasonal/seasonal';
import { RentalBookingSuccess } from './RentalBookingSuccess';
import type { SavedBooking } from './RentalBookingSuccess';

type CustomerValues = { first_name: string; last_name: string; email: string; phone: string; notes: string; birth_date: string; skill_level: SkillLevel | ''; language: string; country_code: string };
const emptyValues: CustomerValues = { first_name: '', last_name: '', email: '', phone: '', notes: '', birth_date: '', skill_level: '', language: '', country_code: '' };

export function RentalCustomerPage({seasonal=false}:{seasonal?:boolean}) {
  const { session, location } = useAuth();
  const [revision, setRevision] = useState(0);
  return session
    ? <RentalCustomerForm key={`${seasonal}:${session.access_token}:${location?.id}:${revision}`} seasonal={seasonal} token={session.access_token} locationId={location?.id} locationName={location?.name} onNew={() => setRevision((current) => current + 1)} />
    : <p role="status">Accedi per iniziare un noleggio.</p>;
}

function RentalCustomerForm({ token, locationId, locationName, onNew, seasonal }: { seasonal:boolean; token: string; locationId?: string; locationName?: string; onNew: () => void }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [values, setValues] = useState<CustomerValues>(emptyValues);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [registered, setRegistered] = useState(false);
  const [period, setPeriod] = useState<RentalPeriod>(() => ({ starts_on: defaultRentalStartDate(), ends_on: '', hotel: '' }));
  const [equipment, setEquipment] = useState<RentalItem[]>([]);
  const [season,setSeason]=useState<RentalSeason|null>(null);
  const [seasonError,setSeasonError]=useState('');
  const [quote, setQuote] = useState<RentalQuote | null>(null);
  const [payment, setPayment] = useState<RentalPaymentDraft>(emptyPayment);
  const [bookingNotes, setBookingNotes] = useState('');
  const receiveSeasonalQuote=useCallback((next:RentalQuote|null)=>{
    setQuote(next);
    const updated=(next as SeasonalQuote|null)?.season;
    if(updated){
      setSeason(current=>current?.id===updated.id&&current.return_date===updated.return_date&&current.name===updated.name?current:updated);
      setPeriod(current=>current.ends_on===updated.return_date?current:{...current,ends_on:updated.return_date});
    }
  },[]);
  const [bookingId] = useState(() => crypto.randomUUID());
  const [confirmed, setConfirmed] = useState<SavedBooking | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const confirmRequest = useRef<AbortController | null>(null);
  const confirmInFlight = useRef(false);
  const quoteMatches = !!(selected && quote && quote.starts_on === period.starts_on && quote.ends_on === period.ends_on
    && (quote.hotel?.id || '') === period.hotel && quote.items.length === equipment.reduce((count,item)=>count+(item.quantity||1),0)
    && equipment.every((item) => quote.items.some((line) => line.inventory_id === item.id))
    && (!seasonal || (quote as SeasonalQuote).season?.id===season?.id));
  const currentTotal = quoteMatches ? quote!.total : null;
  const paymentState = paymentSummary(payment, currentTotal);
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

  useEffect(()=>{
    if(!seasonal)return;
    const controller=new AbortController();
    apiGet<SeasonalSettings>('/seasonal-rentals/settings',token,controller.signal)
      .then(result=>{if(!controller.signal.aborted){setSeason(result.current_season);if(result.current_season)setPeriod(current=>({...current,ends_on:result.current_season!.return_date}));}})
      .catch(cause=>{if(!controller.signal.aborted)setSeasonError(cause instanceof Error?cause.message:'Impossibile caricare la stagione.');});
    return()=>controller.abort();
  },[token,seasonal]);
  useEffect(() => () => saveRequest.current?.abort(), []);
  useEffect(() => () => confirmRequest.current?.abort(), []);
  useEffect(() => { if (isNew) firstNameInput.current?.focus(); }, [isNew]);

  const contactChanges: { email?: string | null; phone?: string | null } = {};
  if (selected) {
    for (const field of ['email','phone'] as const) {
      if (values[field].trim() !== (selected[field] || '').trim()) contactChanges[field] = values[field].trim() || null;
    }
  }
  const contactsChanged = Object.keys(contactChanges).length > 0;
  const phoneComplete = !!values.phone.trim();

  async function updateContacts(controller: AbortController) {
    if (!selected || !contactsChanged) return selected;
    const customer = await apiPatch<Customer>(`/customers/${selected.id}`, token, contactChanges, controller.signal);
    if (!controller.signal.aborted) {
      setCustomers(current => current?.map(entry => entry.id === customer.id ? customer : entry) || null);
      selectCustomer(customer, registered);
    }
    return customer;
  }

  const surname = normalizeCustomerText(values.last_name.trim());
  const matches = surname && customers
    ? customers.filter((customer) => normalizeCustomerText(customer.last_name).includes(surname))
    : [];

  function selectCustomer(customer: Customer, wasRegistered = false) {
    setSelected(customer);
    setValues({ first_name: customer.first_name, last_name: customer.last_name, email: customer.email || '', phone: customer.phone || '', notes: customer.notes || '', birth_date: customer.birth_date || '', skill_level: customer.skill_level || '', language: customer.language || '', country_code: customer.country_code || '' });
    setIsNew(false); setRegistered(wasRegistered); setSaveError('');
  }

  function searchAgain() {
    setSelected(null); setIsNew(false); setRegistered(false); setSaveError('');
    setValues({ ...emptyValues, last_name: values.last_name });
    lastNameInput.current?.focus();
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || confirmInFlight.current || (!isNew && !selected) || !customers || (selected && !contactsChanged)) return;
    if (!phoneComplete) { setSaveError('Inserisci il cellulare del cliente per proseguire con il nuovo noleggio.'); return; }
    submitting.current = true; setSaving(true); setSaveError('');
    const controller = new AbortController();
    saveRequest.current = controller;
    try {
      const customer = selected ? await updateContacts(controller) : await apiPost<Customer>('/customers', token, {
        first_name: values.first_name.trim(), last_name: values.last_name.trim(),
        email: values.email.trim() || null, phone: values.phone.trim() || null, notes: values.notes.trim() || null,
        birth_date: values.birth_date || null, skill_level: values.skill_level || null,
        language: values.language.trim().toUpperCase() || null, country_code: values.country_code.trim().toUpperCase() || null,
      }, controller.signal);
      if (!controller.signal.aborted && customer && !selected) {
        setCustomers((current) => [...(current || []), customer]);
        selectCustomer(customer, true);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setSaveError(cause instanceof Error ? cause.message : 'Impossibile salvare il cliente.');
    } finally {
      if (!controller.signal.aborted) { submitting.current = false; setSaving(false); }
    }
  }

  async function confirmBooking() {
    if (confirmInFlight.current || submitting.current || !selected || !locationId || !phoneComplete || !paymentState.complete || currentTotal === null) return;
    confirmInFlight.current = true; setConfirming(true); setConfirmError('');
    const controller = new AbortController(); confirmRequest.current = controller;
    try {
      if (contactsChanged) {
        await updateContacts(controller);
        if (controller.signal.aborted) return;
      }
      const booking = await apiPost<SavedBooking>(`/locations/${locationId}/${seasonal?'seasonal-bookings':'rental-bookings'}`, token, {
        booking_id: bookingId, customer_id: selected.id, starts_on: period.starts_on,
        ...(seasonal?{season_id:season?.id,expected_return_date:period.ends_on}:{ends_on:period.ends_on,hotel_id:period.hotel||null}), inventory_ids: equipment.map((item) => item.id), ...(equipment.some(item=>item.is_generic)?{pole_quantity:equipment.find(item=>item.is_generic)?.quantity||1}:{}), expected_total: currentTotal,
        notes: bookingNotes.trim() || null,
        payment: paymentState.amountCents! > 0 ? {
          amount: (paymentState.amountCents! / 100).toFixed(2), payment_method: paymentState.method,
          paid_at_local: payment.paid_at_local, notes: payment.notes.trim() || null,
        } : null,
      }, controller.signal);
      if (!controller.signal.aborted) setConfirmed(booking);
    } catch (cause) {
      if (!controller.signal.aborted) setConfirmError(cause instanceof Error ? cause.message : 'Impossibile confermare il noleggio.');
    } finally {
      if (!controller.signal.aborted) { confirmInFlight.current = false; setConfirming(false); }
    }
  }

  if (confirmed && selected) return <RentalBookingSuccess booking={confirmed} customer={selected} onNew={onNew} />;

  return (
    <div className="dashboard-page rental-customer-page">
      <div className="dashboard-heading"><div>
        <div className="page-heading"><span className="heading-icon"><CalendarPlus size={21} aria-hidden="true" /></span><h1>{seasonal?'Nuovo noleggio stagionale':'Nuovo noleggio'}</h1></div>
        <p className="page-description">{seasonal?'Compila il cliente e aggiungi il materiale: i pack stagionali vengono riconosciuti automaticamente.':'Compila cliente e soggiorno, aggiungi il materiale e conferma il noleggio.'}</p>
      </div></div>

      <fieldset className="rental-booking-fields rental-booking-sheet" disabled={confirming}>
      <div className="rental-booking-overview">
      <RentalSection id="rental-customer" title="Dati del cliente">
        <form className="rental-customer-body" noValidate={!!selected} onSubmit={saveCustomer}>
          <div className="rental-form-grid rental-customer-fields">
            <label>Cognome *
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
              <label>Cellulare *<input aria-label="Cellulare" required type="tel" maxLength={100} autoComplete="tel" disabled={saving} value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} /></label>
              <label>Email<input type="email" maxLength={254} autoComplete="email" disabled={saving} value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></label>
            </>}
          </div>

          {(isNew || (selected && [selected.birth_date, selected.skill_level, selected.language, selected.country_code].some(Boolean))) && <div className="rental-form-grid rental-customer-fields rental-customer-extra-fields">
            <label>Data di nascita<input type="date" value={values.birth_date} readOnly={!!selected} disabled={saving} onChange={(event) => setValues({ ...values, birth_date: event.target.value })} /></label>
            <label>Livello<select value={values.skill_level} disabled={saving || !!selected} onChange={(event) => setValues({ ...values, skill_level: event.target.value as SkillLevel | '' })}><option value="">Non indicato</option>{Object.entries(skillLevels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
            <label>Lingua (codice)<input maxLength={2} pattern="[A-Za-z]{2}" placeholder="IT" value={values.language} readOnly={!!selected} disabled={saving} onChange={(event) => setValues({ ...values, language: event.target.value.toUpperCase() })} /></label>
            <label>Paese (codice)<input maxLength={2} pattern="[A-Za-z]{2}" placeholder="IT" value={values.country_code} readOnly={!!selected} disabled={saving} onChange={(event) => setValues({ ...values, country_code: event.target.value.toUpperCase() })} /></label>
          </div>}
          {(selected || isNew) && !phoneComplete && <p className="rental-form-hint" role="status">Inserisci il cellulare del cliente per proseguire con il nuovo noleggio. Il recapito sarà salvato nella sua anagrafica.</p>}
          {selected && <CustomerDocument key={selected.id} customerId={selected.id} token={token} />}
          {isNew && <p className="rental-form-hint">Salva il cliente per aggiungere la foto del documento.</p>}
          {saveError && <p className="auth-error" role="alert">{saveError}</p>}
          {selected && <div className="rental-customer-selected" role="status"><Check size={20} aria-hidden="true" /><div><strong>{registered ? 'Cliente registrato e selezionato' : 'Cliente selezionato'}</strong><p>{selected.first_name} {selected.last_name}</p></div></div>}
          {contactsChanged && <p className="rental-form-hint">Salva i recapiti oppure conferma il noleggio per aggiornarli nell’anagrafica del cliente.</p>}
          {(selected || isNew) && <div className="rental-customer-actions">
            <button className="sales-button" type="button" disabled={saving} onClick={searchAgain}><Search size={16} aria-hidden="true" />{selected ? 'Cambia cliente' : 'Torna alla ricerca'}</button>
            {(isNew || contactsChanged) && <button className="sales-button sales-button-primary" type="submit" disabled={saving}>{saving ? 'Salvataggio…' : isNew ? 'Salva nuovo cliente' : 'Salva recapiti'}</button>}
          </div>}
        </form>
      </RentalSection>
      <>{seasonal?<SeasonalPeriodFields season={season} error={seasonError} period={period} onChange={setPeriod}/>:<RentalPeriodFields value={period} onChange={setPeriod}/>}</>
      </div>
      <div className="rental-form-grid rental-booking-notes-row">
        {(selected || isNew) && <label>Note cliente<textarea maxLength={5000} readOnly={!!selected} disabled={saving} value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} /></label>}
        <label>Note prenotazione<textarea maxLength={5000} value={bookingNotes} onChange={(event) => setBookingNotes(event.target.value)} placeholder="Annotazioni per questo noleggio (facoltative)" /></label>
      </div>
      <RentalEquipmentSection startsOn={period.starts_on} endsOn={period.ends_on} token={token} locationId={locationId} locationName={locationName} selected={equipment} onAdd={(item) => setEquipment((current) => current.some((entry) => entry.id === item.id) ? (item.is_generic?current.map(entry=>entry.id===item.id?{...entry,quantity:(entry.quantity||1)+1}:entry):current) : [...current, item])} onRemove={(id) => setEquipment((current) => current.flatMap(item=>item.id!==id?[item]:item.is_generic&&(item.quantity||1)>1?[{...item,quantity:(item.quantity||1)-1}]:[]))} />
      <>{seasonal?<SeasonalRecapSection token={token} locationId={locationId} season={season} customer={selected} period={period} equipment={equipment} onQuoteChange={receiveSeasonalQuote}/>:<RentalRecapSection token={token} locationId={locationId} customer={selected} period={period} equipment={equipment} onQuoteChange={setQuote} bookingNotes={bookingNotes}/>}</>
      <RentalPaymentSection total={currentTotal} value={payment} onChange={setPayment} />
      <div className="rental-booking-confirm">
        {confirmError && <p className="auth-error" role="alert">{confirmError}</p>}
        {!paymentState.complete && <p className="rental-form-hint">Completa cliente, periodo, materiale, prezzi e scelta del pagamento per confermare.</p>}
        <button className="sales-button sales-button-primary" type="button" disabled={confirming || !paymentState.complete || !phoneComplete || !selected || !locationId} onClick={() => void confirmBooking()}>{confirming ? 'Conferma in corso…' : seasonal?'Conferma stagionale':'Conferma noleggio'}</button>
      </div>
      </fieldset>
    </div>
  );
}
