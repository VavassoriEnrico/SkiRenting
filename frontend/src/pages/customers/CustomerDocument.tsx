import { Camera, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiDelete, apiGet, apiUpload } from '../../lib/api';
import { CustomerDocumentCamera } from './CustomerDocumentCamera';

type DocumentInfo = { url: string | null };
const allowed = ['image/jpeg', 'image/png', 'image/webp'];

export function CustomerDocument({ customerId, token }: { customerId: string; token: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load() {
    if (pending.current) return;
    pending.current = true; setLoading(true); setError('');
    const request = new AbortController(); controller.current = request;
    try {
      const result = await apiGet<DocumentInfo>(`/customers/${customerId}/document`, token, request.signal);
      if (!request.signal.aborted) setUrl(result.url || null);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile aprire il documento.');
    } finally {
      if (!request.signal.aborted) { pending.current = false; setLoading(false); }
    }
  }
  async function upload(file?: File) {
    if (!file || pending.current) return false;
    if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Seleziona una foto JPEG, PNG o WebP di massimo 5 MB.'); return false;
    }
    pending.current = true; setBusy(true); setError(''); setNotice('');
    const request = new AbortController(); controller.current = request;
    try {
      const result = await apiUpload<DocumentInfo>(`/customers/${customerId}/document`, token, file, request.signal);
      if (!request.signal.aborted) { setUrl(result.url); setNotice('Foto documento salvata.'); return true; }
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile salvare la foto.');
    } finally {
      if (!request.signal.aborted) { pending.current = false; setBusy(false); }
    }
    return false;
  }
  async function remove() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    const request = new AbortController(); controller.current = request;
    try {
      await apiDelete(`/customers/${customerId}/document`, token, request.signal);
      if (!request.signal.aborted) { setUrl(null); setDeleting(false); setNotice('Foto documento rimossa.'); }
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile rimuovere la foto.');
    } finally {
      if (!request.signal.aborted) { pending.current = false; setBusy(false); }
    }
  }
  return <div className="customer-document">
    <button type="button" className="sales-button" aria-expanded={open} disabled={busy || loading} onClick={() => { setOpen(!open); setCameraOpen(false); if (!open) void load(); }}><Camera size={16} aria-hidden="true" />Foto documento</button>
    {open && <div className="customer-document-body">
      {loading ? <p role="status">Caricamento documento…</p> : url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Foto del documento del cliente" onError={() => setError('Anteprima non disponibile. Premi Aggiorna foto per riprovare.')} /></a> : !error && <p className="rental-form-hint">Nessuna foto documento caricata.</p>}
      {!cameraOpen && <button type="button" className="sales-button" disabled={busy || loading} onClick={() => { setError(''); setNotice(''); setDeleting(false); setCameraOpen(true); }}><Camera size={16} aria-hidden="true" />Scatta foto</button>}
      {cameraOpen && <CustomerDocumentCamera busy={busy} onClose={() => setCameraOpen(false)} onSave={async file => {
        const saved = await upload(file);
        if (saved) setCameraOpen(false);
        return saved;
      }} />}
      <label>{url ? 'Sostituisci foto documento' : 'Carica foto documento'}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy || loading || cameraOpen} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file); }} /></label>
      <p className="rental-form-hint">Facoltativa. JPEG, PNG o WebP, massimo 5 MB.</p>
      <div className="sales-row-actions"><button className="sales-button" type="button" disabled={busy || loading || cameraOpen} onClick={() => void load()}><RefreshCw size={14} aria-hidden="true" />Aggiorna foto</button>{url && <button className="sales-button" type="button" disabled={busy || loading || cameraOpen} onClick={() => setDeleting(true)}><Trash2 size={14} aria-hidden="true" />Rimuovi foto</button>}</div>
      {deleting && <div><p>Confermi la rimozione della foto del documento?</p><button type="button" className="sales-button" disabled={busy} onClick={() => setDeleting(false)}>Annulla rimozione</button><button type="button" className="sales-button customer-delete-confirm" disabled={busy} onClick={() => void remove()}>Conferma rimozione foto</button></div>}
      {busy && <p role="status">Salvataggio documento…</p>}{notice && <p role="status">{notice}</p>}{error && <p className="auth-error" role="alert">{error}</p>}
    </div>}
  </div>;
}
