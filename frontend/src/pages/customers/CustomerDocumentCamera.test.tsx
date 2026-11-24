import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CustomerDocument } from './CustomerDocument';

const mocks = vi.hoisted(() => ({ get: vi.fn(), upload: vi.fn(), delete: vi.fn() }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get, apiUpload: mocks.upload, apiDelete: mocks.delete }));
const getUserMedia = vi.fn();
const stop = vi.fn();
const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
const mediaDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const revoke = vi.fn();

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue({ url: null });
  mocks.upload.mockReset().mockResolvedValue({ url: 'https://storage.test/camera-photo' });
  mocks.delete.mockReset(); stop.mockReset(); revoke.mockReset();
  getUserMedia.mockReset().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:document-preview') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1920);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(1080);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob(['photo'], { type })));
});

afterEach(() => {
  cleanup(); vi.restoreAllMocks();
  if (mediaDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDescriptor); else Reflect.deleteProperty(navigator, 'mediaDevices');
  if (createDescriptor) Object.defineProperty(URL, 'createObjectURL', createDescriptor); else Reflect.deleteProperty(URL, 'createObjectURL');
  if (revokeDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor); else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

async function openCamera() {
  render(<CustomerDocument customerId="customer-one" token="token" />);
  fireEvent.click(screen.getByRole('button', { name: 'Foto documento' }));
  await screen.findByText('Nessuna foto documento caricata.');
  expect(getUserMedia).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Scatta foto' }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
  return screen.getByLabelText('Anteprima webcam');
}

async function capture() {
  fireEvent.loadedData(screen.getByLabelText('Anteprima webcam'));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Scatta' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Scatta' }));
  await screen.findByAltText('Anteprima della foto appena scattata');
}

it('opens the PC webcam without audio, previews the shot and saves only after confirmation', async () => {
  const video = await openCamera() as HTMLVideoElement;
  await waitFor(() => expect(video.srcObject).toBe(stream));
  expect(getUserMedia.mock.calls[0][0].audio).toBe(false);
  await capture();
  expect(stop).toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Salva foto scattata' }));
  await screen.findByText('Foto documento salvata.');
  const [path, token, file] = mocks.upload.mock.calls[0];
  expect(path).toBe('/customers/customer-one/document'); expect(token).toBe('token');
  expect(file).toBeInstanceOf(File); expect(file.type).toBe('image/jpeg');
  expect(screen.queryByRole('region', { name: 'Fotocamera documento' })).toBeNull();
  expect(revoke).toHaveBeenCalledWith('blob:document-preview');
});

it('allows retaking the photo and stops the camera when the user cancels', async () => {
  await openCamera(); await capture();
  fireEvent.click(screen.getByRole('button', { name: 'Rifai foto' }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  expect(screen.queryByAltText('Anteprima della foto appena scattata')).toBeNull();
  expect(revoke).toHaveBeenCalledWith('blob:document-preview');
  fireEvent.click(screen.getByRole('button', { name: 'Annulla scatto' }));
  expect(screen.queryByLabelText('Anteprima webcam')).toBeNull();
  expect(stop.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(mocks.upload).not.toHaveBeenCalled();
});

it('handles denied permission while keeping file upload available', async () => {
  getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  render(<CustomerDocument customerId="customer-one" token="token" />);
  fireEvent.click(screen.getByRole('button', { name: 'Foto documento' }));
  await screen.findByText('Nessuna foto documento caricata.');
  fireEvent.click(screen.getByRole('button', { name: 'Scatta foto' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Accesso alla webcam negato');
  fireEvent.click(screen.getByRole('button', { name: 'Annulla scatto' }));
  expect((screen.getByLabelText('Carica foto documento') as HTMLInputElement).disabled).toBe(false);
});

it('stops a permission request that resolves after closing the photo panel', async () => {
  let grant!: (value: MediaStream) => void;
  getUserMedia.mockImplementation(() => new Promise(resolve => { grant = resolve; }));
  await openCamera();
  fireEvent.click(screen.getByRole('button', { name: 'Foto documento' }));
  await act(async () => grant(stream));
  expect(stop).toHaveBeenCalled();
  expect(screen.queryByLabelText('Anteprima webcam')).toBeNull();
});

it('keeps a captured photo for retry when saving fails', async () => {
  mocks.upload.mockRejectedValueOnce(new Error('Connessione interrotta'));
  await openCamera(); await capture();
  fireEvent.click(screen.getByRole('button', { name: 'Salva foto scattata' }));
  await screen.findByRole('alert');
  expect(screen.getByAltText('Anteprima della foto appena scattata')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Salva foto scattata' }));
  await screen.findByText('Foto documento salvata.');
  expect(mocks.upload.mock.calls[0][2]).toBe(mocks.upload.mock.calls[1][2]);
});
