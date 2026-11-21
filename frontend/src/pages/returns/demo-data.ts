import { demoRentals } from '../rentals/demo-data';
import type { Rental } from '../rentals/demo-data';

// Data fissa per rendere espliciti e riproducibili gli esempi della pagina.
export const demoReferenceDate = '2026-11-06';

export type ReturnItem = { code: string; name: string; returned: boolean };
export type ReturnBooking = Rental & { items: ReturnItem[] };
export type ReturnFilter = 'all' | 'today' | 'overdue' | 'upcoming' | 'partial';

const equipment: Record<string, ReturnItem[]> = {
  'NOL-0000': [
    { code: '000101', name: 'Sci adulto · 170 cm', returned: false },
    { code: '000102', name: 'Scarponi · MP 27.5', returned: false },
    { code: '000103', name: 'Bastoncini · 120 cm, paio', returned: false },
  ],
  'NOL-0003': [
    { code: '000201', name: 'Sci adulto · 165 cm', returned: false },
    { code: '000202', name: 'Scarponi · MP 26.5', returned: false },
    { code: '000203', name: 'Bastoncini · 115 cm, paio', returned: false },
  ],
  'NOL-0004': [
    { code: '000301', name: 'Sci bambino · 120 cm', returned: false },
    { code: '000302', name: 'Scarponi · MP 22.5', returned: false },
    { code: '000303', name: 'Bastoncini · 90 cm, paio', returned: false },
    { code: '000304', name: 'Casco · S', returned: true },
  ],
};

export function returnTiming(end: string, referenceDate: string) {
  if (end < referenceDate) return 'overdue';
  if (end === referenceDate) return 'today';
  return 'upcoming';
}

export const returnLabels = { overdue: 'In ritardo', today: 'Previsto oggi', upcoming: 'Prossimi giorni' };

export const demoReturns: ReturnBooking[] = demoRentals
  .filter((rental) => rental.status === 'active' && equipment[rental.id]?.some((item) => !item.returned))
  .map((rental) => ({ ...rental, items: equipment[rental.id] }))
  .sort((a, b) => a.end.localeCompare(b.end));

export const formatReturnDate = (value: string) => new Intl.DateTimeFormat('it-IT', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00Z`));

export function filterReturns(bookings: ReturnBooking[], query: string, filter: ReturnFilter, referenceDate: string) {
  const normalized = query.trim().toLocaleLowerCase('it-IT');
  return bookings.filter((booking) => {
    const text = `${booking.id} ${booking.customer} ${booking.email} ${booking.items.map((item) => `${item.code} ${item.name}`).join(' ')}`.toLocaleLowerCase('it-IT');
    const matchesFilter = filter === 'all'
      || (filter === 'partial' ? booking.items.some((item) => item.returned) : returnTiming(booking.end, referenceDate) === filter);
    return matchesFilter && text.includes(normalized);
  });
}
