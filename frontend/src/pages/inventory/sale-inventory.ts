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
  radiusM?: number;
  bootMillimeters?: number;
  shoeSize?: string;
  footCm?: number;
  heightCm?: number;
  size?: string;
  color?: string;
  lens?: string;
};

export type SaleInventoryItem = SaleProduct;

// Ogni codice identifica un singolo esemplare (o paio/kit), mai un gruppo.
// Marche, modelli, misure e prezzi sono esclusivamente esempi di presentazione.
const examples: (Omit<SaleProduct, 'id' | 'unitCodes'> & { quantity: number })[] = [
  { category: 'ski', type: 'Base', brand: 'Rossignol', model: 'Experience', lengthCm: 160, radiusM: 13, quantity: 3, priceCents: 29900 },
  { category: 'ski', type: 'Intermedio', brand: 'Salomon', model: 'S/Max', lengthCm: 165, radiusM: 14, quantity: 2, priceCents: 39900 },
  { category: 'ski', type: 'Avanzato', brand: 'Head', model: 'Supershape', lengthCm: 170, radiusM: 15, quantity: 2, priceCents: 54900 },
  { category: 'ski', type: 'Top-race', brand: 'Atomic', model: 'Redster', lengthCm: 175, radiusM: 17, quantity: 1, priceCents: 69900 },
  { category: 'ski', type: 'Freeride', brand: 'Rossignol', model: 'Sender', lengthCm: 180, radiusM: 20, quantity: 2, priceCents: 49900 },
  { category: 'ski', type: 'Alpinismo', brand: 'Dynafit', model: 'Seven Summits', lengthCm: 174, radiusM: 18, quantity: 2, priceCents: 45900 },
  { category: 'snowboard', type: 'Base', brand: 'Burton', model: 'Instigator', lengthCm: 155, radiusM: 7.5, quantity: 3, priceCents: 32900 },
  { category: 'snowboard', type: 'Freeride', brand: 'Jones', model: 'Frontier', lengthCm: 158, radiusM: 8, quantity: 2, priceCents: 44900 },
  { category: 'boots', brand: 'Salomon', model: 'S/Pro', bootMillimeters: 315, shoeSize: '42–43', footCm: 27.5, quantity: 4, priceCents: 21900 },
  { category: 'boots', brand: 'Head', model: 'Edge', bootMillimeters: 305, shoeSize: '40–41', footCm: 26.5, quantity: 2, priceCents: 18900 },
  { category: 'poles', brand: 'LEKI', model: 'Neolite', heightCm: 120, quantity: 5, priceCents: 3900 },
  { category: 'poles', brand: 'LEKI', model: 'Neolite', heightCm: 125, quantity: 3, priceCents: 3900 },
  { category: 'helmet', brand: 'Atomic', model: 'Four', size: 'M', color: 'Nero', quantity: 3, priceCents: 6900 },
  { category: 'helmet', brand: 'Atomic', model: 'Four', size: 'L', color: 'Bianco', quantity: 2, priceCents: 6900 },
  { category: 'goggles', brand: 'Oakley', model: 'Target Line', lens: 'Categoria 2 · arancione (esempio)', quantity: 4, priceCents: 5900 },
  { category: 'avalanche', brand: 'Ortovox', model: 'Diract · ARTVA, pala e sonda', quantity: 2, priceCents: 29900 },
  { category: 'snowshoes', brand: 'TSL', model: '305 · paio', size: 'EU 36–46 (esempio)', quantity: 3, priceCents: 12900 },
];

let nextCode = 10001;
export const saleInventory: SaleInventoryItem[] = examples.map(({ quantity, ...product }, index) => ({
  ...product,
  id: `sale-model-${index + 1}`,
  unitCodes: Array.from({ length: quantity }, () => String(nextCode++).padStart(8, '0')),
}));

export function filterSaleInventory(items: SaleInventoryItem[], category: Category | 'all', query: string) {
  const normalized = query.trim().toLocaleLowerCase('it-IT');
  const categoryNames: Record<Category, string> = {
    ski: 'Sci', snowboard: 'Snowboard', boots: 'Scarponi', poles: 'Bastoncini',
    helmet: 'Casco', goggles: 'Maschere', avalanche: 'Kit ARTVA', snowshoes: 'Ciaspole',
  };
  return items.filter((item) => {
    const fields = [categoryNames[item.category], item.brand, item.model, item.type,
      item.lengthCm, item.radiusM, item.bootMillimeters, item.shoeSize, item.footCm,
      item.heightCm, item.size, item.color, item.lens, ...item.unitCodes];
    return (category === 'all' || item.category === category)
      && fields.join(' ').toLocaleLowerCase('it-IT').replaceAll('.', ',')
        .includes(normalized.replaceAll('.', ','));
  });
}
