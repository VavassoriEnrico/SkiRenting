import { Barcode, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiGet } from '../../lib/api';
import { isRentable, rentalStatuses, sizeLabel } from '../inventory/rental-inventory';
import type { RentalInventory, RentalItem } from '../inventory/rental-inventory';
import { RentalSection } from './RentalSection';

const pageSize = 20;
const canSelect = (item: RentalItem) => isRentable(item) && item.is_bookable;

function unavailableReason(item: RentalItem) {
  if (item.status !== 'active') return rentalStatuses[item.status];
  return item.is_rentable ? 'Non prenotabile' : 'Non noleggiabile';
}

export function RentalEquipmentSection({ token, locationId, locationName, selected, onAdd, onRemove, startsOn = '', endsOn = '' }: {
  startsOn?: string;
  endsOn?: string;
  token: string;
  locationId?: string;
  locationName?: string;
  selected: RentalItem[];
  onAdd: (item: RentalItem) => void;
  onRemove: (id: string) => void;
}) {
  const [inventory, setInventory] = useState<RentalInventory | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);
  const currentSelection = useRef({ selected, onRemove });
  currentSelection.current = { selected, onRemove };
  const periodQuery = startsOn && endsOn && endsOn >= startsOn
    ? `&starts_on=${startsOn}&ends_on=${endsOn}` : '';
  const inventoryPath = `/locations/${locationId}/rental-inventory?available_only=true${periodQuery}`;

  useEffect(() => {
    if (!locationId) return;
    const controller = new AbortController();
    setInventory(null); setLoadError('');
    apiGet<RentalInventory>(inventoryPath, token, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setInventory(result);
        const availableIds = new Set(result.items.map((item) => item.id));
        const unavailable = currentSelection.current.selected.filter((item) => !availableIds.has(item.id));
        unavailable.forEach((item) => currentSelection.current.onRemove(item.id));
        if (unavailable.length) {
          setMessage('');
          setError(`Materiale non più disponibile, rimosso dalla selezione: ${unavailable.map((item) => item.code).join(', ')}.`);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Impossibile caricare il materiale.');
      });
    return () => controller.abort();
  }, [token, locationId, inventoryPath, attempt]);

  const selectedIds = new Set(selected.map((item) => item.id));
  const terms = query.trim().toLocaleLowerCase('it-IT').split(/\s+/);
  const results = (inventory?.items || []).filter((item) => {
    const text = [item.code, item.variant.brand, item.variant.model, sizeLabel(item.variant), item.group.name].join(' ').toLocaleLowerCase('it-IT');
    return (!category || item.variant.category.id === category) && terms.every((term) => text.includes(term));
  });
  const currentPage = Math.min(page, Math.max(0, Math.ceil(results.length / pageSize) - 1));
  const start = currentPage * pageSize;
  const pageItems = results.slice(start, start + pageSize);

  function add(item: RentalItem) {
    setMessage(''); setError('');
    if (selectedIds.has(item.id)) {
      setError(`L’articolo ${item.code} è già stato aggiunto al noleggio.`);
    } else if (!canSelect(item)) {
      setError(`L’articolo ${item.code} non può essere aggiunto: ${unavailableReason(item).toLocaleLowerCase('it-IT')}.`);
    } else {
      onAdd(item); setCode(''); setMessage(`Articolo ${item.code} aggiunto.`);
    }
    codeInput.current?.focus();
  }

  function addByCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inventory || !code.trim()) return;
    const item = inventory.items.find((entry) => entry.code === code.trim());
    if (item) add(item);
    else {
      setMessage(''); setError(`Codice non trovato o non disponibile per il noleggio nel magazzino di ${locationName}.`);
      codeInput.current?.focus();
    }
  }

  return (
    <RentalSection id="rental-equipment" title="Materiale" className="rental-equipment-panel">
      <div className="rental-customer-body">
        <p className="rental-equipment-description">Materiale del magazzino di {locationName || 'questa sede'}. Leggi un codice oppure cerca manualmente un articolo.</p>
        {!locationId ? <p role="status">Seleziona una sede per cercare il materiale.</p>
          : loadError ? <div className="auth-error" role="alert">{loadError}<div><button type="button" className="sales-button" onClick={() => setAttempt((value) => value + 1)}>Riprova caricamento materiale</button></div></div>
            : !inventory ? <p role="status">Caricamento materiale…</p>
              : <>
                <form className="rental-form-grid rental-equipment-code" onSubmit={addByCode}>
                  <label>Codice materiale<input ref={codeInput} type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} value={code} onChange={(event) => { setCode(event.target.value); setError(''); setMessage(''); }} placeholder="Scansiona o scrivi il codice" /></label>
                  <button className="sales-button sales-button-primary" type="submit" disabled={!code.trim()}><Barcode size={18} aria-hidden="true" />Aggiungi codice</button>
                </form>
                {error && <p className="auth-error" role="alert">{error}</p>}
                {message && <p className="rental-equipment-message" role="status">{message}</p>}
                <button className="sales-button rental-equipment-manual-toggle" type="button" aria-expanded={manual} aria-controls="rental-equipment-search" onClick={() => setManual((value) => !value)}><Search size={16} aria-hidden="true" />{manual ? 'Chiudi ricerca manuale' : 'Ricerca manuale'}</button>

                <div id="rental-equipment-search" hidden={!manual}>
                  <div className="rental-form-grid rental-equipment-filters">
                    <label>Cerca materiale<input type="search" placeholder="Codice, marca, modello o misura…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
                    <label>Categoria materiale<select value={category} onChange={(event) => { setCategory(event.target.value); setPage(0); }}><option value="">Tutte le categorie</option>{inventory.categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
                  </div>
                  <div className="rentals-table-scroll" role="region" aria-label="Materiale da aggiungere" tabIndex={0}>
                    <table className="rentals-table rental-equipment-table"><caption className="sr-only">Articoli della sede attiva per la selezione manuale</caption>
                      <thead><tr><th scope="col">Codice</th><th scope="col">Marca</th><th scope="col">Modello</th><th scope="col">Misura</th><th scope="col">Gruppo</th><th scope="col">Selezione</th></tr></thead>
                      <tbody>{pageItems.map((item) => <tr key={item.id}>
                        <th scope="row" className="unit-code">{item.code}</th><td>{item.variant.brand}</td><td>{item.variant.model}</td><td>{sizeLabel(item.variant)}</td><td>{item.group.name}</td>
                        <td>{!canSelect(item) ? <span className="rental-secondary">{unavailableReason(item)}</span> : <button type="button" className="sales-button" disabled={selectedIds.has(item.id)} aria-label={`${selectedIds.has(item.id) ? 'Già aggiunto' : 'Aggiungi'} ${item.code}`} onClick={() => add(item)}><Plus size={14} aria-hidden="true" />{selectedIds.has(item.id) ? 'Aggiunto' : 'Aggiungi'}</button>}</td>
                      </tr>)}
                      {results.length === 0 && <tr><td colSpan={6}><div className="rentals-empty">Nessun materiale trovato.</div></td></tr>}</tbody>
                    </table>
                  </div>
                  <div className="rental-equipment-pagination"><span role="status">{results.length ? `${start + 1}–${Math.min(start + pageSize, results.length)} di ${results.length} articoli` : '0 articoli'}</span><div><button className="sales-button" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Precedenti</button><button className="sales-button" type="button" disabled={start + pageSize >= results.length} onClick={() => setPage(currentPage + 1)}>Successivi</button></div></div>
                </div>
              </>}

        <h3 className="rental-equipment-selected-title">Articoli selezionati ({selected.length})</h3>
        {selected.length === 0 ? <p className="rental-form-hint">Non hai ancora aggiunto materiale al noleggio.</p>
          : <div className="rentals-table-scroll" role="region" aria-label="Articoli selezionati per il noleggio" tabIndex={0}>
            <table className="rentals-table rental-equipment-table"><caption className="sr-only">Materiale scelto per la bozza del noleggio</caption>
              <thead><tr><th scope="col">Codice</th><th scope="col">Categoria</th><th scope="col">Marca</th><th scope="col">Modello</th><th scope="col">Misura</th><th scope="col">Rimuovi</th></tr></thead>
              <tbody>{selected.map((item) => <tr key={item.id}><th scope="row" className="unit-code">{item.code}</th><td>{item.variant.category.name}</td><td>{item.variant.brand}</td><td>{item.variant.model}</td><td>{sizeLabel(item.variant)}</td><td><button className="icon-button" type="button" aria-label={`Rimuovi ${item.code}`} onClick={() => { onRemove(item.id); setError(''); setMessage(`Articolo ${item.code} rimosso.`); }}><Trash2 size={17} aria-hidden="true" /></button></td></tr>)}</tbody>
            </table>
          </div>}
        <p className="rental-form-hint rental-equipment-availability">Gli articoli già consegnati o prenotati nel periodo scelto sono esclusi. Senza un periodo completo viene verificata la disponibilità di oggi. La disponibilità viene ricontrollata alla conferma.</p>
      </div>
    </RentalSection>
  );
}
