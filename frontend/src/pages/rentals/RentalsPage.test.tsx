import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryRouter } from 'react-router-dom';
import { RentalsPage } from './RentalsPage';
import { UnifiedRentalsPage } from './UnifiedRentalsPage';
import { historyDuration, type HistoryBooking, type HistoryDetails } from './rental-history';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete:vi.fn(), auth: { session: { access_token: 'token' }, location: { id: 'site-a', name: 'Madesimo' }, operator: { profile: { id: 'operator', name: 'Banco' } } } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get, apiPost: mocks.post,apiDelete:mocks.delete }));
const booking: HistoryBooking = {
  id: 'booking-one', booking_number: 125, customer_id: 'customer', location_id: 'site-a',
  customer: { id: 'customer', first_name: 'Mario', last_name: 'Rossi', email: 'mario@example.test', phone: '+39 333-001234', notes: 'Nota cliente' },
  hotel: { id: 'hotel', name: 'Albergo Test' }, starts_on: '2026-12-01', ends_on: '2026-12-03', status: 'confirmed',
  discount_percent: '15', notes: 'Nota prenotazione', created_by: 'operator', created_at: '2026-11-21T10:00:00Z', updated_at: '2026-11-21T12:00:00Z',
  item_count: 1, returned_item_count: 0, subtotal: '100', discount_amount: '15', total: '85.00', paid_amount: '30', balance: '55.00',
};
const second: HistoryBooking = { ...booking, id: 'booking-two', booking_number: 126, status: 'completed', returned_item_count: 1, balance: '0', paid_amount: '85', customer: { ...booking.customer, first_name: 'Anna', last_name: 'Bianchi', email: 'anna@example.test', phone: '333009999' } };
const detail: HistoryDetails = { ...booking,
  items: [{ id: 'line', rental_inventory_id: 'inventory', code_snapshot: '+001', brand_snapshot: 'Marca storica', model_snapshot: 'Modello storico', size_snapshot: '164 cm', daily_price: '20', amount: '100', delivered_at: null, returned_at: null, created_at: booking.created_at, updated_at: booking.updated_at }],
  payments: [{ id: 'payment', payment_method: 'Contanti', amount: '30', paid_at: '2026-11-21T11:30:00Z', created_by: 'operator', notes: 'Nota pagamento', created_at: '2026-11-21T12:00:00Z' }],
};
beforeEach(() => {
  mocks.post.mockReset();
  mocks.delete.mockReset();
  mocks.auth.location = { id: 'site-a', name: 'Madesimo' };
  mocks.get.mockReset().mockImplementation((path: string) => Promise.resolve(path.endsWith('scope=all') ? [booking, second] : detail));
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
});
afterEach(cleanup);

async function open() { const view = render(<RentalsPage />); await screen.findByText('Mario Rossi'); return view; }

