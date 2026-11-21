import { categories } from '../inventory/demo-data';
import type { Category } from '../inventory/demo-data';
import type { Sale } from './demo-data';

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const date = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome' });

export const formatPrice = (cents: number) => currency.format(cents / 100);
export const formatSaleDate = (value: string) => date.format(new Date(value));
export const customerName = (sale: Sale) => `${sale.customer.firstName} ${sale.customer.lastName}`;
export const categoryName = (category: Category) => categories.find((item) => item.id === category)!.label;

export function filterSales(sales: Sale[], query: string, category: Category | 'all') {
  const text = query.trim().toLocaleLowerCase('it-IT');
  const phoneQuery = text.replace(/[\s()+.\-]/g, '');
  return sales.filter((sale) => {
    const searchable = `${customerName(sale)} ${sale.customer.lastName} ${sale.customer.firstName} ${sale.customer.email} ${sale.customer.phone} ${sale.id} ${sale.item.id}`.toLocaleLowerCase('it-IT');
    const phone = sale.customer.phone.replace(/[\s()+.\-]/g, '');
    return (category === 'all' || sale.item.category === category)
      && (searchable.includes(text) || (/^\d+$/.test(phoneQuery) && phone.includes(phoneQuery)));
  });
}
