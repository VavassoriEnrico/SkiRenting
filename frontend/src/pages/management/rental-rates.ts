import type { RentalCategory } from '../inventory/rental-inventory';

export const rateColumns = [
  { key: 'daily_price_1_day', label: '1 giorno' },
  { key: 'daily_price_2_days', label: '2 giorni' },
  { key: 'daily_price_3_days', label: '3 giorni' },
  { key: 'daily_price_4_days', label: '4 giorni' },
  { key: 'daily_price_5_days', label: '5 giorni' },
  { key: 'daily_price_6_days', label: '6 giorni' },
  { key: 'daily_price_7_plus_days', label: '7+ giorni' },
] as const;

export const packRateColumns = [
  { key: 'pack_price_1_day', label: '1 giorno' },
  { key: 'pack_price_2_days', label: '2 giorni' },
  { key: 'pack_price_3_days', label: '3 giorni' },
  { key: 'pack_price_4_days', label: '4 giorni' },
  { key: 'pack_price_5_days', label: '5 giorni' },
  { key: 'pack_price_6_days', label: '6 giorni' },
  { key: 'pack_price_7_plus_days', label: '7+ giorni' },
] as const;

type SingleRateKey = typeof rateColumns[number]['key'];
type PackRateKey = typeof packRateColumns[number]['key'];
export type RateKey = SingleRateKey | PackRateKey;
export type RatePrices = Record<SingleRateKey, number | null> & Partial<Record<PackRateKey, number | null>>;
export type RateDraft = Record<RateKey, string>;
export type RentalRate = RatePrices & { id: string; group_id: string; group: { id: string; name: string; category: RentalCategory } };
export type RentalRateList = { categories: RentalCategory[]; rates: RentalRate[] };

export function draftFromRate(rate: RentalRate): RateDraft {
  return Object.fromEntries([...rateColumns,...packRateColumns].map(({ key }) => [key, rate[key] == null ? '' : String(rate[key])])) as RateDraft;
}
export function pricesFromDraft(draft: RateDraft, includePack=false): RatePrices {
  const columns=includePack?[...rateColumns,...packRateColumns]:rateColumns;
  return Object.fromEntries(columns.map(({ key }) => [key, draft[key] === '' ? null : Number(draft[key])])) as RatePrices;
}

export const hasPackRates = (categoryCode:string) => ['ski','snowboard'].includes(categoryCode);
