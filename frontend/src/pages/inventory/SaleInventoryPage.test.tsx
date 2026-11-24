import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NewSaleArrivalDialog } from './NewSaleArrivalDialog';
import { SaleInventoryPage } from './SaleInventoryPage';
import { groupSaleStock } from './general-inventory';
import type { SaleCatalog, SaleInventoryItem } from './sale-inventory';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn(), auth: { session: { access_token: 'token' }, location: { id: 'site-a', name: 'Madesimo' } } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get, apiPost: mocks.post, apiDelete: mocks.delete }));
const ski = { id: 'ski', code: 'ski', name: 'Sci', detail_type: 'ski' as const };
const categories: SaleCatalog['categories'] = [ski,
  { id: 'snowboard', code: 'snowboard', name: 'Snowboard', detail_type: 'snowboard' },
  { id: 'boots', code: 'ski_boots', name: 'Scarponi sci', detail_type: 'boots' },
  { id: 'helmet', code: 'helmet', name: 'Caschi', detail_type: 'helmet' },
  { id: 'poles', code: 'poles', name: 'Bastoncini', detail_type: 'poles' },
  { id: 'goggles', code: 'goggles', name: 'Maschere', detail_type: 'goggles' },
  { id: 'avalanche', code: 'avalanche', name: 'Kit ARTVA', detail_type: 'accessory' },
  { id: 'snowshoes', code: 'snowshoes', name: 'Ciaspole', detail_type: 'accessory' }];
const variant: SaleCatalog['variants'][number] = { id: 'variant-a', brand: 'Atomic', model: 'Redster', year: 2026,
  category: ski, ski_details: { length_cm: 170 }, snowboard_details: null, boot_details: null,
  helmet_details: null, pole_details: null, goggle_details: null, accessory_details: null,
  sale_details: { category_label: 'Base' } };
const catalog: SaleCatalog = { categories, variants: [variant] };
const stock: SaleInventoryItem = { id: 'stock-a', variant, location: mocks.auth.location, quantity: 5, price: 199.9, notes: null };
const result = { id: 'arrival-a', inventory_id: stock.id, variant_id: variant.id, category_id: ski.id, quantity_added: 5, quantity: 5, price: 199.9 };
const props = () => ({ token: 'token', locationId: 'site-a', locationName: 'Madesimo', initialCategoryId: ski.id, onClose: vi.fn(), onCreated: vi.fn() });
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  mocks.auth.location = { id: 'site-a', name: 'Madesimo' };
  mocks.get.mockReset().mockImplementation((path: string) => Promise.resolve(path.endsWith('/sale-catalog') ? catalog : { categories, items: [stock] }));
  mocks.post.mockReset().mockResolvedValue(result);
  mocks.delete.mockReset().mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
});
afterEach(cleanup);

