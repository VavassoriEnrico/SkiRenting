import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeneralInventoryPage } from './GeneralInventoryPage';
import { groupGeneralItems, groupSaleStock, rowQuantity, rowSalePrice, salePrice, sortGeneralRows } from './general-inventory';
import type { GeneralItem, SaleStock } from './general-inventory';
import type { RentalVariant } from './rental-inventory';

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), auth: { session: { access_token: 'token' }, location: { id: 'a', name: 'Madesimo' } } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.apiGet, apiPost: mocks.apiPost }));
const locations = [{ id: 'a', name: 'Madesimo' }, { id: 'b', name: 'Boscone' }];
const category = { id: 'ski', code: 'ski', name: 'Sci' };
const first: GeneralItem = {
  id: 'one', code: 'SKI001', location: locations[0], is_currently_rented:true, serial_number: 'SERIAL1', notes: 'Lamina destra',
  status: 'active', is_rentable: true, is_bookable: true, group: { id: 'race', name: 'RACE' },
  variant: {
    id: 'v1', brand: 'BLIZZARD', model: 'ANOMALY', year: 2025, category,
    ski_details: { length_cm: 164 }, snowboard_details: null,
    boot_details: null, helmet_details: null, pole_details: null, goggle_details: null, accessory_details: null,
  },
};
const second: GeneralItem = {
  ...first, id: 'two', code: 'SKI002', location: locations[1], is_currently_rented:false, notes: 'Soletta', serial_number: null,
  variant: { ...first.variant, id: 'v2' },
  group: { id: 'allmountain', name: 'ALLMOUNTAIN' }, status: 'maintenance',
  open_repair: { id: 'repair', repair_type: 'wax', sent_at: '2026-11-22T10:00:00Z' },
};
const inventory = { locations, categories: [category], items: [first, second], summary: {currently_rented:1,currently_in_repair:1} };
beforeEach(() => {
  mocks.apiGet.mockReset().mockImplementation((path:string)=>{
    const item=inventory.items.find(unit=>path===`/locations/${unit.location.id}/rental-inventory/${unit.id}`);
    return Promise.resolve(item?{item,statistics:{rental_count:7,repair_count:2,rentals_since_last_repair:3,last_repair_at:'2026-01-01T10:00:00Z'}}:inventory);
  });
  mocks.apiPost.mockReset();
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
    { boot_details: { size_label: '42' } },
    { helmet_details: { size_label: 'M' } },
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
    expect(screen.queryByText('2 esemplari · 1 varianti · Sedi: Madesimo, Boscone')).toBeNull();
    expect(screen.queryByText('SKI001')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Apri esemplari/ }));
    const madesimo = within(screen.getByRole('region', { name: 'Esemplari a Madesimo' }));
    const boscone = within(screen.getByRole('region', { name: 'Esemplari a Boscone' }));
    expect(madesimo.getByText('SKI001')).toBeTruthy();
    expect(madesimo.queryByText('SKI002')).toBeNull();
    expect(madesimo.queryByText('Lamina destra')).toBeNull();
    expect(madesimo.queryByRole('columnheader',{name:'Matricola'})).toBeNull();
    expect(madesimo.getByRole('button',{name:'Vedi SKI001'})).toBeTruthy();
    expect(boscone.getByText('SKI002')).toBeTruthy();
    expect(boscone.getByText(/In riparazione/)).toBeTruthy();
    expect(screen.queryByText(/Note modello/)).toBeNull();
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


const saleItems:SaleStock[] = [
  { id:'stock1', variant:first.variant, location:locations[0], quantity:3, price:199.90, notes:'Con attacchi' },
  { id:'stock2', variant:{...first.variant,id:'equivalent'}, location:locations[1], quantity:2, price:210, notes:null },
];

