import { describe, expect, it } from 'vitest';

import { emptyPayment, italianPaymentTime, moneyToCents, paymentSummary } from './rental-payment';

const deposit = { ...emptyPayment, mode: 'deposit' as const, amount: '30', method: 'Contanti', paid_at_local: '2026-11-21T14:30' };

describe('Bozza pagamento', () => {
  it('uses exact integer cents and rejects extra decimals', () => {
    expect(moneyToCents('40.80')).toBe(4080);
    expect(moneyToCents('0,10')).toBe(10);
    expect(moneyToCents('0')).toBe(0);
    expect(moneyToCents('0.001')).toBeNull();
    expect(moneyToCents('-1')).toBeNull();
  });

  it('requires an explicit choice, permits paying later and handles a free rental', () => {
    expect(paymentSummary(emptyPayment, '100').complete).toBe(false);
    expect(paymentSummary({ ...emptyPayment, mode: 'later' }, '100')).toMatchObject({ complete: true, amountCents: 0, remainingCents: 10000, method: '' });
    expect(paymentSummary(deposit, '0')).toMatchObject({ complete: true, amountCents: 0, remainingCents: 0, method: '' });
    expect(paymentSummary(deposit, null).complete).toBe(false);
  });

  it('calculates deposit and full balance without rounding errors', () => {
    expect(paymentSummary(deposit, '100')).toMatchObject({ complete: true, amountCents: 3000, remainingCents: 7000 });
    expect(paymentSummary({ ...deposit, amount: '0.10' }, '0.30')).toMatchObject({ amountCents: 10, remainingCents: 20 });
    expect(paymentSummary({ ...deposit, mode: 'full' }, '40.80')).toMatchObject({ complete: true, amountCents: 4080, remainingCents: 0 });
  });

  it.each(['0', '-1', '100', '120', '1.234'])('rejects a deposit outside its valid range: %s', (amount) => {
    const result = paymentSummary({ ...deposit, amount }, '100');
    expect(result.complete).toBe(false);
    expect(result.remainingCents).toBeNull();
  });

  it('requires method and valid calendar date, allowing a custom method', () => {
    expect(paymentSummary({ ...deposit, method: '' }, '100').complete).toBe(false);
    expect(paymentSummary({ ...deposit, paid_at_local: '' }, '100').complete).toBe(false);
    expect(paymentSummary({ ...deposit, paid_at_local: '2026-02-31T14:30' }, '100').complete).toBe(false);
    expect(paymentSummary({ ...deposit, method: 'Altro', other_method: ' Buono ' }, '100')).toMatchObject({ complete: true, method: 'Buono' });
  });

  it('creates the suggested time in Italy, including summer and winter offsets', () => {
    expect(italianPaymentTime(new Date('2026-01-01T10:00:00Z'))).toBe('2026-01-01T11:00');
    expect(italianPaymentTime(new Date('2026-07-01T10:00:00Z'))).toBe('2026-07-01T12:00');
  });
});
