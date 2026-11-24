import { expect, it } from 'vitest';

import { defaultRentalStartDate } from './rental-dates';

it.each([
  ['2026-11-24T14:59:59Z', '2026-11-24'],
  ['2026-11-24T15:00:00Z', '2026-11-25'],
  ['2026-11-24T19:30:00Z', '2026-11-25'],
  ['2026-07-15T13:59:59Z', '2026-07-15'],
  ['2026-07-15T14:00:00Z', '2026-07-16'],
  ['2026-11-30T17:00:00Z', '2026-12-01'],
  ['2026-12-31T17:00:00Z', '2027-01-01'],
  ['2028-02-28T17:00:00Z', '2028-02-29'],
  ['2026-11-24T23:30:00Z', '2026-11-25'],
])('suggests %s as %s using the rental location time', (now, expected) => {
  expect(defaultRentalStartDate(new Date(now))).toBe(expected);
});
