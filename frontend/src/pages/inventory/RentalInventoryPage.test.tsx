import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RentalInventoryPage } from './RentalInventoryPage';
import type { RentalInventory, RentalItem } from './rental-inventory';

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), auth: { session: { access_token: 'token' }, location: { id: 'site-a', name: 'Madesimo' } } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.apiGet, apiPost: mocks.apiPost }));

const category = { id: 'ski', code: 'ski', name: 'Sci' };
const item: RentalItem = {
  id: 'unit-1', code: '+001', serial_number: null, status: 'active', is_rentable: true, is_bookable: true, notes: 'Nota articolo',
  group: { id: 'race', name: 'RACE' }, variant: {
    id: 'variant-1', brand: 'BLIZZARD', model: 'ANOMALY', year: 2025, notes: null, category,
    ski_details: { length_cm: 164, radius_m: null, style: null }, snowboard_details: null, boot_details: null,
    helmet_details: null, pole_details: null, goggle_details: null, accessory_details: null,
  },
};
const inventory: RentalInventory = { categories: [category], items: [item, { ...item, id: 'unit-2', code: '002', status: 'maintenance' }] };

afterEach(cleanup);
beforeEach(() => {
  mocks.apiGet.mockReset().mockResolvedValue(inventory);
  mocks.apiPost.mockReset();
  mocks.auth.location = { id: 'site-a', name: 'Madesimo' };
  HTMLDialogElement.prototype.showModal = vi.fn();
});

describe('Magazzino noleggio', () => {
  it('loads the selected site, groups units and opens actual codes and status', async () => {
    render(<RentalInventoryPage />);
    await screen.findByText('ANOMALY');
    expect(mocks.apiGet).toHaveBeenCalledWith('/locations/site-a/rental-inventory', 'token', expect.any(AbortSignal));
    expect(screen.getByText('1 variante · 2 articoli')).toBeTruthy();
    expect(screen.queryByText('+001')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apri scheda BLIZZARD ANOMALY 164 cm' }));
    expect(screen.getByText('+001')).toBeTruthy();
    expect(screen.getByText(/In manutenzione/)).toBeTruthy();
    expect(screen.getByText('Da definire')).toBeTruthy();
    expect(screen.queryByText(/dati dimostrativi/i)).toBeNull();
  });

  it('searches unit codes without removing sibling units of the same variant', async () => {
    render(<RentalInventoryPage />);
    await screen.findByText('ANOMALY');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '+001' } });
    expect(screen.getByText('1 variante · 2 articoli')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing-code' } });
    expect(screen.getByText('Nessun articolo trovato')).toBeTruthy();
  });

  it('keeps different lengths separate and filters original rental groups', async () => {
    mocks.apiGet.mockResolvedValue({ categories: [category], items: [item, {
      ...item, id: 'unit-long', code: 'LONG', group: { id: 'allmountain', name: 'ALLMOUNTAIN' },
      variant: { ...item.variant, id: 'variant-long', ski_details: { ...item.variant.ski_details!, length_cm: 180 } },
    }] });
    render(<RentalInventoryPage />);
    await screen.findByText('2 varianti · 2 articoli');
    expect(screen.getByText('164 cm')).toBeTruthy();
    expect(screen.getByText('180 cm')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Gruppo noleggio' }), { target: { value: 'race' } });
    expect(screen.getByText('1 variante · 1 articolo')).toBeTruthy();
    expect(screen.queryByText('180 cm')).toBeNull();
  });

  it('reloads the actual inventory after creating an article', async () => {
    mocks.apiGet.mockImplementation((path: string) => Promise.resolve(path.endsWith('rental-catalog') ? {
      categories: [{ ...category, detail_type: 'ski' }], groups: [{ ...item.group, category_id: category.id }], variants: [item.variant],
    } : inventory));
    mocks.apiPost.mockResolvedValue({ id: 'new-unit', category_id: category.id, group_id: item.group.id, variant_id: item.variant.id, code: 'NEW001' });
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
    render(<RentalInventoryPage />);
    await screen.findByText('ANOMALY');
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo articolo' }));
    await screen.findByLabelText('Gruppo noleggio *');
    fireEvent.change(screen.getByLabelText('Gruppo noleggio *'), { target: { value: item.group.id } });
    fireEvent.change(screen.getByLabelText('Modello / variante *'), { target: { value: item.variant.id } });
    fireEvent.change(screen.getByLabelText('Codice univoco articolo *'), { target: { value: 'NEW001' } });
    mocks.apiGet.mockImplementation((path: string) => Promise.resolve(path.endsWith('rental-catalog') ? {} : { ...inventory, items: [...inventory.items, { ...item, id: 'new-unit', code: 'NEW001' }] }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva articolo' }));
    await screen.findByText('Articolo NEW001 salvato nel magazzino di Madesimo.');
    await screen.findByText('1 variante · 3 articoli');
  });

  it('shows backend errors and retries', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('Accesso negato'));
    render(<RentalInventoryPage />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await screen.findByText('ANOMALY');
  });

  it('shows an empty real inventory without sample data', async () => {
    mocks.apiGet.mockResolvedValue({ categories: [category], items: [] });
    render(<RentalInventoryPage />);
    await screen.findByText('Nessun articolo di noleggio assegnato a questa sede.');
    expect(screen.queryByText('ANOMALY')).toBeNull();
  });

  it('aborts the previous site request and ignores late responses', async () => {
    let complete!: (data: RentalInventory) => void;
    mocks.apiGet.mockImplementationOnce(() => new Promise<RentalInventory>((resolve) => { complete = resolve; }));
    const view = render(<RentalInventoryPage />);
    const signal = mocks.apiGet.mock.calls[0][2] as AbortSignal;
    mocks.auth.location = { id: 'site-b', name: 'Seconda sede' };
    mocks.apiGet.mockResolvedValue({ categories: [category], items: [] });
    view.rerender(<RentalInventoryPage />);
    await screen.findByText('Nessun articolo di noleggio assegnato a questa sede.');
    expect(signal.aborted).toBe(true);
    await act(async () => complete(inventory));
    await waitFor(() => expect(screen.queryByText('ANOMALY')).toBeNull());
  });
});
