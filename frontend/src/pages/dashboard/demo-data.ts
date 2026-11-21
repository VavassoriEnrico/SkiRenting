import {
  Banknote, CalendarCheck, CircleCheck, Clock3, CreditCard,
  Package, RotateCcw, TrendingUp, UserCheck, Users, Wrench,
} from 'lucide-react';

export const operationalSections = [
  {
    id: 'rentals', title: 'Noleggi', subtitle: 'Il punto sulle attività della giornata', tone: 'sky',
    items: [
      { label: 'Noleggi attivi', value: '48', detail: 'Attrezzatura attualmente in uso', icon: CalendarCheck },
      { label: 'Ritiri previsti', value: '12', detail: 'Prenotazioni in partenza oggi', icon: Clock3 },
      { label: 'Rientri previsti', value: '18', detail: 'Restituzioni attese oggi', icon: RotateCcw },
    ],
  },
  {
    id: 'equipment', title: 'Attrezzatura', subtitle: 'Disponibilità e stato del parco noleggio', tone: 'amber',
    items: [
      { label: 'Articoli totali', value: '240', detail: 'Sci, snowboard e accessori', icon: Package },
      { label: 'Disponibili', value: '176', detail: 'Pronti per il prossimo noleggio', icon: CircleCheck },
      { label: 'In manutenzione', value: '16', detail: 'In preparazione o riparazione', icon: Wrench },
    ],
  },
  {
    id: 'customers', title: 'Clienti', subtitle: 'Una panoramica dei clienti del noleggio', tone: 'fuchsia',
    items: [
      { label: 'Clienti registrati', value: '1.284', detail: 'Anagrafiche complessive', icon: Users },
      { label: 'Nuovi clienti', value: '32', detail: 'Negli ultimi 7 giorni', icon: UserCheck },
      { label: 'Clienti abituali', value: '386', detail: 'Con almeno due noleggi', icon: Users },
    ],
  },
] as const;

export const periods = {
  week: {
    label: 'Ultimi 7 giorni',
    revenue: '4.860 €', average: '45 €', payments: '108',
    bars: [
      { label: 'Lun', value: 12 }, { label: 'Mar', value: 9 },
      { label: 'Mer', value: 15 }, { label: 'Gio', value: 11 },
      { label: 'Ven', value: 18 }, { label: 'Sab', value: 25 }, { label: 'Dom', value: 18 },
    ],
  },
  month: {
    label: 'Ultimi 30 giorni',
    revenue: '18.720 €', average: '48 €', payments: '390',
    bars: [
      { label: '1–5', value: 52 }, { label: '6–10', value: 43 },
      { label: '11–15', value: 65 }, { label: '16–20', value: 58 },
      { label: '21–25', value: 80 }, { label: '26–30', value: 92 },
    ],
  },
} as const;

export type Period = keyof typeof periods;

export function financeCards(period: Period) {
  const data = periods[period];
  return [
    { label: 'Incassi', value: data.revenue, detail: data.label, icon: Banknote },
    { label: 'Noleggio medio', value: data.average, detail: 'Importo medio per noleggio', icon: TrendingUp },
    { label: 'Pagamenti ricevuti', value: data.payments, detail: data.label, icon: CreditCard },
  ];
}