describe('Storico reale di tutti i noleggi', () => {
  it('loads the selected site and shows new and completed bookings', async () => {
    await open();
    expect(mocks.get).toHaveBeenCalledWith('/locations/site-a/rental-bookings?scope=all', 'token', expect.any(AbortSignal));
    expect(screen.getAllByText('Prenotato').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Apri noleggio 126' })).toBeTruthy();
    expect(screen.queryByText('Dati dimostrativi')).toBeNull();
  });

  it.each(['ROSSI mario', 'mario@example', '333001234', '125'])('searches customer/contact/number: %s', async (value) => {
    await open();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value } });
    expect(screen.getByText('Mario Rossi')).toBeTruthy();
    expect(screen.queryByText('Anna Bianchi')).toBeNull();
  });

  it('filters state and inclusive period and can reset them', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Stato noleggio'), { target: { value: 'completed' } });
    expect(screen.queryByText('Mario Rossi')).toBeNull();
    fireEvent.change(screen.getByLabelText('Dal'), { target: { value: '2026-12-03' } });
    expect(screen.getByText('Anna Bianchi')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Dal'), { target: { value: '2026-12-04' } });
    expect(screen.getByText('Nessun noleggio corrisponde ai filtri')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Azzera filtri' })[0]);
    expect(screen.getByText('Mario Rossi')).toBeTruthy();
  });

  it('opens the full readonly detail with notes, historical material and payment timestamps', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Apri noleggio 125' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('heading', { name: 'Noleggio n. 125' });
    const period = within(dialog).getByRole('region', { name: 'Periodo del noleggio' });
    expect(within(period).getByText('01 dic 2026')).toBeTruthy();
    expect(within(period).getByText('03 dic 2026')).toBeTruthy();
    expect(within(period).getByText('3 giorni')).toBeTruthy();
    expect(within(dialog).getByText('Nota prenotazione')).toBeTruthy();
    expect(within(dialog).getByText('Nota cliente')).toBeTruthy();
    expect(within(dialog).getByText('Nota pagamento')).toBeTruthy();
    expect(within(dialog).getByText('Marca storica')).toBeTruthy();
    expect(within(dialog).getByText('21/11/26, 12:30')).toBeTruthy();
    expect(within(dialog).getAllByText('Banco').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Residuo').parentElement?.textContent?.replace(/\s/g, '')).toContain('55,00€');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Chiudi dettaglio noleggio' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('uses material and balance to distinguish completed, unpaid and outstanding rentals', async () => {
    const yellow: HistoryBooking = { ...booking, id: 'yellow', booking_number: 127, status: 'active', returned_item_count: 1 };
    const red: HistoryBooking = { ...booking, id: 'red', booking_number: 128, status: 'active' };
    const preparing: HistoryBooking = { ...booking, id: 'preparing', booking_number: 129, status: 'preparing' };
    const cancelled: HistoryBooking = { ...second, id: 'cancelled', booking_number: 130, status: 'cancelled' };
    mocks.get.mockResolvedValue([booking, second, yellow, red, preparing, cancelled]);
    render(<RentalsPage />);
    await screen.findByRole('button', { name: 'Apri noleggio 125' });
    for (const [number, label, state] of [
      [125, 'Prenotato', 'confirmed'], [126, 'Concluso', 'completed'],
      [127, 'Concluso · da saldare', 'awaiting_payment'], [128, 'Da restituire', 'active'],
      [129, 'In preparazione', 'preparing'], [130, 'Annullato', 'cancelled'],
    ]) {
      const row = screen.getByRole('button', { name: `Apri noleggio ${number}` }).closest('tr')!;
      expect(within(row).getByText(String(label)).classList.contains(`history-status-${state}`)).toBe(true);
    }
    fireEvent.change(screen.getByLabelText('Stato noleggio'), { target: { value: 'awaiting_payment' } });
    expect(screen.getByRole('button', { name: 'Apri noleggio 127' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Apri noleggio 126' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apri noleggio 128' })).toBeNull();
  });

  it('shows the same unpaid completed status in the booking detail', async () => {
    const returned = { ...detail, status: 'active', returned_item_count: 1, items: detail.items.map((item) => ({ ...item, returned_at: '2026-12-03T10:00:00Z' })) };
    mocks.get.mockImplementation((path: string) => Promise.resolve(path.endsWith('scope=all') ? [booking] : returned));
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Apri noleggio 125' }));
    const dialog = screen.getByRole('dialog');
    const badge = await within(dialog).findByText('Concluso · da saldare');
    expect(badge.classList.contains('history-status-awaiting_payment')).toBe(true);
  });

  it.each([
    ['row', '55', '0', 'completed'],
    ['detail', '55', '0', 'completed'],
    ['already completed', '55', '0', 'completed'],
    ['row', '10', '45', 'awaiting_payment'],
  ])('records payment from the %s and refreshes history after receiving %s', async (entry, amount, balance, state) => {
    let current: HistoryDetails = { ...detail, status: entry === 'already completed' ? 'completed' : 'active', returned_item_count: 1,
      items: detail.items.map((item) => ({ ...item, returned_at: '2026-12-03T10:00:00Z' })) };
    mocks.get.mockImplementation((path: string) => Promise.resolve(path.endsWith('scope=all') ? [current] : current));
    mocks.post.mockImplementation(() => {
      current = { ...current, balance, paid_amount: balance === '0' ? '85' : '40', status: balance === '0' ? 'completed' : 'active' };
      return Promise.resolve(current);
    });
    await open();
    if (entry === 'detail') {
      fireEvent.click(screen.getByRole('button', { name: 'Apri noleggio 125' }));
      await screen.findByRole('heading', { name: 'Noleggio n. 125' });
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Registra pagamento' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Registra pagamento noleggio 125' }));
    }
    expect((screen.getByLabelText('Importo ricevuto (€)') as HTMLInputElement).value).toBe('55.00');
    fireEvent.change(screen.getByLabelText('Importo ricevuto (€)'), { target: { value: amount } });
    fireEvent.change(screen.getByLabelText('Metodo di pagamento'), { target: { value: 'Contanti' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva pagamento' }));
    await screen.findByRole('heading', { name: 'Noleggio n. 125' });
    expect(within(screen.getByRole('dialog')).getByText(state === 'completed' ? 'Concluso' : 'Concluso · da saldare').classList.contains(`history-status-${state}`)).toBe(true);
    expect(mocks.post).toHaveBeenCalledWith('/locations/site-a/rental-bookings/booking-one/payments', 'token', {
      payment_id: expect.any(String), amount: `${amount}.00`, payment_method: 'Contanti', paid_at_local: expect.any(String), notes: null,
    }, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi dettaglio noleggio' }));
    const row = screen.getByRole('button', { name: 'Apri noleggio 125' }).closest('tr')!;
    expect(within(row).getByText(state === 'completed' ? 'Concluso' : 'Concluso · da saldare').classList.contains(`history-status-${state}`)).toBe(true);
    expect(!!within(row).queryByRole('button', { name: 'Registra pagamento noleggio 125' })).toBe(balance !== '0');
  });

  it('does not replace API errors with an empty history and can retry', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Errore noleggi'));
    render(<RentalsPage />);
    await screen.findByRole('alert');
    expect(screen.queryByText('Nessun noleggio registrato in questa sede')).toBeNull();
    mocks.get.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await screen.findByText('Nessun noleggio registrato in questa sede');
  });

  it('closes details and ignores the previous site response when switching location', async () => {
    let complete!: (data: HistoryDetails) => void;
    const view = await open();
    mocks.get.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Apri noleggio 125' }));
    const signal = mocks.get.mock.calls.at(-1)![2] as AbortSignal;
    mocks.auth.location = { id: 'site-b', name: 'Seconda sede' };
    mocks.get.mockResolvedValue([]);
    view.rerender(<RentalsPage />);
    await screen.findByText('Nessun noleggio registrato in questa sede');
    expect(signal.aborted).toBe(true);
    await act(async () => complete(detail));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});


it('separates current rentals from history, including all-returned unpaid bookings in history', async () => {
  const unpaid={...booking,id:'unpaid',booking_number:127,returned_item_count:1,customer:{...booking.customer,first_name:'Luca',last_name:'Verdi'}};
  const cancelled={...booking,id:'cancelled',booking_number:128,status:'cancelled',customer:{...booking.customer,first_name:'Paolo',last_name:'Neri'}};
  const seasonal={...booking,id:'seasonal',rental_kind:'seasonal',customer:{...booking.customer,first_name:'Stagionale',last_name:'Test'}};
  mocks.get.mockResolvedValue([booking,second,unpaid,cancelled,seasonal]);
  const view=render(<RentalsPage view="current" />);
  await screen.findByText('Mario Rossi');
  expect(screen.getByRole('heading',{name:'Noleggi attuali'})).toBeTruthy();
  expect(screen.queryByText('Anna Bianchi')).toBeNull();
  expect(screen.queryByText('Luca Verdi')).toBeNull();
  expect(screen.queryByText('Paolo Neri')).toBeNull();
  expect(screen.queryByText('Stagionale Test')).toBeNull();
  expect(within(screen.getByLabelText('Stato noleggio')).queryByRole('option',{name:'Concluso'})).toBeNull();
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'nessun cliente'}});
  view.rerender(<RentalsPage view="history" />);
  await screen.findByText('Anna Bianchi');
  expect(screen.getByText('Luca Verdi')).toBeTruthy();
  expect(screen.getByText('Paolo Neri')).toBeTruthy();
  expect(screen.queryByText('Mario Rossi')).toBeNull();
  expect(screen.queryByText('Stagionale Test')).toBeNull();
  expect(screen.getByRole('heading',{name:'Storico noleggi'})).toBeTruthy();
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  expect(within(screen.getByLabelText('Stato noleggio')).queryByRole('option',{name:'Prenotato'})).toBeNull();
});

