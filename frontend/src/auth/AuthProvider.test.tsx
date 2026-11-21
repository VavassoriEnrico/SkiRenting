import type { Session } from '@supabase/supabase-js';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AuthProvider, useAuth } from './AuthProvider';
import { RequireAuth } from './RequireAuth';
import { LocationSelector } from '../components/layout/LocationSelector';
import { LoginPage } from '../pages/login/LoginPage';
import { apiGet } from '../lib/api';

const auth = vi.hoisted(() => ({
  session: null as Session | null,
  listener: null as ((event: string, session: Session | null) => void) | null,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { auth: {
    onAuthStateChange: (callback: typeof auth.listener) => {
      auth.listener = callback;
      callback?.('INITIAL_SESSION', auth.session);
      return { data: { subscription: { unsubscribe: () => { auth.listener = null; } } } };
    },
    signInWithPassword: auth.signIn,
    signOut: auth.signOut,
  } },
}));
vi.mock('../lib/api', () => ({ apiGet: vi.fn() }));

const session = { access_token: 'valid-token', user: { id: 'operator-1', email: 'operator@example.com' } } as Session;
const locationA = { id: 'location-a', name: 'Sede Centro' };
const locationB = { id: 'location-b', name: 'Sede Monte' };
const operator = { profile: { id: 'operator-1', name: 'Banco' }, locations: [locationA, locationB] };

function Workspace() {
  const state = useAuth();
  return <><h1>Gestionale protetto</h1><LocationSelector /><button onClick={() => void state.signOut()}>Logout test</button></>;
}

function openApp(path = '/dashboard') {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<RequireAuth />}><Route path="/dashboard" element={<Workspace />} /></Route>
  </Routes></AuthProvider></MemoryRouter>);
}

beforeEach(() => {
  auth.session = null;
  auth.signIn.mockReset();
  auth.signOut.mockReset();
  sessionStorage.clear();
  vi.mocked(apiGet).mockImplementation(async (path) => {
    if (path === '/me') return operator as never;
    if (path === '/me/locations/location-b') return locationB as never;
    throw new Error('Unexpected request');
  });
  auth.signOut.mockImplementation(async () => {
    auth.listener?.('SIGNED_OUT', null);
    return { error: null };
  });
});
afterEach(cleanup);

describe('Login e sede attiva', () => {
  it('protegge le pagine prima del login', async () => {
    openApp();
    expect(await screen.findByRole('heading', { name: 'Accedi al gestionale' })).toBeTruthy();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('mostra un errore quando le credenziali non sono valide', async () => {
    auth.signIn.mockResolvedValue({ error: new Error('Invalid credentials') });
    openApp('/login');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'wrong@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Accedi' }).closest('form')!);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('accede e carica profilo e sedi dal backend con il token', async () => {
    auth.signIn.mockImplementation(async () => {
      auth.listener?.('SIGNED_IN', session);
      return { error: null };
    });
    openApp('/login');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'operator@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-test' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Accedi' }).closest('form')!);
    expect(await screen.findByRole('heading', { name: 'Gestionale protetto' })).toBeTruthy();
    expect(vi.mocked(apiGet).mock.calls[0][1]).toBe('valid-token');
    expect((screen.getByLabelText('Sede di lavoro') as HTMLSelectElement).value).toBe('location-a');
  });

  it('ripristina solo una sede precedentemente autorizzata', async () => {
    auth.session = session;
    sessionStorage.setItem('skirenting.location.operator-1', 'unassigned-location');
    openApp();
    const selector = await screen.findByLabelText('Sede di lavoro');
    expect((selector as HTMLSelectElement).value).toBe('location-a');
    expect(sessionStorage.getItem('skirenting.location.operator-1')).toBe('location-a');
  });

  it('ricorda la sede nella scheda e verifica il cambio sul backend', async () => {
    auth.session = session;
    sessionStorage.setItem('skirenting.location.operator-1', 'location-b');
    openApp();
    expect((await screen.findByLabelText('Sede di lavoro') as HTMLSelectElement).value).toBe('location-b');
    vi.mocked(apiGet).mockResolvedValueOnce(locationA);
    fireEvent.change(screen.getByLabelText('Sede di lavoro'), { target: { value: 'location-a' } });
    await waitFor(() => expect(sessionStorage.getItem('skirenting.location.operator-1')).toBe('location-a'));
    expect(vi.mocked(apiGet).mock.calls.at(-1)?.[0]).toBe('/me/locations/location-a');
  });

  it('mantiene la sede corrente se il backend nega il cambio', async () => {
    auth.session = session;
    openApp();
    await screen.findByLabelText('Sede di lavoro');
    vi.mocked(apiGet).mockRejectedValueOnce(new Error('Sede non autorizzata.'));
    fireEvent.change(screen.getByLabelText('Sede di lavoro'), { target: { value: 'location-b' } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByLabelText('Sede di lavoro') as HTMLSelectElement).value).toBe('location-a');
  });

  it('non apre il gestionale quando il profilo non è configurato', async () => {
    auth.session = session;
    vi.mocked(apiGet).mockRejectedValueOnce(new Error('Profilo operatore non configurato.'));
    openApp();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Gestionale protetto' })).toBeNull();
  });

  it('logout chiude questa sessione e torna al login', async () => {
    auth.session = session;
    openApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Logout test' }));
    expect(await screen.findByRole('heading', { name: 'Accedi al gestionale' })).toBeTruthy();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(sessionStorage.getItem('skirenting.location.operator-1')).toBeNull();
  });

  it('ignora una risposta di cambio sede arrivata dopo il logout', async () => {
    auth.session = session;
    openApp();
    await screen.findByLabelText('Sede di lavoro');
    let finishSwitch!: (value: unknown) => void;
    vi.mocked(apiGet).mockImplementationOnce(() => new Promise((resolve) => { finishSwitch = resolve; }));
    fireEvent.change(screen.getByLabelText('Sede di lavoro'), { target: { value: 'location-b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Logout test' }));
    await screen.findByRole('heading', { name: 'Accedi al gestionale' });
    await act(async () => { finishSwitch(locationB); });
    expect(sessionStorage.getItem('skirenting.location.operator-1')).toBeNull();
  });
});
