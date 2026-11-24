import type { SaleStock } from './general-inventory';
import type { RentalVariant } from './rental-inventory';
import type { RentalCatalog } from './rental-form';

export type SaleVariant = RentalVariant & { sale_details?: { category_label: string | null } | null };
export type SaleInventoryItem = Omit<SaleStock, 'variant'> & { variant: SaleVariant };
export type SaleCatalog = { categories: RentalCatalog['categories']; variants: SaleVariant[] };
export type SaleArrival = { id: string; inventory_id: string; variant_id: string; category_id: string; quantity_added: number; quantity: number; price: number | null };

export function filterSaleInventory(items: SaleInventoryItem[], category: string, query: string) {
  const terms = query.trim().toLocaleLowerCase('it-IT').replaceAll('.', ',').split(/\s+/);
  return items.filter(item => {
    const v = item.variant;
    const text = [v.category.name, v.brand, v.model, v.year, v.sale_details?.category_label,
      v.ski_details?.length_cm, v.snowboard_details?.length_cm, v.boot_details?.size_label,
      v.helmet_details?.size_label, v.pole_details?.height_cm, v.goggle_details?.lens,
      v.accessory_details?.size_label].join(' ').toLocaleLowerCase('it-IT').replaceAll('.', ',');
    return (!category || v.category.id === category) && terms.every(term => text.includes(term));
  });
}
