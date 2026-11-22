import { Banknote, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiPost } from '../../lib/api';
import { italianPaymentTime, moneyToCents } from '../operations/rental-payment';
import { historyMoney } from '../rentals/rental-history';
import type { HistoryBooking, HistoryDetails } from '../rentals/rental-history';

export function ReturnPaymentDialog({ booking, token, locationId, onClose, onSaved }: {
  booking: Pick<HistoryBooking, 'id' | 'booking_number' | 'customer' | 'balance'>; token: string; locationId: string; onClose: () => void; onSaved: (booking: HistoryDetails) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const [paymentId, setPaymentId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(booking.balance);
  const [method, setMethod] = useState('');
  const [otherMethod, setOtherMethod] = useState('');
  const [paidAt, setPaidAt] = useState(italianPaymentTime);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const cents = moneyToCents(amount);
  const balance = moneyToCents(booking.balance);
  const paymentMethod = (method === 'Altro' ? otherMethod : method).trim();
  const valid = cents !== null && cents > 0 && balance !== null && cents <= balance && !!paymentMethod && !!paidAt;
  function edited() { setPaymentId(crypto.randomUUID()); setError(''); }
  useEffect(() => { dialog.current?.showModal(); return () => request.current?.abort(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || inFlight.current) return;
    inFlight.current = true; setSaving(true); setError('');
    const controller = new AbortController(); request.current = controller;
    try {
      const result = await apiPost<HistoryDetails>(`/locations/${locationId}/rental-bookings/${booking.id}/payments`, token, {
        payment_id: paymentId, amount: (cents! / 100).toFixed(2), payment_method: paymentMethod,
        paid_at_local: paidAt, notes: notes.trim() || null,
      }, controller.signal);
      if (!controller.signal.aborted) onSaved(result);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile registrare il pagamento.');
    } finally {
      if (!controller.signal.aborted) { inFlight.current = false; setSaving(false); }
    }
  }
  return <dialog ref={dialog} className="sale-dialog" aria-labelledby="return-payment-title" onClose={onClose} onCancel={(event) => { if (saving) event.preventDefault(); else onClose(); }}>
    <div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">Noleggio n. {booking.booking_number} · {booking.customer.first_name} {booking.customer.last_name}</p><h2 id="return-payment-title">Registra pagamento</h2></div><button type="button" className="icon-button" aria-label="Chiudi pagamento" onClick={onClose} disabled={saving}><X size={20} aria-hidden="true" /></button></div>
    <form onSubmit={submit}>
      <div className="sale-dialog-body"><p>Saldo residuo: <strong>{historyMoney(booking.balance)}</strong>. Registra un pagamento già ricevuto dal cliente.</p>
        <fieldset className="rental-booking-fields rental-form-grid" disabled={saving}>
          <label>Importo ricevuto (€)<input autoFocus required inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); edited(); }} /></label>
          <label>Metodo di pagamento<select required value={method} onChange={(event) => { setMethod(event.target.value); edited(); }}><option value="">Seleziona metodo</option><option>Contanti</option><option>Carta</option><option>Bonifico</option><option>Altro</option></select></label>
          {method === 'Altro' && <label>Altro metodo<input required maxLength={200} value={otherMethod} onChange={(event) => { setOtherMethod(event.target.value); edited(); }} /></label>}
          <label>Data e ora del pagamento<input aria-label="Data e ora del pagamento" required type="datetime-local" value={paidAt} onChange={(event) => { setPaidAt(event.target.value); edited(); }} /><span className="rental-form-hint">Ora italiana</span></label>
          <label className="rental-form-wide">Note pagamento<textarea maxLength={5000} value={notes} onChange={(event) => { setNotes(event.target.value); edited(); }} /></label>
        </fieldset>
        {!valid && amount && <p className="rental-form-hint">Indica un importo positivo non superiore al saldo, con massimo due decimali, un metodo e una data validi.</p>}
        <p className="rental-form-hint">Il saldo completo sposta il noleggio in Tutto completato. Un pagamento parziale lo lascia in Da saldare.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
      <div className="sale-dialog-footer"><button className="sales-button" type="button" onClick={onClose} disabled={saving}>Annulla</button><button className="sales-button sales-button-primary" type="submit" disabled={!valid || saving}><Banknote size={16} aria-hidden="true" />{saving ? 'Registrazione…' : 'Salva pagamento'}</button></div>
    </form>
  </dialog>;
}