it('separates seasonal current bookings and history including completed unpaid bookings',async()=>{
  const current={...booking,rental_kind:'seasonal'};
  const completed={...second,rental_kind:'seasonal'};
  const unpaid={...booking,id:'unpaid-seasonal',booking_number:130,rental_kind:'seasonal',returned_item_count:1,
    customer:{...booking.customer,first_name:'Luca',last_name:'Verdi'}};
  mocks.get.mockResolvedValue([current,completed,unpaid]);
  const page=render(<RentalsPage view="current" seasonId="season" seasonName="2026/2027"/>);
  await screen.findByText('Mario Rossi');
  expect(screen.getByRole('heading',{name:'Noleggi stagionali attuali'})).toBeTruthy();
  expect(screen.queryByText('Anna Bianchi')).toBeNull();
  expect(screen.queryByText('Luca Verdi')).toBeNull();
  expect(mocks.get).toHaveBeenCalledWith('/locations/site-a/seasonal-bookings?season_id=season','token',expect.any(AbortSignal));
  page.rerender(<RentalsPage view="history" seasonId="season" seasonName="2026/2027"/>);
  await screen.findByText('Anna Bianchi');
  expect(screen.getByText('Luca Verdi')).toBeTruthy();
  expect(screen.queryByText('Mario Rossi')).toBeNull();
  expect(screen.getByRole('heading',{name:'Storico noleggi stagionali'})).toBeTruthy();
});


