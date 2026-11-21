import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiPost } from '../../lib/api';
import type { Location } from '../../lib/api';
import type { RentalItem } from './rental-inventory';

export type TransferResult = { id: string; code: string; from_location_id: string; to_location_id: string };

export function RentalItemTransfer({ item, source, destinations, token, onCancel, onSuccess, onBusyChange }: {
  item: RentalItem; source: Location; destinations: Location[]; token: string;
  onCancel: () => void; onSuccess: (result: TransferResult, name: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  useEffect(() => () => request.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = destinations.find((entry) => entry.id === destination && entry.id !== source.id);
    if (inFlight.current || !target) return;
    inFlight.current = true; setBusy(true); onBusyChange(true); setError('');
    const controller = new AbortController(); request.current = controller;
    try {
      const result = await apiPost<TransferResult>(`/locations/${source.id}/rental-inventory/${item.id}/transfer`, token, { destination_location_id: destination }, controller.signal);
      if (!controller.signal.aborted) onSuccess(result, target.name);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile trasferire l’articolo.');
    } finally {
      if (!controller.signal.aborted) { inFlight.current = false; setBusy(false); onBusyChange(false); }
    }
  }

  return <section className="sale-detail-section inventory-transfer" aria-labelledby="inventory-transfer-title">
    <h3 id="inventory-transfer-title">Sposta articolo {item.code}</h3>
    <p className="rental-form-hint">Sede attuale: {source.name}. Il trasferimento riguarda soltanto questo codice.</p>
    <form onSubmit={submit}>
      <div className="rental-form-grid"><label className="rental-form-wide">Sede di destinazione<select autoFocus required value={destination} disabled={busy} onChange={(event) => setDestination(event.target.value)}><option value="">Seleziona sede</option>{destinations.filter((entry) => entry.id !== source.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></div>
      {destination && <p className="rental-form-hint">Conferma lo spostamento di {item.code} da {source.name} a {destinations.find((entry) => entry.id === destination)?.name}.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="rental-customer-actions"><button className="sales-button" type="button" disabled={busy} onClick={onCancel}>Annulla spostamento</button><button className="sales-button sales-button-primary" type="submit" disabled={busy || !destination}>{busy ? 'Spostamento…' : 'Conferma spostamento'}</button></div>
    </form>
  </section>;
}