describe('Magazzino generale vendite', () => {
  it('loads empty real stock with the same filters and sorting controls', async () => {
    mocks.apiGet.mockResolvedValue({ locations, categories:[category], items:[] });
    render(<GeneralInventoryPage mode="sale" />);
    expect(await screen.findByText('Nessun materiale registrato nelle sedi autorizzate')).toBeTruthy();
    expect(mocks.apiGet).toHaveBeenCalledWith('/sale-inventory','token',expect.any(AbortSignal));
    expect(screen.getByRole('heading',{name:'Magazzino generale vendite'})).toBeTruthy();
    expect(screen.getByRole('combobox',{name:'Ordina per'})).toBeTruthy();
    expect(screen.getByRole('columnheader',{name:'Prezzo unitario'})).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Aggiorna elenco'})).toBeNull();
    expect(screen.queryByText('ANOMALY')).toBeNull();
  });

  it('sums actual quantities, shows price ranges and opens real prices for each site', async () => {
    mocks.apiGet.mockResolvedValue({ locations, categories:[category], items:saleItems });
    render(<GeneralInventoryPage mode="sale" />);
    await screen.findByText('ANOMALY');
    expect(screen.getByText(/5 esemplari/)).toBeTruthy();
    expect(screen.getByText(/199,90\s€ – 210,00\s€/)).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'Boscone'}});
    fireEvent.click(screen.getByRole('button',{name:/Apri esemplari/}));
    const madesimo=within(screen.getByRole('region',{name:'Esemplari a Madesimo'}));
    const boscone=within(screen.getByRole('region',{name:'Esemplari a Boscone'}));
    expect(madesimo.getByText('3')).toBeTruthy();
    expect(madesimo.getByText(/199,90\s€/)).toBeTruthy();
    expect(madesimo.getByText('Con attacchi')).toBeTruthy();
    expect(boscone.getByText('2')).toBeTruthy();
    expect(boscone.getByText(/210,00\s€/)).toBeTruthy();
    expect(screen.queryByText('Stato magazzino')).toBeNull();
    expect(screen.queryByText('SKI001')).toBeNull();
  });

  it('distinguishes zero prices from unknown prices and sorts quantities and prices numerically', () => {
    const rows=groupSaleStock([
      ...saleItems,
      {...saleItems[0],id:'stock3',variant:{...first.variant,model:'ZERO'},quantity:1,price:0},
      {...saleItems[0],id:'stock4',variant:{...first.variant,model:'UNKNOWN'},quantity:10,price:null},
    ]);
    expect(sortGeneralRows(rows,'quantity','desc').map(rowQuantity)).toEqual([10,5,1]);
    expect(sortGeneralRows(rows,'price','asc').map(row=>row.variant.model)).toEqual(['ZERO','ANOMALY','UNKNOWN']);
    expect(rowSalePrice(rows.find(row=>row.variant.model==='ZERO')!)).toBe(salePrice(0));
    expect(rowSalePrice(rows.find(row=>row.variant.model==='UNKNOWN')!)).toBe('Da definire');
    const mixed=groupSaleStock([...saleItems,{...saleItems[0],id:'unknown-price',price:null}]);
    expect(rowSalePrice(mixed[0])).toContain('altri da definire');
  });
});


it('shows the three rental cards across all sites without changing totals when filtering', async () => {
  mocks.auth.location=locations[1];
  render(<GeneralInventoryPage />);
  await screen.findByText('ANOMALY');
  const summary=within(screen.getByRole('region',{name:'Riepilogo magazzino generale noleggi'}));
  const cardValue=(name:string)=>summary.getByRole('heading',{name}).closest('article')!.querySelector('.stat-value')!.textContent;
  expect(cardValue('Articoli totali')).toBe('2');
  expect(cardValue('Attualmente noleggiati')).toBe('1');
  expect(cardValue('Attualmente in riparazione')).toBe('1');
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'nessuna corrispondenza'}});
  expect(cardValue('Articoli totali')).toBe('2');
  expect(cardValue('Attualmente noleggiati')).toBe('1');
  expect(mocks.apiGet).toHaveBeenCalledTimes(1);
});

it('keeps rental-specific cards out of the sales warehouse', async () => {
  mocks.apiGet.mockResolvedValue({locations,categories:[category],items:[]});
  render(<GeneralInventoryPage mode="sale" />);
  await screen.findByText('Nessun materiale registrato nelle sedi autorizzate');
  expect(screen.queryByRole('heading',{name:'Attualmente noleggiati'})).toBeNull();
});


