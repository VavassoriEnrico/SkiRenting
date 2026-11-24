import { Boxes, Layers3, PackagePlus, Search, ShoppingBag, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { StatCard } from '../../components/ui/StatCard';
import { apiGet } from '../../lib/api';
import { filterSaleInventory, type SaleArrival, type SaleInventoryItem } from './sale-inventory';
import { salePrice } from './general-inventory';
import { sortRentalCategories, variantFields, type RentalCategory } from './rental-inventory';
import { SaleInventoryTable } from './SaleInventoryTable';
import { InventoryDetailsDialog } from './InventoryDetailsDialog';
import { DeleteSaleStockDialog } from './DeleteSaleStockDialog';
import { NewSaleArrivalDialog } from './NewSaleArrivalDialog';

type Inventory = { categories: RentalCategory[]; items: SaleInventoryItem[] };

export function SaleInventoryPage() {
  const { session, location } = useAuth();
  return session && location ? <SaleInventory key={`${session.access_token}:${location.id}`} token={session.access_token} locationId={location.id} locationName={location.name} />
    : <p role="status">Seleziona una sede per consultare il magazzino vendite.</p>;
}

function SaleInventory({ token, locationId, locationName }: { token: string; locationId: string; locationName: string }) {
  const [data, setData] = useState<Inventory | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selectedItem, setSelectedItem] = useState<SaleInventoryItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<SaleInventoryItem | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    apiGet<Inventory>(`/locations/${locationId}/sale-inventory`, token, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile caricare il magazzino vendite.'); });
    return () => controller.abort();
  }, [token, locationId, attempt]);
  const categories = sortRentalCategories(data?.categories || []);
  const selectedCategory = categories.find(entry => entry.id === category) || categories[0];
  const items = data?.items || [];
  const filtered = filterSaleInventory(items, selectedCategory?.id || '', query);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 30) - 1));
  const visible = filtered.slice(currentPage * 30, (currentPage + 1) * 30);
  function resetFilters() { setQuery(''); setPage(0); }
  function created(arrival: SaleArrival) {
    setAdding(false); setSelectedItem(null); setCategory(arrival.category_id); resetFilters();
    setNotice(`Arrivo registrato: ${arrival.quantity_added} ${arrival.quantity_added === 1 ? 'pezzo aggiunto' : 'pezzi aggiunti'}. Giacenza della variante: ${arrival.quantity}.`);
    setAttempt(value => value + 1);
  }
  return <div className="dashboard-page inventory-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><ShoppingBag size={21} aria-hidden="true" /></span><h1>Magazzino vendite</h1></div><p className="page-description">Il materiale in vendita a {locationName}, suddiviso per tipo, modello e misura.</p></div><button type="button" className="sales-button sales-button-primary" onClick={() => setAdding(true)}><PackagePlus size={17} aria-hidden="true" />Registra arrivo</button></div>
    {notice && <p className="customer-action-notice" role="status">{notice}</p>}
    {error ? <div className="rentals-empty"><p className="auth-error" role="alert">{error}</p><button type="button" className="sales-button" onClick={() => setAttempt(value => value + 1)}>Riprova</button></div> : !data ? <p role="status">Caricamento magazzino vendite…</p> : <>
      <section className="stats-section tone-indigo rentals-summary" aria-label="Riepilogo magazzino vendite"><div className="stats-grid">
        <StatCard label="Articoli in magazzino" value={String(items.reduce((total, item) => total + item.quantity, 0))} detail={`Pezzi disponibili a ${locationName}`} icon={Boxes} />
        <StatCard label="Modelli e varianti" value={String(items.length)} detail="Distinti per caratteristiche e misura" icon={ShoppingBag} />
        <StatCard label="Tipi di materiale" value={String(new Set(items.map(item => item.variant.category.id)).size)} detail="Tipologie presenti nel magazzino" icon={Layers3} />
      </div></section>
      <section className="inventory-categories" aria-labelledby="sale-categories-title"><h2 id="sale-categories-title">Tipi di materiale</h2><div className="category-filters" role="group" aria-label="Filtra il materiale per tipo">
        {categories.map(entry => <button key={entry.id} type="button" className={`category-filter${selectedCategory?.id === entry.id ? ' is-selected' : ''}`} aria-pressed={selectedCategory?.id === entry.id} onClick={() => { setCategory(entry.id); resetFilters(); }}>{entry.name}<span>{items.filter(item => item.variant.category.id === entry.id).reduce((total, item) => total + item.quantity, 0)}</span></button>)}
      </div></section>
      <section className="rentals-panel" aria-labelledby="sale-inventory-list-title"><div className="rentals-panel-heading"><h2 id="sale-inventory-list-title">{selectedCategory?.name || 'Materiale'}</h2><span className="rentals-count" role="status">{filtered.length} varianti · {filtered.reduce((total, item) => total + item.quantity, 0)} pezzi</span></div>
        <div className="rentals-filters"><div className="rental-search"><Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor="sale-inventory-search">Cerca categoria, marca, modello o misura</label><input id="sale-inventory-search" type="search" placeholder="Categoria, marca, modello, misura…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></div>{query && <button className="reset-filters" type="button" onClick={resetFilters}><X size={14} aria-hidden="true" />Azzera ricerca</button>}</div>
        <SaleInventoryTable items={visible} categoryCode={selectedCategory?.code} onReset={resetFilters} onSelect={setSelectedItem} onDelete={setDeleting} isWarehouseEmpty={items.length === 0} />
        {filtered.length > 30 && <div className="rental-equipment-pagination"><span>{currentPage * 30 + 1}–{Math.min((currentPage + 1) * 30, filtered.length)} di {filtered.length}</span><div><button className="sales-button" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Precedenti</button><button className="sales-button" type="button" disabled={(currentPage + 1) * 30 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Successivi</button></div></div>}
        <p className="rentals-panel-footer">Quantità raggruppate per modello e caratteristiche. I prezzi sono unitari.</p>
      </section>
    </>}
    {selectedItem && <InventoryDetailsDialog key={selectedItem.id} onClose={() => setSelectedItem(null)} details={{ title: `${selectedItem.variant.brand} ${selectedItem.variant.model}`, category: selectedItem.variant.category.name, warehouse: `Magazzino vendite · ${locationName}`, demo: false,
      fields: [{ label: 'Categoria', value: selectedItem.variant.sale_details?.category_label || '—' }, ...variantFields(selectedItem.variant).filter(field => selectedItem.variant.category.code !== 'avalanche' || field.label !== 'Taglia'), { label: 'Quantità', value: selectedItem.quantity }, { label: 'Prezzo di vendita unitario', value: salePrice(selectedItem.price) }, { label: 'Note', value: selectedItem.notes || '—' }], codes: [], codesLabel: '',
    }} />}
    {deleting && <DeleteSaleStockDialog item={deleting} token={token} locationId={locationId} locationName={locationName} onClose={() => setDeleting(null)} onDeleted={id => {
      setData(current => current ? { ...current, items: current.items.filter(item => item.id !== id) } : null);
      setSelectedItem(current => current?.id === id ? null : current); setDeleting(null); setNotice('Articolo eliminato dal magazzino della sede.');
    }} />}
    {adding && <NewSaleArrivalDialog token={token} locationId={locationId} locationName={locationName} initialCategoryId={selectedCategory?.id} onClose={() => setAdding(false)} onCreated={created} />}
  </div>;
}
