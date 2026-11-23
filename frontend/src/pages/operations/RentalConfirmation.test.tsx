import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OperationsPage } from './OperationsPage';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), confirm: vi.fn() }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ session: { access_token: 'token' }, location: { id: 'site-a', name: 'Madesimo' } }) }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get, apiPost: mocks.post, apiPatch: mocks.patch }));
const customer = { id: 'customer', first_name: 'Mario', last_name: 'Rossi', email: null, phone: null, notes: null };
const item = {
  id: 'item-one', code: '+001', status: 'active', is_rentable: true, is_bookable: true,
  group: { id: 'race', name: 'RACE' }, variant: {
    id: 'variant', brand: 'Marca', model: 'Modello', year: null,
    category: { id: 'ski', code: 'ski', name: 'Sci' }, ski_details: { length_cm: 164 },
    snowboard_details: null, boot_details: null, helmet_details: null, pole_details: null, goggle_details: null, accessory_details: null,
  },
};
const saved = { id: 'booking', booking_number: 125, starts_on: '2026-12-01', ends_on: '2026-12-03', status: 'confirmed', total: '48.00', paid_amount: '0', balance: '48.00' };
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
beforeEach(() => {
  mocks.get.mockReset().mockImplementation((path: string) => Promise.resolve(path === '/customers' ? [customer] : path === '/hotels' ? [] : { categories: [item.variant.category], items: [item] }));
  mocks.confirm.mockReset().mockResolvedValue(saved);
  mocks.patch.mockReset().mockImplementation((_path:string,_token:string,data:object)=>Promise.resolve({...customer,...data}));
  mocks.post.mockReset().mockImplementation((path: string, token: string, data: { starts_on: string; ends_on: string }, signal: AbortSignal) => {
    if (path.endsWith('/rental-bookings')) return mocks.confirm(path, token, data, signal);
    return Promise.resolve({ ...data, days: 3, items: [{ inventory_id: item.id, code: item.code, brand: 'Marca', model: 'Modello', group_name: 'RACE', daily_price: '16', amount: '48' }],
      hotel: null, discount_percent: '0', subtotal: '48', discount_amount: '0', total: '48.00', missing_rate_codes: [] });
  });
});
afterEach(cleanup);

async function fillRental() {
  render(<OperationsPage mode="rental" />);
  await screen.findByRole('button', { name: 'Aggiungi codice' });
  change('Cognome *', 'Rossi');
  fireEvent.click(screen.getByRole('button', { name: /Rossi Mario/ }));
  change('Data di inizio *', '2026-12-01'); change('Rientro previsto *', '2026-12-03');
  await screen.findByRole('button', { name: 'Aggiungi codice' });
  change('Codice materiale', '+001');
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi codice' }));
  await screen.findByRole('radio', { name: 'Paga dopo' });
}

describe('Conferma noleggio', () => {
  it('requires valid pricing and payment choice, then confirms pay later with no payment row', async () => {
    await fillRental();
    change('Note prenotazione', ' Ritiro alle 9\nDue persone ');
    expect((screen.getByRole('button', { name: 'Conferma noleggio' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Paga dopo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Conferma noleggio' }));
    await screen.findByRole('heading', { name: 'Noleggio n. 125 confermato' });
    const [path, token, body] = mocks.confirm.mock.calls[0];
    expect(path).toBe('/locations/site-a/rental-bookings'); expect(token).toBe('token');
    expect(body).toMatchObject({ customer_id: 'customer', inventory_ids: ['item-one'], expected_total: '48.00', payment: null, notes: 'Ritiro alle 9\nDue persone' });
    expect(body.booking_id).toMatch(/^[0-9a-f-]{36}$/);
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo noleggio' }));
    await screen.findByRole('button', { name: 'Conferma noleggio' });
    for (const title of ['Dati del cliente', 'Periodo e albergo', 'Materiale', 'Riepilogo', 'Pagamento']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
      expect(screen.queryByRole('button', { name: title })).toBeNull();
    }
    expect((screen.getByLabelText('Cognome *') as HTMLInputElement).value).toBe('');
  });

  it('sends deposit details, prevents double confirmation and shows saved amounts', async () => {
    let complete!: (value: typeof saved) => void;
    mocks.confirm.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await fillRental();
    fireEvent.click(screen.getByRole('radio', { name: 'Acconto' }));
    change('Importo ricevuto (€)', '20'); change('Metodo di pagamento', 'Carta');
    change('Data e ora del pagamento', '2026-11-21T14:30');
    const button = screen.getByRole('button', { name: 'Conferma noleggio' });
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.confirm.mock.calls[0][2].payment).toMatchObject({ amount: '20.00', payment_method: 'Carta', paid_at_local: '2026-11-21T14:30' });
    await act(async () => complete({ ...saved, paid_amount: '20', balance: '28' }));
    await screen.findByRole('heading', { name: 'Noleggio n. 125 confermato' });
    expect(screen.getByText('Da saldare').parentElement?.textContent?.replace(/\s/g, '')).toContain('28,00€');
  });

  it('preserves the draft and reuses the same ID after a failed or uncertain request', async () => {
    mocks.confirm.mockRejectedValueOnce(new Error('Connessione interrotta'));
    await fillRental(); fireEvent.click(screen.getByRole('radio', { name: 'Paga dopo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Conferma noleggio' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Articoli selezionati (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Conferma noleggio' }));
    await screen.findByRole('heading', { name: 'Noleggio n. 125 confermato' });
    expect(mocks.confirm.mock.calls[0][2].booking_id).toBe(mocks.confirm.mock.calls[1][2].booking_id);
  });

  it('invalidates payment confirmation immediately when the selected period changes', async () => {
    await fillRental(); fireEvent.click(screen.getByRole('radio', { name: 'Paga dopo' }));
    const button = screen.getByRole('button', { name: 'Conferma noleggio' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    change('Rientro previsto *', '2026-12-04');
    expect(button.disabled).toBe(true);
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});


it('persists edited contacts before confirming the rental with the existing customer ID', async () => {
  await fillRental();
  change('Cellulare','+39 1234'); change('Email','aggiornata@example.test');
  fireEvent.click(screen.getByRole('radio',{name:'Paga dopo'}));
  fireEvent.click(screen.getByRole('button',{name:'Conferma noleggio'}));
  await screen.findByRole('heading',{name:'Noleggio n. 125 confermato'});
  expect(mocks.patch).toHaveBeenCalledWith('/customers/customer','token',{phone:'+39 1234',email:'aggiornata@example.test'},expect.any(AbortSignal));
  expect(mocks.patch.mock.invocationCallOrder[0]).toBeLessThan(mocks.confirm.mock.invocationCallOrder[0]);
  expect(mocks.confirm.mock.calls[0][2].customer_id).toBe('customer');
});

it('does not confirm the rental if updated customer contacts cannot be saved', async () => {
  mocks.patch.mockRejectedValueOnce(new Error('Email non valida'));
  await fillRental();change('Email','nonvalida');
  fireEvent.click(screen.getByRole('radio',{name:'Paga dopo'}));
  fireEvent.click(screen.getByRole('button',{name:'Conferma noleggio'}));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','Email non valida');
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('nonvalida');
});