it('uses the same category buttons as the local warehouse and resets search on category changes', async () => {
  const snowboard={id:'snow',code:'snowboard',name:'Snowboard'};
  mocks.apiGet.mockResolvedValue({...inventory,categories:[snowboard,category],items:[first,second,{
    ...first,id:'snow-unit',code:'SNOW001',variant:{...first.variant,model:'TAVOLA',category:snowboard,ski_details:null,snowboard_details:{length_cm:150}},
  }]});
  render(<GeneralInventoryPage />);
  await screen.findByText('ANOMALY');
  const buttons=within(screen.getByRole('group',{name:'Filtra il materiale per categoria'}));
  const ski=buttons.getByRole('button',{name:/Sci\s*2/});
  const snow=buttons.getByRole('button',{name:/Snowboard\s*1/});
  expect(ski.getAttribute('aria-pressed')).toBe('true');
  expect(screen.queryByRole('combobox',{name:'Categoria materiale'})).toBeNull();
  expect(screen.queryByText('TAVOLA')).toBeNull();
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'BLIZZARD'}});
  fireEvent.click(snow);
  expect(snow.getAttribute('aria-pressed')).toBe('true');
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  expect(screen.getByText('TAVOLA')).toBeTruthy();
  expect(screen.queryByText('ANOMALY')).toBeNull();
  expect(screen.queryByText(/esemplari · .*varianti · Sedi:/)).toBeNull();
});


it('shows independent per-site unit counts, including empty sites, unaffected by filters', async () => {
  mocks.apiGet.mockResolvedValue({...inventory,locations:[...locations,{id:'empty',name:'Sede vuota'}],items:[first,second,{...first,id:'extra',code:'SKI003'}]});
  render(<GeneralInventoryPage />);
  await screen.findByText('ANOMALY');
  const cards=within(screen.getByRole('region',{name:'Articoli per sede'}));
  const value=(name:string)=>cards.getByRole('heading',{name}).closest('article')!.querySelector('.stat-value')!.textContent;
  expect(value('Articoli a Madesimo')).toBe('2');
  expect(value('Articoli a Boscone')).toBe('1');
  expect(value('Articoli a Sede vuota')).toBe('0');
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'SKI002'}});
  expect(value('Articoli a Madesimo')).toBe('2');
  expect(value('Articoli a Boscone')).toBe('1');
});


it('opens the individual code using its actual site and shows usage counters and characteristics', async () => {
  render(<GeneralInventoryPage />);
  await screen.findByText('ANOMALY');
  fireEvent.click(screen.getByRole('button',{name:/Apri esemplari/}));
  fireEvent.click(screen.getByRole('button',{name:'Vedi SKI002'}));
  const sheet=screen.getByRole('dialog',{name:'Scheda esemplare SKI002'});
  const details=within(sheet);
  await details.findByText('Numero di noleggi');
  expect(details.getByText('Numero di noleggi').nextElementSibling?.textContent).toBe('7');
  expect(details.getByText('Riparazioni concluse').nextElementSibling?.textContent).toBe('2');
  expect(details.getByText('Noleggi dall’ultima riparazione').nextElementSibling?.textContent).toBe('3');
  expect(details.getByText('Sede').nextElementSibling?.textContent).toBe('Boscone');
  expect(details.getByText('Soletta')).toBeTruthy();
  expect(details.getByRole('button',{name:'Sposta articolo in sede Madesimo'})).toBeTruthy();
  expect(details.queryByRole('button',{name:'Sposta articolo in sede Boscone'})).toBeNull();
  expect(mocks.apiGet).toHaveBeenCalledWith('/locations/b/rental-inventory/two','token',expect.any(AbortSignal));
  fireEvent(sheet,new Event('cancel',{cancelable:true}));
  expect(screen.queryByRole('dialog',{name:'Scheda esemplare SKI002'})).toBeNull();
  expect(screen.getByRole('button',{name:'Vedi SKI002'})).toBeTruthy();
});

