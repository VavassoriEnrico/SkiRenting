import { PackagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { apiGet, apiPost } from '../../lib/api';
import { detailFields, valuesFromVariant } from './rental-form';
import { sizeLabel, sortRentalCategories } from './rental-inventory';
import type { SaleArrival, SaleCatalog } from './sale-inventory';

const categorySuggestions: Record<string, string[]> = {
  ski: ['Base', 'Intermedio', 'Avanzato', 'Top-race', 'Freeride', 'Alpinismo', 'Freestyle'],
  snowboard: ['Base', 'Freeride'],
};

export function NewSaleArrivalDialog({ token, locationId, locationName, initialCategoryId, onClose, onCreated }: {
  token: string; locationId: string; locationName: string; initialCategoryId?: string;
  onClose: () => void; onCreated: (arrival: SaleArrival) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const request = useRef<{ id: string; data: string } | null>(null);
  const [catalog, setCatalog] = useState<SaleCatalog | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [categoryId, setCategoryId] = useState(initialCategoryId || '');
  const [variantId, setVariantId] = useState('new');
  const [values, setValues] = useState<Record<string, string>>({});
  const [arrival, setArrival] = useState({ quantity: '', price: '', purchase_price: '', received_on: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date()), notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); return () => controller.current?.abort(); }, []);
  useEffect(() => {
    const load = new AbortController(); setLoadError('');
    apiGet<SaleCatalog>(`/locations/${locationId}/sale-catalog`, token, load.signal)
      .then(data => { if (!load.signal.aborted) setCatalog(data); })
      .catch(cause => { if (!load.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Impossibile caricare il catalogo.'); });
    return () => load.abort();
  }, [locationId, token, attempt]);
  const category = catalog?.categories.find(entry => entry.id === categoryId);
  const variants = catalog?.variants.filter(entry => entry.category.id === categoryId) || [];
  const existing = variantId !== 'new';
  const family = category?.detail_type || 'accessory';
  const fields = category?.code === 'avalanche' ? [] : detailFields[family];
  const setValue = (key: string, value: string) => setValues(current => ({ ...current, [key]: value }));
  function changeCategory(id: string) { setCategoryId(id); setVariantId('new'); setValues({}); setError(''); }
  function changeVariant(id: string) {
    setVariantId(id);
    const variant = variants.find(entry => entry.id === id);
    setValues(variant ? { ...valuesFromVariant(variant), category_label: variant.sale_details?.category_label || '' } : {});
  }
  function close() { if (!submitting.current) onClose(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !category) return;
    const details = Object.fromEntries(fields.map(field => [field.key,
      !values[field.key]?.trim() ? null : field.type === 'number' ? Number(values[field.key]) : values[field.key].trim(),
    ]));
    const body = {
      category_id: categoryId,
      ...(existing ? { variant_id: variantId } : { new_variant: {
        brand: values.brand?.trim(), model: values.model?.trim(), year: values.year ? Number(values.year) : null,
        category_label: values.category_label?.trim() || null, details,
      } }),
      quantity: Number(arrival.quantity), price: arrival.price ? Number(arrival.price) : null,
      purchase_price: arrival.purchase_price ? Number(arrival.purchase_price) : null,
      received_on: arrival.received_on, notes: arrival.notes.trim() || null,
    };
    const serialized = JSON.stringify(body);
    if (!request.current || request.current.data !== serialized) request.current = { id: crypto.randomUUID(), data: serialized };
    submitting.current = true; setSaving(true); setError('');
    const save = new AbortController(); controller.current = save;
    try {
      const result = await apiPost<SaleArrival>(`/locations/${locationId}/sale-arrivals`, token, { ...body, request_id: request.current.id }, save.signal);
      if (!save.signal.aborted) onCreated(result);
    } catch (cause) {
      if (!save.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile registrare l’arrivo.');
    } finally {
      if (!save.signal.aborted) { submitting.current = false; setSaving(false); }
    }
  }
  return <dialog ref={dialog} className="sale-dialog rental-create-dialog sale-arrival-dialog" aria-labelledby="sale-arrival-title" onCancel={event => { event.preventDefault(); close(); }} onClose={close}>
    <div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">Magazzino vendite · {locationName}</p><h2 id="sale-arrival-title">Registra arrivo materiale</h2><p className="page-description">Scegli il materiale e indica quanti pezzi sono arrivati. I campi con * sono obbligatori.</p></div><button type="button" className="icon-button" aria-label="Chiudi registrazione arrivo" disabled={saving} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    {loadError ? <div className="sale-dialog-body"><p className="auth-error" role="alert">{loadError}</p><button type="button" className="sales-button" onClick={() => setAttempt(value => value + 1)}>Riprova catalogo</button></div> : !catalog ? <div className="sale-dialog-body" role="status">Caricamento catalogo…</div> : <form onSubmit={submit}>
      <div className="sale-dialog-body">
        <fieldset className="rental-form-section" disabled={saving}><legend>Tipo di materiale e categoria</legend><div className="rental-form-grid">
          <label>Tipo di materiale *<select required autoFocus value={categoryId} onChange={event => changeCategory(event.target.value)}><option value="">Seleziona tipo</option>{sortRentalCategories(catalog.categories).map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <label>Categoria<input disabled={!category || existing} maxLength={200} list="sale-category-labels" placeholder={family === 'ski' ? 'Es. Base, Freeride…' : 'Facoltativa'} value={values.category_label || ''} onChange={event => setValue('category_label', event.target.value)} /></label>
          <datalist id="sale-category-labels">{[...new Set([...(categorySuggestions[category?.code || ''] || []), ...variants.flatMap(entry => entry.sale_details?.category_label ? [entry.sale_details.category_label] : [])])].map(label => <option key={label} value={label} />)}</datalist>
        </div></fieldset>
        <fieldset className="rental-form-section" disabled={saving || !category}><legend>Modello e caratteristiche</legend><div className="rental-form-grid">
          <label className="rental-form-wide">Modello / variante<select value={variantId} onChange={event => changeVariant(event.target.value)}><option value="new">+ Nuovo modello o misura</option>{variants.map(entry => <option key={entry.id} value={entry.id}>{entry.brand} · {entry.model} · {sizeLabel(entry)}{entry.year ? ` · ${entry.year}` : ''}{entry.sale_details?.category_label ? ` · ${entry.sale_details.category_label}` : ''}</option>)}</select></label>
          {existing && <p className="rental-form-hint rental-form-wide">Caratteristiche del modello selezionato. <button type="button" className="reset-filters" onClick={() => setVariantId('new')}>Usa come base per una nuova variante</button></p>}
          <label>Marca *<input required maxLength={200} disabled={existing} list="sale-brands" value={values.brand || ''} onChange={event => setValue('brand', event.target.value)} /></label>
          <datalist id="sale-brands">{[...new Set(variants.map(entry => entry.brand))].sort().map(brand => <option key={brand} value={brand} />)}</datalist>
          <label>Modello *<input required maxLength={200} disabled={existing} list="sale-models" value={values.model || ''} onChange={event => setValue('model', event.target.value)} /></label>
          <datalist id="sale-models">{[...new Set(variants.filter(entry => entry.brand === values.brand).map(entry => entry.model))].sort().map(model => <option key={model} value={model} />)}</datalist>
          <label>Anno<input type="number" min={1900} max={9999} step="1" disabled={existing} value={values.year || ''} onChange={event => setValue('year', event.target.value)} /></label>
          {fields.map(field => <label key={field.key}>{field.label}<input type={field.type || 'text'} disabled={existing} maxLength={field.type ? undefined : 200} min={field.type ? 0.01 : undefined} max={field.max} step={field.type ? '0.01' : undefined} value={values[field.key] || ''} onChange={event => setValue(field.key, event.target.value)} /></label>)}
        </div></fieldset>
        <fieldset className="rental-form-section" disabled={saving}><legend>Arrivo e quantità</legend><div className="rental-form-grid">
          <label>Sede<input readOnly value={locationName} /></label>
          <label>Data arrivo *<input required type="date" value={arrival.received_on} onChange={event => setArrival({ ...arrival, received_on: event.target.value })} /></label>
          <label>Quantità in arrivo *<input required type="number" min="1" max="1000000" step="1" value={arrival.quantity} onChange={event => setArrival({ ...arrival, quantity: event.target.value })} /></label>
          <p className="rental-form-wide rental-form-hint">La quantità viene aggiunta alla giacenza di questa sede. Una misura diversa viene gestita come variante distinta.</p>
        </div></fieldset>
        <fieldset className="rental-form-section" disabled={saving}><legend>Prezzi</legend><div className="rental-form-grid">
          <label>Prezzo di acquisto unitario (€)<input type="number" min="0" max="9999999999.99" step="0.01" value={arrival.purchase_price} onChange={event => setArrival({ ...arrival, purchase_price: event.target.value })} /></label>
          <label>Prezzo di vendita unitario (€)<input type="number" min="0" max="9999999999.99" step="0.01" value={arrival.price} onChange={event => setArrival({ ...arrival, price: event.target.value })} /></label>
          <p className="rental-form-wide rental-form-hint">Se lasci vuoto il prezzo di vendita, viene mantenuto quello già impostato. Per un nuovo articolo rimane da definire.</p>
        </div></fieldset>
        <fieldset className="rental-form-section" disabled={saving}><legend>Note</legend><div className="rental-form-grid"><label className="rental-form-wide">Note arrivo<textarea maxLength={5000} value={arrival.notes} onChange={event => setArrival({ ...arrival, notes: event.target.value })} /></label></div></fieldset>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
      <div className="sale-dialog-footer"><button type="button" className="sales-button" disabled={saving} onClick={close}>Annulla</button><button type="submit" className="sales-button rental-create-submit" disabled={saving || !category}><PackagePlus size={16} aria-hidden="true" />{saving ? 'Salvataggio…' : 'Registra arrivo'}</button></div>
    </form>}
  </dialog>;
}
