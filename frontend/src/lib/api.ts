export type Location = { id: string; name: string };
export type OperatorSession = {
  profile: { id: string; created_at: string; name: string };
  locations: Location[];
};

const apiUrl = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api/v1').replace(/\/$/, '');

async function apiRequest<T>(path: string, token: string, signal?: AbortSignal, body?: unknown, method = body === undefined ? 'GET' : 'POST', file?: File): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(file ? { 'Content-Type': file.type || 'application/octet-stream' } : body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: file || (body === undefined ? undefined : JSON.stringify(body)),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(body === undefined ? 'Backend non raggiungibile. Verifica che sia avviato.' : 'Connessione interrotta: verifica se i dati sono stati salvati prima di riprovare.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail === 'string' ? body.detail : Array.isArray(body?.detail) ? 'Controlla i campi del modulo: uno o più valori non sono validi.' : 'Impossibile completare la richiesta.');
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export function apiGet<T>(path: string, token: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, token, signal);
}

export function apiPost<T>(path: string, token: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, token, signal, body);
}

export function apiDelete(path: string, token: string, signal?: AbortSignal): Promise<void> {
  return apiRequest<void>(path, token, signal, undefined, 'DELETE');
}

export function apiPatch<T>(path: string, token: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, token, signal, body, 'PATCH');
}

export function apiUpload<T>(path: string, token: string, file: File, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, token, signal, undefined, 'PUT', file);
}
