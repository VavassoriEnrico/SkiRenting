import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiDelete, apiPost } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('Richieste API', () => {
  it('accepts a deletion response without a JSON body', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await expect(apiDelete('/hotels/example', 'test-token')).resolves.toBeUndefined();
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE', headers: { Authorization: 'Bearer test-token' } });
  });

  it('preserves authenticated JSON creation requests', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'hotel' }), { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    await expect(apiPost('/hotels', 'test-token', { name: 'Hotel' })).resolves.toEqual({ id: 'hotel' });
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"name":"Hotel"}', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' } });
  });
});
