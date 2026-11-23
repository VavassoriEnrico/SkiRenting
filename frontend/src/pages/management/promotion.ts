export const promotionWeekdays = [
  { value: 1, label: 'Lunedì' }, { value: 2, label: 'Martedì' },
  { value: 3, label: 'Mercoledì' }, { value: 4, label: 'Giovedì' },
  { value: 5, label: 'Venerdì' }, { value: 6, label: 'Sabato' }, { value: 7, label: 'Domenica' },
];
export type Promotion = {
  id: string; name: string; created_at: string; promotion_date: string | null;
  weekdays: number[]; discount_percent: number; is_active: boolean;
};
const date = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'UTC' });
const list = new Intl.ListFormat('it-IT', { type: 'conjunction' });
export function promotionPeriod(promotion: Promotion): string {
  return promotion.promotion_date ? date.format(new Date(`${promotion.promotion_date}T00:00:00Z`))
    : `Ogni ${list.format(promotionWeekdays.filter(day => promotion.weekdays.includes(day.value)).map(day => day.label.toLocaleLowerCase('it-IT')))}`;
}
