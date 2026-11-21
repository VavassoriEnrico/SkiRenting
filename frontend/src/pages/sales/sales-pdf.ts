import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

import type { Sale } from './demo-data';
import { categoryName, customerName, formatPrice, formatSaleDate } from './sales-utils';

function createDocument(title: string, subtitle: string) {
  const doc = new jsPDF();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(49, 46, 129);
  doc.text('SkiRenting', 14, 20);
  doc.setTextColor(23, 32, 51);
  doc.setFontSize(15);
  doc.text(title, 14, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('FACSIMILE - DATI DIMOSTRATIVI', 14, 40);
  doc.text(subtitle, 14, 47);
  return doc;
}

function addPageNumbers(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`SkiRenting - Documento dimostrativo | ${page} / ${pages}`, 14, doc.internal.pageSize.getHeight() - 10);
  }
}

export function downloadReceipt(sale: Sale) {
  const doc = createDocument(`Ricevuta vendita ${sale.id}`, `Data vendita: ${formatSaleDate(sale.date)}`);
  autoTable(doc, {
    startY: 55,
    theme: 'plain',
    body: [
      ['Cliente', customerName(sale)], ['ID cliente', sale.customer.id],
      ['Email', sale.customer.email], ['Cellulare', sale.customer.phone],
      ['Metodo di pagamento', sale.paymentMethod],
    ],
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 } },
  });
  autoTable(doc, {
    startY: 115,
    head: [['ID oggetto', 'Materiale', 'Marca', 'Categoria', 'Prezzo']],
    body: [[sale.item.id, sale.item.name, sale.item.brand, categoryName(sale.item.category), formatPrice(sale.priceCents)]],
    foot: [['', '', '', 'Totale', formatPrice(sale.priceCents)]],
    theme: 'grid',
    headStyles: { fillColor: [49, 46, 129] },
    footStyles: { fillColor: [238, 242, 255], textColor: [49, 46, 129] },
    styles: { fontSize: 9, cellPadding: 4 },
    margin: { bottom: 20 },
  });
  addPageNumbers(doc);
  doc.save(`ricevuta-${sale.id}.pdf`);
}

export function downloadSalesSummary(sales: Sale[]) {
  const totalCents = sales.reduce((total, sale) => total + sale.priceCents, 0);
  const doc = createDocument('Riepilogo completo vendite', `${sales.length} vendite | Totale: ${formatPrice(totalCents)} | Tutto lo storico, indipendentemente dai filtri`);
  autoTable(doc, {
    startY: 55,
    head: [['Vendita / data', 'Cliente / contatti', 'ID oggetto / materiale', 'Pagamento', 'Prezzo']],
    body: sales.map((sale) => [
      `${sale.id}\n${formatSaleDate(sale.date)}`,
      `${customerName(sale)}\n${sale.customer.id}\n${sale.customer.email}\n${sale.customer.phone}`,
      `${sale.item.id}\n${sale.item.brand} - ${sale.item.name}\n${categoryName(sale.item.category)}`,
      sale.paymentMethod, formatPrice(sale.priceCents),
    ]),
    foot: [['Totale complessivo', '', '', '', formatPrice(totalCents)]],
    showFoot: 'lastPage',
    headStyles: { fillColor: [49, 46, 129] },
    footStyles: { fillColor: [238, 242, 255], textColor: [49, 46, 129] },
    alternateRowStyles: { fillColor: [248, 250, 255] },
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 33 }, 1: { cellWidth: 50 }, 2: { cellWidth: 52 }, 3: { cellWidth: 23 }, 4: { halign: 'right' } },
    margin: { bottom: 20 },
    rowPageBreak: 'avoid',
  });
  addPageNumbers(doc);
  doc.save('riepilogo-completo-vendite.pdf');
}
