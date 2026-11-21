import { Banknote, ChevronDown, Download, Eye, ReceiptText, Search, ShoppingBag, Users, X } from 'lucide-react';
import { useState } from 'react';

import { StatCard } from '../../components/ui/StatCard';
import { categories } from '../inventory/demo-data';
import type { Category } from '../inventory/demo-data';
import { demoSales } from './demo-data';
import type { Sale } from './demo-data';
import { SaleDetailsDialog } from './SaleDetailsDialog';
import { downloadReceipt, downloadSalesSummary } from './sales-downloads';
import { categoryName, customerName, filterSales, formatPrice, formatSaleDate } from './sales-utils';

export function SalesPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const visibleSales = filterSales(demoSales, query, category);
  const totalCents = demoSales.reduce((total, sale) => total + sale.priceCents, 0);

  function resetFilters() {
    setQuery('');
    setCategory('all');
  }

  return (
    <div className="dashboard-page sales-page">
      <div className="dashboard-heading">
        <div>
          <div className="page-heading"><span className="heading-icon"><ShoppingBag size={21} aria-hidden="true" /></span><h1>Storico vendite</h1></div>
          <p className="page-description">Lo storico delle vendite, i clienti e le ricevute.</p>
        </div>
        <span className="demo-badge"><span aria-hidden="true" />Dati dimostrativi</span>
      </div>

      <div className="sales-page-actions">
        <button type="button" className="sales-button" onClick={() => downloadSalesSummary(demoSales)}><Download size={16} aria-hidden="true" />Scarica riepilogo completo</button>
      </div>

      <section className="stats-section tone-indigo rentals-summary" aria-label="Riepilogo di tutte le vendite dimostrative">
        <div className="stats-grid">
          <StatCard label="Vendite totali" value={String(demoSales.length)} detail="Tutto lo storico dimostrativo" icon={ReceiptText} />
          <StatCard label="Totale vendite" value={formatPrice(totalCents)} detail="Importo complessivo, senza filtri" icon={Banknote} />
          <StatCard label="Acquirenti" value={String(new Set(demoSales.map((sale) => sale.customer.id)).size)} detail="Clienti distinti nello storico" icon={Users} />
        </div>
      </section>

      <section className="rentals-panel" aria-labelledby="sales-list-title">
        <div className="rentals-panel-heading"><h2 id="sales-list-title">Storico vendite</h2><span className="rentals-count" role="status">{visibleSales.length} di {demoSales.length}</span></div>
        <div className="rentals-filters">
          <div className="rental-search">
            <Search size={17} aria-hidden="true" /><label className="sr-only" htmlFor="sales-search">Cerca nome, cognome, email, cellulare o codice</label>
            <input id="sales-search" type="search" placeholder="Cerca nome, cognome, email o cellulare…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="period-select rental-status-filter">
            <label className="sr-only" htmlFor="sales-category">Tipo di materiale venduto</label>
            <select id="sales-category" value={category} onChange={(event) => setCategory(event.target.value as Category | 'all')}><option value="all">Tutti i materiali</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            <ChevronDown size={14} aria-hidden="true" />
          </div>
          {(query || category !== 'all') && <button className="reset-filters" type="button" onClick={resetFilters}><X size={14} aria-hidden="true" />Azzera filtri</button>}
        </div>

        <div className="rentals-table-scroll" role="region" aria-label="Storico vendite, scorrimento orizzontale" tabIndex={0}>
          <table className="rentals-table sales-table">
            <caption className="sr-only">Vendite passate dimostrative, ordinate dalla più recente</caption>
            <thead><tr><th scope="col">Vendita / oggetto</th><th scope="col">Materiale / marca</th><th scope="col">Acquirente</th><th scope="col">Data</th><th scope="col">Pagamento</th><th scope="col" className="rental-amount">Prezzo</th><th scope="col">Azioni</th></tr></thead>
            <tbody>
              {visibleSales.map((sale) => (
                <tr key={sale.id}>
                  <th scope="row"><button type="button" className="sale-id-link" onClick={() => setSelectedSale(sale)} aria-label={`Apri dettaglio vendita ${sale.id}`}>{sale.id}</button><span className="rental-secondary">Oggetto {sale.item.id}</span></th>
                  <td><span className="rental-primary">{sale.item.brand}</span><span className="rental-secondary">{sale.item.name}</span><span className="sale-category">{categoryName(sale.item.category)}</span></td>
                  <td><span className="rental-primary">{customerName(sale)}</span><span className="rental-secondary">{sale.customer.email}</span><span className="rental-secondary">{sale.customer.phone}</span></td>
                  <td className="rental-period">{formatSaleDate(sale.date)}</td>
                  <td><span className="rental-status status-confirmed">{sale.paymentMethod}</span></td>
                  <td className="rental-amount">{formatPrice(sale.priceCents)}</td>
                  <td><div className="sales-row-actions"><button type="button" className="icon-button" title="Apri dettaglio" aria-label={`Apri dettaglio vendita ${sale.id}`} onClick={() => setSelectedSale(sale)}><Eye size={17} aria-hidden="true" /></button><button type="button" className="icon-button" title="Scarica ricevuta PDF" aria-label={`Scarica ricevuta PDF vendita ${sale.id}`} onClick={() => downloadReceipt(sale)}><Download size={17} aria-hidden="true" /></button></div></td>
                </tr>
              ))}
              {!visibleSales.length && <tr><td colSpan={7}><div className="rentals-empty"><Search size={25} aria-hidden="true" /><h3>Nessuna vendita trovata</h3><p>Modifica la ricerca o il tipo di materiale.</p><button type="button" onClick={resetFilters}>Azzera filtri</button></div></td></tr>}
            </tbody>
          </table>
        </div>
        <p className="rentals-panel-footer">Il riepilogo completo include tutte le vendite, indipendentemente dai filtri. Pagamenti e documenti sono dimostrativi.</p>
      </section>

      {selectedSale && <SaleDetailsDialog key={selectedSale.id} sale={selectedSale} onClose={() => setSelectedSale(null)} />}
    </div>
  );
}
