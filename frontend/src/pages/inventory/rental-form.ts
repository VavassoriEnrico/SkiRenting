import type { RentalCategory, RentalVariant } from './rental-inventory';

export type DetailType = 'ski' | 'snowboard' | 'boots' | 'helmet' | 'poles' | 'goggles' | 'accessory';
export type RentalCatalog = {
  categories: (RentalCategory & { detail_type: DetailType })[];
  groups: { id: string; category_id: string; name: string }[];
  variants: RentalVariant[];
};
export type CreatedRentalItem = { id: string; category_id: string; group_id: string; variant_id: string; code: string; created_count?: number };
export type DetailField = { key: string; label: string; type?: 'number'; max?: number; step?: string; options?: { value: string; label: string }[] };
const lengthFields: DetailField[] = [
  { key: 'length_cm', label: 'Lunghezza (cm)', type: 'number', max: 9999.99 },
];
export const detailTypes: { value: DetailType; label: string }[] = [
  { value: 'ski', label: 'Sci' }, { value: 'snowboard', label: 'Snowboard' }, { value: 'boots', label: 'Scarponi' },
  { value: 'helmet', label: 'Caschi' }, { value: 'poles', label: 'Bastoncini' }, { value: 'goggles', label: 'Maschere' },
  { value: 'accessory', label: 'Accessori (taglia)' },
];
export const detailFields: Record<DetailType, DetailField[]> = {
  ski: lengthFields, snowboard: lengthFields,
  boots: [{ key: 'size_label', label: 'Misura originale' }],
  helmet: [{ key: 'size_label', label: 'Taglia' }],
  poles: [{ key: 'height_cm', label: 'Altezza (cm)', type: 'number', max: 9999.99 }],
  goggles: [{ key: 'lens', label: 'Lente' }],
  accessory: [{ key: 'size_label', label: 'Taglia' }],
};
export function valuesFromVariant(variant: RentalVariant): Record<string, string> {
  const details = variant.ski_details || variant.snowboard_details || variant.boot_details || variant.helmet_details || variant.pole_details || variant.goggle_details || variant.accessory_details || {};
  return Object.fromEntries(Object.entries({ brand: variant.brand, model: variant.model, year: variant.year, ...details }).map(([key, value]) => [key, value == null ? '' : String(value)]));
}

export type CreatedRentalArrival = { id: string; quantity: number; items: CreatedRentalItem[] };
