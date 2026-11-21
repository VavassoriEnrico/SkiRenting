import type { Category } from '../inventory/demo-data';

export type Sale = {
  id: string;
  item: { id: string; brand: string; name: string; category: Category };
  priceCents: number;
  date: string;
  customer: { id: string; firstName: string; lastName: string; email: string; phone: string };
  paymentMethod: string;
};

// Dati dimostrativi. I metodi di pagamento effettivi saranno concordati in seguito.
export const demoSales: Sale[] = [
  { id: 'VEN-0008', item: { id: '000125', brand: 'Rossignol', name: 'Sci all mountain · 170 cm', category: 'ski' }, priceCents: 39900, date: '2026-11-06T15:30:00+01:00', customer: { id: 'CLI-0001', firstName: 'Giulia', lastName: 'Rossi', email: 'giulia.rossi@example.com', phone: '+39 320 000 0001' }, paymentMethod: 'Carta' },
  { id: 'VEN-0007', item: { id: '000248', brand: 'Burton', name: 'Snowboard all mountain · 155 cm', category: 'snowboard' }, priceCents: 32900, date: '2026-11-06T11:45:00+01:00', customer: { id: 'CLI-0002', firstName: 'Marco', lastName: 'Bianchi', email: 'marco.bianchi@example.com', phone: '+39 320 000 0002' }, paymentMethod: 'Contanti' },
  { id: 'VEN-0006', item: { id: '000312', brand: 'Salomon', name: 'Scarponi sci · MP 27.5', category: 'boots' }, priceCents: 21900, date: '2026-11-05T16:20:00+01:00', customer: { id: 'CLI-0003', firstName: 'Anna', lastName: 'Verdi', email: 'anna.verdi@example.com', phone: '+39 320 000 0003' }, paymentMethod: 'Carta' },
  { id: 'VEN-0005', item: { id: '000419', brand: 'LEKI', name: 'Bastoncini alluminio · 120 cm, paio', category: 'poles' }, priceCents: 3900, date: '2026-11-05T10:10:00+01:00', customer: { id: 'CLI-0004', firstName: 'Luca', lastName: 'Ferrari', email: 'luca.ferrari@example.com', phone: '+39 320 000 0004' }, paymentMethod: 'Contanti' },
  { id: 'VEN-0004', item: { id: '000532', brand: 'Atomic', name: 'Casco regolabile · M', category: 'helmet' }, priceCents: 6900, date: '2026-11-04T14:05:00+01:00', customer: { id: 'CLI-0001', firstName: 'Giulia', lastName: 'Rossi', email: 'giulia.rossi@example.com', phone: '+39 320 000 0001' }, paymentMethod: 'Carta' },
  { id: 'VEN-0003', item: { id: '000647', brand: 'Oakley', name: 'Maschera da sci · adulto', category: 'goggles' }, priceCents: 5900, date: '2026-11-03T17:40:00+01:00', customer: { id: 'CLI-0005', firstName: 'Sofia', lastName: 'Conti', email: 'sofia.conti@example.com', phone: '+39 320 000 0005' }, paymentMethod: 'Carta' },
  { id: 'VEN-0002', item: { id: '000751', brand: 'Ortovox', name: 'Kit ARTVA, pala e sonda', category: 'avalanche' }, priceCents: 29900, date: '2026-11-02T12:00:00+01:00', customer: { id: 'CLI-0006', firstName: 'Andrea', lastName: 'Moretti', email: 'andrea.moretti@example.com', phone: '+39 320 000 0006' }, paymentMethod: 'Contanti' },
  { id: 'VEN-0001', item: { id: '000863', brand: 'TSL', name: 'Ciaspole con alzatacco · paio', category: 'snowshoes' }, priceCents: 12900, date: '2026-11-01T09:15:00+01:00', customer: { id: 'CLI-0007', firstName: 'Elena', lastName: 'Galli', email: 'elena.galli@example.com', phone: '+39 320 000 0007' }, paymentMethod: 'Carta' },
];
