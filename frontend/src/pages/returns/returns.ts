import type { Customer } from '../customers/customer';
import type { HistoryDetails, HistoryStatus } from '../rentals/rental-history';

export type ReturnBooking = {
  id: string; booking_number: number; customer: Customer;
  total: string; paid_amount: string; balance: string;
  starts_on: string; ends_on: string; status: HistoryStatus; notes: string | null;
  items: HistoryDetails['items'];
};
export type TodayReturns = { due_on: string; bookings: ReturnBooking[] };
export const pendingItems = (booking: ReturnBooking) => booking.items.filter((item) => !item.returned_at).length;
export const todayInRome = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());

export function returnState(booking: ReturnBooking) {
  if (pendingItems(booking) > 0) return { color: 'red', label: 'Materiale ancora da restituire' };
  if (Number(booking.balance) > 0) return { color: 'yellow', label: 'Tutto rientrato · saldo da pagare' };
  return { color: 'green', label: 'Tutto rientrato e saldato' };
}
