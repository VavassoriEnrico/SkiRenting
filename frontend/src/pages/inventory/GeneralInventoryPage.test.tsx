import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeneralInventoryPage } from './GeneralInventoryPage';
import { groupGeneralItems, sortGeneralRows } from './general-inventory';
import type { GeneralItem } from './general-inventory';
import type { RentalVariant } from './rental-inventory';

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), auth: { session: { access_token: 'token' }, location: { id: 'a', name: 'Madesimo' } } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.apiGet }));
const locations = [{ id: 'a', name: 'Madesimo' }, { id: 'b', name: 'Boscone' }];
const category = { id: 'ski', code: 'ski', name: 'Sci' };
const first: GeneralItem = {
  id: 'one', code: 'SKI001', location: locations[0], serial_number: 'SERIAL1', notes: 'Lamina destra',
  status: 'active', is_rentable: true, is_bookable: true, group: { id: 'race', name: 'RACE' },
  variant: {
    id: 'v1', brand: 'BLIZZARD', model: 'ANOMALY', year: 2025, notes: null, category,
    ski_details: { length_cm: 164, radius_m: 14, style: null }, snowboard_details: null,
    boot_details: null, helmet_details: null, pole_details: null, goggle_details: null, accessory_details: null,
  },
};
const second: GeneralItem = {
  ...first, id: 'two', code: 'SKI002', location: locations[1], notes: 'Soletta', serial_number: null,
  variant: { ...first.variant, id: 'v2', notes: 'Modello importato' },
  group: { id: 'allmountain', name: 'ALLMOUNTAIN' }, status: 'maintenance',
  open_repair: { id: 'repair', repair_type: 'wax', sent_at: '2026-11-22T10:00:00Z' },
};
const inventory = { locations, categories: [category], items: [first, second] };
beforeEach(() => {
  mocks.apiGet.mockReset().mockResolvedValue(inventory);
  mocks.auth.location = locations[0];
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
});
afterEach(cleanup);

describe('Raggruppamento generale', () => {
  it('combines equivalent catalog records across sites and tariff groups but retains each unit', () => {
    const rows = groupGeneralItems([first, second]);
    expect(rows).toHaveLength(1);
    expect(rows[0].units).toEqual([first, second]);
  });

  it.each<Partial<RentalVariant>>([
    { year: 2024 },
    { ski_details: { ...first.variant.ski_details!, length_cm: 180 } },
    { ski_details: { ...first.variant.ski_details!, radius_m: 16 } },
    { ski_details: { ...first.variant.ski_details!, style: 'freeride' } },
    { boot_details: { size_label: '42', size_system: 'eu', shoe_size_eu: '42', foot_length_cm: 27, sole_length_mm: 315 } },
    { helmet_details: { size_label: 'M', color: 'Rosso' } },
    { pole_details: { height_cm: 120 } },
    { goggle_details: { lens: 'S2' } },
    { accessory_details: { size_label: 'L' } },
  ])('keeps different physical characteristics separate: %j', (change) => {
    expect(groupGeneralItems([first, { ...second, variant: { ...second.variant, ...change } }])).toHaveLength(2);
  });
});

