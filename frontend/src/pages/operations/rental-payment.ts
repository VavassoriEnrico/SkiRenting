export type PaymentMode = '' | 'later' | 'deposit' | 'full';
export type RentalPaymentDraft = {
  mode: PaymentMode;
  amount: string;
  method: string;
  other_method: string;
  paid_at_local: string;
  notes: string;
};

export const emptyPayment: RentalPaymentDraft = {
  mode: '', amount: '', method: '', other_method: '', paid_at_local: '', notes: '',
};

export function moneyToCents(value: string | null): number | null {
  if (value === null) return null;
  const normalized = value.trim().replace(',', '.');
  if (!/^(?:\d+|\d*\.\d{1,2})$/.test(normalized)) return null;
  const [euros, fraction = ''] = normalized.split('.');
  const cents = Number(euros || '0') * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function italianPaymentTime(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (key: string) => parts.find((part) => part.type === key)!.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}

function validPaymentTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(`${value}:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 16) === value;
}

export function paymentSummary(draft: RentalPaymentDraft, total: string | null) {
  const totalCents = moneyToCents(total);
  const method = (draft.method === 'Altro' ? draft.other_method : draft.method).trim();
  const issues: string[] = [];
  if (totalCents === null) return { totalCents, amountCents: null, remainingCents: null, complete: false, issues, method };
  if (totalCents === 0 || draft.mode === 'later') {
    return { totalCents, amountCents: 0, remainingCents: totalCents, complete: true, issues, method: '' };
  }
  if (!draft.mode) return { totalCents, amountCents: null, remainingCents: null, complete: false, issues, method };
  const amountCents = draft.mode === 'full' ? totalCents : moneyToCents(draft.amount);
  const validAmount = amountCents !== null && amountCents > 0 && amountCents <= 999999999999
    && (draft.mode === 'full' || amountCents < totalCents);
  if (!validAmount) issues.push(draft.mode === 'deposit'
    ? 'L’acconto deve essere maggiore di zero e inferiore al totale, con massimo due decimali.'
    : 'L’importo del pagamento supera il limite consentito.');
  if (!method) issues.push('Indica il metodo di pagamento.');
  if (!validPaymentTime(draft.paid_at_local)) issues.push('Indica una data e ora di pagamento valide.');
  return {
    totalCents, amountCents: validAmount ? amountCents : null,
    remainingCents: validAmount ? totalCents - amountCents! : null,
    complete: issues.length === 0, issues, method,
  };
}
