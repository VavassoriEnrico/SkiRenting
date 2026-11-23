import { useEffect, useState } from 'react';

import { apiPost } from '../../lib/api';
import type { Customer } from '../customers/customer';
import { sizeLabel } from '../inventory/rental-inventory';
import type { RentalItem } from '../inventory/rental-inventory';
import type { RentalPeriod } from './RentalPeriodFields';
import { RentalSection } from './RentalSection';
import { seasonalPackRows } from '../seasonal/seasonal-packs';

export type RentalQuote = {
  starts_on: string; ends_on: string; days: number;
  items: { inventory_id: string; code: string; brand: string; model: string; group_name: string; daily_price: string | null; amount: string | null; line_key?:string|null; price_mode?:string; pack_main_id?:string|null }[];
  promotion?: { id: string; name: string } | null;
  hotel: { id: string; name: string } | null;
  discount_percent: string; subtotal: string | null; discount_amount: string | null; total: string | null;
  missing_rate_codes: string[];
};
const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const money = (value: string | null) => value === null ? 'Da completare' : currency.format(Number(value));
const formatDate = (value: string) => value.split('-').reverse().join('/');

export function RentalRecapSection({ token, locationId, customer, period, equipment, onQuoteChange, bookingNotes = '' }: {
  token: string; locationId?: string; customer: Customer | null; period: RentalPeriod; equipment: RentalItem[];
  onQuoteChange?: (quote: RentalQuote | null) => void;
  bookingNotes?: string;
}) {
  const [response, setResponse] = useState<{ key: string; quote: RentalQuote } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ready = !!(customer && locationId && period.starts_on && period.ends_on && period.ends_on >= period.starts_on && equipment.length);
  const requestKey = JSON.stringify({ locationId, starts_on: period.starts_on, ends_on: period.ends_on, hotel_id: period.hotel || null, inventory_ids: equipment.map((item) => item.id), pole_quantity: equipment.find(item=>item.is_generic)?.quantity||1, attempt });
  const quote = ready && response?.key === requestKey ? response.quote : null;
  const error = ready && failure?.key === requestKey ? failure.message : '';
  const rows = seasonalPackRows((quote?.items || []).map(item => ({item,id:item.line_key||item.inventory_id,pricing:item.price_mode,mainId:item.pack_main_id})));
  useEffect(() => { onQuoteChange?.(quote); }, [quote, onQuoteChange]);

  useEffect(() => {
    if (!ready || !locationId) return;
    const controller = new AbortController();
    const input = JSON.parse(requestKey);
    // Una breve attesa raggruppa modifiche consecutive di date e materiale.
    const timer = window.setTimeout(() => {
      apiPost<RentalQuote>(`/locations/${locationId}/rental-quote`, token, {
        starts_on: input.starts_on, ends_on: input.ends_on,
        inventory_ids: input.inventory_ids, hotel_id: input.hotel_id, ...(input.pole_quantity>1?{pole_quantity:input.pole_quantity}:{}),
      }, controller.signal)
        .then((result) => { if (!controller.signal.aborted) { setFailure(null); setResponse({ key: requestKey, quote: result }); } })
        .catch((cause) => { if (!controller.signal.aborted) { setResponse(null); setFailure({ key: requestKey, message: cause instanceof Error ? cause.message : 'Impossibile calcolare i prezzi.' }); } });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [ready, requestKey, locationId, token]);

  return <RentalSection id="rental-recap" title="Riepilogo" className="rental-recap-panel">
    <div className="rental-customer-body">
      <p className="rental-form-hint">Sci e scarponi da sci, oppure snowboard e scarponi da snowboard, formano automaticamente un pack con la tariffa al giorno della durata scelta. Un paio di bastoncini per ogni paio di sci è incluso gratuitamente.</p>
      {!ready ? <p className="rental-form-hint">Seleziona un cliente, inserisci un periodo valido e aggiungi il materiale per vedere i prezzi.</p>
        : error ? <div className="auth-error" role="alert">{error}<div><button className="sales-button" type="button" onClick={() => setAttempt((current) => current + 1)}>Riprova prezzi</button></div></div>
          : !quote ? <p role="status">Calcolo dei prezzi…</p>
            : <>
              <dl className="sale-details-grid rental-recap-details"><div><dt>Cliente</dt><dd>{customer?.first_name} {customer?.last_name}</dd></div><div><dt>Periodo</dt><dd>{formatDate(quote.starts_on)} – {formatDate(quote.ends_on)}</dd></div><div><dt>Durata</dt><dd>{quote.days} {quote.days === 1 ? 'giorno' : 'giorni'} · inizio e rientro inclusi</dd></div><div><dt>Albergo</dt><dd>{quote.hotel?.name || 'Nessun albergo'}</dd></div></dl>
              {bookingNotes.trim() && <div className="rental-booking-notes"><h3>Note prenotazione</h3><p>{bookingNotes.trim()}</p></div>}
              {quote.missing_rate_codes.length > 0 && <p className="rental-inventory-notice" role="status">Tariffa da configurare per: {quote.missing_rate_codes.join(', ')}. Completa il listino in Gestione → Tariffe, poi aggiorna i prezzi.</p>}
              <div className="rentals-table-scroll" role="region" aria-label="Prezzi del noleggio" tabIndex={0}><table className="rentals-table rental-recap-table"><caption className="sr-only">Prezzi del materiale per il periodo selezionato</caption><thead><tr><th scope="col">Codice</th><th scope="col">Materiale</th><th scope="col">Gruppo</th><th scope="col">Misura</th><th scope="col">Formula</th><th scope="col">€/giorno</th><th scope="col">Giorni</th><th scope="col">Totale articolo</th></tr></thead><tbody>
                {rows.map(({item,formula}) => <tr key={item.line_key||item.inventory_id}><th scope="row" className="unit-code">{item.code}</th><td>{item.brand} {item.model}</td><td>{item.group_name}</td><td>{equipment.find((entry) => entry.id === item.inventory_id) ? sizeLabel(equipment.find((entry) => entry.id === item.inventory_id)!.variant) : '—'}</td><td>{formula}</td><td>{item.daily_price === null ? 'Tariffa mancante' : money(item.daily_price)}</td><td>{quote.days}</td><td>{item.amount === null ? 'Da configurare' : money(item.amount)}</td></tr>)}
              </tbody></table></div>
              <dl className="rental-recap-totals"><div><dt>Subtotale</dt><dd>{money(quote.subtotal)}</dd></div><div><dt>{quote.promotion ? `Promozione ${quote.promotion.name}` : quote.hotel ? 'Sconto albergo' : 'Sconto'} ({Number(quote.discount_percent).toLocaleString('it-IT')}%)</dt><dd>{quote.discount_amount === null ? 'Da completare' : `− ${money(quote.discount_amount)}`}</dd></div><div className="rental-recap-total"><dt>Totale noleggio</dt><dd>{money(quote.total)}</dd></div></dl>
              <button className="sales-button" type="button" onClick={() => setAttempt((current) => current + 1)}>Aggiorna prezzi</button>
              <p className="rental-form-hint rental-equipment-availability">Questo riepilogo non conferma la prenotazione e non riserva gli articoli.</p>
            </>}
    </div>
  </RentalSection>;
}
