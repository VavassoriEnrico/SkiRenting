import type { Category } from '../inventory/demo-data';

export type Sale = {
  id: string;
  item: { id: string; brand: string; name: string; category: Category };
  priceCents: number;
  date: string;
  customer: { id: string; firstName: string; lastName: string; email: string; phone: string };
  paymentMethod: string;
};

// Elenco vuoto fino al collegamento allo storico reale.
export const sales: Sale[] = [];
