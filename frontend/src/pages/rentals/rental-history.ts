import type { Customer } from '../customers/customer';

export const historyStatuses = {
  confirmed: 'Prenotato', preparing: 'In preparazione', active: 'Da restituire',
  completed: 'Concluso', awaiting_payment: 'Concluso · da saldare', cancelled: 'Annullato',
};
export type HistoryDisplayStatus = keyof typeof historyStatuses;
export type HistoryStatus = Exclude<HistoryDisplayStatus, 'awaiting_payment'>;
export type HistoryBooking = {
  id: string; booking_number: number; customer_id: string; location_id: string;
  customer: Customer; hotel: { id: string; name: string } | null;
  starts_on: string; ends_on: string; status: HistoryStatus; discount_percent: string;
  promotion_id?: string | null; promotion_name?: string | null; notes: string | null; created_by: string; created_at: string; updated_at: string;
  item_count: number; returned_item_count: number; subtotal: string; discount_amount: string; total: string; paid_amount: string; balance: string;
};
export type HistoryDetails = HistoryBooking & {
  items: { id: string; rental_inventory_id: string; code_snapshot: string; brand_snapshot: string;
    model_snapshot: string; size_snapshot: string | null; daily_price: string | null; amount: string;
    delivered_at: string | null; returned_at: string | null; created_at: string; updated_at: string }[];
  payments: { id: string; payment_method: string; amount: string; paid_at: string; created_by: string;
    notes: string | null; created_at: string }[];
};
const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const date = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const timestamp = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' });
export const historyMoney = (value: string | null) => value === null ? '—' : currency.format(Number(value));
export const historyDate = (value: string) => date.format(new Date(`${value}T00:00:00Z`));
export const historyTime = (value: string | null) => value ? timestamp.format(new Date(value)) : '—';
export function historyStatus(booking: HistoryBooking): HistoryDisplayStatus {
  if (booking.status === 'cancelled') return 'cancelled';
  const allReturned = booking.item_count > 0 && booking.returned_item_count === booking.item_count;
  if (allReturned || booking.status === 'completed') {
    return Number(booking.balance) > 0 ? 'awaiting_payment' : 'completed';
  }
  return booking.status;
}
