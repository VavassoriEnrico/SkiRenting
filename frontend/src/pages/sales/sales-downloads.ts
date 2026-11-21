import type { Sale } from './demo-data';

// Carica le librerie PDF soltanto quando viene richiesto un documento.
export async function downloadReceipt(sale: Sale) {
  const pdf = await import('./sales-pdf');
  pdf.downloadReceipt(sale);
}

export async function downloadSalesSummary(sales: Sale[]) {
  const pdf = await import('./sales-pdf');
  pdf.downloadSalesSummary(sales);
}
