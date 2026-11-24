import { Boxes, CalendarDays, Eye, Archive, Wrench, Package, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { StatCard } from '../../components/ui/StatCard';
import { apiGet } from '../../lib/api';
import type { Location } from '../../lib/api';
import { InventoryDetailsDialog } from './InventoryDetailsDialog';
import { DeleteRentalItemsDialog } from './DeleteRentalItemsDialog';
import { NewRentalItemDialog } from './NewRentalItemDialog';
import { RentalInventoryRates } from './RentalInventoryRates';
import { RentalUnitDialog } from './RentalUnitDialog';
import { groupRentalItems, sizeLabel, sortRentalCategories, variantFields } from './rental-inventory';
import type { RentalInventory, RentalItem, RentalRow } from './rental-inventory';

export function RentalInventoryPage() {
  const { session, location, operator } = useAuth();
  // A different site/session gets fresh state, even outside AppLayout.
  return <RentalInventoryContent key={`${location?.id}:${session?.access_token}`} token={session?.access_token} locationId={location?.id} locationName={location?.name} locations={operator?.locations || []} />;
}

function RentalInventoryContent({ token, locationId, locationName, locations }: { token?: string; locationId?: string; locationName?: string; locations: Location[] }) {
  const [data, setData] = useState<RentalInventory | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [category, setCategory] = useState('');
  const [group, setGroup] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RentalRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RentalItem[] | null>(null);
  const [success, setSuccess] = useState('');
  const [viewed, setViewed] = useState<RentalItem | null>(null);
  const destinations = locations.filter((entry) => entry.id !== locationId);

  useEffect(() => {
    if (!token || !locationId) return;
    const controller = new AbortController();
    setError('');
    setData(null);
    apiGet<RentalInventory>(`/locations/${locationId}/rental-inventory`, token, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile caricare il magazzino.'); });
    return () => controller.abort();
  }, [token, locationId, attempt]);

  const rows = useMemo(() => groupRentalItems(data?.items || []), [data]);
  const categories = useMemo(() => sortRentalCategories(data?.categories || []), [data]);
  const currentCategory = categories.find((entry) => entry.id === category) || categories[0];
  const categoryRows = rows.filter((row) => row.variant.category.id === currentCategory?.id);
  const groups = [...new Map(categoryRows.map((row) => [row.group.id, row.group])).values()].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const search = query.trim().toLocaleLowerCase('it-IT');
  const filtered = categoryRows.filter((row) => (!group || row.group.id === group) && (
    [row.variant.brand, row.variant.model, row.variant.year, sizeLabel(row.variant), row.group.name, ...row.units.map((unit) => unit.code)].join(' ').toLocaleLowerCase('it-IT').includes(search)
  ));

  const filteredQuantity = filtered.reduce((count, row) => count + row.units.length, 0);

  function resetFilters() { setQuery(''); setGroup(''); }

  return <div className="dashboard-page inventory-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><Package size={21} aria-hidden="true" /></span><h1>Magazzino noleggio</h1></div><p className="page-description">Attrezzatura di {locationName}, divisa per categoria e gruppo.</p></div><button className="sales-button rental-create-submit" type="button" disabled={!data || !token || !locationId} onClick={() => { setSuccess(''); setCreating(true); }}><Plus size={17} aria-hidden="true" />Nuovo articolo</button></div>
    {success && <p className="rental-inventory-notice" role="status">{success}</p>}
    {!token || !locationId ? <p role="status">Seleziona una sede per visualizzare il magazzino.</p> : error ? <div className="auth-error" role="alert">{error}<div><button className="sales-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Riprova</button></div></div> : !data ? <p role="status">Caricamento magazzino noleggio…</p> : <>
      <section className="stats-section tone-indigo rentals-summary" aria-label="Riepilogo magazzino noleggio"><div className="stats-grid">
        <StatCard label="Articoli totali" value={String(data.items.length)} detail={`Esemplari registrati a ${locationName}`} icon={Boxes} />
        <StatCard label="Attualmente noleggiati" value={data.summary ? String(data.summary.currently_rented) : '—'} detail="In corso oggi o ancora da riconsegnare" icon={CalendarDays} />
        <StatCard label="Attualmente in riparazione" value={data.summary ? String(data.summary.currently_in_repair) : '—'} detail="Esemplari in manutenzione o con intervento aperto" icon={Wrench} />
      </div></section>
      {data.items.length === 0 && <p className="rental-inventory-notice" role="status">Nessun articolo di noleggio assegnato a questa sede.</p>}
      <section className="inventory-categories" aria-labelledby="categories-title"><h2 id="categories-title">Categorie</h2><div className="category-filters" role="group" aria-label="Filtra il materiale per categoria">
        {categories.map((entry) => <button key={entry.id} type="button" className={`category-filter${currentCategory?.id === entry.id ? ' is-selected' : ''}`} aria-pressed={currentCategory?.id === entry.id} onClick={() => { setCategory(entry.id); resetFilters(); }}>{entry.name}<span>{data.items.filter((item) => item.variant.category.id === entry.id).length}</span></button>)}
      </div></section>
      <section className="rentals-panel" aria-labelledby="inventory-list-title"><div className="rentals-panel-heading"><h2 id="inventory-list-title">{currentCategory?.name || 'Materiale'}</h2><span className="rentals-count" role="status">{filtered.length} {filtered.length === 1 ? 'variante' : 'varianti'} · {filteredQuantity} {filteredQuantity === 1 ? 'articolo' : 'articoli'}</span></div>
        <div className="rentals-filters"><div className="rental-search"><Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor="rental-inventory-search">Cerca marca, modello, misura o codice</label><input id="rental-inventory-search" type="search" placeholder="Cerca marca, modello, misura o codice…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <label className="period-select"><span className="sr-only">Gruppo noleggio</span><select value={group} onChange={(event) => setGroup(event.target.value)}><option value="">Tutti i gruppi</option>{groups.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          {(query || group) && <button type="button" className="reset-filters" onClick={resetFilters}><X size={14} aria-hidden="true" />Azzera filtri</button>}
        </div>
        <div className="rentals-table-scroll" role="region" aria-label="Elenco materiale noleggio" tabIndex={0}><table className="rentals-table inventory-table"><caption className="sr-only">Quantità per variante e gruppo di noleggio</caption><thead><tr><th scope="col">Marca</th><th scope="col">Modello</th><th scope="col">Gruppo</th><th scope="col">Misura / taglia</th><th scope="col">Anno</th><th scope="col" className="inventory-quantity">Quantità</th><th scope="col">Azioni</th></tr></thead><tbody>
          {filtered.map((row) => <tr key={row.id} className="inventory-clickable-row" onClick={(event) => { if (!(event.target as HTMLElement).closest('button')) setSelected(row); }}><td>{row.variant.brand}</td><th scope="row"><span className="rental-primary">{row.variant.model}</span></th><td>{row.group.name}</td><td>{sizeLabel(row.variant)}</td><td>{row.variant.year ?? '—'}</td><td className="inventory-quantity">{row.units.length}</td><td><div className="sales-row-actions"><button type="button" className="icon-button" aria-label={`Apri scheda ${row.variant.brand} ${row.variant.model} ${sizeLabel(row.variant)}`} aria-haspopup="dialog" onClick={() => setSelected(row)}><Eye size={17} aria-hidden="true" /></button><button type="button" className="icon-button customer-delete-button" disabled={row.units.every(unit => unit.is_generic)} aria-label={`Dismetti articoli ${row.variant.brand} ${row.variant.model} ${sizeLabel(row.variant)}`} title="Dismetti esemplari" onClick={() => { setSuccess(''); setDeleting(row.units); }}><Archive size={16} aria-hidden="true" /></button></div></td></tr>)}
          {filtered.length === 0 && <tr><td colSpan={7}><div className="rentals-empty"><Search size={25} aria-hidden="true" /><h3>Nessun articolo trovato</h3><p>Prova un altro filtro o seleziona un’altra categoria.</p></div></td></tr>}
        </tbody></table></div>
        <p className="rentals-panel-footer">Quantità raggruppate per modello, misura e gruppo. Apri la scheda per consultare esemplari, codici e tariffe del gruppo.</p>
      </section>
    </>}
    {creating && token && locationId && <NewRentalItemDialog token={token} locationId={locationId} locationName={locationName || ''} initialCategoryId={currentCategory?.id} onClose={() => setCreating(false)} onCreated={(item) => {
      setCreating(false); setCategory(item.category_id); resetFilters(); setSuccess(item.created_count && item.created_count > 1 ? `${item.created_count} esemplari salvati nel magazzino di ${locationName}.` : `Articolo ${item.code} salvato nel magazzino di ${locationName}.`); setAttempt((value) => value + 1);
    }} />}
    {selected && <InventoryDetailsDialog tariffSection={token && <RentalInventoryRates key={`${selected.group.id}:${token}`} token={token} groupId={selected.group.id} groupName={selected.group.name} />} busy={Boolean(viewed || deleting)} onClose={() => { setSelected(null); setViewed(null); }} details={{
      demo: false, title: `${selected.variant.brand} ${selected.variant.model}`, category: selected.variant.category.name,
      warehouse: `Magazzino noleggio · ${locationName}`, fields: [
        ...variantFields(selected.variant), { label: 'Gruppo noleggio', value: selected.group.name },
        { label: 'Quantità', value: selected.units.length },
      ], codes: [], codesLabel: 'Esemplari e codici univoci', units: [...selected.units].sort((a, b) => a.code.localeCompare(b.code, 'it', { numeric: true })).map((unit) => ({
        code: unit.code,
        action: <div className="sales-row-actions"><button className="sales-button inventory-transfer-button" type="button" aria-label={`Vedi ${unit.code}`} onClick={() => setViewed(unit)}>Vedi</button><button type="button" className="icon-button customer-delete-button" disabled={unit.is_generic} title="Dismetti esemplare" aria-label={`Dismetti esemplare ${unit.code}`} onClick={() => setDeleting([unit])}><Archive size={16} aria-hidden="true" /></button></div>,
      })),
    }}>
      {viewed && token && locationId && <RentalUnitDialog key={viewed.id} item={viewed} token={token} source={{ id: locationId, name: locationName || '' }} destinations={destinations} onClose={() => setViewed(null)} onTransferred={(result, targetName) => {
        setViewed(null); setSelected(null);
        setSuccess(`Articolo ${result.code} spostato da ${locationName} a ${targetName}.`);
        setAttempt((value) => value + 1);
      }} />}
    </InventoryDetailsDialog>}
    {deleting && token && locationId && <DeleteRentalItemsDialog items={deleting} token={token} locationId={locationId} locationName={locationName || ''} onClose={() => setDeleting(null)} onDeleted={ids => {
      const removed = new Set(ids);
      setData(current => {
        if (!current) return current;
        const removedInRepair = current.items.filter(item => removed.has(item.id) && (item.status === 'maintenance' || item.open_repair)).length;
        return { ...current, items: current.items.filter(item => !removed.has(item.id)),
          summary: current.summary ? { ...current.summary, currently_in_repair: Math.max(0, current.summary.currently_in_repair - removedInRepair) } : current.summary,
        };
      });
      setSelected(current => current ? { ...current, units: current.units.filter(item => !removed.has(item.id)) } : null);
      setViewed(current => current && removed.has(current.id) ? null : current);
      setDeleting(null);
      setSuccess(`${ids.length} ${ids.length === 1 ? 'esemplare dismesso' : 'esemplari dismessi'} dal magazzino di ${locationName}.`);
    }} />}
  </div>;
}
