import { CalendarDays, CalendarPlus, ChartNoAxesCombined, House, Package, ReceiptText, RotateCcw, ShoppingBag, ShoppingCart } from 'lucide-react';

export const navigationSections = [
  {
    id: 'overview', label: 'Panoramica',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: House },
      { href: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
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
    ],
  },
  {
    id: 'inventory', label: 'Magazzino',
    items: [
      { href: '/materiale-noleggio', label: 'Magazzino noleggio', icon: Package },
      { href: '/materiale-vendita', label: 'Magazzino vendita', icon: ShoppingBag },
    ],
  },
];

export const navigation = navigationSections.flatMap((section) => section.items);
