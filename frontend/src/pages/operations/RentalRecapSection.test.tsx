import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RentalRecapSection } from './RentalRecapSection';
import type { RentalItem } from '../inventory/rental-inventory';

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../lib/api', () => ({ apiPost: api.post }));
const customer = { id: 'customer', first_name: 'Mario', last_name: 'Rossi', phone: null, email: null, notes: null };
const item: RentalItem = {
  id: 'item', code: '+001', serial_number: null, status: 'active', is_rentable: true, is_bookable: true, notes: null,
  group: { id: 'group', name: 'RACE' }, variant: {
    id: 'variant', brand: 'Marca', model: 'Modello', year: null,
    category: { id: 'ski', code: 'ski', name: 'Sci' }, ski_details: { length_cm: 164 },
    snowboard_details: null, boot_details: null, helmet_details: null, pole_details: null, goggle_details: null, accessory_details: null,
  },
};
const props = { token: 'token', locationId: 'site-a', customer, period: { starts_on: '2026-12-01', ends_on: '2026-12-03', hotel: 'hotel' }, equipment: [item] };
const quote = {
  starts_on: props.period.starts_on, ends_on: props.period.ends_on, days: 3,
  items: [{ inventory_id: item.id, code: item.code, brand: 'Marca', model: 'Modello', group_name: 'RACE', daily_price: '16', amount: '48' }],
  hotel: { id: 'hotel', name: 'Albergo' }, discount_percent: '15', subtotal: '48', discount_amount: '7.20', total: '40.80', missing_rate_codes: [] as string[],
};
beforeEach(() => api.post.mockReset().mockResolvedValue(quote));
afterEach(cleanup);
const total = () => screen.getByText('Totale noleggio').closest('div')!;

describe('Riepilogo noleggio', () => {
  it('loads server prices and displays the hotel discount', async () => {
    render(<RentalRecapSection {...props} />);
    await screen.findByText('Totale noleggio');
    expect(api.post).toHaveBeenCalledWith('/locations/site-a/rental-quote', 'token', {
      starts_on: '2026-12-01', ends_on: '2026-12-03', inventory_ids: ['item'], hotel_id: 'hotel',
    }, expect.any(AbortSignal));
    expect(total().textContent?.replace(/\s/g, '')).toContain('40,80€');
    expect(screen.getByText('Sconto albergo (15%)')).toBeTruthy();
  });

  it('does not calculate incomplete selections', async () => {
    render(<RentalRecapSection {...props} equipment={[]} />);
    expect(screen.getByText(/Seleziona un cliente/)).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows missing tariffs without presenting a zero total', async () => {
    api.post.mockResolvedValue({ ...quote, subtotal: null, total: null, discount_amount: null, missing_rate_codes: ['+001'], items: [{ ...quote.items[0], daily_price: null, amount: null }] });
    render(<RentalRecapSection {...props} />);
    await screen.findByText('Tariffa mancante');
    expect(total().textContent).toContain('Da completare');
  });

  it('invalidates prices immediately when dates change and ignores a late previous response', async () => {
    let complete!: (value: typeof quote) => void;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const view = render(<RentalRecapSection {...props} />);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const oldSignal = api.post.mock.calls[0][3] as AbortSignal;
    api.post.mockResolvedValue({ ...quote, ends_on: '2026-12-08', days: 8, total: '68.00' });
    view.rerender(<RentalRecapSection {...props} period={{ ...props.period, ends_on: '2026-12-08' }} />);
    expect(oldSignal.aborted).toBe(true);
    await screen.findByText('Totale noleggio');
    expect(total().textContent?.replace(/\s/g, '')).toContain('68,00€');
    await act(async () => complete(quote));
    expect(total().textContent?.replace(/\s/g, '')).toContain('68,00€');
  });

  it('retries failures and refreshes prices without saving a booking', async () => {
    api.post.mockRejectedValueOnce(new Error('Errore listino'));
    render(<RentalRecapSection {...props} />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Riprova prezzi' }));
    await screen.findByText('Totale noleggio');
    api.post.mockResolvedValue({ ...quote, total: '35' });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiorna prezzi' }));
    await screen.findByText('Totale noleggio');
    expect(within(total()).getByText(/35,00/)).toBeTruthy();
    expect(api.post.mock.calls.every(([path]) => path.endsWith('/rental-quote'))).toBe(true);
  });
});


it('shows the winning promotion instead of labelling its discount as a hotel discount', async () => {
  api.post.mockResolvedValue({...quote,starts_on:'2026-12-01',ends_on:'2026-12-01',days:1,
    promotion:{id:'promo',name:'Martedì speciale'},discount_percent:'25',subtotal:'20',discount_amount:'5.00',total:'15.00'});
  render(<RentalRecapSection {...props} period={{...props.period,ends_on:'2026-12-01'}} />);
  expect(await screen.findByText('Promozione Martedì speciale (25%)')).toBeTruthy();
  expect(screen.queryByText(/Sconto albergo/)).toBeNull();
  expect(screen.getAllByText('Albergo').length).toBeGreaterThan(0);
});
