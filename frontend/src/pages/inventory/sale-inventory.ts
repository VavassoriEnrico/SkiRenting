import type { Category } from './demo-data';

type SaleProduct = {
  id: string;
  category: Category;
  brand: string;
  model: string;
  priceCents: number;
  unitCodes: string[];
  type?: 'Base' | 'Intermedio' | 'Avanzato' | 'Top-race' | 'Freeride' | 'Alpinismo';
  lengthCm?: number;
  heightCm?: number;
  size?: string;
  lens?: string;
};

export type SaleInventoryItem = SaleProduct;

// Il magazzino vendita resta vuoto fino al collegamento ai dati reali.
export const saleInventory: SaleInventoryItem[] = [];

export function filterSaleInventory(items: SaleInventoryItem[], category: Category | 'all', query: string) {
  const normalized = query.trim().toLocaleLowerCase('it-IT');
  const categoryNames: Record<Category, string> = {
    ski: 'Sci', snowboard: 'Snowboard', boots: 'Scarponi', poles: 'Bastoncini',
    helmet: 'Casco', goggles: 'Maschere', avalanche: 'Kit ARTVA', snowshoes: 'Ciaspole',
  };
  return items.filter((item) => {
    const fields = [categoryNames[item.category], item.brand, item.model, item.type,
      item.lengthCm,
      item.heightCm, item.size, item.lens, ...item.unitCodes];
    return (category === 'all' || item.category === category)
      && fields.join(' ').toLocaleLowerCase('it-IT').replaceAll('.', ',')
        .includes(normalized.replaceAll('.', ','));
  });
}