it.each([
  ['daily','single','Singolo'],['daily','pack','Pack'],['daily','mixed','Pack + singoli'],
  ['seasonal','single','Singolo'],['seasonal','pack','Pack'],['seasonal','mixed','Pack + singoli'],
] as const)('shows the formula column for current %s rentals (%s)',async(kind,formula,label)=>{
  mocks.get.mockResolvedValue([{...booking,rental_kind:kind,rental_formula:formula}]);
  render(<RentalsPage view="current" seasonId={kind==='seasonal'?'season':undefined} seasonName="2026/2027"/>);
  await screen.findByText('Mario Rossi');
  expect(screen.getByRole('columnheader',{name:'Formula'})).toBeTruthy();
  expect(screen.getByRole('cell',{name:label})).toBeTruthy();
});


it.each(['daily','seasonal'] as const)('deletes current and historical %s bookings only after confirmation',async(kind)=>{
  mocks.get.mockResolvedValue([{...booking,rental_kind:kind},{...second,rental_kind:kind}]);
  mocks.delete.mockResolvedValue(undefined);
  const page=render(<RentalsPage view="current" seasonId={kind==='seasonal'?'season':undefined}/>);
  await screen.findByText('Mario Rossi');
  fireEvent.click(screen.getByRole('button',{name:'Elimina prenotazione 125'}));
  expect(mocks.delete).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading',{name:'Dettaglio noleggio'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Annulla'}));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Elimina prenotazione 125'}));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Elimina prenotazione'}));
  await screen.findByText('Prenotazione eliminata.');
  expect(screen.queryByText('Mario Rossi')).toBeNull();
  expect(mocks.delete).toHaveBeenCalledWith('/locations/site-a/rental-bookings/booking-one','token',expect.any(AbortSignal));
  page.rerender(<RentalsPage view="history" seasonId={kind==='seasonal'?'season':undefined}/>);
  await screen.findByText('Anna Bianchi');
  fireEvent.click(screen.getByRole('button',{name:'Elimina prenotazione 126'}));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Elimina prenotazione'}));
  await screen.findByText('Prenotazione eliminata.');
  expect(screen.queryByText('Anna Bianchi')).toBeNull();
});

