export const categories = [
  { id: 'ski', label: 'Sci' },
  { id: 'snowboard', label: 'Snowboard' },
  { id: 'boots', label: 'Scarponi' },
  { id: 'poles', label: 'Bastoncini' },
  { id: 'helmet', label: 'Casco' },
  { id: 'goggles', label: 'Maschere' },
  { id: 'avalanche', label: 'Kit ARTVA' },
  { id: 'snowshoes', label: 'Ciaspole' },
] as const;

export type Category = typeof categories[number]['id'];
export type InventoryMode = 'rental' | 'sale';

export type InventoryItem = {
  code: string;
  name: string;
  category: Category;
  size: string;
  quantity: number;
  available: number;
  price: number;
};

type ProductExample = {
  name: string;
  category: Category;
  size: string;
  rentalPrice: number;
  salePrice: number;
};

const examples: ProductExample[] = [
  { name: 'Sci all mountain adulto', category: 'ski', size: '170 cm', rentalPrice: 25, salePrice: 399 },
  { name: 'Sci junior', category: 'ski', size: '120 cm', rentalPrice: 15, salePrice: 189 },
  { name: 'Snowboard all mountain', category: 'snowboard', size: '155 cm', rentalPrice: 28, salePrice: 329 },
  { name: 'Scarponi sci adulto', category: 'boots', size: 'MP 27.5', rentalPrice: 12, salePrice: 219 },
  { name: 'Scarponi snowboard', category: 'boots', size: 'EU 42', rentalPrice: 12, salePrice: 179 },
  { name: 'Bastoncini alluminio', category: 'poles', size: '120 cm · paio', rentalPrice: 5, salePrice: 39 },
  { name: 'Casco regolabile', category: 'helmet', size: 'M · 55–58 cm', rentalPrice: 6, salePrice: 69 },
  { name: 'Maschera lente universale', category: 'goggles', size: 'Adulto', rentalPrice: 7, salePrice: 59 },
  { name: 'Kit ARTVA, pala e sonda', category: 'avalanche', size: 'Kit completo', rentalPrice: 20, salePrice: 299 },
  { name: 'Ciaspole con alzatacco', category: 'snowshoes', size: 'EU 36–46 · paio', rentalPrice: 15, salePrice: 129 },
];

// Inventari dimostrativi distinti: nessun articolo è condiviso tra vendita e noleggio.
export const inventory: Record<InventoryMode, InventoryItem[]> = {
  rental: examples.map((item, index) => ({
    code: `MN-${String(index + 1).padStart(4, '0')}`,
    name: item.name,
    category: item.category,
    size: item.size,
    quantity: 6 + index % 4,
    available: index === 8 ? 0 : 3 + index % 3,
    price: item.rentalPrice,
  })),
  sale: examples.map((item, index) => ({
    code: `MV-${String(index + 1).padStart(4, '0')}`,
    name: item.name,
    category: item.category,
    size: item.size,
    quantity: index === 7 ? 0 : 4 + index % 5,
    available: index === 7 ? 0 : 4 + index % 5,
    price: item.salePrice,
  })),
};
