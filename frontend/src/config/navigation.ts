import { CalendarDays, CalendarPlus, ChartNoAxesCombined, House, Package, ReceiptText, RotateCcw, ShoppingBag, ShoppingCart, Users, Wrench, Settings2 } from 'lucide-react';

export const navigationSections = [
  {
    id: 'overview', label: 'Panoramica',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: House },
      { href: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
    ],
  },
  {
    id: 'directory', label: 'Anagrafica',
    items: [
      { href: '/clienti', label: 'Clienti', icon: Users },
    ],
  },
  {
    id: 'history', label: 'Storico',
    items: [
      { href: '/vendite', label: 'Vendite', icon: ReceiptText },
      { href: '/noleggi', label: 'Noleggi', icon: CalendarDays },
    ],
  },
  {
    id: 'operations', label: 'Operatività',
    items: [
      { href: '/operativita/noleggi', label: 'Noleggi', icon: CalendarPlus },
      { href: '/operativita/vendite', label: 'Vendite', icon: ShoppingCart },
      { href: '/operativita/rientri', label: 'Rientri', icon: RotateCcw },
      { href: '/operativita/riparazioni', label: 'Riparazioni', icon: Wrench },
    ],
  },
  {
    id: 'general-inventory', label: 'Magazzino generale',
    items: [
      { href: '/magazzino-generale', label: 'Magazzino generale noleggi', icon: Package },
      { href: '/magazzino-generale-vendite', label: 'Magazzino generale vendite', icon: ShoppingBag },
    ],
  },
  {
    id: 'local-inventory', label: 'Magazzino sede',
    items: [
      { href: '/materiale-noleggio', label: 'Magazzino noleggi', icon: Package },
      { href: '/materiale-vendita', label: 'Magazzino vendite', icon: ShoppingBag },
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
  return navigationSections.map(section => section.id === 'local-inventory'
    ? { ...section, label: locationName ? `Magazzino ${locationName}` : 'Magazzino sede' }
    : section);
}