describe('Magazzino generale noleggi', () => {
  it('loads all sites independently of the selected site and shows separate unit lists', async () => {
    mocks.auth.location = locations[1];
    render(<GeneralInventoryPage />);
    await screen.findByText('ANOMALY');
    expect(mocks.apiGet).toHaveBeenCalledWith('/rental-inventory', 'token', expect.any(AbortSignal));
    expect(screen.getByText('2 esemplari · 1 varianti · Sedi: Madesimo, Boscone')).toBeTruthy();
    expect(screen.queryByText('SKI001')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Apri esemplari/ }));
    const madesimo = within(screen.getByRole('region', { name: 'Esemplari a Madesimo' }));
    const boscone = within(screen.getByRole('region', { name: 'Esemplari a Boscone' }));
    expect(madesimo.getByText('SKI001')).toBeTruthy();
    expect(madesimo.queryByText('SKI002')).toBeNull();
    expect(madesimo.getByText('Lamina destra')).toBeTruthy();
    expect(boscone.getByText('SKI002')).toBeTruthy();
    expect(boscone.getByText(/In riparazione/)).toBeTruthy();
    expect(boscone.getByText(/Modello importato/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sposta|Salva|Ripara/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi elenco esemplari' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('searches an individual code without losing other units or per-site quantities', async () => {
    render(<GeneralInventoryPage />);
    await screen.findByText('ANOMALY');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'SKI002' } });
    fireEvent.click(screen.getByRole('button', { name: /Apri esemplari/ }));
    expect(screen.getByText('SKI001')).toBeTruthy();
    expect(screen.getByText('SKI002')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi elenco esemplari' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
    expect(screen.getByText('Nessun materiale corrisponde ai filtri')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Azzera filtri' }));
    expect(screen.getByText('ANOMALY')).toBeTruthy();
  });

  it('reports a loading failure and retries without sample stock', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('Servizio non disponibile'));
    render(<GeneralInventoryPage />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Servizio non disponibile');
    fireEvent.click(screen.getByRole('button', { name: 'Riprova magazzino generale noleggi' }));
    await screen.findByText('ANOMALY');
    expect(mocks.apiGet).toHaveBeenCalledTimes(2);
  });

  it('shows empty authorized sites without fake units', async () => {
    mocks.apiGet.mockResolvedValue({ ...inventory, items: [first] });
    render(<GeneralInventoryPage />);
    await screen.findByText('ANOMALY');
    fireEvent.click(screen.getByRole('button', { name: /Apri esemplari/ }));
    expect(screen.getByRole('heading', { name: 'Boscone' })).toBeTruthy();
    expect(screen.getByText('Nessun esemplare in questa sede.')).toBeTruthy();
  });
});


describe('Ordinamento magazzino generale', () => {
  it('compares measures numerically and keeps missing years last in either direction', () => {
    const rows = groupGeneralItems([
      first,
      { ...second, variant: { ...second.variant, year: null, ski_details: { ...second.variant.ski_details!, length_cm: 90 } } },
      { ...first, id: 'three', variant: { ...first.variant, year: 2024, ski_details: { ...first.variant.ski_details!, length_cm: 180 } } },
    ]);
    expect(sortGeneralRows(rows, 'size', 'asc').map(row => row.variant.ski_details!.length_cm)).toEqual([90,164,180]);
    expect(sortGeneralRows(rows, 'year', 'desc').map(row => row.variant.year)).toEqual([2025,2024,null]);
    expect(sortGeneralRows(rows, 'year', 'asc').map(row => row.variant.year)).toEqual([2024,2025,null]);
  });

  it('sorts the entire result before pagination and resets the page on sort changes', async () => {
    mocks.apiGet.mockResolvedValue({ ...inventory, items: Array.from({ length: 31 }, (_, index) => ({
      ...first, id: `item-${index}`, code: `CODE${index}`,
      variant: { ...first.variant, model: `MODEL${index}`, year: 2000 + index },
    })) });
    render(<GeneralInventoryPage />);
    await screen.findByText('MODEL0');
    fireEvent.click(screen.getByRole('button', { name: 'Successivi' }));
    expect(screen.getByText('MODEL30')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Ordina per' }), { target: { value: 'year' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Direzione ordinamento' }), { target: { value: 'desc' } });
    const table = within(screen.getByRole('region', { name: 'Magazzino generale noleggi aggregato' }));
    expect(within(table.getAllByRole('row')[1]).getByText('MODEL30')).toBeTruthy();
    expect(table.queryByText('MODEL0')).toBeNull();
    expect((screen.getByRole('button', { name: 'Precedenti' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'MODEL12' } });
    expect(table.getByText('MODEL12')).toBeTruthy();
    expect(table.queryByText('MODEL30')).toBeNull();
  });
});
