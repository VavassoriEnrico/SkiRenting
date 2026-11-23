import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { ManagementPage } from './ManagementPage';
import { PromotionsPage } from './PromotionsPage';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), remove: vi.fn() }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ session: { access_token: 'token' } }) }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get, apiPost: mocks.post, apiDelete: mocks.remove }));
const datePromotion = { id: 'promo', name: 'Natale', created_at: '2026-11-23T10:00:00Z', promotion_date: '2026-12-25', weekdays: [], discount_percent: 15, is_active: true };
beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue([]);
  mocks.post.mockReset().mockResolvedValue(datePromotion);
  mocks.remove.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);
async function open() {
  render(<MemoryRouter><PromotionsPage /></MemoryRouter>);
  await screen.findByText('Nessuna promozione configurata.');
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

it('adds a Promotions card in Gestione', () => {
  render(<MemoryRouter><ManagementPage /></MemoryRouter>);
  expect(screen.getByRole('link', { name: /Promozioni/ }).getAttribute('href')).toBe('/management/promozioni');
});

it('creates a named promotion for a single date and displays the saved percentage', async () => {
  await open();
  change('Nome promozione', ' Natale '); change('Data della promozione', '2026-12-25'); change('Sconto (%)', '15');
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi promozione' }));
  await screen.findByText('Promozione aggiunta.');
  expect(mocks.post).toHaveBeenCalledWith('/promotions', 'token', { name: 'Natale', promotion_date: '2026-12-25', weekdays: [], discount_percent: 15 }, expect.any(AbortSignal));
  expect(screen.getByText('25 dicembre 2026')).toBeTruthy();
  expect(screen.getByText('15%')).toBeTruthy();
  expect((screen.getByLabelText('Nome promozione') as HTMLInputElement).value).toBe('');
});

it('selects several recurring weekdays without sending a hidden single date', async () => {
  mocks.post.mockResolvedValue({ ...datePromotion, name: 'Infrasettimanale', promotion_date: null, weekdays: [2,4], discount_percent: 20 });
  await open();
  change('Nome promozione', 'Infrasettimanale'); change('Data della promozione', '2026-12-25');
  change('Validità', 'weekly');
  fireEvent.click(screen.getByRole('button', { name: 'Giovedì' }));
  fireEvent.click(screen.getByRole('button', { name: 'Martedì' }));
  change('Sconto (%)', '20');
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi promozione' }));
  await screen.findByText('Ogni martedì e giovedì');
  expect(mocks.post).toHaveBeenCalledWith('/promotions', 'token', { name: 'Infrasettimanale', promotion_date: null, weekdays: [2,4], discount_percent: 20 }, expect.any(AbortSignal));
});

it('keeps the form on a save error and prevents duplicate submissions', async () => {
  let fail!: (error: Error) => void;
  mocks.post.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
  await open();
  change('Nome promozione', 'Natale'); change('Data della promozione', '2026-12-25'); change('Sconto (%)', '15');
  const submit = screen.getByRole('button', { name: 'Aggiungi promozione' });
  fireEvent.click(submit); fireEvent.click(submit);
  expect(mocks.post).toHaveBeenCalledTimes(1);
  await act(async () => fail(new Error('Salvataggio non riuscito')));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Salvataggio non riuscito');
  expect((screen.getByLabelText('Nome promozione') as HTMLInputElement).value).toBe('Natale');
  expect((screen.getByLabelText('Sconto (%)') as HTMLInputElement).value).toBe('15');
});

it('removes a promotion only after success and retains it on failure', async () => {
  mocks.get.mockResolvedValue([datePromotion]);
  mocks.remove.mockRejectedValueOnce(new Error('Rimozione non riuscita'));
  render(<MemoryRouter><PromotionsPage /></MemoryRouter>);
  const remove = await screen.findByRole('button', { name: /Rimuovi promozione Natale/ });
  fireEvent.click(remove);
  await screen.findByRole('alert');
  expect(screen.getByText('Natale')).toBeTruthy();
  fireEvent.click(remove);
  await screen.findByText('Promozione rimossa.');
  expect(mocks.remove).toHaveBeenLastCalledWith('/promotions/promo', 'token', expect.any(AbortSignal));
  expect(screen.queryByText('Natale')).toBeNull();
});

it('reports a missing configuration and retries loading without demo data', async () => {
  mocks.get.mockRejectedValueOnce(new Error('Esegui 020_promotions.sql in Supabase.'));
  render(<MemoryRouter><PromotionsPage /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Esegui 020_promotions.sql in Supabase.');
  fireEvent.click(screen.getByRole('button', { name: 'Riprova promozioni' }));
  await screen.findByText('Nessuna promozione configurata.');
  await waitFor(() => expect((screen.getByLabelText('Nome promozione') as HTMLInputElement).disabled).toBe(false));
});


it('creates a period with inclusive dates and does not send previously selected weekdays', async () => {
  mocks.post.mockResolvedValue({...datePromotion,name:'Natale lungo',promotion_date:null,starts_on:'2026-12-20',ends_on:'2026-12-31',weekdays:[]});
  await open();
  change('Nome promozione','Natale lungo');change('Validità','weekly');
  fireEvent.click(screen.getByRole('button',{name:'Martedì'}));
  change('Validità','period');change('Dal','2026-12-20');change('Al','2026-12-31');change('Sconto (%)','15');
  fireEvent.click(screen.getByRole('button',{name:'Aggiungi promozione'}));
  await screen.findByText('Dal 20 dicembre 2026 al 31 dicembre 2026');
  expect(mocks.post).toHaveBeenCalledWith('/promotions','token',{name:'Natale lungo',starts_on:'2026-12-20',ends_on:'2026-12-31',promotion_date:null,weekdays:[],discount_percent:15},expect.any(AbortSignal));
});

it('requires a complete ordered period before saving', async () => {
  await open();change('Nome promozione','Periodo');change('Validità','period');change('Sconto (%)','10');
  const button=screen.getByRole('button',{name:'Aggiungi promozione'}) as HTMLButtonElement;
  change('Dal','2026-12-20');
  expect(button.disabled).toBe(true);
  change('Al','2026-12-19');
  expect(button.disabled).toBe(true);
  expect(screen.getByRole('alert')).toHaveProperty('textContent','La data finale non può precedere quella iniziale.');
  change('Al','2026-12-20');
  expect(button.disabled).toBe(false);
  expect(mocks.post).not.toHaveBeenCalled();
});
