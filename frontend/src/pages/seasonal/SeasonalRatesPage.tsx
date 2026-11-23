import { ArrowLeft, CalendarDays, Save, Snowflake } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/AuthProvider';
import { apiGet, apiPatch, apiPost } from '../../lib/api';
import { sortRentalCategories } from '../inventory/rental-inventory';
import { seasonalPackCategory } from './seasonal';
import type { RentalSeason, SeasonalSettings, SeasonalRate, SeasonalRateList } from './seasonal';

export function SeasonalRatesPage(){
  const {session}=useAuth();
  return session?<SeasonalRates key={session.access_token} token={session.access_token}/>:<p role="status">Accedi per gestire le tariffe stagionali.</p>;
}
function SeasonalRates({token}:{token:string}){
  const [settings,setSettings]=useState<SeasonalSettings|null>(null);
  const [rates,setRates]=useState<SeasonalRate[]|null>(null);
  const [drafts,setDrafts]=useState<Record<string,{single:string;pack:string}>>({});
  const [seasonId,setSeasonId]=useState<string|null>(null);
  const [name,setName]=useState('');
  const [returnDate,setReturnDate]=useState('');
  const [category,setCategory]=useState('');
  const [loadError,setLoadError]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [pending,setPending]=useState<string|null>(null);
  const operation=useRef<AbortController|null>(null);
  const inFlight=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();setLoadError('');setRates(null);setSettings(null);
    Promise.all([apiGet<SeasonalSettings>('/seasonal-rentals/settings',token,controller.signal),apiGet<SeasonalRateList>('/seasonal-rates',token,controller.signal)])
      .then(([config,list])=>{if(!controller.signal.aborted){
        setSettings(config);setRates(list.rates);setSeasonId(config.current_season?.id||null);setName(config.current_season?.name||'');setReturnDate(config.current_season?.return_date||'');
        setDrafts(Object.fromEntries(list.rates.map(rate=>[rate.id,{single:rate.single_price==null?'':String(rate.single_price),pack:rate.pack_price==null?'':String(rate.pack_price)}])));
      }})
      .catch(cause=>{if(!controller.signal.aborted)setLoadError(cause instanceof Error?cause.message:'Impossibile caricare il listino stagionale.');});
    return()=>controller.abort();
  },[token,attempt]);
  useEffect(()=>()=>operation.current?.abort(),[]);
  const categories=sortRentalCategories([...new Map((rates||[]).map(rate=>[rate.group.category.id,rate.group.category])).values()]);
  const current=categories.find(entry=>entry.id===category)||categories[0];
  const rows=(rates||[]).filter(rate=>rate.group.category.id===current?.id).sort((a,b)=>a.group.name.localeCompare(b.group.name,'it'));
  async function saveSeason(){
    if(inFlight.current||!settings||!name.trim()||!returnDate)return;
    inFlight.current=true;setPending('season');setError('');setNotice('');
    const controller=new AbortController();operation.current=controller;
    try{
      const result=await apiPost<RentalSeason>('/seasonal-rentals/settings',token,{id:seasonId,name:name.trim(),return_date:returnDate},controller.signal);
      if(!controller.signal.aborted){setSettings(config=>({current_season:result,seasons:[result,...(config?.seasons||[]).filter(entry=>entry.id!==result.id).map(entry=>({...entry,is_current:false}))]}));setSeasonId(result.id);setName(result.name);setReturnDate(result.return_date);setNotice('Stagione e data di consegna salvate.');}
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Impossibile salvare la stagione.');}
    finally{if(!controller.signal.aborted){inFlight.current=false;setPending(null);}}
  }
  async function saveRate(rate:SeasonalRate){
    if(inFlight.current)return;
    const draft=drafts[rate.id];
    const single=draft.single===''?null:Number(draft.single);
    const pack=seasonalPackCategory(rate.group.category.code)&&draft.pack!==''?Number(draft.pack):null;
    if([single,pack].some(value=>value!==null&&(!Number.isFinite(value)||value<0||value>9999999999.99))){setError('Inserisci prezzi validi maggiori o uguali a zero.');return;}
    inFlight.current=true;setPending(rate.id);setError('');setNotice('');
    const controller=new AbortController();operation.current=controller;
    try{
      const updated=await apiPatch<SeasonalRate>(`/seasonal-rates/${rate.id}`,token,{single_price:single,pack_price:pack},controller.signal);
      if(!controller.signal.aborted){setRates(current=>current?.map(entry=>entry.id===updated.id?updated:entry)||null);setNotice(`Tariffe stagionali di ${updated.group.name} salvate.`);}
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Impossibile salvare le tariffe.');}
    finally{if(!controller.signal.aborted){inFlight.current=false;setPending(null);}}
  }
  return <div className="dashboard-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><Snowflake size={21} aria-hidden="true"/></span><h1>Tariffe stagionali</h1></div><p className="page-description">Prezzi totali per lo stagionale e data di consegna condivisa tra tutte le sedi.</p></div><Link to="/management" className="sales-button"><ArrowLeft size={16} aria-hidden="true"/>Gestione</Link></div>
    {notice&&<p className="rental-inventory-notice" role="status">{notice}</p>}{error&&<p className="auth-error" role="alert">{error}</p>}
    {loadError?<div className="auth-error" role="alert">{loadError}<button className="sales-button" onClick={()=>setAttempt(value=>value+1)}>Riprova stagionali</button></div>:!settings||!rates?<p role="status">Caricamento tariffe stagionali…</p>:<>
      <section className="rentals-panel seasonal-settings" aria-labelledby="season-settings-title"><div className="rentals-panel-heading"><h2 id="season-settings-title">Stagione e consegna globale</h2>{settings.current_season&&<button className="sales-button" type="button" disabled={!!pending} onClick={()=>{setSeasonId(null);setName('');setReturnDate('');setNotice('');}}>Nuova stagione</button>}</div>
        <form className="rental-customer-body rental-form-grid" onSubmit={event=>{event.preventDefault();void saveSeason();}}>
          <label>Nome stagione<input required maxLength={200} placeholder="Es. 2026/2027" value={name} disabled={!!pending} onChange={event=>setName(event.target.value)}/></label>
          <label>Imposta data di consegna degli stagionali<input required type="date" value={returnDate} disabled={!!pending} onChange={event=>setReturnDate(event.target.value)}/></label>
          <button className="sales-button sales-button-primary" type="submit" disabled={!!pending||!name.trim()||!returnDate}><CalendarDays size={16} aria-hidden="true"/>{pending==='season'?'Salvataggio…':'Salva stagione'}</button>
        </form><p className="rentals-panel-footer">Data comune di rientro proposta per i nuovi stagionali. Le prenotazioni già confermate conservano la data salvata.</p>
      </section>
      <section className="inventory-categories seasonal-categories"><h2>Tipo di materiale</h2><div className="category-filters" role="group" aria-label="Tipo di materiale stagionale">{categories.map(entry=><button key={entry.id} className={`category-filter${current?.id===entry.id?' is-selected':''}`} aria-pressed={current?.id===entry.id} onClick={()=>setCategory(entry.id)}>{entry.name}</button>)}</div></section>
      <section className="rentals-panel"><div className="rentals-panel-heading"><h2>{current?.name||'Tariffe stagionali'}</h2><span className="rentals-count">{rows.length} gruppi</span></div><div className="rentals-table-scroll" role="region" aria-label="Listino stagionale" tabIndex={0}><table className="rentals-table"><thead><tr><th>Gruppo</th><th>Prezzo singolo (€)</th><th>Prezzo pack (€)</th><th>Salva</th></tr></thead><tbody>{rows.map(rate=>{
        const draft=drafts[rate.id];const packAllowed=seasonalPackCategory(rate.group.category.code);
        const dirty=(draft.single===''?null:Number(draft.single))!==rate.single_price||(packAllowed&&(draft.pack===''?null:Number(draft.pack))!==rate.pack_price);
        return <tr key={rate.id}><th scope="row">{rate.group.name}</th><td><input className="rate-price-input" form={`seasonal-rate-${rate.id}`} type="number" min="0" max="9999999999.99" step="0.01" placeholder="Da configurare" aria-label={`${rate.group.name} · Singolo (€)`} value={draft.single} disabled={!!pending} onChange={event=>setDrafts(current=>({...current,[rate.id]:{...draft,single:event.target.value}}))}/></td><td>{packAllowed?<input className="rate-price-input" form={`seasonal-rate-${rate.id}`} type="number" min="0" max="9999999999.99" step="0.01" placeholder="Da configurare" aria-label={`${rate.group.name} · Pack (€)`} value={draft.pack} disabled={!!pending} onChange={event=>setDrafts(current=>({...current,[rate.id]:{...draft,pack:event.target.value}}))}/>:<span>—</span>}</td><td><form id={`seasonal-rate-${rate.id}`} onSubmit={event=>{event.preventDefault();void saveRate(rate);}}><button type="submit" className="sales-button" disabled={!!pending||!dirty} aria-label={`Salva stagionali ${rate.group.name}`}><Save size={15} aria-hidden="true"/>{pending===rate.id?'Salvataggio…':'Salva'}</button></form></td></tr>;
      })}</tbody></table></div><p className="rentals-panel-footer">Prezzi per l’intero stagionale. Il pack comprende sci o snowboard e scarponi compatibili. I bastoncini (codice 1) con gli sci sono gratuiti anche senza scarponi; da soli seguono il prezzo singolo del gruppo Bastoncini generici. Un campo vuoto indica una tariffa non configurata; zero indica gratuito.</p></section>
    </>}
  </div>;
}
