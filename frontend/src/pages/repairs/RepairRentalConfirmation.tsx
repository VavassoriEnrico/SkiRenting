import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { apiPost } from '../../lib/api';
import type { RentalItem } from '../inventory/rental-inventory';
import { repairTypes } from './repair';

export function RepairRentalConfirmation({item,token,locationId,onClose,onCompleted}:{
  item:RentalItem;token:string;locationId:string;onClose:()=>void;onCompleted:(item:RentalItem)=>void;
}){
  const dialog=useRef<HTMLDialogElement>(null);
  const request=useRef<AbortController|null>(null);
  const inFlight=useRef(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{dialog.current?.showModal();return()=>request.current?.abort();},[]);
  async function confirm(){
    if(inFlight.current||!item.open_repair)return;
    const controller=new AbortController();request.current=controller;
    inFlight.current=true;setSaving(true);setError('');
    try{
      const updated=await apiPost<RentalItem>(`/locations/${locationId}/repairs/${item.open_repair.id}/complete`,token,{rental_inventory_id:item.id},controller.signal);
      if(!controller.signal.aborted)onCompleted(updated);
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Impossibile completare la riparazione.');}
    finally{if(!controller.signal.aborted){inFlight.current=false;setSaving(false);}}
  }
  return <dialog ref={dialog} className="sale-dialog" aria-labelledby="repair-confirm-title" onClose={onClose} onCancel={event=>{if(saving)event.preventDefault();else onClose();}}><div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">Articolo {item.code}</p><h2 id="repair-confirm-title">Articolo in riparazione</h2></div><button type="button" className="icon-button" aria-label="Chiudi conferma riparazione" disabled={saving} onClick={onClose}><X size={20} aria-hidden="true" /></button></div><div className="sale-dialog-body"><p>L’oggetto era in riparazione, sicuro di volerlo noleggiare?</p><p>{item.variant.brand} {item.variant.model} · {item.open_repair&&repairTypes[item.open_repair.repair_type]}</p><p>Confermando, la riparazione viene segnata come conclusa e l’articolo viene aggiunto al noleggio.</p>{error&&<p className="auth-error" role="alert">{error}</p>}</div><div className="sale-dialog-footer"><button autoFocus className="sales-button" type="button" disabled={saving} onClick={onClose}>Annulla</button><button className="sales-button sales-button-primary" type="button" disabled={saving} onClick={()=>void confirm()}>{saving?'Salvataggio…':'Sì, noleggia e concludi riparazione'}</button></div></dialog>;
}
