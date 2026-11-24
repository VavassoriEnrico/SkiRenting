import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CustomerDocument } from './CustomerDocument';

const mocks = vi.hoisted(() => ({ get: vi.fn(), upload: vi.fn(), delete: vi.fn() }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get, apiUpload: mocks.upload, apiDelete: mocks.delete }));
beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue({ url: null });
  mocks.upload.mockReset().mockResolvedValue({ url: 'https://storage.test/private-photo' });
  mocks.delete.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

it('loads only when opened and uploads a customer photo', async () => {
  render(<CustomerDocument customerId="customer-one" token="token" />);
  expect(mocks.get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Foto documento' }));
  await screen.findByText('Nessuna foto documento caricata.');
  const file = new File(['photo'], 'document.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Carica foto documento'), { target: { files: [file] } });
  await screen.findByText('Foto documento salvata.');
  expect(mocks.upload).toHaveBeenCalledWith('/customers/customer-one/document', 'token', file, expect.any(AbortSignal));
  expect(screen.getByRole('img').getAttribute('src')).toBe('https://storage.test/private-photo');
});

it('rejects an unsupported format before upload and confirms removal', async () => {
  mocks.get.mockResolvedValue({ url: 'https://storage.test/photo' });
  render(<CustomerDocument customerId="customer-one" token="token" />);
  fireEvent.click(screen.getByRole('button', { name: 'Foto documento' }));
  await screen.findByRole('img');
  fireEvent.change(screen.getByLabelText('Sostituisci foto documento'), { target: { files: [new File(['html'], 'wrong.html', { type: 'text/html' })] } });
  await screen.findByRole('alert');
  expect(mocks.upload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Rimuovi foto' }));
  expect(mocks.delete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Conferma rimozione foto' }));
  await screen.findByText('Foto documento rimossa.');
  expect(screen.queryByRole('img')).toBeNull();
});

it('keeps the old photo after a failed replacement', async () => {
  mocks.get.mockResolvedValue({ url: 'https://storage.test/old' });
  mocks.upload.mockRejectedValue(new Error('Connessione interrotta'));
  render(<CustomerDocument customerId="customer-one" token="token" />);
  fireEvent.click(screen.getByRole('button', { name: 'Foto documento' }));
  await screen.findByRole('img');
  fireEvent.change(screen.getByLabelText('Sostituisci foto documento'), { target: { files: [new File(['photo'], 'new.jpg', { type: 'image/jpeg' })] } });
  await screen.findByRole('alert');
  expect(screen.getByRole('img').getAttribute('src')).toBe('https://storage.test/old');
});
