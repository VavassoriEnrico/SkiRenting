import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { RentalInventoryRates } from './RentalInventoryRates';
import { rateColumns } from '../management/rental-rates';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../lib/api', () => ({ apiGet: mocks.get }));
const prices = Object.fromEntries(rateColumns.map(({ key }, index) => [key, index === 0 ? 10 : index === 1 ? 0 : null]));
const rate = { ...prices, id: 'rate', group_id: 'race' };
beforeEach(() => mocks.get.mockReset().mockResolvedValue({ rates: [{ ...rate, group_id: 'other', daily_price_1_day: 999 }, rate] }));
afterEach(cleanup);

it('starts closed, loads the selected group on opening, and distinguishes zero from missing prices', async () => {
  render(<RentalInventoryRates token="token" groupId="race" groupName="RACE" />);
  const summary = screen.getByText('Tariffa');
  const section = summary.closest('details')!;
  expect(section.open).toBe(false);
  expect(mocks.get).not.toHaveBeenCalled();
  fireEvent.click(summary);
  await screen.findByText(/10,00\s€ \/ giorno/);
  expect(mocks.get).toHaveBeenCalledWith('/rental-rates', 'token', expect.any(AbortSignal));
  expect(screen.getByText(/^0,00\s€ \/ giorno$/)).toBeTruthy();
  expect(screen.getAllByText('Non impostata')).toHaveLength(5);
  expect(screen.getByText('7+ giorni')).toBeTruthy();
  expect(screen.queryByText(/999,00/)).toBeNull();
  fireEvent.click(summary);
  expect(section.open).toBe(false);
  fireEvent.click(summary);
  expect(section.open).toBe(true);
  expect(mocks.get).toHaveBeenCalledTimes(1);
});

it('shows seven unconfigured bands if the group has no rate row', async () => {
  mocks.get.mockResolvedValue({ rates: [] });
  render(<RentalInventoryRates token="token" groupId="missing" groupName="Nuovo gruppo" />);
  fireEvent.click(screen.getByText('Tariffa'));
  expect(await screen.findAllByText('Non impostata')).toHaveLength(7);
});

it('reports load errors and allows a retry without closing the material sheet', async () => {
  mocks.get.mockRejectedValueOnce(new Error('Listino non disponibile'));
  render(<RentalInventoryRates token="token" groupId="race" groupName="RACE" />);
  fireEvent.click(screen.getByText('Tariffa'));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Listino non disponibile');
  fireEvent.click(screen.getByRole('button', { name: 'Riprova tariffe' }));
  await screen.findByText(/10,00\s€ \/ giorno/);
  expect(mocks.get).toHaveBeenCalledTimes(2);
});
