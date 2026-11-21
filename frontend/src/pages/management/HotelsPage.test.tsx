import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';

import { HotelsPage } from './HotelsPage';
import { ManagementPage } from './ManagementPage';
import { RentalPeriodFields } from '../operations/RentalPeriodFields';
import type { RentalPeriod } from '../operations/RentalPeriodFields';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), remove: vi.fn(), patch: vi.fn() }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ session: { access_token: 'token' } }) }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get, apiPost: mocks.post, apiDelete: mocks.remove, apiPatch: mocks.patch }));
const hotel = { id: 'hotel-a', name: 'Albergo Test', is_active: true, discount: 0 };
beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue([hotel]);
  mocks.post.mockReset().mockResolvedValue({ id: 'hotel-b', name: 'Nuovo Hotel', is_active: true, discount: 0 });
  mocks.patch.mockReset().mockResolvedValue({ ...hotel, discount: 15 });
  mocks.remove.mockReset().mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
});
afterEach(cleanup);
async function open() {
  const view = render(<MemoryRouter><HotelsPage /></MemoryRouter>);
  await screen.findByRole('button', { name: 'Rimuovi Albergo Test' });
  return view;
}

describe('Management Hotels', () => {
  it('provides the Hotels management card', () => {
    render(<MemoryRouter><ManagementPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Alberghi/ }).getAttribute('href')).toBe('/management/hotels');
  });

  it('adds an actual hotel through the backend and updates the list', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Nome albergo'), { target: { value: ' Nuovo Hotel ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi albergo' }));
    await screen.findByRole('button', { name: 'Rimuovi Nuovo Hotel' });
    expect(mocks.post).toHaveBeenCalledWith('/hotels', 'token', { name: 'Nuovo Hotel', discount: 0 }, expect.any(AbortSignal));
    expect((screen.getByLabelText('Nome albergo') as HTMLInputElement).value).toBe('');
  });

  it('saves the discount on an existing hotel', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Sconto Albergo Test (%)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva sconto Albergo Test' }));
    await screen.findByText('Sconto di Albergo Test aggiornato al 15%.');
    expect(mocks.patch).toHaveBeenCalledWith('/hotels/hotel-a', 'token', { discount: 15 }, expect.any(AbortSignal));
    expect((screen.getByRole('button', { name: 'Salva sconto Albergo Test' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends the entered discount when adding a new hotel', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Nome albergo'), { target: { value: 'Nuovo Hotel' } });
    fireEvent.change(screen.getByLabelText('Sconto nuovo albergo (%)'), { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi albergo' }));
    await screen.findByRole('button', { name: 'Rimuovi Nuovo Hotel' });
    expect(mocks.post).toHaveBeenCalledWith('/hotels', 'token', { name: 'Nuovo Hotel', discount: 12.5 }, expect.any(AbortSignal));
  });

  it('keeps the unsaved discount after a failed update', async () => {
    mocks.patch.mockRejectedValueOnce(new Error('Errore sconto'));
    await open();
    fireEvent.change(screen.getByLabelText('Sconto Albergo Test (%)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva sconto Albergo Test' }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText('Sconto Albergo Test (%)') as HTMLInputElement).value).toBe('15');
    expect((screen.getByRole('button', { name: 'Salva sconto Albergo Test' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('can cancel removal, then confirm it without deleting until confirmation', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi Albergo Test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi Albergo Test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi albergo' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Rimuovi Albergo Test' })).toBeNull());
    expect(mocks.remove).toHaveBeenCalledWith('/hotels/hotel-a', 'token', expect.any(AbortSignal));
    expect(screen.getByText(/Nessun albergo presente/)).toBeTruthy();
  });

  it('preserves the name on save failure and prevents double submissions', async () => {
    let fail!: (error: Error) => void;
    mocks.post.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    await open();
    fireEvent.change(screen.getByLabelText('Nome albergo'), { target: { value: 'Nuovo Hotel' } });
    const submit = screen.getByRole('button', { name: 'Aggiungi albergo' });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    await act(async () => fail(new Error('Scrittura non abilitata: query 008')));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByLabelText('Nome albergo') as HTMLInputElement).value).toBe('Nuovo Hotel');
  });

  it('keeps a hotel in the list when removal fails', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('Rimozione fallita'));
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi Albergo Test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi albergo' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(screen.getByRole('button', { name: 'Rimuovi Albergo Test' })).toBeTruthy();
  });

  it('loads the actual hotel IDs in the rental selector, with no fixed example entries', async () => {
    function Period() {
      const [value, onChange] = useState<RentalPeriod>({ starts_on: '', ends_on: '', hotel: '' });
      return <RentalPeriodFields value={value} onChange={onChange} />;
    }
    render(<Period />);
    await screen.findByRole('option', { name: 'Albergo Test' });
    expect(mocks.get).toHaveBeenCalledWith('/hotels', 'token', expect.any(AbortSignal));
    const selector = screen.getByLabelText('Albergo') as HTMLSelectElement;
    expect(within(selector).queryByText('Albergo 1')).toBeNull();
    fireEvent.change(selector, { target: { value: 'hotel-a' } });
    expect(selector.value).toBe('hotel-a');
  });

  it('distinguishes load failure from an empty list and retries', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Errore elenco'));
    render(<MemoryRouter><HotelsPage /></MemoryRouter>);
    await screen.findByRole('alert');
    expect(screen.queryByText(/Nessun albergo presente/)).toBeNull();
    mocks.get.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await screen.findByText(/Nessun albergo presente/);
  });
});
