import { CalendarDays, CalendarPlus, ChartNoAxesCombined, House, Package, ReceiptText, RotateCcw, ShoppingCart, Users, Wrench, Settings2 } from 'lucide-react';

export const navigationSections = [
  {
    id: 'overview', label: 'Panoramica',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: House },
      { href: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
    ],
  },
  {
    id: 'rentals', label: 'Noleggi',
    items: [
      { href: '/operativita/noleggi', label: 'Nuovo noleggio', icon: CalendarPlus },
      { href: '/noleggi/attuali', label: 'Noleggi attuali', icon: CalendarDays },
      { href: '/noleggi', label: 'Storico noleggi', icon: CalendarDays },
    ],
  },
  {
    id: 'operations', label: 'Operatività',
    items: [
      { href: '/operativita/rientri', label: 'Rientri', icon: RotateCcw },
      { href: '/operativita/riparazioni', label: 'Riparazioni', icon: Wrench },
    ],
  },
  {
    id: 'sales', label: 'Vendite',
    items: [
      { href: '/operativita/vendite', label: 'Nuova vendita', icon: ShoppingCart },
      { href: '/vendite', label: 'Storico vendite', icon: ReceiptText },
    ],
  },
  {
    id: 'directory', label: 'Anagrafica',
    items: [
      { href: '/clienti', label: 'Clienti', icon: Users },
    ],
  },
  {
    id: 'inventory', label: 'Magazzino',
    items: [
      { href: '/magazzino-sede', label: 'Magazzino sede', icon: Package },
      { href: '/magazzino-generale', label: 'Magazzino generale', icon: Package },
    ],
  },
  {
    id: 'management', label: 'Amministrazione',
    items: [
      { href: '/management', label: 'Gestione', icon: Settings2 },
    ],
  },
];

export const navigation = navigationSections.flatMap((section) => section.items);


export function getNavigationSections(locationName?: string) {
  return navigationSections.map(section => section.id === 'inventory'
    ? { ...section, items: section.items.map(item => item.href === '/magazzino-sede'
      ? { ...item, label: locationName ? `Magazzino ${locationName}` : 'Magazzino sede' }
      : item) }
    : section);
}
