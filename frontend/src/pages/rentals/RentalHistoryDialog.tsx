import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { apiGet } from '../../lib/api';
import { customerBirthDate, skillLevels } from '../customers/customer';
import { historyDate, historyMoney, historyStatuses, historyTime, historyStatus } from './rental-history';
import type { HistoryDetails, HistoryBooking } from './rental-history';

export function RentalHistoryDialog({ id, locationId, locationName, token, onClose, onPay }: {
  id: string; locationId: string; locationName: string; token: string; onClose: () => void; onPay: (booking: HistoryBooking) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<HistoryDetails | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const { operator } = useAuth();
  const operatorName = (id: string) => operator?.profile.id === id ? operator.profile.name : id;
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError(''); setData(null);
    apiGet<HistoryDetails>(`/locations/${locationId}/rental-bookings/${id}`, token, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile aprire il noleggio.'); });
    return () => controller.abort();
  }, [id, locationId, token, attempt]);

  return <dialog ref={dialog} className="sale-dialog rental-history-dialog" aria-labelledby="rental-history-title" onClose={onClose} onCancel={onClose} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    <div className="sale-dialog-header"><div><p className="sale-dialog-eyebrow">{locationName} · Scheda noleggio</p><h2 id="rental-history-title">{data ? `Noleggio n. ${data.booking_number}` : 'Dettaglio noleggio'}</h2>{data && <p className="page-description">{historyDate(data.starts_on)} – {historyDate(data.ends_on)} · <span className={`rental-status history-status-${historyStatus(data)}`}>{historyStatuses[historyStatus(data)]}</span></p>}</div><button className="icon-button" type="button" aria-label="Chiudi dettaglio noleggio" onClick={onClose} autoFocus><X size={20} aria-hidden="true" /></button></div>
    <div className="sale-dialog-body">
      {error ? <div className="auth-error" role="alert">{error}<div><button type="button" className="sales-button" onClick={() => setAttempt((value) => value + 1)}>Riprova dettaglio</button></div></div> : !data ? <p role="status">Caricamento dettaglio…</p> : <>
        <section className="sale-detail-section" aria-labelledby="history-customer-title"><h3 id="history-customer-title">Cliente</h3><dl className="sale-details-grid"><div><dt>Nome e cognome</dt><dd>{data.customer.first_name} {data.customer.last_name}</dd></div><div><dt>Email</dt><dd>{data.customer.email || '—'}</dd></div><div><dt>Cellulare</dt><dd>{data.customer.phone || '—'}</dd></div><div><dt>Albergo del soggiorno</dt><dd>{data.hotel?.name || 'Nessun albergo'}</dd></div>{data.customer.birth_date && <div><dt>Data di nascita</dt><dd>{customerBirthDate(data.customer.birth_date)}</dd></div>}{data.customer.skill_level && <div><dt>Livello</dt><dd>{skillLevels[data.customer.skill_level]}</dd></div>}{data.customer.language && <div><dt>Lingua</dt><dd>{data.customer.language}</dd></div>}{data.customer.country_code && <div><dt>Paese</dt><dd>{data.customer.country_code}</dd></div>}</dl>{data.customer.notes && <div className="rental-booking-notes"><h3>Note cliente</h3><p>{data.customer.notes}</p></div>}</section>
        <section className="sale-detail-section" aria-labelledby="history-notes-title"><h3 id="history-notes-title">Note prenotazione</h3><p className="history-notes">{data.notes || 'Nessuna nota per questo noleggio.'}</p></section>
        <section className="sale-detail-section" aria-labelledby="history-material-title"><h3 id="history-material-title">Materiale assegnato ({data.items.length})</h3><div className="rentals-table-scroll" role="region" aria-label="Materiale del noleggio" tabIndex={0}><table className="rentals-table history-items-table"><thead><tr><th scope="col">Codice</th><th scope="col">Marca / modello</th><th scope="col">Misura</th><th scope="col">€/giorno</th><th scope="col">Importo</th><th scope="col">Consegna</th><th scope="col">Rientro</th></tr></thead><tbody>
          {data.items.map((item) => <tr key={item.id}><th scope="row" className="unit-code">{item.code_snapshot}</th><td><span className="rental-primary">{item.brand_snapshot}</span><span className="rental-secondary">{item.model_snapshot}</span></td><td>{item.size_snapshot || '—'}</td><td>{historyMoney(item.daily_price)}</td><td>{historyMoney(item.amount)}</td><td>{historyTime(item.delivered_at)}</td><td>{historyTime(item.returned_at)}</td></tr>)}
          {data.items.length === 0 && <tr><td colSpan={7}>Nessun articolo registrato.</td></tr>}
        </tbody></table></div></section>
        <section className="sale-detail-section" aria-labelledby="history-payments-title"><h3 id="history-payments-title">Pagamenti registrati</h3><div className="rentals-table-scroll" role="region" aria-label="Pagamenti del noleggio" tabIndex={0}><table className="rentals-table history-payments-table"><thead><tr><th scope="col">Data e ora pagamento</th><th scope="col">Metodo</th><th scope="col">Importo</th><th scope="col">Note</th><th scope="col">Operatore</th></tr></thead><tbody>
          {data.payments.map((payment) => <tr key={payment.id}><th scope="row"><span className="rental-primary">{historyTime(payment.paid_at)}</span><span className="rental-secondary">Registrato: {historyTime(payment.created_at)}</span></th><td>{payment.payment_method}</td><td>{historyMoney(payment.amount)}</td><td className="history-notes">{payment.notes || '—'}</td><td className="history-reference">{operatorName(payment.created_by)}</td></tr>)}
          {data.payments.length === 0 && <tr><td colSpan={5}>Nessun pagamento registrato.</td></tr>}
        </tbody></table></div></section>
        <dl className="rental-recap-totals"><div><dt>Subtotale materiale</dt><dd>{historyMoney(data.subtotal)}</dd></div><div><dt>Sconto applicato ({Number(data.discount_percent).toLocaleString('it-IT')}%)</dt><dd>{historyMoney(data.discount_amount)}</dd></div><div><dt>Totale noleggio</dt><dd>{historyMoney(data.total)}</dd></div><div><dt>Pagato</dt><dd>{historyMoney(data.paid_amount)}</dd></div><div className="rental-recap-total"><dt>Residuo</dt><dd>{historyMoney(data.balance)}</dd></div></dl>
        <details className="history-metadata"><summary>Informazioni di registrazione</summary><dl className="sale-details-grid"><div><dt>ID prenotazione</dt><dd>{data.id}</dd></div><div><dt>ID cliente</dt><dd>{data.customer_id}</dd></div><div><dt>Creata il</dt><dd>{historyTime(data.created_at)}</dd></div><div><dt>Ultima modifica</dt><dd>{historyTime(data.updated_at)}</dd></div><div><dt>Operatore creazione</dt><dd>{operatorName(data.created_by)}</dd></div></dl></details>
      </>}
    </div>
    <div className="sale-dialog-footer">{data && historyStatus(data) === 'awaiting_payment' && <button className="sales-button sales-button-primary" type="button" onClick={() => onPay(data)}>Registra pagamento</button>}<button className="sales-button" type="button" onClick={onClose}>Chiudi</button></div>
  </dialog>;
}
