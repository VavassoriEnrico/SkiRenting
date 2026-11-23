import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiPost } from '../../lib/api';
import type { Customer } from '../customers/customer';
import type { RentalItem } from '../inventory/rental-inventory';
import type { RentalPeriod } from '../operations/RentalPeriodFields';
import { RentalSection } from '../operations/RentalSection';
import type { RentalQuote } from '../operations/RentalRecapSection';
import type { RentalSeason, SeasonalQuote } from './seasonal';
import { seasonalPackRows } from './seasonal-packs';

const euros=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'});
const money=(value:string|null)=>value===null?'Da configurare':euros.format(Number(value));
export function SeasonalRecapSection({token,locationId,season,customer,period,equipment,onQuoteChange}:{
  token:string;locationId?:string;season:RentalSeason|null;customer:Customer|null;period:RentalPeriod;equipment:RentalItem[];
  onQuoteChange:(quote:RentalQuote|null)=>void;
}){
  const [response,setResponse]=useState<{key:string;quote:SeasonalQuote}|null>(null);
  const [failure,setFailure]=useState<{key:string;message:string}|null>(null);
  const [attempt,setAttempt]=useState(0);
  const ready=!!(customer&&season&&locationId&&period.starts_on&&period.ends_on>=period.starts_on&&equipment.length);
  const requestKey=JSON.stringify({season_id:season?.id,starts_on:period.starts_on,inventory_ids:equipment.map(item=>item.id),pole_quantity:equipment.find(item=>item.is_generic)?.quantity||1,return_date:period.ends_on,locationId,attempt});
  const quote=ready&&response?.key===requestKey?response.quote:null;
  const error=ready&&failure?.key===requestKey?failure.message:'';
  const rows=seasonalPackRows((quote?.items||[]).map(item=>({item,id:item.line_key||item.inventory_id,pricing:item.price_mode,mainId:item.pack_main_id})));
  useEffect(()=>{onQuoteChange(quote);},[quote,onQuoteChange]);
  useEffect(()=>{
    if(!ready||!locationId)return;
    const controller=new AbortController();
    const input=JSON.parse(requestKey);
    const timer=window.setTimeout(()=>{
      apiPost<SeasonalQuote>(`/locations/${locationId}/seasonal-quote`,token,{season_id:input.season_id,starts_on:input.starts_on,inventory_ids:input.inventory_ids,...(input.pole_quantity>1?{pole_quantity:input.pole_quantity}:{})},controller.signal)
        .then(result=>{if(!controller.signal.aborted){setResponse({key:requestKey,quote:result});setFailure(null);}})
        .catch(cause=>{if(!controller.signal.aborted){setResponse(null);setFailure({key:requestKey,message:cause instanceof Error?cause.message:'Impossibile calcolare lo stagionale.'});}});
    },250);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[ready,requestKey,locationId,token]);
  return <RentalSection id="rental-recap" title="Riepilogo stagionale">
    <div className="rental-customer-body">
      <p className="rental-form-hint">Sci e scarponi da sci, oppure snowboard e scarponi da snowboard, formano automaticamente un pack. Per i bastoncini usa il codice 1: con gli sci sono gratuiti anche senza scarponi; da soli seguono il listino stagionale.</p>
      {!ready?<p className="rental-form-hint">Completa cliente, stagione e materiale per vedere i prezzi.</p>:error?<div className="auth-error" role="alert">{error}<button type="button" className="sales-button" onClick={()=>setAttempt(value=>value+1)}>Riprova prezzi stagionali</button></div>:!quote?<p role="status">Calcolo prezzi stagionali…</p>:<>
        <p className="rental-form-hint">Stagione {quote.season.name} · Consegna comune: {quote.ends_on.split('-').reverse().join('/')} · Prezzi per l’intero noleggio.</p>
        {quote.missing_rate_codes.length>0&&<p className="rental-inventory-notice" role="status">Tariffe stagionali da configurare per {quote.missing_rate_codes.join(', ')}. <Link to="/management/tariffe-stagionali">Apri il listino</Link>.</p>}
        <div className="rentals-table-scroll" role="region" aria-label="Prezzi dello stagionale" tabIndex={0}><table className="rentals-table"><thead><tr><th>Codice</th><th>Materiale</th><th>Formula</th><th>Prezzo stagionale</th></tr></thead><tbody>{rows.map(({item,formula})=><tr key={item.line_key||item.inventory_id}><th scope="row">{item.code}</th><td>{item.brand} {item.model}</td><td>{formula}</td><td>{item.price_mode==='included'?'Incluso':money(item.amount)}</td></tr>)}</tbody></table></div>
        <dl className="rental-recap-totals"><div className="rental-recap-total"><dt>Totale stagionale</dt><dd>{money(quote.total)}</dd></div></dl>
        <button type="button" className="sales-button" onClick={()=>setAttempt(value=>value+1)}>Aggiorna prezzi stagionali</button>
      </>}
    </div>
  </RentalSection>;
}