describe('Carichi del magazzino vendite', () => {
  it('shows actual quantities and details without unit codes', async () => {
    render(<SaleInventoryPage />);
    await screen.findByText('Atomic');
    expect(mocks.get).toHaveBeenCalledWith('/locations/site-a/sale-inventory', 'token', expect.any(AbortSignal));
    const table = screen.getByRole('table');
    expect(within(table).getByText('5')).toBeTruthy();
    expect(within(table).getByText('170 cm')).toBeTruthy();
    fireEvent.click(within(table).getByRole('button', { name: 'Apri scheda Atomic Redster' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Base')).toBeTruthy();
    expect(within(dialog).queryByText(/Codici univoci|dati dimostrativi/)).toBeNull();
    expect(within(dialog).getByText('5')).toBeTruthy();
  });

  it('saves a new model and reloads the warehouse with the added quantity', async () => {
    let saved = false;
    mocks.get.mockImplementation((path: string) => Promise.resolve(path.endsWith('/sale-catalog') ? catalog : { categories, items: saved ? [stock] : [] }));
    mocks.post.mockImplementation(() => { saved = true; return Promise.resolve(result); });
    render(<SaleInventoryPage />);
    await screen.findByText('Nessun articolo nel magazzino vendita');
    fireEvent.click(screen.getByRole('button', { name: 'Registra arrivo' }));
    await screen.findByLabelText('Marca *');
    change('Marca *', 'Atomic'); change('Modello *', 'Redster'); change('Categoria', 'Base');
    change('Lunghezza (cm)', '170'); change('Quantità in arrivo *', '5'); change('Prezzo di vendita unitario (€)', '199.90');
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
    await screen.findByText('Atomic');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/Arrivo registrato: 5 pezzi aggiunti/)).toBeTruthy();
    const body = mocks.post.mock.calls[0][2];
    expect(body).toMatchObject({ category_id: 'ski', quantity: 5, price: 199.9,
      new_variant: { brand: 'Atomic', model: 'Redster', category_label: 'Base', details: { length_cm: 170 } } });
    expect(body).not.toHaveProperty('code');
    expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ['snowboard', 'Lunghezza (cm)'], ['boots', 'Misura originale'], ['helmet', 'Taglia'],
    ['poles', 'Altezza (cm)'], ['goggles', 'Lente'], ['snowshoes', 'Taglia'],
  ])('uses the characteristics of %s and resets stale values', async (type, field) => {
    render(<NewSaleArrivalDialog {...props()} />);
    await screen.findByLabelText('Lunghezza (cm)');
    change('Lunghezza (cm)', '170');
    change('Tipo di materiale *', type);
    expect(screen.getByLabelText(field)).toBeTruthy();
    expect((screen.getByLabelText(field) as HTMLInputElement).value).toBe('');
    if (type !== 'snowboard') expect(screen.queryByLabelText('Lunghezza (cm)')).toBeNull();
    expect(screen.queryByLabelText(/Codice/)).toBeNull();
  });

  it('does not ask for a size for ARTVA kits', async () => {
    render(<NewSaleArrivalDialog {...props()} />);
    await screen.findByLabelText('Tipo di materiale *');
    change('Tipo di materiale *', 'avalanche');
    expect(screen.queryByLabelText('Taglia')).toBeNull();
    expect(screen.queryByLabelText('Lunghezza (cm)')).toBeNull();
    expect(screen.getByLabelText('Marca *')).toBeTruthy();
  });

  it('loads an existing variant without rewriting its characteristics', async () => {
    const callbacks = props();
    render(<NewSaleArrivalDialog {...callbacks} />);
    await screen.findByLabelText('Modello / variante');
    change('Modello / variante', variant.id);
    expect((screen.getByLabelText('Marca *') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Lunghezza (cm)') as HTMLInputElement).value).toBe('170');
    change('Quantità in arrivo *', '3');
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
    await screen.findByRole('button', { name: 'Registra arrivo' });
    const body = mocks.post.mock.calls[0][2];
    expect(body.variant_id).toBe('variant-a');
    expect(body.price).toBeNull();
    expect(body).not.toHaveProperty('new_variant');
    expect(callbacks.onCreated).toHaveBeenCalledWith(result);
  });

  it('reuses the arrival id when retrying and blocks duplicate submissions and closing while saving', async () => {
    const callbacks = props();
    mocks.post.mockRejectedValueOnce(new Error('Connessione interrotta'));
    render(<NewSaleArrivalDialog {...callbacks} />);
    await screen.findByLabelText('Marca *');
    change('Marca *', 'Atomic'); change('Modello *', 'Redster'); change('Quantità in arrivo *', '2');
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
    await screen.findByRole('alert');
    let complete!: (value: typeof result) => void;
    mocks.post.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const form = screen.getByRole('dialog').querySelector('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(mocks.post.mock.calls[0][2].request_id).toBe(mocks.post.mock.calls[1][2].request_id);
    await act(async () => complete(result));
    expect(callbacks.onCreated).toHaveBeenCalledTimes(1);
  });

  it('asks before deleting all stock from this site and updates counts only after success', async () => {
    render(<SaleInventoryPage />);
    await screen.findByText('Atomic');
    fireEvent.click(screen.getByRole('button', { name: 'Elimina articolo Atomic Redster' }));
    expect(mocks.delete).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annulla' }));
    expect(screen.getByText('Atomic')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Elimina articolo Atomic Redster' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Elimina articolo' }));
    await screen.findByText('Articolo eliminato dal magazzino della sede.');
    expect(mocks.delete).toHaveBeenCalledWith('/locations/site-a/sale-inventory/stock-a', 'token', expect.any(AbortSignal));
    expect(screen.queryByText('Atomic')).toBeNull();
    expect(screen.getByText('Nessun articolo nel magazzino vendita')).toBeTruthy();
  });

  it('keeps the row and the confirmation when deleting fails', async () => {
    mocks.delete.mockRejectedValueOnce(new Error('Connessione interrotta'));
    render(<SaleInventoryPage />);
    await screen.findByText('Atomic');
    fireEvent.click(screen.getByRole('button', { name: 'Elimina articolo Atomic Redster' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Elimina articolo' }));
    await screen.findByRole('alert');
    expect(within(screen.getByRole('table')).getByText('Atomic')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('filters local stock by category and brand and reloads when switching site', async () => {
    const view = render(<SaleInventoryPage />);
    await screen.findByText('Atomic');
    change('Cerca categoria, marca, modello o misura', 'missing');
    expect(screen.getByText('Nessun articolo trovato')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Azzera ricerca' }));
    expect(screen.getByText('Atomic')).toBeTruthy();
    mocks.auth.location = { id: 'site-b', name: 'Boscone' };
    mocks.get.mockResolvedValue({ categories, items: [] });
    view.rerender(<SaleInventoryPage />);
    await screen.findByText('Nessun articolo nel magazzino vendita');
    expect(mocks.get).toHaveBeenCalledWith('/locations/site-b/sale-inventory', 'token', expect.any(AbortSignal));
    expect(screen.queryByText('Atomic')).toBeNull();
  });

  it('keeps a warehouse error distinct from an empty inventory', async () => {
    mocks.get.mockRejectedValue(new Error('Eseguire 031_sale_stock_arrivals.sql in Supabase.'));
    render(<SaleInventoryPage />);
    await screen.findByRole('alert');
    expect(screen.queryByText('Nessun articolo nel magazzino vendita')).toBeNull();
  });

  it('keeps different sale categories separate in the general warehouse', () => {
    expect(groupSaleStock([stock, { ...stock, id: 'second', variant: { ...variant, sale_details: { category_label: 'Avanzato' } } }])).toHaveLength(2);
  });
});
