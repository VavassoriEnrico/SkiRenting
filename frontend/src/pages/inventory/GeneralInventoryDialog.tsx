import { X } from 'lucide-react';
import { useEffect,useRef,useState } from 'react';
import type { Location } from '../../lib/api';
import { repairTypes } from '../repairs/repair';
import { rentalStatuses, variantFields } from './rental-inventory';
import { rowQuantity, salePrice } from './general-inventory';
import { RentalUnitDialog } from './RentalUnitDialog';
import type { TransferResult } from './RentalItemTransfer';
import type { GeneralItem, GeneralRow } from './general-inventory';

export function GeneralInventoryDialog({row,locations,onClose,mode='rental',token,onTransferred}:{row:GeneralRow;locations:Location[];onClose:()=>void;mode?:'rental'|'sale';token?:string;onTransferred?:(result:TransferResult,name:string)=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [viewed,setViewed]=useState<GeneralItem|null>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} className="sale-dialog general-inventory-dialog" aria-labelledby="general-inventory-dialog-title" onClose={()=>{if(!viewed)onClose();}} onCancel={event=>{if(viewed)event.preventDefault();else onClose();}} onClick={event=>{
    if(viewed||event.target!==event.currentTarget)return;
    const rect=event.currentTarget.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onClose();
  }}>
    <div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">Magazzino generale {mode==='sale'?'vendite':'noleggi'} · {row.variant.category.name}</p><h2 id="general-inventory-dialog-title">{row.variant.brand} {row.variant.model}</h2><p className="page-description">{rowQuantity(row)} esemplari complessivi</p></div><button type="button" className="icon-button" aria-label="Chiudi elenco esemplari" disabled={Boolean(viewed)} autoFocus onClick={onClose}><X size={20} aria-hidden="true" /></button></div>
    <div className="sale-dialog-body"><dl className="sale-details-grid">{variantFields(row.variant).map(field=><div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
      {mode==='sale'?locations.map(location=>{
        const stocks=(row.stocks||[]).filter(stock=>stock.location.id===location.id);
        const quantity=stocks.reduce((total,stock)=>total+stock.quantity,0);
        return <section key={location.id} className="general-location-section" aria-labelledby={`general-location-${location.id}`}>
          <div className="general-location-heading"><h3 id={`general-location-${location.id}`}>{location.name}</h3><span className="rentals-count">{quantity} esemplari</span></div>
          {stocks.length===0?<p className="rental-form-hint">Nessun esemplare in questa sede.</p>:<div className="rentals-table-scroll" role="region" aria-label={`Esemplari a ${location.name}`} tabIndex={0}>
            <table className="rentals-table"><thead><tr><th scope="col">Quantità</th><th scope="col">Prezzo unitario</th><th scope="col">Note</th></tr></thead>
              <tbody>{stocks.map(stock=><tr key={stock.id}><td>{stock.quantity}</td><td>{salePrice(stock.price)}</td><td className="history-notes">{stock.notes||'—'}</td></tr>)}</tbody>
            </table>
          </div>}
        </section>;
      }):locations.map(location=>{
        const units=row.units.filter(unit=>unit.location.id===location.id).sort((a,b)=>a.code.localeCompare(b.code,'it',{numeric:true}));
        return <section key={location.id} className="general-location-section" aria-labelledby={`general-location-${location.id}`}><div className="general-location-heading"><h3 id={`general-location-${location.id}`}>{location.name}</h3><span className="rentals-count">{units.length} esemplari</span></div>{units.length===0?<p className="rental-form-hint">Nessun esemplare in questa sede.</p>:<div className="rentals-table-scroll" role="region" aria-label={`Esemplari a ${location.name}`} tabIndex={0}><table className="rentals-table general-units-table"><thead><tr><th scope="col">Codice</th><th scope="col">Stato magazzino</th><th scope="col">Gruppo</th><th scope="col">Scheda</th></tr></thead><tbody>{units.map(unit=><tr key={unit.id}><th scope="row" className="unit-code">{unit.code}</th><td><span className={unit.open_repair?'repair-badge':'rental-primary'}>{unit.open_repair?`In riparazione · ${repairTypes[unit.open_repair.repair_type]}`:rentalStatuses[unit.status]}</span>{(!unit.is_rentable||!unit.is_bookable)&&<span className="rental-secondary">Noleggio disabilitato</span>}</td><td>{unit.group.name}</td><td><button className="sales-button" type="button" aria-label={`Vedi ${unit.code}`} disabled={!token} onClick={()=>setViewed(unit)}>Vedi</button></td></tr>)}</tbody></table></div>}</section>;
      })}
      {mode==='rental'&&<p className="rental-form-hint">Ogni codice identifica un esemplare distinto. Lo stato di magazzino non indica la disponibilità per le date di un noleggio.</p>}
      {viewed&&token&&<RentalUnitDialog key={viewed.id} item={viewed} token={token} source={viewed.location} destinations={locations.filter(location=>location.id!==viewed.location.id)} directTransfer onClose={()=>setViewed(null)} onTransferred={(result,name)=>{onTransferred?.(result,name);setViewed(null);}} />}
    </div><div className="sale-dialog-footer"><button className="sales-button" type="button" disabled={Boolean(viewed)} onClick={onClose}>Chiudi</button></div>
  </dialog>;
}
