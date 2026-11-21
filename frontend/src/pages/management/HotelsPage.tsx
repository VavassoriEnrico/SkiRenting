import { ArrowLeft, Hotel as HotelIcon, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/AuthProvider';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';
import type { Hotel } from './hotel';

export function HotelsPage() {
  const { session } = useAuth();
  return session ? <HotelsList key={session.access_token} token={session.access_token} /> : <p role="status">Accedi per gestire gli alberghi.</p>;
}

function HotelsList({ token }: { token: string }) {
  const [hotels, setHotels] = useState<Hotel[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [name, setName] = useState('');
  const [discount, setDiscount] = useState('0');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Hotel | null>(null);
  const operation = useRef<AbortController | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(''); setHotels(null);
    apiGet<Hotel[]>('/hotels', token, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setHotels(result); })
      .catch((cause) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Impossibile caricare gli alberghi.'); });
    return () => controller.abort();
  }, [token, attempt]);
  useEffect(() => () => operation.current?.abort(), []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !hotels) return;
    if (!name.trim()) { setError('Inserisci il nome dell’albergo.'); return; }
    inFlight.current = true; setBusy(true); setError(''); setSuccess('');
    const controller = new AbortController(); operation.current = controller;
    try {
      const hotel = await apiPost<Hotel>('/hotels', token, { name: name.trim(), discount: Number(discount) }, controller.signal);
      if (!controller.signal.aborted) {
        setHotels((current) => [...(current || []).filter((entry) => entry.id !== hotel.id), hotel].sort((a, b) => a.name.localeCompare(b.name, 'it')));
        setName(''); setDiscount('0'); setSuccess(`${hotel.name} aggiunto agli alberghi.`);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile aggiungere l’albergo.');
    } finally {
      if (!controller.signal.aborted) { inFlight.current = false; setBusy(false); }
    }
  }

  async function remove() {
    if (inFlight.current || !removing) return;
    inFlight.current = true; setBusy(true); setError(''); setSuccess('');
    const hotel = removing;
    const controller = new AbortController(); operation.current = controller;
    try {
      await apiDelete(`/hotels/${hotel.id}`, token, controller.signal);
      if (!controller.signal.aborted) {
        setHotels((current) => (current || []).filter((entry) => entry.id !== hotel.id));
        setRemoving(null); setSuccess(`${hotel.name} rimosso dall’elenco.`);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile rimuovere l’albergo.');
    } finally {
      if (!controller.signal.aborted) { inFlight.current = false; setBusy(false); }
    }
  }

  async function saveDiscount(hotelId: string, value: number) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setEditingId(hotelId); setError(''); setSuccess('');
    const controller = new AbortController(); operation.current = controller;
    try {
      const updated = await apiPatch<Hotel>(`/hotels/${hotelId}`, token, { discount: value }, controller.signal);
      if (!controller.signal.aborted) {
        setHotels((current) => (current || []).map((hotel) => hotel.id === updated.id ? updated : hotel));
        setSuccess(`Sconto di ${updated.name} aggiornato al ${updated.discount.toLocaleString('it-IT')}%.`);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile aggiornare lo sconto.');
    } finally {
      if (!controller.signal.aborted) { inFlight.current = false; setBusy(false); setEditingId(null); }
    }
  }

  return <div className="dashboard-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><HotelIcon size={21} aria-hidden="true" /></span><h1>Alberghi</h1></div><p className="page-description">Alberghi disponibili per le prenotazioni di tutte le sedi.</p></div><Link className="sales-button" to="/management"><ArrowLeft size={16} aria-hidden="true" />Gestione</Link></div>
    {success && <p className="rental-inventory-notice" role="status">{success}</p>}
    <section className="rentals-panel" aria-labelledby="hotels-title"><div className="rentals-panel-heading"><h2 id="hotels-title">Elenco alberghi</h2><button className="sales-button" type="button" disabled={busy} onClick={() => { setError(''); setSuccess(''); setAttempt((value) => value + 1); }}>Aggiorna elenco</button></div>
      <form className="rental-customer-body rental-form-grid hotels-add-form" onSubmit={create}>
        <label>Nome albergo<input required maxLength={200} value={name} disabled={busy || !hotels} onChange={(event) => setName(event.target.value)} placeholder="Nome del nuovo albergo" /></label>
        <label>Sconto nuovo albergo (%)<input type="number" required min="0" max="100" step="0.01" value={discount} disabled={busy || !hotels} onChange={(event) => setDiscount(event.target.value)} /></label>
        <button className="sales-button sales-button-primary" type="submit" disabled={busy || !hotels || !name.trim() || discount === ''}><Plus size={16} aria-hidden="true" />{busy && !removing && !editingId ? 'Salvataggio…' : 'Aggiungi albergo'}</button>
      </form>
      {error && !removing && <p className="auth-error hotels-error" role="alert">{error}</p>}
      {loadError ? <div className="rentals-empty"><p className="auth-error" role="alert">{loadError}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Riprova</button></div> : !hotels ? <div className="rentals-empty" role="status">Caricamento alberghi…</div> : <div className="rentals-table-scroll" role="region" aria-label="Alberghi attivi" tabIndex={0}><table className="rentals-table"><caption className="sr-only">Alberghi selezionabili nei noleggi</caption><thead><tr><th scope="col">Nome</th><th scope="col">Sconto (%)</th><th scope="col">Azioni</th></tr></thead><tbody>
        {hotels.map((hotel) => <tr key={hotel.id}><th scope="row">{hotel.name}</th><td><HotelDiscountEditor hotel={hotel} busy={busy} saving={editingId === hotel.id} onSave={(value) => void saveDiscount(hotel.id, value)} /></td><td><button className="sales-button" type="button" disabled={busy} aria-label={`Rimuovi ${hotel.name}`} onClick={() => { setError(''); setRemoving(hotel); }}><Trash2 size={16} aria-hidden="true" />Rimuovi</button></td></tr>)}
        {hotels.length === 0 && <tr><td colSpan={3}><div className="rentals-empty">Nessun albergo presente. Aggiungi il primo dall’apposito campo.</div></td></tr>}
      </tbody></table></div>}
    </section>
    {removing && <RemoveHotelDialog hotel={removing} busy={busy} error={error} onCancel={() => { if (!inFlight.current) { setRemoving(null); setError(''); } }} onConfirm={() => void remove()} />}
  </div>;
}

function HotelDiscountEditor({ hotel, busy, saving, onSave }: { hotel: Hotel; busy: boolean; saving: boolean; onSave: (value: number) => void }) {
  const [value, setValue] = useState(String(hotel.discount));
  useEffect(() => setValue(String(hotel.discount)), [hotel.discount]);
  const number = Number(value);
  const valid = value !== '' && Number.isFinite(number) && number >= 0 && number <= 100;
  return <form className="hotel-discount-editor" onSubmit={(event) => { event.preventDefault(); if (valid) onSave(number); }}>
    <label className="sr-only" htmlFor={`discount-${hotel.id}`}>Sconto {hotel.name} (%)</label>
    <input id={`discount-${hotel.id}`} type="number" required min="0" max="100" step="0.01" value={value} disabled={busy} onChange={(event) => setValue(event.target.value)} />
    <button type="submit" className="sales-button" aria-label={`Salva sconto ${hotel.name}`} disabled={busy || !valid || number === hotel.discount}>{saving ? 'Salvataggio…' : 'Salva'}</button>
  </form>;
}

function RemoveHotelDialog({ hotel, busy, error, onCancel, onConfirm }: { hotel: Hotel; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="sale-dialog" aria-labelledby="remove-hotel-title" onCancel={(event) => { event.preventDefault(); onCancel(); }} onClose={onCancel}>
    <div className="sale-dialog-header"><h2 id="remove-hotel-title">Rimuovere {hotel.name}?</h2><button className="icon-button" type="button" disabled={busy} aria-label="Chiudi conferma" onClick={onCancel}><X size={20} /></button></div>
    <div className="sale-dialog-body"><p className="page-description">Non sarà più selezionabile nei nuovi noleggi. Le prenotazioni esistenti rimarranno associate all’albergo.</p>{error && <p className="auth-error" role="alert">{error}</p>}</div>
    <div className="sale-dialog-footer"><button className="sales-button" type="button" disabled={busy} onClick={onCancel}>Annulla</button><button className="sales-button sales-button-primary" type="button" disabled={busy} onClick={onConfirm}>{busy ? 'Rimozione…' : 'Rimuovi albergo'}</button></div>
  </dialog>;
}
