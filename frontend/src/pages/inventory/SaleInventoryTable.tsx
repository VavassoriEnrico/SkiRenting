import type { ReactNode } from 'react';
import { Eye } from 'lucide-react';

import { categories } from './demo-data';
import type { Category } from './demo-data';
import type { SaleInventoryItem } from './sale-inventory';

type Column = { key: string; label: string; render: (item: SaleInventoryItem) => ReactNode; className?: string };
const number = new Intl.NumberFormat('it-IT');
const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const brand: Column = { key: 'brand', label: 'Marca', render: (item) => item.brand };
const model: Column = { key: 'model', label: 'Modello', render: (item) => item.model };
const type: Column = { key: 'type', label: 'Tipo', render: (item) => item.type ?? '—' };
const length: Column = { key: 'length', label: 'Lunghezza', render: (item) => item.lengthCm == null ? '—' : `${number.format(item.lengthCm)} cm` };
const radius: Column = { key: 'radius', label: 'Raggio', render: (item) => item.radiusM == null ? '—' : `${number.format(item.radiusM)} m` };

export const saleCategoryColumns: Record<Category | 'all', Column[]> = {
  all: [{ key: 'category', label: 'Tipo', render: (item) => categories.find((entry) => entry.id === item.category)!.label }, brand, model],
  ski: [brand, model, type, length],
  snowboard: [brand, model, type, length],
  boots: [
    brand, model,
    { key: 'shoeSize', label: 'Taglia (scarpe)', render: (item) => item.shoeSize ?? '—' },
    { key: 'footCm', label: 'Taglia (cm)', render: (item) => item.footCm == null ? '—' : `${number.format(item.footCm)} cm` },
    { key: 'millimeters', label: 'Millimetri', render: (item) => item.bootMillimeters == null ? '—' : `${number.format(item.bootMillimeters)} mm` },
  ],
  poles: [brand, model, { key: 'height', label: 'Altezza', render: (item) => item.heightCm == null ? '—' : `${number.format(item.heightCm)} cm` }],
  helmet: [
    brand, model,
    { key: 'size', label: 'Taglia', render: (item) => item.size ?? '—' },
    { key: 'color', label: 'Colore', render: (item) => item.color ?? '—' },
  ],
  goggles: [brand, model, { key: 'lens', label: 'Lente', render: (item) => item.lens ?? '—' }],
  avalanche: [brand, model],
  snowshoes: [brand, model, { key: 'size', label: 'Taglia', render: (item) => item.size ?? '—' }],
};

export const saleDetailColumns = {
  ...saleCategoryColumns,
  ski: [brand, model, type, length, radius],
  snowboard: [brand, model, type, length, radius],
};

export function SaleInventoryTable({ items, category, onReset, onSelect, isWarehouseEmpty = false }: {
  isWarehouseEmpty?: boolean; items: SaleInventoryItem[]; category: Category | 'all'; onReset: () => void; onSelect: (item: SaleInventoryItem) => void;
}) {
  const columns = saleCategoryColumns[category];
  return (
    <div className="rentals-table-scroll" role="region" aria-label="Magazzino vendita, scorrimento orizzontale" tabIndex={0}>
      <table className="rentals-table sale-inventory-table">
        <caption className="sr-only">Magazzino vendita: righe per modello e caratteristiche. Prezzi unitari; codici dei singoli esemplari nella scheda di dettaglio.</caption>
        <thead><tr>{columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}<th scope="col" className="inventory-quantity">Quantità</th><th scope="col" className="rental-amount">Prezzo</th><th scope="col">Scheda</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="inventory-clickable-row" onClick={(event) => {
              if (!(event.target as HTMLElement).closest('button, a')) onSelect(item);
            }}>
              {columns.map((column, index) => index === 0
                ? <th key={column.key} scope="row"><span className="rental-primary">{column.render(item)}</span></th>
                : <td key={column.key}><span className="rental-primary">{column.render(item)}</span></td>)}
              <td className="inventory-quantity">{item.unitCodes.length}</td>
              <td className="rental-amount">{currency.format(item.priceCents / 100)}</td>
              <td><button type="button" className="icon-button" title="Apri scheda materiale" aria-label={`Apri scheda ${item.brand} ${item.model}`} aria-haspopup="dialog" onClick={() => onSelect(item)}><Eye size={17} aria-hidden="true" /></button></td>
            </tr>
          ))}
          {!items.length && <tr><td colSpan={columns.length + 3}><div className="rentals-empty"><h3>{isWarehouseEmpty ? 'Nessun articolo nel magazzino vendita' : 'Nessun articolo trovato'}</h3>{!isWarehouseEmpty && <><p>Prova un altro termine o seleziona una categoria diversa.</p><button type="button" onClick={onReset}>Azzera filtri</button></>}</div></td></tr>}
        </tbody>
      </table>
    </div>
  );
}
