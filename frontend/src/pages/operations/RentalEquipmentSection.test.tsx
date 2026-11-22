import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RentalInventory, RentalItem } from '../inventory/rental-inventory';
import { OperationsPage } from './OperationsPage';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(),
  auth: { session: { access_token: 'token' }, location: { id: 'site-a', name: 'Madesimo' } },
}));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get, apiPost: mocks.post }));

const category = { id: 'ski', code: 'ski', name: 'Sci' };
const item: RentalItem = {
  id: 'unit-one', code: '+001', serial_number: null, status: 'active', is_rentable: true, is_bookable: true, notes: null,
  group: { id: 'race', name: 'RACE' }, variant: {
    id: 'variant-one', brand: 'BLIZZARD', model: 'ANOMALY', year: 2025, notes: null, category,
    ski_details: { length_cm: 164, radius_m: null, style: null }, snowboard_details: null, boot_details: null,
    helmet_details: null, pole_details: null, goggle_details: null, accessory_details: null,
  },
};
const inventory: RentalInventory = {
  categories: [category, { id: 'helmet', code: 'helmet', name: 'Caschi' }],
  items: [item, { ...item, id: 'unit-two', code: '0002', status: 'maintenance' }, {
    ...item, id: 'helmet-one', code: 'H001', variant: { ...item.variant, id: 'helmet-variant', brand: 'POC', model: 'OBEX', category: { id: 'helmet', code: 'helmet', name: 'Caschi' }, ski_details: null, helmet_details: { size_label: 'M', color: 'Nero' } },
  }],
};

beforeEach(() => {
  mocks.auth.location = { id: 'site-a', name: 'Madesimo' };
  mocks.get.mockReset().mockImplementation((path: string) => Promise.resolve(path === '/customers' || path === '/hotels' ? [] : inventory));
  mocks.post.mockReset();
  HTMLDialogElement.prototype.showModal = vi.fn(function(this:HTMLDialogElement) { this.setAttribute('open',''); });
});
afterEach(cleanup);

async function open() {
  const view = render(<OperationsPage mode="rental" />);
  await screen.findByRole('button', { name: 'Aggiungi codice' });
  return view;
}
function scan(code: string) {
  fireEvent.change(screen.getByLabelText('Codice materiale'), { target: { value: code } });
  fireEvent.submit(screen.getByLabelText('Codice materiale').closest('form')!);
}

