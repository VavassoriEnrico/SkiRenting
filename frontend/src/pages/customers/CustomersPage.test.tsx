import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomersPage } from './CustomersPage';

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(), auth: { session: { access_token: 'token' } as { access_token: string } | null } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.apiGet, apiPatch:mocks.apiPatch, apiDelete:mocks.apiDelete }));

const customers = [
  { id: 'one', first_name: 'Nicolò', last_name: 'Rossi', email: 'famiglia@example.test', phone: '+39 333-001234', notes: 'Scarponi personali\nSeconda nota' },
  { id: 'two', first_name: 'Anna', last_name: 'Bianchi', email: null, phone: null, notes: null },
];

beforeEach(() => {
  mocks.apiPatch.mockReset(); mocks.apiDelete.mockReset().mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal = vi.fn(function(this:HTMLDialogElement) { this.setAttribute('open',''); });
  mocks.auth.session = { access_token: 'token' };
  mocks.apiGet.mockReset().mockResolvedValue(customers);
});
afterEach(cleanup);

describe('Clienti', () => {
  it('loads the shared directory and displays the requested columns', async () => {
    render(<CustomersPage />);
    await screen.findByText('Nicolò');
    expect(mocks.apiGet).toHaveBeenCalledWith('/customers', 'token', expect.any(AbortSignal));
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual(['Nome', 'Cognome', 'Email', 'Telefono', 'Data di nascita', 'Livello', 'Lingua', 'Paese', 'Note', 'Azioni']);
    expect(screen.getByText('famiglia@example.test')).toBeTruthy();
    expect(screen.getByText('+39 333-001234')).toBeTruthy();
    expect(screen.getByText(/Scarponi personali/)).toBeTruthy();
    const anna = screen.getByText('Anna').closest('tr')!;
    expect(within(anna).getAllByText('—')).toHaveLength(7);
  });

  it('shows imported profile information with Italian dates and level labels', async () => {
    mocks.apiGet.mockResolvedValue([{ ...customers[0], birth_date: '1990-04-15', skill_level: 'intermediate', language: 'IT', country_code: 'CH' }]);
    render(<CustomersPage />);
    await screen.findByText('Nicolò');
    expect(screen.getByText('15/04/1990')).toBeTruthy();
    expect(screen.getByText('Intermedio')).toBeTruthy();
    expect(screen.getByText('IT')).toBeTruthy();
    expect(screen.getByText('CH')).toBeTruthy();
  });

  it('edits a customer and sends only changed fields', async () => {
    render(<CustomersPage />); await screen.findByText('Nicolò');
    fireEvent.click(screen.getByRole('button', { name:'Modifica cliente Nicolò Rossi' }));
    const dialog = screen.getByRole('dialog');
    expect((within(dialog).getByLabelText('Telefono') as HTMLInputElement).value).toBe('+39 333-001234');
    fireEvent.change(within(dialog).getByLabelText('Telefono'), { target:{ value:'000999' } });
    mocks.apiPatch.mockResolvedValue({ ...customers[0], phone:'000999' });
    fireEvent.click(within(dialog).getByRole('button', { name:'Salva modifiche' }));
    await screen.findByText('Cliente aggiornato.');
    expect(mocks.apiPatch).toHaveBeenCalledWith('/customers/one','token',{ phone:'000999' },expect.any(AbortSignal));
    expect(screen.getByText('000999')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('edits an incomplete imported customer without overwriting other legacy fields', async () => {
    mocks.apiGet.mockResolvedValue([{ ...customers[0],first_name:'',last_name:'',email:'vecchio recapito',is_legacy:true }]);
    render(<CustomersPage />);
    fireEvent.click(await screen.findByRole('button',{name:'Modifica cliente one'}));
    expect((screen.getByLabelText('Nome') as HTMLInputElement).required).toBe(false);
    fireEvent.change(screen.getByLabelText('Note'), { target:{value:'Verificato'} });
    mocks.apiPatch.mockResolvedValue({ ...customers[0],first_name:'',last_name:'',is_legacy:true,notes:'Verificato' });
    fireEvent.click(screen.getByRole('button',{name:'Salva modifiche'}));
    await screen.findByText('Cliente aggiornato.');
    expect(mocks.apiPatch.mock.calls[0][2]).toEqual({ notes:'Verificato' });
  });

  it('asks before deleting and removes the customer only after success', async () => {
    render(<CustomersPage />); await screen.findByText('Nicolò');
    fireEvent.click(screen.getByRole('button',{name:'Elimina cliente Nicolò Rossi'}));
    expect(mocks.apiDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Annulla'}));
    expect(screen.getByText('Nicolò')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Elimina cliente Nicolò Rossi'}));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Elimina cliente'}));
    await screen.findByText('Cliente eliminato dall’anagrafica.');
    expect(mocks.apiDelete).toHaveBeenCalledWith('/customers/one','token',expect.any(AbortSignal));
    expect(screen.queryByText('Nicolò')).toBeNull();
    expect(screen.getByText('Anna')).toBeTruthy();
  });

  it('keeps the customer and dialog when deletion fails', async () => {
    mocks.apiDelete.mockRejectedValueOnce(new Error('Errore cancellazione'));
    render(<CustomersPage />); await screen.findByText('Nicolò');
    fireEvent.click(screen.getByRole('button',{name:'Elimina cliente Nicolò Rossi'}));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Elimina cliente'}));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Elimina cliente Nicolò Rossi'})).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('paginates the large directory and returns to the previous page after deleting the last row', async () => {
    mocks.apiGet.mockResolvedValue(Array.from({length:51},(_,index)=>({ ...customers[0], id:String(index),first_name:`Persona ${index}`,last_name:'Test' })));
    render(<CustomersPage />); await screen.findByText('Persona 0');
    expect(screen.queryByText('Persona 50')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Successivi'}));
    fireEvent.click(screen.getByRole('button',{name:'Elimina cliente Persona 50 Test'}));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Elimina cliente'}));
    await screen.findByText('Cliente eliminato dall’anagrafica.');
    expect(screen.getByText('Persona 0')).toBeTruthy();
    expect(screen.queryByText('Persona 50')).toBeNull();
  });

  it('opens the customer booking history from the row with count, dates and saved amounts', async () => {
    const bookings = [
      { id:'recent',booking_number:130,location_id:'site-b',location_name:'Sede 2',starts_on:'2026-11-20',ends_on:'2026-11-22',total:'85.00',paid_amount:'50.00' },
      { id:'old',booking_number:110,location_id:'site-a',location_name:'Madesimo',starts_on:'2026-10-01',ends_on:'2026-10-02',total:'40.00',paid_amount:'40.00' },
    ];
    mocks.apiGet.mockImplementation((path:string) => Promise.resolve(path==='/customers' ? customers : { customer:customers[0],booking_count:2,bookings }));
    render(<CustomersPage />); await screen.findByText('Nicolò');
    fireEvent.click(screen.getByText('Nicolò').closest('tr')!);
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('2 prenotazioni');
    expect(mocks.apiGet).toHaveBeenCalledWith('/customers/one/bookings','token',expect.any(AbortSignal));
    const rows = within(dialog).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['N° 130','N° 110']);
    expect(within(rows[0]).getByText('20 nov 2026')).toBeTruthy();
    expect(within(rows[0]).getByText('22 nov 2026')).toBeTruthy();
    expect(rows[0].textContent?.replace(/\s/g,'')).toContain('85,00€50,00€');
    expect(within(dialog).getByText('Dalla più recente alla più vecchia')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button',{name:'Chiudi prenotazioni cliente'}));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('distinguishes booking load errors from a customer with no bookings and allows retry', async () => {
    mocks.apiGet.mockImplementation((path:string) => path==='/customers' ? Promise.resolve(customers) : Promise.reject(new Error('Errore prenotazioni')));
    render(<CustomersPage />); await screen.findByText('Nicolò');
    fireEvent.click(screen.getByRole('button',{name:'Apri cliente Nicolò Rossi'}));
    await screen.findByRole('alert');
    expect(screen.queryByText('0 prenotazioni')).toBeNull();
    mocks.apiGet.mockResolvedValue({ customer:customers[0],booking_count:0,bookings:[] });
    fireEvent.click(screen.getByRole('button',{name:'Riprova prenotazioni'}));
    await screen.findByText('0 prenotazioni');
    expect(screen.getByText('Nessuna prenotazione registrata per questo cliente')).toBeTruthy();
  });

  it('ignores a booking response after closing the customer dialog', async () => {
    let complete!: (value:unknown) => void;
    mocks.apiGet.mockImplementation((path:string) => path==='/customers' ? Promise.resolve(customers) : new Promise((resolve) => { complete=resolve; }));
    render(<CustomersPage />); await screen.findByText('Nicolò');
    fireEvent.click(screen.getByRole('button',{name:'Apri cliente Nicolò Rossi'}));
    const signal = mocks.apiGet.mock.calls.at(-1)![2] as AbortSignal;
    fireEvent.click(screen.getByRole('button',{name:'Chiudi prenotazioni cliente'}));
    expect(signal.aborted).toBe(true);
    await act(async () => complete({ customer:customers[0],booking_count:0,bookings:[] }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('paginates customer bookings while keeping the total count visible', async () => {
    const bookings = Array.from({length:21},(_,index) => ({id:String(index),booking_number:200-index,location_id:'site-a',location_name:'Madesimo',starts_on:'2026-11-20',ends_on:'2026-11-22',total:'20',paid_amount:'0'}));
    mocks.apiGet.mockImplementation((path:string) => Promise.resolve(path==='/customers' ? customers : {customer:customers[0],booking_count:21,bookings}));
    render(<CustomersPage />); await screen.findByText('Nicolò');
    fireEvent.click(screen.getByRole('button',{name:'Apri cliente Nicolò Rossi'}));
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('21 prenotazioni');
    expect(within(dialog).queryByText('N° 180')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button',{name:'Successivi'}));
    expect(within(dialog).getByText('N° 180')).toBeTruthy();
    expect(within(dialog).getByText('21 prenotazioni')).toBeTruthy();
  });

  it.each(['NICOLO', 'rossi', 'FAMIGLIA@EXAMPLE', '333001234', 'rossi nicolò'])('searches by name, surname, email or phone: %s', async (query) => {
    render(<CustomersPage />);
    await screen.findByText('Nicolò');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
    expect(screen.getByText('Nicolò')).toBeTruthy();
    expect(screen.queryByText('Anna')).toBeNull();
    expect(screen.getByText('1 di 2 clienti')).toBeTruthy();
  });

  it('searches only the requested fields and resets a search with no matches', async () => {
    render(<CustomersPage />);
    await screen.findByText('Nicolò');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Scarponi personali' } });
    expect(screen.getByText('Nessun cliente trovato')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Azzera ricerca' }));
    expect(screen.getByText('Anna')).toBeTruthy();
  });

  it('distinguishes an empty database from a failed request', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('Tabella clienti non disponibile'));
    render(<CustomersPage />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Nessun cliente registrato')).toBeNull();
    mocks.apiGet.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await screen.findByText('Nessun cliente registrato');
    expect(screen.queryByText('Nicolò')).toBeNull();
  });

  it('aborts the previous session request and ignores a late response', async () => {
    let complete!: (value: typeof customers) => void;
    mocks.apiGet.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const view = render(<CustomersPage />);
    const signal = mocks.apiGet.mock.calls[0][2] as AbortSignal;
    mocks.auth.session = { access_token: 'another-user-token' };
    mocks.apiGet.mockResolvedValue([]);
    view.rerender(<CustomersPage />);
    await screen.findByText('Nessun cliente registrato');
    expect(signal.aborted).toBe(true);
    await act(async () => complete(customers));
    await waitFor(() => expect(screen.queryByText('Nicolò')).toBeNull());
  });

  it('does not load customer data without a session', () => {
    mocks.auth.session = null;
    render(<CustomersPage />);
    expect(mocks.apiGet).not.toHaveBeenCalled();
    expect(screen.getByText('Accedi per visualizzare i clienti.')).toBeTruthy();
  });
});
