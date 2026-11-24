import { Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { apiDelete } from '../../lib/api';
import { sizeLabel } from './rental-inventory';
import type { SaleInventoryItem } from './sale-inventory';

export function DeleteSaleStockDialog({ item, token, locationId, locationName, onClose, onDeleted }: {
  item: SaleInventoryItem; token: string; locationId: string; locationName: string;
  onClose: () => void; onDeleted: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); return () => controller.current?.abort(); }, []);
  function close() { if (!pending.current) onClose(); }
  async function remove() {
    if (pending.current) return;
    pending.current = true; setSaving(true); setError('');
    const request = new AbortController(); controller.current = request;
    try {
      await apiDelete(`/locations/${locationId}/sale-inventory/${item.id}`, token, request.signal);
      if (!request.signal.aborted) onDeleted(item.id);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile eliminare la riga.');
    } finally {
      if (!request.signal.aborted) { pending.current = false; setSaving(false); }
    }
  }
  return <dialog ref={dialog} className="sale-dialog" aria-labelledby="delete-sale-stock-title" onCancel={event => { event.preventDefault(); close(); }} onClose={close}>
    <div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">Magazzino vendite · {locationName}</p><h2 id="delete-sale-stock-title">Elimina articolo dal magazzino</h2></div><button className="icon-button" type="button" aria-label="Chiudi eliminazione articolo" disabled={saving} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    <div className="sale-dialog-body"><p>Vuoi eliminare <strong>{item.variant.brand} {item.variant.model}</strong> ({sizeLabel(item.variant)}) dal magazzino di {locationName}?</p><p>La riga contiene <strong>{item.quantity} {item.quantity === 1 ? 'pezzo' : 'pezzi'}</strong>: verrà rimossa l’intera giacenza di questa variante nella sede selezionata. Le registrazioni degli arrivi vengono conservate.</p>{error && <p className="auth-error" role="alert">{error}</p>}</div>
    <div className="sale-dialog-footer"><button className="sales-button" type="button" disabled={saving} onClick={close}>Annulla</button><button className="sales-button customer-delete-confirm" type="button" disabled={saving} onClick={remove}><Trash2 size={16} aria-hidden="true" />{saving ? 'Eliminazione…' : 'Elimina articolo'}</button></div>
  </dialog>;
}
