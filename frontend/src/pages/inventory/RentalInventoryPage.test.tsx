import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RentalInventoryPage } from './RentalInventoryPage';
import type { RentalInventory, RentalItem } from './rental-inventory';

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), auth: { session: { access_token: 'token' }, location: { id: 'site-a', name: 'Madesimo' }, operator: { locations: [{ id: 'site-a', name: 'Madesimo' }, { id: 'site-b', name: 'Seconda sede' }] } } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.apiGet, apiPost: mocks.apiPost }));

const category = { id: 'ski', code: 'ski', name: 'Sci' };
const item: RentalItem = {
  id: 'unit-1', code: '+001', serial_number: null, status: 'active', is_rentable: true, is_bookable: true, notes: 'Nota articolo',
  group: { id: 'race', name: 'RACE' }, variant: {
    id: 'variant-1', brand: 'BLIZZARD', model: 'ANOMALY', year: 2025, category,
    ski_details: { length_cm: 164 }, snowboard_details: null, boot_details: null,
    helmet_details: null, pole_details: null, goggle_details: null, accessory_details: null,
  },
};
const inventory: RentalInventory = { categories: [category], items: [item, { ...item, id: 'unit-2', code: '002', status: 'maintenance' }] };

afterEach(cleanup);
beforeEach(() => {
  mocks.apiGet.mockReset().mockImplementation((path: string) => {
    const unit=inventory.items.find(entry=>path.endsWith(`/rental-inventory/${entry.id}`));
    return Promise.resolve(unit?{item:unit,statistics:{rental_count:3,repair_count:1,rentals_since_last_repair:2,last_repair_at:'2026-01-01T10:00:00Z'}}:inventory);
  });
  mocks.apiPost.mockReset();
  mocks.auth.location = { id: 'site-a', name: 'Madesimo' };
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
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
    fireEvent.click(screen.getByRole('button',{name:'Vedi 002'}));
    expect(await screen.findByText(/In manutenzione/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Chiudi scheda esemplare'}));
    expect(screen.getByText('Tariffa').closest('details')?.open).toBe(false);
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

  it('transfers one code to another authorized location and reloads the warehouse', async () => {
    mocks.apiPost.mockResolvedValue({ id: 'unit-1', code: '+001', from_location_id: 'site-a', to_location_id: 'site-b' });
    render(<RentalInventoryPage />);
    await screen.findByText('ANOMALY');
    fireEvent.click(screen.getByRole('button', { name: 'Apri scheda BLIZZARD ANOMALY 164 cm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vedi +001' }));
    await waitFor(()=>expect((screen.getByRole('button',{name:'Sposta sede'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Sposta sede' }));
    const destination = screen.getByLabelText('Sede di destinazione') as HTMLSelectElement;
    expect([...destination.options].map((entry) => entry.value)).toEqual(['', 'site-b']);
    fireEvent.change(destination, { target: { value: 'site-b' } });
    mocks.apiGet.mockResolvedValue({ ...inventory, items: [inventory.items[1]] });
    fireEvent.click(screen.getByRole('button', { name: 'Conferma spostamento' }));
    await screen.findByText('Articolo +001 spostato da Madesimo a Seconda sede.');
    await screen.findByText('1 variante · 1 articolo');
    expect(mocks.apiPost).toHaveBeenCalledWith('/locations/site-a/rental-inventory/unit-1/transfer', 'token', { destination_location_id: 'site-b' }, expect.any(AbortSignal));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the article in place on transfer errors and blocks double submissions', async () => {
    let fail!: (error: Error) => void;
    mocks.apiPost.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    render(<RentalInventoryPage />);
    await screen.findByText('ANOMALY');
    fireEvent.click(screen.getByRole('button', { name: 'Apri scheda BLIZZARD ANOMALY 164 cm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vedi +001' }));
    await waitFor(()=>expect((screen.getByRole('button',{name:'Sposta sede'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Sposta sede' }));
    fireEvent.change(screen.getByLabelText('Sede di destinazione'), { target: { value: 'site-b' } });
    const confirm = screen.getByRole('button', { name: 'Conferma spostamento' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Chiudi scheda materiale' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => fail(new Error('Articolo assegnato a un noleggio aperto')));
    await screen.findByRole('alert');
    expect(screen.getAllByText('+001').length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'Conferma spostamento' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Annulla spostamento' }));
    expect(screen.queryByLabelText('Sede di destinazione')).toBeNull();
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


it('shows site-wide rental and repair counts independently of table filters', async () => {
  mocks.apiGet.mockResolvedValue({ ...inventory, summary: { currently_rented: 1, currently_in_repair: 1 } });
  render(<RentalInventoryPage />);
  await screen.findByText('ANOMALY');
  const rented = screen.getByRole('heading', { name: 'Attualmente noleggiati' }).closest('article')!;
  const repairs = screen.getByRole('heading', { name: 'Attualmente in riparazione' }).closest('article')!;
  expect(within(rented).getByText('1')).toBeTruthy();
  expect(within(repairs).getByText('1')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Abilitati al noleggio' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Varianti' })).toBeNull();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nonexistent' } });
  expect(within(rented).getByText('1')).toBeTruthy();
  expect(within(repairs).getByText('1')).toBeTruthy();
});


it('opens each physical code with its own characteristics and usage counts', async () => {
  mocks.apiGet.mockImplementation((path:string)=> {
    const unit=inventory.items.find(entry=>path.endsWith(`/rental-inventory/${entry.id}`));
    return Promise.resolve(unit?{item:unit,statistics:{rental_count:unit.id===item.id?3:9,repair_count:1,rentals_since_last_repair:2,last_repair_at:'2026-01-01T10:00:00Z'}}:inventory);
  });
  render(<RentalInventoryPage />);
  await screen.findByText('ANOMALY');
  fireEvent.click(screen.getByRole('button',{name:'Apri scheda BLIZZARD ANOMALY 164 cm'}));
  expect(screen.queryByRole('button',{name:'Sposta +001 di sede'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Vedi +001'}));
  let details=within(screen.getByRole('dialog',{name:'Scheda esemplare +001'}));
  await details.findByText('Numero di noleggi');
  expect(details.getByText('Numero di noleggi').nextElementSibling?.textContent).toBe('3');
  expect(details.getByText('Riparazioni concluse').nextElementSibling?.textContent).toBe('1');
  expect(details.getByText('Noleggi dall’ultima riparazione').nextElementSibling?.textContent).toBe('2');
  expect(details.getByText('Nota articolo')).toBeTruthy();
  fireEvent(screen.getByRole('dialog',{name:'Scheda esemplare +001'}),new Event('cancel',{cancelable:true}));
  expect(screen.queryByRole('dialog',{name:'Scheda esemplare +001'})).toBeNull();
  expect(screen.getByText('Scheda materiale')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Vedi 002'}));
  details=within(screen.getByRole('dialog',{name:'Scheda esemplare 002'}));
  await details.findByText('Numero di noleggi');
  expect(details.getByText('Numero di noleggi').nextElementSibling?.textContent).toBe('9');
});

it('does not display fake zero counts on errors and retries the selected unit', async () => {
  mocks.apiGet.mockImplementation((path:string)=>path.endsWith('/unit-1')?Promise.reject(new Error('Conteggi non disponibili')):Promise.resolve(inventory));
  render(<RentalInventoryPage />);
  await screen.findByText('ANOMALY');
  fireEvent.click(screen.getByRole('button',{name:'Apri scheda BLIZZARD ANOMALY 164 cm'}));
  fireEvent.click(screen.getByRole('button',{name:'Vedi +001'}));
  const details=within(screen.getByRole('dialog',{name:'Scheda esemplare +001'}));
  expect(await details.findByRole('alert')).toHaveProperty('textContent','Conteggi non disponibili');
  expect(details.queryByText('Numero di noleggi')).toBeNull();
  mocks.apiGet.mockResolvedValue({item,statistics:{rental_count:0,repair_count:0,rentals_since_last_repair:0,last_repair_at:null}});
  fireEvent.click(details.getByRole('button',{name:'Riprova conteggi'}));
  await details.findByText('Nessuna riparazione precedente');
  expect(details.getByText('Numero di noleggi').nextElementSibling?.textContent).toBe('0');
});

it('selects individual codes from the row basket and updates the remaining quantity without refetching', async () => {
  let removed: string[] = [];
  mocks.apiGet.mockImplementation(() => Promise.resolve({ ...inventory, items: inventory.items.filter(entry => !removed.includes(entry.id)) }));
  mocks.apiPost.mockImplementation((_path: string, _token: string, body: { item_ids: string[] }) => {
    removed = body.item_ids; return Promise.resolve(body);
  });
  render(<RentalInventoryPage />);
  await screen.findByText('ANOMALY');
  fireEvent.click(screen.getByRole('button', { name: 'Dismetti articoli BLIZZARD ANOMALY 164 cm' }));
  const dialog = screen.getByRole('dialog', { name: 'Dismetti esemplari' });
  expect(mocks.apiPost).not.toHaveBeenCalled();
  expect(within(dialog).getAllByRole('checkbox')).toHaveLength(2);
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /002/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Dismetti 1 esemplare' }));
  await screen.findByText('1 esemplare dismesso dal magazzino di Madesimo.');
  expect(mocks.apiPost).toHaveBeenCalledWith('/locations/site-a/rental-inventory/archive', 'token', { item_ids: ['unit-1'] }, expect.any(AbortSignal));
  await screen.findByText('1 variante · 1 articolo');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(mocks.apiGet.mock.calls.filter(([path]) => path === '/locations/site-a/rental-inventory')).toHaveLength(1);
});

it('opens single-code deletion without deleting sibling units or closing the material on cancel', async () => {
  render(<RentalInventoryPage />);
  await screen.findByText('ANOMALY');
  fireEvent.click(screen.getByRole('button', { name: 'Apri scheda BLIZZARD ANOMALY 164 cm' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dismetti esemplare +001' }));
  const confirmation = screen.getByRole('dialog', { name: 'Dismetti esemplari' });
  expect(within(confirmation).getAllByRole('checkbox')).toHaveLength(1);
  expect(within(confirmation).getByRole('checkbox', { name: /\+001/ })).toBeTruthy();
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Annulla' }));
  expect(mocks.apiPost).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Vedi 002' })).toBeTruthy();
});

it('keeps the warehouse and confirmation intact when a rental or repair blocks deletion', async () => {
  mocks.apiPost.mockRejectedValue(new Error('Esemplare ancora da riconsegnare.'));
  render(<RentalInventoryPage />);
  await screen.findByText('ANOMALY');
  fireEvent.click(screen.getByRole('button', { name: 'Dismetti articoli BLIZZARD ANOMALY 164 cm' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Dismetti 2 esemplari' }));
  await screen.findByRole('alert');
  expect(screen.getByText('1 variante · 2 articoli')).toBeTruthy();
  expect(screen.getByRole('dialog')).toBeTruthy();
});

it('does not allow the shared generic poles to be removed', async () => {
  mocks.apiGet.mockResolvedValue({ categories: [category], items: [{ ...item, is_generic: true, code: '1' }] });
  render(<RentalInventoryPage />);
  await screen.findByText('ANOMALY');
  expect((screen.getByRole('button', { name: 'Dismetti articoli BLIZZARD ANOMALY 164 cm' }) as HTMLButtonElement).disabled).toBe(true);
});


it('keeps the same material dialog, filters and tariff section open after deleting single codes', async () => {
  mocks.apiGet.mockImplementation((path: string) => path.includes('/rental-rates') ? Promise.resolve({ rates: [] }) : Promise.resolve({ ...inventory, summary: { currently_rented: 0, currently_in_repair: 1 } }));
  mocks.apiPost.mockImplementation((_path: string, _token: string, body: { item_ids: string[] }) => Promise.resolve(body));
  render(<RentalInventoryPage />);
  await screen.findByText('ANOMALY');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ANOMALY' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apri scheda BLIZZARD ANOMALY 164 cm' }));
  const materialDialog = screen.getByRole('dialog', { name: 'BLIZZARD ANOMALY' });
  const tariff = within(materialDialog).getByText('Tariffa').closest('details')!;
  fireEvent.click(within(materialDialog).getByText('Tariffa'));
  expect(tariff.open).toBe(true);
  fireEvent.click(within(materialDialog).getByRole('button', { name: 'Dismetti esemplare +001' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Dismetti esemplari' })).getByRole('button', { name: 'Dismetti 1 esemplare' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dismetti esemplari' })).toBeNull());
  expect(screen.getByRole('dialog', { name: 'BLIZZARD ANOMALY' })).toBe(materialDialog);
  expect(tariff.open).toBe(true);
  expect(within(materialDialog).queryByText('+001')).toBeNull();
  expect(within(materialDialog).getByRole('button', { name: 'Vedi 002' })).toBeTruthy();
  expect(within(materialDialog).getByText('Quantità').nextElementSibling?.textContent).toBe('1');
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('ANOMALY');
  expect(mocks.apiGet.mock.calls.filter(([path]) => path === '/locations/site-a/rental-inventory')).toHaveLength(1);
  fireEvent.click(within(materialDialog).getByRole('button', { name: 'Dismetti esemplare 002' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Dismetti esemplari' })).getByRole('button', { name: 'Dismetti 1 esemplare' }));
  await within(materialDialog).findByText('Nessun esemplare presente nel magazzino.');
  expect(screen.getByRole('dialog', { name: 'BLIZZARD ANOMALY' })).toBe(materialDialog);
  expect(within(materialDialog).getByText('Quantità').nextElementSibling?.textContent).toBe('0');
  expect(tariff.open).toBe(true);
  const repairs = screen.getByText('Attualmente in riparazione').closest('article')!;
  expect(within(repairs).getByText('0')).toBeTruthy();
});
