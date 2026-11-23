type PackRow<T> = {
  item: T;
  id: string;
  pricing?: string | null;
  mainId?: string | null;
};

// L'attrezzo precede sempre gli articoli inclusi nello stesso pack.
export function seasonalPackRows<T>(rows: PackRow<T>[]) {
  const mains = rows.filter(row => row.pricing === 'pack' || row.mainId === row.id).sort((a, b) => a.id.localeCompare(b.id));
  const ordered: (PackRow<T> & { formula: string })[] = [];
  const grouped = new Set<string>();
  mains.forEach((main, index) => {
    const number = index + 1;
    ordered.push({ ...main, formula: `Pack ${number}` });
    grouped.add(main.id);
    rows.filter(row => row.pricing === 'included' && row.mainId === main.id).forEach(row => {
      ordered.push({ ...row, formula: `Incluso nel pack ${number}` });
      grouped.add(row.id);
    });
  });
  rows.filter(row => !grouped.has(row.id)).forEach(row => {
    ordered.push({ ...row, formula: row.pricing === 'included' ? 'Incluso nel pack' : 'Singolo' });
  });
  return ordered;
}
