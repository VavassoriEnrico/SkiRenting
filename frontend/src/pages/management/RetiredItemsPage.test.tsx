import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { RetiredItemsPage } from './RetiredItemsPage';
import { ManagementPage } from './ManagementPage';
import type { RentalItem } from '../inventory/rental-inventory';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), auth: { session: { access_token: 'token' } } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get, apiPost: mocks.post }));
const category = { id: 'ski', code: 'ski', name: 'Sci' };
const locations = [{ id: 'site-a', name: 'Madesimo' }, { id: 'site-b', name: 'Boscone' }];
const item: RentalItem = { id: 'unit-a', code: 'SKI001', status: 'retired', is_rentable: false, is_bookable: false,
  notes: 'Sci dismesso', serial_number: null, group: { id: 'race', name: 'RACE' },
  variant: { id: 'variant-a', brand: 'Atomic', model: 'Redster', year: 2025, category,
    ski_details: { length_cm: 170 }, snowboard_details: null, boot_details: null, helmet_details: null,
    pole_details: null, goggle_details: null, accessory_details: null } };
const inventory = { categories: [category], locations, items: [
  { ...item, location: locations[0], deleted_at: '2026-11-24T10:00:00Z', deleted_by: 'operator' },
  { ...item, id: 'unit-b', code: 'SKI002', location: locations[1], deleted_at: null, deleted_by: null },
] };
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  mocks.post.mockReset().mockResolvedValue({});
  mocks.get.mockReset().mockImplementation((path: string) => Promise.resolve(path === '/retired-rental-inventory'
    ? inventory : { item, statistics: { rental_count: 12, repair_count: 3, rentals_since_last_repair: 2, last_repair_at: '2026-01-01T10:00:00Z' } }));
});
afterEach(cleanup);

it('adds Articoli dismessi to Gestione', () => {
  render(<MemoryRouter><ManagementPage /></MemoryRouter>);
  expect(screen.getByRole('link', { name: /Articoli dismessi/ }).getAttribute('href')).toBe('/management/articoli-dismessi');
});

it('shows retired codes and retirement dates and filters by site and text', async () => {
  render(<RetiredItemsPage />);
  await screen.findByText('SKI001');
  expect(mocks.get).toHaveBeenCalledWith('/retired-rental-inventory', 'token', expect.any(AbortSignal));
  expect(screen.getByText('24/11/2026')).toBeTruthy();
  expect(screen.getByText('Non registrata')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Sede'), { target: { value: 'site-b' } });
  expect(screen.queryByText('SKI001')).toBeNull();
  expect(screen.getByText('SKI002')).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
  expect(screen.getByText('Nessun articolo corrisponde ai filtri')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Azzera filtri' }));
  expect(screen.getByText('SKI001')).toBeTruthy();
});

it('opens readonly usage statistics and retains the retired list after closing', async () => {
  render(<RetiredItemsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Vedi articolo dismesso SKI001' }));
  const dialog = screen.getByRole('dialog', { name: 'Scheda esemplare SKI001' });
  await within(dialog).findByText('Numero di noleggi');
  expect(mocks.get).toHaveBeenCalledWith('/locations/site-a/retired-rental-inventory/unit-a', 'token', expect.any(AbortSignal));
  expect(within(dialog).getByText('Numero di noleggi').nextElementSibling?.textContent).toBe('12');
  expect(within(dialog).getByText('Riparazioni concluse').nextElementSibling?.textContent).toBe('3');
  expect(within(dialog).getByText('Noleggi dall’ultima riparazione').nextElementSibling?.textContent).toBe('2');
  expect(within(dialog).getByText('Dismesso')).toBeTruthy();
  expect(within(dialog).queryByRole('button', { name: /Sposta/ })).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Torna agli articoli dismessi' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('SKI002')).toBeTruthy();
});

it('shows an error and permits retry without presenting a fake empty inventory', async () => {
  mocks.get.mockRejectedValueOnce(new Error('Connessione interrotta'));
  render(<RetiredItemsPage />);
  await screen.findByRole('alert');
  expect(screen.queryByText('Nessun articolo dismesso')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
  await screen.findByText('SKI001');
});

it('paginates individual retired units', async () => {
  mocks.get.mockResolvedValue({ ...inventory, items: Array.from({ length: 31 }, (_, index) => ({ ...inventory.items[0], id: `unit-${index}`, code: `ITEM${index + 1}` })) });
  render(<RetiredItemsPage />);
  await screen.findByText('ITEM1');
  expect(screen.queryByText('ITEM31')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Successivi' }));
  expect(screen.getByText('ITEM31')).toBeTruthy();
});


it('reactivates an item only after confirmation and removes it from the retired list', async () => {
  render(<RetiredItemsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Riattiva articolo SKI001' }));
  expect(mocks.post).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog', { name: 'Riattiva articolo' });
  expect(within(dialog).getByText('Madesimo')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Conferma riattivazione' }));
  await screen.findByText('Articolo SKI001 riattivato nel magazzino di Madesimo.');
  expect(mocks.post).toHaveBeenCalledWith('/locations/site-a/rental-inventory/unit-a/reactivate', 'token', {}, expect.any(AbortSignal));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText('SKI001')).toBeNull();
  expect(screen.getByText('SKI002')).toBeTruthy();
});

it('can cancel reactivation and retains an item when the request fails', async () => {
  render(<RetiredItemsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Riattiva articolo SKI001' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annulla' }));
  expect(mocks.post).not.toHaveBeenCalled();
  mocks.post.mockRejectedValueOnce(new Error('Modello disabilitato'));
  fireEvent.click(screen.getByRole('button', { name: 'Riattiva articolo SKI001' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Conferma riattivazione' }));
  await screen.findByRole('alert');
  expect(within(screen.getByRole('table')).getByText('SKI001')).toBeTruthy();
  expect(screen.getByRole('dialog')).toBeTruthy();
});
