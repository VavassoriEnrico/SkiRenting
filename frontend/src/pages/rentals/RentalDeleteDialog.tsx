import { Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiDelete } from '../../lib/api';
import type { HistoryBooking } from './rental-history';

export function RentalDeleteDialog({ booking, locationId, token, onClose, onDeleted }: {
  booking: Pick<HistoryBooking, 'id' | 'booking_number' | 'is_legacy' | 'legacy_code'> & { customer: Pick<HistoryBooking['customer'], 'first_name' | 'last_name'> }; locationId: string; token: string;
  onClose: () => void; onDeleted: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); return () => request.current?.abort(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setSaving(true); setError('');
    const controller = new AbortController(); request.current = controller;
    try {
      await apiDelete(`/locations/${locationId}/rental-bookings/${booking.id}`, token, controller.signal);
      if (!controller.signal.aborted) onDeleted(booking.id);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile eliminare la prenotazione.');
    } finally {
      if (!controller.signal.aborted) { inFlight.current = false; setSaving(false); }
    }
  }
  return <dialog ref={dialog} className="sale-dialog customer-dialog" aria-labelledby="rental-delete-title" onClose={onClose} onCancel={event => { if (saving) event.preventDefault(); else onClose(); }}>
    <div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">{booking.customer.first_name} {booking.customer.last_name}</p><h2 id="rental-delete-title">Elimina prenotazione</h2></div><button type="button" className="icon-button" aria-label="Chiudi eliminazione prenotazione" disabled={saving} onClick={onClose}><X size={20} aria-hidden="true" /></button></div>
    <form onSubmit={submit}>
      <div className="sale-dialog-body"><p>Vuoi eliminare la prenotazione <strong>{booking.is_legacy ? `Cod. ${booking.legacy_code}` : `n. ${booking.booking_number}`}</strong>?</p><p>La prenotazione verrà rimossa dagli elenchi, anche nella scheda del cliente. Le sue assegnazioni di materiale verranno liberate.</p>{error && <p className="auth-error" role="alert">{error}</p>}</div>
      <div className="sale-dialog-footer"><button className="sales-button" type="button" disabled={saving} onClick={onClose}>Annulla</button><button className="sales-button customer-delete-confirm" type="submit" disabled={saving}><Trash2 size={16} aria-hidden="true" />{saving ? 'Eliminazione…' : 'Elimina prenotazione'}</button></div>
    </form>
  </dialog>;
}