it('keeps the booking on deletion errors and blocks duplicate submissions',async()=>{
  let fail!:(reason:Error)=>void;
  mocks.delete.mockImplementation(()=>new Promise((_,reject)=>{fail=reject;}));
  render(<RentalsPage view="current"/>);
  await screen.findByText('Mario Rossi');
  fireEvent.click(screen.getByRole('button',{name:'Elimina prenotazione 125'}));
  const submit=within(screen.getByRole('dialog')).getByRole('button',{name:'Elimina prenotazione'});
  fireEvent.click(submit);fireEvent.click(submit);
  expect(mocks.delete).toHaveBeenCalledTimes(1);
  await act(async()=>fail(new Error('Esegui 029')));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','Esegui 029');
  expect(within(screen.getByRole('region',{name:'Elenco noleggi della sede'})).getByText('Mario Rossi')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Annulla'}));
  expect(within(screen.getByRole('region',{name:'Elenco noleggi della sede'})).getByText('Mario Rossi')).toBeTruthy();
});


it.each(['current','history'] as const)('combines daily and seasonal bookings in the %s page and filters by type and season',async(view)=>{
  const daily={...booking,rental_kind:'daily',...(view==='history'?{status:'completed',returned_item_count:1,balance:'0'}:{})};
  const seasonal={...daily,id:'seasonal',booking_number:150,rental_kind:'seasonal',season_id:'season',customer:{...booking.customer,first_name:'Anna',last_name:'Bianchi'}};
  const season={id:'season',name:'2026/2027',return_date:'2027-04-30',is_current:true,created_at:'2026-11-24T10:00:00Z'};
  mocks.get.mockImplementation((path:string)=>Promise.resolve(path==='/seasonal-rentals/settings'?{seasons:[season],current_season:season}:path.includes('seasonal-bookings')?[seasonal]:[daily,seasonal]));
  render(<MemoryRouter><UnifiedRentalsPage view={view}/></MemoryRouter>);
  await screen.findByText('Mario Rossi');
  expect(screen.getByText('Anna Bianchi')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Tutti'}).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button',{name:'Giornalieri'}));
  await screen.findByText('Mario Rossi');
  expect(screen.queryByText('Anna Bianchi')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Stagionali'}));
  await screen.findByText('Anna Bianchi');
  expect(screen.queryByText('Mario Rossi')).toBeNull();
  expect((screen.getByLabelText('Stagione') as HTMLSelectElement).value).toBe('season');
  fireEvent.click(screen.getByRole('button',{name:'Tutti'}));
  await screen.findByText('Mario Rossi');
  expect(screen.getByText('Anna Bianchi')).toBeTruthy();
});


it('shows imported bookings in full history as completed and paid without inventing payment movements',async()=>{
  const imported={...booking,id:'legacy-booking',is_legacy:true,legacy_paid_in_full:true,legacy_code:'OLD100',
    legacy_customer_id:'old-person',rental_kind:'legacy',status:'completed',total:'8',paid_amount:'8',balance:'0',
    discount_percent:null,subtotal:null,discount_amount:null,customer_id:null,created_by:null};
  const details={...imported,items:[{...detail.items[0],rental_inventory_id:null,is_legacy:true,amount:null,
    legacy_reported_paid_amount:'8',legacy_returned_on:'2025-12-03'}],payments:[]};
  mocks.get.mockImplementation((path:string)=>Promise.resolve(path.endsWith('/legacy-booking')?details:[imported]));
  render(<RentalsPage view="history" rentalKind="all"/>);
  await screen.findByText('Cod. OLD100');
  expect(mocks.get).toHaveBeenCalledWith('/locations/site-a/rental-bookings?scope=all&include_legacy=true','token',expect.any(AbortSignal));
  const table=screen.getByRole('region',{name:'Elenco noleggi della sede'});
  expect(within(table).getByText('Concluso')).toBeTruthy();
  expect(within(table).queryByRole('button',{name:/Registra pagamento/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Apri noleggio 125'}));
  await screen.findByRole('heading',{name:'Noleggio importato · OLD100'});
  expect(within(screen.getByRole('dialog')).getByText(/Il CSV non specifica data e metodo/)).toBeTruthy();
  expect(within(screen.getByRole('dialog')).getByText('03 dic 2025')).toBeTruthy();
});


it.each([
  ['2026-12-01', '2026-12-01', '1 giorno'],
  ['2026-12-01', '2026-12-03', '3 giorni'],
  ['2026-03-28', '2026-03-30', '3 giorni'],
  ['2026-12-31', '2027-01-01', '2 giorni'],
])('counts inclusive rental days from %s to %s', (start, end, expected) => {
  expect(historyDuration(start, end)).toBe(expected);
});
