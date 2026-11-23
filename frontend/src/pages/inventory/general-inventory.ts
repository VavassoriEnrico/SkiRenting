import { sizeLabel } from './rental-inventory';
import type { Location } from '../../lib/api';
import type { RentalCategory, RentalInventory, RentalItem, RentalVariant } from './rental-inventory';

export type GeneralItem = RentalItem & { location:Location; is_currently_rented?:boolean };
export type GeneralInventory = { summary?:RentalInventory['summary']; categories:RentalCategory[]; locations:Location[]; items:GeneralItem[] };
export type SaleStock = { id:string; variant:RentalVariant; location:Location; quantity:number; price:number|null; notes:string|null };
export type GeneralSaleInventory = { categories:RentalCategory[]; locations:Location[]; items:SaleStock[] };
export type GeneralRow = { id:string; variant:RentalVariant; units:GeneralItem[]; stocks?:SaleStock[] };
const text = (value?:string|null) => value?.trim().toLocaleLowerCase('it-IT') || null;

function variantKey(v:RentalVariant):string {
  return JSON.stringify([
      v.category.id,text(v.brand),text(v.model),v.year,
      v.ski_details && [v.ski_details.length_cm],
      v.snowboard_details && [v.snowboard_details.length_cm],
      v.boot_details && [text(v.boot_details.size_label)],
      v.helmet_details && [text(v.helmet_details.size_label)],
      v.pole_details?.height_cm ?? null,text(v.goggle_details?.lens),text(v.accessory_details?.size_label),
    ]);
}

// Le tariffe e le sedi non separano esemplari fisicamente identici.
// Tutte le caratteristiche fisiche partecipano alla chiave, compreso l'anno.
export function groupGeneralItems(items:GeneralItem[]):GeneralRow[] {
  const rows = new Map<string,GeneralRow>();
  for(const item of items){
    const v=item.variant;
    const key=variantKey(v);
    if(!rows.has(key))rows.set(key,{id:key,variant:v,units:[]});
    rows.get(key)!.units.push(item);
  }
  return [...rows.values()].sort((a,b)=>[a.variant.brand,a.variant.model,a.variant.year].join(' ').localeCompare([b.variant.brand,b.variant.model,b.variant.year].join(' '),'it',{numeric:true}));
}


export const generalSortOptions = {
  brand: 'Marca', model: 'Modello', category: 'Categoria',
  size: 'Misura / taglia', year: 'Anno', quantity: 'Quantità',
};
export type GeneralSortField = keyof typeof generalSortOptions | 'price';
export type SortDirection = 'asc' | 'desc';

export function sortGeneralRows(rows: GeneralRow[], field: GeneralSortField, direction: SortDirection): GeneralRow[] {
  const value = (row: GeneralRow): string | number | null => {
    switch (field) {
      case 'brand': return row.variant.brand;
      case 'model': return row.variant.model;
      case 'category': return row.variant.category.name;
      case 'size': {
        const label = sizeLabel(row.variant);
        return label === '—' ? null : label;
      }
      case 'year': return row.variant.year;
      case 'quantity': return rowQuantity(row);
      case 'price': return row.stocks?.reduce<number|null>((min,stock)=>stock.price==null?min:min==null?stock.price:Math.min(min,stock.price),null) ?? null;
    }
  };
  return [...rows].sort((a, b) => {
    const left = value(a), right = value(b);
    // I valori mancanti restano in fondo in entrambi i versi.
    if (left == null && right != null) return 1;
    if (right == null && left != null) return -1;
    const comparison = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left ?? '').localeCompare(String(right ?? ''), 'it', { numeric: true, sensitivity: 'base' });
    return (direction === 'asc' ? comparison : -comparison) || a.id.localeCompare(b.id, 'it', { numeric: true });
  });
}


export function groupSaleStock(items:SaleStock[]):GeneralRow[] {
  const rows=new Map<string,GeneralRow>();
  for(const stock of items){
    const id=variantKey(stock.variant);
    if(!rows.has(id))rows.set(id,{id,variant:stock.variant,units:[],stocks:[]});
    rows.get(id)!.stocks!.push(stock);
  }
  return [...rows.values()];
}

export const rowQuantity=(row:GeneralRow)=>row.stocks
  ?row.stocks.reduce((total,stock)=>total+stock.quantity,0):row.units.length;
const euros=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'});
export const salePrice=(price:number|null)=>price==null?'Da definire':euros.format(price);

export function rowSalePrice(row:GeneralRow):string {
  const stocks=row.stocks||[];
  const prices=stocks.flatMap(stock=>stock.price==null?[]:[stock.price]);
  if(!prices.length)return 'Da definire';
  const min=Math.min(...prices),max=Math.max(...prices);
  const label=min===max?salePrice(min):`${salePrice(min)} – ${salePrice(max)}`;
  return stocks.some(stock=>stock.price==null)?`${label} · altri da definire`:label;
}
