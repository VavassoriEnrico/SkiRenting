import { ArrowRightLeft, Boxes, CircleCheck, Eye, Layers3, Package, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { StatCard } from '../../components/ui/StatCard';
import { apiGet } from '../../lib/api';
import type { Location } from '../../lib/api';
import { InventoryDetailsDialog } from './InventoryDetailsDialog';
import { NewRentalItemDialog } from './NewRentalItemDialog';
import { RentalItemTransfer } from './RentalItemTransfer';
import { groupRentalItems, isRentable, rentalStatuses, sizeLabel, variantFields } from './rental-inventory';
import type { RentalInventory, RentalItem, RentalRow } from './rental-inventory';

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

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
  const [success, setSuccess] = useState('');
  const [transferItem, setTransferItem] = useState<RentalItem | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
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
  const categories = useMemo(() => [...(data?.categories || [])].sort((a, b) => {
    const order = ['ski', 'snowboard', 'ski_boots', 'snowboard_boots', 'poles', 'helmet', 'goggles', 'avalanche', 'snowshoes', 'sled'];
    return (order.includes(a.code) ? order.indexOf(a.code) : order.length) - (order.includes(b.code) ? order.indexOf(b.code) : order.length) || a.name.localeCompare(b.name, 'it');
  }), [data]);
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
        <StatCard label="Abilitati al noleggio" value={String(data.items.filter(isRentable).length)} detail="Attivi e noleggiabili; non indica la disponibilità per data" icon={CircleCheck} />
        <StatCard label="Varianti" value={String(new Set(data.items.map((item) => item.variant.id)).size)} detail="Modelli e misure presenti nella sede" icon={Layers3} />
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
        <div className="rentals-table-scroll" role="region" aria-label="Elenco materiale noleggio" tabIndex={0}><table className="rentals-table inventory-table"><caption className="sr-only">Quantità per variante e gruppo di noleggio</caption><thead><tr><th scope="col">Marca</th><th scope="col">Modello</th><th scope="col">Gruppo</th><th scope="col">Misura / taglia</th><th scope="col">Anno</th><th scope="col" className="inventory-quantity">Quantità</th><th scope="col" className="inventory-quantity">Noleggiabili</th><th scope="col">Scheda</th></tr></thead><tbody>
          {filtered.map((row) => <tr key={row.id} className="inventory-clickable-row" onClick={(event) => { if (!(event.target as HTMLElement).closest('button')) setSelected(row); }}><td>{row.variant.brand}</td><th scope="row"><span className="rental-primary">{row.variant.model}</span></th><td>{row.group.name}</td><td>{sizeLabel(row.variant)}</td><td>{row.variant.year ?? '—'}</td><td className="inventory-quantity">{row.units.length}</td><td className="inventory-quantity">{row.units.filter(isRentable).length}</td><td><button type="button" className="icon-button" aria-label={`Apri scheda ${row.variant.brand} ${row.variant.model} ${sizeLabel(row.variant)}`} aria-haspopup="dialog" onClick={() => setSelected(row)}><Eye size={17} aria-hidden="true" /></button></td></tr>)}
          {filtered.length === 0 && <tr><td colSpan={8}><div className="rentals-empty"><Search size={25} aria-hidden="true" /><h3>Nessun articolo trovato</h3><p>Prova un altro filtro o seleziona un’altra categoria.</p></div></td></tr>}
        </tbody></table></div>
        <p className="rentals-panel-footer">Quantità raggruppate per modello, misura e gruppo. Tariffe da definire; disponibilità per periodo da collegare alle prenotazioni.</p>
      </section>
    </>}
    {creating && token && locationId && <NewRentalItemDialog token={token} locationId={locationId} locationName={locationName || ''} initialCategoryId={currentCategory?.id} onClose={() => setCreating(false)} onCreated={(item) => {
      setCreating(false); setCategory(item.category_id); resetFilters(); setSuccess(`Articolo ${item.code} salvato nel magazzino di ${locationName}.`); setAttempt((value) => value + 1);
    }} />}
    {selected && <InventoryDetailsDialog busy={transferBusy} onClose={() => { setSelected(null); setTransferItem(null); }} details={{
      demo: false, title: `${selected.variant.brand} ${selected.variant.model}`, category: selected.variant.category.name,
      warehouse: `Magazzino noleggio · ${locationName}`, fields: [
        ...variantFields(selected.variant), { label: 'Gruppo noleggio', value: selected.group.name },
        { label: 'Quantità', value: selected.units.length }, { label: 'Abilitati al noleggio', value: selected.units.filter(isRentable).length },
        { label: 'Tariffa', value: 'Da definire' },
      ], codes: [], codesLabel: 'Esemplari e codici univoci', units: [...selected.units].sort((a, b) => a.code.localeCompare(b.code, 'it', { numeric: true })).map((unit) => ({
        code: unit.code,
        action: <button className="sales-button inventory-transfer-button" type="button" disabled={transferBusy || destinations.length === 0} aria-label={`Sposta ${unit.code} di sede`} title={destinations.length === 0 ? 'Nessun’altra sede autorizzata' : undefined} onClick={() => setTransferItem(unit)}><ArrowRightLeft size={14} aria-hidden="true" />Sposta sede</button>,
        description: [rentalStatuses[unit.status], unit.is_rentable ? 'Noleggiabile' : 'Non noleggiabile', unit.is_bookable ? 'Prenotabile' : 'Non prenotabile', unit.serial_number ? `S/N: ${unit.serial_number}` : '', unit.purchase_price != null ? `Acquisto: ${currency.format(unit.purchase_price)}` : '', unit.legacy_sold_price != null ? `Venduto storico: ${currency.format(unit.legacy_sold_price)}` : '', unit.notes || ''].filter(Boolean).join(' · '),
      })),
    }}>
      {transferItem && token && locationId && <RentalItemTransfer key={transferItem.id} item={transferItem} token={token} source={{ id: locationId, name: locationName || '' }} destinations={destinations} onBusyChange={setTransferBusy} onCancel={() => setTransferItem(null)} onSuccess={(result, targetName) => {
        setTransferItem(null); setTransferBusy(false); setSelected(null);
        setSuccess(`Articolo ${result.code} spostato da ${locationName} a ${targetName}.`);
        setAttempt((value) => value + 1);
      }} />}
    </InventoryDetailsDialog>}
  </div>;
}
