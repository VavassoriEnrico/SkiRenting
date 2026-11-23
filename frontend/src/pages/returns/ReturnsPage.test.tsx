import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReturnsPage } from './ReturnsPage';
import type { ReturnBooking, TodayReturns } from './returns';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), auth: { session: { access_token: 'token' }, location: { id: 'site-a', name: 'Madesimo' } } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get, apiPost: mocks.post }));
const booking: ReturnBooking = {
  id: 'booking', booking_number: 125, total: '60', paid_amount: '20', balance: '40',
  customer: { id: 'customer', first_name: 'Mario', last_name: 'Rossi', email: 'mario@example.test', phone: '+39 333-001234', notes: null },
  starts_on: '2026-11-19', ends_on: '2026-11-21', status: 'confirmed', notes: 'Riconsegna nel pomeriggio',
  items: [{ id: 'line', rental_inventory_id: 'unit', code_snapshot: '+001', brand_snapshot: 'Marca', model_snapshot: 'Modello', size_snapshot: '164 cm', daily_price: '20', amount: '60', delivered_at: null, returned_at: null, created_at: '2026-11-19T08:00:00Z', updated_at: '2026-11-19T08:00:00Z' }],
};
const partial: ReturnBooking = { ...booking, id: 'partial', booking_number: 126, status: 'active', customer: { ...booking.customer, first_name: 'Anna', last_name: 'Bianchi', email: 'anna@example.test', phone: '333999999' }, items: [booking.items[0], { ...booking.items[0], id: 'returned', code_snapshot: 'H002', returned_at: '2026-11-21T08:00:00Z' }] };
const response: TodayReturns = { due_on: '2026-11-21', bookings: [booking, partial] };
beforeEach(() => {
  mocks.auth.location = { id: 'site-a', name: 'Madesimo' };
  mocks.get.mockReset().mockResolvedValue(response);
  mocks.post.mockReset();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function open() { const view = render(<ReturnsPage />); await screen.findByText('Mario Rossi'); return view; }

describe('Rientri reali previsti oggi', () => {
  it('loads the selected site, shows the server day and partial returns without other day filters', async () => {
    await open();
    expect(mocks.get).toHaveBeenCalledWith('/locations/site-a/rental-returns', 'token', expect.any(AbortSignal));
    expect(screen.getAllByText('21 nov 2026').length).toBe(3);
    expect(screen.getByText('Rientro parziale')).toBeTruthy();
    expect(screen.getByText('1 di 2 rientrati')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText('Dati dimostrativi')).toBeNull();
  });

  it.each(['ROSSI mario', 'mario@example', '333001234', '125'])('searches real customer contacts and number: %s', async (query) => {
    await open();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
    expect(screen.getByText('Mario Rossi')).toBeTruthy();
    expect(screen.queryByText('Anna Bianchi')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Azzera ricerca' }));
    expect(screen.getByText('Anna Bianchi')).toBeTruthy();
  });

  it('searches equipment codes and opens the readonly real item details', async () => {
    await open();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'H002' } });
    expect(screen.queryByText('Mario Rossi')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apri scheda rientro 126' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Noleggio n. 126' })).toBeTruthy();
    expect(within(dialog).getByText('Riconsegna nel pomeriggio')).toBeTruthy();
    expect(within(dialog).getByText('Codice H002')).toBeTruthy();
    expect(within(dialog).getByText('Da restituire')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Registra rientro' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Chiudi scheda rientro' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('distinguishes error, empty day and no search results and supports retry', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Errore rientri'));
    render(<ReturnsPage />);
    await screen.findByRole('alert');
    expect(screen.queryByText('Nessun rientro previsto oggi')).toBeNull();
    mocks.get.mockResolvedValue({ ...response, bookings: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await screen.findByText('Nessun rientro previsto oggi');
    mocks.get.mockResolvedValue(response);
    fireEvent.click(screen.getByRole('button', { name: 'Aggiorna' }));
    await screen.findByText('Mario Rossi');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'assente' } });
    expect(screen.getByText('Nessun rientro corrisponde alla ricerca')).toBeTruthy();
  });

  it('clears the previous site and ignores late responses after switching location', async () => {
    let complete!: (data: TodayReturns) => void;
    mocks.get.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const view = render(<ReturnsPage />);
    const signal = mocks.get.mock.calls[0][2] as AbortSignal;
    mocks.auth.location = { id: 'site-b', name: 'Seconda sede' };
    mocks.get.mockResolvedValue({ ...response, bookings: [] });
    view.rerender(<ReturnsPage />);
    await screen.findByText('Nessun rientro previsto oggi');
    expect(signal.aborted).toBe(true);
    await act(async () => complete(response));
    await waitFor(() => expect(screen.queryByText('Mario Rossi')).toBeNull());
  });

  it.each([
    ['red', false, '40', 'Materiale ancora da restituire'],
    ['yellow', true, '40', 'Tutto rientrato · saldo da pagare'],
    ['green', true, '0', 'Tutto rientrato e saldato'],
  ])('registers by code and opens the updated %s booking', async (color, allReturned, balance, label) => {
    await open();
    const updated = { ...booking, balance, items: allReturned ? booking.items.map((item) => ({ ...item, returned_at: '2026-11-21T10:00:00Z' })) : booking.items };
    mocks.post.mockResolvedValue(updated);
    mocks.get.mockResolvedValue({ ...response, bookings: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Registra rientro' }));
    fireEvent.change(screen.getByLabelText('Codice materiale'), { target: { value: ' +001 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferma rientro' }));
    await screen.findByRole('heading', { name: 'Noleggio n. 125' });
    const dialog = screen.getByRole('dialog');
    expect(dialog.classList.contains(`return-state-${color}`)).toBe(true);
    expect(within(dialog).getByText(label as string)).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledWith('/locations/site-a/rental-returns', 'token', { request_id: expect.any(String), code: '+001' }, expect.any(AbortSignal));
  });

  it('preserves the code and request ID for retry after an uncertain result', async () => {
    await open();
    mocks.post.mockRejectedValueOnce(new Error('Connessione interrotta')).mockResolvedValueOnce(booking);
    fireEvent.click(screen.getByRole('button', { name: 'Registra rientro' }));
    fireEvent.change(screen.getByLabelText('Codice materiale'), { target: { value: '+001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferma rientro' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Conferma rientro' }));
    await screen.findByRole('heading', { name: 'Noleggio n. 125' });
    expect(mocks.post.mock.calls[0][2].request_id).toBe(mocks.post.mock.calls[1][2].request_id);
  });

  it('keeps the scanner open and focused for successive codes with a new request ID each time', async () => {
    await open();
    const first = { ...partial, items: partial.items.map((item, index) => index === 0 ? item : { ...item, returned_at: '2026-11-21T10:00:00Z' }) };
    const last = { ...partial, balance: '0', paid_amount: '60', items: partial.items.map((item) => ({ ...item, returned_at: '2026-11-21T10:01:00Z' })) };
    mocks.post.mockResolvedValueOnce(first).mockResolvedValueOnce(last);
    fireEvent.click(screen.getByRole('button', { name: 'Registra rientro' }));
    const input = screen.getByLabelText('Codice materiale') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'H002' } });
    fireEvent.submit(input.closest('form')!);
    await screen.findByText('Articolo H002 rientrato. Puoi inserire il prossimo codice.');
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('dialog').classList.contains('return-state-red')).toBe(true);
    fireEvent.change(input, { target: { value: '+001' } });
    fireEvent.submit(input.closest('form')!);
    await screen.findByText('Articolo +001 rientrato. Puoi inserire il prossimo codice.');
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('dialog').classList.contains('return-state-green')).toBe(true);
    expect(mocks.post.mock.calls[0][2].request_id).not.toBe(mocks.post.mock.calls[1][2].request_id);
    expect(mocks.post.mock.calls.map((call) => call[2].code)).toEqual(['H002', '+001']);
  });

  it('shows all three day sections and preserves completed bookings after refresh', async () => {
    const yellow = { ...booking, id: 'yellow', booking_number: 127, items: booking.items.map((item) => ({ ...item, returned_at: '2026-11-21T10:00:00Z' })) };
    const green = { ...yellow, id: 'green', booking_number: 128, status: 'completed', balance: '0', paid_amount: '60' };
    mocks.get.mockResolvedValue({ ...response, bookings: [partial, yellow, green] });
    render(<ReturnsPage />);
    await screen.findByRole('button', { name: 'Apri scheda rientro 128' });
    const redSection = screen.getByRole('region', { name: 'Materiale da restituire' });
    const yellowSection = screen.getByRole('region', { name: 'Da saldare' });
    const greenSection = screen.getByRole('region', { name: 'Tutto completato' });
    expect(within(redSection).getByRole('button', { name: 'Apri scheda rientro 126' })).toBeTruthy();
    expect(within(yellowSection).getByRole('button', { name: 'Apri scheda rientro 127' })).toBeTruthy();
    expect(within(greenSection).getByRole('button', { name: 'Apri scheda rientro 128' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aggiorna' }));
    await screen.findByRole('button', { name: 'Apri scheda rientro 128' });
    expect(screen.getByRole('heading', { name: 'Da saldare' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tutto completato' })).toBeTruthy();
  });

  it.each([
    ['40', '0', 'green', 'Tutto completato'],
    ['10', '30', 'yellow', 'Da saldare'],
  ])('records a payment of %s and moves the booking to %s', async (amount, balance, color, section) => {
    const yellow = { ...booking, items: booking.items.map((item) => ({ ...item, returned_at: '2026-11-21T10:00:00Z' })) };
    const updated = { ...yellow, balance, paid_amount: balance === '0' ? '60' : '30', status: balance === '0' ? 'completed' : 'active' };
    mocks.get.mockResolvedValue({ ...response, bookings: [yellow] });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Registra pagamento noleggio 125' }));
    expect((screen.getByLabelText('Importo ricevuto (€)') as HTMLInputElement).value).toBe('40');
    fireEvent.change(screen.getByLabelText('Importo ricevuto (€)'), { target: { value: amount } });
    fireEvent.change(screen.getByLabelText('Metodo di pagamento'), { target: { value: 'Carta' } });
    fireEvent.change(screen.getByLabelText('Data e ora del pagamento'), { target: { value: '2026-11-21T14:30' } });
    mocks.post.mockResolvedValue(updated);
    mocks.get.mockResolvedValue({ ...response, bookings: [updated] });
    fireEvent.click(screen.getByRole('button', { name: 'Salva pagamento' }));
    await screen.findByRole('heading', { name: 'Noleggio n. 125' });
    expect(screen.getByRole('dialog').classList.contains(`return-state-${color}`)).toBe(true);
    expect(mocks.post).toHaveBeenCalledWith('/locations/site-a/rental-bookings/booking/payments', 'token', {
      payment_id: expect.any(String), amount: `${amount}.00`, payment_method: 'Carta', paid_at_local: '2026-11-21T14:30', notes: null,
    }, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi scheda rientro' }));
    const target = await screen.findByRole('region', { name: section });
    expect(within(target).getByRole('button', { name: 'Apri scheda rientro 125' })).toBeTruthy();
  });

  it('rejects invalid amounts and reuses the payment ID on retry', async () => {
    const yellow = { ...booking, items: booking.items.map((item) => ({ ...item, returned_at: '2026-11-21T10:00:00Z' })) };
    mocks.get.mockResolvedValue({ ...response, bookings: [yellow] });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Apri scheda rientro 125' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registra pagamento' }));
    fireEvent.change(screen.getByLabelText('Metodo di pagamento'), { target: { value: 'Contanti' } });
    for (const amount of ['0', '41', '-1', '1.001']) {
      fireEvent.change(screen.getByLabelText('Importo ricevuto (€)'), { target: { value: amount } });
      expect((screen.getByRole('button', { name: 'Salva pagamento' }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Importo ricevuto (€)'), { target: { value: '40' } });
    mocks.post.mockRejectedValueOnce(new Error('Connessione interrotta')).mockResolvedValueOnce({ ...yellow, balance: '0', paid_amount: '60' });
    fireEvent.click(screen.getByRole('button', { name: 'Salva pagamento' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Salva pagamento' }));
    await screen.findByRole('heading', { name: 'Noleggio n. 125' });
    expect(mocks.post.mock.calls[0][2].payment_id).toBe(mocks.post.mock.calls[1][2].payment_id);
  });

  it('reloads automatically when the Italian day changes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T22:59:30Z'));
    await act(async () => { render(<ReturnsPage />); });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
});


it('returns generic poles only with the booking selected in the details', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Registra rientro' }));
  fireEvent.change(screen.getByLabelText('Codice materiale'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Conferma rientro' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Per i bastoncini apri la scheda del noleggio e premi Registra un altro rientro.');
  expect(mocks.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi registrazione rientro' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apri scheda rientro 125' }));
  fireEvent.click(screen.getByRole('button', { name: 'Registra un altro rientro' }));
  mocks.post.mockResolvedValue(booking);
  fireEvent.change(screen.getByLabelText('Codice materiale'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Conferma rientro' }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/locations/site-a/rental-returns', 'token',
    { request_id: expect.any(String), code: '1', booking_id: booking.id }, expect.any(AbortSignal)));
});
