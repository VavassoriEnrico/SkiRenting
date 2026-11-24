import { RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiPost, type Location } from '../../lib/api';
import type { RentalItem } from '../inventory/rental-inventory';

export function ReactivateItemDialog({ item, token, onClose, onReactivated }: {
  item: RentalItem & { location: Location }; token: string; onClose: () => void; onReactivated: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); return () => controller.current?.abort(); }, []);
  function close() { if (!pending.current) onClose(); }
  async function reactivate() {
    if (pending.current) return;
    pending.current = true; setSaving(true); setError('');
    const request = new AbortController(); controller.current = request;
    try {
      await apiPost(`/locations/${item.location.id}/rental-inventory/${item.id}/reactivate`, token, {}, request.signal);
      if (!request.signal.aborted) onReactivated();
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile riattivare l’articolo.');
    } finally {
      if (!request.signal.aborted) { pending.current = false; setSaving(false); }
    }
  }
  return <dialog ref={dialog} className="sale-dialog" aria-labelledby="reactivate-item-title" onCancel={event => { event.preventDefault(); close(); }} onClose={close}>
    <div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">Articolo {item.code}</p><h2 id="reactivate-item-title">Riattiva articolo</h2></div><button type="button" className="icon-button" aria-label="Chiudi riattivazione articolo" disabled={saving} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    <div className="sale-dialog-body"><p>Vuoi riportare in attività <strong>{item.variant.brand} {item.variant.model}</strong>, codice <strong>{item.code}</strong>?</p><p>Tornerà nel magazzino noleggio di <strong>{item.location.name}</strong>, come attivo, noleggiabile e prenotabile. Codice, noleggi e riparazioni precedenti verranno mantenuti.</p>{error && <p className="auth-error" role="alert">{error}</p>}</div>
    <div className="sale-dialog-footer"><button className="sales-button" type="button" disabled={saving} onClick={close}>Annulla</button><button className="sales-button sales-button-primary" type="button" disabled={saving} onClick={reactivate}><RotateCcw size={16} aria-hidden="true" />{saving ? 'Riattivazione…' : 'Conferma riattivazione'}</button></div>
  </dialog>;
}
