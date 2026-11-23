import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OperationsPage } from './OperationsPage';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), auth: { session: { access_token: 'token' } } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get, apiPost: mocks.post, apiPatch: mocks.patch }));

const customers = [
  { id: 'one', first_name: 'Mario', last_name: 'Rossi', email: 'mario@example.test', phone: '+39 00123', notes: 'Nota Mario' },
  { id: 'two', first_name: 'Anna', last_name: 'Rossi', email: 'anna@example.test', phone: '+39 00456', notes: null },
  { id: 'three', first_name: 'Carlo', last_name: 'Bianchi', email: null, phone: null, notes: null },
];
const created = { id: 'new', first_name: 'Paolo', last_name: 'Rossi', email: null, phone: '+39 0001', notes: 'Nota' };
const change = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });

beforeEach(() => {
  mocks.get.mockReset().mockImplementation((path: string) => Promise.resolve(path === '/hotels' ? [{ id: 'hotel-1', name: 'Albergo 1', is_active: true }, { id: 'hotel-2', name: 'Albergo 2', is_active: true }] : customers));
  mocks.post.mockReset().mockResolvedValue(created);
  mocks.patch.mockReset().mockImplementation((_path:string,_token:string,data:object)=>Promise.resolve({...customers[0],...data}));
  mocks.auth.session = { access_token: 'token' };
});
afterEach(cleanup);

async function open() {
  const view = render(<OperationsPage mode="rental" />);
  await waitFor(() => expect(screen.queryByText('Caricamento clienti…')).toBeNull());
  return view;
}

async function newCustomer() {
  await open();
  change('Cognome *', 'Rossi');
  fireEvent.click(screen.getByRole('button', { name: 'Registra un nuovo cliente' }));
  change('Nome *', 'Paolo');
  change('Cellulare', '+39 0001');
  change('Note cliente', 'Nota');
}

