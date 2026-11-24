import { Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiGet, apiPost } from '../../lib/api';
import { rentalStatuses, sizeLabel } from './rental-inventory';
import { detailFields, detailTypes, valuesFromVariant } from './rental-form';
import type { CreatedRentalArrival, CreatedRentalItem, DetailType, RentalCatalog } from './rental-form';

export function NewRentalItemDialog({ token, locationId, locationName, initialCategoryId, onClose, onCreated }: {
  token: string; locationId: string; locationName: string; initialCategoryId?: string;
  onClose: () => void; onCreated: (item: CreatedRentalItem) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saveController = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const [catalog, setCatalog] = useState<RentalCatalog | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState(initialCategoryId || '');
  const [newCategory, setNewCategory] = useState({ name: '', code: '', detail_type: 'accessory' as DetailType });
  const [group, setGroup] = useState('');
  const [groupName, setGroupName] = useState('');
  const [variant, setVariant] = useState('new');
  const [values, setValues] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState('1');
  const [units, setUnits] = useState([{ code: '', serial_number: '' }]);
  const arrivalRequest = useRef<{ id: string; data: string } | null>(null);
  const [unit, setUnit] = useState({ status: 'active', purchase_price: '', legacy_sold_price: '', notes: '', is_rentable: true, is_bookable: true });

  useEffect(() => { dialog.current?.showModal(); return () => saveController.current?.abort(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    apiGet<RentalCatalog>(`/locations/${locationId}/rental-catalog`, token, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setCatalog(result); })
      .catch((cause) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Impossibile caricare il catalogo.'); });
    return () => controller.abort();
  }, [locationId, token, attempt]);

  const selectedCategory = catalog?.categories.find((entry) => entry.id === category);
  const family = category === 'new' ? newCategory.detail_type : selectedCategory?.detail_type || 'accessory';
  const groups = catalog?.groups.filter((entry) => entry.category_id === category) || [];
  const variants = catalog?.variants.filter((entry) => entry.category.id === category) || [];
  const existingVariant = variant !== 'new';
  const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));

  function changeCategory(id: string) {
    setCategory(id); setGroup(''); setGroupName(''); setVariant('new'); setValues({}); setError('');
  }
  function changeVariant(id: string) {
    setVariant(id);
    setValues(id === 'new' ? {} : valuesFromVariant(variants.find((entry) => entry.id === id)!));
  }
  function changeQuantity(value: string) {
    setQuantity(value);
    const count = Number(value);
    if (Number.isInteger(count) && count >= 1 && count <= 500) {
      setUnits(current => Array.from({ length: count }, (_, index) => current[index] || { code: '', serial_number: '' }));
    }
  }
  function changeUnit(index: number, key: 'code' | 'serial_number', value: string) {
    setUnits(current => current.map((entry, position) => position === index ? { ...entry, [key]: key === 'code' ? value.toUpperCase() : value } : entry));
  }
  function close() { if (!submitting.current) onClose(); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !catalog) return;
    if ((!selectedCategory && category !== 'new') || (!group && category !== 'new')) {
      setError('Seleziona categoria e gruppo.'); return;
    }
    if (Number(quantity) !== units.length || !units.every(entry => entry.code.trim())) {
      setError('Indica una quantità da 1 a 500 e un codice per ogni esemplare.'); return;
    }
    const codes = units.map(entry => entry.code.trim());
    if (new Set(codes.map(code => code.toLocaleUpperCase('it-IT'))).size !== units.length) {
      setError('Ogni esemplare deve avere un codice diverso.'); return;
    }
    const details = Object.fromEntries(detailFields[family].map((field) => [field.key,
      !values[field.key]?.trim() ? null : field.type === 'number' ? Number(values[field.key]) : values[field.key].trim(),
    ]));
    const body = {
      ...(category === 'new' ? { new_category: newCategory } : { category_id: category }),
      ...(group === 'new' || category === 'new' ? { new_group: groupName } : { group_id: group }),
      ...(existingVariant ? { variant_id: variant } : { new_variant: { brand: values.brand, model: values.model, year: values.year ? Number(values.year) : null, details } }),
      ...unit, notes: unit.notes.trim() || null,
      purchase_price: unit.purchase_price ? Number(unit.purchase_price) : null,
      legacy_sold_price: unit.legacy_sold_price ? Number(unit.legacy_sold_price) : null,
    };
    submitting.current = true; setSaving(true); setError('');
    const controller = new AbortController();
    saveController.current = controller;
    try {
      const entries = units.map(entry => ({ code: entry.code.trim(), serial_number: entry.serial_number.trim() || null }));
      if (entries.length === 1) {
        const result = await apiPost<CreatedRentalItem>(`/locations/${locationId}/rental-inventory`, token, { ...body, ...entries[0] }, controller.signal);
        if (!controller.signal.aborted) onCreated(result);
      } else {
        const payload = { ...body, units: entries };
        const serialized = JSON.stringify(payload);
        if (!arrivalRequest.current || arrivalRequest.current.data !== serialized) arrivalRequest.current = { id: crypto.randomUUID(), data: serialized };
        const result = await apiPost<CreatedRentalArrival>(`/locations/${locationId}/rental-arrivals`, token, { ...payload, request_id: arrivalRequest.current.id }, controller.signal);
        if (!controller.signal.aborted) onCreated({ ...result.items[0], created_count: result.quantity });
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile salvare l’articolo.');
    } finally {
      if (!controller.signal.aborted) { submitting.current = false; setSaving(false); }
    }
  }

  return <dialog ref={dialog} className="sale-dialog rental-create-dialog" aria-labelledby="new-rental-title" onCancel={(event) => { event.preventDefault(); close(); }} onClose={close}>
    <div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">Magazzino noleggio · {locationName}</p><h2 id="new-rental-title">Nuovo articolo</h2><p className="page-description">Compila una volta il modello, poi inserisci la quantità e un codice per ogni esemplare. I campi con * sono obbligatori.</p></div><button className="icon-button" type="button" aria-label="Chiudi nuovo articolo" disabled={saving} onClick={close}><X size={20} /></button></div>
    {loadError ? <div className="sale-dialog-body"><p className="auth-error" role="alert">{loadError}</p><button className="sales-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Riprova</button></div> : !catalog ? <div className="sale-dialog-body" role="status">Caricamento categorie e modelli…</div> : <form onSubmit={submit}>
      <div className="sale-dialog-body">
        <fieldset className="rental-form-section" disabled={saving}><legend>Categoria e gruppo</legend><div className="rental-form-grid">
          <label>Categoria *<select required value={category} onChange={(event) => changeCategory(event.target.value)} autoFocus><option value="">Seleziona categoria</option>{catalog.categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}<option value="new">+ Nuova categoria</option></select></label>
          {category === 'new' && <>
            <label>Nome nuova categoria *<input required maxLength={200} value={newCategory.name} onChange={(event) => setNewCategory({ ...newCategory, name: event.target.value })} /></label>
            <label>Codice categoria *<input aria-label="Codice categoria *" aria-describedby="rental-category-code-hint" required maxLength={60} pattern="[a-z][a-z0-9_]*" placeholder="es. protezioni" value={newCategory.code} onChange={(event) => setNewCategory({ ...newCategory, code: event.target.value })} /><small id="rental-category-code-hint">Lettere minuscole, numeri e underscore. È distinto dal codice dell’articolo.</small></label>
            <label>Campi della categoria *<select value={newCategory.detail_type} onChange={(event) => { setNewCategory({ ...newCategory, detail_type: event.target.value as DetailType }); setValues({}); }}>{detailTypes.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
          </>}
          {category !== 'new' && <label>Gruppo noleggio *<select required disabled={!category} value={group} onChange={(event) => setGroup(event.target.value)}><option value="">Seleziona gruppo</option>{groups.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}<option value="new">+ Nuovo gruppo</option></select></label>}
          {(group === 'new' || category === 'new') && <label>Nome nuovo gruppo *<input required maxLength={200} value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label>}
        </div></fieldset>
        <fieldset className="rental-form-section" disabled={saving || !category}><legend>Modello e caratteristiche</legend><div className="rental-form-grid">
          <label className="rental-form-wide">Modello / variante *<select value={variant} onChange={(event) => changeVariant(event.target.value)}><option value="new">+ Nuovo modello o misura</option>{variants.map((entry) => <option key={entry.id} value={entry.id}>{entry.brand} · {entry.model} · {sizeLabel(entry)}{entry.year ? ` · ${entry.year}` : ''}</option>)}</select></label>
          {existingVariant && <p className="rental-form-wide rental-form-hint">Le caratteristiche del modello esistente sono condivise. <button type="button" className="reset-filters" onClick={() => setVariant('new')}>Usa come base per una nuova variante</button></p>}
          <label>Marca *<input required maxLength={200} disabled={existingVariant} list="rental-brands" value={values.brand || ''} onChange={(event) => setValue('brand', event.target.value)} /></label>
          <datalist id="rental-brands">{[...new Set(variants.map((entry) => entry.brand))].sort().map((brand) => <option key={brand} value={brand} />)}</datalist>
          <label>Modello *<input required maxLength={200} disabled={existingVariant} list="rental-models" value={values.model || ''} onChange={(event) => setValue('model', event.target.value)} /></label>
          <datalist id="rental-models">{[...new Set(variants.filter((entry) => entry.brand === values.brand).map((entry) => entry.model))].sort().map((model) => <option key={model} value={model} />)}</datalist>
          <label>Anno originale<input type="number" min={1900} max={9999} step="1" disabled={existingVariant} value={values.year || ''} onChange={(event) => setValue('year', event.target.value)} /></label>
          {detailFields[family].map((field) => <label key={field.key}>{field.label}{field.options ? <select disabled={existingVariant} value={values[field.key] || 'unknown'} onChange={(event) => setValue(field.key, event.target.value)}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input disabled={existingVariant} type={field.type || 'text'} maxLength={field.type ? undefined : 200} min={field.type ? field.step === '1' ? 1 : 0.01 : undefined} max={field.max} step={field.type ? field.step || '0.01' : undefined} value={values[field.key] || ''} onChange={(event) => setValue(field.key, event.target.value)} />}</label>)}
        </div></fieldset>
        <fieldset className="rental-form-section" disabled={saving}><legend>Esemplari in arrivo</legend><div className="rental-form-grid">
          <label>Quantità in arrivo *<input type="number" required min="1" max="500" step="1" value={quantity} onChange={event => changeQuantity(event.target.value)} /></label>
          <label>Sede<input value={locationName} readOnly /></label>
          <p className="rental-form-wide rental-form-hint">{units.length} {units.length === 1 ? 'esemplare' : 'esemplari'} con modello, misura e gruppo condivisi. Inserisci un codice diverso per ciascuno.</p>
          {units.map((entry, index) => <div className="rental-form-wide rental-arrival-unit" key={index}><div className="rental-form-grid">
            <label>{units.length === 1 ? 'Codice univoco articolo *' : `Codice esemplare ${index + 1} *`}<input data-rental-code={index} required maxLength={200} value={entry.code} onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); dialog.current?.querySelector<HTMLInputElement>(`[data-rental-code="${index + 1}"]`)?.focus(); }
            }} onChange={event => changeUnit(index, 'code', event.target.value)} /></label>
            <label>{units.length === 1 ? 'Numero di serie (S/N)' : `Numero di serie ${index + 1} (S/N)`}<input maxLength={200} value={entry.serial_number} onChange={event => changeUnit(index, 'serial_number', event.target.value)} /></label>
          </div></div>)}
          <label className="rental-form-wide">Note esemplari<textarea maxLength={5000} value={unit.notes} onChange={event => setUnit({ ...unit, notes: event.target.value })} /></label>
        </div></fieldset>
        <fieldset className="rental-form-section" disabled={saving}><legend>Prezzo</legend><div className="rental-form-grid"><p className="rental-form-wide rental-form-hint">Prezzi unitari applicati a ciascun esemplare del carico.</p>
          <label>Prezzo di acquisto (€)<input type="number" min="0" max="9999999999.99" step="0.01" value={unit.purchase_price} onChange={(event) => setUnit({ ...unit, purchase_price: event.target.value })} /></label>
          <label>Prezzo venduto storico (€)<input aria-label="Prezzo venduto storico (€)" aria-describedby="rental-legacy-price-hint" type="number" min="0" max="9999999999.99" step="0.01" value={unit.legacy_sold_price} onChange={(event) => setUnit({ ...unit, legacy_sold_price: event.target.value })} /><small id="rental-legacy-price-hint">Opzionale; non è una tariffa di noleggio.</small></label>
        </div></fieldset>
        <fieldset className="rental-form-section" disabled={saving}><legend>Stato</legend><div className="rental-form-grid">
          <label>Stato<select value={unit.status} onChange={(event) => setUnit({ ...unit, status: event.target.value })}>{Object.entries(rentalStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="rental-form-check"><input type="checkbox" checked={unit.is_rentable} onChange={(event) => setUnit({ ...unit, is_rentable: event.target.checked })} />Noleggiabile</label>
          <label className="rental-form-check"><input type="checkbox" checked={unit.is_bookable} onChange={(event) => setUnit({ ...unit, is_bookable: event.target.checked })} />Prenotabile</label>
        </div></fieldset>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </div>
      <div className="sale-dialog-footer"><button className="sales-button" type="button" disabled={saving} onClick={close}>Annulla</button><button className="sales-button rental-create-submit" type="submit" disabled={saving}><Plus size={16} aria-hidden="true" />{saving ? 'Salvataggio…' : units.length === 1 ? 'Salva articolo' : `Salva ${units.length} articoli`}</button></div>
    </form>}
  </dialog>;
}
