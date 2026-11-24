import { Eye, Trash2 } from 'lucide-react';
import { salePrice } from './general-inventory';
import { measure, sizeLabel } from './rental-inventory';
import type { SaleInventoryItem } from './sale-inventory';

export function SaleInventoryTable({ items, categoryCode, onReset, onSelect, onDelete, isWarehouseEmpty = false }: {
  isWarehouseEmpty?: boolean; items: SaleInventoryItem[]; categoryCode?: string; onReset: () => void; onSelect: (item: SaleInventoryItem) => void; onDelete: (item: SaleInventoryItem) => void;
}) {
  const isLength = categoryCode === 'ski' || categoryCode === 'snowboard';
  const isPoles = categoryCode === 'poles';
  const isGoggles = categoryCode === 'goggles';
  const hasSize = isLength || isPoles || !['avalanche', 'goggles'].includes(categoryCode || '');
  const columns = 6 + (hasSize || isGoggles ? 1 : 0);
  return <div className="rentals-table-scroll" role="region" aria-label="Magazzino vendita, scorrimento orizzontale" tabIndex={0}>
    <table className="rentals-table sale-inventory-table">
      <caption className="sr-only">Magazzino vendita: quantità per modello, misura e categoria. Prezzi unitari.</caption>
      <thead><tr><th scope="col">Marca</th><th scope="col">Modello</th><th scope="col">Categoria</th>{(hasSize || isGoggles) && <th scope="col">{isLength ? 'Lunghezza' : isPoles ? 'Altezza' : isGoggles ? 'Lente' : 'Taglia / misura'}</th>}<th scope="col">Quantità</th><th scope="col">Prezzo</th><th scope="col">Azioni</th></tr></thead>
      <tbody>{items.map(item => <tr key={item.id} className="inventory-clickable-row" onClick={event => { if (!(event.target as HTMLElement).closest('button,a')) onSelect(item); }}>
        <th scope="row">{item.variant.brand}</th><td>{item.variant.model}</td><td>{item.variant.sale_details?.category_label || '—'}</td>
        {(hasSize || isGoggles) && <td>{isGoggles ? item.variant.goggle_details?.lens || '—' : isPoles ? measure(item.variant.pole_details?.height_cm, 'cm') : sizeLabel(item.variant)}</td>}
        <td>{item.quantity}</td><td className="rental-amount">{salePrice(item.price)}</td><td><div className="sales-row-actions"><button type="button" className="icon-button" title="Apri scheda materiale" aria-label={`Apri scheda ${item.variant.brand} ${item.variant.model}`} aria-haspopup="dialog" onClick={() => onSelect(item)}><Eye size={17} aria-hidden="true" /></button><button type="button" className="icon-button customer-delete-button" title="Elimina articolo" aria-label={`Elimina articolo ${item.variant.brand} ${item.variant.model}`} onClick={() => onDelete(item)}><Trash2 size={16} aria-hidden="true" /></button></div></td>
      </tr>)}
        {!items.length && <tr><td colSpan={columns}><div className="rentals-empty"><h3>{isWarehouseEmpty ? 'Nessun articolo nel magazzino vendita' : 'Nessun articolo trovato'}</h3>{!isWarehouseEmpty && <><p>Prova un altro termine o seleziona una categoria diversa.</p><button type="button" onClick={onReset}>Azzera filtri</button></>}</div></td></tr>}
      </tbody>
    </table>
  </div>;
}
