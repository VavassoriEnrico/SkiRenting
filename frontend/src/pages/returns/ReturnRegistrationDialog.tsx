import { Barcode, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiPost } from '../../lib/api';
import { ReturnBookingDetails } from './ReturnBookingDetails';
import { returnState } from './returns';
import type { ReturnBooking } from './returns';

export function ReturnRegistrationDialog({ token, locationId, onClose, onSaved, initialBooking=null }: {
  token: string; locationId: string; onClose: () => void; onSaved: (booking: ReturnBooking) => void;
  initialBooking?: ReturnBooking|null;
}) {
  const codeInput = useRef<HTMLInputElement>(null);
  const [latest, setLatest] = useState<ReturnBooking | null>(null);
  const [context, setContext] = useState<ReturnBooking|null>(initialBooking);
  const [lastCode, setLastCode] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const [code, setCode] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); return () => request.current?.abort(); }, []);
  useEffect(() => { if (!saving) codeInput.current?.focus(); }, [saving]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim() || inFlight.current) return;
    if (code.trim()==='1' && !context) {
      setError('Per i bastoncini apri la scheda del noleggio e premi Registra un altro rientro.');
      return;
    }
    inFlight.current = true; setSaving(true); setError('');
    const controller = new AbortController(); request.current = controller;
    try {
      const booking = await apiPost<ReturnBooking>(`/locations/${locationId}/rental-returns`, token,
        { request_id: requestId, code: code.trim(), ...(code.trim()==='1'?{booking_id:context!.id}:{}) }, controller.signal);
      if (!controller.signal.aborted) {
        setLatest(booking); setContext(booking); setLastCode(code.trim()); setCode('');
        setRequestId(crypto.randomUUID()); onSaved(booking);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile registrare il rientro.');
    } finally {
      if (!controller.signal.aborted) { inFlight.current = false; setSaving(false); }
    }
  }
  return <dialog ref={dialog} className={`sale-dialog return-dialog${latest ? ` return-state-${returnState(latest).color}` : ''}`} aria-labelledby="return-registration-title" onClose={onClose} onCancel={(event) => { if (saving) event.preventDefault(); else onClose(); }}>
    <div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">Riconsegna materiale</p><h2 id="return-registration-title">Registra rientro</h2></div><button type="button" className="icon-button" aria-label="Chiudi registrazione rientro" disabled={saving} onClick={onClose}><X size={20} aria-hidden="true" /></button></div>
    <form onSubmit={submit}>
      <div className="sale-dialog-body"><p>Inserisci i codici degli esemplari riconsegnati, uno dopo l’altro. Premi Invio per registrare ogni rientro.</p>
        {context && <p className="return-registration-note">Il codice 1 registra i bastoncini del noleggio n. {context.booking_number} · {context.customer.first_name} {context.customer.last_name}.</p>}
        <label className="return-code-label">Codice materiale<input ref={codeInput} autoFocus required maxLength={200} autoComplete="off" autoCapitalize="none" spellCheck={false} value={code} disabled={saving} onChange={(event) => { setCode(event.target.value); setRequestId(crypto.randomUUID()); setError(''); }} placeholder="Scansiona o scrivi il codice" /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {latest && <div className="return-latest-booking"><p role="status">Articolo {lastCode} rientrato. Puoi inserire il prossimo codice.</p><h3>Noleggio n. {latest.booking_number}</h3><ReturnBookingDetails booking={latest} /></div>}
      </div>
      <div className="sale-dialog-footer"><button className="sales-button" type="button" disabled={saving} onClick={onClose}>Chiudi</button><button className="sales-button sales-button-primary" type="submit" disabled={saving || !code.trim()}><Barcode size={16} aria-hidden="true" />{saving ? 'Registrazione…' : 'Conferma rientro'}</button></div>
    </form>
  </dialog>;
}
