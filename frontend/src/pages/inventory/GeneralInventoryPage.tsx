import { Boxes, Eye, Search, X } from 'lucide-react';
import { useEffect,useMemo,useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { apiGet } from '../../lib/api';
import { sizeLabel } from './rental-inventory';
import { generalSortOptions, groupGeneralItems, sortGeneralRows } from './general-inventory';
import type { GeneralInventory,GeneralRow,GeneralSortField,SortDirection } from './general-inventory';
import { GeneralInventoryDialog } from './GeneralInventoryDialog';

export function GeneralInventoryPage(){
  const {session}=useAuth();
  return session?<GeneralInventoryContent key={session.access_token} token={session.access_token}/>:<p role="status">Accedi per consultare il magazzino generale noleggi.</p>;
}

function GeneralInventoryContent({token}:{token:string}){
  const [data,setData]=useState<GeneralInventory|null>(null);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('');
  const [page,setPage]=useState(0);
  const [sortField,setSortField]=useState<GeneralSortField>('brand');
  const [sortDirection,setSortDirection]=useState<SortDirection>('asc');
  const [selected,setSelected]=useState<GeneralRow|null>(null);
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');setSelected(null);
    apiGet<GeneralInventory>('/rental-inventory',token,controller.signal)
      .then(result=>{if(!controller.signal.aborted)setData(result);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Impossibile caricare il magazzino generale noleggi.');});
    return ()=>controller.abort();
  },[token,attempt]);
  const rows=useMemo(()=>groupGeneralItems(data?.items||[]),[data]);
  const terms=query.trim().toLocaleLowerCase('it-IT').split(/\s+/);
  const filtered=rows.filter(row=>{
    const text=[row.variant.brand,row.variant.model,row.variant.year,sizeLabel(row.variant),row.variant.category.name,...row.units.flatMap(unit=>[unit.code,unit.location.name,unit.group.name])].join(' ').toLocaleLowerCase('it-IT');
    return (!category||row.variant.category.id===category)&&terms.every(term=>text.includes(term));
  });
  const sorted=sortGeneralRows(filtered,sortField,sortDirection);
  const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/30)-1));
  return <div className="dashboard-page inventory-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><Boxes size={21} aria-hidden="true" /></span><h1>Magazzino generale noleggi</h1></div><p className="page-description">Il materiale da noleggio di tutte le sedi autorizzate, aggregato per marca, modello, misura, anno e caratteristiche. Apri una riga per vedere i codici dei singoli esemplari e dove si trovano.</p></div></div>
    {data&&<p className="general-inventory-summary">{data.items.length} esemplari · {rows.length} varianti · Sedi: {data.locations.map(location=>location.name).join(', ')}</p>}
    <section className="rentals-panel" aria-labelledby="general-inventory-title"><div className="rentals-panel-heading"><h2 id="general-inventory-title">Materiale aggregato</h2>{data&&<span className="rentals-count">{filtered.length} di {rows.length} varianti</span>}</div>
      <div className="rentals-filters"><div className="rental-search"><Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor="general-inventory-search">Cerca marca, modello, misura, anno o codice</label><input id="general-inventory-search" type="search" placeholder="Marca, modello, misura, anno, codice o sede…" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}} /></div><label className="period-select"><span className="sr-only">Categoria materiale</span><select value={category} onChange={event=>{setCategory(event.target.value);setPage(0);}}><option value="">Tutte le categorie</option>{data?.categories.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label className="general-inventory-sort"><span>Ordina per</span><select value={sortField} onChange={event=>{setSortField(event.target.value as GeneralSortField);setPage(0);}}>{Object.entries(generalSortOptions).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="period-select"><span className="sr-only">Direzione ordinamento</span><select value={sortDirection} onChange={event=>{setSortDirection(event.target.value as SortDirection);setPage(0);}}><option value="asc">Crescente ↑</option><option value="desc">Decrescente ↓</option></select></label>{(query||category)&&<button className="reset-filters" type="button" onClick={()=>{setQuery('');setCategory('');setPage(0);}}><X size={14} aria-hidden="true" />Azzera filtri</button>}</div>
      {error?<div className="rentals-empty"><p className="auth-error" role="alert">{error}</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>Riprova magazzino generale noleggi</button></div>:!data?<p className="rentals-empty" role="status">Caricamento magazzino generale noleggi…</p>:<><div className="rentals-table-scroll" role="region" aria-label="Magazzino generale noleggi aggregato" tabIndex={0}><table className="rentals-table"><caption className="sr-only">Quantità complessive per caratteristiche del materiale nelle sedi autorizzate</caption><thead><tr><th scope="col">Categoria</th><th scope="col">Marca</th><th scope="col">Modello</th><th scope="col">Misura / taglia</th><th scope="col">Anno</th><th scope="col">Quantità</th><th scope="col">Esemplari</th></tr></thead><tbody>{sorted.slice(currentPage*30,(currentPage+1)*30).map(row=><tr key={row.id} className="inventory-clickable-row" onClick={event=>{if(!(event.target as HTMLElement).closest('button'))setSelected(row);}}><td>{row.variant.category.name}</td><td>{row.variant.brand}</td><th scope="row">{row.variant.model}</th><td>{sizeLabel(row.variant)}</td><td>{row.variant.year??'—'}</td><td>{row.units.length}</td><td><button className="icon-button" type="button" aria-label={`Apri esemplari ${row.variant.brand} ${row.variant.model} ${sizeLabel(row.variant)} ${row.variant.year??''}`} aria-haspopup="dialog" onClick={()=>setSelected(row)}><Eye size={17} aria-hidden="true" /></button></td></tr>)}{filtered.length===0&&<tr><td colSpan={7}><div className="rentals-empty"><h3>{data.items.length?'Nessun materiale corrisponde ai filtri':'Nessun materiale registrato nelle sedi autorizzate'}</h3></div></td></tr>}</tbody></table></div>{filtered.length>30&&<div className="rental-equipment-pagination history-pagination"><span>{currentPage*30+1}–{Math.min((currentPage+1)*30,filtered.length)} di {filtered.length}</span><div><button className="sales-button" type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Precedenti</button><button className="sales-button" type="button" disabled={(currentPage+1)*30>=filtered.length} onClick={()=>setPage(currentPage+1)}>Successivi</button></div></div>}</>}
    </section>
    {selected&&data&&<GeneralInventoryDialog row={selected} locations={data.locations} onClose={()=>setSelected(null)}/>}
  </div>;
}
