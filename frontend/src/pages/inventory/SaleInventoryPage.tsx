import { Boxes, CircleCheck, Layers3, Search, ShoppingBag, X } from 'lucide-react';
import { useState } from 'react';

import { StatCard } from '../../components/ui/StatCard';
import { categories } from './demo-data';
import type { Category } from './demo-data';
import { filterSaleInventory, saleInventory } from './sale-inventory';
import type { SaleInventoryItem } from './sale-inventory';
import { saleDetailColumns, SaleInventoryTable } from './SaleInventoryTable';
import { InventoryDetailsDialog } from './InventoryDetailsDialog';

export function SaleInventoryPage() {
  const [category, setCategory] = useState<Category>('ski');
  const [query, setQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<SaleInventoryItem | null>(null);
  const filteredItems = filterSaleInventory(saleInventory, category, query);
  const totalQuantity = saleInventory.reduce((total, item) => total + item.unitCodes.length, 0);
  const categoryLabel = categories.find((item) => item.id === category)!.label;

  function resetFilters() { setCategory('ski'); setQuery(''); }

  return (
    <div className="dashboard-page inventory-page">
      <div className="dashboard-heading">
        <div><div className="page-heading"><span className="heading-icon"><ShoppingBag size={21} aria-hidden="true" /></span><h1>Magazzino vendita</h1></div><p className="page-description">Gli articoli destinati alla vendita, divisi per categoria.</p></div>
        <span className="demo-badge"><span aria-hidden="true" />Dati dimostrativi</span>
      </div>
      <section className="stats-section tone-indigo rentals-summary" aria-label="Riepilogo magazzino vendita">
        <div className="stats-grid">
          <StatCard label="Articoli in magazzino" value={String(totalQuantity)} detail="Esemplari con codice univoco" icon={Boxes} />
          <StatCard label="Modelli e varianti" value={String(saleInventory.length)} detail="Righe distinte per caratteristiche e misura" icon={CircleCheck} />
          <StatCard label="Categorie" value={String(categories.length)} detail="Tipologie di materiale" icon={Layers3} />
        </div>
      </section>
      <section className="inventory-categories" aria-labelledby="categories-title">
        <h2 id="categories-title">Categorie</h2>
        <div className="category-filters" role="group" aria-label="Filtra il materiale per categoria">
          {categories.map((entry) => <button key={entry.id} type="button" className={`category-filter${category === entry.id ? ' is-selected' : ''}`} aria-pressed={category === entry.id} onClick={() => setCategory(entry.id)}>{entry.label}<span>{saleInventory.filter((item) => item.category === entry.id).length}</span></button>)}
        </div>
      </section>
      <section className="rentals-panel" aria-labelledby="inventory-list-title">
        <div className="rentals-panel-heading"><h2 id="inventory-list-title">{categoryLabel}</h2><span className="rentals-count" role="status">{filteredItems.length} {filteredItems.length === 1 ? 'riga' : 'righe'} · {filteredItems.reduce((sum, item) => sum + item.unitCodes.length, 0)} esemplari</span></div>
        <div className="rentals-filters">
          <div className="rental-search"><Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor="inventory-search">Cerca codice, tipo, marca, modello, misura o colore</label><input id="inventory-search" type="search" placeholder="Cerca codice, tipo, marca, modello, misura o colore…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          {(query || category !== 'ski') && <button className="reset-filters" type="button" onClick={resetFilters}><X size={14} aria-hidden="true" />Azzera filtri</button>}
        </div>
        <SaleInventoryTable items={filteredItems} category={category} onReset={resetFilters} onSelect={setSelectedItem} />
        <p className="rentals-panel-footer">Quantità raggruppate per modello e caratteristiche; ogni esemplare ha il proprio codice. Apri la scheda del materiale per consultarne i dettagli e i codici univoci. Prezzi unitari e dati dimostrativi.</p>
      </section>
      {selectedItem && <InventoryDetailsDialog key={selectedItem.id} onClose={() => setSelectedItem(null)} details={{
        title: `${selectedItem.brand} ${selectedItem.model}`,
        category: categories.find((entry) => entry.id === selectedItem.category)!.label,
        warehouse: 'Magazzino vendita',
        fields: [
          { label: 'Marca', value: selectedItem.brand },
          { label: 'Modello', value: selectedItem.model },
          ...saleDetailColumns[selectedItem.category].filter((column) => column.key !== 'brand' && column.key !== 'model').map((column) => ({ label: column.label, value: column.render(selectedItem) })),
          { label: 'Quantità', value: selectedItem.unitCodes.length },
          { label: 'Prezzo', value: new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(selectedItem.priceCents / 100) },
        ],
        codes: selectedItem.unitCodes,
        codesLabel: 'Codici univoci degli esemplari',
      }} />}
    </div>
  );
}
