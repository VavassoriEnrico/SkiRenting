import { Camera, RefreshCw, Save, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

function cameraError(error: unknown) {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Accesso alla webcam negato. Consenti la fotocamera nelle impostazioni del browser e riprova.';
  if (name === 'NotFoundError') return 'Nessuna webcam rilevata. Collega una fotocamera oppure carica una foto dal computer.';
  if (name === 'NotReadableError') return 'La webcam non è disponibile. Controlla che non sia occupata da un’altra applicazione e riprova.';
  return 'Impossibile avviare la webcam. Puoi riprovare oppure caricare una foto dal computer.';
}

export function CustomerDocumentCamera({ busy, onClose, onSave }: {
  busy: boolean; onClose: () => void; onSave: (file: File) => Promise<boolean>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(false);
  const capturePending = useRef(false);
  const savePending = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<File | null>(null);
  const [preview, setPreview] = useState('');

  function stopCamera() {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setReady(false); setStarting(true); setError('');
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStarting(false);
        setError('Webcam non disponibile. Apri il gestionale tramite HTTPS o localhost, oppure carica una foto dal computer.');
        return;
      }
      try {
        const camera = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: { ideal: 'environment' } }, audio: false,
        });
        if (!active) { camera.getTracks().forEach(track => track.stop()); return; }
        stream.current = camera;
        if (video.current) {
          video.current.srcObject = camera;
          await video.current.play();
        }
        if (active) setStarting(false);
      } catch (cause) {
        if (active) { stopCamera(); setStarting(false); setError(cameraError(cause)); }
      }
    }
    void start();
    return () => { active = false; stopCamera(); };
  }, [attempt]);

  useEffect(() => {
    if (!draft) { setPreview(''); return; }
    const url = URL.createObjectURL(draft);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [draft]);

  async function capture() {
    const source = video.current;
    if (capturePending.current || busy || !ready || !source) return;
    if (!source.videoWidth || !source.videoHeight) { setError('Attendi che la webcam mostri l’anteprima, poi riprova.'); return; }
    capturePending.current = true; setCapturing(true); setError('');
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 2048 / Math.max(source.videoWidth, source.videoHeight));
      canvas.width = Math.round(source.videoWidth * scale);
      canvas.height = Math.round(source.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas non disponibile');
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!mounted.current) return;
      if (!blob) throw new Error('Scatto non disponibile');
      setDraft(new File([blob], 'documento.jpg', { type: 'image/jpeg' }));
      stopCamera(); setReady(false);
    } catch {
      if (mounted.current) setError('Impossibile scattare la foto. Riprova o carica una foto dal computer.');
    } finally {
      capturePending.current = false;
      if (mounted.current) setCapturing(false);
    }
  }

  async function save() {
    if (!draft || busy || savePending.current) return;
    savePending.current = true;
    try { await onSave(draft); } finally { savePending.current = false; }
  }

  return <section className="customer-document-camera" aria-label="Fotocamera documento">
    <h3>Scatta il documento</h3>
    {draft ? <>{preview && <img src={preview} alt="Anteprima della foto appena scattata" />}<p className="rental-form-hint">Controlla che il documento sia leggibile prima di salvare.</p></>
      : <><video ref={video} autoPlay playsInline muted aria-label="Anteprima webcam" onLoadedData={() => setReady(true)} />{starting && <p role="status">Avvio webcam…</p>}<p className="rental-form-hint">Inquadra il documento e assicurati che sia ben illuminato.</p></>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <div className="sales-row-actions">
      {draft ? <><button type="button" className="sales-button" disabled={busy} onClick={() => { setDraft(null); setAttempt(value => value + 1); }}><RefreshCw size={14} aria-hidden="true" />Rifai foto</button><button type="button" className="sales-button sales-button-primary" disabled={busy} onClick={() => void save()}><Save size={14} aria-hidden="true" />{busy ? 'Salvataggio…' : 'Salva foto scattata'}</button></>
        : error ? <button type="button" className="sales-button" onClick={() => setAttempt(value => value + 1)}>Riprova webcam</button>
          : <button type="button" className="sales-button sales-button-primary" disabled={starting || !ready || capturing} onClick={() => void capture()}><Camera size={14} aria-hidden="true" />{capturing ? 'Scatto…' : 'Scatta'}</button>}
      <button type="button" className="sales-button" disabled={busy || capturing} onClick={onClose}><X size={14} aria-hidden="true" />Annulla scatto</button>
    </div>
  </section>;
}
