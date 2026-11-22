import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';

import { RentalPaymentSection } from './RentalPaymentSection';
import { emptyPayment } from './rental-payment';

function Payment({ total = '100' }: { total?: string | null }) {
  const [value, onChange] = useState(emptyPayment);
  return <RentalPaymentSection total={total} value={value} onChange={onChange} />;
}
afterEach(cleanup);
const remaining = () => screen.getByText('Residuo da pagare').closest('div')!;
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Pagamento del noleggio', () => {
  it('shows the section immediately but requires a complete price quote', () => {
    render(<Payment total={null} />);
    expect(screen.getByRole('heading', { name: 'Pagamento' })).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText(/Completa il riepilogo/)).toBeTruthy();
  });

  it('marks pay later complete without requesting payment details', () => {
    render(<Payment />);
    fireEvent.click(screen.getByRole('radio', { name: 'Paga dopo' }));
    expect(screen.queryByLabelText('Metodo di pagamento')).toBeNull();
    expect(remaining().textContent?.replace(/\s/g, '')).toContain('100,00€');
  });

  it('collects deposit, method and time and keeps the entered values', () => {
    render(<Payment />);
    fireEvent.click(screen.getByRole('radio', { name: 'Acconto' }));
    change('Importo ricevuto (€)', '30');
    change('Metodo di pagamento', 'Carta');
    change('Data e ora del pagamento', '2026-11-21T15:00');
    expect(remaining().textContent?.replace(/\s/g, '')).toContain('70,00€');
    expect((screen.getByLabelText('Metodo di pagamento') as HTMLSelectElement).value).toBe('Carta');
    expect((screen.getByLabelText('Importo ricevuto (€)') as HTMLInputElement).value).toBe('30');
  });

  it('updates the full payment when the quote changes and suspends it while prices are missing', () => {
    const view = render(<Payment />);
    fireEvent.click(screen.getByRole('radio', { name: 'Saldo completo' }));
    change('Metodo di pagamento', 'Contanti');
    view.rerender(<Payment total="80.50" />);
    const amount = screen.getByLabelText('Importo ricevuto (€)') as HTMLInputElement;
    expect(amount.value).toBe('80.50');
    expect(amount.readOnly).toBe(true);
    expect(within(remaining()).getByText(/0,00/)).toBeTruthy();
    view.rerender(<Payment total={null} />);
    expect(screen.queryByLabelText('Importo ricevuto (€)')).toBeNull();
    view.rerender(<Payment total="60" />);
    expect((screen.getByLabelText('Importo ricevuto (€)') as HTMLInputElement).value).toBe('60.00');
  });

  it('flags a deposit that exceeds a changed total without silently modifying the amount', () => {
    const view = render(<Payment />);
    fireEvent.click(screen.getByRole('radio', { name: 'Acconto' }));
    change('Importo ricevuto (€)', '50'); change('Metodo di pagamento', 'Bonifico');
    view.rerender(<Payment total="40" />);
    expect(screen.getByText(/L’acconto deve essere/)).toBeTruthy();
    expect((screen.getByLabelText('Importo ricevuto (€)') as HTMLInputElement).value).toBe('50');
    expect(remaining().textContent).toContain('—');
  });

  it('does not prepare a zero-value payment for a free rental', () => {
    render(<Payment total="0.00" />);
    expect(screen.getByText(/non c’è alcun pagamento/)).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(within(remaining()).getByText(/0,00/)).toBeTruthy();
  });
});
