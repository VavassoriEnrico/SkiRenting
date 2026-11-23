import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { RentalRatesPage } from './RentalRatesPage';
import { ManagementPage } from './ManagementPage';
import { rateColumns, packRateColumns } from './rental-rates';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ session: { access_token: 'token' } }) }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get, apiPatch: mocks.patch }));

const ski = { id: 'ski', code: 'ski', name: 'Sci' };
const snow = { id: 'snow', code: 'snowboard', name: 'Snowboard' };
const packPrices = Object.fromEntries(packRateColumns.map(({key})=>[key,null]));
const prices = Object.fromEntries(rateColumns.map(({ key }) => [key, null]));
const rate = { id: 'rate-one', group_id: 'race', group: { id: 'race', name: 'RACE', category: ski }, ...prices };
const data = { categories: [ski, snow, { id: 'helmet', code: 'helmet', name: 'Caschi' }], rates: [rate, { ...rate, id: 'rate-two', group_id: 'snow-base', group: { id: 'snow-base', name: 'BASE', category: snow } }] };
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue(data);
  mocks.patch.mockReset().mockImplementation((_path: string, _token: string, body: object) => Promise.resolve({ ...rate, ...body }));
});
afterEach(cleanup);

async function open() {
  const view = render(<MemoryRouter><RentalRatesPage /></MemoryRouter>);
  await screen.findByRole('button', { name: 'Salva tariffe RACE' });
  return view;
}

describe('Tariffe per tipo di materiale', () => {
  it('provides a management card and separates ski, snowboard and empty categories', async () => {
    const card = render(<MemoryRouter><ManagementPage /></MemoryRouter>);
    expect(screen.getAllByRole('link', { name: /Tariffe/ }).find(link=>link.getAttribute('href')==='/management/tariffe')?.getAttribute('href')).toBe('/management/tariffe');
    card.unmount();
    await open();
    expect(screen.queryByText('BASE')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Snowboard/ }));
    expect(screen.getByText('BASE')).toBeTruthy();
    expect(screen.queryByText('RACE')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Caschi/ }));
    expect(screen.getByText(/Nessun gruppo tariffario/)).toBeTruthy();
  });

  it('retains drafts across categories and saves seven daily prices, distinguishing zero from missing', async () => {
    await open();
    change('RACE · 1 giorno (€/giorno)', '20');
    change('RACE · 2 giorni (€/giorno)', '18');
    change('RACE · 3 giorni (€/giorno)', '0');
    change('RACE · 7+ giorni (€/giorno)', '10');
    fireEvent.click(screen.getByRole('button', { name: /Snowboard/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Sci/ }));
    expect((screen.getByLabelText('RACE · 2 giorni (€/giorno)') as HTMLInputElement).value).toBe('18');
    fireEvent.click(screen.getByRole('button', { name: 'Salva tariffe RACE' }));
    await screen.findByText('Tariffe di RACE salvate.');
    expect(mocks.patch).toHaveBeenCalledWith('/rental-rates/rate-one', 'token', {
      daily_price_1_day: 20, daily_price_2_days: 18, daily_price_3_days: 0,
      daily_price_4_days: null, daily_price_5_days: null, daily_price_6_days: null, daily_price_7_plus_days: 10, ...packPrices,
    }, expect.any(AbortSignal));
    expect((screen.getByRole('button', { name: 'Salva tariffe RACE' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('retains entered values on errors and blocks simultaneous saves', async () => {
    let fail!: (error: Error) => void;
    mocks.patch.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    await open(); change('RACE · 1 giorno (€/giorno)', '12.5');
    const button = screen.getByRole('button', { name: 'Salva tariffe RACE' });
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: /Snowboard/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => fail(new Error('Errore salvataggio')));
    await screen.findByRole('alert');
    expect((screen.getByLabelText('RACE · 1 giorno (€/giorno)') as HTMLInputElement).value).toBe('12.5');
    expect((screen.getByRole('button', { name: 'Salva tariffe RACE' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('reports missing tables and retries without filling sample prices', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Eseguire 010_rental_rates.sql'));
    render(<MemoryRouter><RentalRatesPage /></MemoryRouter>);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await screen.findByRole('button', { name: 'Salva tariffe RACE' });
    expect((screen.getByLabelText('RACE · 1 giorno (€/giorno)') as HTMLInputElement).value).toBe('');
  });

  it('aborts a pending save when leaving the page', async () => {
    let complete!: (value: object) => void;
    mocks.patch.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const view = await open(); change('RACE · 1 giorno (€/giorno)', '20');
    fireEvent.click(screen.getByRole('button', { name: 'Salva tariffe RACE' }));
    const signal = mocks.patch.mock.calls[0][3] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => complete({ ...rate, daily_price_1_day: 20 }));
    await waitFor(() => expect(screen.queryByText('Tariffe di RACE salvate.')).toBeNull());
  });
});


it('saves independent single and pack daily tiers for ski and snowboard only',async()=>{
  await open();
  expect(screen.getByText('Singolo')).toBeTruthy();
  expect(screen.getByText('Pack')).toBeTruthy();
  change('RACE · 1 giorno (€/giorno)','20');
  change('RACE · Pack · 1 giorno (€/giorno)','28');
  change('RACE · Pack · 2 giorni (€/giorno)','25');
  change('RACE · Pack · 7+ giorni (€/giorno)','0');
  fireEvent.click(screen.getByRole('button',{name:/Snowboard/}));
  expect(screen.getByLabelText('BASE · Pack · 1 giorno (€/giorno)')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/Caschi/}));
  expect(screen.queryByText('Pack')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/^Sci/}));
  expect((screen.getByRole('button',{name:'Salva tariffe RACE'}) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'Salva tariffe RACE'}));
  await screen.findByText('Tariffe di RACE salvate.');
  expect(mocks.patch).toHaveBeenCalledWith('/rental-rates/rate-one','token',expect.objectContaining({
    daily_price_1_day:20,pack_price_1_day:28,pack_price_2_days:25,pack_price_7_plus_days:0,pack_price_3_days:null,
  }),expect.any(AbortSignal));
  expect((screen.getByRole('button',{name:'Salva tariffe RACE'}) as HTMLButtonElement).disabled).toBe(true);
});
