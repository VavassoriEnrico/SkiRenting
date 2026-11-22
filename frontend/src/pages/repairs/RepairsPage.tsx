import { Search, Wrench } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { apiGet, apiPost } from '../../lib/api';
import { sizeLabel } from '../inventory/rental-inventory';
import { historyTime } from '../rentals/rental-history';
import { repairTypes } from './repair';
import type { Repair, RepairType } from './repair';

export function RepairsPage() {
  const { session,location } = useAuth();
  return session && location ? <Repairs key={`${location.id}:${session.access_token}`} token={session.access_token} locationId={location.id} locationName={location.name} /> : <p role="status">Seleziona una sede per consultare le riparazioni.</p>;
}

function Repairs({token,locationId,locationName}:{token:string;locationId:string;locationName:string}) {
  const [repairs,setRepairs] = useState<Repair[]|null>(null);
  const [loadError,setLoadError] = useState('');
  const [attempt,setAttempt] = useState(0);
  const [query,setQuery] = useState('');
  const [code,setCode] = useState('');
  const [type,setType] = useState<RepairType>('edges_and_wax');
  const [notes,setNotes] = useState('');
  const [requestId,setRequestId] = useState(()=>crypto.randomUUID());
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [page,setPage] = useState(0);
  const request = useRef<AbortController|null>(null);
  const inFlight = useRef(false);
  useEffect(()=>()=>request.current?.abort(),[]);
  useEffect(()=>{
    const controller = new AbortController();
    setRepairs(null);setLoadError('');
    apiGet<Repair[]>(`/locations/${locationId}/repairs`,token,controller.signal)
      .then(data=>{if(!controller.signal.aborted)setRepairs(data);})
      .catch(cause=>{if(!controller.signal.aborted)setLoadError(cause instanceof Error?cause.message:'Impossibile caricare le riparazioni.');});
    return ()=>controller.abort();
  },[token,locationId,attempt]);
  function edited(){setRequestId(crypto.randomUUID());setError('');setNotice('');}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!code.trim()||inFlight.current)return;
    const controller = new AbortController();request.current=controller;
    inFlight.current=true;setSaving(true);setError('');setNotice('');
    try{
      await apiPost(`/locations/${locationId}/repairs`,token,{repair_id:requestId,code:code.trim(),repair_type:type,notes:notes.trim()||null},controller.signal);
      if(!controller.signal.aborted){setNotice(`Articolo ${code.trim()} segnato in riparazione.`);setCode('');setNotes('');setRequestId(crypto.randomUUID());setAttempt(value=>value+1);}
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Impossibile registrare la riparazione.');}
    finally{if(!controller.signal.aborted){inFlight.current=false;setSaving(false);}}
  }
  const terms = query.trim().toLocaleLowerCase('it-IT').split(/\s+/);
  const filtered = (repairs||[]).filter(repair=>{
    const text=[repair.item.code,repair.item.variant.brand,repair.item.variant.model,sizeLabel(repair.item.variant),repairTypes[repair.repair_type],repair.notes].join(' ').toLocaleLowerCase('it-IT');
    return terms.every(term=>text.includes(term));
  });
  const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/20)-1));
  return <div className="dashboard-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><Wrench size={21} aria-hidden="true" /></span><h1>Riparazioni</h1></div><p className="page-description">Sci e snowboard da sistemare a {locationName}.</p></div><button className="sales-button" type="button" onClick={()=>setAttempt(value=>value+1)}>Aggiorna elenco</button></div>
    <section className="rentals-panel" aria-labelledby="new-repair-title"><div className="rentals-panel-heading"><h2 id="new-repair-title">Segna un articolo in riparazione</h2></div><form className="rental-customer-body" onSubmit={submit}><fieldset className="rental-booking-fields rental-form-grid" disabled={saving}>
      <label>Codice materiale<input required maxLength={200} autoComplete="off" value={code} onChange={event=>{setCode(event.target.value);edited();}} placeholder="Scansiona o scrivi il codice" /></label>
      <label>Intervento<select value={type} onChange={event=>{setType(event.target.value as RepairType);edited();}}>{Object.entries(repairTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="rental-form-wide">Note riparazione<textarea maxLength={5000} value={notes} onChange={event=>{setNotes(event.target.value);edited();}} /></label>
    </fieldset>{error&&<p className="auth-error" role="alert">{error}</p>}{notice&&<p className="customer-action-notice" role="status">{notice}</p>}<button className="sales-button sales-button-primary" type="submit" disabled={saving||!code.trim()}>{saving?'Salvataggio…':'Segna in riparazione'}</button></form></section>
    <section className="rentals-panel repairs-list" aria-labelledby="repairs-list-title"><div className="rentals-panel-heading"><h2 id="repairs-list-title">Riparazioni da effettuare</h2>{repairs&&<span className="rentals-count">{filtered.length} di {repairs.length}</span>}</div><div className="rentals-filters"><div className="rental-search"><Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor="repair-search">Cerca codice, marca, modello o intervento</label><input id="repair-search" type="search" value={query} placeholder="Codice, marca, modello o intervento…" onChange={event=>{setQuery(event.target.value);setPage(0);}} /></div></div>
      {loadError?<div className="rentals-empty"><p className="auth-error" role="alert">{loadError}</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>Riprova riparazioni</button></div>:!repairs?<p className="rentals-empty" role="status">Caricamento riparazioni…</p>:<><div className="rentals-table-scroll" role="region" aria-label="Riparazioni della sede" tabIndex={0}><table className="rentals-table"><thead><tr><th scope="col">Codice</th><th scope="col">Materiale</th><th scope="col">Misura</th><th scope="col">Intervento</th><th scope="col">In riparazione dal</th><th scope="col">Note</th></tr></thead><tbody>{filtered.slice(currentPage*20,(currentPage+1)*20).map(repair=><tr key={repair.id}><th scope="row">{repair.item.code}</th><td><span className="rental-primary">{repair.item.variant.brand} {repair.item.variant.model}</span><span className="rental-secondary">{repair.item.variant.category.name}</span></td><td>{sizeLabel(repair.item.variant)}</td><td><span className="repair-badge">{repairTypes[repair.repair_type]}</span></td><td>{historyTime(repair.sent_at)}</td><td>{repair.notes||'—'}</td></tr>)}{filtered.length===0&&<tr><td colSpan={6}><div className="rentals-empty">{repairs.length?'Nessuna riparazione corrisponde alla ricerca.':'Nessuna riparazione da effettuare.'}</div></td></tr>}</tbody></table></div>{filtered.length>20&&<div className="rental-equipment-pagination history-pagination"><span>{currentPage*20+1}–{Math.min((currentPage+1)*20,filtered.length)} di {filtered.length}</span><div><button className="sales-button" type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Precedenti</button><button className="sales-button" type="button" disabled={(currentPage+1)*20>=filtered.length} onClick={()=>setPage(currentPage+1)}>Successivi</button></div></div>}</>}
      <p className="rentals-panel-footer">Quando aggiungi l’articolo a un nuovo noleggio, una conferma permette di segnare la riparazione come conclusa.</p>
    </section>
  </div>;
}