it('moves only the selected code and refreshes both site lists and site cards after success', async () => {
  let resolve!:(result:unknown)=>void;
  mocks.apiPost.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  render(<GeneralInventoryPage />);
  await screen.findByText('ANOMALY');
  fireEvent.click(screen.getByRole('button',{name:/Apri esemplari/}));
  fireEvent.click(screen.getByRole('button',{name:'Vedi SKI002'}));
  const button=screen.getByRole('button',{name:'Sposta articolo in sede Madesimo'});
  await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button); fireEvent.click(button);
  expect(mocks.apiPost).toHaveBeenCalledTimes(1);
  expect(mocks.apiPost).toHaveBeenCalledWith('/locations/b/rental-inventory/two/transfer','token',{destination_location_id:'a'},expect.any(AbortSignal));
  expect((screen.getByRole('button',{name:'Chiudi scheda esemplare'}) as HTMLButtonElement).disabled).toBe(true);
  expect(within(screen.getByRole('region',{name:'Esemplari a Boscone'})).getByText('SKI002')).toBeTruthy();
  await act(async()=>resolve({id:'two',code:'SKI002',from_location_id:'b',to_location_id:'a'}));
  await screen.findByText('Articolo SKI002 spostato in sede Madesimo.');
  expect(screen.queryByRole('dialog',{name:'Scheda esemplare SKI002'})).toBeNull();
  expect(within(screen.getByRole('region',{name:'Esemplari a Madesimo'})).getByText('SKI002')).toBeTruthy();
  expect(screen.queryByRole('region',{name:'Esemplari a Boscone'})).toBeNull();
  expect(screen.getByText('Nessun esemplare in questa sede.')).toBeTruthy();
  const cards=within(screen.getByRole('region',{name:'Articoli per sede'}));
  expect(cards.getByRole('heading',{name:'Articoli a Madesimo'}).closest('article')!.querySelector('.stat-value')!.textContent).toBe('2');
  expect(cards.getByRole('heading',{name:'Articoli a Boscone'}).closest('article')!.querySelector('.stat-value')!.textContent).toBe('0');
  const destination=within(screen.getByRole('region',{name:'Riepilogo sede Madesimo'}));
  expect(destination.getByRole('heading',{name:'Attualmente in riparazione'}).closest('article')!.querySelector('.stat-value')!.textContent).toBe('1');
});

it('preserves site lists on a transfer error and allows retry', async () => {
  mocks.apiPost.mockRejectedValueOnce(new Error('Articolo assegnato a un noleggio aperto'));
  render(<GeneralInventoryPage />);
  await screen.findByText('ANOMALY');
  fireEvent.click(screen.getByRole('button',{name:/Apri esemplari/}));
  fireEvent.click(screen.getByRole('button',{name:'Vedi SKI001'}));
  const button=screen.getByRole('button',{name:'Sposta articolo in sede Boscone'});
  await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','Articolo assegnato a un noleggio aperto');
  expect((button as HTMLButtonElement).disabled).toBe(false);
  expect(within(screen.getByRole('region',{name:'Esemplari a Madesimo'})).getByText('SKI001')).toBeTruthy();
  expect(within(screen.getByRole('region',{name:'Esemplari a Boscone'})).queryByText('SKI001')).toBeNull();
});


it('shows total, rented and repairing cards for each site, including zero counts', async () => {
  mocks.apiGet.mockResolvedValue({...inventory,locations:[...locations,{id:'empty',name:'Sede vuota'}]});
  render(<GeneralInventoryPage />);
  await screen.findByText('ANOMALY');
  const value=(site:string,label:string)=>within(screen.getByRole('region',{name:`Riepilogo sede ${site}`})).getByRole('heading',{name:label}).closest('article')!.querySelector('.stat-value')!.textContent;
  expect(value('Madesimo','Articoli a Madesimo')).toBe('1');
  expect(value('Madesimo','Attualmente noleggiati')).toBe('1');
  expect(value('Madesimo','Attualmente in riparazione')).toBe('0');
  expect(value('Boscone','Attualmente noleggiati')).toBe('0');
  expect(value('Boscone','Attualmente in riparazione')).toBe('1');
  expect(value('Sede vuota','Attualmente noleggiati')).toBe('0');
  expect(value('Sede vuota','Attualmente in riparazione')).toBe('0');
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'non presente'}});
  expect(value('Madesimo','Attualmente noleggiati')).toBe('1');
  expect(value('Boscone','Attualmente in riparazione')).toBe('1');
});
