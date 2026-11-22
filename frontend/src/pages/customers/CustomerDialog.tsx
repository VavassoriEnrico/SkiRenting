import { Save, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiDelete, apiPatch } from '../../lib/api';
import { skillLevels } from './customer';
import type { Customer } from './customer';

type Values = { first_name: string; last_name: string; email: string; phone: string; notes: string;
  birth_date: string; skill_level: string; language: string; country_code: string };
const fields = ['first_name','last_name','email','phone','notes','birth_date','skill_level','language','country_code'] as const;
function initialValues(customer: Customer): Values {
  return Object.fromEntries(fields.map((field) => [field, customer[field] || ''])) as Values;
}

export function CustomerDialog({ customer, mode, token, onClose, onSaved, onDeleted }: {
  customer: Customer; mode: 'edit' | 'delete'; token: string; onClose: () => void;
  onSaved: (customer: Customer) => void; onDeleted: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const [values, setValues] = useState(() => initialValues(customer));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editing = mode === 'edit';
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() || 'Cliente senza nome';
  const changed = fields.some((field) => values[field] !== (customer[field] || ''));
  useEffect(() => { dialog.current?.showModal(); return () => request.current?.abort(); }, []);
  function change(field: keyof Values, value: string) { setValues((current) => ({ ...current, [field]: value })); setError(''); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || (editing && !changed)) return;
    inFlight.current = true; setSaving(true); setError('');
    const controller = new AbortController(); request.current = controller;
    try {
      if (editing) {
        const patch = Object.fromEntries(fields.filter((field) => values[field] !== (customer[field] || '')).map((field) => [
          field, field === 'first_name' || field === 'last_name' ? values[field].trim() : values[field].trim() || null,
        ]));
        const result = await apiPatch<Customer>(`/customers/${customer.id}`, token, patch, controller.signal);
        if (!controller.signal.aborted) onSaved(result);
      } else {
        await apiDelete(`/customers/${customer.id}`, token, controller.signal);
        if (!controller.signal.aborted) onDeleted(customer.id);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile completare l’operazione.');
    } finally {
      if (!controller.signal.aborted) { inFlight.current = false; setSaving(false); }
    }
  }
  return <dialog ref={dialog} className="sale-dialog customer-dialog" aria-labelledby="customer-dialog-title" onClose={onClose} onCancel={(event) => { if (saving) event.preventDefault(); else onClose(); }}>
    <div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">{name}</p><h2 id="customer-dialog-title">{editing ? 'Modifica cliente' : 'Elimina cliente'}</h2></div><button type="button" className="icon-button" aria-label="Chiudi scheda cliente" disabled={saving} onClick={onClose}><X size={20} aria-hidden="true" /></button></div>
    <form onSubmit={submit}>
      <div className="sale-dialog-body">
        {editing ? <fieldset className="rental-booking-fields rental-form-grid" disabled={saving}>
          <label>Nome<input autoFocus required={!customer.is_legacy} maxLength={200} autoComplete="given-name" value={values.first_name} onChange={(event) => change('first_name', event.target.value)} /></label>
          <label>Cognome<input required={!customer.is_legacy} maxLength={200} autoComplete="family-name" value={values.last_name} onChange={(event) => change('last_name', event.target.value)} /></label>
          <label>Email<input type="text" inputMode="email" maxLength={254} value={values.email} onChange={(event) => change('email', event.target.value)} /></label>
          <label>Telefono<input type="tel" maxLength={100} value={values.phone} onChange={(event) => change('phone', event.target.value)} /></label>
          <label>Data di nascita<input type="date" value={values.birth_date} onChange={(event) => change('birth_date', event.target.value)} /></label>
          <label>Livello<select value={values.skill_level} onChange={(event) => change('skill_level', event.target.value)}><option value="">Non indicato</option>{Object.entries(skillLevels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Lingua (codice)<input maxLength={2} value={values.language} onChange={(event) => change('language', event.target.value.toUpperCase())} /></label>
          <label>Paese (codice)<input maxLength={2} value={values.country_code} onChange={(event) => change('country_code', event.target.value.toUpperCase())} /></label>
          <label className="rental-form-wide">Note<textarea maxLength={5000} value={values.notes} onChange={(event) => change('notes', event.target.value)} /></label>
        </fieldset> : <><p>Vuoi eliminare <strong>{name}</strong> dall’anagrafica condivisa tra tutte le sedi?</p><p>I noleggi e i pagamenti già registrati resteranno consultabili nello storico. Il cliente non sarà più selezionabile per nuovi noleggi.</p></>}
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
      <div className="sale-dialog-footer"><button className="sales-button" type="button" disabled={saving} onClick={onClose}>Annulla</button><button className={`sales-button ${editing ? 'sales-button-primary' : 'customer-delete-confirm'}`} type="submit" disabled={saving || (editing && !changed)}>{editing ? <Save size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}{saving ? 'Salvataggio…' : editing ? 'Salva modifiche' : 'Elimina cliente'}</button></div>
    </form>
  </dialog>;
}
