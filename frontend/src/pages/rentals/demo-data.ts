export const rentalStatuses = {
  confirmed: 'Confermato',
  active: 'In corso',
  completed: 'Completato',
  cancelled: 'Annullato',
} as const;

export type RentalStatus = keyof typeof rentalStatuses;

export type Rental = {
  id: string;
  customer: string;
  email: string;
  equipment: string;
  equipmentDetail: string;
  start: string;
  end: string;
  status: RentalStatus;
  total: number;
};

// Esempi di presentazione: non rappresentano prenotazioni reali.
export const demoRentals: Rental[] = [
  { id: 'NOL-0000', customer: 'Paolo Riva', email: 'paolo.riva@example.com', equipment: 'Set sci adulto', equipmentDetail: 'Sci, scarponi e bastoncini', start: '2026-11-03', end: '2026-11-05', status: 'active', total: 105 },
  { id: 'NOL-0006', customer: 'Giulia Rossi', email: 'giulia.rossi@example.com', equipment: 'Set sci adulto', equipmentDetail: 'Sci, scarponi e bastoncini', start: '2026-11-08', end: '2026-11-10', status: 'confirmed', total: 105 },
  { id: 'NOL-0005', customer: 'Marco Bianchi', email: 'marco.bianchi@example.com', equipment: 'Snowboard adulto', equipmentDetail: 'Snowboard e scarponi', start: '2026-11-07', end: '2026-11-08', status: 'confirmed', total: 80 },
  { id: 'NOL-0004', customer: 'Anna Verdi', email: 'anna.verdi@example.com', equipment: 'Set sci bambino', equipmentDetail: 'Sci, scarponi, bastoncini e casco', start: '2026-11-05', end: '2026-11-07', status: 'active', total: 60 },
  { id: 'NOL-0003', customer: 'Luca Ferrari', email: 'luca.ferrari@example.com', equipment: 'Set sci adulto', equipmentDetail: 'Sci, scarponi e bastoncini', start: '2026-11-06', end: '2026-11-06', status: 'active', total: 35 },
  { id: 'NOL-0002', customer: 'Sofia Conti', email: 'sofia.conti@example.com', equipment: 'Snowboard adulto', equipmentDetail: 'Snowboard e scarponi', start: '2026-11-02', end: '2026-11-04', status: 'completed', total: 120 },
  { id: 'NOL-0001', customer: 'Andrea Moretti', email: 'andrea.moretti@example.com', equipment: 'Set sci adulto', equipmentDetail: 'Sci, scarponi e bastoncini', start: '2026-11-01', end: '2026-11-02', status: 'cancelled', total: 70 },
];
