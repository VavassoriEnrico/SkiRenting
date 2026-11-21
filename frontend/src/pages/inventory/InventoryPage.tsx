import type { InventoryMode } from './demo-data';
import { RentalInventoryPage } from './RentalInventoryPage';
import { SaleInventoryPage } from './SaleInventoryPage';

export function InventoryPage({ mode }: { mode: InventoryMode }) {
  return mode === 'sale' ? <SaleInventoryPage /> : <RentalInventoryPage />;
}
