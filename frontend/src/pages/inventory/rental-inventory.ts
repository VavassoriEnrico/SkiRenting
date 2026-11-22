import type { OpenRepair } from '../repairs/repair';

export type RentalCategory = { id: string; code: string; name: string };
type LengthDetails = { length_cm: number | null; radius_m: number | null; style: string | null };
export type RentalVariant = {
  id: string; brand: string; model: string; year: number | null; notes: string | null;
  category: RentalCategory;
  ski_details: LengthDetails | null;
  snowboard_details: LengthDetails | null;
  boot_details: { size_label: string | null; size_system: string; shoe_size_eu: string | null; foot_length_cm: number | null; sole_length_mm: number | null } | null;
  helmet_details: { size_label: string | null; color: string | null } | null;
  pole_details: { height_cm: number | null } | null;
  goggle_details: { lens: string | null } | null;
  accessory_details: { size_label: string | null } | null;
};
export type RentalItem = {
  open_repair?: OpenRepair | null;
  id: string; code: string; serial_number: string | null;
  purchase_price?: number | null; legacy_sold_price?: number | null;
  status: 'active' | 'maintenance' | 'retired' | 'sold' | 'lost';
  is_rentable: boolean; is_bookable: boolean; notes: string | null;
  group: { id: string; name: string }; variant: RentalVariant;
};
export type RentalInventory = { categories: RentalCategory[]; items: RentalItem[] };
export type RentalRow = { id: string; variant: RentalVariant; group: RentalItem['group']; units: RentalItem[] };

export const rentalStatuses: Record<RentalItem['status'], string> = {
  active: 'Attivo', maintenance: 'In manutenzione', retired: 'Dismesso', sold: 'Venduto', lost: 'Smarrito',
};
export const isRentable = (item: RentalItem) => item.status === 'active' && item.is_rentable;
export const measure = (value: number | null | undefined, unit: string) => value == null ? '—' : `${value.toLocaleString('it-IT')} ${unit}`;
export function sizeLabel(variant: RentalVariant) {
  const length = variant.ski_details || variant.snowboard_details;
  if (length) return measure(length.length_cm, 'cm');
  if (variant.boot_details) return variant.boot_details.size_label || '—';
  if (variant.pole_details) return measure(variant.pole_details.height_cm, 'cm');
  return variant.helmet_details?.size_label || variant.accessory_details?.size_label || '—';
}
export function groupRentalItems(items: RentalItem[]): RentalRow[] {
  const rows = new Map<string, RentalRow>();
  for (const item of items) {
    const id = `${item.variant.id}:${item.group.id}`;
    if (!rows.has(id)) rows.set(id, { id, variant: item.variant, group: item.group, units: [] });
    rows.get(id)!.units.push(item);
  }
  return [...rows.values()].sort((a, b) => (
    `${a.variant.brand} ${a.variant.model} ${sizeLabel(a.variant)} ${a.group.name}`
      .localeCompare(`${b.variant.brand} ${b.variant.model} ${sizeLabel(b.variant)} ${b.group.name}`, 'it', { numeric: true })
  ));
}
export function variantFields(v: RentalVariant) {
  const fields = [{ label: 'Marca', value: v.brand }, { label: 'Modello', value: v.model }];
  const length = v.ski_details || v.snowboard_details;
  if (length) fields.push(
    { label: 'Lunghezza', value: measure(length.length_cm, 'cm') },
    { label: 'Raggio', value: measure(length.radius_m, 'm') },
    { label: 'Tipo tecnico', value: length.style || '—' },
  );
  if (v.boot_details) fields.push(
    { label: 'Misura originale', value: v.boot_details.size_label || '—' },
    { label: 'Sistema taglia', value: ({ unknown: 'Non specificato', mondopoint: 'Mondopoint', eu: 'EU', uk: 'UK', us: 'US' })[v.boot_details.size_system] || v.boot_details.size_system },
    { label: 'Taglia (scarpe EU)', value: v.boot_details.shoe_size_eu || '—' },
    { label: 'Taglia (cm)', value: measure(v.boot_details.foot_length_cm, 'cm') },
    { label: 'Lunghezza suola', value: measure(v.boot_details.sole_length_mm, 'mm') },
  );
  if (v.helmet_details) fields.push(
    { label: 'Taglia', value: v.helmet_details.size_label || '—' },
    { label: 'Colore', value: v.helmet_details.color || '—' },
  );
  if (v.pole_details) fields.push({ label: 'Altezza', value: measure(v.pole_details.height_cm, 'cm') });
  if (v.goggle_details) fields.push({ label: 'Lente', value: v.goggle_details.lens || '—' });
  if (v.accessory_details) fields.push({ label: 'Taglia', value: v.accessory_details.size_label || '—' });
  fields.push({ label: 'Anno originale', value: v.year?.toString() || '—' }, { label: 'Note modello', value: v.notes || '—' });
  return fields;
}