describe('Materiale del noleggio', () => {
  it('adds a scanned exact code, rejects duplicates, removes and allows adding it again', async () => {
    await open();
    expect(mocks.get).toHaveBeenCalledWith('/locations/site-a/rental-inventory?available_only=true', 'token', expect.any(AbortSignal));
    scan(' +001 ');
    expect(screen.getByText('Articoli selezionati (1)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rimuovi +001' })).toBeTruthy();
    expect((screen.getByLabelText('Codice materiale') as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(screen.getByLabelText('Codice materiale'));
    scan('+001');
    expect(screen.getByRole('alert').textContent).toContain('già stato aggiunto');
    expect(screen.getByText('Articoli selezionati (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi +001' }));
    expect(screen.getByText('Articoli selezionati (0)')).toBeTruthy();
    scan('+001');
    expect(screen.getByText('Articoli selezionati (1)')).toBeTruthy();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('distinguishes missing codes from articles in maintenance', async () => {
    await open(); scan('NOT-IN-THIS-SITE');
    expect(screen.getByRole('alert').textContent).toContain('Codice non trovato o non disponibile per il noleggio nel magazzino di Madesimo');
    scan('0002');
    expect(screen.getByRole('alert').textContent).toContain('manutenzione');
    expect(screen.getByText('Articoli selezionati (0)')).toBeTruthy();
  });

  it.each([
    { status: 'sold' as const }, { is_rentable: false }, { is_bookable: false },
  ])('blocks non-eligible items: %o', async (overrides) => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(path === '/customers' || path === '/hotels' ? [] : { ...inventory, items: [{ ...item, ...overrides }] }));
    await open(); scan('+001');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rimuovi +001' })).toBeNull();
  });

  it('filters manual results by category, model and size, then adds the chosen code', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Ricerca manuale' }));
    fireEvent.change(screen.getByLabelText('Cerca materiale'), { target: { value: 'BLIZZARD 164' } });
    expect(screen.getByRole('button', { name: 'Aggiungi +001' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aggiungi H001' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Categoria materiale'), { target: { value: 'helmet' } });
    expect(screen.getByText('Nessun materiale trovato.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Cerca materiale'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi H001' }));
    expect(screen.getByText('Articoli selezionati (1)')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Già aggiunto H001' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('can find and add an item after the first page of manual results', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(path === '/customers' || path === '/hotels' ? [] : {
      ...inventory, items: Array.from({ length: 21 }, (_, index) => ({ ...item, id: `unit-${index}`, code: `CODE-${index}` })),
    }));
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Ricerca manuale' }));
    expect(screen.queryByRole('button', { name: 'Aggiungi CODE-20' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Successivi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi CODE-20' }));
    expect(screen.getByRole('button', { name: 'Rimuovi CODE-20' })).toBeTruthy();
  });

  it('retains selected items when rental dates change', async () => {
    await open(); scan('+001');
    fireEvent.change(screen.getByLabelText('Data di inizio *'), { target: { value: '2026-12-01' } });
    const region = screen.getByRole('region', { name: 'Materiale' });
    expect(within(region).getByRole('button', { name: 'Rimuovi +001' })).toBeTruthy();
  });

  it('reloads availability for the chosen dates and removes unavailable selections', async () => {
    await open(); scan('+001');
    mocks.get.mockImplementation((path: string) => Promise.resolve(path.includes('starts_on=2026-12-01')
      ? { ...inventory, items: [inventory.items[2]] } : inventory));
    fireEvent.change(screen.getByLabelText('Data di inizio *'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Rientro previsto *'), { target: { value: '2026-12-03' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Rimuovi +001' })).toBeNull());
    expect(mocks.get).toHaveBeenCalledWith('/locations/site-a/rental-inventory?available_only=true&starts_on=2026-12-01&ends_on=2026-12-03', 'token', expect.any(AbortSignal));
    expect(screen.getByRole('alert').textContent).toContain('non più disponibile');
    fireEvent.click(screen.getByRole('button', { name: 'Ricerca manuale' }));
    expect(screen.queryByRole('button', { name: 'Aggiungi +001' })).toBeNull();
    scan('+001');
    expect(screen.getByRole('alert').textContent).toContain('non disponibile');
    expect(screen.getByText('Articoli selezionati (0)')).toBeTruthy();
  });

  it.each(['code','manual'])('asks before selecting a material in repair through %s', async (mode) => {
    const repairing: RentalItem = { ...item,status:'maintenance',open_repair:{id:'repair',repair_type:'edges_and_wax',sent_at:'2026-11-22T10:00:00Z'} };
    mocks.get.mockImplementation((path:string)=>Promise.resolve(path==='/customers'||path==='/hotels'?[]:{...inventory,items:[repairing]}));
    mocks.post.mockResolvedValue({...item,open_repair:null});
    await open();
    if(mode==='manual') {
      fireEvent.click(screen.getByRole('button',{name:'Ricerca manuale'}));
      expect(screen.getByText('In riparazione')).toBeTruthy();
      fireEvent.click(screen.getByRole('button',{name:'Aggiungi +001'}));
    } else scan('+001');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Articoli selezionati (0)')).toBeTruthy();
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Annulla'}));
    await screen.findByRole('button',{name:'Aggiungi codice'});
    expect(mocks.post).not.toHaveBeenCalled();
    scan('+001');
    fireEvent.click(screen.getByRole('button',{name:'Sì, noleggia e concludi riparazione'}));
    await screen.findByRole('button',{name:'Rimuovi +001'});
    expect(mocks.post).toHaveBeenCalledWith('/locations/site-a/repairs/repair/complete','token',{rental_inventory_id:'unit-one'},expect.any(AbortSignal));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not add the article if completing its repair fails', async () => {
    const repairing: RentalItem = {...item,open_repair:{id:'repair',repair_type:'wax',sent_at:'2026-11-22T10:00:00Z'}};
    mocks.get.mockImplementation((path:string)=>Promise.resolve(path==='/customers'||path==='/hotels'?[]:{...inventory,items:[repairing]}));
    mocks.post.mockRejectedValue(new Error('Riparazione cambiata'));
    await open();scan('+001');
    fireEvent.click(screen.getByRole('button',{name:'Sì, noleggia e concludi riparazione'}));
    await screen.findByRole('alert');
    expect(screen.getByText('Articoli selezionati (0)')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('reports load errors and retries without claiming the inventory is empty', async () => {
    mocks.get.mockImplementation((path: string) => path === '/customers' || path === '/hotels' ? Promise.resolve([]) : Promise.reject(new Error('Errore magazzino')));
    render(<OperationsPage mode="rental" />);
    await screen.findByRole('alert');
    expect(screen.queryByText('Nessun materiale trovato.')).toBeNull();
    mocks.get.mockResolvedValue(inventory);
    fireEvent.click(screen.getByRole('button', { name: 'Riprova caricamento materiale' }));
    await screen.findByRole('button', { name: 'Aggiungi codice' });
  });

  it('clears the draft and aborts an old site request when the selected site changes', async () => {
    const view = await open(); scan('+001');
    let complete!: (value: RentalInventory) => void;
    let oldSignal!: AbortSignal;
    mocks.auth.location = { id: 'site-b', name: 'Seconda sede' };
    mocks.get.mockImplementation((path: string, _token: string, signal: AbortSignal) => {
      if (path === '/customers' || path === '/hotels') return Promise.resolve([]);
      oldSignal = signal;
      return new Promise((resolve) => { complete = resolve; });
    });
    view.rerender(<OperationsPage mode="rental" />);
    await screen.findByText('Caricamento materiale…');
    expect(screen.queryByRole('button', { name: 'Rimuovi +001' })).toBeNull();
    mocks.auth.location = { id: 'site-c', name: 'Terza sede' };
    mocks.get.mockImplementation((path: string) => Promise.resolve(path === '/customers' || path === '/hotels' ? [] : { categories: [], items: [] }));
    view.rerender(<OperationsPage mode="rental" />);
    await screen.findByRole('button', { name: 'Aggiungi codice' });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => complete(inventory));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Rimuovi +001' })).toBeNull());
    scan('+001');
    expect(screen.getByRole('alert').textContent).toContain('Terza sede');
  });
});
