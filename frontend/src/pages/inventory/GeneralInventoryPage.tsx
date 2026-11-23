import { Boxes, CalendarDays, Eye, MapPin, Search, Wrench, X } from 'lucide-react';
import { useEffect,useMemo,useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { StatCard } from '../../components/ui/StatCard';
import { apiGet } from '../../lib/api';
import { sizeLabel, sortRentalCategories } from './rental-inventory';
import { generalSortOptions, groupGeneralItems, groupSaleStock, rowQuantity, rowSalePrice, sortGeneralRows } from './general-inventory';
import type { GeneralInventory,GeneralSaleInventory,GeneralRow,GeneralSortField,SortDirection } from './general-inventory';
import type { TransferResult } from './RentalItemTransfer';
import { GeneralInventoryDialog } from './GeneralInventoryDialog';

export function GeneralInventoryPage({mode='rental'}:{mode?:'rental'|'sale'}){
  const {session}=useAuth();
  return session?<GeneralInventoryContent key={`${mode}:${session.access_token}`} token={session.access_token} mode={mode}/>:<p role="status">Accedi per consultare il magazzino generale {mode==='sale'?'vendite':'noleggi'}.</p>;
}

function GeneralInventoryContent({token,mode}:{token:string;mode:'rental'|'sale'}){
  const isSale=mode==='sale';
  const title=`Magazzino generale ${isSale?'vendite':'noleggi'}`;
  const lowerTitle=title.toLocaleLowerCase('it-IT');
  const sortOptions=isSale?{...generalSortOptions,price:'Prezzo'}:generalSortOptions;
  const [data,setData]=useState<GeneralInventory|GeneralSaleInventory|null>(null);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('');
  const [page,setPage]=useState(0);
  const [sortField,setSortField]=useState<GeneralSortField>('brand');
  const [sortDirection,setSortDirection]=useState<SortDirection>('asc');
  const [selected,setSelected]=useState<GeneralRow|null>(null);
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');setSelected(null);
    apiGet<GeneralInventory|GeneralSaleInventory>(isSale?'/sale-inventory':'/rental-inventory',token,controller.signal)
      .then(result=>{if(!controller.signal.aborted)setData(result);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:`Impossibile caricare il ${lowerTitle}.`);});
    return ()=>controller.abort();
  },[token,attempt,isSale,lowerTitle]);
  function onTransferred(result:TransferResult,name:string) {
    if(!data||isSale)return;
    const inventory=data as GeneralInventory;
    const destination=inventory.locations.find(location=>location.id===result.to_location_id);
    if(!destination)return;
    const move=(item:GeneralInventory['items'][number])=>item.id===result.id?{...item,location:destination}:item;
    setData({...inventory,items:inventory.items.map(move)});
    setSelected(current=>current?{...current,units:current.units.map(move)}:null);
    setNotice(`Articolo ${result.code} spostato in sede ${name}.`);
  }
  const rows=useMemo(()=>isSale
    ?groupSaleStock((data as GeneralSaleInventory|null)?.items||[])
    :groupGeneralItems((data as GeneralInventory|null)?.items||[]),[data,isSale]);
  const categories=useMemo(()=>sortRentalCategories(data?.categories||[]),[data]);
  const currentCategory=categories.find(entry=>entry.id===category)||categories[0];
  const summary=isSale?null:(data as GeneralInventory|null)?.summary;
  const totalQuantity=rows.reduce((total,row)=>total+rowQuantity(row),0);
  const terms=query.trim().toLocaleLowerCase('it-IT').split(/\s+/);
  const filtered=rows.filter(row=>{
    const text=[row.variant.brand,row.variant.model,row.variant.year,sizeLabel(row.variant),row.variant.category.name,...row.units.flatMap(unit=>[unit.code,unit.location.name,unit.group.name]),...(row.stocks||[]).map(stock=>stock.location.name)].join(' ').toLocaleLowerCase('it-IT');
    return (isSale?(!category||row.variant.category.id===category):row.variant.category.id===currentCategory?.id)&&terms.every(term=>text.includes(term));
  });
  const sorted=sortGeneralRows(filtered,sortField,sortDirection);
  const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/30)-1));
  return <div className="dashboard-page inventory-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><Boxes size={21} aria-hidden="true" /></span><h1>{title}</h1></div><p className="page-description">Il materiale {isSale?'in vendita':'da noleggio'} di tutte le sedi autorizzate, aggregato per marca, modello, misura, anno e caratteristiche. Apri una riga per vedere {isSale?'quantità e prezzi':'i codici dei singoli esemplari'} divisi per sede.</p></div></div>
    {notice&&<p className="rental-inventory-notice" role="status">{notice}</p>}
    {data&&!isSale&&<section className="stats-section tone-indigo rentals-summary" aria-label="Riepilogo magazzino generale noleggi"><div className="stats-grid">
      <StatCard label="Articoli totali" value={String(data.items.length)} detail="Esemplari registrati nelle sedi autorizzate" icon={Boxes} />
      <StatCard label="Attualmente noleggiati" value={summary?String(summary.currently_rented):'—'} detail="In corso oggi o ancora da riconsegnare" icon={CalendarDays} />
      <StatCard label="Attualmente in riparazione" value={summary?String(summary.currently_in_repair):'—'} detail="Esemplari in manutenzione o con intervento aperto" icon={Wrench} />
    </div></section>}
    {data&&!isSale&&<section className="inventory-sites" aria-label="Articoli per sede">
      {data.locations.map(location=>{
        const items=(data as GeneralInventory).items.filter(item=>item.location.id===location.id);
        return <section key={location.id} className="stats-section tone-indigo rentals-summary inventory-site-stats" aria-label={`Riepilogo sede ${location.name}`}>
          <h2 className="inventory-site-title">Magazzino {location.name}</h2>
          <div className="stats-grid">
            <StatCard label={`Articoli a ${location.name}`} value={String(items.length)} detail="Esemplari registrati nella sede" icon={MapPin} />
            <StatCard label="Attualmente noleggiati" value={String(items.filter(item=>item.is_currently_rented).length)} detail="In corso oggi o ancora da riconsegnare" icon={CalendarDays} />
            <StatCard label="Attualmente in riparazione" value={String(items.filter(item=>item.status==='maintenance'||item.open_repair).length)} detail="Esemplari in manutenzione o con intervento aperto" icon={Wrench} />
          </div>
        </section>;
      })}
    </section>}
    {data&&isSale&&<p className="general-inventory-summary">{totalQuantity} esemplari · {rows.length} varianti · Sedi: {data.locations.map(location=>location.name).join(', ')}</p>}
    {data&&!isSale&&<section className="inventory-categories" aria-labelledby="general-categories-title">
      <h2 id="general-categories-title">Categorie</h2>
      <div className="category-filters" role="group" aria-label="Filtra il materiale per categoria">
        {categories.map(entry=><button key={entry.id} type="button" className={`category-filter${currentCategory?.id===entry.id?' is-selected':''}`} aria-pressed={currentCategory?.id===entry.id} onClick={()=>{setCategory(entry.id);setQuery('');setPage(0);}}>{entry.name}<span>{data.items.filter(item=>item.variant.category.id===entry.id).length}</span></button>)}
      </div>
    </section>}
    <section className="rentals-panel" aria-labelledby="general-inventory-title"><div className="rentals-panel-heading"><h2 id="general-inventory-title">{isSale?'Materiale aggregato':currentCategory?.name||'Materiale'}</h2>{data&&<span className="rentals-count">{filtered.length} di {rows.length} varianti</span>}</div>
      <div className="rentals-filters"><div className="rental-search"><Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor="general-inventory-search">{isSale?'Cerca marca, modello, misura, anno o sede':'Cerca marca, modello, misura, anno o codice'}</label><input id="general-inventory-search" type="search" placeholder={isSale?'Marca, modello, misura, anno o sede…':'Marca, modello, misura, anno, codice o sede…'} value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}} /></div>{isSale&&<label className="period-select"><span className="sr-only">Categoria materiale</span><select value={category} onChange={event=>{setCategory(event.target.value);setPage(0);}}><option value="">Tutte le categorie</option>{data?.categories.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>}<label className="general-inventory-sort"><span>Ordina per</span><select value={sortField} onChange={event=>{setSortField(event.target.value as GeneralSortField);setPage(0);}}>{Object.entries(sortOptions).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="period-select"><span className="sr-only">Direzione ordinamento</span><select value={sortDirection} onChange={event=>{setSortDirection(event.target.value as SortDirection);setPage(0);}}><option value="asc">Crescente ↑</option><option value="desc">Decrescente ↓</option></select></label>{(query||(isSale&&category))&&<button className="reset-filters" type="button" onClick={()=>{setQuery('');if(isSale)setCategory('');setPage(0);}}><X size={14} aria-hidden="true" />Azzera filtri</button>}</div>
      {error?<div className="rentals-empty"><p className="auth-error" role="alert">{error}</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>Riprova {lowerTitle}</button></div>:!data?<p className="rentals-empty" role="status">Caricamento {lowerTitle}…</p>:<><div className="rentals-table-scroll" role="region" aria-label={`${title} aggregato`} tabIndex={0}><table className="rentals-table"><caption className="sr-only">Quantità complessive per caratteristiche del materiale nelle sedi autorizzate</caption><thead><tr><th scope="col">Categoria</th><th scope="col">Marca</th><th scope="col">Modello</th><th scope="col">Misura / taglia</th><th scope="col">Anno</th><th scope="col">Quantità</th>{isSale&&<th scope="col">Prezzo unitario</th>}<th scope="col">Esemplari</th></tr></thead><tbody>{sorted.slice(currentPage*30,(currentPage+1)*30).map(row=><tr key={row.id} className="inventory-clickable-row" onClick={event=>{if(!(event.target as HTMLElement).closest('button'))setSelected(row);}}><td>{row.variant.category.name}</td><td>{row.variant.brand}</td><th scope="row">{row.variant.model}</th><td>{sizeLabel(row.variant)}</td><td>{row.variant.year??'—'}</td><td>{rowQuantity(row)}</td>{isSale&&<td>{rowSalePrice(row)}</td>}<td><button className="icon-button" type="button" aria-label={`Apri esemplari ${row.variant.brand} ${row.variant.model} ${sizeLabel(row.variant)} ${row.variant.year??''}`} aria-haspopup="dialog" onClick={()=>setSelected(row)}><Eye size={17} aria-hidden="true" /></button></td></tr>)}{filtered.length===0&&<tr><td colSpan={isSale?8:7}><div className="rentals-empty"><h3>{data.items.length?'Nessun materiale corrisponde ai filtri':'Nessun materiale registrato nelle sedi autorizzate'}</h3></div></td></tr>}</tbody></table></div>{filtered.length>30&&<div className="rental-equipment-pagination history-pagination"><span>{currentPage*30+1}–{Math.min((currentPage+1)*30,filtered.length)} di {filtered.length}</span><div><button className="sales-button" type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Precedenti</button><button className="sales-button" type="button" disabled={(currentPage+1)*30>=filtered.length} onClick={()=>setPage(currentPage+1)}>Successivi</button></div></div>}</>}
    </section>
    {selected&&data&&<GeneralInventoryDialog token={token} onTransferred={onTransferred} mode={mode} row={selected} locations={data.locations} onClose={()=>setSelected(null)}/>}
  </div>;
}
