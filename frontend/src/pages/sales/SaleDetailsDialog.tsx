import { Download, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { Sale } from './demo-data';
import { downloadReceipt } from './sales-downloads';
import { categoryName, customerName, formatPrice, formatSaleDate } from './sales-utils';

export function SaleDetailsDialog({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className="sale-dialog" aria-labelledby="sale-dialog-title" onClose={onClose} onCancel={onClose} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
      <div className="sale-dialog-header">
        <div><p className="sale-dialog-eyebrow">Dettaglio vendita · dati dimostrativi</p><h2 id="sale-dialog-title">{sale.id}</h2><p className="page-description">{formatSaleDate(sale.date)}</p></div>
        <button type="button" className="icon-button" aria-label="Chiudi dettaglio vendita" onClick={onClose} autoFocus><X size={20} aria-hidden="true" /></button>
      </div>
      <div className="sale-dialog-body">
        <section className="sale-detail-section" aria-labelledby="sale-customer-title">
          <h3 id="sale-customer-title">Acquirente</h3>
          <dl className="sale-details-grid">
            <div><dt>Nome e cognome</dt><dd>{customerName(sale)}</dd></div>
            <div><dt>ID cliente</dt><dd>{sale.customer.id}</dd></div>
            <div><dt>Email</dt><dd>{sale.customer.email}</dd></div>
            <div><dt>Cellulare</dt><dd>{sale.customer.phone}</dd></div>
          </dl>
        </section>
        <section className="sale-detail-section" aria-labelledby="sale-material-title">
          <h3 id="sale-material-title">Materiale venduto</h3>
          <dl className="sale-details-grid">
            <div><dt>ID oggetto</dt><dd className="sale-item-code">{sale.item.id}</dd></div>
            <div><dt>Categoria</dt><dd>{categoryName(sale.item.category)}</dd></div>
            <div><dt>Marca</dt><dd>{sale.item.brand}</dd></div>
            <div><dt>Articolo</dt><dd>{sale.item.name}</dd></div>
          </dl>
        </section>
        <section className="sale-detail-section" aria-labelledby="sale-payment-title">
          <h3 id="sale-payment-title">Pagamento</h3>
          <dl className="sale-details-grid">
            <div><dt>Metodo di pagamento</dt><dd>{sale.paymentMethod}</dd></div>
            <div><dt>Data e ora</dt><dd>{formatSaleDate(sale.date)}</dd></div>
          </dl>
          <div className="sale-detail-total"><span>Totale vendita</span><strong>{formatPrice(sale.priceCents)}</strong></div>
        </section>
      </div>
      <div className="sale-dialog-footer"><button type="button" className="sales-button" onClick={onClose}>Chiudi</button><button type="button" className="sales-button sales-button-primary" onClick={() => downloadReceipt(sale)}><Download size={16} aria-hidden="true" />Scarica ricevuta PDF</button></div>
    </dialog>
  );
}