describe('Cliente del nuovo noleggio', () => {
  it('shows all surname matches and fills the selected customer without creating a duplicate', async () => {
    await open();
    change('Cognome *', 'rOsS');
    expect(screen.getByRole('button', { name: /Rossi Mario/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Rossi Anna/ })).toBeTruthy();
    expect(screen.queryByText(/Bianchi Carlo/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Rossi Anna/ }));
    expect((screen.getByLabelText('Nome *') as HTMLInputElement).value).toBe('Anna');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('anna@example.test');
    expect((screen.getByLabelText('Cellulare') as HTMLInputElement).value).toBe('+39 00456');
    expect((screen.getByLabelText('Nome *') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText('Cliente selezionato')).toBeTruthy();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('can return to surname search and select a different person', async () => {
    await open(); change('Cognome *', 'Rossi');
    fireEvent.click(screen.getByRole('button', { name: /Rossi Mario/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cambia cliente' }));
    expect(screen.queryByLabelText('Nome *')).toBeNull();
    change('Cognome *', 'Bianchi');
    fireEvent.click(screen.getByRole('button', { name: /Bianchi Carlo/ }));
    expect((screen.getByLabelText('Nome *') as HTMLInputElement).value).toBe('Carlo');
    expect((screen.getByLabelText('Note cliente') as HTMLTextAreaElement).value).toBe('');
  });

  it('offers registration when the surname does not exist', async () => {
    await open(); change('Cognome *', 'Verdi');
    expect(screen.getByText('Nessun cliente trovato con questo cognome.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Registra un nuovo cliente' }));
    expect((screen.getByLabelText('Cognome *') as HTMLInputElement).value).toBe('Verdi');
    expect((screen.getByLabelText('Nome *') as HTMLInputElement).value).toBe('');
  });

  it('registers a new person even with an existing surname, then selects the returned ID', async () => {
    await newCustomer();
    fireEvent.click(screen.getByRole('button', { name: 'Salva nuovo cliente' }));
    await screen.findByText('Cliente registrato e selezionato');
    expect(mocks.post).toHaveBeenCalledWith('/customers', 'token', {
      first_name: 'Paolo', last_name: 'Rossi', email: null, phone: '+39 0001', notes: 'Nota',
      birth_date: null, skill_level: null, language: null, country_code: null,
    }, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button', { name: 'Cambia cliente' }));
    expect(screen.getByRole('button', { name: /Rossi Paolo/ })).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it('saves the optional profile fields on the new rental customer', async () => {
    await newCustomer();
    change('Data di nascita', '1990-04-15'); change('Livello', 'intermediate');
    change('Lingua (codice)', 'it'); change('Paese (codice)', 'ch');
    fireEvent.click(screen.getByRole('button', { name: 'Salva nuovo cliente' }));
    await screen.findByText('Cliente registrato e selezionato');
    expect(mocks.post.mock.calls[0][2]).toMatchObject({ birth_date: '1990-04-15', skill_level: 'intermediate', language: 'IT', country_code: 'CH' });
  });

  it('blocks double submissions and retains entered values if saving fails', async () => {
    let fail!: (error: Error) => void;
    mocks.post.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    await newCustomer();
    const submit = screen.getByRole('button', { name: 'Salva nuovo cliente' });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Salvataggio…' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => fail(new Error('Salvataggio non riuscito')));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByLabelText('Nome *') as HTMLInputElement).value).toBe('Paolo');
    expect(screen.queryByText('Cliente registrato e selezionato')).toBeNull();
  });

  it('does not present a failed lookup as no matches and allows retry', async () => {
    let failed = false;
    mocks.get.mockImplementation((path: string) => {
      if (path === '/hotels') return Promise.resolve([]);
      if (!failed) { failed = true; return Promise.reject(new Error('Backend non raggiungibile')); }
      return Promise.resolve(customers);
    });
    await open(); change('Cognome *', 'Rossi');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Nessun cliente trovato con questo cognome.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registra un nuovo cliente' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Riprova ricerca' }));
    await screen.findByRole('button', { name: /Rossi Mario/ });
  });

  it('aborts a pending save at unmount and ignores the response', async () => {
    let complete!: (customer: typeof created) => void;
    mocks.post.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const view = render(<OperationsPage mode="rental" />);
    await waitFor(() => expect(screen.queryByText('Caricamento clienti…')).toBeNull());
    change('Cognome *', 'Rossi');
    fireEvent.click(screen.getByRole('button', { name: 'Registra un nuovo cliente' }));
    change('Nome *', 'Paolo');
    fireEvent.click(screen.getByRole('button', { name: 'Salva nuovo cliente' }));
    const signal = mocks.post.mock.calls[0][3] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => complete(created));
    expect(screen.queryByText('Cliente registrato e selezionato')).toBeNull();
  });

  it('leaves the sale workflow unchanged', () => {
    render(<OperationsPage mode="sale" />);
    expect(screen.getByRole('heading', { name: 'Nuova vendita' })).toBeTruthy();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('keeps rental dates and hotel separate from the customer when changing person', async () => {
    await open();
    expect(screen.getByLabelText('Data di inizio *')).toBeTruthy();
    change('Cognome *', 'Rossi');
    fireEvent.click(screen.getByRole('button', { name: /Rossi Mario/ }));
    change('Data di inizio *', '2026-12-10');
    change('Rientro previsto *', '2026-12-12');
    change('Albergo', 'hotel-2');
    fireEvent.click(screen.getByRole('button', { name: 'Cambia cliente' }));
    expect(screen.getByLabelText('Albergo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Rossi Anna/ }));
    expect((screen.getByLabelText('Data di inizio *') as HTMLInputElement).value).toBe('2026-12-10');
    expect((screen.getByLabelText('Rientro previsto *') as HTMLInputElement).value).toBe('2026-12-12');
    expect((screen.getByLabelText('Albergo') as HTMLSelectElement).value).toBe('hotel-2');
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('rejects a return before the start date and permits a same-day rental', async () => {
    await open(); change('Cognome *', 'Rossi');
    fireEvent.click(screen.getByRole('button', { name: /Rossi Mario/ }));
    change('Data di inizio *', '2026-12-10');
    change('Rientro previsto *', '2026-12-09');
    expect(screen.getByRole('alert').textContent).toContain('non può precedere');
    expect(screen.getByLabelText('Rientro previsto *').getAttribute('aria-invalid')).toBe('true');
    change('Rientro previsto *', '2026-12-10');
    expect(screen.queryByRole('alert')).toBeNull();
    change('Data di inizio *', '2026-12-11');
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});


it('updates only contact fields of the selected customer, keeping first and last names readonly', async () => {
  await open(); change('Cognome *','Rossi');
  fireEvent.click(screen.getByRole('button',{name:/Rossi Mario/}));
  expect((screen.getByLabelText('Nome *') as HTMLInputElement).readOnly).toBe(true);
  expect((screen.getByLabelText('Cognome *') as HTMLInputElement).readOnly).toBe(true);
  expect((screen.getByLabelText('Cellulare') as HTMLInputElement).readOnly).toBe(false);
  expect((screen.getByLabelText('Email') as HTMLInputElement).readOnly).toBe(false);
  change('Cellulare','+39 999'); change('Email','nuova@example.test');
  fireEvent.click(screen.getByRole('button',{name:'Salva recapiti'}));
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Salva recapiti'})).toBeNull());
  expect(mocks.patch).toHaveBeenCalledWith('/customers/one','token',{phone:'+39 999',email:'nuova@example.test'},expect.any(AbortSignal));
  expect(mocks.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Cambia cliente'}));
  fireEvent.click(screen.getByRole('button',{name:/Rossi Mario/}));
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('nuova@example.test');
});

it('preserves old malformed email when updating only the phone and sends no unrelated fields', async () => {
  mocks.get.mockResolvedValue([{...customers[0],email:'vecchia mail non valida'}]);
  mocks.patch.mockResolvedValue({...customers[0],email:'vecchia mail non valida',phone:'12345'});
  await open(); change('Cognome *','Rossi');
  fireEvent.click(screen.getByRole('button',{name:/Rossi Mario/}));
  change('Cellulare','12345');
  fireEvent.click(screen.getByRole('button',{name:'Salva recapiti'}));
  await waitFor(()=>expect(mocks.patch).toHaveBeenCalledTimes(1));
  expect(mocks.patch.mock.calls[0][2]).toEqual({phone:'12345'});
});

it('retains edited contacts after an update error and prevents duplicate saves', async () => {
  let fail!:(error:Error)=>void;
  mocks.patch.mockImplementationOnce(()=>new Promise((_,reject)=>{fail=reject;}));
  await open(); change('Cognome *','Rossi');
  fireEvent.click(screen.getByRole('button',{name:/Rossi Mario/}));
  change('Cellulare','12345');
  const save=screen.getByRole('button',{name:'Salva recapiti'});
  fireEvent.click(save);fireEvent.click(save);
  expect(mocks.patch).toHaveBeenCalledTimes(1);
  await act(async()=>fail(new Error('Recapiti non salvati')));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','Recapiti non salvati');
  expect((screen.getByLabelText('Cellulare') as HTMLInputElement).value).toBe('12345');
});
