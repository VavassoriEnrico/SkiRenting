import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomersPage } from './CustomersPage';

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), auth: { session: { access_token: 'token' } as { access_token: string } | null } }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.apiGet }));

const customers = [
  { id: 'one', first_name: 'Nicolò', last_name: 'Rossi', email: 'famiglia@example.test', phone: '+39 333-001234', notes: 'Scarponi personali\nSeconda nota' },
  { id: 'two', first_name: 'Anna', last_name: 'Bianchi', email: null, phone: null, notes: null },
];

beforeEach(() => {
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
    expect(headers.map((header) => header.textContent)).toEqual(['Nome', 'Cognome', 'Email', 'Telefono', 'Note']);
    expect(screen.getByText('famiglia@example.test')).toBeTruthy();
    expect(screen.getByText('+39 333-001234')).toBeTruthy();
    expect(screen.getByText(/Scarponi personali/)).toBeTruthy();
    const anna = screen.getByText('Anna').closest('tr')!;
    expect(within(anna).getAllByText('—')).toHaveLength(3);
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
