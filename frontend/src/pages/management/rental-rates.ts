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

export type RateKey = typeof rateColumns[number]['key'];
export type RatePrices = Record<RateKey, number | null>;
export type RateDraft = Record<RateKey, string>;
export type RentalRate = RatePrices & { id: string; group_id: string; group: { id: string; name: string; category: RentalCategory } };
export type RentalRateList = { categories: RentalCategory[]; rates: RentalRate[] };

export function draftFromRate(rate: RentalRate): RateDraft {
  return Object.fromEntries(rateColumns.map(({ key }) => [key, rate[key] == null ? '' : String(rate[key])])) as RateDraft;
}
export function pricesFromDraft(draft: RateDraft): RatePrices {
  return Object.fromEntries(rateColumns.map(({ key }) => [key, draft[key] === '' ? null : Number(draft[key])])) as RatePrices;
}
