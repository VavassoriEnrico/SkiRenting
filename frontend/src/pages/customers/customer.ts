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
