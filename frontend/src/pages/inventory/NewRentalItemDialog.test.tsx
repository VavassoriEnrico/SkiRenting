import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NewRentalItemDialog } from './NewRentalItemDialog';
import type { RentalCatalog } from './rental-form';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get, apiPost: mocks.post }));
const category = { id: 'ski-id', code: 'ski', name: 'Sci', detail_type: 'ski' as const };
const catalog: RentalCatalog = {
  categories: [category, { id: 'boot-id', code: 'ski_boots', name: 'Scarponi sci', detail_type: 'boots' }],
  groups: [{ id: 'race-id', category_id: category.id, name: 'RACE' }],
  variants: [{
    id: 'variant-id', brand: 'BLIZZARD', model: 'ANOMALY', year: 2025, notes: null, category,
    ski_details: { length_cm: 164, radius_m: 12.5, style: 'Pista' }, snowboard_details: null,
    boot_details: null, helmet_details: null, pole_details: null, goggle_details: null, accessory_details: null,
  }],
};
const created = { id: 'new-unit', category_id: category.id, group_id: 'race-id', variant_id: 'variant-id', code: '+0001' };
const change = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
const props = () => ({ token: 'token', locationId: 'site-a', locationName: 'Madesimo', initialCategoryId: category.id, onClose: vi.fn(), onCreated: vi.fn() });

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue(catalog);
  mocks.post.mockReset().mockResolvedValue(created);
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
});
afterEach(cleanup);

async function open() {
  const callbacks = props();
  const view = render(<NewRentalItemDialog {...callbacks} />);
  await screen.findByLabelText('Gruppo noleggio *');
  return { ...callbacks, ...view };
}
function useExistingVariant() {
  change('Gruppo noleggio *', 'race-id');
  change('Modello / variante *', 'variant-id');
  change('Codice univoco articolo *', '+0001');
}

describe('Nuovo articolo noleggio', () => {
  it('selects an existing variant, shows its fields and submits only the references', async () => {
    const callbacks = await open();
    useExistingVariant();
    expect((screen.getByLabelText('Lunghezza (cm)') as HTMLInputElement).value).toBe('164');
    expect((screen.getByLabelText('Marca *') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Salva articolo' }));
    await waitFor(() => expect(callbacks.onCreated).toHaveBeenCalledWith(created));
    const [path, token, body] = mocks.post.mock.calls[0];
    expect(path).toBe('/locations/site-a/rental-inventory');
    expect(token).toBe('token');
    expect(body).toMatchObject({ category_id: 'ski-id', group_id: 'race-id', variant_id: 'variant-id', code: '+0001' });
    expect(body.new_variant).toBeUndefined();
  });

  it('creates a category, group and boot variant with all size fields', async () => {
    await open();
    change('Categoria *', 'new');
    change('Nome nuova categoria *', 'Scarponi speciali');
    change('Codice categoria *', 'special_boots');
    change('Campi della categoria *', 'boots');
    change('Nome nuovo gruppo *', 'Speciali');
    change('Marca *', 'Marca'); change('Modello *', 'Modello');
    change('Misura originale', '24.5'); change('Sistema taglia', 'mondopoint');
    change('Taglia (scarpe EU)', '38'); change('Taglia (cm)', '24.5'); change('Lunghezza suola (mm)', '285');
    change('Codice univoco articolo *', '000001');
    change('Numero di serie (S/N)', 'SER123');
    change('Prezzo di acquisto (€)', '125.50');
    fireEvent.click(screen.getByRole('button', { name: 'Salva articolo' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const body = mocks.post.mock.calls[0][2];
    expect(body).toMatchObject({ new_category: { code: 'special_boots', name: 'Scarponi speciali', detail_type: 'boots' }, new_group: 'Speciali', code: '000001', serial_number: 'SER123', purchase_price: 125.5 });
    expect(body.new_variant.details).toEqual({ size_label: '24.5', size_system: 'mondopoint', shoe_size_eu: '38', foot_length_cm: 24.5, sole_length_mm: 285 });
    expect(body.new_variant.details.length_cm).toBeUndefined();
  });

  it('clears incompatible group and model when switching categories', async () => {
    await open(); useExistingVariant();
    change('Categoria *', 'boot-id');
    expect((screen.getByLabelText('Gruppo noleggio *') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Marca *') as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText('Lunghezza (cm)')).toBeNull();
    expect(screen.getByLabelText('Lunghezza suola (mm)')).toBeTruthy();
  });

  it('retains the form on duplicate errors and prevents double submissions', async () => {
    let reject!: (cause: Error) => void;
    mocks.post.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const callbacks = await open(); useExistingVariant();
    const submit = screen.getByRole('button', { name: 'Salva articolo' });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Salvataggio…' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => reject(new Error('Codice già esistente')));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByLabelText('Codice univoco articolo *') as HTMLInputElement).value).toBe('+0001');
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(callbacks.onCreated).not.toHaveBeenCalled();
  });

  it('reports a missing SQL migration and can reload the catalog', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Eseguire la query 005_create_rental_item.sql in Supabase.'));
    render(<NewRentalItemDialog {...props()} />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await screen.findByLabelText('Gruppo noleggio *');
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it('aborts a pending save when unmounted and ignores the late response', async () => {
    let complete!: (value: typeof created) => void;
    mocks.post.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const callbacks = await open(); useExistingVariant();
    fireEvent.click(screen.getByRole('button', { name: 'Salva articolo' }));
    const signal = mocks.post.mock.calls[0][3] as AbortSignal;
    callbacks.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => complete(created));
    expect(callbacks.onCreated).not.toHaveBeenCalled();
  });
});
