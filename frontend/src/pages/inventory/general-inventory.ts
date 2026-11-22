import { sizeLabel } from './rental-inventory';
import type { Location } from '../../lib/api';
import type { RentalCategory, RentalItem, RentalVariant } from './rental-inventory';

export type GeneralItem = RentalItem & { location:Location };
export type GeneralInventory = { categories:RentalCategory[]; locations:Location[]; items:GeneralItem[] };
export type GeneralRow = { id:string; variant:RentalVariant; units:GeneralItem[] };
const text = (value?:string|null) => value?.trim().toLocaleLowerCase('it-IT') || null;

// Le tariffe e le sedi non separano esemplari fisicamente identici.
// Tutte le caratteristiche fisiche partecipano alla chiave, compreso l'anno.
export function groupGeneralItems(items:GeneralItem[]):GeneralRow[] {
  const rows = new Map<string,GeneralRow>();
  for(const item of items){
    const v=item.variant;
    const key=JSON.stringify([
      v.category.id,text(v.brand),text(v.model),v.year,
      v.ski_details && [v.ski_details.length_cm,v.ski_details.radius_m,text(v.ski_details.style)],
      v.snowboard_details && [v.snowboard_details.length_cm,v.snowboard_details.radius_m,text(v.snowboard_details.style)],
      v.boot_details && [text(v.boot_details.size_label),text(v.boot_details.size_system),text(v.boot_details.shoe_size_eu),v.boot_details.foot_length_cm,v.boot_details.sole_length_mm],
      v.helmet_details && [text(v.helmet_details.size_label),text(v.helmet_details.color)],
      v.pole_details?.height_cm ?? null,text(v.goggle_details?.lens),text(v.accessory_details?.size_label),
    ]);
    if(!rows.has(key))rows.set(key,{id:key,variant:v,units:[]});
    rows.get(key)!.units.push(item);
  }
  return [...rows.values()].sort((a,b)=>[a.variant.brand,a.variant.model,a.variant.year].join(' ').localeCompare([b.variant.brand,b.variant.model,b.variant.year].join(' '),'it',{numeric:true}));
}


export const generalSortOptions = {
  brand: 'Marca', model: 'Modello', category: 'Categoria',
  size: 'Misura / taglia', year: 'Anno', quantity: 'Quantità',
};
export type GeneralSortField = keyof typeof generalSortOptions;
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
      case 'quantity': return row.units.length;
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
