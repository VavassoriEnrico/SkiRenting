import { Archive, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { apiPost } from '../../lib/api';
import type { RentalItem } from './rental-inventory';

export function DeleteRentalItemsDialog({ items, token, locationId, locationName, onClose, onDeleted }: {
  items: RentalItem[]; token: string; locationId: string; locationName: string;
  onClose: () => void; onDeleted: (ids: string[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const selectable = items.filter(item => !item.is_generic);
  const [selected, setSelected] = useState(() => selectable.map(item => item.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); return () => controller.current?.abort(); }, []);
  function close() { if (!inFlight.current) onClose(); }
  async function remove() {
    if (inFlight.current || !selected.length || selected.length > 500) return;
    inFlight.current = true; setSaving(true); setError('');
    const request = new AbortController(); controller.current = request;
    try {
      const result = await apiPost<{ item_ids: string[] }>(`/locations/${locationId}/rental-inventory/archive`, token, { item_ids: selected }, request.signal);
      if (!request.signal.aborted) onDeleted(result.item_ids);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile dismettere gli esemplari.');
    } finally {
      if (!request.signal.aborted) { inFlight.current = false; setSaving(false); }
    }
  }
  return <dialog ref={dialog} className="sale-dialog" aria-labelledby="delete-rental-items-title" onCancel={event => { event.preventDefault(); close(); }} onClose={close}>
    <div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">Magazzino noleggio · {locationName}</p><h2 id="delete-rental-items-title">Dismetti esemplari</h2></div><button type="button" className="icon-button" aria-label="Chiudi dismissione esemplari" disabled={saving} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    <div className="sale-dialog-body"><p>Confermi la dismissione degli esemplari selezionati dal magazzino di {locationName}? Gli articoli saranno visibili in Gestione → Articoli dismessi, con lo storico dei noleggi e delle riparazioni.</p>
      <fieldset className="rental-form-section" disabled={saving}><legend>Esemplari da dismettere</legend>
        {selectable.length > 1 && <button type="button" className="reset-filters" onClick={() => setSelected(selected.length === selectable.length ? [] : selectable.map(item => item.id))}>{selected.length === selectable.length ? 'Deseleziona tutti' : 'Seleziona tutti'}</button>}
        <div className="rental-form-grid">{[...items].sort((a, b) => a.code.localeCompare(b.code, 'it', { numeric: true })).map(item => <label key={item.id} className="rental-form-check"><input type="checkbox" disabled={item.is_generic} checked={selected.includes(item.id)} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /><span><strong>{item.code}</strong> · {item.variant.brand} {item.variant.model}{item.is_generic && ' · Materiale generico condiviso'}</span></label>)}</div>
      </fieldset>
      <p className="rental-form-hint">Gli esemplari assegnati a un noleggio, ancora da riconsegnare o con riparazioni aperte non possono essere dismessi. I codici restano riservati allo storico.</p>
      {selected.length > 500 && <p className="auth-error" role="alert">Seleziona al massimo 500 esemplari per volta.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
    <div className="sale-dialog-footer"><button type="button" className="sales-button" disabled={saving} onClick={close}>Annulla</button><button type="button" className="sales-button customer-delete-confirm" disabled={saving || !selected.length || selected.length > 500} onClick={remove}><Archive size={16} aria-hidden="true" />{saving ? 'Dismissione…' : `Dismetti ${selected.length} ${selected.length === 1 ? 'esemplare' : 'esemplari'}`}</button></div>
  </dialog>;
}
