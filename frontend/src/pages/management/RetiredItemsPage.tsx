import { Archive, Eye, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { apiGet, type Location } from '../../lib/api';
import { RentalUnitDialog } from '../inventory/RentalUnitDialog';
import { sizeLabel, sortRentalCategories, type RentalCategory, type RentalItem } from '../inventory/rental-inventory';

type RetiredItem = RentalItem & { location: Location; deleted_at: string | null; deleted_by: string | null };
type RetiredInventory = { categories: RentalCategory[]; locations: Location[]; items: RetiredItem[] };
const retirementDate = (value: string | null) => value
  ? new Date(value).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : 'Non registrata';

export function RetiredItemsPage() {
  const { session } = useAuth();
  return session ? <RetiredItems key={session.access_token} token={session.access_token} /> : <p role="status">Accedi per consultare gli articoli dismessi.</p>;
}

function RetiredItems({ token }: { token: string }) {
  const [data, setData] = useState<RetiredInventory | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<RetiredItem | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    apiGet<RetiredInventory>('/retired-rental-inventory', token, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile caricare gli articoli dismessi.'); });
    return () => controller.abort();
  }, [token, attempt]);
  const terms = query.trim().toLocaleLowerCase('it-IT').split(/\s+/);
  const filtered = (data?.items || []).filter(item => (!location || item.location.id === location) && (!category || item.variant.category.id === category)
    && terms.every(term => [item.code, item.variant.brand, item.variant.model, item.variant.year, sizeLabel(item.variant), item.variant.category.name, item.group.name, item.location.name].join(' ').toLocaleLowerCase('it-IT').includes(term)))
    .sort((a, b) => (b.deleted_at || '').localeCompare(a.deleted_at || '') || a.code.localeCompare(b.code, 'it', { numeric: true }));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 30) - 1));
  const visible = filtered.slice(currentPage * 30, (currentPage + 1) * 30);
  function reset() { setQuery(''); setLocation(''); setCategory(''); setPage(0); }
  return <div className="dashboard-page inventory-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><Archive size={21} aria-hidden="true" /></span><h1>Articoli dismessi</h1></div><p className="page-description">Il materiale da noleggio dismesso delle sedi autorizzate. Apri un esemplare per consultarne caratteristiche, noleggi e riparazioni.</p></div></div>
    <section className="rentals-panel" aria-labelledby="retired-items-title"><div className="rentals-panel-heading"><h2 id="retired-items-title">Elenco articoli dismessi</h2>{data && <span className="rentals-count" role="status">{filtered.length} di {data.items.length} esemplari</span>}</div>
      <div className="rentals-filters"><div className="rental-search"><Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor="retired-items-search">Cerca codice, marca, modello o misura</label><input id="retired-items-search" type="search" placeholder="Codice, marca, modello, misura…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></div>
        <label className="period-select"><span className="sr-only">Sede</span><select value={location} onChange={event => { setLocation(event.target.value); setPage(0); }}><option value="">Tutte le sedi</option>{data?.locations.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        <label className="period-select"><span className="sr-only">Tipo di materiale</span><select value={category} onChange={event => { setCategory(event.target.value); setPage(0); }}><option value="">Tutti i tipi</option>{sortRentalCategories(data?.categories || []).map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        {(query || location || category) && <button type="button" className="reset-filters" onClick={reset}><X size={14} aria-hidden="true" />Azzera filtri</button>}
      </div>
      <div className="rentals-table-scroll" role="region" aria-label="Elenco articoli dismessi" tabIndex={0}><table className="rentals-table"><caption className="sr-only">Singoli esemplari dismessi, con sede e data di dismissione</caption><thead><tr><th scope="col">Codice</th><th scope="col">Marca</th><th scope="col">Modello</th><th scope="col">Tipo</th><th scope="col">Misura / taglia</th><th scope="col">Sede</th><th scope="col">Data dismissione</th><th scope="col">Scheda</th></tr></thead><tbody>
        {error ? <tr><td colSpan={8}><div className="rentals-empty"><p className="auth-error" role="alert">{error}</p><button type="button" className="sales-button" onClick={() => setAttempt(value => value + 1)}>Riprova</button></div></td></tr> : !data ? <tr><td colSpan={8}><div className="rentals-empty" role="status">Caricamento articoli dismessi…</div></td></tr> : visible.map(item => <tr key={item.id} className="inventory-clickable-row" onClick={event => { if (!(event.target as HTMLElement).closest('button')) setSelected(item); }}><th scope="row" className="unit-code">{item.code}</th><td>{item.variant.brand}</td><td>{item.variant.model}</td><td>{item.variant.category.name}</td><td>{sizeLabel(item.variant)}</td><td>{item.location.name}</td><td>{retirementDate(item.deleted_at)}</td><td><button type="button" className="icon-button" aria-label={`Vedi articolo dismesso ${item.code}`} aria-haspopup="dialog" onClick={() => setSelected(item)}><Eye size={17} aria-hidden="true" /></button></td></tr>)}
        {!error && data && !visible.length && <tr><td colSpan={8}><div className="rentals-empty"><h3>{data.items.length ? 'Nessun articolo corrisponde ai filtri' : 'Nessun articolo dismesso'}</h3><p>{data.items.length ? 'Prova un altro filtro.' : 'Qui compariranno gli esemplari dismessi dal magazzino noleggio.'}</p></div></td></tr>}
      </tbody></table></div>
      {filtered.length > 30 && <div className="rental-equipment-pagination"><span>{currentPage * 30 + 1}–{Math.min((currentPage + 1) * 30, filtered.length)} di {filtered.length}</span><div><button type="button" className="sales-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Precedenti</button><button type="button" className="sales-button" disabled={(currentPage + 1) * 30 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Successivi</button></div></div>}
    </section>
    {selected && <RentalUnitDialog key={selected.id} item={selected} source={selected.location} destinations={[]} token={token} readOnly retiredAt={selected.deleted_at} onClose={() => setSelected(null)} onTransferred={() => {}} />}
  </div>;
}
