export const skillLevels = { beginner: 'Principiante', intermediate: 'Intermedio', expert: 'Esperto' } as const;
export type SkillLevel = keyof typeof skillLevels;

export type Customer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_legacy?: boolean;
  booking_count?: number;
  birth_date?: string | null;
  skill_level?: SkillLevel | null;
  language?: string | null;
  country_code?: string | null;
};

export function normalizeCustomerText(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('it-IT');
}

export const customerBirthDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : '—';

export const customerSortOptions = {
  last_name: 'Cognome', first_name: 'Nome', booking_count: 'Numero di prenotazioni',
  age: 'Età', email: 'Email', phone: 'Telefono', notes: 'Note',
};
export type CustomerSortField = keyof typeof customerSortOptions;
export type CustomerSortDirection = 'asc' | 'desc';
const customerCollator = new Intl.Collator('it', { numeric: true, sensitivity: 'base' });

export function sortCustomers(customers: Customer[], field: CustomerSortField, direction: CustomerSortDirection): Customer[] {
  const value = (customer: Customer): string | number | null => {
    if (field === 'booking_count') return customer.booking_count ?? null;
    // Una nascita più recente corrisponde a un'età minore, anche a cavallo dell'anno.
    if (field === 'age') {
      const birth = customer.birth_date ? Date.parse(`${customer.birth_date}T00:00:00Z`) : NaN;
      return Number.isFinite(birth) ? -birth : null;
    }
    return customer[field]?.trim() || null;
  };
  return [...customers].sort((a, b) => {
    const left = value(a), right = value(b);
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    const comparison = typeof left === 'number' && typeof right === 'number'
      ? left - right : customerCollator.compare(String(left ?? ''), String(right ?? ''));
    return (direction === 'asc' ? comparison : -comparison)
      || customerCollator.compare(a.last_name, b.last_name)
      || customerCollator.compare(a.first_name, b.first_name)
      || customerCollator.compare(a.id, b.id);
  });
}
