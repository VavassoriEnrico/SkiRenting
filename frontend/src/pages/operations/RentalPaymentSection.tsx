import { RentalSection } from './RentalSection';
import { italianPaymentTime, paymentSummary } from './rental-payment';
import type { PaymentMode, RentalPaymentDraft } from './rental-payment';

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const money = (cents: number | null) => cents === null ? '—' : currency.format(cents / 100);

export function RentalPaymentSection({ total, value, onChange }: {
  total: string | null; value: RentalPaymentDraft; onChange: (value: RentalPaymentDraft) => void;
}) {
  const summary = paymentSummary(value, total);
  const hasPayment = (value.mode === 'deposit' || value.mode === 'full') && summary.totalCents !== null && summary.totalCents > 0;

  function changeMode(mode: PaymentMode) {
    onChange({ ...value, mode, paid_at_local: mode !== 'later' && !value.paid_at_local ? italianPaymentTime() : value.paid_at_local });
  }

  return <RentalSection id="rental-payment" title="Pagamento" className="rental-payment-panel">
    <div className="rental-customer-body">
      {summary.totalCents === null ? <p className="rental-form-hint">Completa il riepilogo dei prezzi per scegliere come registrare il pagamento.</p>
        : <>
          {summary.totalCents === 0 ? <p className="rental-inventory-notice">Il totale è zero: non c’è alcun pagamento da registrare.</p> : <fieldset className="rental-payment-options"><legend>Pagamento ricevuto</legend>
            {([{ value: 'later', label: 'Paga dopo' }, { value: 'deposit', label: 'Acconto' }, { value: 'full', label: 'Saldo completo' }] as const).map((option) => <label key={option.value} className={value.mode === option.value ? 'is-selected' : ''}><input type="radio" name="rental-payment-mode" value={option.value} checked={value.mode === option.value} onChange={() => changeMode(option.value)} />{option.label}</label>)}
          </fieldset>}
          {hasPayment && <div className="rental-form-grid rental-payment-fields">
            <label>Importo ricevuto (€)<input type="number" required min="0.01" max={((summary.totalCents! - (value.mode === 'deposit' ? 1 : 0)) / 100).toFixed(2)} step="0.01" readOnly={value.mode === 'full'} value={value.mode === 'full' ? (summary.totalCents! / 100).toFixed(2) : value.amount} onChange={(event) => onChange({ ...value, amount: event.target.value })} /></label>
            <label>Metodo di pagamento<select required value={value.method} onChange={(event) => onChange({ ...value, method: event.target.value })}><option value="">Seleziona metodo</option><option value="Contanti">Contanti</option><option value="Carta">Carta</option><option value="Bonifico">Bonifico</option><option value="Altro">Altro</option></select></label>
            {value.method === 'Altro' && <label className="rental-form-wide">Specifica il metodo<input required maxLength={200} value={value.other_method} onChange={(event) => onChange({ ...value, other_method: event.target.value })} /></label>}
            <label className="rental-form-wide">Data e ora del pagamento<input aria-label="Data e ora del pagamento" aria-describedby="payment-timezone-hint" type="datetime-local" required step="60" value={value.paid_at_local} onChange={(event) => onChange({ ...value, paid_at_local: event.target.value })} /><small id="payment-timezone-hint">Ora italiana (Europe/Rome).</small></label>
            <label className="rental-form-wide">Note pagamento<textarea maxLength={5000} value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} /></label>
          </div>}
          {hasPayment && summary.issues.length > 0 && <div className="rental-payment-issues" role="status">{summary.issues.map((issue) => <p key={issue}>{issue}</p>)}</div>}
          <dl className="rental-recap-totals"><div><dt>Totale da coprire</dt><dd>{money(summary.totalCents)}</dd></div><div><dt>Importo ricevuto</dt><dd>{money(summary.amountCents)}</dd></div><div className="rental-recap-total"><dt>Residuo da pagare</dt><dd>{money(summary.remainingCents)}</dd></div></dl>
          {value.mode === 'later' && summary.totalCents > 0 && <p className="rental-form-hint">Nessun pagamento da registrare ora. Il totale resta da saldare.</p>}
          <p className="rental-form-hint">La scelta del pagamento sarà salvata insieme alla conferma del noleggio.</p>
        </>}
    </div>
  </RentalSection>;
}
