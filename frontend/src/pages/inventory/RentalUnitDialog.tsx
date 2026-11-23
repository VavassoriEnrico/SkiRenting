import { ArrowRightLeft, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { apiGet } from '../../lib/api';
import type { Location } from '../../lib/api';
import { RentalItemTransfer } from './RentalItemTransfer';
import type { TransferResult } from './RentalItemTransfer';
import { rentalStatuses, variantFields } from './rental-inventory';
import type { RentalItem } from './rental-inventory';

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export type RentalUnitDetails = {
  item: RentalItem;
  statistics: { rental_count: number; repair_count: number; rentals_since_last_repair: number; last_repair_at: string | null };
};

export function RentalUnitDialog({ item, token, source, destinations, onClose, onTransferred }: {
  item: RentalItem; token: string; source: Location; destinations: Location[];
  onClose: () => void; onTransferred: (result: TransferResult, name: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<RentalUnitDetails | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [transferring, setTransferring] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    apiGet<RentalUnitDetails>(`/locations/${source.id}/rental-inventory/${item.id}`, token, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile caricare la scheda.'); });
    return () => controller.abort();
  }, [item.id, source.id, token, attempt]);
  const current = data?.item || item;
  const statistics = data?.statistics;
  return <dialog ref={dialog} className="sale-dialog" aria-label={`Scheda esemplare ${item.code}`}
    onClose={event => { event.stopPropagation(); if (!busy) onClose(); }}
    onCancel={event => { event.stopPropagation(); if (busy) event.preventDefault(); else onClose(); }}
    onClick={event => {
      if (busy || event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">Esemplare · {source.name}</p><h2>{current.code}</h2><p className="page-description">{current.variant.brand} {current.variant.model}</p></div><button className="icon-button" type="button" aria-label="Chiudi scheda esemplare" autoFocus disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button></div>
    <div className="sale-dialog-body">
      <section className="sale-detail-section"><h3>Caratteristiche del materiale</h3><dl className="sale-details-grid">
        {[{label:'Codice',value:current.code},...variantFields(current.variant),{label:'Categoria',value:current.variant.category.name},{label:'Gruppo noleggio',value:current.group.name},{label:'Stato',value:rentalStatuses[current.status]},{label:'Matricola',value:current.serial_number || '—'},{label:'Note esemplare',value:current.notes || '—'},...(current.purchase_price == null ? [] : [{label:'Prezzo di acquisto',value:currency.format(current.purchase_price)}]),...(current.legacy_sold_price == null ? [] : [{label:'Prezzo venduto storico',value:currency.format(current.legacy_sold_price)}])].map(field=><div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
      </dl></section>
      <section className="sale-detail-section"><h3>Noleggi e riparazioni</h3>
        {error ? <><p className="auth-error" role="alert">{error}</p><button type="button" className="sales-button" onClick={()=>setAttempt(value=>value+1)}>Riprova conteggi</button></> : !statistics ? <p role="status">Caricamento conteggi…</p> : <>
          <dl className="sale-details-grid">
            <div><dt>Numero di noleggi</dt><dd>{statistics.rental_count}</dd></div>
            <div><dt>Riparazioni concluse</dt><dd>{statistics.repair_count}</dd></div>
            <div><dt>Noleggi dall’ultima riparazione</dt><dd>{statistics.rentals_since_last_repair}</dd></div>
            <div><dt>Ultima riparazione conclusa</dt><dd>{statistics.last_repair_at ? new Date(statistics.last_repair_at).toLocaleString('it-IT',{timeZone:'Europe/Rome'}) : 'Nessuna riparazione precedente'}</dd></div>
          </dl>
          <p className="rental-form-hint">Conteggi sui noleggi registrati e già iniziati, esclusi quelli annullati, e sulle riparazioni concluse. Senza riparazioni precedenti, il conteggio dall’ultima riparazione coincide con il totale.</p>
        </>}
      </section>
      {transferring ? <RentalItemTransfer item={current} token={token} source={source} destinations={destinations} onBusyChange={setBusy} onCancel={()=>setTransferring(false)} onSuccess={onTransferred} /> : <div className="rental-customer-actions"><button className="sales-button" type="button" disabled={!data || !destinations.length} onClick={()=>setTransferring(true)}><ArrowRightLeft size={14} aria-hidden="true" />Sposta sede</button></div>}
    </div>
    <div className="sale-dialog-footer"><button className="sales-button" type="button" disabled={busy} onClick={onClose}>Torna al materiale</button></div>
  </dialog>;
}
